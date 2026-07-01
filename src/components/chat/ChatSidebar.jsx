import React from 'react';
import { Search, MessageCircle, Users, Phone, Filter } from 'lucide-react';
import { clock, pickColor } from './helpers';

const FILTERS = [
  { key: 'all', label: 'All', icon: MessageCircle },
  { key: 'unread', label: 'Unread', icon: Filter },
  { key: 'team', label: 'Team', icon: Users },
  { key: 'sms', label: 'SMS', icon: Phone },
];

export default function ChatSidebar({ conversations, activeConvo, setActiveConvo, search, setSearch, filter, setFilter, unreadCount, onlineMap, markRead, getDisplayName, uid, pickColor }) {
  const getOtherName = (c) => {
    if (c.name) return c.name;
    const other = (c.participants || []).find(p => p !== uid);
    return getDisplayName(other);
  };

  const getOtherInitials = (c) => {
    const name = getOtherName(c);
    return (name || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
  };

  return (
    <div className="w-full h-full flex flex-col bg-white">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-2 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-gray-900">Messages</h1>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-[#2b4c7e] text-white text-[11px] font-bold">{unreadCount}</span>
          )}
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="w-full h-10 pl-9 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#2b4c7e] focus:ring-1 focus:ring-[#2b4c7e]/20 transition-all"
          />
        </div>

        {/* Filter chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all shrink-0 ${
                filter === f.key
                  ? 'bg-[#2b4c7e] text-white shadow-sm'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              <f.icon size={13} />
              {f.label}
              {f.key === 'unread' && unreadCount > 0 && (
                <span className={`ml-0.5 px-1 rounded-full text-[9px] ${filter === f.key ? 'bg-white/20' : 'bg-gray-200'}`}>{unreadCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto pb-24">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <MessageCircle size={28} className="text-gray-300" />
            </div>
            <p className="text-sm font-semibold text-gray-500">No conversations yet</p>
            <p className="text-xs text-gray-400 mt-1">Start a new chat to begin messaging</p>
          </div>
        ) : (
          conversations.map(c => {
            const isActive = activeConvo === c.id;
            const unread = c.unread?.[uid] || 0;
            const isOnline = (c.participants || []).some(p => p !== uid && onlineMap[p]);
            const color = pickColor(c.id);

            return (
              <button
                key={c.id}
                onClick={() => { setActiveConvo(c.id); markRead(c.id); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all ${
                  isActive ? 'bg-blue-50/80' : 'hover:bg-gray-50 active:bg-gray-100'
                }`}
              >
                <div className="relative shrink-0">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: color }}
                  >
                    {getOtherInitials(c)}
                  </div>
                  {isOnline && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm truncate ${unread > 0 ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>
                      {getOtherName(c)}
                    </span>
                    <span className="text-[10px] text-gray-400 shrink-0 ml-2">
                      {clock(c.lastMessageTime)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className={`text-xs truncate ${unread > 0 ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                      {c.lastMessage || 'No messages yet'}
                    </span>
                    {unread > 0 && (
                      <span className="shrink-0 ml-2 px-1.5 py-0.5 rounded-full bg-[#2b4c7e] text-white text-[9px] font-bold min-w-[18px] text-center">
                        {unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
