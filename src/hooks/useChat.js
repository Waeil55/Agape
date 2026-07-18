import { useState, useEffect, useCallback } from 'react';
import {
  db, auth, collection, doc, setDoc, addDoc, query, where,
  orderBy, onSnapshot, serverTimestamp, getDoc, updateDoc, writeBatch
} from '../config/firebase';

export const useChat = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [channels, setChannels] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

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
      setLoading(false);
    });

    return () => unsubChannels();
  }, [currentUser]);

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
    batch.update(channelRef, {
      lastMessage: {
        text,
        senderId: currentUser.id,
        senderName: currentUser.name || currentUser.username || currentUser.email,
        timestamp: serverTimestamp()
      },
      updatedAt: serverTimestamp()
    });

    await batch.commit();
  }, [currentUser, activeChannelId]);

  // 6. Start / Retrieve Direct Chat Channel
  const startDirectChat = useCallback(async (otherUser) => {
    if (!currentUser || !otherUser) return null;

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
  }, [currentUser]);

  return {
    currentUser,
    channels,
    messages,
    activeChannelId,
    setActiveChannelId,
    users,
    loading,
    sendMessage,
    startDirectChat
  };
};
