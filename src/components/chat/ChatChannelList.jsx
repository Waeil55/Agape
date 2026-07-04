import React from 'react';
import { MessageCircle, Radio, Truck, Shield, Hash, Users } from 'lucide-react';
import { getInitials, getAvatarColor, getRoleColor } from '../../utils/chatHelpers';

const CHANNEL_ICONS = {
  MessageCircle: MessageCircle,
  Radio: Radio,
  Truck: Truck,
  Shield: Shield,
  Hash: Hash,
  Users: Users,
};

const ChatChannelList = ({ channels, activeChannel, onSelect, onlineUsers, unreadCounts, currentUser }) => {
  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      {/* Online users bar */}
      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Online Now</p>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {onlineUsers.size === 0 ? (
            <span className="text-xs text-slate-400 italic">No one else online</span>
          ) : (
            Array.from(onlineUsers).slice(0, 10).map(email => (
              <div key={email} className="flex flex-col items-center gap-0.5 shrink-0">
                <div className="relative">
                  <div className={`w-9 h-9 rounded-full ${getAvatarColor(email)} flex items-center justify-center text-white text-[10px] font-bold`}>
                    {getInitials(email.split('@')[0])}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
                </div>
                <span className="text-[9px] text-slate-500 max-w-[48px] truncate">{email.split('@')[0]}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Channels */}
      <div className="py-2">
        <p className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Channels</p>
        {channels.map(ch => {
          const Icon = CHANNEL_ICONS[ch.icon] || Hash;
          const isActive = activeChannel === ch.id;
          const unread = unreadCounts[ch.id] || 0;
          const isParticipant = ch.isParticipant !== false;

          if (!isParticipant) return null;

          return (
            <button
              key={ch.id}
              onClick={() => onSelect(ch.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : unread > 0
                    ? 'bg-slate-50 hover:bg-slate-100'
                    : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isActive ? 'bg-blue-100' : 'bg-slate-100'
              }`}>
                <Icon size={16} className={isActive ? 'text-blue-600' : 'text-slate-500'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-semibold truncate ${unread > 0 ? 'text-slate-900' : ''}`}>
                    {ch.name}
                  </span>
                  {unread > 0 && (
                    <span className="chat-unread-badge ml-2 min-w-[18px] h-[18px] rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center px-1 shrink-0 badge-pulse shadow-[0_0_6px_rgba(37,99,235,0.35)]">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 truncate">{ch.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Current user info */}
      <div className="px-4 py-3 border-t border-slate-100 mt-auto">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className={`w-8 h-8 rounded-full ${getAvatarColor(currentUser.email)} flex items-center justify-center text-white text-[10px] font-bold`}>
              {getInitials(currentUser.name)}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900 truncate">{currentUser.name}</p>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${getRoleColor(currentUser.role)}`}>
              {currentUser.role}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatChannelList;
