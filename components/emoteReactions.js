import React, { useEffect, useRef, useState, useCallback } from 'react';

export const EMOTES = ['👋', '👍', '😂', '😮', '🤔', '🎯', '😡', 'GG'];
const REACTION_TTL = 3200;
const SEND_COOLDOWN = 1500;

let lastLocalSend = 0;
let nextReactionId = 1;

function EmoteReactions({ ws, enabled, inGame, myId, hideName }) {
  const [open, setOpen] = useState(false);
  const [reactions, setReactions] = useState([]);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const reactionsRef = useRef(reactions);
  reactionsRef.current = reactions;

  const myIdRef = useRef(myId);
  useEffect(() => { myIdRef.current = myId; }, [myId]);

  useEffect(() => {
    if (!ws) return;
    const onMessage = (msg) => {
      let data;
      try { data = JSON.parse(msg.data); } catch { return; }
      if (data.type !== 'emote') return;
      if (!Number.isInteger(data.emote) || data.emote < 0 || data.emote >= EMOTES.length) return;
      const id = nextReactionId++;
      setReactions(prev => [...prev, {
        id,
        emote: EMOTES[data.emote],
        name: data.name || '',
        isSelf: data.id === myIdRef.current,
      }]);
      setTimeout(() => {
        setReactions(prev => prev.filter(r => r.id !== id));
      }, REACTION_TTL);
    };
    ws.addEventListener('message', onMessage);
    return () => ws.removeEventListener('message', onMessage);
  }, [ws]);

  // Clear reactions when leaving game
  useEffect(() => {
    if (!inGame) setReactions([]);
  }, [inGame]);

  const sendEmote = useCallback((index) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (now - lastLocalSend < SEND_COOLDOWN) return;
    lastLocalSend = now;
    setCooldownUntil(now + SEND_COOLDOWN);
    ws.send(JSON.stringify({ type: 'emote', emote: index }));
    setOpen(false);
  }, [ws]);

  if (!enabled || !inGame) return null;

  const inCooldown = Date.now() < cooldownUntil;

  return (
    <div className="emoteReactionsParent">
      <div className="emoteFloatStack" aria-hidden="true">
        {reactions.map(r => (
          <div key={r.id} className={`emoteFloatItem ${r.isSelf ? 'self' : ''} ${hideName ? 'noName' : ''}`}>
            <span className="emoteFloatGlyph">{r.emote}</span>
            {!hideName && r.name && <span className="emoteFloatName">{r.name}</span>}
          </div>
        ))}
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
        {EMOTES.map((e, i) => (
          <button
            key={i}
            className="emoteBtn"
            onClick={() => sendEmote(i)}
            disabled={inCooldown}
            aria-label={`Send ${e} reaction`}
            type="button"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

export default React.memo(EmoteReactions);
