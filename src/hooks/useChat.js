import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  deleteField,
  doc,
  endBefore,
  getDocs,
  limit,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../config/firebase';
import {
  CHAT_PAGE_SIZE,
  makeConversationId,
  normalizeEmail,
  normalizePhone,
  readableName,
  uniqueContacts,
} from '../utils/chatUtils';

const CONVERSATIONS_REF = doc(db, 'chatData', 'conversations');
const TEAM_MESSAGES = 'chat_messages';
const SMS_LOGS = 'smsLogs';
const TYPING = 'chat_typing';
const PRESENCE = 'presence';

function patchConversation(conversationId, patch) {
  return setDoc(CONVERSATIONS_REF, {
    conversations: {
      [conversationId]: patch,
    },
  }, { merge: true });
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function normalizeConversation(id, data) {
  const last = data?.lastMessage || {};
  return {
    id,
    ...data,
    participants: Array.isArray(data?.participants) ? data.participants.map(normalizeEmail).filter(Boolean) : [],
    lastMessageText: typeof last === 'string' ? last : (last?.text || ''),
    lastMessageSender: typeof last === 'string' ? '' : normalizeEmail(last?.sender || ''),
    lastMessageAt: typeof last === 'string' ? data?.updatedAt : (last?.timestamp || data?.updatedAt),
    updatedSort: timestampMillis(data?.updatedAt || last?.timestamp || data?.createdAt),
    unread: data?.unread || {},
  };
}

function sortMessages(messages) {
  return [...messages].sort((a, b) => {
    const diff = timestampMillis(a.timestamp) - timestampMillis(b.timestamp);
    return diff || String(a.id).localeCompare(String(b.id));
  });
}

function mergeMessages(existing, incoming) {
  const map = new Map(existing.map(message => [message.id, message]));
  incoming.forEach(message => map.set(message.id, message));
  return sortMessages(Array.from(map.values()));
}

function smsPeerPhone(message = {}) {
  const direction = String(message.direction || '').toLowerCase();
  if (message.phone) return normalizePhone(message.phone);
  if (direction === 'outbound') return normalizePhone(message.to || message.recipient || '');
  if (direction === 'inbound') return normalizePhone(message.from || message.senderPhone || '');
  return normalizePhone(message.to || message.from || '');
}

export default function useChat({
  userEmail,
  role,
  drivers = [],
  dispatchers = [],
  trips = [],
}) {
  const normalizedUser = normalizeEmail(userEmail);
  const [users, setUsers] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [clientLogConversations, setClientLogConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [olderCursor, setOlderCursor] = useState(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [messageError, setMessageError] = useState('');
  const [typingUsers, setTypingUsers] = useState([]);
  const [presenceByEmail, setPresenceByEmail] = useState({});
  const [filter, setFilter] = useState('all');
  const activeRef = useRef(null);
  const typingTimerRef = useRef(null);
  const latestMessageIdsRef = useRef(new Set());

  const contacts = useMemo(() => {
    const tripContacts = trips.flatMap(trip => [
      trip?.driverEmail ? { email: trip.driverEmail, name: trip.driverName, role: 'driver' } : null,
      trip?.dispatcherEmail ? { email: trip.dispatcherEmail, name: trip.dispatcherName, role: 'dispatcher' } : null,
    ]).filter(Boolean);
    const self = normalizedUser ? [{ email: normalizedUser, name: readableName(normalizedUser), role: role || 'team' }] : [];
    return uniqueContacts(drivers, dispatchers, users, tripContacts, self);
  }, [dispatchers, drivers, normalizedUser, role, trips, users]);

  const contactsByEmail = useMemo(() => {
    const map = new Map();
    contacts.forEach(contact => map.set(normalizeEmail(contact.email), contact));
    return map;
  }, [contacts]);

  const mergedConversations = useMemo(() => {
    if (clientLogConversations.length === 0) return conversations;
    const map = new Map(conversations.map(conversation => [conversation.id, conversation]));
    clientLogConversations.forEach(conversation => {
      if (!map.has(conversation.id)) map.set(conversation.id, conversation);
    });
    return Array.from(map.values()).sort((a, b) => b.updatedSort - a.updatedSort);
  }, [clientLogConversations, conversations]);

  const activeConversation = useMemo(
    () => mergedConversations.find(conversation => conversation.id === activeConversationId) || null,
    [activeConversationId, mergedConversations]
  );

  activeRef.current = activeConversation;

  useEffect(() => {
    let cancelled = false;
    getDocs(collection(db, 'users'))
      .then(snapshot => {
        if (cancelled) return;
        setUsers(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!normalizedUser) return undefined;
    const presenceRef = doc(db, PRESENCE, normalizedUser);
    const writePresence = (state) => setDoc(presenceRef, {
      email: normalizedUser,
      state,
      updatedAt: serverTimestamp(),
    }, { merge: true }).catch(() => {});

    writePresence(document.visibilityState === 'visible' && navigator.onLine ? 'online' : 'away');
    const onVisibility = () => writePresence(document.visibilityState === 'visible' ? 'online' : 'away');
    const onOnline = () => writePresence('online');
    const onOffline = () => writePresence('offline');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      writePresence('away');
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [normalizedUser]);

  useEffect(() => {
    if (!normalizedUser) {
      setLoadingConversations(false);
      return undefined;
    }
    setLoadingConversations(true);
    setError('');
    return onSnapshot(CONVERSATIONS_REF, snapshot => {
      const map = snapshot.data()?.conversations || {};
      const next = Object.entries(map)
        .filter(([, value]) => value && typeof value === 'object')
        .map(([id, value]) => normalizeConversation(id, value))
        .filter(conversation => conversation.participants.includes(normalizedUser))
        .sort((a, b) => b.updatedSort - a.updatedSort);
      setConversations(next);
      setLoadingConversations(false);
      if (activeConversationId && !next.some(conversation => conversation.id === activeConversationId)) {
        setActiveConversationId(next[0]?.id || null);
      }
    }, err => {
      setError(err.message || 'Unable to load conversations.');
      setLoadingConversations(false);
    });
  }, [activeConversationId, normalizedUser]);

  useEffect(() => {
    if (mergedConversations.length > 0 && !activeConversationId) {
      setActiveConversationId(mergedConversations[0].id);
    }
  }, [activeConversationId, mergedConversations]);

  useEffect(() => {
    if (!normalizedUser || role === 'driver') {
      setClientLogConversations([]);
      return undefined;
    }

    const source = query(collection(db, SMS_LOGS), orderBy('timestamp', 'desc'), limit(300));
    return onSnapshot(source, snapshot => {
      const grouped = new Map();
      snapshot.docs.forEach(item => {
        const message = { id: item.id, ...item.data() };
        const phone = smsPeerPhone(message);
        if (!phone) return;
        const existing = grouped.get(phone) || [];
        existing.push(message);
        grouped.set(phone, existing);
      });

      const next = Array.from(grouped.entries()).map(([phone, items]) => {
        const sorted = [...items].sort((a, b) => timestampMillis(b.timestamp) - timestampMillis(a.timestamp));
        const last = sorted[0] || {};
        return normalizeConversation(`client_${phone}`, {
          participants: [normalizedUser],
          name: last.clientName || last.patient || last.name || '',
          clientName: last.clientName || last.patient || last.name || '',
          isClient: true,
          virtualClient: true,
          phone,
          type: 'client',
          updatedAt: last.timestamp,
          lastMessage: {
            text: last.text || last.message || '',
            sender: normalizeEmail(last.sender || last.from || ''),
            readBy: [],
            timestamp: last.timestamp,
          },
          unread: {},
        });
      });
      setClientLogConversations(next);
    }, () => setClientLogConversations([]));
  }, [normalizedUser, role]);

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      setOlderCursor(null);
      setHasOlderMessages(false);
      return undefined;
    }

    setLoadingMessages(true);
    setMessageError('');
    setMessages([]);
    latestMessageIdsRef.current = new Set();
    const conversation = activeRef.current;
    const isClient = !!conversation?.isClient;
    const source = isClient
      ? query(collection(db, SMS_LOGS), orderBy('timestamp', 'asc'), limitToLast(300))
      : query(collection(db, TEAM_MESSAGES), where('conversationId', '==', activeConversationId), orderBy('timestamp', 'asc'), limitToLast(CHAT_PAGE_SIZE));

    return onSnapshot(source, snapshot => {
      const next = snapshot.docs
        .map(item => ({
          id: item.id,
          channel: isClient ? 'client' : 'team',
          ...item.data(),
        }))
        .filter(item => {
          if (!isClient) return true;
          if (item.conversationId === activeConversationId) return true;
          return normalizePhone(conversation?.phone) && smsPeerPhone(item) === normalizePhone(conversation.phone);
        });
      latestMessageIdsRef.current = new Set(next.map(item => item.id));
      setMessages(current => mergeMessages(
        current.filter(item => latestMessageIdsRef.current.has(item.id) || item.__older),
        next
      ));
      setOlderCursor(isClient ? null : (snapshot.docs[0] || null));
      setHasOlderMessages(!isClient && snapshot.docs.length >= CHAT_PAGE_SIZE);
      setLoadingMessages(false);
    }, err => {
      setMessageError(err.message || 'Unable to load messages.');
      setLoadingMessages(false);
    });
  }, [activeConversation?.isClient, activeConversation?.phone, activeConversationId]);

  useEffect(() => {
    if (!activeConversationId || !normalizedUser) return undefined;
    const q = query(collection(db, TYPING), where('conversationId', '==', activeConversationId));
    return onSnapshot(q, snapshot => {
      const now = Date.now();
      const next = snapshot.docs
        .map(item => ({ id: item.id, ...item.data() }))
        .filter(item => normalizeEmail(item.email) !== normalizedUser)
        .filter(item => now - timestampMillis(item.updatedAt) < 8000);
      setTypingUsers(next);
    }, () => setTypingUsers([]));
  }, [activeConversationId, normalizedUser]);

  useEffect(() => {
    if (contacts.length === 0) {
      setPresenceByEmail({});
      return undefined;
    }
    const unsubscribers = contacts.slice(0, 40).map(contact => (
      onSnapshot(doc(db, PRESENCE, normalizeEmail(contact.email)), snapshot => {
        setPresenceByEmail(prev => ({
          ...prev,
          [normalizeEmail(contact.email)]: snapshot.exists() ? snapshot.data() : null,
        }));
      }, () => {})
    ));
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [contacts]);

  const markConversationRead = useCallback((conversationId = activeConversationId) => {
    if (!conversationId || !normalizedUser) return;
    updateDoc(CONVERSATIONS_REF, {
      [`conversations.${conversationId}.unread.${normalizedUser}`]: 0,
      [`conversations.${conversationId}.lastReadAt.${normalizedUser}`]: serverTimestamp(),
    }).catch(() => {});
  }, [activeConversationId, normalizedUser]);

  useEffect(() => {
    if (!activeConversationId || messages.length === 0) return undefined;
    const timer = setTimeout(() => markConversationRead(activeConversationId), 500);
    return () => clearTimeout(timer);
  }, [activeConversationId, markConversationRead, messages.length]);

  const loadOlderMessages = useCallback(async () => {
    if (!activeConversationId || !olderCursor || loadingOlder || !hasOlderMessages) return;
    setLoadingOlder(true);
    try {
      const isClient = !!activeRef.current?.isClient;
      if (isClient) return;
      const source = query(collection(db, TEAM_MESSAGES), where('conversationId', '==', activeConversationId), orderBy('timestamp', 'asc'), endBefore(olderCursor), limitToLast(CHAT_PAGE_SIZE));
      const snapshot = await getDocs(source);
      const older = snapshot.docs.map(item => ({
        id: item.id,
        channel: isClient ? 'client' : 'team',
        __older: true,
        ...item.data(),
      }));
      setMessages(current => mergeMessages(older, current));
      setOlderCursor(snapshot.docs[0] || null);
      setHasOlderMessages(snapshot.docs.length >= CHAT_PAGE_SIZE);
    } catch (err) {
      setMessageError(err.message || 'Unable to load earlier messages.');
    } finally {
      setLoadingOlder(false);
    }
  }, [activeConversationId, hasOlderMessages, loadingOlder, olderCursor]);

  const sendMessage = useCallback(async (text) => {
    const body = String(text || '').trim();
    if (!body || !activeConversationId || !normalizedUser) return;
    const conversation = activeRef.current;
    if (!conversation) return;
    setSending(true);
    setMessageError('');
    const recipients = (conversation.participants || []).filter(email => email !== normalizedUser);
    const unreadPatch = {};
    recipients.forEach(email => { unreadPatch[`conversations.${activeConversationId}.unread.${email}`] = (conversation.unread?.[email] || 0) + 1; });

    try {
      if (conversation.isClient) {
        if (conversation.virtualClient) {
          await patchConversation(activeConversationId, {
            participants: conversation.participants?.length ? conversation.participants : [normalizedUser],
            name: conversation.name || conversation.clientName || '',
            clientName: conversation.clientName || '',
            isClient: true,
            phone: normalizePhone(conversation.phone),
            type: 'client',
            createdBy: normalizedUser,
            updatedAt: serverTimestamp(),
          });
        }
        let delivery = 'queued';
        try {
          const sendSms = httpsCallable(functions, 'sendSms');
          await sendSms({ to: conversation.phone, message: body });
          delivery = 'sent';
        } catch (err) {
          delivery = 'logged';
        }
        await addDoc(collection(db, SMS_LOGS), {
          conversationId: activeConversationId,
          phone: conversation.phone || '',
          direction: 'outbound',
          sender: normalizedUser,
          text: body,
          message: body,
          status: delivery,
          timestamp: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, TEAM_MESSAGES), {
          conversationId: activeConversationId,
          sender: normalizedUser,
          text: body,
          timestamp: serverTimestamp(),
          readBy: [normalizedUser],
        });
      }
      await updateDoc(CONVERSATIONS_REF, {
        [`conversations.${activeConversationId}.lastMessage`]: {
          text: body,
          sender: normalizedUser,
          readBy: [normalizedUser],
          timestamp: serverTimestamp(),
        },
        [`conversations.${activeConversationId}.updatedAt`]: serverTimestamp(),
        [`conversations.${activeConversationId}.lastActivityBy`]: normalizedUser,
        ...unreadPatch,
      });
    } catch (err) {
      setMessageError(err.message || 'Message could not be sent.');
      throw err;
    } finally {
      setSending(false);
    }
  }, [activeConversationId, normalizedUser]);

  const createConversation = useCallback(async ({
    participants = [],
    name = '',
    isClient = false,
    phone = '',
    clientName = '',
  }) => {
    const normalizedParticipants = Array.from(new Set([...participants.map(normalizeEmail), normalizedUser].filter(Boolean)));
    const cleanPhone = normalizePhone(phone);
    const id = isClient && cleanPhone ? `client_${cleanPhone}` : makeConversationId('team');
    const conversation = {
      participants: normalizedParticipants,
      name: name.trim() || (isClient ? clientName || 'Client conversation' : ''),
      clientName: clientName.trim(),
      isClient,
      phone: cleanPhone,
      type: isClient ? 'client' : 'team',
      createdBy: normalizedUser,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      unread: {},
      lastMessage: {
        text: '',
        sender: normalizedUser,
        readBy: normalizedParticipants,
        timestamp: serverTimestamp(),
      },
    };
    await patchConversation(id, conversation);
    setActiveConversationId(id);
    return id;
  }, [normalizedUser]);

  const deleteConversation = useCallback(async (conversationId) => {
    if (!conversationId) return;
    await updateDoc(CONVERSATIONS_REF, {
      [`conversations.${conversationId}`]: deleteField(),
    });
    if (conversationId === activeConversationId) setActiveConversationId(null);
  }, [activeConversationId]);

  const setTyping = useCallback((isTyping) => {
    if (!activeConversationId || !normalizedUser) return;
    clearTimeout(typingTimerRef.current);
    const typingRef = doc(db, TYPING, `${activeConversationId}_${normalizedUser.replace(/[^\w.-]/g, '_')}`);
    if (!isTyping) {
      setDoc(typingRef, {
        conversationId: activeConversationId,
        email: normalizedUser,
        isTyping: false,
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch(() => {});
      return;
    }
    setDoc(typingRef, {
      conversationId: activeConversationId,
      email: normalizedUser,
      isTyping: true,
      updatedAt: serverTimestamp(),
    }, { merge: true }).catch(() => {});
    typingTimerRef.current = setTimeout(() => setTyping(false), 4500);
  }, [activeConversationId, normalizedUser]);

  const unreadTotal = useMemo(() => mergedConversations.reduce((total, conversation) => (
    total + Number(conversation.unread?.[normalizedUser] || 0)
  ), 0), [mergedConversations, normalizedUser]);

  const filteredConversations = useMemo(() => mergedConversations.filter(conversation => {
    if (filter === 'team') return !conversation.isClient;
    if (filter === 'clients') return !!conversation.isClient;
    if (filter === 'unread') return Number(conversation.unread?.[normalizedUser] || 0) > 0;
    return true;
  }), [filter, mergedConversations, normalizedUser]);

  return {
    contacts,
    contactsByEmail,
    conversations: mergedConversations,
    filteredConversations,
    activeConversation,
    activeConversationId,
    setActiveConversationId,
    messages,
    loadingConversations,
    loadingMessages,
    loadingOlder,
    hasOlderMessages,
    sending,
    error,
    messageError,
    typingUsers,
    presenceByEmail,
    filter,
    setFilter,
    unreadTotal,
    markConversationRead,
    loadOlderMessages,
    sendMessage,
    createConversation,
    deleteConversation,
    setTyping,
  };
}
