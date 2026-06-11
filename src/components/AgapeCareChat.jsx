import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { functions, httpsCallable } from '../config/firebase';
import {
  Archive,
  ArrowLeft,
  Bell,
  Check,
  CheckCheck,
  ChevronRight,
  File,
  Hash,
  Info,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Phone,
  Plus,
  Search,
  Send,
  Shield,
  Smartphone,
  Smile,
  UserRound,
  Users,
  X,
} from 'lucide-react';

const BRAND = '#0099cc';
const EMPTY_ARRAY = [];
const EMOJIS = ['👍', '🙏', '✅', '🚐', '📍', '⏰', '📞', '💙', '🙂', '🙌', '⚠️', '📝'];
const ROLE_ORDER = ['admin', 'dispatcher', 'driver'];

const DEMO_USERS = [
  { uid: 'admin_demo', name: 'Maya Owner', role: 'admin', online: true },
  { uid: 'dispatch_demo', name: 'Jordan Dispatch', role: 'dispatcher', online: true },
  { uid: 'dispatch_two', name: 'Sam Coordinator', role: 'dispatcher', online: false },
  { uid: 'driver_demo', name: 'Alex Driver', role: 'driver', online: true },
  { uid: 'driver_two', name: 'Taylor Driver', role: 'driver', online: false },
];

const DEMO_CONVERSATIONS = [
  {
    id: 'demo_internal_dispatch',
    type: 'internal',
    participants: ['driver_demo', 'dispatch_demo'],
    participantNames: { driver_demo: 'Alex Driver', dispatch_demo: 'Jordan Dispatch' },
    participantRoles: { driver_demo: 'driver', dispatch_demo: 'dispatcher' },
    isGroup: false,
    lastMessage: 'Pickup confirmed. ETA 8 minutes.',
    lastMessageTime: new Date(Date.now() - 8 * 60000),
    unread: { driver_demo: 0, dispatch_demo: 2 },
    createdAt: new Date(Date.now() - 86400000),
  },
  {
    id: 'demo_group_dispatch',
    type: 'internal',
    participants: ['admin_demo', 'dispatch_demo', 'dispatch_two', 'driver_demo'],
    participantNames: {
      admin_demo: 'Maya Owner',
      dispatch_demo: 'Jordan Dispatch',
      dispatch_two: 'Sam Coordinator',
      driver_demo: 'Alex Driver',
    },
    participantRoles: {
      admin_demo: 'admin',
      dispatch_demo: 'dispatcher',
      dispatch_two: 'dispatcher',
      driver_demo: 'driver',
    },
    isGroup: true,
    groupName: 'Dispatch Team',
    lastMessage: 'Please keep trip notes updated before closeout.',
    lastMessageTime: new Date(Date.now() - 55 * 60000),
    unread: { admin_demo: 0, dispatch_demo: 0, driver_demo: 1 },
    createdAt: new Date(Date.now() - 2 * 86400000),
  },
  {
    id: 'sms_13175550123',
    type: 'sms',
    participants: ['admin_demo', 'dispatch_demo'],
    participantNames: { admin_demo: 'Maya Owner', dispatch_demo: 'Jordan Dispatch' },
    participantRoles: { admin_demo: 'admin', dispatch_demo: 'dispatcher' },
    clientName: 'Evelyn Carter',
    clientPhone: '+13175550123',
    note: 'Dialysis recurring rider',
    assignedTo: 'dispatch_demo',
    lastMessage: 'Thank you, I will be ready outside.',
    lastMessageTime: new Date(Date.now() - 18 * 60000),
    unread: { admin_demo: 1, dispatch_demo: 1 },
    createdAt: new Date(Date.now() - 5 * 86400000),
  },
];

const DEMO_MESSAGES = {
  demo_internal_dispatch: [
    {
      id: 'm1',
      senderId: 'dispatch_demo',
      senderName: 'Jordan Dispatch',
      senderRole: 'dispatcher',
      text: 'Morning Alex. Your first pickup is ready early.',
      ts: new Date(Date.now() - 25 * 60000),
      status: 'read',
      isClient: false,
      replyTo: null,
      attachments: [],
    },
    {
      id: 'm2',
      senderId: 'driver_demo',
      senderName: 'Alex Driver',
      senderRole: 'driver',
      text: 'Copy. I am headed there now.',
      ts: new Date(Date.now() - 20 * 60000),
      status: 'delivered',
      isClient: false,
      replyTo: { id: 'm1', text: 'Your first pickup is ready early.', senderName: 'Jordan Dispatch' },
      attachments: [],
    },
    {
      id: 'm3',
      senderId: 'dispatch_demo',
      senderName: 'Jordan Dispatch',
      senderRole: 'dispatcher',
      text: 'Pickup confirmed. ETA 8 minutes.',
      ts: new Date(Date.now() - 8 * 60000),
      status: 'sent',
      isClient: false,
      replyTo: null,
      attachments: [{ name: 'route-note.pdf', type: 'application/pdf', size: 184220 }],
    },
  ],
  demo_group_dispatch: [
    {
      id: 'g1',
      senderId: 'admin_demo',
      senderName: 'Maya Owner',
      senderRole: 'admin',
      text: 'Please keep trip notes updated before closeout.',
      ts: new Date(Date.now() - 55 * 60000),
      status: 'delivered',
      isClient: false,
      replyTo: null,
      attachments: [],
    },
  ],
  sms_13175550123: [
    {
      id: 's1',
      senderId: 'client',
      senderName: 'Evelyn Carter',
      senderRole: 'client',
      text: 'Can you confirm my pickup time?',
      ts: new Date(Date.now() - 32 * 60000),
      status: 'delivered',
      isClient: true,
      replyTo: null,
      attachments: [],
    },
    {
      id: 's2',
      senderId: 'dispatch_demo',
      senderName: 'Jordan Dispatch',
      senderRole: 'dispatcher',
      text: 'Your driver is scheduled for 10:15 AM.',
      ts: new Date(Date.now() - 24 * 60000),
      status: 'sent',
      isClient: false,
      replyTo: null,
      attachments: [],
    },
    {
      id: 's3',
      senderId: 'client',
      senderName: 'Evelyn Carter',
      senderRole: 'client',
      text: 'Thank you, I will be ready outside.',
      ts: new Date(Date.now() - 18 * 60000),
      status: 'delivered',
      isClient: true,
      replyTo: null,
      attachments: [],
    },
  ],
};

function asDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function millis(value) {
  const date = asDate(value);
  return date ? date.getTime() : 0;
}

