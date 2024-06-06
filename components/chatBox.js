import {Chatbot} from 'react-chatbot-kit'
import 'react-chatbot-kit/build/main.css'
import { createChatBotMessage } from 'react-chatbot-kit';
import React from 'react';
import { FaXmark } from 'react-icons/fa6';
const config = {
  initialMessages: [createChatBotMessage(`Hello world`, { widget: 'options' })],
};

const ActionProvider = ({ createChatBotMessage, setState, children }) => {
  return (
    <div>
      {React.Children.map(children, (child) => {
        return React.cloneElement(child, {
          actions: {},
        });
      })}
    </div>
  );
};

const MessageParser = ({ children, actions }) => {
  const parse = (message) => {
    console.log(message);
  };

  return (
    <div>
      {React.Children.map(children, (child) => {
        return React.cloneElement(child, {
          parse: parse,
          actions: {},
        });
      })}
    </div>
  );
};

export default function ChatBox({ open, onToggle }) {

  return (
    <div className='chatboxParent'>
      <button style={{fontSize: '16px', fontWeight: 'bold', color: 'white', background: 'green', border: 'none', borderRadius: '5px', padding: '10px 20px', cursor: 'pointer'}} onClick={onToggle}>
        { open ? <FaXmark onClick={onClose} /> : 'Chat' }
      </button>
      { open && (
      <Chatbot
        config={config}
        messageParser={MessageParser}
        actionProvider={ActionProvider}
      />
      )}
    </div>
  );
};