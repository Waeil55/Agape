import { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc,
  serverTimestamp, query as firestoreQuery, where, orderBy, limit,
  increment, getDoc, getDocs, startAfter,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase';
import { normalizeDialable, TELNYX_NUMBER, pickColor } from './helpers';

const normalizeEmail = (e) => (e || '').trim().toLowerCase();

const resolveDisplayName = (targetUid, drivers = [], dispatchers = []) => {
  if (!targetUid) return 'Unknown';
  if (targetUid.includes('@')) {
    const emailName = targetUid.split('@')[0];
    const driverByEmail = drivers.find(d => normalizeEmail(d.email) === normalizeEmail(targetUid));
    if (driverByEmail) return driverByEmail.name || emailName;
    const dispatcherByEmail = dispatchers.find(d => normalizeEmail(d.email) === normalizeEmail(targetUid));
    if (dispatcherByEmail) return dispatcherByEmail.name || emailName;
    return emailName;
  }
  const driver = drivers.find(d => d.id === targetUid);
  if (driver) return driver.name || 'Unknown';
  const dispatcher = dispatchers.find(d => d.id === targetUid);
  if (dispatcher) return dispatcher.name || 'Unknown';
  return 'Unknown';
};

export default function useChat({ currentUser, drivers = [], dispatchers = [], isMobile = false }) {
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeConvo, setActiveConvo] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [unreadCount, setUnreadCount] = useState(0);
  const [typing, setTyping] = useState({});
  const [onlineMap] = useState({});
  const [replyTo, setReplyTo] = useState(null);
  const [sentiment, setSentiment] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [newMsg, setNewMsg] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState('team');
  const [modalSearch, setModalSearch] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const messagesEnd = useRef(null);
  const inputRef = useRef(null);
  const lastDocRef = useRef(null);
  const activeConvoRef = useRef(activeConvo);

  const uid = auth.currentUser?.uid || '';
  const userMapRef = useRef({});

  activeConvoRef.current = activeConvo;

  useEffect(() => {
    if (activeConvo) {
      setMessages([]);
      lastDocRef.current = null;
      setHasMore(true);
      setReplyTo(null);
      setSentiment(null);
      setShowInfo(false);
    }
  }, [activeConvo]);

  useEffect(() => {
    if (!activeConvo) return;
    const q = firestoreQuery(
      collection(db, 'chatData', activeConvo, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(25)
    );
    const unsub = onSnapshot(q, snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
      setMessages(items);
      lastDocRef.current = snap.docs[snap.docs.length - 1];
      setHasMore(snap.docs.length >= 25);
      setTimeout(() => messagesEnd.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    });
    return unsub;
  }, [activeConvo]);

  useEffect(() => {
    if (!hasMore || !activeConvo || !lastDocRef.current) return;
    const container = document.querySelector('[data-chat-messages]');
    if (!container) return;
    const handleScroll = () => {
      if (container.scrollTop < 60 && !loadingMore) {
        setLoadingMore(true);
        const q = firestoreQuery(
          collection(db, 'chatData', activeConvo, 'messages'),
          orderBy('createdAt', 'desc'),
          startAfter(lastDocRef.current),
          limit(25)
        );
        getDocs(q).then(snap => {
          const items = snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
          setMessages(prev => [...items, ...prev]);
          lastDocRef.current = snap.docs[snap.docs.length - 1];
          setHasMore(snap.docs.length >= 25);
          setLoadingMore(false);
        }).catch(() => setLoadingMore(false));
      }
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasMore, activeConvo, loadingMore]);

  useEffect(() => {
    if (!uid) return;
    const convQ = firestoreQuery(
      collection(db, 'chatData'),
      where('participants', 'array-contains', uid),
      orderBy('lastMessageTime', 'desc')
    );
    const unsub = onSnapshot(convQ, snap => {
      const convos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setConversations(convos);
    });
    return unsub;
  }, [uid]);

  useEffect(() => {
    let total = 0;
    conversations.forEach(c => { total += c.unread?.[uid] || 0; });
    setUnreadCount(total);
  }, [conversations, uid]);

  const getDisplayName = useCallback((id) => {
    if (!id) return 'Unknown';
    if (userMapRef.current[id]) return userMapRef.current[id];
    const name = resolveDisplayName(id, drivers, dispatchers);
    if (name !== 'Unknown') userMapRef.current[id] = name;
    return name;
  }, [drivers, dispatchers]);

  const send = useCallback(async (text, opts = {}) => {
    if (!activeConvo || !text?.trim() || !uid) return;
    const body = text.trim();
    const senderName = getDisplayName(currentUser);
    await addDoc(collection(db, 'chatData', activeConvo, 'messages'), {
      text: body,
      senderId: uid,
      senderName,
      createdAt: serverTimestamp(),
      read: false,
      ...(opts.replyToId ? { replyToId: opts.replyToId, replyToText: opts.replyToText || '', replyToName: opts.replyToName || '' } : {}),
      ...(opts.sentiment ? { sentiment: opts.sentiment } : {}),
    });
    await updateDoc(doc(db, 'chatData', activeConvo), {
      lastMessage: body,
      lastMessageBy: uid,
      lastMessageTime: serverTimestamp(),
      [`unread.${activeConvoRef.current}`]: increment(1),
    });
    try {
      const convSnap = await getDoc(doc(db, 'chatData', activeConvo));
      const participants = convSnap.data()?.participants || [];
      const senderNameFinal = getDisplayName(currentUser);
      for (const pid of participants) {
        if (pid === uid) continue;
        try {
          const userSnap = await getDoc(doc(db, 'users', pid));
          const fcmToken = userSnap.data()?.fcmToken;
          if (fcmToken) {
            await fetch('https://send-notifications-520uuih7uq-uc.a.run.app', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tokens: [fcmToken],
                title: senderNameFinal,
                body: body.slice(0, 120),
                data: { conversationId: activeConvoRef.current, type: 'chat_message' },
              }),
            });
          }
        } catch (e) { console.warn('Push notification failed:', e); }
      }
    } catch (e) { console.warn('Push notification batch failed:', e); }
    setNewMsg('');
    setReplyTo(null);
    setSentiment(null);
    setTimeout(() => messagesEnd.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [activeConvo, uid, currentUser, getDisplayName]);

  const markRead = useCallback(async (convoId) => {
    if (!convoId || !uid) return;
    try {
      await updateDoc(doc(db, 'chatData', convoId), { [`unread.${uid}`]: 0 });
    } catch {}
  }, [uid]);

  const createConvo = useCallback(async (participantIds, name = '', isTeam = true) => {
    const allIds = [...new Set([uid, ...participantIds])];
    const data = {
      participants: allIds,
      isTeamChat: isTeam,
      name: name || (isTeam ? 'Team Chat' : ''),
      lastMessage: '',
      lastMessageTime: serverTimestamp(),
      createdAt: serverTimestamp(),
    };
    const ref = await addDoc(collection(db, 'chatData'), data);
    setActiveConvo(ref.id);
    return ref.id;
  }, [uid]);

  const createSmsConvo = useCallback(async (phone, name = '', clientName = '') => {
    const norm = normalizeDialable(phone);
    const data = {
      participants: [uid],
      isTeamChat: false,
      smsNumbers: [TELNYX_NUMBER, norm],
      name: name || clientName || norm,
      lastMessage: '',
      lastMessageTime: serverTimestamp(),
      createdAt: serverTimestamp(),
    };
    const ref = await addDoc(collection(db, 'chatData'), data);
    setActiveConvo(ref.id);
    return ref.id;
  }, [uid]);

  const deleteMessage = useCallback(async (convoId, msgId) => {
    try {
      await deleteDoc(doc(db, 'chatData', convoId, 'messages', msgId));
    } catch (e) { console.warn('Delete failed:', e); }
  }, []);

  const markTyping = useCallback(async () => {}, []);

  const filtered = conversations.filter(c => {
    if (filter === 'unread' && !c.unread?.[uid]) return false;
    if (filter === 'team' && !c.isTeamChat) return false;
    if (filter === 'sms' && c.isTeamChat) return false;
    if (search) {
      const name = (c.name || '').toLowerCase();
      const last = (c.lastMessage || '').toLowerCase();
      const s = search.toLowerCase();
      if (!name.includes(s) && !last.includes(s)) return false;
    }
    return true;
  });

  return {
    currentUser, uid, drivers, dispatchers,
    conversations: filtered, messages, activeConvo, setActiveConvo,
    search, setSearch, filter, setFilter,
    unreadCount, typing, onlineMap, replyTo, setReplyTo,
    sentiment, setSentiment, showInfo, setShowInfo,
    newMsg, setNewMsg, modalOpen, setModalOpen,
    modalTab, setModalTab, modalSearch, setModalSearch, modalLoading, setModalLoading,
    loadingMore, hasMore, messagesEnd, inputRef,
    send, markRead, createConvo, createSmsConvo, deleteMessage,
    markTyping, getDisplayName, pickColor: (id) => pickColor(id || ''),
  };
}
