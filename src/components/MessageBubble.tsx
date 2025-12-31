
import React from 'react';
import { Message } from '../types';

interface MessageBubbleProps {
  message: Message;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const { text, sender } = message;

  const isUser = sender === 'user';
  const isOwner = sender === 'owner';
  const isBot = sender === 'bot';

  const bubbleClasses = "p-4 rounded-[24px] text-sm leading-relaxed max-w-[85%] whitespace-pre-wrap shadow-md";
  const containerClasses = "flex flex-col animate-fade-in";

  let specificBubbleClasses = '';
  let specificContainerClasses = '';

  if (isUser) {
    specificBubbleClasses = 'bg-white/10 text-gray-200 rounded-bl-none border border-white/5';
    specificContainerClasses = 'self-start items-start';
  } else if (isBot) {
    specificBubbleClasses = 'bg-gradient-to-br from-brand-gold to-brand-gold-dark text-black font-medium rounded-br-none shadow-[0_10px_30px_rgba(212,175,55,0.2)]';
    specificContainerClasses = 'self-end items-end ml-auto';
  } else if (isOwner) {
    specificBubbleClasses = 'bg-blue-600 text-white font-medium rounded-br-none shadow-[0_10px_20px_rgba(37,99,235,0.2)]';
    specificContainerClasses = 'self-end items-end ml-auto';
  }

  return (
    <div className={`${containerClasses} ${specificContainerClasses}`}>
      <div className={`${bubbleClasses} ${specificBubbleClasses}`}>
        {text}
      </div>
    </div>
  );
};

export default MessageBubble;
