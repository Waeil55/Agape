import React, { useMemo, useState } from 'react';
import { MessageCircle, MessageSquarePlus, Search, Send, Smartphone, Users } from 'lucide-react';
import {
  avatarColor,
  buildConversationSubtitle,
  buildConversationTitle,
  formatConversationTime,
  getInitials,
  normalizeEmail,
  truncateText,
} from '../../utils/chatUtils';

const filters = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'team', label: 'Team' },
  { id: 'clients', label: 'Clients' },
];

function ConversationRow({
  conversation,
  isActive,
  contactsByEmail,
  currentUserEmail,
  onSelect,
}) {
  const title = buildConversationTitle(conversation, contactsByEmail, currentUserEmail);
  const subtitle = buildConversationSubtitle(conversation, contactsByEmail, currentUserEmail);
  const unread = Number(conversation.unread?.[normalizeEmail(currentUserEmail)] || 0);
  const isClient = !!conversation.isClient;

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      className={`w-full min-h-[76px] px-3 py-2.5 rounded-lg flex items-center gap-3 text-left border ${
        isActive
          ? 'bg-blue-50 border-blue-200 shadow-sm'
          : 'bg-white border-transparent hover:bg-slate-50'
      }`}
    >
      <div className={`relative w-11 h-11 rounded-full ${isClient ? 'bg-emerald-600' : avatarColor(title)} text-white flex items-center justify-center font-black text-sm shrink-0`}>
        {isClient ? <Smartphone size={18} /> : getInitials(title)}
        {unread > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 ring-2 ring-white" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={`truncate text-sm ${unread > 0 ? 'font-black text-slate-950' : 'font-bold text-slate-800'}`}>{title}</p>
          <span className="ml-auto shrink-0 text-[11px] font-bold text-slate-400">{formatConversationTime(conversation.updatedAt || conversation.lastMessageAt)}</span>
        </div>
        <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{subtitle}</p>
        <div className="mt-1 flex items-center gap-2 min-w-0">
          <p className={`truncate text-xs ${unread > 0 ? 'font-bold text-slate-800' : 'font-medium text-slate-400'}`}>
            {conversation.lastMessageText ? truncateText(conversation.lastMessageText, 72) : 'No messages yet'}
          </p>
          {unread > 0 && (
            <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export default function ChatSidebar({
  conversations = [],
  allConversationCount = 0,
  activeConversationId,
  contactsByEmail,
  currentUserEmail,
  filter,
  onFilterChange,
  onSelectConversation,
  onNewChat,
  onNewSms,
  loading,
  error,
  isDriver,
  unreadTotal,
}) {
  const [query, setQuery] = useState('');
  const visibleConversations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return conversations;
    return conversations.filter(conversation => {
      const title = buildConversationTitle(conversation, contactsByEmail, currentUserEmail).toLowerCase();
      const last = String(conversation.lastMessageText || '').toLowerCase();
      return title.includes(needle) || last.includes(needle);
    });
  }, [contactsByEmail, conversations, currentUserEmail, query]);

  return (
    <aside className="h-full min-h-0 w-full flex flex-col bg-white">
      <div className="px-4 pt-4 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-slate-950 text-white flex items-center justify-center shadow-md">
            <MessageCircle size={22} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black text-slate-950 tracking-normal">Chat</h1>
            <p className="text-xs font-bold text-slate-500">{allConversationCount} threads{unreadTotal > 0 ? `, ${unreadTotal} unread` : ''}</p>
          </div>
          <button
            type="button"
            onClick={onNewChat}
            title="New team chat"
            className="ml-auto w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shadow-blue-600/20"
          >
            <MessageSquarePlus size={18} />
          </button>
          {!isDriver && (
            <button
              type="button"
              onClick={onNewSms}
              title="New client conversation"
              className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center"
            >
              <Send size={17} />
            </button>
          )}
        </div>

        <label className="mt-4 h-11 rounded-xl bg-slate-100 border border-slate-200 flex items-center gap-2 px-3 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100">
          <Search size={17} className="text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search messages"
            className="w-full bg-transparent border-0 outline-none text-sm font-semibold text-slate-800 placeholder:text-slate-400"
          />
        </label>

        <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">
          {filters.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => onFilterChange(item.id)}
              className={`h-8 rounded-lg text-[11px] font-black ${filter === item.id ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {loading ? (
          <div className="p-4 space-y-2">
            {[0, 1, 2, 3, 4].map(item => (
              <div key={item} className="h-[76px] rounded-lg bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="m-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div>
        ) : visibleConversations.length === 0 ? (
          <div className="h-full min-h-[280px] flex items-center justify-center p-6 text-center">
            <div>
              <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center">
                <Users size={22} />
              </div>
              <p className="mt-4 text-sm font-black text-slate-800">No conversations found</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">Start a new team chat to bring everyone into the loop.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {visibleConversations.map(conversation => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                isActive={conversation.id === activeConversationId}
                contactsByEmail={contactsByEmail}
                currentUserEmail={currentUserEmail}
                onSelect={onSelectConversation}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
