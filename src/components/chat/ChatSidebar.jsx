import React from 'react';
import { Search, MessageCircle, Users, Phone, Filter } from 'lucide-react';
import { clock, pickColor } from './helpers';

export default function ChatSidebar({ conversations, activeConvo, setActiveConvo, search, setSearch, filter, setFilter, unreadCount, onlineMap, getDisplayName, uid, pickColor }) {
  return (
    <div className="w-full h-full flex flex-col bg-white">
      <div className="px-3 py-2 shrink-0 bg-white border-b border-slate-50">
        <div className="relative mb-2">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="w-full h-9 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#2b4c7e] focus:ring-1 focus:ring-[#2b4c7e] transition-all"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
          {[
            { key: 'all', label: 'All', Icon: MessageCircle },
            { key: 'unread', label: 'Unread', Icon: Filter },
            { key: 'team', label: 'Team', Icon: Users },
            { key: 'sms', label: 'SMS', Icon: Phone },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap transition-all shrink-0 ${
                filter === f.key
                  ? 'bg-[#1e3a5f] text-white shadow-sm'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              <f.Icon size={11} />
              {f.label}
              {f.key === 'unread' && unreadCount > 0 && (
                <span className={`ml-0.5 w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center ${filter === f.key ? 'bg-white/20' : 'bg-slate-200 text-slate-600'}`}>
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <MessageCircle size={22} className="text-slate-300" />
            </div>
            <p className="text-xs font-bold text-slate-500">No conversations</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Start a new chat</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {conversations.map(c => {
              const unread = c.unread?.[uid] || 0;
              const isOnline = (c.participants || []).some(p => p !== uid && onlineMap[p]);
              const color = pickColor(c.id);
              const other = (c.participants || []).find(p => p !== uid);
              const name = c.name || getDisplayName(other);
              const initials = (name || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();

              return (
                <button
                  key={c.id}
                  onClick={() => setActiveConvo(c.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all min-h-[56px] ${
                    activeConvo === c.id ? 'bg-blue-50/80' : 'hover:bg-slate-50 active:bg-slate-100'
                  }`}
                >
                  <div className="relative shrink-0">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {initials}
                    </div>
                    {isOnline && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs truncate ${unread > 0 ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>
                        {name}
                      </span>
                      <span className="text-[9px] text-slate-400 shrink-0 ml-1.5">
                        {clock(c.lastMessageTime)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className={`text-[11px] truncate ${unread > 0 ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
                        {c.lastMessage || 'No messages yet'}
                      </span>
                      {unread > 0 && (
                        <span className="shrink-0 ml-1.5 px-1.5 py-0.5 rounded-full bg-[#2b4c7e] text-white text-[8px] font-bold min-w-[16px] text-center">
                          {unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
