
import React from 'react';
import { Message } from '../types';

interface MessageBubbleProps {
  message: Message;
  isTyping?: boolean;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isBot = message.sender === 'bot';
  const isOwner = message.sender === 'owner';
  const isUser = message.sender === 'user';
  
  const isRight = isBot || isOwner;

  // Dynamic Classes
  const containerClass = `flex flex-col max-w-[80%] md:max-w-[70%] ${isRight ? 'self-end items-end' : 'self-start items-start'}`;
  
  const bubbleClass = `
    px-4 py-3 text-sm leading-relaxed shadow-md break-words relative
    ${isBot 
        ? 'bg-gradient-to-br from-brand-gold to-[#997B19] text-black font-medium rounded-2xl rounded-tr-none' 
        : (isOwner 
            ? 'bg-brand-surface border border-brand-gold/30 text-brand-gold rounded-2xl rounded-tr-none' 
            : 'bg-[#222] border border-white/5 text-gray-200 rounded-2xl rounded-tl-none')}
  `;

  const senderLabel = {
    bot: 'Dominion AI',
    owner: 'Agente (Tú)',
    user: 'Lead'
  }[message.sender];

  return (
    <div className={`${containerClass} animate-fade-in`}>
      <span className="text-[10px] text-gray-500 mb-1 px-1 font-medium tracking-wide">
          {senderLabel}
      </span>
      <div className={bubbleClass}>
        {message.text}
      </div>
      <span className="text-[10px] text-gray-600 mt-1 px-1 font-mono">
        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
};

export default MessageBubble;
