import React, { useState, useEffect, useRef, useCallback } from 'react';
import CountryFlag from '@/components/utils/countryFlag';

const SEND_COOLDOWN = 2000;
const MAX_MESSAGES = 50;

function GameChat({ ws, inGame, myId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [lastSent, setLastSent] = useState(0);
  const [unread, setUnread] = useState(0);
  const messagesEndRef = useRef(null);
  const myIdRef = useRef(myId);

  useEffect(() => { myIdRef.current = myId; }, [myId]);

  useEffect(() => {
    if (!ws) return;
    const onMessage = (evt) => {
      let data;
      try { data = JSON.parse(evt.data); } catch { return; }
      if (data.type !== 'chat') return;
      if (typeof data.message !== 'string') return;

      setMessages(prev => [...prev.slice(-(MAX_MESSAGES - 1)), {
        id: Date.now() + Math.random(),
        name: data.name || 'Guest',
        countryCode: data.countryCode || null,
        message: data.message,
        isSelf: data.id === myIdRef.current,
      }]);
      setUnread(prev => prev + 1);
    };
    ws.addEventListener('message', onMessage);
    return () => ws.removeEventListener('message', onMessage);
  }, [ws]);

  // Clear messages when leaving game
  useEffect(() => {
    if (!inGame) {
      setMessages([]);
      setUnread(0);
      setOpen(false);
    }
  }, [inGame]);

  // Clear unread when opening
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  // Auto-scroll
  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  const sendChat = useCallback((e) => {
    if (e) e.preventDefault();
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!input.trim()) return;
    if (Date.now() - lastSent < SEND_COOLDOWN) return;
    ws.send(JSON.stringify({ type: 'chat', message: input.trim().substring(0, 200) }));
    setInput('');
    setLastSent(Date.now());
  }, [ws, input, lastSent]);

  if (!inGame) return null;

  return (
    <div className="gameChat">
      <button
        className={`gameChatToggle ${open ? 'open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label="Toggle chat"
        type="button"
      >
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {!open && unread > 0 && <span className="gameChatBadge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="gameChatPanel">
          <div className="gameChatMessages">
            {messages.length === 0 && (
              <div className="gameChatEmpty">No messages yet</div>
            )}
            {messages.map(m => (
              <div key={m.id} className={`gameChatMsg ${m.isSelf ? 'self' : ''}`}>
                <span className="gameChatMsgName">
                  {m.countryCode && <CountryFlag countryCode={m.countryCode} style={{ fontSize: '0.8em', marginRight: '3px' }} />}
                  {m.name}:
                </span>
                <span className="gameChatMsgText">{m.message}</span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <form className="gameChatInputArea" onSubmit={sendChat}>
            <input
              className="gameChatInput"
              value={input}
              onChange={e => setInput(e.target.value)}
              maxLength={200}
              placeholder="Type a message..."
              autoComplete="off"
            />
            <button className="gameChatSendBtn" type="submit" aria-label="Send message">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default React.memo(GameChat);
