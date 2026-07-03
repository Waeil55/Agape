import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown, ChevronLeft, ChevronRight, Folder, MessageCircle,
  Radio, Search, Shield, Truck, User, Users, X,
} from 'lucide-react';
import { useChat } from '../../hooks/useChat';
import ChatInput from './ChatInput';
import ChatMessages from './ChatMessages';
import { formatChatTime, getAvatarColor, getInitials } from '../../utils/chatHelpers';

const ROLE_ORDER = ['admin', 'dispatcher', 'driver', 'user'];
const ROLE_LABELS = { admin: 'Admins', dispatcher: 'Dispatchers', driver: 'Drivers', user: 'Users' };
const ROLE_ICONS = { admin: Shield, dispatcher: Radio, driver: Truck, user: User };
const normalizeEmail = (e) => String(e || '').trim().toLowerCase();

const ChatPage = ({ onBack }) => {
  const chat = useChat();
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileView, setMobileView] = useState('sidebar'); // 'sidebar' | 'chat'
  const [isAdminReviewExpanded, setIsAdminReviewExpanded] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);

  useEffect(() => {
    window.isChatPageOpen = true;
    return () => {
      window.isChatPageOpen = false;
    };
  }, []);

  useEffect(() => {
    if (!window.visualViewport) return;
    const handleResize = () => {
      const vvHeight = window.visualViewport.height;
      setViewportHeight(vvHeight);
      const isKeyboard = vvHeight < window.innerHeight * 0.85;
      document.body.classList.toggle('keyboard-visible', isKeyboard);
      
      if (isKeyboard) {
        window.scrollTo(0, 0);
        if (document.body) document.body.scrollTop = 0;
      }
    };

    const handleWindowScroll = () => {
      if (document.body.classList.contains('keyboard-visible')) {
        window.scrollTo(0, 0);
        if (document.body) document.body.scrollTop = 0;
      }
    };

    handleResize();
    window.visualViewport.addEventListener('resize', handleResize);
    window.visualViewport.addEventListener('scroll', handleResize);
    window.addEventListener('scroll', handleWindowScroll);
    return () => {
      window.visualViewport.removeEventListener('resize', handleResize);
      window.visualViewport.removeEventListener('scroll', handleResize);
      window.removeEventListener('scroll', handleWindowScroll);
      document.body.classList.remove('keyboard-visible');
    };
  }, []);

  // Auto-switch to chat view when a channel opens
  useEffect(() => {
    if (chat.activeChannel && mobileView === 'sidebar') setMobileView('chat');
  }, [chat.activeChannel]); // eslint-disable-line

  // ─── Derived data ────────────────────────────────────────────────────
  const employeeByEmail = useMemo(() => {
    const map = new Map();
    chat.employees.forEach((e) => map.set(e.email, e));
    return map;
  }, [chat.employees]);

  const getConversationPeople = useCallback((channel) => {
    const participants = (channel?.dmParticipants || channel?.participantIds || []).map(normalizeEmail).filter(Boolean);
    const others = participants.filter(e => e !== chat.currentUser.email);
    const displayEmails = others.length > 0 ? others : participants;
    const names = displayEmails.map((e) => employeeByEmail.get(e)?.name || e.split('@')[0]);
    return {
      participants,
      others,
      title: names.join(' + ') || channel?.name || 'Conversation',
      subtitle: displayEmails.join(' + '),
      isCurrentUserParticipant: participants.includes(chat.currentUser.email),
    };
  }, [chat.currentUser.email, employeeByEmail]);

  const conversations = useMemo(() => (
    chat.channels.filter(c => c.isDM).map((channel) => {
      const people = getConversationPeople(channel);
      return {
        ...channel,
        ...people,
        unread: chat.unreadCounts[channel.id] || 0,
        isAdminReview: chat.currentUser.isAdmin && !people.isCurrentUserParticipant,
      };
    })
  ), [chat.channels, chat.currentUser.isAdmin, chat.unreadCounts, getConversationPeople]);

  const ownConversationByEmail = useMemo(() => {
    const map = new Map();
    conversations.filter(c => c.isCurrentUserParticipant).forEach((c) => {
      c.others.forEach(e => map.set(e, c));
    });
    return map;
  }, [conversations]);

  const activeConversation = useMemo(
    () => conversations.find(c => c.id === chat.activeChannel) || null,
    [chat.activeChannel, conversations]
  );
  const activeTitle = chat.activeDMTarget?.name || activeConversation?.title || 'Messages';
  const activeStatusEmail = chat.activeDMTarget?.email || activeConversation?.others?.[0] || '';
  const isActiveOnline = chat.onlineUsers.has(activeStatusEmail);
  const canSend = activeConversation
    ? activeConversation.isCurrentUserParticipant
    : chat.activeDMTarget?.isCurrentUserParticipant !== false;
  const isTyping = chat.typingUsers.length > 0;
  const typingLabel = isTyping
    ? `${chat.typingUsers[0]?.name || 'Someone'} is typing…`
    : isActiveOnline ? 'Online' : 'Offline';

  const adminReviewConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return conversations.filter(c =>
      c.isAdminReview && (!q || c.title.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q))
    );
  }, [conversations, searchQuery]);

  const adminReviewUnreadCount = useMemo(() => {
    return adminReviewConversations.reduce((sum, c) => sum + (c.unread || 0), 0);
  }, [adminReviewConversations]);

  const unifiedChatList = useMemo(() => {
    // 1. Get all active DMs (show even if no messages yet — user just opened the DM)
    const activeDMs = conversations.filter(c => c.isCurrentUserParticipant);
    
    // 2. Get emails of people we already have an active conversation with
    const recentEmails = new Set(
      activeDMs.flatMap(c => c.others || [])
    );
    
    // 3. Get all other employees (who don't have active chats yet)
    const otherEmployees = chat.employees.filter(
      emp => emp.email !== chat.currentUser.email && !recentEmails.has(emp.email)
    );
    
    // Apply search filter if query exists
    const q = searchQuery.trim().toLowerCase();
    
    if (q) {
      const filteredRecent = activeDMs.filter(
        c => c.title.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q)
      );
      
      const filteredOthers = otherEmployees.filter(
        e => e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q)
      );
      
      return [
        ...filteredRecent.map(c => ({ type: 'conversation', data: c, key: `c_${c.id}` })),
        ...filteredOthers
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(e => ({ type: 'person', data: e, key: `p_${e.email}` }))
      ];
    }
    
    // If no search, return active conversations first, then other employees alphabetically
    return [
      ...activeDMs.map(c => ({ type: 'conversation', data: c, key: `c_${c.id}` })),
      ...otherEmployees
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(e => ({ type: 'person', data: e, key: `p_${e.email}` }))
    ];
  }, [conversations, chat.employees, chat.currentUser.email, searchQuery]);

  // ─── Actions ─────────────────────────────────────────────────────────
  const openPerson = useCallback((employee) => {
    chat.openDM(employee.email, employee.name);
    setMobileView('chat');
  }, [chat]);

  const openConversation = useCallback((c) => {
    chat.openExistingDM(c);
    setMobileView('chat');
  }, [chat]);

  const handleGoBackToSidebar = useCallback(() => {
    setMobileView('sidebar');
    chat.setActiveChannel(null);
  }, [chat]);

  // ─── Sub-components ───────────────────────────────────────────────────
  const ConversationRow = ({ conversation }) => {
    const active = chat.activeChannel === conversation.id;
    const personOnline = chat.onlineUsers.has(conversation.others[0]);
    return (
      <button
        type="button"
        onClick={() => openConversation(conversation)}
        className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 ${active ? 'bg-blue-50' : 'hover:bg-slate-50 active:bg-slate-100'}`}
      >
        <div className="relative shrink-0">
          <div className={`w-[54px] h-[54px] rounded-full ${getAvatarColor(conversation.others[0] || conversation.participants[0])} flex items-center justify-center text-white font-bold`}>
            {getInitials(conversation.title)}
          </div>
          <span className={`absolute -bottom-0.5 -right-0.5 w-[15px] h-[15px] rounded-full border-[2.5px] border-white ${personOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between mb-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <p className={`truncate text-[16px] leading-snug ${conversation.unread > 0 ? 'font-bold text-slate-950' : 'font-semibold text-slate-800'}`}>
                {conversation.title}
              </p>
              {conversation.unread > 0 && (
                <span className="badge-messenger badge-pop shrink-0">
                  {conversation.unread > 99 ? '99+' : conversation.unread}
                </span>
              )}
            </div>
            {conversation.lastMessageAt && (
              <span className="text-[12px] text-slate-400 shrink-0 ml-2">{formatChatTime(conversation.lastMessageAt)}</span>
            )}
          </div>
          <p className={`truncate text-[14px] leading-snug ${conversation.unread > 0 ? 'font-medium text-slate-600' : 'text-slate-400'}`}>
            {conversation.lastMessage || conversation.subtitle || 'No messages yet'}
          </p>
        </div>
      </button>
    );
  };

  const PersonRow = ({ employee }) => {
    const conversation = ownConversationByEmail.get(employee.email);
    const unread = conversation?.unread || 0;
    const online = chat.onlineUsers.has(employee.email);
    return (
      <button
        type="button"
        onClick={() => openPerson(employee)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors"
      >
        <div className="relative shrink-0">
          <div className={`w-[54px] h-[54px] rounded-full ${getAvatarColor(employee.email)} flex items-center justify-center text-white font-bold`}>
            {getInitials(employee.name)}
          </div>
          <span className={`absolute -bottom-0.5 -right-0.5 w-[15px] h-[15px] rounded-full border-[2.5px] border-white ${online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <p className={`truncate text-[16px] leading-snug ${unread > 0 ? 'font-bold text-slate-950' : 'font-semibold text-slate-800'}`}>
                {employee.name}
              </p>
              {unread > 0 && (
                <span className="badge-messenger badge-pop shrink-0">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </div>
          </div>
          <p className="text-[13px] text-slate-400 truncate mt-0.5 flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            {online ? 'Online' : 'No messages yet'}
          </p>
        </div>
      </button>
    );
  };

  // ─── Sidebar ──────────────────────────────────────────────────────────
  const renderSidebar = () => (
    <div className="flex h-full w-full min-h-0 flex-col bg-white">
      {/* Header — hidden on mobile */}
      <div
        className="hidden md:block shrink-0 bg-white border-b border-slate-100"
      >
        <div className="flex items-center gap-2 px-4 py-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 active:bg-slate-200 md:hidden transition-colors"
            >
              <ChevronLeft size={24} />
            </button>
          )}
          <h1 className="text-[22px] font-bold text-slate-950 tracking-tight flex-1 flex items-center gap-2">
            Messages
            {chat.totalUnread > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white leading-none">
                {chat.totalUnread > 99 ? '99+' : chat.totalUnread}
              </span>
            )}
          </h1>
        </div>
        {/* Search bar */}
        <div className="px-4 pb-3 pt-3 md:pt-0">
          <label className="flex h-[42px] items-center gap-2.5 rounded-2xl bg-slate-100 px-3.5 cursor-text">
            <Search size={16} className="shrink-0 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search people…"
              className="min-w-0 flex-1 bg-transparent text-[16px] font-medium text-slate-800 outline-none placeholder:text-slate-400"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={16} />
              </button>
            )}
          </label>
        </div>
      </div>

      {/* Content */}
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {/* Loading spinner */}
        {chat.loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          </div>
        )}

        {/* Admin review collapsible folder */}
        {chat.currentUser.isAdmin && adminReviewConversations.length > 0 && (
          <div className="border-b border-slate-100/50 pb-1">
            <button
              type="button"
              onClick={() => setIsAdminReviewExpanded(prev => !prev)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Folder size={18} className="text-amber-500 fill-amber-50" />
                <span className="text-sm font-bold text-slate-700">Admin Review</span>
                <span className="text-xs font-semibold text-slate-400">({adminReviewConversations.length})</span>
              </div>
              <div className="flex items-center gap-2">
                {adminReviewUnreadCount > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white leading-none">
                    {adminReviewUnreadCount > 99 ? '99+' : adminReviewUnreadCount}
                  </span>
                )}
                {isAdminReviewExpanded ? (
                  <ChevronDown size={16} className="text-slate-400" />
                ) : (
                  <ChevronRight size={16} className="text-slate-400" />
                )}
              </div>
            </button>
            {isAdminReviewExpanded && (
              <div className="bg-slate-50/30 pl-2 border-l-2 border-slate-200">
                {adminReviewConversations.map(c => <ConversationRow key={c.id} conversation={c} />)}
              </div>
            )}
          </div>
        )}

        {/* Unified conversation and contacts list */}
        <div className="divide-y divide-slate-100/50">
          {unifiedChatList.map(item => {
            if (item.type === 'conversation') {
              return <ConversationRow key={item.key} conversation={item.data} />;
            } else {
              return <PersonRow key={item.key} employee={item.data} />;
            }
          })}
        </div>

        {/* Empty state */}
        {!chat.loading && unifiedChatList.length === 0 && adminReviewConversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
              <Users size={28} />
            </div>
            <p className="text-sm font-semibold text-slate-600">No people found</p>
            <p className="text-xs text-slate-400 mt-1">Try a different search term</p>
          </div>
        )}
      </div>
    </div>
  );

  // ─── Chat area ────────────────────────────────────────────────────────
  const renderChatArea = () => (
    <div className="flex h-full w-full min-h-0 flex-col">
      {/* Conversation Header */}
      <div
        className="shrink-0 bg-white border-b border-slate-100"
      >
        <div className="flex items-center gap-2 px-2 h-[60px]">
          {/* Back button */}
          <button
            type="button"
            onClick={handleGoBackToSidebar}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 active:bg-slate-200 md:hidden transition-colors relative"
          >
            <ChevronLeft size={24} />
            {chat.totalUnread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white leading-none">
                {chat.totalUnread > 99 ? '99+' : chat.totalUnread}
              </span>
            )}
          </button>

          {/* Avatar + name */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative shrink-0">
              <div className={`w-10 h-10 rounded-full ${getAvatarColor(activeStatusEmail)} flex items-center justify-center text-white font-bold text-sm`}>
                {getInitials(activeTitle)}
              </div>
              <span className={`absolute -bottom-0.5 -right-0.5 w-[13px] h-[13px] rounded-full border-2 border-white ${isActiveOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            </div>
            <div className="min-w-0">
              <p className="text-[16px] font-bold text-slate-950 truncate leading-tight">{activeTitle}</p>
              <p className={`text-[12px] font-medium truncate ${isTyping ? 'text-blue-500' : isActiveOnline ? 'text-emerald-600' : 'text-slate-400'}`}>
                {typingLabel}
              </p>
            </div>
          </div>

          </div>
      </div>

      {/* Messages area — THE CRITICAL FIX: ChatMessages now actually renders here */}
      {chat.loadingMessages && chat.messages.length === 0 ? (
        <div className="flex flex-1 items-center justify-center bg-[#f0f2f5]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-[3px] border-blue-500 border-t-transparent animate-spin" />
            <p className="text-sm text-slate-400 font-medium">Loading messages…</p>
          </div>
        </div>
      ) : (
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
      )}

      {/* Input / Read-only */}
      {canSend ? (
        <ChatInput
          onSend={(text, extra) => chat.sendMessage(chat.activeChannel, text, extra)}
          onTyping={() => chat.setTyping(chat.activeChannel, true)}
          onStopTyping={() => chat.setTyping(chat.activeChannel, false)}
          channelName={activeTitle}
          currentUser={chat.currentUser}
        />
      ) : (
        <div
          className="shrink-0 bg-white border-t border-slate-200 px-4 py-3 text-center text-xs font-semibold text-slate-500"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        >
          👁 Read only — you are reviewing this conversation
        </div>
      )}
    </div>
  );

  // ─── Empty conversation placeholder (desktop) ─────────────────────────
  const renderEmptyState = () => (
    <div className="flex h-full items-center justify-center bg-slate-50 flex-col gap-4 p-8 text-center">
      <div className="w-24 h-24 rounded-full bg-blue-50 flex items-center justify-center shadow-inner">
        <MessageCircle size={40} className="text-blue-400" />
      </div>
      <div>
        <p className="text-xl font-bold text-slate-700">Your Messages</p>
        <p className="text-sm text-slate-400 mt-1">Select a conversation or start a new one</p>
      </div>
    </div>
  );

  // ─── Main render ──────────────────────────────────────────────────────
  return (
    <div
      className={`agape-chat-page flex h-full w-full min-h-0 bg-white ${mobileView === 'chat' ? 'agape-chat-page-conversation-active' : ''}`}
      style={mobileView === 'chat' && window.innerWidth < 768 ? { height: `${viewportHeight}px` } : {}}
    >
      {/* Desktop: 2-column grid */}
      <div className="hidden h-full min-h-0 w-full md:grid md:grid-cols-[360px_minmax(0,1fr)]">
        <div className="min-h-0 border-r border-slate-200">{renderSidebar()}</div>
        <div className="min-h-0">
          {chat.activeChannel ? renderChatArea() : renderEmptyState()}
        </div>
      </div>

      {/* Mobile: single-column, toggle between sidebar and chat */}
      <div className="flex h-full min-h-0 w-full md:hidden">
        {mobileView === 'sidebar' ? renderSidebar() : renderChatArea()}
      </div>
    </div>
  );
};

export default ChatPage;
