import {Chatbot, createCustomMessage} from 'react-chatbot-kit'
import 'react-chatbot-kit/build/main.css'
import { createChatBotMessage } from 'react-chatbot-kit';
import React from 'react';
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
          <p className="react-chatbot-kit-chat-bot-avatar-letter">{JSON.parse(message.message).username}</p>
        </div>
      </div>
      <div className="react-chatbot-kit-chat-bot-message">
        <span>{JSON.parse(message.message).message}</span>
        <div className="react-chatbot-kit-chat-bot-message-arrow"></div>
      </div>
    </div>
  );
};

const ActionProvider = ({ createChatBotMessage, setState, children }) => {
  const handleMsg = (message) => {
    const botMessage = createCustomMessage(JSON.stringify({
      message: 'Hello, I am a custom message, '+message,
      username: 'cir4r3'
    }), 'custom', {payload: Math.random()});

    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, botMessage],
    }));
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

export default function ChatBox({ open, onToggle, enabled, onMsgSend }) {

  return (
    <div className={`chatboxParent ${enabled ? 'enabled' : ''}`}>
      <button style={{fontSize: '16px', fontWeight: 'bold', color: 'white', background: 'green', border: 'none', borderRadius: '5px', padding: '10px 20px', cursor: 'pointer'}} onClick={onToggle}>
        { open ? <FaXmark onClick={onToggle} /> : 'Chat' }
      </button>
      <div className={`chatbox ${open ? 'open' : ''}`}>
      <Chatbot
        config={config}
        messageParser={MessageParser}
        actionProvider={ActionProvider}
      />
    </div>
    </div>
  );
};

