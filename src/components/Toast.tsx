
import React, { useEffect } from 'react';

export interface ToastData {
  message: string;
  type: 'success' | 'error';
}

interface ToastProps {
  toast: ToastData | null;
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast, onClose]);

  if (!toast) return null;

  const isSuccess = toast.type === 'success';

  return (
    <div
      className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[20000] flex items-center gap-4 px-6 py-4 rounded-xl shadow-2xl animate-fade-in
        ${isSuccess ? 'bg-green-600/95 border border-green-400/30' : 'bg-red-600/95 border border-red-400/30'}
        backdrop-blur-md`}
    >
      <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${isSuccess ? 'bg-white/20' : 'bg-white/20'}`}>
        {isSuccess ? '✓' : '✕'}
      </div>
      <p className="text-sm font-bold text-white">{toast.message}</p>
      <button onClick={onClose} className="ml-4 text-white/50 hover:text-white transition-colors">&times;</button>
    </div>
  );
};

export default Toast;
