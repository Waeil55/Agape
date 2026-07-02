import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ChevronLeft, MessageCircle, MoreHorizontal, Phone, Radio, Search, Shield,
  Truck, User, Users, Video, X,
} from 'lucide-react';
import { useChat } from '../../hooks/useChat';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';
import { formatChatTime, getAvatarColor, getInitials, getRoleColor } from '../../utils/chatHelpers';

const ROLE_ORDER = ['admin', 'dispatcher', 'driver', 'user'];
const ROLE_LABELS = { admin: 'Admins', dispatcher: 'Dispatchers', driver: 'Drivers', user: 'Users' };
const ROLE_ICONS = { admin: Shield, dispatcher: Radio, driver: Truck, user: User };
const normalizeEmail = (e) => String(e || '').trim().toLowerCase();

const ChatPage = ({ onBack }) => {
  const chat = useChat();
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileView, setMobileView] = useState('sidebar');
  const [showSearch, setShowSearch] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const searchInputRef = useRef(null);
  const moreRef = useRef(null);

  useEffect(() => {
    if (chat.activeChannel && mobileView === 'sidebar') setMobileView('chat');
  }, [chat.activeChannel]);

  useEffect(() => {
    if (showSearch && searchInputRef.current) searchInputRef.current.focus();
  }, [showSearch]);

  useEffect(() => {
    const handleClick = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setShowMore(false);
    };
    if (showMore) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMore]);

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
      return { ...channel, ...people, unread: chat.unreadCounts[channel.id] || 0, isAdminReview: chat.currentUser.isAdmin && !people.isCurrentUserParticipant };
    })
  ), [chat.channels, chat.currentUser.isAdmin, chat.unreadCounts, getConversationPeople]);

  const ownConversationByEmail = useMemo(() => {
    const map = new Map();
    conversations.filter(c => c.isCurrentUserParticipant).forEach((c) => { c.others.forEach(e => map.set(e, c)); });
    return map;
  }, [conversations]);

  const activeConversation = useMemo(() => conversations.find(c => c.id === chat.activeChannel) || null, [chat.activeChannel, conversations]);
  const activeTitle = chat.activeDMTarget?.name || activeConversation?.title || 'Messages';
  const activeSubtitle = activeConversation?.isAdminReview ? activeConversation.subtitle : chat.activeDMTarget?.email || activeConversation?.subtitle || '';
  const activeStatusEmail = chat.activeDMTarget?.email || activeConversation?.others?.[0] || '';
  const isOnline = chat.onlineUsers.has(activeStatusEmail);
  const canSend = activeConversation ? activeConversation.isCurrentUserParticipant : chat.activeDMTarget?.isCurrentUserParticipant !== false;

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return chat.employees
      .filter((e) => !q || e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q))
      .sort((a, b) => { const d = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role); return d !== 0 ? d : a.name.localeCompare(b.name); });
  }, [chat.employees, searchQuery]);

  const groupedEmployees = useMemo(() => {
    const groups = new Map();
    filteredEmployees.forEach((e) => {
      const role = ROLE_ORDER.includes(e.role) ? e.role : 'user';
      if (!groups.has(role)) groups.set(role, []);
      groups.get(role).push(e);
    });
    return ROLE_ORDER.filter(r => groups.has(r)).map(r => ({ role: r, employees: groups.get(r) }));
  }, [filteredEmployees]);

  const adminReviewConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return conversations.filter(c => c.isAdminReview && (!q || c.title.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q)));
  }, [conversations, searchQuery]);

  const recentConversations = useMemo(() => conversations.filter(c => c.isCurrentUserParticipant && (c.lastMessage || c.unread > 0)), [conversations]);

  const openPerson = useCallback((employee) => { chat.openDM(employee.email, employee.name); setMobileView('chat'); }, [chat]);
  const openConversation = useCallback((c) => { chat.openExistingDM(c); setMobileView('chat'); }, [chat]);
  const handleBackToSidebar = useCallback(() => { chat.setActiveChannel(null); chat.clearDMTarget(); setMobileView('sidebar'); }, [chat]);

  const Avatar = ({ email, name, size = 40, showOnline = true }) => (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className={`w-full h-full rounded-full ${getAvatarColor(email)} flex items-center justify-center text-white font-bold`}
           style={{ fontSize: size * 0.35 }}>
        {getInitials(name)}
      </div>
      {showOnline && (
        <span className={`absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-white ${isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`}
              style={{ width: size * 0.3, height: size * 0.3 }} />
      )}
    </div>
  );

  const ConversationRow = ({ conversation }) => {
    const active = chat.activeChannel === conversation.id;
    return (
      <button type="button" onClick={() => openConversation(conversation)}
        className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all duration-150 ${active ? 'bg-blue-50' : 'active:bg-slate-100'}`}>
        <Avatar email={conversation.others[0] || conversation.participants[0]} name={conversation.title} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <p className={`truncate text-[16px] ${conversation.unread > 0 ? 'font-bold text-slate-950' : 'font-semibold text-slate-800'}`}>{conversation.title}</p>
            {conversation.lastMessageAt && <span className="text-[12px] text-slate-400 shrink-0 ml-2">{formatChatTime(conversation.lastMessageAt)}</span>}
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <p className={`truncate text-[14px] ${conversation.unread > 0 ? 'font-semibold text-slate-700' : 'text-slate-500'}`}>
              {conversation.lastMessage || conversation.subtitle || 'No messages yet'}
            </p>
            {conversation.unread > 0 && (
              <span className="ml-2 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-500 px-1.5 text-[11px] font-bold text-white">
                {conversation.unread > 99 ? '99+' : conversation.unread}
              </span>
            )}
          </div>
        </div>
      </button>
    );
  };

  const PersonRow = ({ employee }) => {
    const conversation = ownConversationByEmail.get(employee.email);
    const unread = conversation?.unread || 0;
    const online = chat.onlineUsers.has(employee.email);
    return (
      <button type="button" onClick={() => openPerson(employee)}
        className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all duration-150 active:bg-slate-100`}>
        <div className="relative shrink-0" style={{ width: 52, height: 52 }}>
          <div className={`w-full h-full rounded-full ${getAvatarColor(employee.email)} flex items-center justify-center text-white font-bold text-sm`}>
            {getInitials(employee.name)}
          </div>
          <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white ${online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <p className={`truncate text-[16px] ${unread > 0 ? 'font-bold text-slate-950' : 'font-semibold text-slate-800'}`}>{employee.name}</p>
            {unread > 0 && (
              <span className="ml-2 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-500 px-1.5 text-[11px] font-bold text-white">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </div>
          <p className="text-[14px] text-slate-500 truncate mt-0.5">{employee.email}</p>
        </div>
      </button>
    );
  };

  const renderSidebar = () => (
    <div className="flex h-full w-full min-h-0 flex-col bg-white">
      <div className="shrink-0 border-b border-slate-200/80 bg-white px-4 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-3 py-3">
          {onBack && (
            <button type="button" onClick={onBack}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-600 active:bg-slate-100 md:hidden">
              <ChevronLeft size={26} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-bold text-slate-950 tracking-tight">Messages</h1>
          </div>
          <button className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-500 text-white active:bg-blue-600">
            <MessageCircle size={20} />
          </button>
        </div>
        <label className="flex h-11 items-center gap-2.5 rounded-xl bg-slate-100 px-3 mb-3">
          <Search size={18} className="shrink-0 text-slate-400" />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search" className="min-w-0 flex-1 bg-transparent text-[16px] font-medium text-slate-800 outline-none placeholder:text-slate-400" />
          {searchQuery && <button onClick={() => setSearchQuery('')} className="text-slate-400"><X size={18} /></button>}
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
        {recentConversations.length > 0 && (
          <div className="flex border-b border-slate-100 overflow-x-auto">
            {recentConversations.slice(0, 8).map((c) => (
              <button key={c.id} onClick={() => openConversation(c)}
                className="flex flex-col items-center gap-1 px-3 py-2 shrink-0">
                <div className="relative">
                  <div className={`w-14 h-14 rounded-full ${getAvatarColor(c.others[0] || c.participants[0])} flex items-center justify-center text-white font-bold text-sm`}>
                    {getInitials(c.title)}
                  </div>
                  <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white ${chat.onlineUsers.has(c.others[0]) ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  {c.unread > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-bold text-white">
                      {c.unread > 99 ? '99+' : c.unread}
                    </span>
                  )}
                </div>
                <span className={`text-[11px] max-w-[64px] truncate ${c.unread > 0 ? 'font-bold text-slate-900' : 'text-slate-600'}`}>{c.title.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        )}

        {recentConversations.length > 0 && (
          <div>
            <p className="px-4 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Recent</p>
            {recentConversations.map(c => <ConversationRow key={c.id} conversation={c} />)}
          </div>
        )}

        {chat.currentUser.isAdmin && adminReviewConversations.length > 0 && (
          <div>
            <p className="px-4 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Admin Review</p>
            {adminReviewConversations.map(c => <ConversationRow key={c.id} conversation={c} />)}
          </div>
        )}

        {groupedEmployees.map(({ role, employees }) => {
          const Icon = ROLE_ICONS[role] || Users;
          return (
            <div key={role}>
              <p className="px-4 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Icon size={11} /> {ROLE_LABELS[role] || 'Users'}
              </p>
              {employees.map(e => <PersonRow key={e.email} employee={e} />)}
            </div>
          );
        })}

        {!chat.loading && filteredEmployees.length === 0 && adminReviewConversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3"><Users size={28} /></div>
            <p className="text-sm font-semibold text-slate-600">No people found</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderChatArea = () => (
    <div className="flex h-full w-full min-h-0 flex-col bg-[#f0f2f5]">
      {chat.activeChannel ? (
        <>
          <div className="shrink-0 bg-white border-b border-slate-200/80 px-2 pt-[env(safe-area-inset-top)]" style={{ minHeight: 56 }}>
            <div className="flex items-center gap-2 h-[56px]">
              <button type="button" onClick={handleBackToSidebar}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-blue-500 active:bg-slate-100 md:hidden">
                <ArrowLeft size={22} />
              </button>
              <Avatar email={activeStatusEmail || activeTitle} name={activeTitle} size={36} showOnline={false} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[16px] font-semibold text-slate-950 leading-tight">{activeTitle}</h2>
                <p className={`text-[11px] font-medium mt-px ${isOnline ? 'text-emerald-500' : 'text-slate-400'}`}>
                  {activeConversation?.isAdminReview ? activeSubtitle : isOnline ? 'Online' : activeSubtitle || 'Offline'}
                </p>
              </div>
              <button className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"><Phone size={18} /></button>
              <button className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"><Video size={18} /></button>
              <div className="relative" ref={moreRef}>
                <button onClick={() => setShowMore(!showMore)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"><MoreHorizontal size={18} /></button>
                {showMore && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-50">
                    <button className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-3">
                      <Search size={16} /> Search messages
                    </button>
                    <button className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-3">
                      <User size={16} /> View profile
                    </button>
                  </div>
                )}
              </div>
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

          {canSend ? (
            <ChatInput
              onSend={(text, extra) => chat.sendMessage(chat.activeChannel, text, extra)}
              onTyping={() => chat.setTyping(chat.activeChannel, true)}
              onStopTyping={() => chat.setTyping(chat.activeChannel, false)}
              channelName={activeTitle}
              currentUser={chat.currentUser}
            />
          ) : (
            <div className="shrink-0 bg-white border-t border-slate-200 px-4 py-3 text-center text-xs font-semibold text-slate-500"
                 style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
              Read only
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center bg-[#f0f2f5] p-8 text-center">
          <div className="w-24 h-24 rounded-full bg-white shadow-sm flex items-center justify-center text-blue-500 mb-4">
            <MessageCircle size={40} />
          </div>
          <h2 className="text-[22px] font-bold text-slate-950 mb-1">Your Messages</h2>
          <p className="text-sm text-slate-500 max-w-[280px]">Send private messages to a friend or group</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="agape-chat-page flex h-full w-full min-h-0 bg-white">
      <div className="hidden h-full min-h-0 w-full md:grid md:grid-cols-[360px_minmax(0,1fr)]">
        <div className="min-h-0 border-r border-slate-200">{renderSidebar()}</div>
        <div className="min-h-0">{renderChatArea()}</div>
      </div>
      <div className="flex h-full min-h-0 w-full md:hidden">
        {mobileView === 'sidebar' ? renderSidebar() : renderChatArea()}
      </div>
    </div>
  );
};

export default ChatPage;
