import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import CountryFlag from '@/components/utils/countryFlag';
import { getEmote, byLegacyIndex, resolveEmoteBar } from '@/shared/emotes/catalog';
import { cachedNameGlowProps, GLOW_DARK } from '@/components/utils/usernameWithFlag';

/* ===========================================================================
 *  IN-GAME EMOTE REACTIONS.
 *
 *  THIS FILE USED TO BE A HARDCODED ARRAY OF EIGHT EMOJI. That is worth stating
 *  plainly, because it is the whole reason the shop's emote bar appeared to do
 *  nothing: the storefront wrote `cosmetics.emoteOrder`, the server stored it,
 *  the ws server validated against it — and the picker that is supposed to
 *  render it had a literal at the top of the file and never asked. A player
 *  could buy an emote, add it to their bar, and watch the same eight buttons
 *  come up in every game forever.
 *
 *  THE ROSTER IS resolveEmoteBar(), FROM shared/emotes/catalog.js, AND NOTHING
 *  ELSE. Same call mobile makes (mobile/src/components/multiplayer/
 *  EmoteReactions.tsx), so "your bar" means one thing across both clients.
 *
 *  THE WIRE IS DUAL AND HAS TO STAY DUAL, in BOTH directions:
 *    sending    `emoteId` is the real value. `emote` (the legacy 0..7 index) is
 *               sent alongside it ONLY so a ws server rolled back a version
 *               still understands the free eight. Paid emotes have no index and
 *               send -1, which such a server drops — the correct failure.
 *    receiving  `emoteId` FIRST, legacy index second. The old guard here was
 *               `emote >= 0 && emote < EMOTES.length`, so every paid emote any
 *               opponent sent (broadcast with `emote: -1`) was thrown away and
 *               rendered nothing. Half of "bought emotes don't work" was this
 *               end, not the picker.
 * ======================================================================== */

const REACTION_TTL = 3200;
const SEND_COOLDOWN = 1500;

let lastLocalSend = 0;
let nextReactionId = 1;

