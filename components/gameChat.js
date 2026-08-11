import React, { useEffect, useRef, useState, useCallback } from 'react';
import CountryFlag from '@/components/utils/countryFlag';
import { useTranslation } from '@/components/useTranslations';
import { HoverGlowName } from '@/components/utils/usernameWithFlag';

const MAX_MESSAGES = 100;
const MAX_LEN = 200;
// 1100, not 1000: the server enforces its own independent 1000ms window and
// the draft clears optimistically on send — with zero margin, network jitter
// could compress inter-arrival below 1000ms server-side and silently drop a
// message the client believed it sent.
const SEND_COOLDOWN = 1100;
const TYPING_PING_MS = 1500;
const TYPING_TTL = 3000;

// Text chat for party lobbies/games and matchmade 2v2 (teammate-only there —
// the server scopes the broadcast; this component never decides audience).
// One instance lives at home.js top level and stays mounted, so the log,
// unread count and mute set survive lobby -> game -> play-again. All state is
// component-local: no home.js thread-through, no module-level shared throttles
// (both were old-chatBox mistakes).
function GameChat({ ws, subscribeMessages, enabled, live, canSend, myId, teamCapable, defaultTeamChannel, myTeam, allAllies, roomCode, gameState, stackUp }) {
  const { t: text } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  // Channel picker (team contexts only): true = teammates, false = everyone.
  const [teamChannel, setTeamChannel] = useState(false);
  // Reset to the game type's default whenever the type changes (party toggled
  // to team mode, staging lobby → 2v2 match): 2v2 defaults team, else all.
  useEffect(() => {
    setTeamChannel(!!(teamCapable && defaultTeamChannel));
  }, [teamCapable, defaultTeamChannel]);
  const [typing, setTyping] = useState({});
  const [unread, setUnread] = useState(0);
  // Session-scoped: deliberately NOT cleared when live drops, so muting a
  // player holds across games in one sitting.
  const [mutedIds, setMutedIds] = useState(() => new Set());

  const myIdRef = useRef(myId);
  useEffect(() => { myIdRef.current = myId; }, [myId]);
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);
  const mutedRef = useRef(mutedIds);
  useEffect(() => { mutedRef.current = mutedIds; }, [mutedIds]);
  // LATCHED allegiance, not the live prop: 2v2 wipes gameData during the
  // stage-2 queue and reconnects, so a render-time team comparison repainted
  // the whole log whenever state flickered (the "colors keep changing" bug).
  // The latch holds the last known team; it resets per room below. Only a
  // DEFINITE→DIFFERENT-DEFINITE transition is a real team switch — a wipe to
  // null is a state flicker and must not count.
  const myTeamRef = useRef(myTeam ?? null);
  useEffect(() => {
    if (!myTeam) return;
    const prev = myTeamRef.current;
    myTeamRef.current = myTeam;
    if (prev && prev !== myTeam) {
      // I changed teams (self-picked or host-moved) — July 30 ruling: the old
      // team's channel is not mine anymore, DROP its messages; repaint the
      // remaining all-channel log to the new allegiance (live truth).
      setMessages(msgs => msgs
        .filter(m => !m.teamChat)
        .map(m => {
          const ally = m.isSelf || !!(m.team && m.team === myTeam);
          const opp = !ally && !!m.team;
          return { ...m, tint: ally ? 'teamMine' : (opp ? 'teamOpp' : '') };
        }));
    }
  }, [myTeam]);
  const allAlliesRef = useRef(!!allAllies);
  useEffect(() => { allAlliesRef.current = !!allAllies; }, [allAllies]);
  // Render-fresh mirror of the prop, for the room-clear effect below: it must
  // RE-SEED the latch (not null it) — on match entry the room change and my
  // team assignment land in the same commit, and nulling would leave the
  // latch empty for the whole match (teams never change again mid-match).
  const myTeamPropRef = useRef(myTeam);
  myTeamPropRef.current = myTeam;

  // Per-instance throttles (never module-level).
  const lastSendRef = useRef(0);
  const lastTypingPingRef = useRef(0);
  const nextKeyRef = useRef(1);
  const listRef = useRef(null);
  // Whether the reader is glued to the newest message. Updated on every list
  // scroll (native and our own programmatic pins alike), consumed by the
  // autoscroll effect below. 40px slack so sub-message wiggle still counts
  // as "at bottom".
  const atBottomRef = useRef(true);
  const onListScroll = useCallback(() => {
    const el = listRef.current;
    if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }, []);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!enabled || !live || !subscribeMessages) return;
    const unsubscribe = subscribeMessages((data) => {
      if (data.type === 'chat') {
        if (typeof data.message !== 'string' || !data.id) return;
        if (mutedRef.current.has(data.id)) return;
        const isSelf = data.id === myIdRef.current;
        // Allegiance is decided ONCE, here, and stored on the message — never
        // recomputed at render. Blue = me, team-channel (by construction it
        // never crosses teams), everyone in a 2v2 staging/queue room (the duo
        // IS the team), or a team match against the latched myTeam. Green =
        // strictly the confirmed-opposing remainder. A message keeps its
        // color for life no matter what the game state does afterwards.
        const latchedTeam = myTeamRef.current;
        const ally = isSelf || !!data.teamChat || allAlliesRef.current
          || !!(data.team && latchedTeam && data.team === latchedTeam);
        const opp = !ally && !!(data.team && latchedTeam && data.team !== latchedTeam);
        const key = nextKeyRef.current++;
        setMessages(prev => [...prev.slice(-(MAX_MESSAGES - 1)), {
          key,
          senderId: data.id,
          name: data.name || '',
          countryCode: data.countryCode || null,
          // Latched at receipt, exactly like `tint` above: a message keeps the
          // presentation it arrived with for life. An equip made mid-game shows
          // up on the sender's NEXT message, which is the honest reading — and
          // it means a hundred-row log never re-renders because somebody
          // visited the shop.
          nameGlow: data.nameGlow || null,
          team: data.team || null,
          teamChat: !!data.teamChat,
          text: data.message,
          isSelf,
          tint: ally ? 'teamMine' : (opp ? 'teamOpp' : ''),
        }]);
        // A message from X supersedes X's typing state immediately.
        setTyping(prev => {
          if (!prev[data.id]) return prev;
          const next = { ...prev };
          delete next[data.id];
          return next;
        });
        if (!isSelf && !openRef.current) setUnread(u => u + 1);
      } else if (data.type === 'chatTyping') {
        if (!data.id || data.id === myIdRef.current) return;
        if (mutedRef.current.has(data.id)) return;
        setTyping(prev => ({ ...prev, [data.id]: { name: data.name || '', until: Date.now() + TYPING_TTL } }));
      }
    });
    return unsubscribe;
  }, [enabled, live, subscribeMessages]);

  // Leaving the chat surface wipes the ephemeral log.
  useEffect(() => {
    if (!live) {
      setMessages([]);
      setTyping({});
      setUnread(0);
      setOpen(false);
      setDraft('');
      myTeamRef.current = null;
      lastRoomRef.current = null;
    }
  }, [live]);

  // Per-ROOM clearing (July 30 ruling, supersedes the July 26 "log survives
  // staging→match" design): a fresh room means a fresh log — staging→match
  // clears, match→back-to-staging clears, so last match's messages never
  // haunt the next one. `roomCode` is the server's gameId (see home.js).
  // Compare DEFINED keys only: the stage-2 queue wipes gameData (key
  // undefined) while chat rides the persisting staging room — that wipe is a
  // state flicker, not a room change, and must not clear.
  // The allegiance latch resets with the room: new room, new teams.
  const lastRoomRef = useRef(null);
  useEffect(() => {
    if (!roomCode) return;
    if (lastRoomRef.current && lastRoomRef.current !== roomCode) {
      setMessages([]);
      setTyping({});
      setUnread(0);
      setDraft('');
      // Re-seed from the live prop, never null: the new room's team often
      // arrives in the SAME commit as the room change (match entry), and the
      // myTeam effect above may have already latched it — nulling here would
      // strand the latch empty for the whole match.
      myTeamRef.current = myTeamPropRef.current ?? null;
    }
    lastRoomRef.current = roomCode;
  }, [roomCode]);

  // NO auto-open (user ruling July 26, reverses the earlier discoverability
  // auto-open): chat always starts as the FAB — the unread badge is the
  // discoverability signal.

  // TTL prune for typing entries; interval only runs while someone is typing.
  const typingCount = Object.keys(typing).length;
  useEffect(() => {
    if (typingCount === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setTyping(prev => {
        const alive = Object.entries(prev).filter(([, v]) => v.until > now);
        if (alive.length === Object.keys(prev).length) return prev;
        return Object.fromEntries(alive);
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [typingCount]);

  useEffect(() => {
    if (open) setUnread(0);
  }, [open, messages.length]);

  // (Re)opening the panel always lands at the newest message.
  useEffect(() => {
    if (open && listRef.current) {
      atBottomRef.current = true;
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [open]);

  // Pin the list to the newest message — but only when the reader is already
  // at the bottom, or the message is their own; someone scrolled up reading
  // history is never yanked down. Keyed on the LAST MESSAGE, not
  // messages.length: at the MAX_MESSAGES cap the append slices one off the
  // front so the length never changes, and a length-keyed effect went dead
  // exactly in busy chats (the "stops autoscrolling" bug).
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  useEffect(() => {
    const el = listRef.current;
    if (!open || !el || !lastMsg) return;
    if (atBottomRef.current || lastMsg.isSelf) el.scrollTop = el.scrollHeight;
  }, [open, lastMsg]);

  // iOS Safari doesn't shrink the page for the software keyboard — it pans
  // the whole page up so the focused input stays visible (desired: that's
  // what keeps the chat box on-screen while typing). But on dismiss WebKit
  // often leaves that pan behind, so bottom-anchored HUD (the guess button
  // row) sits shifted up until the next tap forces a re-clamp. Undo it
  // ourselves with a per-frame zeroing burst across the dismiss window: a
  // single delayed scrollTo left the button visibly parked high, then
  // snapping — per-frame, any pan WebKit re-applies mid-animation is erased
  // on the next frame, so the HUD never rests off-position. The
  // activeElement guard aborts the burst when the user refocuses an input
  // (keyboard coming back — that pan is wanted, never fight it).
  const panResetRafRef = useRef(0);
  const resetKeyboardPan = useCallback(() => {
    cancelAnimationFrame(panResetRafRef.current);
    const until = Date.now() + 700;
    const tick = () => {
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      if (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop) {
        window.scrollTo(0, 0);
      }
      if (Date.now() < until) panResetRafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);
  useEffect(() => () => cancelAnimationFrame(panResetRafRef.current), []);
  // Covers closing the panel (✕ / Escape / live drop) while the input still
  // has focus: the input unmounts without ever firing blur.
  useEffect(() => {
    if (!open) resetKeyboardPan();
  }, [open, resetKeyboardPan]);

  const send = useCallback(() => {
    if (!canSend || !ws || ws.readyState !== WebSocket.OPEN) return;
    const message = draft.trim();
    if (message.length < 1 || message.length > MAX_LEN) return;
    const now = Date.now();
    if (now - lastSendRef.current < SEND_COOLDOWN) return; // keep the draft, just drop the attempt
    lastSendRef.current = now;
    ws.send(JSON.stringify({ type: 'chat', message, teamOnly: !!(teamCapable && teamChannel) }));
    setDraft('');
  }, [canSend, ws, draft, teamCapable, teamChannel]);

  const onDraftChange = useCallback((e) => {
    const value = e.target.value;
    setDraft(value);
    if (!canSend || !value.trim() || !ws || ws.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (now - lastTypingPingRef.current < TYPING_PING_MS) return;
    lastTypingPingRef.current = now;
    ws.send(JSON.stringify({ type: 'chatTyping', teamOnly: !!(teamCapable && teamChannel) }));
  }, [canSend, ws, teamCapable, teamChannel]);

  if (!enabled || !live) return null;

  const visible = messages.filter(m => !mutedIds.has(m.senderId));
  const typers = Object.values(typing).filter(v => v.until > Date.now());
  const typingLine = typers.length === 0 ? '' :
    typers.length === 1 ? text('isTyping', { name: typers[0].name }) :
      text('areTyping', { count: typers.length });

  return (
    <div className={`gameChatParent ${gameState === 'end' ? 'rightSide' : ''} ${stackUp ? 'stacked' : ''}`}>
      {open ? (
        <div className="chatPanel">
          <div className="chatPanelHeader">
            <span className="chatPanelTitle">{teamCapable && teamChannel ? text('teamChat') : text('chat')}</span>
            {teamCapable && (
              <div className="chatChannelSeg" role="group">
                <button type="button"
                  className={`chatChannelBtn ${teamChannel ? 'active' : ''}`}
                  onClick={() => setTeamChannel(true)}
                >{text('chatChannelTeam')}</button>
                <button type="button"
                  className={`chatChannelBtn ${!teamChannel ? 'active' : ''}`}
                  onClick={() => setTeamChannel(false)}
                >{text('chatChannelAll')}</button>
              </div>
            )}
            {mutedIds.size > 0 && (
              <button className="chatMutedChip" type="button" title={text('unmuteAll')}
                onClick={() => setMutedIds(new Set())}>
                {text('chatMutedCount', { count: mutedIds.size })}
              </button>
            )}
            <button className="chatCloseBtn" type="button" aria-label={text('close')} onClick={() => setOpen(false)}>✕</button>
          </div>
          <div className="chatMessages" ref={listRef} onScroll={onListScroll}>
            {visible.map(m => {
              // REST-UNTIL-HOVER (`wg-glowHover` on the row). Chat is the one
              // glow surface that animates OVER a live round, so HoverGlowName
              // keeps a static shadow at rest and cross-fades to a paint-only
              // animated layer under the pointer. Mouse-out fades back to the
              // static halo instead of leaving the animation frozen mid-bloom.
              // Props are cached inside the helper; the halo still clips at
              // the scroll container's edges, as expected.
              return (
              // Tint was stamped at RECEIVE time (see the subscribe handler)
              // and never changes afterwards — render-time team comparison is
                // what let state wipes repaint the whole log.
              <div key={m.key} className={`chatMsg wg-glowHover ${m.tint || ''}`}>
                <span className="chatMsgName">
                  <HoverGlowName sku={m.nameGlow}>{m.name}</HoverGlowName>
                  {m.countryCode && <CountryFlag countryCode={m.countryCode} style={{ fontSize: '0.85em', marginLeft: '4px' }} />}
                  {m.teamChat && <span className="chatMsgTeamTag">{text('chatChannelTeam')}</span>}
                </span>
                <span className="chatMsgText">{m.text}</span>
                {!m.isSelf && (
                  <button className="chatMuteBtn" type="button" title={text('mutePlayer')}
                    onClick={() => setMutedIds(prev => new Set(prev).add(m.senderId))}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <path d="M11 5 L6 9 H3 v6 h3 l5 4 z" />
                      <line x1="16" y1="9" x2="22" y2="15" />
                      <line x1="22" y1="9" x2="16" y2="15" />
                    </svg>
                  </button>
                )}
              </div>
              );
            })}
          </div>
          <div className="chatTypingLine">{typingLine}</div>
          <div className="chatInputRow">
            <input
              className="chatInput"
              type="text"
              value={draft}
              maxLength={MAX_LEN}
              disabled={!canSend}
              placeholder={canSend ? text('chatPlaceholder') : text('loginToChat')}
              onChange={onDraftChange}
              onBlur={resetKeyboardPan}
              onKeyDown={(e) => {
                if (e.key === 'Enter') send();
                if (e.key === 'Escape') setOpen(false);
              }}
            />
            <button className="chatSendBtn" type="button" disabled={!canSend || !draft.trim()} onClick={send} aria-label={text('chat')}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                <path d="M2 21 L23 12 L2 3 L2 10 L17 12 L2 14 Z" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <button className="chatToggleBtn" type="button" aria-label={text('chat')} onClick={() => setOpen(true)}>
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          {unread > 0 && <span className="chatUnreadBadge">{unread > 9 ? '9+' : unread}</span>}
        </button>
      )}
    </div>
  );
}

export default React.memo(GameChat);
