import React, { useEffect } from 'react';
import useChat from './useChat';
import ChatSidebar from './ChatSidebar';
import ChatConversation from './ChatConversation';
import EmptyState from './EmptyState';
import NewConversationModal from './NewConversationModal';
import { Users, Phone, Plus, MessageCircle } from 'lucide-react';
import { clock } from './helpers';

export default function ChatPage({ currentUser, role, drivers, dispatchers, trips, onSwitchToDispatch }) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const chat = useChat({ currentUser, drivers, dispatchers, isMobile });

  const handleNewChat = (type) => {
    chat.setModalTab(type);
    chat.setModalOpen(true);
  };

  if (!chat.uid) return null;

  // Mobile: single-panel view
  if (isMobile) {
    if (!chat.activeConvo) {
      return (
        <div className="w-full h-[100dvh] bg-white flex flex-col overflow-hidden pb-[100px]">
          <div className="shrink-0 bg-white px-4 pt-4 pb-2 border-b border-gray-100" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-xl font-bold text-gray-900">Messages</h1>
              <div className="flex items-center gap-2">
                {chat.unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[#2b4c7e] text-white text-[11px] font-bold">
                    {chat.unreadCount}
                  </span>
                )}
                <button
                  onClick={() => handleNewChat('team')}
                  className="p-2.5 rounded-full bg-[#2b4c7e] text-white shadow-md active:scale-95 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
            <div className="relative mb-3">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                value={chat.search}
                onChange={(e) => chat.setSearch(e.target.value)}
                placeholder="Search conversations..."
                className="w-full h-10 pl-9 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#2b4c7e] focus:ring-1 focus:ring-[#2b4c7e]/20 transition-all"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
              {[
                { key: 'all', label: 'All' },
                { key: 'unread', label: 'Unread' },
                { key: 'team', label: 'Team' },
                { key: 'sms', label: 'SMS' },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => chat.setFilter(f.key)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all shrink-0 min-h-[36px] ${
                    chat.filter === f.key
                      ? 'bg-[#2b4c7e] text-white shadow-sm'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {f.label}
                  {f.key === 'unread' && chat.unreadCount > 0 && (
                    <span className={`ml-0.5 px-1 rounded-full text-[9px] ${chat.filter === f.key ? 'bg-white/20' : 'bg-gray-200'}`}>
                      {chat.unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pb-4">
            {chat.conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                  <MessageCircle size={28} className="text-gray-300" />
                </div>
                <p className="text-sm font-semibold text-gray-500">No conversations yet</p>
                <p className="text-xs text-gray-400 mt-1">Start a new chat to begin messaging</p>
              </div>
            ) : (
              chat.conversations.map(c => {
                const unread = c.unread?.[chat.uid] || 0;
                const isOnline = (c.participants || []).some(p => p !== chat.uid && chat.onlineMap[p]);
                const color = chat.pickColor(c.id);
                const other = (c.participants || []).find(p => p !== chat.uid);
                const name = c.name || chat.getDisplayName(other);
                const initials = (name || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();

                return (
                  <button
                    key={c.id}
                    onClick={() => { chat.setActiveConvo(c.id); chat.markRead(c.id); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-all min-h-[60px]"
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
                        <span className={`text-sm truncate ${unread > 0 ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>
                          {name}
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
      <div className="w-full h-[100dvh] bg-white flex flex-col overflow-hidden">
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

  // Desktop: sidebar + conversation
  return (
    <div className="w-full h-[100dvh] flex bg-white overflow-hidden">
      <div className="w-80 xl:w-96 shrink-0 border-r border-gray-200 h-full hidden lg:flex flex-col">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h1 className="text-lg font-bold text-gray-900">Messages</h1>
          <button
            onClick={() => handleNewChat('team')}
            className="p-2 rounded-lg bg-[#2b4c7e] text-white shadow-sm hover:bg-[#1e3a5f] transition-all"
          >
            <Plus size={16} />
          </button>
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
