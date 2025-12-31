
import React, { useState } from 'react';

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  disabled: boolean;
  placeholder: string;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, disabled, placeholder }) => {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      onSendMessage(text.trim());
      setText('');
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 p-4 bg-brand-surface/90 backdrop-blur-md border-t border-white/10 z-10">
      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 w-full bg-black/50 border border-white/10 rounded-xl py-3 px-5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold transition-all disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="flex-shrink-0 w-12 h-12 bg-brand-gold text-black rounded-full flex items-center justify-center transition-all duration-300 transform active:scale-90 disabled:bg-white/10 disabled:text-gray-600 disabled:scale-100"
        >
          <svg className="w-6 h-6 -rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  );
};

export default ChatInput;
