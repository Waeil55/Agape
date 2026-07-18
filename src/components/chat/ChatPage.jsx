import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Phone, Video, Info, Search, Plus, Smile, ThumbsUp, Send,
  Camera, Image as ImageIcon, MessageSquare, Loader2, X
} from 'lucide-react';
import { useChat } from '../../hooks/useChat';

export const formatDisplayName = (user) => {
  if (!user) return 'User';
  let raw = user.name || user.username || user.email || 'User';
  if (raw.includes('@')) {
    raw = raw.split('@')[0];
  }
  return raw
    .split(/[\._\-]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const ChatPage = ({ onBack, onThreadActive }) => {
  const {
    currentUser,
    channels,
    messages,
    activeChannelId,
    setActiveChannelId,
    users,
    loading,
    sendMessage,
    startDirectChat
  } = useChat();

  const [searchQuery, setSearchQuery] = useState('');
  const [composerText, setComposerText] = useState('');
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const messagesEndRef = useRef(null);

  // Notify parent of active thread state change
  useEffect(() => {
    if (onThreadActive) {
      onThreadActive(!!activeChannelId);
    }
  }, [activeChannelId, onThreadActive]);

  // Scroll to bottom of message list on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeChannelId]);

  const handleSend = (textToSend = null) => {
    const text = (textToSend || composerText).trim();
    if (!text && !textToSend) return;
    sendMessage(text || '👍');
    if (!textToSend) setComposerText('');
  };

  const getOtherParticipant = (channel) => {
    if (!channel || !currentUser || !channel.participants) return null;
    const otherId = channel.participants.find(pId => pId !== currentUser.id);
    return channel.participantDetails?.[otherId] || { name: 'User', email: '' };
  };

  const activeChannel = channels.find(c => c.id === activeChannelId);
  const otherContact = getOtherParticipant(activeChannel);

  // Filter channels based on search
  const filteredChannels = channels.filter(ch => {
    const other = getOtherParticipant(ch);
    if (!other) return false;
    const name = (other.name || other.username || '').toLowerCase();
    const email = (other.email || '').toLowerCase();
    const lastMsgText = (ch.lastMessage?.text || '').toLowerCase();
    const query = searchQuery.toLowerCase();
    return name.includes(query) || email.includes(query) || lastMsgText.includes(query);
  });

  // Filter contacts (users not in active chats or all search matching contacts)
  const filteredContacts = users.filter(u => {
    const name = (u.name || u.username || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    const query = searchQuery.toLowerCase();
    return name.includes(query) || email.includes(query);
  });

  const getAvatarUrl = (user) => {
    if (!user) return '';
    const displayName = formatDisplayName(user);
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0D8ABC&color=fff&size=128&rounded=true&bold=true`;
  };

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <span className="text-xs font-semibold text-slate-500">Connecting to Team Chat...</span>
        </div>
      </div>
    );
  }

  // Thread View (Active Chat)
  if (activeChannel && otherContact) {
    return (
      <div className="agape-messenger-thread h-full flex flex-col">
        {/* Header */}
        <div className="agape-messenger-thread-header flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveChannelId(null)}
              className="w-10 h-10 flex items-center justify-center text-blue-600 rounded-full hover:bg-slate-100 transition"
              aria-label="Back to chat list"
            >
              <ArrowLeft size={20} strokeWidth={2.5} />
            </button>
            
            <div className="agape-messenger-avatar-wrap">
              <img src={getAvatarUrl(otherContact)} alt={formatDisplayName(otherContact)} className="agape-messenger-avatar" />
              <div className="agape-messenger-status-dot" />
            </div>

            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 truncate leading-tight">{formatDisplayName(otherContact)}</h3>
              <p className="text-[11px] font-semibold text-slate-500 capitalize">{otherContact.role || 'Driver'}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-blue-600">
            <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100"><Phone size={18} strokeWidth={2.2} /></button>
            <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100"><Video size={18} strokeWidth={2.2} /></button>
            <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100"><Info size={18} strokeWidth={2.2} /></button>
          </div>
        </div>

        {/* Messages Feed */}
        <div className="agape-messenger-thread-messages flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-white">
          <div className="agape-messenger-date-divider">Live Chat</div>
          
          {messages.map((msg, index) => {
            const isSent = msg.senderId === currentUser.id;
            return (
              <div key={msg.id || index} className={`agape-messenger-bubble-row ${isSent ? 'is-sent' : 'is-received'}`}>
                {!isSent && (
                  <img src={getAvatarUrl(otherContact)} alt={otherContact.name} className="agape-messenger-bubble-avatar" />
                )}
                <div className={`agape-messenger-bubble-group ${isSent ? 'is-sent' : 'is-received'}`}>
                  <div className="agape-messenger-bubble">
                    {msg.text}
                  </div>
                </div>
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* Composer Bar */}
        <div className="agape-messenger-composer border-t border-slate-100 bg-white px-4 py-3 flex items-center gap-3">
          <button className="text-blue-600 hover:text-blue-700 transition flex-shrink-0">
            <Plus size={20} strokeWidth={2.5} />
          </button>
          <button className="text-blue-600 hover:text-blue-700 transition flex-shrink-0">
            <Camera size={20} strokeWidth={2.2} />
          </button>
          <button className="text-blue-600 hover:text-blue-700 transition flex-shrink-0">
            <ImageIcon size={20} strokeWidth={2.2} />
          </button>

          <div className="agape-messenger-input-wrap flex-1 bg-slate-100 rounded-full px-4 py-2 flex items-center">
            <input
              type="text"
              placeholder="Aa"
              value={composerText}
              onChange={e => setComposerText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
            />
          </div>

          <div className="flex-shrink-0">
            {composerText.trim() ? (
              <button
                onClick={() => handleSend()}
                className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white hover:bg-blue-700 transition active:scale-90"
              >
                <Send size={14} strokeWidth={2.5} className="ml-0.5" />
              </button>
            ) : (
              <button
                onClick={() => handleSend('👍')}
                className="agape-messenger-like-btn text-blue-600 hover:text-blue-700 transition"
              >
                <ThumbsUp size={22} strokeWidth={2.2} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Chats List Screen (Messenger Home)
  return (
    <div className="agape-messenger-wrapper flex flex-col h-full bg-white relative">
      {/* Header */}
      <div className="px-4 pt-5 pb-2 flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="w-9 h-9 flex items-center justify-center text-slate-600 rounded-full hover:bg-slate-100 transition mr-1"
            >
              <ArrowLeft size={18} strokeWidth={2.5} />
            </button>
          )}
          <h1 className="text-2xl font-black text-slate-900 leading-none tracking-tight">Chats</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewChatModal(true)}
            className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-800 hover:bg-slate-200 transition"
            title="Start new chat"
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="agape-messenger-search-bar flex items-center bg-slate-100 rounded-full px-4 py-2 mx-4 my-2 shrink-0">
        <Search size={16} className="text-slate-400 mr-2 flex-shrink-0" />
        <input
          type="text"
          placeholder="Search"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="agape-messenger-stories flex gap-4 overflow-x-auto px-4 py-2 scrollbar-none border-b border-slate-100 bg-white shrink-0">
        {users.slice(0, 8).map(u => (
          <div
            key={u.id}
            onClick={() => startDirectChat(u)}
            className="agape-messenger-story flex flex-col items-center gap-1.5 flex-shrink-0 cursor-pointer"
          >
            <div className="agape-messenger-avatar-wrap">
              <img src={getAvatarUrl(u)} alt={formatDisplayName(u)} className="agape-messenger-avatar w-12 h-12 rounded-full object-cover" />
              <div className="agape-messenger-status-dot" />
            </div>
            <span className="text-[11px] font-semibold text-slate-500 truncate w-14 text-center">{formatDisplayName(u)}</span>
          </div>
        ))}
      </div>

      {/* Channels Feed */}
      <div className="agape-messenger-list flex-1 overflow-y-auto bg-white">
        {filteredChannels.map(ch => {
          const other = getOtherParticipant(ch);
          if (!other) return null;
          return (
            <div
              key={ch.id}
              onClick={() => setActiveChannelId(ch.id)}
              className="agape-messenger-row flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition border-b border-slate-50"
            >
              <div className="agape-messenger-avatar-wrap flex-shrink-0">
                <img src={getAvatarUrl(other)} alt={other.name} className="agape-messenger-avatar" />
                <div className="agape-messenger-status-dot" />
              </div>

              <div className="agape-messenger-row-content flex-1 min-w-0">
                <div className="agape-messenger-row-header flex justify-between items-baseline mb-0.5">
                  <span className="agape-messenger-row-name text-sm font-bold text-slate-900 truncate">{formatDisplayName(other)}</span>
                </div>
                <div className="agape-messenger-row-snippet text-xs text-slate-500 font-semibold flex items-center justify-between gap-2">
                  <span className="truncate">{ch.lastMessage?.text || 'No messages yet'}</span>
                </div>
              </div>
            </div>
          );
        })}

        {filteredChannels.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400">
            <MessageSquare size={36} className="opacity-20 mb-2" />
            <p className="text-sm font-semibold">No active chats</p>
            <p className="text-xs mt-1">Tap the "+" button or any active contact to start a conversation.</p>
          </div>
        )}
      </div>

      {/* Directory Modal */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-[300] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={() => setShowNewChatModal(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm max-h-[80vh] flex flex-col p-5 shadow-2xl relative animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4 shrink-0">
              <h3 className="text-sm font-bold text-slate-900">New Message</h3>
              <button onClick={() => setShowNewChatModal(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {filteredContacts.map(u => (
                <button
                  key={u.id}
                  onClick={() => {
                    startDirectChat(u);
                    setShowNewChatModal(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 bg-slate-50 hover:bg-blue-50 border border-slate-100 hover:border-blue-200 rounded-2xl text-left transition"
                >
                  <img src={getAvatarUrl(u)} alt={formatDisplayName(u)} className="w-9 h-9 rounded-full object-cover shrink-0" />
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-slate-900 truncate leading-tight">{formatDisplayName(u)}</h4>
                    <p className="text-[10px] text-slate-500 capitalize">{u.role || 'Driver'}</p>
                  </div>
                </button>
              ))}
              {filteredContacts.length === 0 && (
                <div className="text-center text-slate-400 text-xs py-8">No other users found in the system.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
