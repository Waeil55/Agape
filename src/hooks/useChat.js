import { useState, useEffect, useRef, useCallback } from 'react';
import {
  db, auth, collection, doc, addDoc, setDoc, updateDoc, getDoc,
  serverTimestamp, onSnapshot, query, where, orderBy, limit as fbLimit,
  arrayUnion, arrayRemove, getDocs, onAuthStateChanged
} from '../config/firebase';
import { getDMChannelId } from '../utils/chatHelpers';
import { playMessageSound } from '../utils/notificationSound';

const MESSAGES_PER_LOAD = 50;
const LIVE_MESSAGES_LIMIT = 30;
const ONLINE_STALE_MS = 90 * 1000;
const TYPING_STALE_MS = 10 * 1000;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const asMillis = (timestamp) => timestamp?.toMillis?.() || 0;

export function useChat() {
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [unreadCounts, setUnreadCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [activeDMTarget, setActiveDMTarget] = useState(null);
  const [currentUserProfile, setCurrentUserProfile] = useState({ name: '', role: '' });
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const messagesRefForPagination = useRef([]);
  const [currentUser, setCurrentUser] = useState(auth.currentUser);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  const userEmail = normalizeEmail(currentUser?.email);
  const userUid = currentUser?.uid || '';
  const userRole = String(currentUserProfile.role || currentUser?.role || '').trim().toLowerCase();
  const isAdmin = userRole === 'admin';
  const userDisplayName = currentUserProfile.name || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User';
  const unreadKey = userUid || userEmail;

  const getUnreadForCurrentUser = useCallback((channel) => {
    if (!channel || !unreadKey) return 0;
    const byUid = channel.unreadByUid || {};
    const legacy = channel.unreadCounts || {};
    return Number(byUid[unreadKey] || legacy[unreadKey] || legacy[userEmail] || 0);
  }, [unreadKey, userEmail]);

  const publishChannels = useCallback((channelMap) => {
    const enriched = [];

    channelMap.forEach((data, id) => {
      if (data.type !== 'dm') return;
      const participants = (data.dmParticipants || data.participantIds || []).map(normalizeEmail);
      const currentUserIsParticipant = participants.includes(userEmail);
      if (!currentUserIsParticipant && !isAdmin) return;
      enriched.push({
        id,
        name: data.name || 'Direct Message',
        icon: 'User',
        description: data.description || '',
        roles: [],
        isParticipant: currentUserIsParticipant || isAdmin,
        isCurrentUserParticipant: currentUserIsParticipant,
        isDM: true,
        lastMessage: data.lastMessage || '',
        lastMessageBy: data.lastMessageBy || '',
        lastMessageAt: data.lastMessageAt,
        dmParticipants: participants,
        ...data,
      });
    });

    enriched.sort((a, b) => {
      return asMillis(b.lastMessageAt) - asMillis(a.lastMessageAt);
    });

    const counts = {};
    enriched.forEach((channel) => {
      if (channel.isParticipant) counts[channel.id] = getUnreadForCurrentUser(channel);
    });

    setChannels(enriched);
    setUnreadCounts(counts);
    setLoading(false);
  }, [getUnreadForCurrentUser, isAdmin, userEmail]);

  const initChannels = useCallback(async () => {
    if (!userEmail) return;
    setLoading(true);
    try {
      const channelsRef = collection(db, 'chat_channels');
      const existing = new Map();
      const dmQuery = isAdmin
        ? query(channelsRef, where('type', '==', 'dm'))
        : query(channelsRef, where('participantIds', 'array-contains', userEmail));
      const dmSnap = await getDocs(dmQuery);
      dmSnap.forEach(d => existing.set(d.id, { id: d.id, ...d.data() }));
      publishChannels(existing);
    } catch (err) {
      console.error('[Chat] initChannels error:', err);
      setLoading(false);
    }
  }, [isAdmin, publishChannels, userEmail]);

  useEffect(() => {
    if (!currentUser?.uid) return undefined;
    const ref = doc(db, 'users', currentUser.uid);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.exists() ? snap.data() : {};
      setCurrentUserProfile({
        name: data.name || data.username || '',
        role: data.role || '',
      });
    }, () => {});
    return () => unsub();
  }, [currentUser?.uid]);

  useEffect(() => {
    if (!userEmail) return undefined;
    initChannels();

    const channelsRef = collection(db, 'chat_channels');
    const dmMap = new Map();
    const dmQuery = isAdmin
      ? query(channelsRef, where('type', '==', 'dm'))
      : query(channelsRef, where('participantIds', 'array-contains', userEmail));

    const unsubDMs = onSnapshot(
      dmQuery,
      (snap) => {
        dmMap.clear();
        snap.forEach(d => dmMap.set(d.id, { id: d.id, ...d.data() }));
        publishChannels(dmMap);
      },
      (err) => console.error('[Chat] DM channels listener error:', err)
    );

    return () => unsubDMs();
  }, [initChannels, isAdmin, publishChannels, userEmail]);

  useEffect(() => {
    if (!userEmail) return undefined;
    const presRef = doc(db, 'presence', userEmail);
    setDoc(presRef, {
      online: true,
      lastSeen: serverTimestamp(),
      email: userEmail,
      uid: userUid,
      name: userDisplayName,
    }, { merge: true }).catch(() => {});

    const interval = setInterval(() => {
      setDoc(presRef, {
        online: true,
        lastSeen: serverTimestamp(),
        email: userEmail,
        uid: userUid,
        name: userDisplayName,
      }, { merge: true }).catch(() => {});
    }, 30000);

    const handleUnload = () => {
      setDoc(presRef, { online: false, lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
      setDoc(presRef, { online: false, lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
    };
  }, [userEmail, userDisplayName, userUid]);

  // Global message listener — plays sound for new messages in user's channels
  const lastSoundTimeRef = useRef(0);
  useEffect(() => {
    if (!userEmail) return undefined;
    const myChannelIds = new Set(channels.map(c => c.id));
    if (myChannelIds.size === 0) return undefined;
    const msgsRef = collection(db, 'chat_messages');
    const q = query(
      msgsRef,
      where('senderEmail', '!=', userEmail),
      orderBy('senderEmail'),
      orderBy('timestamp', 'desc'),
      fbLimit(10)
    );
    const unsub = onSnapshot(q, (snap) => {
      const now = Date.now();
      if (now - lastSoundTimeRef.current < 2000) return;
      snap.forEach(d => {
        const msg = d.data();
        const msgTime = asMillis(msg.timestamp);
        if (now - msgTime < 10000 && msg.channelId !== activeChannel && !window.isChatPageOpen && myChannelIds.has(msg.channelId)) {
          lastSoundTimeRef.current = now;
          playMessageSound().catch(() => {});
        }
      });
    }, () => {});
    return () => unsub();
  }, [userEmail, activeChannel, channels]);

  useEffect(() => {
    if (!userEmail) return undefined;
    const unsub = onSnapshot(query(collection(db, 'presence')), (snap) => {
      const online = new Set();
      const now = Date.now();
      snap.forEach(d => {
        const data = d.data();
        const email = normalizeEmail(data.email || d.id);
        const lastSeenMs = asMillis(data.lastSeen);
        if (email !== userEmail && data.online && lastSeenMs && now - lastSeenMs < ONLINE_STALE_MS) {
          online.add(email);
        }
      });
      setOnlineUsers(online);
    }, () => {});
    return () => unsub();
  }, [userEmail]);

  useEffect(() => {
    if (!userEmail) return undefined;
    const loadEmployees = async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        const list = [];
        snap.forEach(d => {
          const data = d.data();
          const email = normalizeEmail(data.email);
          if (email && email !== userEmail) {
            list.push({
              uid: d.id,
              email,
              name: data.name || data.username || email.split('@')[0] || 'User',
              role: data.role || 'user',
            });
          }
        });
        list.sort((a, b) => a.name.localeCompare(b.name));
        setEmployees(list);
      } catch (err) {
        console.error('[Chat] loadEmployees error:', err);
      }
    };
    loadEmployees();
  }, [userEmail]);

  const markAsRead = useCallback(async (channelId) => {
    if (!channelId || !userUid) return;
    try {
      await updateDoc(doc(db, 'chat_channels', channelId), {
        [`unreadByUid.${userUid}`]: 0,
      });
    } catch (err) {
      console.error('[Chat] markAsRead error:', err);
    }
  }, [userUid]);

  const loadMessages = useCallback(async (channelId, loadOlder = false) => {
    if (!channelId) return;
    setLoadingMessages(true);
    try {
      const constraints = [
        where('channelId', '==', channelId),
        orderBy('timestamp', 'desc'),
        fbLimit(loadOlder ? MESSAGES_PER_LOAD : LIVE_MESSAGES_LIMIT),
      ];

      if (loadOlder) {
        // Use ref to avoid stale closure — no messages dependency needed
        const currentMsgs = messagesRefForPagination.current.filter(m => m.channelId === channelId);
        const oldest = currentMsgs[0]; // sorted asc, index 0 is oldest
        if (oldest?.timestamp) constraints.push(where('timestamp', '<', oldest.timestamp));
      }

      const snap = await getDocs(query(collection(db, 'chat_messages'), ...constraints));
      const newMsgs = [];
      snap.forEach(d => newMsgs.push({ id: d.id, ...d.data() }));
      newMsgs.reverse();

      if (loadOlder) {
        setMessages(prev => {
          const sameChannel = prev.filter(msg => msg.channelId === channelId);
          const seen = new Set(sameChannel.map(msg => msg.id));
          const merged = [...newMsgs.filter(msg => !seen.has(msg.id)), ...sameChannel];
          messagesRefForPagination.current = merged;
          return merged;
        });
        setHasMore(newMsgs.length >= MESSAGES_PER_LOAD);
      } else {
        setMessages(newMsgs);
        messagesRefForPagination.current = newMsgs;
        setHasMore(newMsgs.length >= LIVE_MESSAGES_LIMIT);
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'instant' }), 300);
        }, 100);
      }
    } catch (err) {
      console.error('[Chat] loadMessages error:', err);
    } finally {
      setLoadingMessages(false);
    }
  }, []); // No messages dependency — uses ref instead

  useEffect(() => {
    if (!activeChannel) {
      setMessages([]);
      setTypingUsers([]);
      setHasMore(false);
      return undefined;
    }

    setMessages([]);
    setTypingUsers([]);
    setLoadingMessages(true);

    const q = query(
      collection(db, 'chat_messages'),
      where('channelId', '==', activeChannel),
      orderBy('timestamp', 'desc'),
      fbLimit(LIVE_MESSAGES_LIMIT)
    );

    const unsub = onSnapshot(q, (snap) => {
      const newMsgs = [];
      snap.forEach(d => newMsgs.push({ id: d.id, ...d.data() }));
      newMsgs.reverse();

      const bottom = messagesEndRef.current?.getBoundingClientRect?.().bottom;
      const isAtBottom = !bottom || bottom - window.innerHeight < 150;

      setMessages(prev => {
        const sameChannel = prev.filter(m => m.channelId === activeChannel);
        const prevIds = new Set(sameChannel.map(m => m.id));
        const incoming = newMsgs.filter(m => !prevIds.has(m.id));

        if (incoming.length > 0 && sameChannel.length > 0) {
          const newFromOthers = incoming.filter(m => normalizeEmail(m.senderEmail) !== userEmail);
          if (newFromOthers.length > 0 && !window.isChatPageOpen) {
            playMessageSound().catch(() => {});
          }
        }

        if (sameChannel.length === 0) {
          messagesRefForPagination.current = newMsgs;
          return newMsgs;
        }
        const merged = [...sameChannel];
        for (const msg of newMsgs) {
          const idx = merged.findIndex(m => m.id === msg.id);
          if (idx >= 0) merged[idx] = msg;
          else merged.push(msg);
        }
        const sorted = merged.sort((a, b) => asMillis(a.timestamp) - asMillis(b.timestamp));
        messagesRefForPagination.current = sorted;
        return sorted;
      });

      setHasMore(newMsgs.length >= LIVE_MESSAGES_LIMIT);
      markAsRead(activeChannel);

      if (isAtBottom) {
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      }

      setLoadingMessages(false);
    }, (err) => {
      console.error('[Chat] messages onSnapshot error:', err);
      setLoadingMessages(false);
    });

    return () => unsub();
  }, [activeChannel, markAsRead, userEmail]);

  useEffect(() => {
    if (!activeChannel) {
      setTypingUsers([]);
      return undefined;
    }
    const q = query(
      collection(db, 'chat_typing'),
      where('channelId', '==', activeChannel),
      where('typing', '==', true)
    );
    const unsub = onSnapshot(q, (snap) => {
      const users = [];
      const now = Date.now();
      snap.forEach(d => {
        const data = d.data();
        const email = normalizeEmail(data.email);
        const lastTypingMs = asMillis(data.timestamp);
        if (email !== userEmail && lastTypingMs && now - lastTypingMs < TYPING_STALE_MS) {
          users.push({ email, name: data.name || email });
        }
      });
      setTypingUsers(users);
    }, () => {});
    return () => unsub();
  }, [activeChannel, userEmail]);

  const sendMessage = useCallback(async (channelId, text, extra = {}) => {
    if (!channelId || (!text?.trim() && !extra.fileUrl)) return;
    if (!currentUser) return;

    try {
      await addDoc(collection(db, 'chat_messages'), {
        channelId,
        senderUid: userUid,
        senderEmail: userEmail,
        senderName: userDisplayName,
        senderRole: userRole || 'user',
        text: text?.trim() || '',
        type: extra.fileUrl ? (extra.fileType || 'file') : 'text',
        fileUrl: extra.fileUrl || '',
        fileName: extra.fileName || '',
        fileSize: extra.fileSize || 0,
        fileType: extra.fileType || '',
        storagePath: extra.storagePath || '',
        timestamp: serverTimestamp(),
        readBy: [userEmail],
        reactions: {},
      });

      // Update channel preview so conversation list shows latest message
      const previewText = extra.fileUrl
        ? (extra.fileType === 'image' ? '📷 Photo' : `📎 ${extra.fileName || 'File'}`)
        : (text?.trim() || '');
      updateDoc(doc(db, 'chat_channels', channelId), {
        lastMessage: previewText,
        lastMessageAt: serverTimestamp(),
        lastMessageBy: userDisplayName,
      }).catch(() => {}); // non-fatal if channel doc doesn't exist yet

      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      console.error('[Chat] sendMessage error:', err);
    }
  }, [currentUser, userEmail, userDisplayName, userRole, userUid]);

  const sendReaction = useCallback(async (messageId, emoji) => {
    if (!messageId || !userEmail) return;
    try {
      const msg = messages.find(item => item.id === messageId);
      const existingUsers = msg?.reactions?.[emoji] || [];
      const alreadyReacted = existingUsers.includes(userEmail);
      await updateDoc(doc(db, 'chat_messages', messageId), {
        [`reactions.${emoji}`]: alreadyReacted ? arrayRemove(userEmail) : arrayUnion(userEmail),
      });
    } catch (err) {
      console.error('[Chat] sendReaction error:', err);
    }
  }, [messages, userEmail]);

  const setTyping = useCallback(async (channelId, isTyping) => {
    if (!channelId || !userEmail) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    try {
      const typingDoc = doc(db, 'chat_typing', `${channelId}_${userEmail}`);
      await setDoc(typingDoc, {
        channelId,
        email: userEmail,
        uid: userUid,
        name: userDisplayName,
        typing: isTyping,
        timestamp: serverTimestamp(),
      });

      if (isTyping) {
        typingTimeoutRef.current = setTimeout(() => {
          setDoc(typingDoc, { typing: false, timestamp: serverTimestamp() }, { merge: true }).catch(() => {});
        }, 5000);
      }
    } catch (err) {
      console.error('[Chat] setTyping error:', err);
    }
  }, [userEmail, userDisplayName, userUid]);

  const openDM = useCallback(async (targetEmail, targetName) => {
    const normalizedTargetEmail = normalizeEmail(targetEmail);
    if (!normalizedTargetEmail || !userEmail) return;
    const dmId = getDMChannelId(userEmail, normalizedTargetEmail);
    const dmRef = doc(db, 'chat_channels', dmId);
    const targetDisplayName = targetName || normalizedTargetEmail.split('@')[0];

    try {
      const existing = await getDoc(dmRef);
      if (!existing.exists()) {
        await setDoc(dmRef, {
          name: targetDisplayName,
          type: 'dm',
          icon: 'User',
          description: '',
          roles: [],
          participantIds: [userEmail, normalizedTargetEmail],
          dmParticipants: [userEmail, normalizedTargetEmail],
          createdBy: userEmail,
          createdAt: serverTimestamp(),
          lastMessage: '',
          lastMessageAt: serverTimestamp(),
          lastMessageBy: '',
          unreadByUid: {},
        });
      }
    } catch (err) {
      console.error('[Chat] openDM create error:', err);
    }

    setActiveDMTarget({ email: normalizedTargetEmail, name: targetDisplayName });
    setActiveChannel(dmId);
    markAsRead(dmId);
  }, [userEmail, markAsRead]);

  const openExistingDM = useCallback((channel) => {
    if (!channel?.id) return;
    const participants = (channel.dmParticipants || channel.participantIds || []).map(normalizeEmail).filter(Boolean);
    const otherParticipants = participants.filter(email => email !== userEmail);
    const displayName = otherParticipants
      .map(email => employees.find(emp => emp.email === email)?.name || email.split('@')[0])
      .join(' + ') || channel.name || 'Conversation';

    setActiveDMTarget({
      email: otherParticipants[0] || participants[0] || '',
      name: displayName,
      participants,
      isCurrentUserParticipant: participants.includes(userEmail),
      isAdminReview: isAdmin && !participants.includes(userEmail),
    });
    setActiveChannel(channel.id);
    if (participants.includes(userEmail)) markAsRead(channel.id);
  }, [employees, isAdmin, markAsRead, userEmail]);

  const clearDMTarget = useCallback(() => {
    setActiveDMTarget(null);
  }, []);

  const totalUnread = Object.values(unreadCounts).reduce((sum, c) => sum + (Number(c) || 0), 0);

  // PWA App Badging API support to set home screen icon badge
  useEffect(() => {
    try {
      if ('setAppBadge' in navigator) {
        if (totalUnread > 0) {
          navigator.setAppBadge(totalUnread).catch((err) => {
            console.warn('[PWA Badge] Failed to set badge:', err);
          });
        } else {
          navigator.clearAppBadge().catch((err) => {
            console.warn('[PWA Badge] Failed to clear badge:', err);
          });
        }
      }
    } catch (e) {
      console.warn('[PWA Badge] Error updating badge:', e);
    }
  }, [totalUnread]);

  return {
    channels,
    activeChannel,
    setActiveChannel,
    messages,
    typingUsers,
    onlineUsers,
    unreadCounts,
    totalUnread,
    loading,
    loadingMessages,
    hasMore,
    messagesEndRef,
    sendMessage,
    sendReaction,
    markAsRead,
    setTyping,
    loadMessages,
    employees,
    openDM,
    openExistingDM,
    activeDMTarget,
    clearDMTarget,
    currentUser: { uid: userUid, email: userEmail, name: userDisplayName, role: userRole, isAdmin },
  };
}
