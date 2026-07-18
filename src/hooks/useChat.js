import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  db, auth, collection, doc, query, where,
  orderBy, onSnapshot, serverTimestamp, increment, updateDoc, writeBatch
} from '../config/firebase';
import { playMessageSound, playMessageSentSound } from '../utils/notificationSound';
import { showLocalNotification } from '../config/notifications';

const globallyNotifiedMessages = new Set();

export const useChat = ({ alerts = true } = {}) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [channels, setChannels] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [draftChannel, setDraftChannel] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
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
          if (lastMessage?.senderId && lastMessage.senderId !== currentUser.id && !globallyNotifiedMessages.has(key)) {
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

  // 4. Subscribe to Messages in Active Channel
  useEffect(() => {
    if (!activeChannelId || draftChannel?.id === activeChannelId) {
      setMessages([]);
      return;
    }

    const messagesRef = collection(db, 'chat_channels', activeChannelId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubMessages = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setMessages(list);
    });

    return () => unsubMessages();
  }, [activeChannelId, draftChannel]);

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
  const sendMessage = useCallback(async (text) => {
    if (!currentUser || !activeChannelId || !text.trim()) return;

    const messagesRef = collection(db, 'chat_channels', activeChannelId, 'messages');
    const channelRef = doc(db, 'chat_channels', activeChannelId);

    const batch = writeBatch(db);
    
    // Add Message Doc
    const newMsgRef = doc(messagesRef);
    batch.set(newMsgRef, {
      text,
      senderId: currentUser.id,
      senderName: currentUser.name || currentUser.username || currentUser.email,
      timestamp: serverTimestamp()
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
        text,
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

  // 6. Start / Retrieve Direct Chat Channel
  const startDirectChat = useCallback((otherUser) => {
    if (!currentUser || !otherUser) return null;

    try {
      const sortedIds = [currentUser.id, otherUser.id].sort();
      const channelId = `dm_${sortedIds[0]}_${sortedIds[1]}`;
      const existingChannel = channels.find((channel) => channel.id === channelId);
      if (!existingChannel) {
        setDraftChannel({
          id: channelId,
          participants: [currentUser.id, otherUser.id],
          participantDetails: {
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

  const visibleChannels = useMemo(() => channels.filter((channel) => {
    const message = channel.lastMessage;
    return message && message.senderId !== 'system' && message.text !== 'Started a new chat';
  }), [channels]);

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
    unreadByChannel,
    unreadCount
  };
};
