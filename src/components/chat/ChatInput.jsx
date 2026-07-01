import React, { useRef, useEffect } from 'react';
import { Send, Smile, Paperclip, X } from 'lucide-react';

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
    <div className="shrink-0 bg-white border-t border-slate-100" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
      {replyTo && (
        <div className="flex items-center gap-2 px-4 pt-2 pb-1 bg-blue-50/50 border-b border-blue-100">
          <div className="flex-1 min-w-0">
            <span className="text-[9px] font-bold text-blue-600 block">Replying to {getDisplayName(replyTo.senderId)}</span>
            <span className="text-[11px] text-slate-500 truncate block">{replyTo.text}</span>
          </div>
          <button onClick={onClearReply} className="p-1 rounded-full hover:bg-blue-100 text-slate-400">
            <X size={14} />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2 px-3 py-2">
        <button className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50 shrink-0">
          <Paperclip size={18} />
        </button>
        <div className="flex-1 min-h-[40px] bg-slate-50 rounded-2xl border border-slate-200 flex items-end px-3 py-1.5 focus-within:border-[#2b4c7e] focus-within:ring-1 focus-within:ring-[#2b4c7e]/20 transition-all">
          <textarea
            ref={inputRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Type a message..."
            className="flex-1 bg-transparent resize-none text-[13px] text-slate-900 placeholder-slate-400 outline-none max-h-20 py-0.5"
            style={{ minHeight: '18px' }}
          />
          <button className="p-1 text-slate-400 hover:text-slate-600 ml-1">
            <Smile size={16} />
          </button>
        </div>
        <button
          onClick={() => onSend(value)}
          disabled={!value?.trim()}
          className="p-2.5 rounded-full bg-[#2b4c7e] text-white shadow-md active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100 shrink-0"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
