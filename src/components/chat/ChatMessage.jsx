import React, { useState } from 'react';
import { Reply, Copy, Trash2, MoreVertical } from 'lucide-react';
import { clock } from './helpers';

export default function ChatMessage({ msg, uid, onReply, onDelete, getDisplayName, replyTarget, onClickReply }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isMe = msg.senderId === uid;
  const name = getDisplayName(msg.senderId);
  const initials = (name || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className={`group flex gap-2 px-3 py-1 ${isMe ? 'flex-row-reverse' : ''}`}>
      {!isMe && (
        <div className="shrink-0 w-8 h-8 rounded-full bg-[#2b4c7e] flex items-center justify-center text-[10px] font-bold text-white mt-1">
          {initials}
        </div>
      )}
      <div className={`max-w-[78%] min-w-[60px] ${isMe ? 'items-end' : 'items-start'}`}>
        {!isMe && (
          <span className="text-[10px] font-semibold text-gray-500 ml-1 mb-0.5 block">{name}</span>
        )}
        {msg.replyToId && (
          <div
            className={`mb-1 rounded-xl px-3 py-1.5 text-xs cursor-pointer border ${isMe ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-gray-50 border-gray-100 text-gray-600'}`}
            onClick={() => onClickReply?.(msg.replyToId)}
          >
            <span className="font-semibold">{msg.replyToName || 'Message'}</span>
            <p className="truncate opacity-70 mt-0.5">{msg.replyToText}</p>
          </div>
        )}
        <div
          className={`relative rounded-2xl px-3 py-2 shadow-sm text-sm leading-relaxed ${
            isMe
              ? 'bg-[#2b4c7e] text-white rounded-br-md'
              : 'bg-white border border-gray-100 text-gray-900 rounded-bl-md'
          }`}
          onDoubleClick={() => setMenuOpen(!menuOpen)}
        >
          {msg.sentiment && (
            <span className={`inline-block mr-1 text-xs ${
              msg.sentiment === 'positive' ? 'text-emerald-300' :
              msg.sentiment === 'negative' ? 'text-rose-300' :
              'text-blue-300'
            }`}>
              {msg.sentiment === 'positive' ? '😊' : msg.sentiment === 'negative' ? '😟' : '😐'}
            </span>
          )}
          {msg.text}
          {msg.read && isMe && (
            <span className="ml-1.5 text-[9px] text-blue-200 font-semibold">✓✓</span>
          )}
        </div>
        <div className={`flex items-center gap-1 mt-0.5 ${isMe ? 'justify-end mr-1' : 'ml-1'}`}>
          <span className="text-[10px] text-gray-400">{clock(msg.createdAt)}</span>
        </div>
        {menuOpen && (
          <div className={`absolute z-50 bg-white rounded-xl shadow-lg border border-gray-100 py-1 mt-1 ${isMe ? 'right-3' : 'left-12'}`}>
            <button onClick={() => { onReply(msg); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
              <Reply size={14} /> Reply
            </button>
            <button onClick={() => { navigator.clipboard.writeText(msg.text); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
              <Copy size={14} /> Copy
            </button>
            {isMe && (
              <button onClick={() => { onDelete(msg.id); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-600 hover:bg-rose-50">
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
