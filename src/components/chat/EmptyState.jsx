import React from 'react';
import { MessageCircle, Users, Phone } from 'lucide-react';

export default function EmptyState({ onNewChat }) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-50 px-6 text-center">
      <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mb-5">
        <MessageCircle size={36} className="text-[#2b4c7e]" />
      </div>
      <h2 className="text-lg font-bold text-gray-900 mb-2">Welcome to Chat</h2>
      <p className="text-sm text-gray-500 max-w-[280px] leading-relaxed mb-6">
        Select a conversation to start messaging, or create a new one.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => onNewChat('team')}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-[#2b4c7e] text-white text-sm font-bold shadow-md active:scale-95 transition-all"
        >
          <Users size={16} /> Team Chat
        </button>
        <button
          onClick={() => onNewChat('sms')}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm font-bold shadow-sm active:scale-95 transition-all"
        >
          <Phone size={16} /> SMS
        </button>
      </div>
    </div>
  );
}
