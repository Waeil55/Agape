import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  db, auth, collection, doc, setDoc, query, where,
  orderBy, limit, startAfter, getDocs, onSnapshot, serverTimestamp, increment, updateDoc, writeBatch, arrayUnion, arrayRemove
} from '../config/firebase';
import { playMessageSound, playMessageSentSound } from '../utils/notificationSound';
import { showLocalNotification } from '../config/notifications';
import { isRealChatChannel } from '../utils/chatLifecycle';

const globallyNotifiedMessages = new Set();

export const useChat = ({ alerts = true } = {}) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [channels, setChannels] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [draftChannel, setDraftChannel] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contactPresence, setContactPresence] = useState(null);
  const [oldestMessageCursor, setOldestMessageCursor] = useState(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const initializedChannelsRef = useRef(false);

  // 1. Subscribe to Current User Profile
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        // Subscribe to user doc
        const userDocRef = doc(db, 'users', user.uid);
        const unsubUser = onSnapshot(userDocRef, (snap) => {
          if (snap.exists()) {
            setCurrentUser({ id: user.uid, ...snap.data() });
          } else {
            // Fallback if user doc doesn't exist in Firestore
            setCurrentUser({
              id: user.uid,
              name: user.displayName || user.email || 'Anonymous',
              email: user.email,
              role: 'driver'
            });
          }
        });
        return () => unsubUser();
      } else {
        setCurrentUser(null);
        setChannels([]);
        setMessages([]);
        setActiveChannelId(null);
        setDraftChannel(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // 2. Subscribe to Users Directory (for starting new chats)
  useEffect(() => {
    if (!currentUser) return;

    const usersRef = collection(db, 'users');
    const unsubUsers = onSnapshot(usersRef, (snap) => {
      const list = [];
      snap.forEach((doc) => {
        const u = doc.data();
        if (doc.id !== currentUser.id) {
          list.push({ id: doc.id, ...u });
        }
      });
      setUsers(list);
    }, (err) => {
      console.error("Users list sub error:", err);
    });

    return () => unsubUsers();
  }, [currentUser]);

  // 3. Subscribe to Channels List
  useEffect(() => {
    if (!currentUser) return;

    const channelsRef = collection(db, 'chat_channels');
    const q = query(
      channelsRef,
      where('participants', 'array-contains', currentUser.id)
    );

    const unsubChannels = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      // Sort in JS because firestore requires composite index for where + orderBy
      list.sort((a, b) => {
        const tA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.updatedAt || 0);
        const tB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.updatedAt || 0);
        return tB - tA;
      });
      setChannels(list);
      setDraftChannel((draft) => draft && list.some((channel) => channel.id === draft.id) ? null : draft);
      // Do not alert for the initial snapshot; only messages that arrive afterwards.
      if (!initializedChannelsRef.current) {
        list.forEach((channel) => {
          const message = channel.lastMessage;
          globallyNotifiedMessages.add(`${channel.id}:${message?.timestamp?.toMillis?.() || ''}:${message?.text || ''}`);
        });
        initializedChannelsRef.current = true;
      } else if (alerts) {
        list.forEach((channel) => {
          const lastMessage = channel.lastMessage;
          const key = `${channel.id}:${lastMessage?.timestamp?.toMillis?.() || ''}:${lastMessage?.text || ''}`;
          if (lastMessage?.senderId && lastMessage.senderId !== currentUser.id && !channel.mutedBy?.[currentUser.id] && !globallyNotifiedMessages.has(key)) {
            globallyNotifiedMessages.add(key);
            playMessageSound();
            const sender = lastMessage.senderName || channel.participantDetails?.[lastMessage.senderId]?.name || 'New message';
            showLocalNotification(sender, lastMessage.text || 'Sent you a message', 'message');
          }
        });
      }
      setLoading(false);
    }, (err) => {
      console.error("Channels list sub error:", err);
      setLoading(false);
    });

    return () => unsubChannels();
  }, [currentUser, alerts]);

  useEffect(() => {
    if (!currentUser || alerts) return;
    const presenceRef = doc(db, 'chat_presence', currentUser.id);
    const publish = () => setDoc(presenceRef, {
      userId: currentUser.id,
      state: document.visibilityState === 'visible' ? 'online' : 'away',
      lastSeenAt: serverTimestamp(),
    }, { merge: true }).catch(() => {});
    publish();
    const timer = setInterval(publish, 30000);
    document.addEventListener('visibilitychange', publish);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', publish); };
  }, [currentUser, alerts]);

  useEffect(() => {
    const channel = channels.find(item => item.id === activeChannelId) || draftChannel;
    const otherId = channel?.participants?.find(id => id !== currentUser?.id);
    if (!otherId) { setContactPresence(null); return; }
    return onSnapshot(doc(db, 'chat_presence', otherId), snap => setContactPresence(snap.exists() ? snap.data() : null), () => setContactPresence(null));
  }, [channels, draftChannel, activeChannelId, currentUser]);

  // 4. Subscribe to Messages in Active Channel
  useEffect(() => {
    if (!activeChannelId || draftChannel?.id === activeChannelId) {
      setMessages([]);
      return;
    }

    const messagesRef = collection(db, 'chat_channels', activeChannelId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(100));

    const unsubMessages = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setMessages(list.reverse());
      setOldestMessageCursor(snap.docs[snap.docs.length - 1] || null);
      setHasOlderMessages(snap.size === 100);
    });

    return () => unsubMessages();
  }, [activeChannelId, draftChannel]);

  const loadOlderMessages = useCallback(async () => {
    if (!activeChannelId || !oldestMessageCursor || loadingOlderMessages || !hasOlderMessages) return;
    setLoadingOlderMessages(true);
    try {
      const messagesRef = collection(db, 'chat_channels', activeChannelId, 'messages');
      const olderQuery = query(messagesRef, orderBy('timestamp', 'desc'), startAfter(oldestMessageCursor), limit(100));
      const snapshot = await getDocs(olderQuery);
      const older = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).reverse();
      setMessages(current => [...older, ...current]);
      setOldestMessageCursor(snapshot.docs[snapshot.docs.length - 1] || oldestMessageCursor);
      setHasOlderMessages(snapshot.size === 100);
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [activeChannelId, oldestMessageCursor, loadingOlderMessages, hasOlderMessages]);

  const markChannelRead = useCallback(async (channelId) => {
    if (!currentUser || !channelId || draftChannel?.id === channelId) return;
    try {
      await updateDoc(doc(db, 'chat_channels', channelId), {
        [`readBy.${currentUser.id}`]: serverTimestamp(),
        [`unreadCounts.${currentUser.id}`]: 0,
      });
    } catch (err) {
      console.warn('Unable to mark chat read:', err);
    }
  }, [currentUser, draftChannel]);

  useEffect(() => {
    if (activeChannelId) markChannelRead(activeChannelId);
  }, [activeChannelId, messages.length, markChannelRead]);

  // 5. Send Message Action
  const sendMessage = useCallback(async (text, attachment = null, requestId = null, replyTo = null) => {
    if (!currentUser || !activeChannelId || (!text.trim() && !attachment)) return;

    const messagesRef = collection(db, 'chat_channels', activeChannelId, 'messages');
    const channelRef = doc(db, 'chat_channels', activeChannelId);

    const batch = writeBatch(db);
    
    // Add Message Doc
    const newMsgRef = requestId ? doc(messagesRef, requestId) : doc(messagesRef);
    batch.set(newMsgRef, {
      text,
      senderId: currentUser.id,
      senderName: currentUser.name || currentUser.username || currentUser.email,
      timestamp: serverTimestamp(),
      clientRequestId: newMsgRef.id,
      ...(attachment ? { attachment } : {}),
      ...(replyTo ? { replyTo } : {}),
    });

    // Update Channel Doc
    const channel = channels.find((item) => item.id === activeChannelId);
    const participants = channel?.participants || draftChannel?.participants || [];
    const unreadUpdates = {};
    participants.forEach((participantId) => {
      unreadUpdates[`unreadCounts.${participantId}`] = participantId === currentUser.id ? 0 : increment(1);
    });
    const channelUpdate = {
      lastMessage: {
        id: newMsgRef.id,
        text: text || (attachment?.type?.startsWith('image/') ? 'Sent a photo' : `Sent ${attachment?.name || 'a file'}`),
        senderId: currentUser.id,
        senderName: currentUser.name || currentUser.username || currentUser.email,
        timestamp: serverTimestamp()
      },
      updatedAt: serverTimestamp(),
      [`readBy.${currentUser.id}`]: serverTimestamp(),
      ...unreadUpdates,
    };
    if (channel) {
      batch.update(channelRef, channelUpdate);
    } else if (draftChannel) {
      const recipientId = draftChannel.participants.find((id) => id !== currentUser.id);
      batch.set(channelRef, {
        participants: draftChannel.participants,
        participantDetails: draftChannel.participantDetails,
        type: 'direct',
        createdAt: serverTimestamp(),
        readBy: { [currentUser.id]: serverTimestamp() },
        unreadCounts: { [currentUser.id]: 0, [recipientId]: 1 },
        lastMessage: channelUpdate.lastMessage,
        updatedAt: serverTimestamp(),
      });
    } else {
      return;
    }

    await batch.commit();
    playMessageSentSound();
  }, [currentUser, activeChannelId, channels, draftChannel]);

  const setTyping = useCallback(async (isTyping) => {
    if (!currentUser || !activeChannelId || draftChannel?.id === activeChannelId) return;
    try {
      await updateDoc(doc(db, 'chat_channels', activeChannelId), {
        [`typing.${currentUser.id}`]: isTyping
          ? { name: currentUser.name || currentUser.email, updatedAt: new Date().toISOString() }
          : null,
      });
    } catch {}
  }, [currentUser, activeChannelId, draftChannel]);

  const editMessage = useCallback(async (messageId, text) => {
    if (!activeChannelId || !messageId || !text.trim()) return;
    await updateDoc(doc(db, 'chat_channels', activeChannelId, 'messages', messageId), {
      text: text.trim(), editedAt: serverTimestamp(),
    });
    const channel = channels.find(item => item.id === activeChannelId);
    if (channel?.lastMessage?.id === messageId) await updateDoc(doc(db, 'chat_channels', activeChannelId), { 'lastMessage.text': text.trim() });
  }, [activeChannelId, channels]);

  const deleteMessage = useCallback(async (messageId) => {
    if (!activeChannelId || !messageId) return;
    await updateDoc(doc(db, 'chat_channels', activeChannelId, 'messages', messageId), {
      text: '', deletedAt: serverTimestamp(), deletedBy: currentUser?.id || '',
    });
    const channel = channels.find(item => item.id === activeChannelId);
    if (channel?.lastMessage?.id === messageId) await updateDoc(doc(db, 'chat_channels', activeChannelId), { 'lastMessage.text': 'Message removed' });
  }, [activeChannelId, currentUser, channels]);

  const toggleMute = useCallback(async () => {
    if (!activeChannelId || !currentUser || draftChannel?.id === activeChannelId) return;
    const channel = channels.find(item => item.id === activeChannelId);
    await updateDoc(doc(db, 'chat_channels', activeChannelId), { [`mutedBy.${currentUser.id}`]: !channel?.mutedBy?.[currentUser.id] });
  }, [activeChannelId, currentUser, draftChannel, channels]);

  const toggleReaction = useCallback(async (message, emoji) => {
    if (!activeChannelId || !message?.id || !currentUser) return;
    const users = message.reactions?.[emoji] || [];
    await updateDoc(doc(db, 'chat_channels', activeChannelId, 'messages', message.id), {
      [`reactions.${emoji}`]: users.includes(currentUser.id) ? arrayRemove(currentUser.id) : arrayUnion(currentUser.id),
    });
  }, [activeChannelId, currentUser]);

  // 6. Start / Retrieve Direct Chat Channel
  const startDirectChat = useCallback((otherUser) => {
    if (!currentUser || !otherUser) return null;

    try {
      const sortedIds = [currentUser.id, otherUser.id].sort();
      const channelId = `dm_${sortedIds[0]}_${sortedIds[1]}`;
      const existingChannel = channels.find((channel) => channel.id === channelId);
      const hasRealMessage = isRealChatChannel(existingChannel);
      if (!hasRealMessage) {
        setDraftChannel({
          id: channelId,
          participants: [currentUser.id, otherUser.id],
          participantDetails: existingChannel?.participantDetails || {
            [currentUser.id]: {
              name: currentUser.name || currentUser.username || currentUser.email,
              email: currentUser.email,
              phone: currentUser.phone || currentUser.phoneNumber || '',
              role: currentUser.role || 'driver'
            },
            [otherUser.id]: {
              name: otherUser.name || otherUser.username || otherUser.email,
              email: otherUser.email,
              phone: otherUser.phone || otherUser.phoneNumber || '',
              role: otherUser.role || 'driver'
            }
          },
          type: 'direct',
          isDraft: true,
        });
      } else {
        setDraftChannel(null);
      }

      setActiveChannelId(channelId);
      setMessages([]);
      return channelId;
    } catch (err) {
      console.error("Error starting direct chat:", err);
      return null;
    }
  }, [currentUser, channels]);

  const selectChannel = useCallback((channelId) => {
    if (!channelId) setDraftChannel(null);
    else if (channelId !== draftChannel?.id) setDraftChannel(null);
    setActiveChannelId(channelId);
    setMessages([]);
  }, [draftChannel]);

  const visibleChannels = useMemo(() => channels.filter(isRealChatChannel), [channels]);

  const unreadByChannel = useMemo(() => Object.fromEntries(channels.map((channel) => {
    const message = channel.lastMessage;
    const lastRead = channel.readBy?.[currentUser?.id];
    const messageMs = message?.timestamp?.toMillis?.() || 0;
    const readMs = lastRead?.toMillis?.() || 0;
    if (!message || message.senderId === 'system') return [channel.id, 0];
    const storedCount = Number(channel.unreadCounts?.[currentUser?.id] || 0);
    return [channel.id, storedCount || (message && message.senderId !== currentUser?.id && messageMs > readMs ? 1 : 0)];
  })), [channels, currentUser]);
  const unreadCount = Object.values(unreadByChannel).reduce((total, count) => total + Number(count || 0), 0);

  useEffect(() => {
    const baseTitle = 'Agape Care';
    document.title = unreadCount > 0 ? `(${unreadCount > 99 ? '99+' : unreadCount}) ${baseTitle}` : baseTitle;
    if ('setAppBadge' in navigator) {
      if (unreadCount > 0) navigator.setAppBadge(unreadCount).catch(() => {});
      else navigator.clearAppBadge?.().catch(() => {});
    }
  }, [unreadCount]);

  useEffect(() => {
    if (!currentUser || channels.length === 0) return;
    const channelId = new URLSearchParams(window.location.search).get('chatChannel');
    if (channelId && channels.some((channel) => channel.id === channelId)) {
      setActiveChannelId(channelId);
      const url = new URL(window.location.href);
      url.searchParams.delete('chatChannel');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, [currentUser, channels]);

  return {
    currentUser,
    channels: visibleChannels,
    draftChannel,
    messages,
    activeChannelId,
    setActiveChannelId: selectChannel,
    users,
    loading,
    sendMessage,
    startDirectChat,
    markChannelRead,
    setTyping,
    editMessage,
    deleteMessage,
    toggleReaction,
    toggleMute,
    unreadByChannel,
    unreadCount,
    contactPresence,
    loadOlderMessages,
    hasOlderMessages,
    loadingOlderMessages,
  };
};
