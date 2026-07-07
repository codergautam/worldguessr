import User from '../models/User.js';

// Silent anti-cheat sink. The client fingerprints known cheat userscripts
// (e.g. "CheatGuessr Universal") and POSTs which signals tripped. This route
// decides who is reporting and forwards the finding to a Discord webhook.
//
// SECURITY / anti-spoof:
//  - The webhook URL lives only here (env CHEAT_WEBHOOK_URL); never client-side.
//  - Logged-in path: `token` is the caller's OWN account secret. It is used ONLY
//    to look the account up; it is NEVER placed in the webhook. Username + ELO
//    are read from the authenticated DB record, not from anything the client
//    claimed — so a caller cannot fabricate a report against an account whose
//    secret they don't possess. That is the "proof".
//  - Guest path: guests have no secret, so identity CANNOT be proven. They are
//    reported best-effort by ephemeral name + IP and clearly flagged unverified.
//
// Honest limit: the secret proves WHO is reporting, not WHETHER they cheated —
// a cheater can still patch their client to stay silent. Server-side behavioural
// detection is the complement to this, not something this endpoint replaces.

// Per-key throttle (accountId for logged-in, IP for guests) so a client that
// keeps re-detecting — or an unauthenticated caller poking the guest path —
// can't flood the channel. Module scope survives across requests because the
// API runs in a long-lived process.
const lastReport = new Map(); // key -> { sig, at }
const THROTTLE_MS = 5 * 60 * 1000;

function shouldSend(key, sig, now) {
  const prev = lastReport.get(key);
  if (prev && prev.sig === sig && now - prev.at <= THROTTLE_MS) return false;
  lastReport.set(key, { sig, at: now });
  // Opportunistic cleanup so the map can't grow without bound.
  if (lastReport.size > 2000) {
    for (const [k, v] of lastReport) {
      if (now - v.at > THROTTLE_MS) lastReport.delete(k);
    }
  }
  return true;
}

async function forwardToDiscord(embed) {
  const url = process.env.CHEAT_WEBHOOK_URL;
  if (!url || typeof fetch !== 'function') return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'WG Anticheat', embeds: [embed] }),
    });
  } catch (e) {
    console.error('reportClientState: webhook failed', e.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { token, guestName, signals } = req.body || {};

  const clean = Array.isArray(signals)
    ? signals.filter((s) => typeof s === 'string' && s.length > 0 && s.length <= 40).slice(0, 20)
    : [];
  // Always ack uniformly (never reveal whether a token was valid) so the
  // endpoint can't be used as a secret-validity oracle.
  if (!clean.length) return res.status(200).json({ ok: true });

  const sig = clean.slice().sort().join(',');
  const now = Date.now();
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
    .toString().split(',')[0].trim();

  // ── Logged-in path: secret proves identity; username + ELO from the DB ──
  if (typeof token === 'string' && token) {
    let user;
    try {
      user = await User.findOne({ secret: token }).select('_id username elo banned');
    } catch (e) {
      return res.status(200).json({ ok: true }); // DB blip: don't mislabel as guest
    }
    if (user) {
      const accountId = user._id.toString();
      if (shouldSend('u:' + accountId, sig, now)) {
        forwardToDiscord({
          title: '🚩 Cheat client detected',
          color: 0xCC302E,
          fields: [
            { name: 'Username', value: '`' + (user.username || 'Unknown') + '`', inline: true },
            { name: 'ELO', value: '`' + (typeof user.elo === 'number' ? user.elo : '?') + '`', inline: true },
            { name: 'Account', value: '`' + accountId + '`', inline: true },
            { name: 'Signals', value: '`' + clean.join('`, `') + '`', inline: false },
          ],
          footer: { text: (ip ? 'ip ' + ip : 'api') + ' • verified account' + (user.banned ? ' • already banned' : '') },
          timestamp: new Date().toISOString(),
        });
      }
      return res.status(200).json({ ok: true });
    }
    // token present but no match -> fall through and treat as an unverified guest
  }

  // ── Guest path: no proof possible; report best-effort by name + IP ──
  if (typeof guestName === 'string' && guestName) {
    const safeName = guestName.replace(/`/g, '').slice(0, 40);
    if (shouldSend('g:' + (ip || 'noip'), sig, now)) {
      forwardToDiscord({
        title: '🚩 Cheat client detected (guest)',
        color: 0x999999,
        fields: [
          { name: 'Guest', value: '`' + (safeName || 'Guest') + '`', inline: true },
          { name: 'ELO', value: '_guest, unranked_', inline: true },
          { name: 'Signals', value: '`' + clean.join('`, `') + '`', inline: false },
        ],
        footer: { text: (ip ? 'ip ' + ip : 'api') + ' • unverified guest' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  return res.status(200).json({ ok: true });
}
