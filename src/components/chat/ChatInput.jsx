import React, { useRef, useEffect } from 'react';
import { Send, Smile, Paperclip, X, Mic } from 'lucide-react';

export default function ChatInput({ value, onChange, onSend, replyTo, onClearReply, onTyping, getDisplayName }) {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend(value);
    }
  };

  const handleChange = (e) => {
    onChange(e.target.value);
    onTyping?.();
  };

  return (
    <div className="shrink-0 bg-white border-t border-gray-100 pb-[env(safe-area-inset-bottom)]">
      {replyTo && (
        <div className="flex items-center gap-2 px-4 pt-2 pb-1 bg-blue-50/50 border-b border-blue-100">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-bold text-blue-600 block">Replying to {getDisplayName(replyTo.senderId)}</span>
            <span className="text-xs text-gray-600 truncate block">{replyTo.text}</span>
          </div>
          <button onClick={onClearReply} className="p-1 rounded-full hover:bg-blue-100 text-gray-400">
            <X size={16} />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2 px-3 py-2">
        <button className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-50 shrink-0">
          <Paperclip size={20} />
        </button>
        <div className="flex-1 min-h-[44px] bg-gray-50 rounded-2xl border border-gray-200 flex items-end px-3 py-1.5 focus-within:border-[#2b4c7e] focus-within:ring-1 focus-within:ring-[#2b4c7e]/20 transition-all">
          <textarea
            ref={inputRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Type a message..."
            className="flex-1 bg-transparent resize-none text-sm text-gray-900 placeholder-gray-400 outline-none max-h-24 py-1"
            style={{ minHeight: '20px' }}
          />
          <button className="p-1 text-gray-400 hover:text-gray-600 ml-1">
            <Smile size={18} />
          </button>
        </div>
        <button
          onClick={() => onSend(value)}
          disabled={!value?.trim()}
          className="p-2.5 rounded-full bg-[#2b4c7e] text-white shadow-md active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100 shrink-0"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