function EmoteReactions({
  ws, subscribeMessages, enabled, inGame, myId, myTeam, hideName, rightSide,
  // The account's bar and inventory. Both absent for guests, which
  // resolveEmoteBar reads as "the free eight" — the right answer, since the
  // server would reject a paid emote from an account that does not own it.
  emoteOrder, ownedCosmetics,
}) {
  const [open, setOpen] = useState(false);
  const [reactions, setReactions] = useState([]);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const reactionsRef = useRef(reactions);
  reactionsRef.current = reactions;

  const myIdRef = useRef(myId);
  useEffect(() => { myIdRef.current = myId; }, [myId]);

  // Live TTL timers for on-screen bubbles. Kept so unmount can cancel them —
  // they used to survive the component and call setReactions on a dead tree.
  const reactionTimersRef = useRef(new Set());

  // The buttons this player gets. Recomputed only when the bar or the inventory
  // actually changes — this component re-renders on every incoming reaction and
  // rebuilding the roster on each one would be pure waste.
  const bar = useMemo(
    () => resolveEmoteBar(emoteOrder, ownedCosmetics),
    [emoteOrder, ownedCosmetics],
  );

  useEffect(() => {
    // Ride the provider's single parsed-message stream instead of a raw
    // ws listener (which re-parsed every message itself), and only while
    // emotes can actually arrive — the server sends them in-game only.
    if (!enabled || !inGame || !subscribeMessages) return;
    const unsubscribe = subscribeMessages((data) => {
      if (data.type !== 'emote') return;
      // ID FIRST. A paid emote carries `emote: -1` and would fail any
      // index-shaped check; the id is the value that always resolves.
      const def = getEmote(data.emoteId) || byLegacyIndex(data.emote);
      if (!def) return;
      const id = nextReactionId++;
      setReactions(prev => [...prev, {
        id,
        emote: def.glyph,
        // The catalogue's effect id, carried on the reaction rather than looked
        // up again at render: `def` is already resolved here, and the bubble is
        // a plain data object by the time it reaches the list. Undefined for
        // every emote but the skull. See the `fx` note in shared/emotes.
        fx: def.fx || null,
        name: data.name || '',
        countryCode: data.countryCode || null,
        // Stamped at receipt like every other bit of this bubble's presentation
        // — the reaction only lives 3.2s, so "live" and "latched" are the same
        // thing here anyway.
        nameGlow: data.nameGlow || null,
        team: data.team || null, // 'a' | 'b' in team modes — colored at render
        isSelf: data.id === myIdRef.current,
      }]);
      const timer = setTimeout(() => {
        reactionTimersRef.current.delete(timer);
        setReactions(prev => prev.filter(r => r.id !== id));
      }, REACTION_TTL);
      reactionTimersRef.current.add(timer);
    });
    return unsubscribe;
  }, [enabled, inGame, subscribeMessages]);

  // Unmount ONLY — not on the subscribe effect above, which re-runs when
  // enabled/subscribeMessages change mid-game and would strand visible bubbles
  // at full opacity forever if it cleared the TTL timers.
  useEffect(() => () => {
    for (const t of reactionTimersRef.current) clearTimeout(t);
    reactionTimersRef.current.clear();
  }, []);

  // Clear reactions when leaving game
  useEffect(() => {
    if (!inGame) {
      setReactions([]);
      for (const t of reactionTimersRef.current) clearTimeout(t);
      reactionTimersRef.current.clear();
    }
  }, [inGame]);

  const sendEmote = useCallback((emote) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (now - lastLocalSend < SEND_COOLDOWN) return;
    lastLocalSend = now;
    setCooldownUntil(now + SEND_COOLDOWN);
    ws.send(JSON.stringify({
      type: 'emote',
      emoteId: emote.id,
      // Legacy fallback only — see the header. ws.js prefers emoteId when both
      // are present, so this costs nothing on a current server.
      emote: emote.legacyIndex ?? -1,
    }));
    setOpen(false);
  }, [ws]);

  if (!enabled || !inGame) return null;

  const inCooldown = Date.now() < cooldownUntil;

  return (
    <div className={`emoteReactionsParent ${rightSide ? 'rightSide' : ''}`}>
      <div className="emoteFloatStack" aria-hidden="true">
        {reactions.map(r => {
          // Allegiance tint, same palette and same rule as chat: my bubble is
          // ALWAYS blue, opponents are ALWAYS green (July 27 ruling). isSelf
          // leads the test because a 1v1 has no teams at all — gating blue on
          // `r.team && myTeam` dropped every duel through to the old green
          // `.self` look, which only showed in UNRANKED duels (ranked ones set
          // gameData.duel, which hides the name and makes the bubble
          // transparent via .noName).
          const mine = r.isSelf || (r.team && myTeam && r.team === myTeam);
          // Dark bubble (blue/green/black at 0.55-0.72 alpha) → the dark variant.
          const glow = cachedNameGlowProps(r.nameGlow, GLOW_DARK, { ownBox: true });
          return (
            <div key={r.id} className={`emoteFloatItem ${mine ? 'teamMine' : 'teamOpp'} ${hideName ? 'noName' : ''}`}>
              <span className={`emoteFloatGlyph ${r.fx ? `emoteFx--${r.fx}` : ''}`.trim()}>{r.emote}</span>
              {!hideName && r.name && (
                // The glow goes ON .emoteFloatName, not on an inner span. That
                // box is a flex item (its parent is inline-flex), so it is
                // blockified and its own `overflow: hidden` is what clips —
                // .wg-glow-room has to be the thing carrying it or the halo is
                // sheared before an inner element ever sees it. It rides
                // UNCONDITIONALLY, because a bubble that changes shape when its
                // owner equips something is the bug this whole class exists
                // around. The 120px max-width still truncates: the class is
                // content-box, so the padding is additive rather than eating the
                // text room.
                //
                // ANIMATED HERE, unlike the chat log: a handful of bubbles live
                // for 3.2s apiece, so the paint cost is bounded by the emote
                // cooldown rather than by how long the game has been running.
                <span
                  className={`emoteFloatName wg-glow-room ${glow?.className || ''}`.trim()}
                  style={glow?.style}
                >
                  {r.countryCode && <CountryFlag countryCode={r.countryCode} style={{ fontSize: '0.9em', marginRight: '4px' }} />}
                  {r.name}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <button
        className={`emoteToggleBtn ${open ? 'open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label="Toggle emote reactions"
        type="button"
      >
        {open ? (
          <span className="emoteToggleClose">✕</span>
        ) : (
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M8 14c1 1.5 2.4 2.3 4 2.3S15 15.5 16 14" />
            <line x1="9" y1="9.5" x2="9" y2="10.5" />
            <line x1="15" y1="9.5" x2="15" y2="10.5" />
          </svg>
        )}
      </button>
      <div className={`emoteBar ${open ? 'open' : ''}`}>
        {bar.map((e) => (
          <button
            key={e.id}
            className="emoteBtn"
            onClick={() => sendEmote(e)}
            disabled={inCooldown}
            aria-label={`Send ${e.name} reaction`}
            type="button"
          >
            {/* The effect rides the glyph, not the button: .emoteBtn already
                owns a hover scale, and an infinite animation on the same
                element would be fighting it every time the pointer lands. */}
            <span className={e.fx ? `emoteFx--${e.fx}` : undefined}>{e.glyph}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default React.memo(EmoteReactions);
