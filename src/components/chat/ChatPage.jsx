import React, { useState, useEffect } from 'react';
import useChat from './useChat';
import ChatSidebar from './ChatSidebar';
import ChatConversation from './ChatConversation';
import EmptyState from './EmptyState';
import NewConversationModal from './NewConversationModal';
import { Plus, MessageCircle, Search, Users, Phone, Filter } from 'lucide-react';
import { clock, pickColor } from './helpers';

export default function ChatPage({ currentUser, role, drivers, dispatchers, trips, onSwitchToDispatch }) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const chat = useChat({ currentUser, drivers, dispatchers, isMobile });

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const handleNewChat = (type) => {
    chat.setModalTab(type);
    chat.setModalOpen(true);
  };

  if (!chat.uid) return null;

  if (isMobile) {
    if (chat.activeConvo) {
      return (
        <div className="w-full h-[100dvh] bg-gray-50 flex flex-col overflow-hidden">
          <ChatConversation
            messages={chat.messages}
            activeConvo={chat.activeConvo}
            uid={chat.uid}
            typing={chat.typing}
            onlineMap={chat.onlineMap}
            newMsg={chat.newMsg}
            setNewMsg={chat.setNewMsg}
            onSend={chat.send}
            replyTo={chat.replyTo}
            setReplyTo={chat.setReplyTo}
            onDelete={chat.deleteMessage}
            onBack={() => chat.setActiveConvo(null)}
            showInfo={chat.showInfo}
            setShowInfo={chat.setShowInfo}
            getDisplayName={chat.getDisplayName}
            pickColor={chat.pickColor}
            messagesEnd={chat.messagesEnd}
            inputRef={chat.inputRef}
            onTyping={() => chat.markTyping(chat.activeConvo)}
            loadingMore={chat.loadingMore}
            hasMore={chat.hasMore}
          />
        </div>
      );
    }

    return (
      <div className="w-full h-[100dvh] bg-white flex flex-col overflow-hidden pb-[100px]">
        <div className="px-4 py-3 flex items-center justify-between bg-white border-b border-gray-100 shrink-0 sticky top-0 z-50" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 font-semibold border border-blue-100 shrink-0">
              <MessageCircle size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-sm text-gray-900">Messages</h1>
                {chat.unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[#2b4c7e] text-white text-[10px] font-bold leading-none">{chat.unreadCount}</span>
                )}
              </div>
              <p className="text-[10px] text-gray-500 font-medium truncate max-w-[220px]">{currentUser}</p>
            </div>
          </div>
          <button
            onClick={() => handleNewChat('team')}
            className="p-2.5 rounded-full bg-[#2b4c7e] text-white shadow-md active:scale-95 transition-all"
          >
            <Plus size={18} />
          </button>
        </div>

        <div className="px-3 py-2 shrink-0 bg-white border-b border-gray-50">
          <div className="relative mb-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={chat.search}
              onChange={(e) => chat.setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="w-full h-10 pl-9 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#2b4c7e] focus:ring-1 focus:ring-[#2b4c7e] transition-all"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            {[
              { key: 'all', label: 'All', Icon: MessageCircle },
              { key: 'unread', label: 'Unread', Icon: Filter },
              { key: 'team', label: 'Team', Icon: Users },
              { key: 'sms', label: 'SMS', Icon: Phone },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => chat.setFilter(f.key)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-semibold whitespace-nowrap transition-all shrink-0 min-h-[32px] ${
                  chat.filter === f.key
                    ? 'bg-[#1e3a5f] text-white shadow-sm'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                <f.Icon size={12} />
                {f.label}
                {f.key === 'unread' && chat.unreadCount > 0 && (
                  <span className={`ml-0.5 w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center ${chat.filter === f.key ? 'bg-white/20' : 'bg-slate-200 text-slate-600'}`}>
                    {chat.unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}>
          {chat.conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <MessageCircle size={28} className="text-slate-300" />
              </div>
              <p className="text-sm font-bold text-slate-500">No conversations yet</p>
              <p className="text-xs text-slate-400 mt-1">Start a new chat to begin messaging</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {chat.conversations.map(c => {
                const unread = c.unread?.[chat.uid] || 0;
                const isOnline = (c.participants || []).some(p => p !== chat.uid && chat.onlineMap[p]);
                const color = pickColor(c.id);
                const other = (c.participants || []).find(p => p !== chat.uid);
                const name = c.name || chat.getDisplayName(other);
                const initials = (name || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();

                return (
                  <button
                    key={c.id}
                    onClick={() => { chat.setActiveConvo(c.id); chat.markRead(c.id); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 active:bg-slate-100 transition-all min-h-[64px]"
                  >
                    <div className="relative shrink-0">
                      <div
                        className="w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold text-white"
                        style={{ backgroundColor: color }}
                      >
                        {initials}
                      </div>
                      {isOnline && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm truncate ${unread > 0 ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>
                          {name}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                          {clock(c.lastMessageTime)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className={`text-xs truncate ${unread > 0 ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
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
              })}
            </div>
          )}
        </div>

        <button
          onClick={() => handleNewChat('team')}
          className="fixed z-30 right-4 w-14 h-14 rounded-full bg-[#2b4c7e] text-white shadow-xl flex items-center justify-center active:scale-95 transition-all border border-[#1e3a5f]"
          style={{
            bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
            boxShadow: '0 8px 24px rgba(43,76,126,0.3)'
          }}
        >
          <Plus size={22} />
        </button>

        <NewConversationModal
          open={chat.modalOpen}
          onClose={() => chat.setModalOpen(false)}
          drivers={chat.drivers}
          dispatchers={chat.dispatchers}
          uid={chat.uid}
          onCreate={chat.createConvo}
          onSmsCreate={chat.createSmsConvo}
        />
      </div>
    );
  }

  return (
    <div className="w-full h-[100dvh] flex bg-white overflow-hidden">
      <div className="w-80 xl:w-96 shrink-0 border-r border-slate-200 h-full hidden lg:flex flex-col">
        <div className="px-4 pt-4 pb-2 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-lg font-bold text-slate-900">Messages</h1>
            <button
              onClick={() => handleNewChat('team')}
              className="p-2 rounded-lg bg-[#2b4c7e] text-white shadow-sm hover:bg-[#1e3a5f] transition-all"
            >
              <Plus size={16} />
            </button>
          </div>
          <p className="text-[10px] text-slate-400 font-medium">{currentUser}</p>
        </div>
        <ChatSidebar
          conversations={chat.conversations}
          activeConvo={chat.activeConvo}
          setActiveConvo={(id) => { chat.setActiveConvo(id); chat.markRead(id); }}
          search={chat.search}
          setSearch={chat.setSearch}
          filter={chat.filter}
          setFilter={chat.setFilter}
          unreadCount={chat.unreadCount}
          onlineMap={chat.onlineMap}
          getDisplayName={chat.getDisplayName}
          uid={chat.uid}
          pickColor={chat.pickColor}
        />
      </div>

      <div className="flex-1 h-full hidden lg:flex">
        {chat.activeConvo ? (
          <ChatConversation
            messages={chat.messages}
            activeConvo={chat.activeConvo}
            uid={chat.uid}
            typing={chat.typing}
            onlineMap={chat.onlineMap}
            newMsg={chat.newMsg}
            setNewMsg={chat.setNewMsg}
            onSend={chat.send}
            replyTo={chat.replyTo}
            setReplyTo={chat.setReplyTo}
            onDelete={chat.deleteMessage}
            onBack={() => chat.setActiveConvo(null)}
            showInfo={chat.showInfo}
            setShowInfo={chat.setShowInfo}
            getDisplayName={chat.getDisplayName}
            pickColor={chat.pickColor}
            messagesEnd={chat.messagesEnd}
            inputRef={chat.inputRef}
            onTyping={() => chat.markTyping(chat.activeConvo)}
            loadingMore={chat.loadingMore}
            hasMore={chat.hasMore}
          />
        ) : (
          <EmptyState onNewChat={handleNewChat} />
        )}
      </div>

      <NewConversationModal
        open={chat.modalOpen}
        onClose={() => chat.setModalOpen(false)}
        drivers={chat.drivers}
        dispatchers={chat.dispatchers}
        uid={chat.uid}
        onCreate={chat.createConvo}
        onSmsCreate={chat.createSmsConvo}
      />
    </div>
  );
}
