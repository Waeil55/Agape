import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Phone, Info, Search, Plus, Smile, ThumbsUp, Send,
  MessageSquare, Loader2, X, Mail, ShieldCheck, Briefcase, CheckCheck,
  Paperclip, FileText, Download, Pencil, Trash2, Bell, BellOff, Reply, Users, Check, Pin, Forward
} from 'lucide-react';
import { useChat } from '../../hooks/useChat';
import { makeCall } from '../../utils/nativeActions';
import { storage, storageRef, uploadBytesResumable, getDownloadURL } from '../../config/firebase';
import { isAllowedChatAttachment, isMessageSeen } from '../../utils/chatLifecycle';
import { recordMatchesSearch } from '../../utils/search';
import { purgeLegacyChatStorage } from '../../utils/sensitiveSessionStorage';

const formatDisplayName = (user) => {
  if (!user) return 'User';
  let raw = user.name || user.username || user.email || 'User';
  if (raw.includes('@')) {
    raw = raw.split('@')[0];
  }
  return raw
    .split(/[._-]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const CHAT_AVATAR_TONES = [
  'from-blue-600 to-indigo-600',
  'from-cyan-600 to-blue-600',
  'from-emerald-600 to-teal-600',
  'from-violet-600 to-indigo-600',
];

const getAvatarInitials = (user) => formatDisplayName(user)
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((word) => word.charAt(0).toUpperCase())
  .join('') || 'AC';

const getAvatarTone = (user) => {
  const identity = String(user?.id || user?.email || formatDisplayName(user));
  const hash = [...identity].reduce((total, character) => total + character.charCodeAt(0), 0);
  return CHAT_AVATAR_TONES[hash % CHAT_AVATAR_TONES.length];
};

const ChatAvatar = ({ user, size = 'md', className = '', decorative = false }) => {
  const sizeClass = size === 'xl' ? 'h-20 w-20 text-xl rounded-xl'
    : size === 'lg' ? 'h-16 w-16 text-base rounded-xl'
    : size === 'sm' ? 'h-9 w-9 text-[11px] rounded-xl'
    : size === 'xs' ? 'h-7 w-7 text-[9px] rounded-lg'
    : 'agape-messenger-avatar text-xs rounded-xl';
  return (
    <span
      className={`${sizeClass} ${className} inline-flex shrink-0 items-center justify-center bg-gradient-to-br ${getAvatarTone(user)} font-semibold text-white shadow-sm ring-1 ring-white/80`}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : formatDisplayName(user)}
      aria-hidden={decorative || undefined}
    >
      {getAvatarInitials(user)}
    </span>
  );
};

export const ChatSession = ({ chatModel, onBack, onThreadActive }) => {
  const {
    currentUser,
    channels,
    draftChannel,
    messages,
    activeChannelId,
    setActiveChannelId,
    users,
    loading,
    sendMessage,
    startDirectChat,
    startGroupChat,
    unreadByChannel,
    unreadCount,
    setTyping,
    editMessage,
    deleteMessage,
    toggleReaction,
    togglePin,
    forwardMessage,
    contactPresence,
    toggleMute,
    loadOlderMessages,
    hasOlderMessages,
    loadingOlderMessages
  } = chatModel;

  const [searchQuery, setSearchQuery] = useState('');
  const [conversationFilter, setConversationFilter] = useState('all');
  const [composerText, setComposerText] = useState('');
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showThreadSearch, setShowThreadSearch] = useState(false);
  const [threadQuery, setThreadQuery] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [newChatMode, setNewChatMode] = useState('direct');
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [outbox, setOutbox] = useState([]);
  const [typingClock, setTypingClock] = useState(() => Date.now());
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimerRef = useRef(null);
  const sendRequestIdRef = useRef(null);
  const suppressNextScrollRef = useRef(false);
  const sessionActiveRef = useRef(true);

  useEffect(() => {
    purgeLegacyChatStorage();
    sessionActiveRef.current = true;
    return () => { sessionActiveRef.current = false; };
  }, []);

  // Notify parent of active thread state change
  useEffect(() => {
    if (onThreadActive) {
      onThreadActive(!!activeChannelId);
    }
  }, [activeChannelId, onThreadActive]);

  // Scroll to bottom of message list on new messages
  useEffect(() => {
    if (suppressNextScrollRef.current) { suppressNextScrollRef.current = false; return; }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeChannelId]);

  useEffect(() => { setComposerText(''); }, [activeChannelId]);

  useEffect(() => () => {
    clearTimeout(typingTimerRef.current);
    setTyping(false);
  }, [setTyping]);

  useEffect(() => {
    const timer = setInterval(() => setTypingClock(Date.now()), 2000);
    return () => clearInterval(timer);
  }, []);

  const handleSend = async (textToSend = null) => {
    const text = (textToSend || composerText).trim();
    if ((!text && !textToSend && pendingFiles.length === 0) || isSending) return;
    setIsSending(true);
    setSendError('');
    let uploadedAttachments = [];
    try {
      const attachments = [];
      for (let index = 0; index < pendingFiles.length; index += 1) {
        const file = pendingFiles[index];
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        if (!activeChannelId) throw new Error('A verified chat channel is required before uploading attachments.');
        const fileRef = storageRef(
          storage,
          `chat_attachments/${activeChannelId}/${currentUser.id}/${Date.now()}-${crypto.randomUUID()}-${safeName}`,
        );
        const task = uploadBytesResumable(fileRef, file, { contentType: file.type });
        await new Promise((resolve, reject) => task.on('state_changed', snapshot => setUploadProgress(Math.round(((index + snapshot.bytesTransferred / snapshot.totalBytes) / pendingFiles.length) * 100)), reject, resolve));
        attachments.push({ url: await getDownloadURL(fileRef), path: fileRef.fullPath, name: file.name, type: file.type, size: file.size });
      }
      uploadedAttachments = attachments;
      if (!sendRequestIdRef.current) sendRequestIdRef.current = crypto.randomUUID();
      const reply = replyTo ? { id: replyTo.id, senderName: replyTo.senderName, text: (replyTo.text || 'Attachment').slice(0, 180) } : null;
      await sendMessage(text || (attachments.length ? '' : '👍'), attachments, sendRequestIdRef.current, reply);
      if (!sessionActiveRef.current) return;
      if (!textToSend) setComposerText('');
      setPendingFiles([]);
      setUploadProgress(0);
      setReplyTo(null);
      sendRequestIdRef.current = null;
      setTyping(false);
    } catch (error) {
      console.error('Message send failed:', error);
      if (!sessionActiveRef.current) return;
      const queued = { id: sendRequestIdRef.current || crypto.randomUUID(), channelId: activeChannelId, text, attachments: uploadedAttachments, replyTo: replyTo ? { id: replyTo.id, senderName: replyTo.senderName, text: (replyTo.text || 'Attachment').slice(0, 180) } : null, queuedAt: Date.now() };
      setOutbox(current => [...current.filter(item => item.id !== queued.id), queued]);
      setSendError('Message kept in memory for this open session. Retry when your connection returns.');
    } finally {
      if (sessionActiveRef.current) setIsSending(false);
    }
  };

  const retryOutbox = async () => {
    if (!outbox.length || isSending) return;
    setIsSending(true);
    const remaining = [];
    for (const item of outbox) {
      if (item.channelId !== activeChannelId) { remaining.push(item); continue; }
      try { await sendMessage(item.text, item.attachments || [], item.id, item.replyTo || null); }
      catch { remaining.push(item); }
    }
    if (!sessionActiveRef.current) return;
    setOutbox(remaining);
    setSendError(remaining.some(item => item.channelId === activeChannelId) ? 'Some queued messages still need a connection.' : '');
    setIsSending(false);
  };

  useEffect(() => {
    const retry = () => retryOutbox();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  });

  const handleComposerChange = (value) => {
    setComposerText(value);
    setTyping(Boolean(value.trim()));
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => setTyping(false), 1800);
  };

  const getOtherParticipant = (channel) => {
    if (!channel || !currentUser || !channel.participants) return null;
    if (channel.type === 'group') return { id: channel.id, name: channel.name || 'Group conversation', role: `${channel.participants.length} members`, isGroup: true };
    const otherId = channel.participants.find(pId => pId !== currentUser.id);
    const directoryUser = users.find(user => user.id === otherId) || {};
    return { ...directoryUser, ...(channel.participantDetails?.[otherId] || {}), id: otherId };
  };

  const activeChannel = channels.find(c => c.id === activeChannelId) || (draftChannel?.id === activeChannelId ? draftChannel : null);
  const otherContact = getOtherParticipant(activeChannel);
  const isMuted = Boolean(activeChannel?.mutedBy?.[currentUser?.id]);
  const otherUserId = activeChannel?.participants?.find(id => id !== currentUser?.id);
  const otherReadAt = activeChannel?.readBy?.[otherUserId]?.toMillis?.() || 0;
  const otherTyping = activeChannel && currentUser
    ? Object.entries(activeChannel.typing || {}).some(([userId, state]) => userId !== currentUser.id && state && typingClock - new Date(state.updatedAt || 0).getTime() < 5000)
    : false;
  const presenceMs = contactPresence?.lastSeenAt?.toMillis?.() || 0;
  const isContactOnline = contactPresence?.state === 'online' && typingClock - presenceMs < 70000;
  const presenceLabel = isContactOnline ? 'Online' : presenceMs ? `Last active ${new Date(presenceMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Offline';
  const visibleMessages = threadQuery.trim()
    ? messages.filter(message => (message.text || '').toLowerCase().includes(threadQuery.trim().toLowerCase()))
    : messages;

  const formatMessageTime = (timestamp) => {
    const date = timestamp?.toDate?.();
    if (!date) return '';
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const formatConversationTime = (timestamp) => {
    const date = timestamp?.toDate?.();
    if (!date) return '';
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Filter channels based on search
  const filteredChannels = channels.filter(ch => {
    const other = getOtherParticipant(ch);
    if (!other) return false;
    const lastMsgText = (ch.lastMessage?.text || '').toLowerCase();
    const query = searchQuery.toLowerCase();
    const matchesQuery = recordMatchesSearch(other, query, ['name', 'username', 'email', 'phone']) || lastMsgText.includes(query);
    const matchesFilter = conversationFilter === 'all'
      || (conversationFilter === 'unread' && unreadByChannel[ch.id] > 0)
      || (conversationFilter === 'groups' && ch.type === 'group');
    return matchesQuery && matchesFilter;
  });

  // Filter contacts (users not in active chats or all search matching contacts)
  const filteredContacts = users.filter(u => {
    return recordMatchesSearch(u, searchQuery, ['name', 'username', 'email', 'phone']);
  });

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <span className="text-xs font-semibold text-slate-500">Opening secure messages…</span>
        </div>
      </div>
    );
  }

  // Responsive Two-Column Layout (Desktop split, Mobile switch)
  return (
    <div className="agape-messenger-container flex h-full bg-slate-50">
      {/* Left Column: Chat List (Visible on Desktop always, on Mobile only if no active channel) */}
      <div className={`agape-messenger-sidebar w-full md:w-[340px] xl:w-[380px] flex flex-col h-full border-r border-slate-200 bg-white shrink-0 ${activeChannelId ? 'hidden md:flex' : 'flex'}`}>
        {/* Header */}
        <div className="agape-chat-sidebar-head flex shrink-0 items-center justify-between px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="w-9 h-9 flex items-center justify-center text-slate-600 rounded-full hover:bg-slate-100 transition mr-1"
              >
                <ArrowLeft size={18} strokeWidth={2.5} />
              </button>
            )}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-700">Care team</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-950 leading-none tracking-tight">Messages</h1>
              <p className="mt-1.5 text-[11px] font-semibold text-slate-500">{unreadCount > 0 ? `${unreadCount} unread ${unreadCount === 1 ? 'message' : 'messages'}` : 'You’re all caught up'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNewChatModal(true)}
              className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white hover:bg-blue-700 transition shadow-lg shadow-blue-600/15"
              title="Start new chat"
              aria-label="Start new conversation"
            >
              <Plus size={18} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="agape-messenger-search-bar mx-4 my-2 flex min-h-11 shrink-0 items-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
          <Search size={16} className="text-slate-400 mr-2 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search people and conversations"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="agape-chat-filterbar flex shrink-0 items-center gap-2 overflow-x-auto border-b border-slate-100 px-4 py-3" aria-label="Conversation filters">
          {[
            ['all', 'All'],
            ['unread', `Unread${unreadCount ? ` ${unreadCount}` : ''}`],
            ['groups', 'Groups'],
          ].map(([value, label]) => <button key={value} onClick={() => setConversationFilter(value)} aria-pressed={conversationFilter === value} className={`min-h-9 rounded-xl px-3 text-[11px] font-semibold transition ${conversationFilter === value ? 'bg-slate-950 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{label}</button>)}
        </div>

        {/* Channels List */}
        <div className="agape-messenger-list flex-1 overflow-y-auto bg-white">
          {filteredChannels.map(ch => {
            const other = getOtherParticipant(ch);
            if (!other) return null;
            return (
              <button
                type="button"
                key={ch.id}
                onClick={() => setActiveChannelId(ch.id)}
                className={`agape-messenger-row ${unreadByChannel[ch.id] ? 'is-unread' : ''} mx-2 my-1 flex min-h-[4.5rem] w-[calc(100%_-_1rem)] items-center gap-3 rounded-xl px-3 py-3 text-left transition ${activeChannelId === ch.id ? 'is-active' : ''}`}
              >
                <div className="agape-messenger-avatar-wrap flex-shrink-0">
                  <ChatAvatar user={other} />
                </div>

                <div className="agape-messenger-row-content flex-1 min-w-0">
                  <div className="agape-messenger-row-header flex justify-between items-baseline mb-0.5 gap-2">
                    <span className="agape-messenger-row-name text-sm font-bold text-slate-900 truncate">{formatDisplayName(other)}</span>
                    <span className="text-[10px] font-semibold text-slate-400 shrink-0">{formatConversationTime(ch.lastMessage?.timestamp)}</span>
                    {unreadByChannel[ch.id] > 0 && <span className="agape-unread-badge" aria-label={`${unreadByChannel[ch.id]} unread messages`}>{unreadByChannel[ch.id] > 99 ? '99+' : unreadByChannel[ch.id]}</span>}
                  </div>
                  <div className="agape-messenger-row-snippet text-xs text-slate-500 font-semibold flex items-center justify-between gap-2">
                    <span className={`truncate ${unreadByChannel[ch.id] ? 'text-slate-900 font-bold' : ''}`}>{ch.lastMessage?.text || 'No messages yet'}</span>
                  </div>
                </div>
              </button>
            );
          })}

          {filteredChannels.length === 0 && (
            <div className="m-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-slate-500">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><MessageSquare size={23} /></div>
              <p className="text-sm font-semibold text-slate-800">No conversations yet</p>
              <p className="mt-1 max-w-[14rem] text-xs leading-5">Start a secure conversation with a dispatcher or care-team member.</p>
              <button type="button" onClick={() => setShowNewChatModal(true)} className="mt-4 min-h-11 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white">New conversation</button>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Chat Thread */}
      <div className={`agape-messenger-main flex-1 h-full flex flex-col bg-slate-50 ${activeChannelId ? 'flex' : 'hidden md:flex'}`}>
        {activeChannel && otherContact ? (
          <div className="agape-messenger-thread h-full flex flex-col">
            {/* Thread Header */}
            <div className="agape-messenger-thread-header flex items-center justify-between px-4 md:px-6 py-3 border-b border-slate-200 bg-white/95 shrink-0">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveChannelId(null)}
                  className="w-10 h-10 flex items-center justify-center text-blue-600 rounded-full hover:bg-slate-100 transition md:hidden"
                  aria-label="Back to chat list"
                >
                  <ArrowLeft size={20} strokeWidth={2.5} />
                </button>

                <div className="agape-messenger-avatar-wrap">
                  <ChatAvatar user={otherContact} />
                  {isContactOnline && <div className="agape-messenger-status-dot" aria-hidden="true" />}
                </div>

                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold leading-tight text-slate-950">{formatDisplayName(otherContact)}</h3>
                  <p className={`text-[11px] font-semibold capitalize flex items-center gap-1.5 ${isContactOnline ? 'text-emerald-600' : 'text-slate-400'}`}><span className={`w-1.5 h-1.5 rounded-full ${isContactOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} /> {presenceLabel} · {otherContact.role || 'Driver'}</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-slate-600">
                <button onClick={() => { setShowThreadSearch(value => !value); setThreadQuery(''); }} className={`w-10 h-10 flex items-center justify-center rounded-xl transition ${showThreadSearch ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-100'}`} title="Search this conversation"><Search size={18} strokeWidth={2.2} /></button>
                <button onClick={() => otherContact.phone && makeCall(otherContact.phone)} disabled={!otherContact.phone} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed" title={otherContact.phone ? 'Call contact' : 'No phone number available'}><Phone size={18} strokeWidth={2.2} /></button>
                <button onClick={() => setShowDetails(value => !value)} className={`w-10 h-10 flex items-center justify-center rounded-xl transition ${showDetails ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`} title="Conversation details"><Info size={18} strokeWidth={2.2} /></button>
              </div>
            </div>

            {showThreadSearch && (
              <div className="px-4 md:px-6 py-2.5 bg-white border-b border-slate-200 flex items-center gap-2">
                <Search size={15} className="text-slate-400" />
                <input autoFocus value={threadQuery} onChange={event => setThreadQuery(event.target.value)} placeholder="Find a message in this conversation" className="flex-1 bg-transparent outline-none text-sm font-medium text-slate-800 placeholder:text-slate-400" />
                {threadQuery && <span className="text-[11px] font-bold text-slate-400">{visibleMessages.length} found</span>}
              </div>
            )}

            {/* Messages Feed */}
            <div className="agape-messenger-thread-messages flex-1 overflow-y-auto p-4 md:px-8 md:py-6 flex flex-col gap-3">
              <div className="agape-messenger-date-divider">{activeChannel.isDraft ? 'New private conversation' : 'Secure team conversation'}</div>
              {hasOlderMessages && <button onClick={() => { suppressNextScrollRef.current = true; loadOlderMessages(); }} disabled={loadingOlderMessages} className="mx-auto mb-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm disabled:opacity-50">{loadingOlderMessages ? 'Loading history…' : 'Load older messages'}</button>}

              {activeChannel.isDraft && messages.length === 0 && !threadQuery && (
                <div className="m-auto max-w-sm text-center px-6">
                  <ChatAvatar user={otherContact} size="xl" className="mx-auto" />
                  <h4 className="mt-4 text-lg font-black text-slate-950">Start a conversation with {formatDisplayName(otherContact)}</h4>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">This person will only appear in your chats after you send the first message.</p>
                </div>
              )}

              {visibleMessages.map((msg, index) => {
                const isSent = msg.senderId === currentUser.id;
                const nextMessage = visibleMessages[index + 1];
                const isLastInGroup = !nextMessage || nextMessage.senderId !== msg.senderId;
                return (
                  <div key={msg.id || index} className={`agape-messenger-bubble-row ${isSent ? 'is-sent' : 'is-received'}`}>
                    {!isSent && isLastInGroup ? (
                      <ChatAvatar user={otherContact} size="xs" decorative />
                    ) : !isSent ? <span className="w-7 shrink-0" /> : null}
                    <div className={`agape-messenger-bubble-group ${isSent ? 'is-sent' : 'is-received'}`}>
                      <div className="agape-messenger-bubble">
                        {msg.replyTo && <div className="mb-2 rounded-lg border-l-2 border-current bg-black/5 px-2 py-1 text-[10px] opacity-75"><strong>{msg.replyTo.senderName || 'Message'}</strong><div className="truncate">{msg.replyTo.text}</div></div>}
                        {msg.deletedAt ? <span className="italic opacity-70">Message removed</span> : editingMessageId === msg.id ? (
                          <div className="flex items-center gap-2"><input autoFocus value={editingText} onChange={event => setEditingText(event.target.value)} className="min-w-0 flex-1 rounded-lg bg-white/90 px-2 py-1 text-slate-900 outline-none" /><button onClick={async () => { await editMessage(msg.id, editingText); setEditingMessageId(null); }} className="text-xs font-black">Save</button></div>
                        ) : <>{msg.text}{msg.editedAt && <span className="ml-1 text-[9px] opacity-60">edited</span>}</>}
                        {(msg.attachments || (msg.attachment ? [msg.attachment] : [])).map((attachment, attachmentIndex) => !msg.deletedAt && (attachment.type?.startsWith('image/') ? <a key={attachment.path || attachmentIndex} href={attachment.url} target="_blank" rel="noreferrer"><img src={attachment.url} alt={attachment.name} className="mt-2 max-h-64 rounded-xl object-cover" /></a> : <a key={attachment.path || attachmentIndex} href={attachment.url} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 rounded-xl bg-white/15 p-2"><FileText size={18} /><span className="truncate text-xs font-bold">{attachment.name}</span><Download size={14} /></a>))}
                      </div>
                      {!msg.deletedAt && <div className={`flex items-center gap-1 ${isSent ? 'justify-end' : 'justify-start'}`}><button onClick={() => setReplyTo(msg)} className="p-1 text-slate-400 hover:text-blue-600" aria-label="Reply to message"><Reply size={11} /></button><button onClick={() => setForwardingMessage(msg)} className="p-1 text-slate-400 hover:text-blue-600" aria-label="Forward message"><Forward size={11} /></button><button onClick={() => togglePin(msg)} className={`p-1 ${msg.pinned ? 'text-amber-600' : 'text-slate-400 hover:text-amber-600'}`} aria-label={msg.pinned ? 'Unpin message' : 'Pin message'}><Pin size={11} /></button><button onClick={() => toggleReaction(msg, '👍')} className="rounded-full px-1.5 py-0.5 text-xs hover:bg-slate-200">👍</button>{isSent && <><button onClick={() => { setEditingMessageId(msg.id); setEditingText(msg.text || ''); }} className="p-1 text-slate-400 hover:text-blue-600" aria-label="Edit message"><Pencil size={11} /></button><button onClick={() => deleteMessage(msg.id)} className="p-1 text-slate-400 hover:text-rose-600" aria-label="Delete message"><Trash2 size={11} /></button></>}</div>}
                      {msg.reactions && <div className="flex flex-wrap gap-1">{Object.entries(msg.reactions).filter(([, ids]) => ids?.length).map(([emoji, ids]) => <button key={emoji} onClick={() => toggleReaction(msg, emoji)} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] shadow-sm">{emoji} {ids.length}</button>)}</div>}
                      {isLastInGroup && <span className="agape-message-meta">{formatMessageTime(msg.timestamp)}{isSent && <><CheckCheck size={12} />{isMessageSeen(msg, otherReadAt) && <span>Seen</span>}</>}</span>}
                    </div>
                  </div>
                );
              })}

              {visibleMessages.length === 0 && threadQuery && <div className="m-auto text-center"><Search size={28} className="mx-auto text-slate-300" /><p className="mt-2 text-sm font-bold text-slate-500">No matching messages</p></div>}

              {otherTyping && <div className="agape-messenger-bubble-row is-received"><ChatAvatar user={otherContact} size="xs" decorative /><div className="agape-messenger-typing" aria-label={`${formatDisplayName(otherContact)} is typing`}><span className="agape-messenger-typing-dot" /><span className="agape-messenger-typing-dot" /><span className="agape-messenger-typing-dot" /></div></div>}

              <div ref={messagesEndRef} />
            </div>

            {/* Composer Bar */}
            {sendError && <div className="flex items-center justify-center gap-3 bg-rose-50 border-t border-rose-100 px-4 py-2 text-center text-[11px] font-bold text-rose-700"><span>{sendError}</span>{outbox.some(item => item.channelId === activeChannelId) && <button onClick={retryOutbox} className="rounded-full bg-rose-700 px-2.5 py-1 text-white">Retry queued</button>}</div>}
            {pendingFiles.length > 0 && <div className="border-t border-slate-200 bg-slate-50 px-4 py-2"><div className="flex flex-wrap gap-2">{pendingFiles.map((file, index) => <div key={`${file.name}-${index}`} className="flex max-w-[220px] items-center gap-2 rounded-lg bg-white px-2 py-1 text-xs font-bold text-slate-700"><FileText size={15} /><span className="min-w-0 flex-1 truncate">{file.name}</span><button onClick={() => setPendingFiles(files => files.filter((_, itemIndex) => itemIndex !== index))} aria-label="Remove attachment"><X size={15} /></button></div>)}</div>{isSending && uploadProgress > 0 && <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-blue-600 transition-all" style={{ width: `${uploadProgress}%` }} /></div>}</div>}
            {replyTo && <div className="flex items-center gap-2 border-t border-blue-100 bg-blue-50 px-4 py-2 text-xs text-blue-900"><Reply size={14} /><div className="min-w-0 flex-1"><strong>Replying to {replyTo.senderName || 'message'}</strong><p className="truncate text-[10px] opacity-70">{replyTo.text || 'Attachment'}</p></div><button onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X size={15} /></button></div>}
            <div className="agape-messenger-composer border-t border-slate-200 bg-white px-4 md:px-6 py-3.5 flex items-center gap-3 shrink-0 relative">
              <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.txt" className="hidden" onChange={event => { const files = Array.from(event.target.files || []); const allowed = files.filter(isAllowedChatAttachment); if (allowed.length !== files.length) setSendError('Choose images, PDFs, or text files up to 10 MB each.'); setPendingFiles(current => [...current, ...allowed].slice(0, 5)); event.target.value = ''; }} />
              <button onClick={() => fileInputRef.current?.click()} className="w-9 h-9 rounded-xl text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition flex items-center justify-center" title="Attach file"><Paperclip size={19} /></button>
              <button onClick={() => setShowEmojiPicker(value => !value)} className="w-9 h-9 rounded-xl text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition flex items-center justify-center flex-shrink-0" title="Add emoji">
                <Smile size={20} strokeWidth={2.2} />
              </button>
              {showEmojiPicker && <div className="absolute bottom-[64px] left-4 md:left-6 bg-white border border-slate-200 shadow-2xl rounded-2xl p-2 flex gap-1 z-20">{['👍','❤️','😊','🎉','✅','🙏'].map(emoji => <button key={emoji} onClick={() => { setComposerText(value => value + emoji); setShowEmojiPicker(false); }} className="w-9 h-9 rounded-xl hover:bg-slate-100 text-lg">{emoji}</button>)}</div>}

              <div className="agape-messenger-input-wrap flex-1 bg-slate-100 rounded-full px-4 py-2 flex items-center">
                <input
                  type="text"
                  placeholder="Aa"
                  value={composerText}
                  onChange={e => handleComposerChange(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSend(); }}
                />
              </div>

              <div className="flex-shrink-0">
                {composerText.trim() || pendingFiles.length ? (
                  <button
                    onClick={() => handleSend()}
                    disabled={isSending}
                    className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white hover:bg-blue-700 transition active:scale-90"
                  >
                    {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} strokeWidth={2.5} className="ml-0.5" />}
                  </button>
                ) : (
                  <button
                    onClick={() => handleSend('👍')}
                    disabled={isSending}
                    className="agape-messenger-like-btn text-blue-600 hover:text-blue-700 transition"
                  >
                    <ThumbsUp size={22} strokeWidth={2.2} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 bg-slate-50/30">
            <MessageSquare size={48} className="opacity-20 mb-3 text-blue-600 animate-pulse" />
            <h3 className="text-base font-bold text-slate-700">Select a Chat</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-[200px]">Choose a contact from the list or start a new conversation to begin.</p>
          </div>
        )}
      </div>

      {activeChannel && otherContact && showDetails && (
        <aside className="hidden xl:flex w-[300px] h-full shrink-0 border-l border-slate-200 bg-white flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-600">Directory</p><h3 className="mt-1 text-sm font-semibold text-slate-900">Conversation details</h3></div><button onClick={() => setShowDetails(false)} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center" aria-label="Close conversation details"><X size={16} /></button></div>
          <div className="border-b border-slate-100 p-6 text-center"><ChatAvatar user={otherContact} size="xl" className="mx-auto" /><h4 className="mt-3 text-base font-semibold text-slate-950">{formatDisplayName(otherContact)}</h4><p className="mt-1 text-xs font-semibold text-slate-500 capitalize">{otherContact.role || 'Team member'}</p><span className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${isContactOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}><span className={`h-1.5 w-1.5 rounded-full ${isContactOnline ? 'bg-emerald-500' : 'bg-slate-400'}`} /> {presenceLabel}</span></div>
          <div className="p-4 space-y-2"><button onClick={toggleMute} disabled={activeChannel.isDraft} className="w-full flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-left disabled:opacity-40">{isMuted ? <BellOff size={16} className="text-rose-600" /> : <Bell size={16} className="text-blue-600" />}<div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Notifications</p><p className="text-xs font-bold text-slate-700">{isMuted ? 'Muted' : 'Alerts enabled'}</p></div></button><div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><Briefcase size={16} className="text-blue-600" /><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Role</p><p className="text-xs font-bold text-slate-700 capitalize">{otherContact.role || 'Team member'}</p></div></div><div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><Mail size={16} className="text-blue-600" /><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Email</p><p className="text-xs font-bold text-slate-700 truncate">{otherContact.email || 'Not available'}</p></div></div><div className="flex items-center gap-3 rounded-xl bg-blue-50 p-3"><ShieldCheck size={16} className="text-blue-600" /><div><p className="text-[10px] font-bold uppercase tracking-wide text-blue-500">Privacy</p><p className="text-xs font-bold text-blue-900">Internal team channel</p></div></div></div>
        </aside>
      )}

      {activeChannel && otherContact && showDetails && (
        <div className="xl:hidden fixed inset-0 z-[320] bg-black/40 backdrop-blur-sm flex items-end" onClick={() => setShowDetails(false)}>
          <div className="w-full rounded-t-[28px] bg-white p-5 pb-[calc(24px+env(safe-area-inset-bottom,0px))] shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200" />
            <div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-600">Contact</p><h3 className="mt-1 text-base font-semibold text-slate-950">Conversation details</h3></div><button onClick={() => setShowDetails(false)} className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center" aria-label="Close conversation details"><X size={17} /></button></div>
            <div className="mt-5 flex items-center gap-4 rounded-xl bg-slate-50 p-4"><ChatAvatar user={otherContact} size="lg" /><div className="min-w-0"><h4 className="truncate text-base font-semibold text-slate-950">{formatDisplayName(otherContact)}</h4><p className="mt-1 text-xs font-semibold text-slate-500 capitalize">{otherContact.role || 'Team member'}</p><span className={`mt-2 inline-flex items-center gap-1.5 text-[10px] font-semibold ${isContactOnline ? 'text-emerald-700' : 'text-slate-500'}`}><span className={`h-1.5 w-1.5 rounded-full ${isContactOnline ? 'bg-emerald-500' : 'bg-slate-400'}`} /> {presenceLabel}</span></div></div>
            <div className="mt-3 grid grid-cols-2 gap-3"><button onClick={() => otherContact.phone && makeCall(otherContact.phone)} disabled={!otherContact.phone} className="h-12 rounded-2xl bg-blue-600 text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-40"><Phone size={16} /> Call</button><a href={otherContact.email ? `mailto:${otherContact.email}` : undefined} className={`h-12 rounded-2xl bg-blue-50 text-blue-700 text-xs font-bold flex items-center justify-center gap-2 ${!otherContact.email ? 'opacity-40 pointer-events-none' : ''}`}><Mail size={16} /> Email</a></div>
          </div>
        </div>
      )}

      {/* Directory Modal */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-[300] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={() => setShowNewChatModal(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm max-h-[80vh] flex flex-col p-5 shadow-2xl relative animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4 shrink-0">
              <h3 className="text-sm font-bold text-slate-900">New Message</h3>
              <button onClick={() => setShowNewChatModal(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200" aria-label="Close new conversation">
                <X size={16} />
              </button>
            </div>
            <div className="mb-4 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
              <button onClick={() => { setNewChatMode('direct'); setSelectedMemberIds([]); }} className={`rounded-lg px-3 py-2 text-xs font-bold ${newChatMode === 'direct' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Direct</button>
              <button onClick={() => setNewChatMode('group')} className={`rounded-lg px-3 py-2 text-xs font-bold ${newChatMode === 'group' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}><Users size={14} className="mr-1 inline" /> Group</button>
            </div>
            {newChatMode === 'group' && <input value={groupName} onChange={event => setGroupName(event.target.value)} maxLength={80} placeholder="Group name" className="mb-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-blue-500" />}
            <div className="flex-1 overflow-y-auto space-y-2">
              {filteredContacts.map(u => (
                <button
                  key={u.id}
                  onClick={() => {
                    if (newChatMode === 'direct') {
                      startDirectChat(u);
                      setShowNewChatModal(false);
                    } else {
                      setSelectedMemberIds(ids => ids.includes(u.id) ? ids.filter(id => id !== u.id) : [...ids, u.id]);
                    }
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 bg-slate-50 hover:bg-blue-50 border border-slate-100 hover:border-blue-200 rounded-2xl text-left transition"
                >
                  <ChatAvatar user={u} size="sm" />
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-slate-900 truncate leading-tight">{formatDisplayName(u)}</h4>
                    <p className="text-[10px] text-slate-500 capitalize">{u.role || 'Driver'}</p>
                  </div>
                  {newChatMode === 'group' && <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${selectedMemberIds.includes(u.id) ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 text-transparent'}`}><Check size={14} /></span>}
                </button>
              ))}
              {filteredContacts.length === 0 && (
                <div className="text-center text-slate-400 text-xs py-8">No other users found in the system.</div>
              )}
            </div>
            {newChatMode === 'group' && <button disabled={selectedMemberIds.length < 2} onClick={() => {
              startGroupChat(users.filter(user => selectedMemberIds.includes(user.id)), groupName);
              setSelectedMemberIds([]); setGroupName(''); setShowNewChatModal(false);
            }} className="mt-4 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">Create group with {selectedMemberIds.length} members</button>}
          </div>
        </div>
      )}
      {forwardingMessage && <div className="fixed inset-0 z-[330] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" onClick={() => setForwardingMessage(null)}><div className="max-h-[75vh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl" onClick={event => event.stopPropagation()}><div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600">Forward</p><h3 className="text-base font-semibold text-slate-950">Choose a conversation</h3></div><button onClick={() => setForwardingMessage(null)} className="h-8 w-8 rounded-full bg-slate-100" aria-label="Close forward dialog"><X size={15} className="mx-auto" /></button></div><div className="space-y-2">{channels.filter(channel => channel.id !== activeChannelId).map(channel => { const contact = getOtherParticipant(channel); return <button key={channel.id} onClick={async () => { await forwardMessage(forwardingMessage, channel.id); setForwardingMessage(null); }} className="flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-left hover:border-blue-200 hover:bg-blue-50"><ChatAvatar user={contact} size="sm" decorative /><span className="text-sm font-bold text-slate-800">{formatDisplayName(contact)}</span></button>; })}</div></div></div>}
    </div>
  );
};

export const ChatPage = ({ onBack, onThreadActive }) => {
  const chatModel = useChat({ alerts: false });
  const sessionIdentity = chatModel.currentUser?.id || chatModel.currentUser?.uid || chatModel.currentUser?.email || 'signed-out';
  const safeDraftChannel = chatModel.draftChannel?.participants?.includes(sessionIdentity)
    ? chatModel.draftChannel
    : null;
  const safeModel = safeDraftChannel === chatModel.draftChannel
    ? chatModel
    : { ...chatModel, draftChannel: null };
  return <ChatSession key={sessionIdentity} chatModel={safeModel} onBack={onBack} onThreadActive={onThreadActive} />;
};
