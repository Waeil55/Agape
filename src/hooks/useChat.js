import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  db, auth, collection, doc, setDoc, addDoc, query, where,
  orderBy, onSnapshot, serverTimestamp, increment, getDoc, updateDoc, writeBatch
} from '../config/firebase';
import { playMessageSound, playMessageSentSound } from '../utils/notificationSound';
import { showLocalNotification } from '../config/notifications';

const globallyNotifiedMessages = new Set();

export const useChat = ({ alerts = true } = {}) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [channels, setChannels] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeChannelId, setActiveChannelId] = useState(null);
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
    if (!activeChannelId) {
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
  }, [activeChannelId]);

  const markChannelRead = useCallback(async (channelId) => {
    if (!currentUser || !channelId) return;
    try {
      await updateDoc(doc(db, 'chat_channels', channelId), {
        [`readBy.${currentUser.id}`]: serverTimestamp(),
        [`unreadCounts.${currentUser.id}`]: 0,
      });
    } catch (err) {
      console.warn('Unable to mark chat read:', err);
    }
  }, [currentUser]);

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
    const unreadUpdates = {};
    (channel?.participants || []).forEach((participantId) => {
      unreadUpdates[`unreadCounts.${participantId}`] = participantId === currentUser.id ? 0 : increment(1);
    });
    batch.update(channelRef, {
      lastMessage: {
        text,
        senderId: currentUser.id,
        senderName: currentUser.name || currentUser.username || currentUser.email,
        timestamp: serverTimestamp()
      },
      updatedAt: serverTimestamp(),
      [`readBy.${currentUser.id}`]: serverTimestamp(),
      ...unreadUpdates,
    });

    await batch.commit();
    playMessageSentSound();
  }, [currentUser, activeChannelId, channels]);

  // 6. Start / Retrieve Direct Chat Channel
  const startDirectChat = useCallback(async (otherUser) => {
    if (!currentUser || !otherUser) return null;

    try {
      // Deterministic channel ID based on sorted UIDs
      const sortedIds = [currentUser.id, otherUser.id].sort();
      const channelId = `dm_${sortedIds[0]}_${sortedIds[1]}`;
      const channelRef = doc(db, 'chat_channels', channelId);

      const docSnap = await getDoc(channelRef);
      if (!docSnap.exists()) {
        await setDoc(channelRef, {
          participants: [currentUser.id, otherUser.id],
          participantDetails: {
            [currentUser.id]: {
              name: currentUser.name || currentUser.username || currentUser.email,
              email: currentUser.email,
              role: currentUser.role || 'driver'
            },
            [otherUser.id]: {
              name: otherUser.name || otherUser.username || otherUser.email,
              email: otherUser.email,
              role: otherUser.role || 'driver'
            }
          },
          type: 'direct',
          readBy: { [currentUser.id]: serverTimestamp() },
          unreadCounts: { [currentUser.id]: 0, [otherUser.id]: 0 },
          lastMessage: {
            text: 'Started a new chat',
            senderId: 'system',
            timestamp: serverTimestamp()
          },
          updatedAt: serverTimestamp()
        });
      }

      setActiveChannelId(channelId);
      return channelId;
    } catch (err) {
      console.error("Error starting direct chat:", err);
      return null;
    }
  }, [currentUser]);

  const unreadByChannel = useMemo(() => Object.fromEntries(channels.map((channel) => {
    const message = channel.lastMessage;
    const lastRead = channel.readBy?.[currentUser?.id];
    const messageMs = message?.timestamp?.toMillis?.() || 0;
    const readMs = lastRead?.toMillis?.() || 0;
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
    channels,
    messages,
    activeChannelId,
    setActiveChannelId,
    users,
    loading,
    sendMessage,
    startDirectChat,
    markChannelRead,
    unreadByChannel,
    unreadCount
  };
};
