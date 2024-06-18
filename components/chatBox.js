import {Chatbot, createCustomMessage} from 'react-chatbot-kit'
import 'react-chatbot-kit/build/main.css'
import { createChatBotMessage } from 'react-chatbot-kit';
import React, { useEffect } from 'react';
import { FaXmark } from 'react-icons/fa6';
const config = {
  initialMessages: [],
  customMessages: {
    custom: (props) => {
      return <CustomMessage {...props} message={props.state.messages.find(msg => (msg.payload === props.payload))}/>
  },
  },
};
const CustomMessage = ({state, message}) => {
  return (
    <div className="react-chatbot-kit-chat-bot-message-container fgh">
      <div className="react-chatbot-kit-chat-bot-avatar">
        <div className="react-chatbot-kit-chat-bot-avatar-container">
          <p className="react-chatbot-kit-chat-bot-avatar-letter">{JSON.parse(message.message).username?.charAt(0)}</p>
        </div>
      </div>
      <div className="react-chatbot-kit-chat-bot-message">
        <span className='authorName'>{JSON.parse(message.message).username}</span>
        <br/>
        <span>{JSON.parse(message.message).message}</span>
        <div className="react-chatbot-kit-chat-bot-message-arrow"></div>
      </div>
    </div>
  );
};
let lastSend = 0;

const ActionProvider = ({ createChatBotMessage, setState, children, ws, myId, inGame }) => {
  useEffect(() => {
    if(!ws) return;
    const ondata = (msg) => {
      const data = JSON.parse(msg.data);
      if(data.type === 'chat' && data.id !== myId) {
        // const senderUsername = multiplayerState?.gameData?.players.find(p => p.id === data.id)?.username;
        const senderUsername = data.name;
        setState((state) => {
          return { ...state, messages: [...state.messages, createCustomMessage(JSON.stringify({
            message: data.message,
            username: senderUsername
          }), 'custom', {payload: data.message})] };
        });
      }
    };

    ws.addEventListener('message', ondata);
    return () => {
      ws.removeEventListener('message', ondata);
    };
  }, [ws]);

  useEffect(() => {
    if(!inGame) setState((state) => {
      return { ...state, messages: [] };
    });
  }, [inGame])

  function sendMsg(msg) {

    // return if not in game
    if(!ws) return;
    ws.send(JSON.stringify({type: 'chat', message: msg}));
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

export default function ChatBox({ ws, open, onToggle, enabled, myId, inGame }) {

  return (
    <div className={`chatboxParent ${enabled ? 'enabled' : ''}`}>
      <button style={{fontSize: '16px', fontWeight: 'bold', color: 'white', background: 'green', border: 'none', borderRadius: '5px', padding: '10px 20px', cursor: 'pointer'}} onClick={onToggle}>
        { open ? <FaXmark onClick={onToggle} /> : 'Chat' }
      </button>
      <div className={`chatbox ${open ? 'open' : ''}`}>
      <Chatbot
        config={config}
        messageParser={(props) => <MessageParser {...props}  />}
        actionProvider={(props) => <ActionProvider {...props} ws={ws} myId={myId} inGame={inGame} />}

        validator={(input) => {
          if(input.length < 1) return false;
          if(input.length > 200) return false;
          if(Date.now() - lastSend < 1000) return false;
          lastSend = Date.now();
          return true;
        }}
      />
    </div>
    </div>
  );
};

