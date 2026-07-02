import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ChevronLeft, MessageCircle, MoreHorizontal, Radio, Search, Shield,
  Truck, User, Users, X,
} from 'lucide-react';
import { useChat } from '../../hooks/useChat';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';
import { formatChatTime, getAvatarColor, getInitials, getRoleColor } from '../../utils/chatHelpers';

const ROLE_ORDER = ['admin', 'dispatcher', 'driver', 'user'];
const ROLE_LABELS = { admin: 'Admins', dispatcher: 'Dispatchers', driver: 'Drivers', user: 'Users' };
const ROLE_ICONS = { admin: Shield, dispatcher: Radio, driver: Truck, user: User };

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const ChatPage = ({ onBack }) => {
  const chat = useChat();
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileView, setMobileView] = useState('sidebar');
  const [pendingOpenChannelId, setPendingOpenChannelId] = useState('');
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (chat.activeChannel && mobileView === 'sidebar') {
      setMobileView('chat');
    }
  }, [chat.activeChannel]);

  useEffect(() => {
    window.__agapeActiveChatChannel = chat.activeChannel || '';
    return () => {
      if (window.__agapeActiveChatChannel === chat.activeChannel) {
        window.__agapeActiveChatChannel = '';
      }
    };
  }, [chat.activeChannel]);

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

  const employeeByEmail = useMemo(() => {
    const map = new Map();
    chat.employees.forEach((employee) => map.set(employee.email, employee));
    return map;
  }, [chat.employees]);

  const getConversationPeople = useCallback((channel) => {
    const participants = (channel?.dmParticipants || channel?.participantIds || [])
      .map(normalizeEmail)
      .filter(Boolean);
    const others = participants.filter(email => email !== chat.currentUser.email);
    const displayEmails = others.length > 0 ? others : participants;
    const names = displayEmails.map((email) => employeeByEmail.get(email)?.name || email.split('@')[0]);
    return {
      participants,
      others,
      title: names.join(' + ') || channel?.name || 'Conversation',
      subtitle: displayEmails.join(' + '),
      isCurrentUserParticipant: participants.includes(chat.currentUser.email),
    };
  }, [chat.currentUser.email, employeeByEmail]);

  const conversations = useMemo(() => (
    chat.channels
      .filter(channel => channel.isDM)
      .map((channel) => {
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
    conversations
      .filter(c => c.isCurrentUserParticipant)
      .forEach((c) => { c.others.forEach(email => map.set(email, c)); });
    return map;
  }, [conversations]);

  const activeConversation = useMemo(() => (
    conversations.find(c => c.id === chat.activeChannel) || null
  ), [chat.activeChannel, conversations]);

  const activeTitle = chat.activeDMTarget?.name || activeConversation?.title || 'Messages';
  const activeSubtitle = activeConversation?.isAdminReview
    ? activeConversation.subtitle
    : chat.activeDMTarget?.email || activeConversation?.subtitle || '';
  const activeStatusEmail = chat.activeDMTarget?.email || activeConversation?.others?.[0] || '';
  const isOnline = chat.onlineUsers.has(activeStatusEmail);
  const canSendInActiveChannel = activeConversation
    ? activeConversation.isCurrentUserParticipant
    : chat.activeDMTarget?.isCurrentUserParticipant !== false;

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return chat.employees
      .filter((e) => {
        if (!q) return true;
        return e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q) ||
          String(e.role || '').toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const roleDiff = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
        if (roleDiff !== 0) return roleDiff;
        return a.name.localeCompare(b.name);
      });
  }, [chat.employees, searchQuery]);

  const groupedEmployees = useMemo(() => {
    const groups = new Map();
    filteredEmployees.forEach((employee) => {
      const role = ROLE_ORDER.includes(employee.role) ? employee.role : 'user';
      if (!groups.has(role)) groups.set(role, []);
      groups.get(role).push(employee);
    });
    return ROLE_ORDER
      .filter(role => groups.has(role))
      .map(role => ({ role, employees: groups.get(role) }));
  }, [filteredEmployees]);

  const adminReviewConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return conversations.filter((c) => {
      if (!c.isAdminReview) return false;
      if (!q) return true;
      return c.title.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q) ||
        String(c.lastMessage || '').toLowerCase().includes(q);
    });
  }, [conversations, searchQuery]);

  const recentConversations = useMemo(() => (
    conversations.filter(c => c.isCurrentUserParticipant && (c.lastMessage || c.unread > 0))
  ), [conversations]);

  const openPerson = useCallback((employee) => {
    chat.openDM(employee.email, employee.name);
    setMobileView('chat');
  }, [chat]);

  const openConversation = useCallback((conversation) => {
    chat.openExistingDM(conversation);
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
    chat.setActiveChannel(null);
    chat.clearDMTarget();
    setMobileView('sidebar');
  }, [chat]);

  const focusSearch = useCallback(() => {
    setMobileView('sidebar');
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  const renderAvatar = (email, name, size = 'w-10 h-10') => {
    const online = chat.onlineUsers.has(email);
    return (
      <div className="relative shrink-0">
        <div className={`${size} rounded-full ${getAvatarColor(email)} flex items-center justify-center text-white text-xs font-bold`}>
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
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
          active ? 'bg-blue-50' : 'hover:bg-slate-50 active:bg-slate-100'
        }`}
      >
        {renderAvatar(conversation.others[0] || conversation.participants[0], conversation.title)}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={`truncate text-[15px] ${conversation.unread > 0 ? 'font-bold text-slate-950' : 'font-semibold text-slate-900'}`}>
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
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
          chat.activeChannel === conversation?.id ? 'bg-blue-50' : 'hover:bg-slate-50 active:bg-slate-100'
        }`}
      >
        {renderAvatar(employee.email, employee.name)}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={`truncate text-[15px] ${unread > 0 ? 'font-bold text-slate-950' : 'font-semibold text-slate-900'}`}>
              {employee.name}
            </p>
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${getRoleColor(employee.role)}`}>
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

  const SectionHeader = ({ children }) => (
    <div className="px-4 pb-1 pt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
      {children}
    </div>
  );

  const renderSidebar = () => (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="shrink-0 border-b border-slate-200/80 bg-white px-4 pt-[env(safe-area-inset-top)] pb-1">
        <div className="flex items-center gap-3 py-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 active:bg-slate-200 transition-colors md:hidden"
              aria-label="Back"
            >
              <ChevronLeft size={22} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-slate-950 tracking-tight">Messages</h1>
            <p className="text-xs font-medium text-slate-500 mt-0.5">{chat.currentUser.name}</p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <MessageCircle size={20} />
          </div>
        </div>

        <label className="flex h-11 items-center gap-2.5 rounded-2xl bg-slate-100 px-4 mb-3">
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

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
        {recentConversations.length > 0 && (
          <>
            <SectionHeader>Recent</SectionHeader>
            {recentConversations.map(conversation => (
              <ConversationRow key={conversation.id} conversation={conversation} />
            ))}
          </>
        )}

        {chat.currentUser.isAdmin && adminReviewConversations.length > 0 && (
          <>
            <SectionHeader>Admin Review</SectionHeader>
            {adminReviewConversations.map(conversation => (
              <ConversationRow key={conversation.id} conversation={conversation} />
            ))}
          </>
        )}

        {groupedEmployees.map(({ role, employees }) => {
          const Icon = ROLE_ICONS[role] || Users;
          return (
            <div key={role}>
              <SectionHeader>
                <span className="inline-flex items-center gap-1.5">
                  <Icon size={12} />
                  {ROLE_LABELS[role] || 'Users'}
                </span>
              </SectionHeader>
              {employees.map(employee => (
                <PersonRow key={employee.email} employee={employee} />
              ))}
            </div>
          );
        })}

        {!chat.loading && filteredEmployees.length === 0 && adminReviewConversations.length === 0 && (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Users size={22} />
            </div>
            <p className="text-sm font-semibold text-slate-700">No people found</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderChatArea = () => (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {chat.activeChannel ? (
        <>
          <div
            className="agape-chat-header shrink-0 bg-white border-b border-slate-200/80 px-3 pt-[env(safe-area-inset-top)]"
          >
            <div className="flex items-center gap-3 h-[60px]">
              <button
                type="button"
                onClick={handleBackToSidebar}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 active:bg-slate-200 transition-colors md:hidden"
                aria-label="Back to messages"
              >
                <ArrowLeft size={20} />
              </button>

              {renderAvatar(activeStatusEmail || activeTitle, activeTitle)}
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[16px] font-bold text-slate-950 leading-tight">{activeTitle}</h2>
                <p className="truncate text-xs font-medium mt-0.5">
                  {activeConversation?.isAdminReview ? (
                    <span className="text-slate-500">{activeSubtitle}</span>
                  ) : isOnline ? (
                    <span className="text-emerald-600">Online</span>
                  ) : (
                    <span className="text-slate-400">{activeSubtitle || 'Offline'}</span>
                  )}
                </p>
              </div>
              <button
                onClick={focusSearch}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 active:bg-slate-200 transition-colors"
                aria-label="Search"
              >
                <Search size={19} />
              </button>
              <button
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 active:bg-slate-200 transition-colors"
                aria-label="More options"
              >
                <MoreHorizontal size={19} />
              </button>
            </div>
          </div>

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

          {canSendInActiveChannel ? (
            <ChatInput
              onSend={(text, extra) => chat.sendMessage(chat.activeChannel, text, extra)}
              onTyping={() => chat.setTyping(chat.activeChannel, true)}
              onStopTyping={() => chat.setTyping(chat.activeChannel, false)}
              channelName={activeTitle}
              currentUser={chat.currentUser}
            />
          ) : (
            <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 text-center text-xs font-semibold text-slate-500"
                 style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
              Read only
            </div>
          )}
        </>
      ) : (
        <div className="hidden flex-1 flex-col items-center justify-center bg-white p-8 text-center md:flex">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-blue-50 text-blue-500">
            <MessageCircle size={38} />
          </div>
          <h2 className="mb-2 text-xl font-bold text-slate-950">Messages</h2>
          <p className="max-w-sm text-sm font-medium text-slate-500">
            Select a person to open a conversation.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="agape-chat-page flex h-full min-h-0 bg-[#f6f8fb]">
      <div className="hidden h-full min-h-0 w-full md:grid md:grid-cols-[360px_minmax(0,1fr)]">
        <div className="min-h-0 border-r border-slate-200">
          {renderSidebar()}
        </div>
        <div className="min-h-0">
          {renderChatArea()}
        </div>
      </div>

      <div className="flex h-full min-h-0 w-full md:hidden">
        {mobileView === 'sidebar' ? renderSidebar() : renderChatArea()}
      </div>
    </div>
  );
};

export default ChatPage;
