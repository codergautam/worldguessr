import User from '../models/User.js';
import { Webhook, MessageBuilder } from 'discord-webhook-node';

/**
 * In-app "rate us" feedback (1–4★). The mobile app posts the rating + optional
 * comment plus device/locale context here; we forward a rich embed to the
 * DISCORD_FEEDBACK_WEBHOOK so the team can follow up and help the user.
 *
 * Auth is optional: the prompt shows to guests too, so a missing/unknown secret
 * is fine — we just label it a guest. We never store feedback in the DB; Discord
 * is the destination.
 */

// Per-IP throttle so the webhook can't be flooded (module-level → persists across
// requests since each api/*.js is imported once by the route loader).
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 6;
const hits = new Map(); // ip -> number[] (recent timestamps)

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (!v.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k);
    }
  }
  return recent.length > RATE_MAX;
}

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
}

// Neutralize @everyone/@here pings and code fences, and cap length, so a hostile
// comment can't ping the server or break the embed.
function sanitize(s, max = 1000) {
  if (!s || typeof s !== 'string') return '';
  return s
    .replace(/@(everyone|here)/gi, '@​$1')
    .replace(/```/g, "'''")
    .slice(0, max)
    .trim();
}

const STAR_COLORS = { 1: '#e74c3c', 2: '#e67e22', 3: '#f1c40f', 4: '#9bcf53', 5: '#2ecc71' };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const {
    secret,
    stars,
    comment = '',
    platform,
    osVersion,
    appVersion,
    buildVersion,
    deviceModel,
    deviceName,
    language,
    accountCountry,
    deviceLocale,
    deviceRegion,
    timezone,
  } = req.body || {};

  const rating = Number(stars);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Invalid rating' });
  }

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return res.status(429).json({ message: 'Too many submissions, please try again later.' });
  }

  const cleanComment = sanitize(comment, 1000);

  // Optional account enrichment — never fatal if the lookup fails or DB is off.
  let account = null;
  if (secret && typeof secret === 'string') {
    try {
      const user = await User.findOne({ secret })
        .select('username email countryCode elo created_at _id')
        .lean();
      if (user) {
        account = {
          id: user._id?.toString() || null,
          username: user.username || null,
          email: user.email || null,
          country: user.countryCode || null,
          elo: typeof user.elo === 'number' ? user.elo : null,
        };
      }
    } catch {
      // ignore — treat as guest
    }
  }

  const webhookUrl = process.env.DISCORD_FEEDBACK_WEBHOOK;
  if (!webhookUrl) {
    console.warn(`[submitFeedback] DISCORD_FEEDBACK_WEBHOOK not set — dropping ${rating}★ feedback`);
    // Still 200 so the app's confirmation toast stays honest ("received").
    return res.status(200).json({ message: 'Feedback received' });
  }

  try {
    const hook = new Webhook(webhookUrl);
    const starStr = '★'.repeat(rating) + '☆'.repeat(5 - rating);
    const country = account?.country || accountCountry || deviceRegion || null;

    const embed = new MessageBuilder()
      .setTitle(`${starStr}  ·  ${rating}/5`)
      .setColor(STAR_COLORS[rating] || '#f1c40f')
      .setDescription(cleanComment ? `> ${cleanComment.replace(/\n/g, '\n> ')}` : '_No comment left_');

    if (account) {
      embed.addField(
        '👤 User',
        `${account.username || 'Unknown'}${account.elo != null ? ` · ${account.elo} ELO` : ''}`,
        true,
      );
      if (account.email) embed.addField('✉️ Email', account.email, true);
      if (account.id) embed.addField('🆔 Account', account.id, true);
    } else {
      embed.addField('👤 User', 'Guest (not signed in)', true);
    }
    if (country) embed.addField('🌍 Country', country, true);

    embed.addField('📱 Platform', [platform, osVersion].filter(Boolean).join(' ') || '—', true);
    embed.addField(
      '📦 App version',
      [appVersion, buildVersion ? `(${buildVersion})` : ''].filter(Boolean).join(' ') || '—',
      true,
    );
    const deviceStr = [deviceModel, deviceName && deviceName !== deviceModel ? `“${deviceName}”` : '']
      .filter(Boolean)
      .join(' ');
    if (deviceStr) embed.addField('📲 Device', deviceStr, true);
    if (language) embed.addField('🗣️ App language', language, true);
    if (deviceLocale) embed.addField('🌐 Locale', deviceLocale, true);
    if (timezone) embed.addField('🕓 Timezone', timezone, true);
    embed.addField('📶 IP', ip, true);

    embed.setFooter('WorldGuessr · in-app rate-us prompt').setTimestamp();

    await hook.send(embed);
  } catch (err) {
    console.error('[submitFeedback] webhook send failed:', err?.message || err);
    return res.status(502).json({ message: 'Could not deliver feedback' });
  }

  return res.status(200).json({ message: 'Feedback received' });
}
