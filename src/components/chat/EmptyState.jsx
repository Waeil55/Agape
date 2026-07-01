import React from 'react';
import { MessageCircle, Users, Phone } from 'lucide-react';

export default function EmptyState({ onNewChat }) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-slate-50 px-6 text-center">
      <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mb-5">
        <MessageCircle size={36} className="text-[#2b4c7e]" />
      </div>
      <h2 className="text-lg font-bold text-slate-900 mb-2">Welcome to Chat</h2>
      <p className="text-xs text-slate-500 max-w-[280px] leading-relaxed mb-6">
        Select a conversation to start messaging, or create a new one.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => onNewChat('team')}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-[#2b4c7e] text-white text-xs font-bold shadow-md active:scale-95 transition-all min-h-[44px]"
        >
          <Users size={14} /> Team Chat
        </button>
        <button
          onClick={() => onNewChat('sms')}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold shadow-sm active:scale-95 transition-all min-h-[44px]"
        >
          <Phone size={14} /> SMS
        </button>
      </div>
    </div>
  );
}
