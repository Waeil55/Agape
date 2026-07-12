import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, ChevronLeft, ChevronRight, Folder, MessageCircle,
  MoreHorizontal, Radio, Search, Shield, Truck, User, Users, X,
  Info, Trash2, BellOff,
} from 'lucide-react';
import { useChat } from '../../hooks/useChat';
import ChatInput from './ChatInput';
import ChatMessages from './ChatMessages';
import { formatChatTime, getAvatarColor, getInitials } from '../../utils/chatHelpers';

const ROLE_ICONS = { admin: Shield, dispatcher: Radio, driver: Truck, user: User };
const normalizeEmail = (e) => String(e || '').trim().toLowerCase();

const getRoleColor = (role) => {
  switch (role) {
    case 'admin': return 'bg-purple-50 text-purple-700';
    case 'dispatcher': return 'bg-blue-50 text-blue-700';
    case 'driver': return 'bg-emerald-50 text-emerald-700';
    default: return 'bg-slate-100 text-slate-600';
  }
};

const getIsDesktopLayout = () => (
  typeof window !== 'undefined'
    ? window.matchMedia('(min-width: 768px)').matches
    : false
);

const ChatPage = ({ onBack, onThreadActiveChange }) => {
  const chat = useChat();
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileView, setMobileView] = useState('sidebar');
  const [isDesktopLayout, setIsDesktopLayout] = useState(getIsDesktopLayout);
  const [isAdminReviewExpanded, setIsAdminReviewExpanded] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(() => (
    typeof window !== 'undefined' ? window.innerHeight : 0
  ));
  const [pendingOpenChannelId, setPendingOpenChannelId] = useState('');
  const [showChannelMenu, setShowChannelMenu] = useState(false);
  const [channelMenuTarget, setChannelMenuTarget] = useState(null);
  const searchInputRef = useRef(null);
  const channelMenuRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQuery = window.matchMedia('(min-width: 768px)');
    const handleChange = () => setIsDesktopLayout(mediaQuery.matches);
    handleChange();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    onThreadActiveChange?.(mobileView === 'chat');
    return () => {
      onThreadActiveChange?.(false);
    };
  }, [mobileView, onThreadActiveChange]);

  useEffect(() => {
    window.isChatPageOpen = true;
    return () => {
      window.isChatPageOpen = false;
    };
  }, []);

  useEffect(() => {
    window.__agapeActiveChatChannel = chat.activeChannel || '';
    return () => {
      if (window.__agapeActiveChatChannel === chat.activeChannel) {
        window.__agapeActiveChatChannel = '';
      }
    };
  }, [chat.activeChannel]);

  useEffect(() => {
    if (!window.visualViewport) return undefined;
    const handleResize = () => {
      const vvHeight = window.visualViewport.height;
      setViewportHeight(vvHeight);
      const isKeyboard = vvHeight < window.innerHeight * 0.85;
      document.body.classList.toggle('keyboard-visible', isKeyboard);
      if (isKeyboard) window.scrollTo(0, 0);
    };
    handleResize();
    window.visualViewport.addEventListener('resize', handleResize);
    window.visualViewport.addEventListener('scroll', handleResize);
    return () => {
      window.visualViewport.removeEventListener('resize', handleResize);
      window.visualViewport.removeEventListener('scroll', handleResize);
      document.body.classList.remove('keyboard-visible');
    };
  }, []);

  useEffect(() => {
    if (!showChannelMenu) return undefined;
    const handleClickOutside = (e) => {
      if (channelMenuRef.current && !channelMenuRef.current.contains(e.target)) {
        setShowChannelMenu(false);
        setChannelMenuTarget(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showChannelMenu]);

  useEffect(() => {
    const storedChannel = sessionStorage.getItem('agape_open_chat_channel') || '';
    if (storedChannel) setPendingOpenChannelId(storedChannel);

    const handleOpenChat = (event) => {
      const channelId = event?.detail?.channelId || sessionStorage.getItem('agape_open_chat_channel') || '';
      if (channelId) setPendingOpenChannelId(channelId);
      setMobileView('chat');
    };

    window.addEventListener('agape:open-chat', handleOpenChat);
    return () => window.removeEventListener('agape:open-chat', handleOpenChat);
  }, []);

  useEffect(() => {
    if (chat.activeChannel && mobileView === 'sidebar') setMobileView('chat');
  }, [chat.activeChannel, mobileView]);

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
    ? `${chat.typingUsers[0]?.name || 'Someone'} is typing...`
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
    const activeDMs = conversations.filter(c => c.isCurrentUserParticipant);
    const recentEmails = new Set(activeDMs.flatMap(c => c.others || []));
    const otherEmployees = chat.employees.filter(
      emp => emp.email !== chat.currentUser.email && !recentEmails.has(emp.email)
    );
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
          .map(e => ({ type: 'person', data: e, key: `p_${e.email}` })),
      ];
    }

    return [
      ...activeDMs.map(c => ({ type: 'conversation', data: c, key: `c_${c.id}` })),
      ...otherEmployees
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(e => ({ type: 'person', data: e, key: `p_${e.email}` })),
    ];
  }, [conversations, chat.employees, chat.currentUser.email, searchQuery]);

  const openPerson = useCallback((employee) => {
    chat.openDM(employee.email, employee.name);
    setMobileView('chat');
  }, [chat]);

  const openConversation = useCallback((c) => {
    chat.openExistingDM(c);
    setMobileView('chat');
  }, [chat]);

  useEffect(() => {
    if (!pendingOpenChannelId) return;
    const conversation = conversations.find(item => item.id === pendingOpenChannelId);
    if (!conversation) return;
    openConversation(conversation);
    sessionStorage.removeItem('agape_open_chat_channel');
    setPendingOpenChannelId('');
  }, [conversations, openConversation, pendingOpenChannelId]);

  const handleBackToSidebar = useCallback(() => {
    setMobileView('sidebar');
    chat.setActiveChannel(null);
    chat.clearDMTarget();
  }, [chat]);

  const focusSearch = useCallback(() => {
    setMobileView('sidebar');
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  const renderAvatar = (email, name, size = 'w-10 h-10') => {
    const online = chat.onlineUsers.has(email);
    return (
      <div className="relative shrink-0">
        <div className={`${size} rounded-full ${getAvatarColor(email)} flex items-center justify-center text-white text-xs font-semibold`}>
          {getInitials(name)}
        </div>
        <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      </div>
    );
  };

  const ConversationRow = ({ conversation }) => {
    const active = chat.activeChannel === conversation.id;
    const senderIsCurrentUser = normalizeEmail(conversation.lastMessageBy) === chat.currentUser.email;
    const preview = conversation.lastMessage
      ? `${senderIsCurrentUser ? 'You: ' : ''}${conversation.lastMessage}`
      : conversation.subtitle || 'No messages yet';
    return (
      <button
        type="button"
        onClick={() => openConversation(conversation)}
        className={`agape-chat-list-row ${active ? 'is-active' : ''} ${conversation.unread > 0 ? 'is-unread' : ''}`}
      >
        {renderAvatar(conversation.others[0] || conversation.participants[0], conversation.title)}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={`truncate text-[15px] ${conversation.unread > 0 ? 'font-semibold text-slate-950' : 'font-semibold text-slate-900'}`}>
              {conversation.title}
            </p>
            {conversation.isAdminReview && (
              <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Review</span>
            )}
          </div>
          <p className={`mt-0.5 truncate text-xs ${conversation.unread > 0 ? 'font-semibold text-slate-800' : 'text-slate-500'}`}>
            {preview}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {conversation.lastMessageAt && (
            <span className="text-[10px] font-medium text-slate-400">{formatChatTime(conversation.lastMessageAt)}</span>
          )}
          {conversation.unread > 0 && (
            <span className="chat-unread-badge flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white badge-pulse shadow-[0_0_6px_rgba(37,99,235,0.35)]">
              {conversation.unread > 99 ? '99+' : conversation.unread}
            </span>
          )}
        </div>
      </button>
    );
  };

  const PersonRow = ({ employee }) => {
    const conversation = ownConversationByEmail.get(employee.email);
    const unread = conversation?.unread || 0;
    const RoleIcon = ROLE_ICONS[employee.role] || User;
    return (
      <button
        type="button"
        onClick={() => openPerson(employee)}
        className={`agape-chat-list-row ${chat.activeChannel === conversation?.id ? 'is-active' : ''} ${unread > 0 ? 'is-unread' : ''}`}
      >
        {renderAvatar(employee.email, employee.name)}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={`truncate text-[15px] ${unread > 0 ? 'font-semibold text-slate-950' : 'font-semibold text-slate-900'}`}>
              {employee.name}
            </p>
            <span className={`agape-chat-role-badge inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${getRoleColor(employee.role)}`}>
              <RoleIcon size={10} />
              {employee.role || 'user'}
            </span>
          </div>
          <p className={`mt-0.5 truncate text-xs ${unread > 0 ? 'font-semibold text-slate-700' : 'text-slate-500'}`}>
            {conversation?.lastMessage || employee.email}
          </p>
        </div>
        {unread > 0 && (
          <span className="chat-unread-badge flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white badge-pulse shadow-[0_0_6px_rgba(37,99,235,0.35)]">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    );
  };

  const renderSidebar = () => (
    <div className="agape-chat-sidebar flex h-full w-full min-h-0 flex-col">
      {/* Desktop Header */}
      <div className="hidden md:block agape-chat-sidebar-header shrink-0 bg-white border-b border-slate-100">
        <div className="flex items-center gap-2 px-4 pt-4 pb-3 md:pt-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors"
            >
              <ChevronLeft size={22} />
            </button>
          )}
          <h1 className="text-[22px] font-semibold text-slate-950 tracking-tight flex-1 flex items-center gap-2">
            Messages
            {chat.totalUnread > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white leading-none">
                {chat.totalUnread > 99 ? '99+' : chat.totalUnread}
              </span>
            )}
          </h1>
        </div>
      </div>

      <div className="agape-chat-mobile-list-header md:hidden">
        <div className="min-w-0 flex-1">
          <h1>Messages</h1>
          <p>{unifiedChatList.length} conversations</p>
        </div>
        {chat.totalUnread > 0 && (
          <span className="chat-unread-badge flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[11px] font-bold text-white">
            {chat.totalUnread > 99 ? '99+' : chat.totalUnread}
          </span>
        )}
      </div>

      {/* Search Input (Shared) */}
      <div className="agape-chat-search-section shrink-0">
        <label className="agape-chat-search-field">
          <Search size={16} className="shrink-0 text-slate-400" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search people..."
            className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-slate-800 outline-none placeholder:text-slate-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          )}
        </label>
      </div>

      <div className="agape-chat-list min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {chat.loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          </div>
        )}

        {chat.currentUser.isAdmin && adminReviewConversations.length > 0 && (
          <div className="border-b border-slate-100/50 pb-1">
            <button
              type="button"
              onClick={() => setIsAdminReviewExpanded(prev => !prev)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Folder size={18} className="text-amber-500 fill-amber-50" />
                <span className="text-sm font-semibold text-slate-700">Admin Review</span>
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

        <div className="agape-chat-list-stack">
          {unifiedChatList.map(item => (
            item.type === 'conversation'
              ? <ConversationRow key={item.key} conversation={item.data} />
              : <PersonRow key={item.key} employee={item.data} />
          ))}
        </div>

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

  const renderChatArea = () => {
    if (!chat.activeChannel) return renderEmptyState();
    return (
      <div className="agape-chat-conversation flex h-full w-full min-h-0 flex-col bg-white">
        <div className="agape-chat-header shrink-0 bg-white border-b border-slate-200/80 px-3">
          <div className="agape-chat-header-inner flex items-center gap-2">
            <button
              type="button"
              onClick={handleBackToSidebar}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 active:bg-slate-200 md:hidden transition-colors relative"
              aria-label="Back"
            >
              <ChevronLeft size={24} />
              {chat.totalUnread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white leading-none">
                  {chat.totalUnread > 99 ? '99+' : chat.totalUnread}
                </span>
              )}
            </button>

            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="relative shrink-0">
                <div className={`w-10 h-10 rounded-full ${getAvatarColor(activeStatusEmail)} flex items-center justify-center text-white font-semibold text-sm`}>
                  {getInitials(activeTitle)}
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 w-[13px] h-[13px] rounded-full border-2 border-white ${isActiveOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[16px] font-semibold text-slate-950 truncate leading-tight">{activeTitle}</p>
                <p className={`text-[12px] font-medium truncate ${isTyping ? 'text-blue-500' : isActiveOnline ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {typingLabel}
                </p>
              </div>
            </div>

            <button
              onClick={focusSearch}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 active:bg-slate-200 transition-colors"
              aria-label="Search"
            >
              <Search size={19} />
            </button>
            <div className="relative" ref={channelMenuRef}>
              <button
                onClick={() => {
                  const target = {
                    channelId: chat.activeChannel,
                    channel: chat.channels.find(c => c.id === chat.activeChannel),
                    target: chat.activeDMTarget,
                  };
                  setChannelMenuTarget(target);
                  setShowChannelMenu(!showChannelMenu);
                }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 active:bg-slate-200 transition-colors"
                aria-label="More options"
              >
                <MoreHorizontal size={19} />
              </button>
              {showChannelMenu && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-2xl border border-slate-200 shadow-xl py-1.5 z-50">
                  <button
                    onClick={() => { focusSearch(); setShowChannelMenu(false); }}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Search size={16} className="text-slate-400" />
                    Search Messages
                  </button>
                  {channelMenuTarget?.channel && (
                    <>
                      <button
                        onClick={() => {
                          const ch = channelMenuTarget.channel;
                          const info = getConversationPeople(ch);
                          alert(`Channel: ${info.title}\nParticipants: ${info.subtitle}\nType: ${ch.type || 'dm'}`);
                          setShowChannelMenu(false);
                        }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <Info size={16} className="text-slate-400" />
                        Channel Info
                      </button>
                      <button
                        onClick={() => {
                          chat.muteChannel?.(channelMenuTarget.channelId);
                          setShowChannelMenu(false);
                        }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <BellOff size={16} className="text-slate-400" />
                        Mute Notifications
                      </button>
                      <div className="h-px bg-slate-100 my-1" />
                      <button
                        onClick={() => {
                          if (window.confirm('Clear all messages in this conversation?')) {
                            chat.clearChannel?.(channelMenuTarget.channelId);
                          }
                          setShowChannelMenu(false);
                        }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 size={16} className="text-rose-400" />
                        Clear Conversation
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {chat.loadingMessages && chat.messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center bg-[#f6f8fb]">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 rounded-full border-[3px] border-blue-500 border-t-transparent animate-spin" />
              <p className="text-sm text-slate-400 font-medium">Loading messages...</p>
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
            style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))' }}
          >
            Read only - you are reviewing this conversation
          </div>
        )}
      </div>
    );
  };

  const renderEmptyState = () => (
    <div className="flex h-full items-center justify-center bg-slate-50 flex-col gap-4 p-8 text-center">
      <div className="w-24 h-24 rounded-full bg-blue-50 flex items-center justify-center shadow-inner">
        <MessageCircle size={40} className="text-blue-400" />
      </div>
      <div>
        <p className="text-xl font-semibold text-slate-700">Your Messages</p>
        <p className="text-sm text-slate-400 mt-1">Select a conversation or start a new one</p>
      </div>
    </div>
  );

  return (
    <div
      className={`agape-chat-page flex h-full w-full min-h-0 bg-[#f6f8fb] ${mobileView === 'chat' ? 'agape-chat-page-conversation-active' : ''}`}
      style={{ '--agape-chat-viewport-height': `${viewportHeight}px` }}
    >
      {isDesktopLayout ? (
        <div className="grid h-full min-h-0 w-full grid-cols-[360px_minmax(0,1fr)]">
          <div className="min-h-0 border-r border-slate-200">{renderSidebar()}</div>
          <div className="min-h-0">
            {chat.activeChannel ? renderChatArea() : renderEmptyState()}
          </div>
        </div>
      ) : (
        <div className="flex h-full min-h-0 w-full">
          {mobileView === 'sidebar' ? renderSidebar() : renderChatArea()}
        </div>
      )}
    </div>
  );
};

export default ChatPage;
