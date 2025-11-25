import { Chatbot, createCustomMessage } from 'react-chatbot-kit';
import 'react-chatbot-kit/build/main.css';
import { createChatBotMessage } from 'react-chatbot-kit';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { FaXmark } from 'react-icons/fa6';
import { useTranslation } from '@/components/useTranslations';
import { Filter } from 'bad-words';
import { toast } from 'react-toastify';
const filter = new Filter();

const config = {
  initialMessages: [],
  customComponents: {
    header: () => <div className="react-chatbot-kit-chat-header">Chat</div>
  },
  customMessages: {
    custom: (props) => {
      return <CustomMessage {...props} message={props.state.messages.find(msg => (msg.payload === props.payload))} />;
    },
  },
};

const CustomMessage = ({ state, message }) => {
  return (
    <div className="react-chatbot-kit-chat-bot-message-container fgh">
      <div className="react-chatbot-kit-chat-bot-avatar">
        <div className="react-chatbot-kit-chat-bot-avatar-container">
          <p className="react-chatbot-kit-chat-bot-avatar-letter">{JSON.parse(message.message).username?.charAt(0)}</p>
        </div>
      </div>
      <div className="react-chatbot-kit-chat-bot-message">
        <span className='authorName'>{JSON.parse(message.message).username}</span>
        <br />
        <span>{JSON.parse(message.message).message}</span>
        <div className="react-chatbot-kit-chat-bot-message-arrow"></div>
      </div>
    </div>
  );
};

let lastSend = 0;

const ActionProvider = ({ createChatBotMessage, setState, children, ws, myId, inGame }) => {
  // Use ref to always have current myId value in the event listener
  // This fixes the stale closure issue where myId might be undefined initially
  const myIdRef = useRef(myId);
  useEffect(() => {
    myIdRef.current = myId;
  }, [myId]);

  useEffect(() => {
    if (!ws) return;
    const ondata = (msg) => {
      const data = JSON.parse(msg.data);
      // Use ref to get current myId value, not the stale closure value
      if (data.type === 'chat' && data.id !== myIdRef.current) {
        const senderUsername = data.name;
        setState((state) => {
          return { ...state, messages: [...state.messages, createCustomMessage(JSON.stringify({
            message: data.message,
            username: senderUsername
          }), 'custom', { payload: data.message })] };
        });
      }
    };

    ws.addEventListener('message', ondata);
    return () => {
      ws.removeEventListener('message', ondata);
    };
  }, [ws]);

  useEffect(() => {
    if (!inGame) setState((state) => {
      return { ...state, messages: [] };
    });
  }, [inGame]);

  function sendMsg(msg) {
    if (!ws) return;
    ws.send(JSON.stringify({ type: 'chat', message: msg }));
  }

  const handleMsg = (message) => {
    sendMsg(message);
  };

  return (
    <div>
      {React.Children.map(children, (child) => {
        return React.cloneElement(child, {
          actions: {
            handleMsg,
          },
        });
      })}
    </div>
  );
};

const MessageParser = ({ children, actions }) => {
  const parse = (message) => {
    actions.handleMsg(message);
  };

  return (
    <div>
      {React.Children.map(children, (child) => {
        return React.cloneElement(child, {
          parse: parse,
          actions
        });
      })}
    </div>
  );
};

// Memoized wrapper components for Chatbot to prevent re-renders
const MemoizedMessageParser = React.memo(MessageParser);
const MemoizedActionProvider = React.memo(ActionProvider);

function ChatBox({ ws, open, onToggle, enabled, myId, inGame, miniMapShown, isGuest, publicGame, roundOverScreenShown }) {
  const { t: text } = useTranslation("common");
  const [unreadCount, setUnreadCount] = useState(0);

  // Store ws, myId, inGame in refs so they can be accessed without causing re-renders
  const wsRef = useRef(ws);
  const myIdRef = useRef(myId);
  const inGameRef = useRef(inGame);

  // Update refs when values change
  useEffect(() => {
    wsRef.current = ws;
  }, [ws]);

  useEffect(() => {
    myIdRef.current = myId;
  }, [myId]);

  useEffect(() => {
    inGameRef.current = inGame;
  }, [inGame]);

  const notGuestChatDisabled = !(!isGuest || (isGuest && !publicGame));
  const notGuestChatDisabledRef = useRef(notGuestChatDisabled);

  useEffect(() => {
    notGuestChatDisabledRef.current = notGuestChatDisabled;
  }, [notGuestChatDisabled]);

  useEffect(() => {
    if (open) {
      setUnreadCount(0);
    }
  }, [open]);

  useEffect(() => {
    if (!ws) return;
    const ondata = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.type === 'chat' && data.id !== myId && !open) {
        setUnreadCount(prevCount => prevCount + 1);
      }
    };

    ws.addEventListener('message', ondata);
    return () => {
      ws.removeEventListener('message', ondata);
    };
  }, [ws, open, myId]);

  // Stable message parser that doesn't change between renders
  const messageParserFunc = useCallback((props) => <MemoizedMessageParser {...props} />, []);

  // Stable action provider that uses refs for changing values
  const actionProviderFunc = useCallback((props) => (
    <MemoizedActionProvider {...props} ws={wsRef.current} myId={myIdRef.current} inGame={inGameRef.current} />
  ), []);

  // Stable validator function using ref for notGuestChatDisabled
  const validatorFunc = useCallback((input) => {
    if(notGuestChatDisabledRef.current) return false;
    if (input.length < 1) return false;
    if (input.length > 200) return false;
    if (Date.now() - lastSend < 1000) return false;
    if (filter.isProfane(input)) {
      toast.error('Be nice!');
      return false;
    }
    lastSend = Date.now();
    return true;
  }, []);

  // Hide chat button on mobile when RoundOverScreen is showing
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const shouldHideChatButton = false;
  return (
    <div className={`chatboxParent ${enabled ? 'enabled' : ''} ${notGuestChatDisabled ? 'guest' : ''} ${roundOverScreenShown ? 'roundOverScreen' : ''}`}>
      {!shouldHideChatButton && (
        <button
        className={`chatboxBtn ${open ? 'open' : ''} ${miniMapShown ? 'minimap' : ''}`} style={{ fontSize: '16px', fontWeight: 'bold', color: 'white', background: 'green', border: 'none', borderRadius: '5px', padding: '10px 20px', cursor: 'pointer' }} onClick={onToggle}>
          {open ? <FaXmark onClick={onToggle} /> : `${text("chat")}${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
        </button>
      )}
      <div className={`chatbox ${open ? 'open' : ''}`}>
        <Chatbot
          config={config}
          placeholderText={notGuestChatDisabled ? "Please login to chat" : undefined}
          messageParser={messageParserFunc}
          actionProvider={actionProviderFunc}
          validator={validatorFunc}
        />
      </div>
    </div>
  );
}

// Export with React.memo - the key to preventing input reset is the stable
// function references (messageParserFunc, actionProviderFunc, validatorFunc)
// created with useCallback, not blocking re-renders
export default React.memo(ChatBox);
