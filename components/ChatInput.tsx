
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
    if (text.trim() && !disabled) {
      onSendMessage(text.trim());
      setText('');
    }
  };

  return (
    <div className="p-4 md:p-6 bg-brand-surface/90 backdrop-blur-md border-t border-white/10 z-10">
      <form onSubmit={handleSubmit} className="flex gap-3 relative">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className={`
            flex-1 bg-black/50 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-gray-500 text-sm 
            focus:outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold transition-all
            ${disabled ? 'opacity-50 cursor-not-allowed bg-black/30' : ''}
          `}
        />
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className={`
            w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300
            ${disabled || !text.trim()
                ? 'bg-white/5 text-gray-600 cursor-not-allowed' 
                : 'bg-brand-gold text-black hover:scale-105 hover:shadow-[0_0_15px_rgba(212,175,55,0.4)]'}
          `}
        >
          <svg className="w-5 h-5 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
      {disabled && (
          <div className="absolute top-2 left-0 right-0 text-center">
              <span className="text-[10px] bg-black/80 text-brand-gold px-2 py-0.5 rounded border border-brand-gold/20">
                  Modo de Observación
              </span>
          </div>
      )}
    </div>
  );
};

export default ChatInput;