function formatTime(value) {
  const date = asDate(value);
  if (!date) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatThreadTime(value) {
  const date = asDate(value);
  if (!date) return '';
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000);
  if (date.toDateString() === now.toDateString()) return formatTime(date);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function dateLabel(value) {
  const date = asDate(value);
  if (!date) return '';
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000);
  if (date.toDateString() === now.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function initials(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function roleLabel(role = '') {
  return role === 'admin' ? 'Admin' : role === 'dispatcher' ? 'Dispatcher' : role === 'driver' ? 'Driver' : 'Client';
}

function roleClass(role = '') {
  if (role === 'admin') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (role === 'dispatcher') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (role === 'driver') return 'bg-slate-100 text-slate-700 border-slate-200';
  return 'bg-purple-50 text-purple-700 border-purple-200';
}

function normalizeRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  return ['admin', 'dispatcher', 'driver'].includes(normalized) ? normalized : 'driver';
}

function normalizePhone(raw = '') {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw.startsWith('+') ? `+${digits}` : `+${digits}`;
}

function displayPhone(value = '') {
  const phone = normalizePhone(value);
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone || value;
}

function fileSize(size = 0) {
  const bytes = Number(size || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function conversationName(conversation, currentUser) {
  if (!conversation) return 'Conversation';
  if (conversation.type === 'sms') return conversation.clientName || displayPhone(conversation.clientPhone) || 'Client SMS';
  if (conversation.isGroup) return conversation.groupName || 'Group Chat';
  const otherId = (conversation.participants || []).find(uid => uid !== currentUser.uid);
  return conversation.participantNames?.[otherId] || conversation.groupName || 'Team Chat';
}

function conversationRole(conversation, currentUser) {
  if (!conversation || conversation.type === 'sms') return 'client';
  if (conversation.isGroup) return 'group';
  const otherId = (conversation.participants || []).find(uid => uid !== currentUser.uid);
  return conversation.participantRoles?.[otherId] || 'team';
}

function canUseSms(user) {
  return user.role === 'admin' || user.role === 'dispatcher';
}

function isSmsConversation(conversation = {}) {
  return conversation.type === 'sms'
    || conversation.isClient === true
    || !!conversation.clientPhone
    || String(conversation.id || '').startsWith('sms_');
}

function canAccessConversation(user, conversation = {}) {
  if (!conversation?.id) return false;
  if (user.role === 'driver') {
    if (isSmsConversation(conversation)) return false;
    if (!conversation.participants?.includes(user.uid)) return false;
    const participantRoles = conversation.participantRoles || {};
    return Object.entries(participantRoles).every(([uid, role]) => (
      uid === user.uid || role === 'admin' || role === 'dispatcher'
    ));
  }
  if (isSmsConversation(conversation)) return canUseSms(user);
  return conversation.participants?.includes(user.uid) || user.role === 'admin' || user.role === 'dispatcher';
}

function isDriverRestrictedFromUser(currentUser, otherUser) {
  return currentUser.role === 'driver' && otherUser.role === 'driver' && otherUser.uid !== currentUser.uid;
}

function sortConversations(list) {
  return [...list].sort((a, b) => millis(b.lastMessageTime || b.createdAt) - millis(a.lastMessageTime || a.createdAt));
}

function sanitizeUser(input = {}) {
  const uid = String(input.uid || input.email || input.name || 'demo_user');
  return {
    uid,
    name: input.name || uid.split('@')[0] || 'Agape User',
    role: normalizeRole(input.role),
    avatar: input.avatar || '',
  };
}

function makeId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeConversationDoc(id, data = {}) {
  const type = data.type === 'sms' || data.isClient === true || data.clientPhone || String(id || '').startsWith('sms_')
    ? 'sms'
    : 'internal';
  return {
    id,
    type,
    participants: Array.isArray(data.participants) ? data.participants : [],
    participantNames: data.participantNames || {},
    participantRoles: data.participantRoles || {},
    isGroup: !!data.isGroup,
    groupName: data.groupName || '',
    clientName: data.clientName || '',
    clientPhone: data.clientPhone || '',
    note: data.note || '',
    assignedTo: data.assignedTo || '',
    lastMessage: data.lastMessage || '',
    lastMessageTime: data.lastMessageTime || data.createdAt || null,
    unread: data.unread || {},
    createdAt: data.createdAt || null,
    archived: !!data.archived,
  };
}

function normalizeMessageDoc(id, data = {}) {
  return {
    id,
    senderId: data.senderId || '',
    senderName: data.senderName || 'Unknown',
    senderRole: data.senderRole || 'client',
    text: data.text || '',
    ts: data.ts || data.timestamp || null,
    status: data.status || 'sent',
    isClient: !!data.isClient,
    replyTo: data.replyTo || null,
    attachments: Array.isArray(data.attachments) ? data.attachments : [],
  };
}

function RoleBadge({ role, text }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${roleClass(role)}`}>
      {text || roleLabel(role)}
    </span>
  );
}

function OnlineDot({ online, className = '' }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ring-2 ring-white ${online ? 'bg-emerald-500' : 'bg-slate-300'} ${className}`} />;
}

function Avatar({ name, role, online, sms }) {
  return (
    <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-black text-white ${sms ? 'bg-purple-600' : role === 'admin' ? 'bg-blue-600' : role === 'dispatcher' ? 'bg-emerald-600' : 'bg-slate-700'}`}>
      {sms ? <Smartphone size={18} /> : initials(name)}
      {typeof online === 'boolean' && <OnlineDot online={online} className="absolute -bottom-0.5 -right-0.5" />}
    </div>
  );
}

function Toasts({ toasts, onDismiss }) {
  return (
    <div className="fixed bottom-5 right-5 z-[140] flex w-[min(360px,calc(100vw-24px))] flex-col gap-2">
      {toasts.map(toast => (
        <div key={toast.id} className={`rounded-xl border bg-white p-3 shadow-xl ${toast.type === 'error' ? 'border-rose-200' : 'border-slate-200'}`}>
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg ${toast.type === 'error' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>
              {toast.type === 'error' ? <X size={16} /> : <Check size={16} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-slate-900">{toast.title}</p>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">{toast.message}</p>
            </div>
            <button type="button" onClick={() => onDismiss(toast.id)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function useAgapeChatData({ db, currentUser, demoUsers }) {
  const isDemo = !db;
  const [conversations, setConversations] = useState(isDemo ? DEMO_CONVERSATIONS : []);
  const [teamUsers, setTeamUsers] = useState(isDemo ? demoUsers : []);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!db) {
      setConversations(DEMO_CONVERSATIONS.filter(conv => canAccessConversation(currentUser, conv)));
      setTeamUsers(demoUsers);
      return undefined;
    }

    setLoadError('');
    const convQuery = currentUser.role === 'driver'
      ? query(collection(db, 'chat_conversations'), where('type', '==', 'internal'))
      : query(collection(db, 'chat_conversations'), orderBy('lastMessageTime', 'desc'));

    const unsubscribeConversations = onSnapshot(convQuery, snapshot => {
      const next = snapshot.docs
        .map(item => normalizeConversationDoc(item.id, item.data()))
        .filter(conv => !conv.archived && canAccessConversation(currentUser, conv));
      setConversations(sortConversations(next));
    }, error => {
      setLoadError(error.message || 'Unable to load conversations.');
    });

    const unsubscribePresence = onSnapshot(collection(db, 'chat_presence'), snapshot => {
      const presenceUsers = snapshot.docs.map(item => ({ uid: item.id, ...item.data() }));
      const merged = new Map();
      demoUsers.forEach(user => merged.set(user.uid, user));
      presenceUsers.forEach(user => merged.set(user.uid, {
        uid: user.uid,
        name: user.name || user.uid,
        role: normalizeRole(user.role),
        online: !!user.online,
        lastSeen: user.lastSeen || null,
      }));
      setTeamUsers(Array.from(merged.values()));
    }, error => {
      setLoadError(error.message || 'Unable to load team presence.');
    });

    return () => {
      unsubscribeConversations();
      unsubscribePresence();
    };
  }, [currentUser.role, currentUser.uid, db, demoUsers]);

  return { conversations, setConversations, teamUsers, setTeamUsers, loadError, isDemo };
}

function useConversationMessages({ db, conversationId, isDemo }) {
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setTypingUsers([]);
      return undefined;
    }

    if (isDemo || !db) {
      setMessages(DEMO_MESSAGES[conversationId] || []);
      setTypingUsers(conversationId === 'demo_internal_dispatch' ? [{ uid: 'dispatch_demo', name: 'Jordan Dispatch' }] : []);
      const timeout = setTimeout(() => setTypingUsers([]), 2200);
      return () => clearTimeout(timeout);
    }

    setError('');
    const messagesQuery = query(collection(db, 'chat_conversations', conversationId, 'messages'), orderBy('ts', 'asc'));
    const unsubscribeMessages = onSnapshot(messagesQuery, snapshot => {
      setMessages(snapshot.docs.map(item => normalizeMessageDoc(item.id, item.data())));
    }, err => setError(err.message || 'Unable to load messages.'));

    const typingQuery = collection(db, 'chat_conversations', conversationId, 'typing');
    const unsubscribeTyping = onSnapshot(typingQuery, snapshot => {
      const now = Date.now();
      setTypingUsers(snapshot.docs
        .map(item => ({ uid: item.id, ...item.data() }))
        .filter(item => item.isTyping && now - millis(item.updatedAt) < 3000));
    }, err => setError(err.message || 'Unable to load typing state.'));

    return () => {
      unsubscribeMessages();
      unsubscribeTyping();
    };
  }, [conversationId, db, isDemo]);

  return { messages, setMessages, typingUsers, error };
}

export default function AgapeCareChat({
  db,
  currentUser: currentUserInput,
  teamUsers: suppliedTeamUsers = EMPTY_ARRAY,
}) {
  const currentUser = useMemo(() => sanitizeUser(currentUserInput || DEMO_USERS[3]), [currentUserInput]);
  const demoUsers = useMemo(() => {
    const merged = new Map(DEMO_USERS.map(user => [user.uid, user]));
    suppliedTeamUsers.forEach(user => {
      if (!user?.uid) return;
      merged.set(user.uid, {
        uid: user.uid,
        name: user.name || user.uid,
        role: normalizeRole(user.role),
        online: user.online ?? false,
      });
    });
    if (!merged.has(currentUser.uid)) merged.set(currentUser.uid, { ...currentUser, online: true });
    return Array.from(merged.values());
  }, [currentUser, suppliedTeamUsers]);

  const { conversations, setConversations, teamUsers, loadError, isDemo } = useAgapeChatData({ db, currentUser, demoUsers });
  const [activeId, setActiveId] = useState('');
  const [activeView, setActiveView] = useState('chats');
  const [mobilePanel, setMobilePanel] = useState('list');
  const [filter, setFilter] = useState('all');
  const [queryText, setQueryText] = useState('');
  const [messageSearch, setMessageSearch] = useState('');
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [infoOpen, setInfoOpen] = useState(true);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newSmsOpen, setNewSmsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState('');
  const [toasts, setToasts] = useState([]);
  const [notificationReady, setNotificationReady] = useState(false);
  const textareaRef = useRef(null);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const previousMessageCountRef = useRef(0);
  const typingTimeoutRef = useRef(null);

  const allowedConversations = useMemo(
    () => sortConversations(conversations.filter(conv => canAccessConversation(currentUser, conv))),
    [conversations, currentUser]
  );

  const activeConversation = useMemo(
    () => allowedConversations.find(conv => conv.id === activeId) || allowedConversations[0] || null,
    [activeId, allowedConversations]
  );
  const activeIsSms = isSmsConversation(activeConversation);
  const activeAccessDenied = !!activeConversation && !canAccessConversation(currentUser, activeConversation);

  const { messages, setMessages, typingUsers, error: messageError } = useConversationMessages({
    db,
    conversationId: activeAccessDenied ? '' : (activeConversation?.id || ''),
    isDemo,
  });

  const usersById = useMemo(() => {
    const map = new Map();
    teamUsers.forEach(user => map.set(user.uid, user));
    map.set(currentUser.uid, { ...currentUser, online: true });
    return map;
  }, [currentUser, teamUsers]);

  const visibleConversations = useMemo(() => {
    const needle = queryText.trim().toLowerCase();
    return allowedConversations
      .filter(conv => {
        if (activeView === 'clients') return conv.type === 'sms';
        if (activeView === 'team') return false;
        return true;
      })
      .filter(conv => {
        if (filter === 'internal') return conv.type === 'internal';
        if (filter === 'sms') return conv.type === 'sms';
        if (filter === 'unread') return Number(conv.unread?.[currentUser.uid] || 0) > 0;
        return true;
      })
      .filter(conv => {
        if (!needle) return true;
        return conversationName(conv, currentUser).toLowerCase().includes(needle)
          || (canUseSms(currentUser) && String(conv.clientPhone || '').includes(needle))
          || String(conv.lastMessage || '').toLowerCase().includes(needle);
      });
  }, [activeView, allowedConversations, currentUser, filter, queryText]);

  const filteredMessages = useMemo(() => {
    if (currentUser.role === 'driver' && isSmsConversation(activeConversation)) return [];
    const needle = messageSearch.trim().toLowerCase();
    if (!needle) return messages;
    return messages.filter(message => String(message.text || '').toLowerCase().includes(needle));
  }, [activeConversation, currentUser.role, messageSearch, messages]);

  const totalUnread = useMemo(() => allowedConversations.reduce((sum, conv) => (
    sum + Number(conv.unread?.[currentUser.uid] || 0)
  ), 0), [allowedConversations, currentUser.uid]);

  const stats = useMemo(() => ({
    total: messages.length,
    sent: messages.filter(message => message.senderId === currentUser.uid).length,
    inbound: messages.filter(message => message.senderId !== currentUser.uid).length,
  }), [currentUser.uid, messages]);

  const pushToast = useCallback((title, message, type = 'success') => {
    const id = makeId('toast');
    setToasts(prev => [...prev, { id, title, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(item => item.id !== id)), 4500);
  }, []);

  useEffect(() => {
    if (!activeConversation && visibleConversations.length > 0) setActiveId(visibleConversations[0].id);
  }, [activeConversation, visibleConversations]);

  useEffect(() => {
    if (currentUser.role !== 'driver') return;
    if (activeView === 'clients') setActiveView('chats');
    if (filter === 'sms') setFilter('all');
    if (activeId && !allowedConversations.some(conv => conv.id === activeId)) {
      setActiveId(allowedConversations[0]?.id || '');
      setMobilePanel('list');
    }
    setNewSmsOpen(false);
  }, [activeId, activeView, allowedConversations, currentUser.role, filter]);

  useEffect(() => {
    if (!db || !currentUser.uid) return undefined;
    const presenceRef = doc(db, 'chat_presence', currentUser.uid);
    const writePresence = async (online) => {
      try {
        await setDoc(presenceRef, {
          uid: currentUser.uid,
          name: currentUser.name,
          role: currentUser.role,
          online,
          lastSeen: serverTimestamp(),
        }, { merge: true });
      } catch (error) {
        setActionError(error.message || 'Unable to update presence.');
      }
    };
    writePresence(true);
    const onVisibility = () => writePresence(document.visibilityState === 'visible');
    window.addEventListener('online', () => writePresence(true));
    window.addEventListener('offline', () => writePresence(false));
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      writePresence(false);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [currentUser.name, currentUser.role, currentUser.uid, db]);

  useEffect(() => {
    if (!activeConversation?.id || !db || isDemo) return undefined;
    const resetUnread = async () => {
      try {
        await updateDoc(doc(db, 'chat_conversations', activeConversation.id), {
          [`unread.${currentUser.uid}`]: 0,
        });
      } catch (error) {
        setActionError(error.message || 'Unable to reset unread count.');
      }
    };
    resetUnread();
    return undefined;
  }, [activeConversation?.id, currentUser.uid, db, isDemo]);

  useEffect(() => {
    const countIncreased = messages.length > previousMessageCountRef.current;
    previousMessageCountRef.current = messages.length;
    if (countIncreased) {
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
    }
  }, [messages.length]);

  useEffect(() => {
    if (!notificationReady && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
        .then(permission => setNotificationReady(permission === 'granted'))
        .catch(() => setNotificationReady(false));
    } else if ('Notification' in window) {
      setNotificationReady(Notification.permission === 'granted');
    }
  }, [notificationReady]);

  useEffect(() => {
    if (!messages.length || document.visibilityState === 'visible' || !notificationReady) return;
    const newest = messages[messages.length - 1];
    if (newest.senderId === currentUser.uid) return;
    try {
      new Notification(`New message from ${newest.senderName}`, { body: newest.text });
    } catch {
      setNotificationReady(false);
    }
  }, [currentUser.uid, messages, notificationReady]);

  const updateTyping = useCallback(async (isTyping) => {
    if (!activeConversation?.id) return;
    clearTimeout(typingTimeoutRef.current);
    if (!db || isDemo) return;
    try {
      await setDoc(doc(db, 'chat_conversations', activeConversation.id, 'typing', currentUser.uid), {
        uid: currentUser.uid,
        name: currentUser.name,
        role: currentUser.role,
        isTyping,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      if (isTyping) {
        typingTimeoutRef.current = setTimeout(() => {
          setDoc(doc(db, 'chat_conversations', activeConversation.id, 'typing', currentUser.uid), {
            isTyping: false,
            updatedAt: serverTimestamp(),
          }, { merge: true }).catch(() => {});
        }, 2000);
      }
    } catch (error) {
      setActionError(error.message || 'Unable to update typing status.');
    }
  }, [activeConversation?.id, currentUser.name, currentUser.role, currentUser.uid, db, isDemo]);

  const openConversation = useCallback((conv) => {
    if (!canAccessConversation(currentUser, conv)) {
      setActionError('Drivers do not have access to client SMS conversations.');
      setMobilePanel('list');
      return;
    }
    setActiveId(conv.id);
    setMobilePanel('chat');
    setActionError('');
  }, [currentUser]);

  const createInternalConversation = useCallback(async (targetUser) => {
    if (isDriverRestrictedFromUser(currentUser, targetUser)) {
      setActionError('Drivers can only message dispatchers and admins.');
      return;
    }
    const existing = conversations.find(conv => (
      conv.type === 'internal'
      && !conv.isGroup
      && conv.participants.includes(currentUser.uid)
      && conv.participants.includes(targetUser.uid)
    ));
    if (existing) {
      openConversation(existing);
      return;
    }

    const id = makeId('internal');
    const conversation = {
      id,
      type: 'internal',
      participants: [currentUser.uid, targetUser.uid],
      participantNames: { [currentUser.uid]: currentUser.name, [targetUser.uid]: targetUser.name },
      participantRoles: { [currentUser.uid]: currentUser.role, [targetUser.uid]: targetUser.role },
      isGroup: false,
      groupName: '',
      lastMessage: 'Conversation started',
      lastMessageTime: new Date(),
      unread: { [currentUser.uid]: 0, [targetUser.uid]: 0 },
      createdAt: new Date(),
    };

    try {
      if (db && !isDemo) {
        await setDoc(doc(db, 'chat_conversations', id), {
          ...conversation,
          lastMessageTime: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      } else {
        setConversations(prev => sortConversations([conversation, ...prev]));
      }
      setActiveId(id);
      setMobilePanel('chat');
      pushToast('Conversation created', `Chat with ${targetUser.name} is ready.`);
    } catch (error) {
      setActionError(error.message || 'Unable to create conversation.');
      pushToast('Conversation failed', error.message || 'Unable to create conversation.', 'error');
    }
  }, [conversations, currentUser, db, isDemo, openConversation, pushToast, setConversations]);

  const createSmsConversation = useCallback(async ({ phone, clientName, note }) => {
    if (!canUseSms(currentUser)) {
      setActionError('Drivers do not have access to client SMS.');
      return;
    }
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) {
      setActionError('Enter a valid client phone number.');
      return;
    }
    const id = `sms_${cleanPhone.replace(/\D/g, '')}`;
    const conversation = {
      id,
      type: 'sms',
      participants: [currentUser.uid],
      participantNames: { [currentUser.uid]: currentUser.name },
      participantRoles: { [currentUser.uid]: currentUser.role },
      isGroup: false,
      clientName: clientName || displayPhone(cleanPhone),
      clientPhone: cleanPhone,
      note: note || '',
      assignedTo: currentUser.uid,
      lastMessage: 'SMS conversation created',
      lastMessageTime: new Date(),
      unread: { [currentUser.uid]: 0 },
      createdAt: new Date(),
    };

    try {
      if (db && !isDemo) {
        await setDoc(doc(db, 'chat_conversations', id), {
          ...conversation,
          lastMessageTime: serverTimestamp(),
          createdAt: serverTimestamp(),
        }, { merge: true });
      } else {
        setConversations(prev => sortConversations([conversation, ...prev.filter(item => item.id !== id)]));
      }
      setActiveId(id);
      setActiveView('clients');
      setMobilePanel('chat');
      pushToast('SMS thread ready', `${conversation.clientName} is available in Clients.`);
    } catch (error) {
      setActionError(error.message || 'Unable to create SMS conversation.');
      pushToast('SMS setup failed', error.message || 'Unable to create SMS conversation.', 'error');
    }
  }, [currentUser, db, isDemo, pushToast, setConversations]);

  const sendTelnyxMessage = useCallback(async (to, text) => {
    if (!to) throw new Error('Missing client phone number.');
    if (!text?.trim()) throw new Error('Enter a message before sending SMS.');
    const sendSms = httpsCallable(functions, 'sendSms');
    const result = await sendSms({
      to,
      text,
      conversationId: activeConversation?.id || '',
    });
    const payload = result?.data || {};
    if (payload.success === false) {
      throw new Error(payload.error || 'Telnyx message failed.');
    }
    return payload;
  }, [activeConversation?.id]);

  const sendMessage = useCallback(async () => {
    if (!activeConversation) return;
    if (!canAccessConversation(currentUser, activeConversation)) {
      setActionError('Drivers do not have access to client SMS.');
      setMobilePanel('list');
      return;
    }
    const text = draft.trim();
    if (!text && attachments.length === 0) return;
    setSending(true);
    setActionError('');
    const attachmentPayload = attachments.map(file => ({ name: file.name, type: file.type || 'file', size: file.size || 0 }));
    const tempMessage = {
      id: makeId('local'),
      senderId: currentUser.uid,
      senderName: currentUser.name,
      senderRole: currentUser.role,
      text,
      ts: new Date(),
      status: activeConversation.type === 'sms' ? 'sending' : 'sent',
      isClient: false,
      replyTo,
      attachments: attachmentPayload,
    };
    setDraft('');
    setAttachments([]);
    setReplyTo(null);
    setEmojiOpen(false);
    updateTyping(false);

    try {
      const telnyxResult = activeConversation.type === 'sms'
        ? await sendTelnyxMessage(activeConversation.clientPhone, text)
        : null;

      if (db && !isDemo) {
        const messageRef = await addDoc(collection(db, 'chat_conversations', activeConversation.id, 'messages'), {
          senderId: currentUser.uid,
          senderName: currentUser.name,
          senderRole: currentUser.role,
          text,
          ts: serverTimestamp(),
          status: activeConversation.type === 'sms' ? (telnyxResult?.status || 'queued') : 'sent',
          telnyxMessageId: telnyxResult?.messageId || '',
          isClient: false,
          replyTo: replyTo || null,
          attachments: attachmentPayload,
        });
        const unreadUpdates = {};
        (activeConversation.participants || []).forEach(uid => {
          if (uid !== currentUser.uid) unreadUpdates[`unread.${uid}`] = increment(1);
        });
        await updateDoc(doc(db, 'chat_conversations', activeConversation.id), {
          lastMessage: text || `${attachmentPayload.length} attachment${attachmentPayload.length === 1 ? '' : 's'}`,
          lastMessageTime: serverTimestamp(),
          ...unreadUpdates,
        });
        await updateDoc(messageRef, { status: 'delivered' }).catch(() => {});
      } else {
        setMessages(prev => [...prev, { ...tempMessage, status: activeConversation.type === 'sms' ? 'sent' : 'delivered' }]);
        setConversations(prev => sortConversations(prev.map(conv => (
          conv.id === activeConversation.id
            ? { ...conv, lastMessage: text || 'Attachment sent', lastMessageTime: new Date() }
            : conv
        ))));
      }

      pushToast('Message sent', activeConversation.type === 'sms' ? 'Sent through Telnyx.' : 'Delivered to the conversation.');
    } catch (error) {
      setDraft(text);
      setAttachments(attachments);
      setReplyTo(replyTo);
      setActionError(error.message || 'Message failed to send.');
      pushToast('Message failed', error.message || 'Message failed to send.', 'error');
      if (!db || isDemo) setMessages(prev => [...prev, { ...tempMessage, status: 'failed' }]);
    } finally {
      setSending(false);
    }
  }, [activeConversation, attachments, currentUser, db, draft, isDemo, pushToast, replyTo, sendTelnyxMessage, setConversations, setMessages, updateTyping]);

  const archiveConversation = useCallback(async () => {
    if (!activeConversation || currentUser.role !== 'admin') return;
    try {
      if (db && !isDemo) {
        await updateDoc(doc(db, 'chat_conversations', activeConversation.id), { archived: true });
      } else {
        setConversations(prev => prev.filter(conv => conv.id !== activeConversation.id));
      }
      pushToast('Archived', 'Conversation moved out of the active inbox.');
    } catch (error) {
      setActionError(error.message || 'Unable to archive conversation.');
      pushToast('Archive failed', error.message || 'Unable to archive conversation.', 'error');
    }
  }, [activeConversation, currentUser.role, db, isDemo, pushToast, setConversations]);

  const exportTranscript = useCallback(() => {
    try {
      const lines = messages.map(message => `[${formatThreadTime(message.ts)}] ${message.senderName}: ${message.text}`).join('\n');
      navigator.clipboard?.writeText(lines);
      pushToast('Transcript copied', 'Conversation transcript copied to clipboard.');
    } catch (error) {
      setActionError(error.message || 'Unable to export transcript.');
    }
  }, [messages, pushToast]);

  const sendTripReminder = useCallback(async () => {
    if (!activeConversation || activeConversation.type !== 'sms') return;
    const reminder = `Agape Care reminder: your transportation is scheduled. Reply here if you need assistance.`;
    setDraft(reminder);
    pushToast('Reminder prepared', 'Review and press send when ready.');
  }, [activeConversation, pushToast]);

  const handleFiles = (event) => {
    const files = Array.from(event.target.files || []);
    setAttachments(prev => [...prev, ...files.map(file => ({ name: file.name, type: file.type, size: file.size }))]);
    event.target.value = '';
  };

  const groupedUsers = useMemo(() => {
    const allowed = teamUsers.filter(user => user.uid !== currentUser.uid && !isDriverRestrictedFromUser(currentUser, user));
    return ROLE_ORDER.reduce((acc, role) => {
      acc[role] = allowed.filter(user => user.role === role).sort((a, b) => a.name.localeCompare(b.name));
      return acc;
    }, {});
  }, [currentUser, teamUsers]);

  const renderListContent = () => {
    if (activeView === 'team') {
      return (
        <div className="space-y-5 p-3">
          {ROLE_ORDER.map(role => groupedUsers[role]?.length > 0 && (
            <section key={role}>
              <h3 className="mb-2 px-2 text-[11px] font-black uppercase tracking-wider text-slate-400">{roleLabel(role)}s</h3>
              <div className="space-y-1">
                {groupedUsers[role].map(user => (
                  <button key={user.uid} type="button" onClick={() => createInternalConversation(user)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50">
                    <Avatar name={user.name} role={user.role} online={!!user.online} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-slate-900">{user.name}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <RoleBadge role={user.role} />
                        <span className="text-[11px] font-bold text-slate-400">{user.online ? 'Online' : 'Offline'}</span>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-slate-300" />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-1 p-2">
        {visibleConversations.length === 0 ? (
          <div className="flex min-h-[280px] items-center justify-center p-8 text-center">
            <div>
              <MessageCircle className="mx-auto text-slate-300" size={34} />
              <p className="mt-3 text-sm font-black text-slate-700">No conversations found</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">Start a chat or adjust your filters.</p>
            </div>
          </div>
        ) : visibleConversations.map(conv => {
          const name = conversationName(conv, currentUser);
          const role = conversationRole(conv, currentUser);
          const otherId = conv.participants?.find(uid => uid !== currentUser.uid);
          const convIsSms = isSmsConversation(conv);
          const online = convIsSms ? undefined : !!usersById.get(otherId)?.online;
          const unread = Number(conv.unread?.[currentUser.uid] || 0);
          return (
            <button key={conv.id} type="button" onClick={() => openConversation(conv)} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left ${activeConversation?.id === conv.id ? 'border-blue-200 bg-blue-50' : 'border-transparent hover:bg-slate-50'}`}>
              <Avatar name={name} role={role} online={online} sms={convIsSms} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-black text-slate-900">{name}</p>
                  {conv.type === 'sms' ? <RoleBadge role="client" text="SMS · Telnyx" /> : <RoleBadge role={role} text={role === 'group' ? 'Group' : roleLabel(role)} />}
                  <span className="ml-auto shrink-0 text-[11px] font-bold text-slate-400">{formatThreadTime(conv.lastMessageTime)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <p className={`truncate text-xs ${unread ? 'font-black text-slate-700' : 'font-semibold text-slate-400'}`}>{conv.lastMessage || 'No messages yet'}</p>
                  {unread > 0 && <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-black text-white">{unread > 99 ? '99+' : unread}</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const renderMessage = (message, index) => {
    const previous = filteredMessages[index - 1];
    const showDate = !previous || asDate(previous.ts)?.toDateString() !== asDate(message.ts)?.toDateString();
    const mine = message.senderId === currentUser.uid;
    const smsInbound = activeConversation?.type === 'sms' && message.isClient;
    return (
      <React.Fragment key={message.id}>
        {showDate && (
          <div className="my-3 flex justify-center">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black text-slate-500 shadow-sm">{dateLabel(message.ts)}</span>
          </div>
        )}
        <div className={`group flex ${mine ? 'justify-end' : 'justify-start'} py-1`}>
          <button type="button" onDoubleClick={() => setReplyTo({ id: message.id, text: message.text, senderName: message.senderName })} className={`max-w-[82%] text-left sm:max-w-[70%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
            {!mine && (
              <div className="mb-1 flex items-center gap-2 px-1">
                <span className="text-[11px] font-black text-slate-600">{message.senderName}</span>
                <RoleBadge role={message.senderRole} text={smsInbound ? '📱 Client SMS' : roleLabel(message.senderRole)} />
              </div>
            )}
            <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${mine ? 'rounded-br-md text-white' : smsInbound ? 'rounded-bl-md border border-purple-100 bg-purple-50 text-slate-900' : 'rounded-bl-md border border-slate-200 bg-white text-slate-900'}`} style={mine ? { backgroundColor: BRAND } : undefined}>
              {message.replyTo && (
                <div className={`mb-2 rounded-lg border-l-4 px-2 py-1 text-xs ${mine ? 'border-white/60 bg-white/15 text-white/90' : 'border-blue-300 bg-slate-50 text-slate-600'}`}>
                  <span className="font-black">{message.replyTo.senderName}</span>
                  <p className="truncate">{message.replyTo.text}</p>
                </div>
              )}
              <p className="whitespace-pre-wrap break-words">{message.text}</p>
              {message.attachments?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {message.attachments.map((file, fileIndex) => (
                    <span key={`${file.name}-${fileIndex}`} className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${mine ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      <File size={12} /> {file.name} · {fileSize(file.size)}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className={`mt-1 flex items-center gap-1 px-1 text-[10px] font-bold ${mine ? 'text-slate-400' : 'text-slate-400'}`}>
              <span>{formatTime(message.ts)}</span>
              {mine && (
                message.status === 'read' ? <CheckCheck size={12} className="text-emerald-500" />
                  : message.status === 'delivered' ? <CheckCheck size={12} />
                    : message.status === 'failed' ? <X size={12} className="text-rose-500" />
                      : <Check size={12} />
              )}
            </div>
          </button>
        </div>
      </React.Fragment>
    );
  };

  return (
    <section className="relative flex h-full min-h-0 w-full overflow-hidden bg-slate-100 text-slate-950">
      <aside className={`${mobilePanel === 'list' ? 'flex' : 'hidden'} w-full shrink-0 flex-col border-r border-slate-200 bg-white md:flex md:w-[300px]`}>
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-lg" style={{ backgroundColor: BRAND }}>
              <Shield size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-black text-slate-950">Agape Care Chat</h1>
                {totalUnread > 0 && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white">{totalUnread}</span>}
              </div>
              <p className="text-xs font-bold text-slate-500">NEMT Pro Command Center</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
            <OnlineDot online />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-black text-slate-800">{currentUser.name}</p>
              <RoleBadge role={currentUser.role} />
            </div>
            <Bell size={15} className={notificationReady ? 'text-blue-500' : 'text-slate-300'} />
          </div>
          <label className="mt-3 flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100">
            <Search size={16} className="text-slate-400" />
            <input value={queryText} onChange={event => setQueryText(event.target.value)} placeholder="Search name or phone" className="w-full border-0 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400" />
          </label>
          <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">
            {['all', 'internal', ...(canUseSms(currentUser) ? ['sms'] : []), 'unread'].map(item => (
              <button key={item} type="button" onClick={() => setFilter(item)} className={`h-8 rounded-lg text-[11px] font-black capitalize ${filter === item ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>
                {item}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            {['chats', 'team', ...(canUseSms(currentUser) ? ['clients'] : [])].map(item => (
              <button key={item} type="button" onClick={() => setActiveView(item)} className={`h-9 rounded-lg text-xs font-black capitalize ${activeView === item ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>
                {item}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setNewChatOpen(true)} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 text-xs font-black text-white">
              <Plus size={15} /> New Chat
            </button>
            {canUseSms(currentUser) && (
              <button type="button" onClick={() => setNewSmsOpen(true)} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700">
                <Phone size={15} /> New SMS
              </button>
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{renderListContent()}</div>
      </aside>

      <main className={`${mobilePanel === 'chat' ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col md:flex`}>
        {activeAccessDenied ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <div className="max-w-sm">
              <Shield className="mx-auto text-rose-400" size={44} />
              <h2 className="mt-4 text-lg font-black text-slate-900">Access blocked</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">Drivers cannot access client SMS conversations or client phone numbers.</p>
              <button type="button" onClick={() => { setActiveId(allowedConversations[0]?.id || ''); setMobilePanel('list'); }} className="mt-4 h-10 rounded-xl bg-slate-950 px-4 text-sm font-black text-white">
                Back to team chat
              </button>
            </div>
          </div>
        ) : activeConversation ? (
          <>
            <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-4">
              <button type="button" onClick={() => setMobilePanel('list')} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 md:hidden">
                <ArrowLeft size={19} />
              </button>
              <Avatar name={conversationName(activeConversation, currentUser)} role={conversationRole(activeConversation, currentUser)} sms={activeConversation.type === 'sms'} online={activeConversation.type === 'sms' ? undefined : true} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-base font-black text-slate-950">{conversationName(activeConversation, currentUser)}</h2>
                  {activeConversation.type === 'sms' ? <RoleBadge role="client" text="SMS · Telnyx" /> : <RoleBadge role={conversationRole(activeConversation, currentUser)} text={activeConversation.isGroup ? 'Group' : roleLabel(conversationRole(activeConversation, currentUser))} />}
                </div>
                <p className="truncate text-xs font-bold text-slate-500">{activeConversation.type === 'sms' ? displayPhone(activeConversation.clientPhone) : 'Real-time internal chat'}</p>
              </div>
              <button type="button" onClick={() => setShowMessageSearch(prev => !prev)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <Search size={18} />
              </button>
              <button type="button" onClick={() => setInfoOpen(prev => !prev)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <Info size={18} />
              </button>
            </header>
            {showMessageSearch && (
              <div className="border-b border-slate-200 bg-white px-4 py-2">
                <input value={messageSearch} onChange={event => setMessageSearch(event.target.value)} placeholder="Search within messages" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none focus:bg-white" />
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5">
              {(loadError || messageError || actionError) && (
                <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
                  {actionError || messageError || loadError}
                </div>
              )}
              {filteredMessages.map(renderMessage)}
              {typingUsers.filter(user => user.uid !== currentUser.uid).length > 0 && (
                <div className="mt-2 flex items-center gap-2 text-xs font-bold text-slate-500">
                  <span>{typingUsers.filter(user => user.uid !== currentUser.uid).map(user => user.name).join(', ')} typing</span>
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:240ms]" />
                  </span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <footer className="shrink-0 border-t border-slate-200 bg-white px-3 pt-2 pb-[calc(12px+env(safe-area-inset-bottom,0px))] sm:px-4">
              {activeConversation.type === 'sms' && (
                <p className="mb-2 text-xs font-black text-purple-700">SMS to {activeConversation.clientName || displayPhone(activeConversation.clientPhone)} via Telnyx</p>
              )}
              {replyTo && (
                <div className="mb-2 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-blue-700">Replying to {replyTo.senderName}</p>
                    <p className="truncate text-xs font-semibold text-blue-600">{replyTo.text}</p>
                  </div>
                  <button type="button" onClick={() => setReplyTo(null)}><X size={16} /></button>
                </div>
              )}
              {attachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {attachments.map((file, index) => (
                    <span key={`${file.name}-${index}`} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                      <File size={12} /> {file.name} · {fileSize(file.size)}
                      <button type="button" onClick={() => setAttachments(prev => prev.filter((_, itemIndex) => itemIndex !== index))}><X size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
              {emojiOpen && (
                <div className="mb-2 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-2">
                  {EMOJIS.map(emoji => <button key={emoji} type="button" onClick={() => setDraft(prev => `${prev}${emoji}`)} className="h-8 w-8 rounded-lg hover:bg-white">{emoji}</button>)}
                </div>
              )}
              <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100">
                <button type="button" onClick={() => setEmojiOpen(prev => !prev)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-white"><Smile size={19} /></button>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-white"><Paperclip size={19} /></button>
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFiles} />
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={event => {
                    setDraft(event.target.value);
                    updateTyping(event.target.value.trim().length > 0);
                    event.target.style.height = 'auto';
                    event.target.style.height = `${Math.min(event.target.scrollHeight, 128)}px`;
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                  rows={1}
                  placeholder={activeConversation.type === 'sms' ? 'Text client' : 'Message team'}
                  className="max-h-32 min-h-[40px] flex-1 resize-none border-0 bg-transparent px-1 py-2 text-[16px] font-semibold leading-snug outline-none placeholder:text-slate-400 sm:text-sm"
                />
                <button type="button" disabled={sending || (!draft.trim() && attachments.length === 0)} onClick={sendMessage} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white disabled:bg-slate-300" style={!sending && (draft.trim() || attachments.length) ? { backgroundColor: BRAND } : undefined}>
                  {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </div>
            </footer>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <div>
              <MessageCircle className="mx-auto text-slate-300" size={44} />
              <h2 className="mt-4 text-lg font-black text-slate-900">Select a conversation</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">Choose a chat or start a new one.</p>
            </div>
          </div>
        )}
      </main>

      {infoOpen && activeConversation && !activeAccessDenied && (
        <aside className="hidden w-[240px] shrink-0 flex-col border-l border-slate-200 bg-white lg:flex">
          <div className="border-b border-slate-200 p-4 text-center">
            <Avatar name={conversationName(activeConversation, currentUser)} role={conversationRole(activeConversation, currentUser)} sms={activeConversation.type === 'sms'} />
            <h3 className="mt-3 text-base font-black text-slate-950">{conversationName(activeConversation, currentUser)}</h3>
            <p className="mt-1 text-xs font-bold text-slate-500">{activeConversation.type === 'sms' ? displayPhone(activeConversation.clientPhone) : 'Internal conversation'}</p>
            {activeConversation.type === 'sms' && <p className="mt-2 rounded-full bg-purple-50 px-3 py-1 text-[11px] font-black text-purple-700">Powered by Telnyx · secure server number</p>}
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <section>
              <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400">Quick actions</h4>
              <div className="mt-2 space-y-2">
                {activeConversation.type === 'sms' && <button type="button" onClick={sendTripReminder} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-purple-50 text-xs font-black text-purple-700"><Smartphone size={15} /> Send Trip Reminder</button>}
                <button type="button" onClick={exportTranscript} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-100 text-xs font-black text-slate-700"><Hash size={15} /> Export Transcript</button>
                <button type="button" onClick={() => setShowMessageSearch(true)} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-100 text-xs font-black text-slate-700"><Search size={15} /> Search Messages</button>
                {currentUser.role === 'admin' && <button type="button" onClick={archiveConversation} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-rose-50 text-xs font-black text-rose-700"><Archive size={15} /> Archive</button>}
              </div>
            </section>
            <section>
              <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400">Stats</h4>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[
                  ['Total', stats.total],
                  ['Sent', stats.sent],
                  ['Inbound', stats.inbound],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-slate-50 p-2 text-center">
                    <p className="text-lg font-black text-slate-900">{value}</p>
                    <p className="text-[10px] font-bold text-slate-400">{label}</p>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400">Participants</h4>
              <div className="mt-2 space-y-2">
                {(activeConversation.participants || []).map(uid => (
                  <div key={uid} className="flex items-center gap-2 rounded-xl bg-slate-50 p-2">
                    <UserRound size={16} className="text-slate-400" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black text-slate-800">{activeConversation.participantNames?.[uid] || usersById.get(uid)?.name || uid}</p>
                      <p className="text-[10px] font-bold text-slate-400">{roleLabel(activeConversation.participantRoles?.[uid] || usersById.get(uid)?.role)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </aside>
      )}

      {newChatOpen && (
        <NewChatModal users={teamUsers.filter(user => user.uid !== currentUser.uid && !isDriverRestrictedFromUser(currentUser, user))} onClose={() => setNewChatOpen(false)} onStart={(user) => { setNewChatOpen(false); createInternalConversation(user); }} />
      )}
      {newSmsOpen && canUseSms(currentUser) && (
        <NewSmsModal onClose={() => setNewSmsOpen(false)} onCreate={(payload) => { setNewSmsOpen(false); createSmsConversation(payload); }} />
      )}
      <Toasts toasts={toasts} onDismiss={(id) => setToasts(prev => prev.filter(item => item.id !== id))} />
      {isDemo && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-full border border-blue-200 bg-white/90 px-3 py-1 text-[11px] font-black text-blue-700 shadow-sm">
          DEMO MODE · Firebase not connected
        </div>
      )}
    </section>
  );
}

function NewChatModal({ users, onClose, onStart }) {
  const [search, setSearch] = useState('');
  const filtered = users.filter(user => `${user.name} ${user.role}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[86dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-4">
          <Users size={21} className="text-blue-600" />
          <div><h2 className="text-base font-black">New Chat</h2><p className="text-xs font-bold text-slate-500">Start an internal conversation</p></div>
          <button type="button" onClick={onClose} className="ml-auto rounded-xl bg-slate-100 p-2"><X size={18} /></button>
        </div>
        <div className="p-4">
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search team" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {filtered.map(user => (
            <button key={user.uid} type="button" onClick={() => onStart(user)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50">
              <Avatar name={user.name} role={user.role} online={!!user.online} />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{user.name}</p><RoleBadge role={user.role} /></div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function NewSmsModal({ onClose, onCreate }) {
  const [phone, setPhone] = useState('');
  const [clientName, setClientName] = useState('');
  const [note, setNote] = useState('');
  const cleanPhone = normalizePhone(phone);
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-4">
          <Smartphone size={21} className="text-purple-600" />
          <div><h2 className="text-base font-black">New SMS</h2><p className="text-xs font-bold text-slate-500">Client conversation via Telnyx</p></div>
          <button type="button" onClick={onClose} className="ml-auto rounded-xl bg-slate-100 p-2"><X size={18} /></button>
        </div>
        <div className="space-y-3 p-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
            Outbound messages use the secure Telnyx number configured on the server.
          </div>
          <label className="block"><span className="text-xs font-black uppercase text-slate-500">Phone number</span><input value={phone} onChange={event => setPhone(event.target.value)} placeholder="+1 317 555 0123" className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none" /></label>
          <label className="block"><span className="text-xs font-black uppercase text-slate-500">Client name</span><input value={clientName} onChange={event => setClientName(event.target.value)} placeholder="Optional" className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none" /></label>
          <label className="block"><span className="text-xs font-black uppercase text-slate-500">Internal note</span><textarea value={note} onChange={event => setNote(event.target.value)} rows={3} placeholder="Optional" className="mt-1 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none" /></label>
          <button type="button" disabled={!cleanPhone} onClick={() => onCreate({ phone: cleanPhone, clientName, note })} className="h-12 w-full rounded-xl bg-purple-600 text-sm font-black text-white disabled:bg-slate-300">Create SMS Thread</button>
        </div>
      </div>
    </div>
  );
}

/*
BACKEND WEBHOOK: Express.js Telnyx inbound SMS route

Copy this route into your Node.js/Express backend. It expects Firebase Admin SDK
to be initialized already as `admin`.

const express = require('express');
const admin = require('firebase-admin');

const router = express.Router();

router.post('/webhooks/telnyx', express.json({ type: ['application/json', 'application/vnd.api+json'] }), async (req, res) => {
  try {
    const db = admin.firestore();
    const payload = req.body || {};
    const event = payload.data || payload;
    const message = event.payload || event;

    const fromRaw = message.from?.phone_number || message.from || message.phone_number || '';
    const text = message.text || message.body || '';
    const phoneDigits = String(fromRaw).replace(/\\D/g, '');
    const phone = phoneDigits.length === 10
      ? `+1${phoneDigits}`
      : phoneDigits.startsWith('1')
        ? `+${phoneDigits}`
        : `+${phoneDigits}`;

    if (!phoneDigits || !text) {
      return res.status(400).json({ ok: false, error: 'Missing inbound phone or message text.' });
    }

    const conversationId = `sms_${phone.replace(/\\D/g, '')}`;
    const conversationRef = db.collection('chat_conversations').doc(conversationId);
    const conversationSnap = await conversationRef.get();
    const conversationData = conversationSnap.exists ? conversationSnap.data() : {};
    const participants = Array.isArray(conversationData.participants) ? conversationData.participants : [];
    const assignedStaff = participants.length > 0 ? participants : (conversationData.assignedTo ? [conversationData.assignedTo] : []);
    const unreadUpdates = {};
    assignedStaff.forEach((uid) => {
      unreadUpdates[`unread.${uid}`] = admin.firestore.FieldValue.increment(1);
    });

    const batch = db.batch();
    if (!conversationSnap.exists) {
      batch.set(conversationRef, {
        id: conversationId,
        type: 'sms',
        participants: assignedStaff,
        participantNames: conversationData.participantNames || {},
        participantRoles: conversationData.participantRoles || {},
        isGroup: false,
        clientName: conversationData.clientName || phone,
        clientPhone: phone,
        note: conversationData.note || '',
        assignedTo: conversationData.assignedTo || assignedStaff[0] || '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        unread: {},
      }, { merge: true });
    }

    const messageRef = conversationRef.collection('messages').doc();
    batch.set(messageRef, {
      senderId: 'client',
      senderName: conversationData.clientName || phone,
      senderRole: 'client',
      text,
      ts: admin.firestore.FieldValue.serverTimestamp(),
      status: 'delivered',
      isClient: true,
      replyTo: null,
      attachments: [],
      telnyxEventId: event.id || payload.id || null,
    });

    batch.set(conversationRef, {
      id: conversationId,
      type: 'sms',
      clientPhone: phone,
      clientName: conversationData.clientName || phone,
      lastMessage: text,
      lastMessageTime: admin.firestore.FieldValue.serverTimestamp(),
      ...unreadUpdates,
    }, { merge: true });

    await batch.commit();
    return res.status(200).json({ ok: true, conversationId });
  } catch (error) {
    console.error('Telnyx webhook error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Webhook failed.' });
  }
});

module.exports = router;
*/
