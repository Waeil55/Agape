import React, { useState, useCallback } from 'react';
import { MessageCircle, X, Minus } from 'lucide-react';
import { useChat } from '../../hooks/useChat';
import ChatChannelList from './ChatChannelList';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';

const ChatPanel = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showChannels, setShowChannels] = useState(true);
  const chat = useChat();

  const handleChannelSelect = useCallback((channelId) => {
    chat.setActiveChannel(channelId);
    chat.markAsRead(channelId);
    setShowChannels(false);
  }, [chat]);

  const handleBack = useCallback(() => {
    chat.setActiveChannel(null);
    setShowChannels(true);
  }, [chat]);

  const activeChannelData = chat.channels.find(c => c.id === chat.activeChannel);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-[100] group"
        title="Team Chat"
      >
        <div className="relative">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 shadow-lg shadow-blue-500/30 flex items-center justify-center text-white hover:from-blue-700 hover:to-blue-800 transition-all duration-200 hover:scale-105">
            <MessageCircle size={24} />
          </div>
          {chat.totalUnread > 0 && (
            <div className="absolute -top-1 -right-1 min-w-[20px] h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-sm animate-pulse">
              {chat.totalUnread > 99 ? '99+' : chat.totalUnread}
            </div>
          )}
        </div>
      </button>
    );
  }

  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-[100]">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white cursor-pointer" onClick={() => setIsMinimized(false)}>
            <MessageCircle size={16} />
            <span className="text-sm font-semibold">Team Chat</span>
            {chat.totalUnread > 0 && (
              <span className="ml-1 min-w-[18px] h-[18px] rounded-full bg-rose-500 text-[10px] font-bold flex items-center justify-center px-1">
                {chat.totalUnread > 99 ? '99+' : chat.totalUnread}
              </span>
            )}
            <button onClick={(e) => { e.stopPropagation(); setIsOpen(false); }} className="ml-2 hover:bg-white/20 rounded p-0.5">
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 md:bottom-6 md:right-6 z-[100] w-full h-full md:w-[420px] md:h-[600px] md:max-h-[80vh] md:rounded-2xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col bg-white animate-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {!showChannels && chat.activeChannel ? (
            <button onClick={handleBack} className="hover:bg-white/20 rounded-lg p-1 transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
          ) : (
            <MessageCircle size={18} />
          )}
          <div className="min-w-0">
            {showChannels ? (
              <>
                <h3 className="text-sm font-bold">Team Chat</h3>
                <p className="text-[10px] text-blue-100">{chat.channels.length} channels</p>
              </>
            ) : (
              <>
                <h3 className="text-sm font-bold truncate">{activeChannelData?.name || 'Chat'}</h3>
                <p className="text-[10px] text-blue-100 truncate">
                  {activeChannelData?.description || `${chat.channels.find(c => c.id === chat.activeChannel)?.roles?.length || 'All'} members`}
                </p>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setIsMinimized(true)} className="hover:bg-white/20 rounded-lg p-1.5 transition-colors" title="Minimize">
            <Minus size={16} />
          </button>
          <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 rounded-lg p-1.5 transition-colors" title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {showChannels ? (
          <ChatChannelList
            channels={chat.channels}
            activeChannel={chat.activeChannel}
            onSelect={handleChannelSelect}
            onlineUsers={chat.onlineUsers}
            unreadCounts={chat.unreadCounts}
            currentUser={chat.currentUser}
          />
        ) : (
          <div className="flex flex-col h-full">
            <ChatMessages
              messages={chat.messages}
              currentUser={chat.currentUser}
              onlineUsers={chat.onlineUsers}
              onReaction={chat.sendReaction}
              hasMore={chat.hasMore}
              loadingMore={chat.loadingMessages}
              onLoadMore={() => chat.loadMessages(chat.activeChannel, true)}
              messagesEndRef={chat.messagesEndRef}
              typingUsers={chat.typingUsers}
            />
            <ChatInput
              onSend={(text, extra) => chat.sendMessage(chat.activeChannel, text, extra)}
              onTyping={() => chat.setTyping(chat.activeChannel, true)}
              onStopTyping={() => chat.setTyping(chat.activeChannel, false)}
              channelName={activeChannelData?.name || 'Chat'}
              currentUser={chat.currentUser}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatPanel;
