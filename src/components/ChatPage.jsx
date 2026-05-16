import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, Send, Users, Search, Plus, ArrowLeft, Phone, Truck, ShieldCheck, Clock, X, Trash2, Check, CheckCheck, Smile } from 'lucide-react';
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, getDocs, doc, setDoc, updateDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
const EMOJIS = ['😀','😂','❤️','🔥','👍','🙏','🎉','💯','⭐','💪','😍','🥳','😎','🤝','✅','🙌','👏','🎯','🚀','💡'];

const CONVERSATIONS_DOC = 'chatData/conversations';

const ChatPage = ({ currentUser, role }) => {
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [newChatSelected, setNewChatSelected] = useState([]);
  const [newChatGroupName, setNewChatGroupName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showEmoji, setShowEmoji] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [typingUsers, setTypingUsers] = useState({});
  const [unreadMap, setUnreadMap] = useState({});
  const [msgSearch, setMsgSearch] = useState('');
  const scrollRef = useRef(null);
  const typingTimer = useRef(null);
  const prevConvId = useRef(null);

  // Track online presence
  useEffect(() => {
    const userRef = doc(db, 'presence', currentUser);
    const unsub = onSnapshot(collection(db, 'presence'), (snap) => {
      const map = {};
      snap.forEach(d => { map[d.id] = d.data(); });
      setOnlineUsers(map);
    });
    setDoc(userRef, { email: currentUser, online: true, lastSeen: serverTimestamp() }, { merge: true });
    const handle = setInterval(() => {
      updateDoc(userRef, { lastSeen: serverTimestamp() }).catch(() => {});
    }, 30000);
    window.addEventListener('beforeunload', () => {
      updateDoc(userRef, { online: false, lastSeen: serverTimestamp() }).catch(() => {});
    });
    return () => {
      unsub();
      clearInterval(handle);
      updateDoc(userRef, { online: false, lastSeen: serverTimestamp() }).catch(() => {});
    };
  }, [currentUser]);

  // Load all users
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const users = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.email && data.email !== currentUser) {
          users.push({ uid: d.id, email: data.email, role: data.role || 'unknown' });
        }
      });
      setAllUsers(users);
    });
    return () => unsub();
  }, [currentUser]);

  // Load conversations
  useEffect(() => {
    const unsub = onSnapshot(doc(db, CONVERSATIONS_DOC), async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const convs = Object.entries(data.conversations || {})
          .map(([id, c]) => ({ id, ...c }))
          .filter(c => c.participants?.includes(currentUser))
          .sort((a, b) => {
            const ta = a.lastMessage?.timestamp?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
            const tb = b.lastMessage?.timestamp?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
            return tb - ta;
          });
        setConversations(convs);
        // Build unread map
        const uMap = {};
        convs.forEach(c => {
          const ud = (c.unread || {})[currentUser] || 0;
          uMap[c.id] = ud;
        });
        setUnreadMap(uMap);
      }
      setIsLoading(false);
    });
    return () => unsub();
  }, [currentUser]);

  // Load messages + track read receipts + typing
  useEffect(() => {
    if (!activeConv) { setMessages([]); return; }
    const q = query(
      collection(db, 'chat_messages'),
      where('conversationId', '==', activeConv.id),
      orderBy('timestamp', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const msgs = [];
      snap.forEach((d) => msgs.push({ id: d.id, ...d.data() }));
      setMessages(msgs);
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 100);
      // Mark unread as read
      const convRef = doc(db, CONVERSATIONS_DOC);
      getDoc(convRef).then(s => {
        if (s.exists()) {
          const d = s.data();
          const c = d.conversations?.[activeConv.id];
          if (c && (c.unread?.[currentUser] || 0) > 0) {
            updateDoc(convRef, { [`conversations.${activeConv.id}.unread.${currentUser}`]: 0 }).catch(() => {});
          }
        }
      });
    });
    // Track typing for this conversation
    const typingQ = query(
      collection(db, 'chat_typing'),
      where('conversationId', '==', activeConv.id)
    );
    const typingUnsub = onSnapshot(typingQ, (snap) => {
      const map = {};
      snap.forEach(d => {
        const dt = d.data();
        if (dt.email !== currentUser) map[dt.email] = true;
      });
      setTypingUsers(map);
    });
    return () => {
      unsub();
      typingUnsub();
    };
  }, [activeConv?.id, currentUser]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!message.trim() || !activeConv) return;
    const msgData = {
      conversationId: activeConv.id,
      text: message.trim(),
      sender: currentUser,
      senderRole: role,
      timestamp: serverTimestamp(),
      readBy: [currentUser],
    };
    const text = message.trim();
    setMessage('');
    setShowEmoji(false);
    try {
      await addDoc(collection(db, 'chat_messages'), msgData);
      const ref = doc(db, CONVERSATIONS_DOC);
      const snap = await getDoc(ref);
      const data = snap.exists() ? snap.data() : { conversations: {} };
      data.conversations = data.conversations || {};
      const conv = data.conversations[activeConv.id] || {};
      conv.lastMessage = { text, sender: currentUser, timestamp: serverTimestamp() };
      // Increment unread for all other participants
      (activeConv.participants || []).forEach(p => {
        if (p !== currentUser) {
          conv.unread = conv.unread || {};
          conv.unread[p] = (conv.unread[p] || 0) + 1;
        }
      });
      if (!conv.unread) conv.unread = {};
      delete conv.unread[currentUser];
      data.conversations[activeConv.id] = conv;
      await setDoc(ref, data);
      // Clear typing
      const typingColl = collection(db, 'chat_typing');
      const typingQ = query(typingColl, where('conversationId', '==', activeConv.id), where('email', '==', currentUser));
      const typingSnap = await getDocs(typingQ);
      typingSnap.forEach(d => deleteDoc(d.ref).catch(() => {}));
    } catch (err) {
      console.error("Send failed:", err);
    }
  };

  const handleTyping = () => {
    if (!activeConv) return;
    const typingColl = collection(db, 'chat_typing');
    const typingRef = doc(typingColl);
    setDoc(typingRef, { conversationId: activeConv.id, email: currentUser, timestamp: serverTimestamp() }).catch(() => {});
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      const q = query(typingColl, where('conversationId', '==', activeConv.id), where('email', '==', currentUser));
      getDocs(q).then(s => s.forEach(d => deleteDoc(d.ref).catch(() => {})));
    }, 3000);
  };

  const createConversation = async () => {
    if (newChatSelected.length === 0) return;
    setIsCreating(true);
    try {
      const participants = [currentUser, ...newChatSelected];
      const convId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const isGroup = newChatSelected.length > 1 || newChatGroupName.trim();
      const unreadInit = {};
      participants.forEach(p => { unreadInit[p] = 0; });
      const convData = {
        type: isGroup ? 'group' : 'direct',
        participants,
        name: isGroup ? (newChatGroupName.trim() || newChatSelected.map(e => e.split('@')[0]).join(', ')) : newChatSelected[0].split('@')[0],
        createdAt: serverTimestamp(),
        lastMessage: { text: 'Conversation started', sender: currentUser, timestamp: serverTimestamp() },
        unread: unreadInit,
        createdBy: currentUser,
      };
      const ref = doc(db, CONVERSATIONS_DOC);
      const snap = await getDoc(ref);
      const data = snap.exists() ? snap.data() : { conversations: {} };
      data.conversations = data.conversations || {};
      data.conversations[convId] = convData;
      await setDoc(ref, data);
      setShowNewChat(false);
      setNewChatSelected([]);
      setNewChatGroupName('');
      setActiveConv({ id: convId, ...convData });
      setSidebarOpen(false);
    } catch (err) {
      console.error("Create conversation failed:", err);
    }
    setIsCreating(false);
  };

  const deleteConversation = async (convId) => {
    if (!window.confirm('Delete this conversation?')) return;
    try {
      const ref = doc(db, CONVERSATIONS_DOC);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        delete data.conversations[convId];
        await setDoc(ref, data);
      }
      if (activeConv?.id === convId) setActiveConv(null);
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const toggleUserSelect = (email) => {
    setNewChatSelected(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]);
  };

  const insertEmoji = (emoji) => {
    setMessage(prev => prev + emoji);
    setShowEmoji(false);
  };

  const filteredUsers = allUsers.filter(u =>
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const convLabel = (conv) => {
    if (conv.type === 'group') return conv.name || 'Group';
    const other = (conv.participants || []).filter(p => p !== currentUser);
    return other[0]?.split('@')[0] || 'Unknown';
  };

  const convIcon = (conv) => {
    if (conv.type === 'group') return <Users size={16} />;
    const otherRole = (conv.participants || [])
      .filter(p => p !== currentUser)
      .map(p => allUsers.find(u => u.email === p))
      .filter(Boolean)[0]?.role;
    if (otherRole === 'driver') return <Truck size={16} />;
    return <ShieldCheck size={16} />;
  };

  const isUserOnline = (email) => {
    const u = onlineUsers[email];
    return u?.online === true;
  };

  const timeStr = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const dateLabel = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return timeStr(ts);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const filteredMessages = msgSearch.trim()
    ? messages.filter(m => m.text?.toLowerCase().includes(msgSearch.toLowerCase()))
    : messages;

  const typingText = () => {
    const names = Object.keys(typingUsers);
    if (names.length === 0) return '';
    const label = names.map(e => e.split('@')[0]).join(', ');
    return `${label} ${names.length === 1 ? 'is' : 'are'} typing...`;
  };

  return (
    <div className="flex h-[calc(100dvh-180px)] bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden animate-in">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-80 lg:w-96 border-r border-slate-100 bg-slate-50/50 shrink-0`}>
        <div className="p-4 border-b border-slate-100 bg-white">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2"><MessageCircle size={16} className="text-blue-600" /> Messages</h3>
            <button onClick={() => setShowNewChat(true)} className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition active:scale-95"><Plus size={16} /></button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search conversations..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {isLoading ? (
            <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" /></div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center text-slate-400">
              <MessageCircle size={36} className="opacity-20 mb-3" />
              <p className="text-sm font-bold">No conversations yet</p>
              <p className="text-[11px] mt-1">Start a new chat with someone.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {conversations.map(conv => {
                const unread = unreadMap[conv.id] || 0;
                const otherEmail = (conv.participants || []).filter(p => p !== currentUser)[0];
                const online = !conv.type === 'group' && isUserOnline(otherEmail);
                return (
                  <button key={conv.id} onClick={() => { setActiveConv(conv); setSidebarOpen(false); }}
                    className={`w-full text-left p-4 hover:bg-slate-100 transition flex items-center gap-3 ${activeConv?.id === conv.id ? 'bg-blue-50' : ''}`}>
                    <div className="relative shrink-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${conv.type === 'group' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-600'}`}>
                        {convIcon(conv)}
                      </div>
                      {conv.type !== 'group' && online && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between items-center">
                        <p className="text-sm font-bold text-slate-900 truncate">{convLabel(conv)}</p>
                        {conv.lastMessage?.timestamp && <span className="text-[9px] font-bold text-slate-400 shrink-0 ml-2">{dateLabel(conv.lastMessage.timestamp)}</span>}
                      </div>
                      <p className={`text-[11px] truncate mt-0.5 ${unread > 0 ? 'font-bold text-slate-900' : 'text-slate-500'}`}>
                        {conv.lastMessage?.sender === currentUser ? 'You: ' : ''}{conv.lastMessage?.text || 'No messages'}
                      </p>
                    </div>
                    {unread > 0 && (
                      <span className="ml-auto shrink-0 bg-blue-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full min-w-[20px] text-center">{unread > 99 ? '99+' : unread}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeConv ? (
          <>
            <div className="p-4 border-b border-slate-100 bg-white flex items-center gap-3 shrink-0">
              <button onClick={() => { setSidebarOpen(true); setActiveConv(null); }} className="md:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-xl"><ArrowLeft size={18} /></button>
              <div className="relative shrink-0">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${activeConv.type === 'group' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-600'}`}>
                  {convIcon(activeConv)}
                </div>
                {activeConv.type !== 'group' && isUserOnline(activeConv.participants?.filter(p => p !== currentUser)[0]) && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-bold text-sm text-slate-900 truncate">{convLabel(activeConv)}</h4>
                <p className="text-[10px] font-medium text-slate-400">
                  {typingText() || (activeConv.type === 'group'
                    ? `${activeConv.participants?.length || 0} members`
                    : (isUserOnline(activeConv.participants?.filter(p => p !== currentUser)[0]) ? 'Online' : 'Offline'))}
                </p>
              </div>
              <button onClick={() => deleteConversation(activeConv.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition" title="Delete conversation"><Trash2 size={16} /></button>
            </div>

            {/* Message search bar */}
            <div className="px-4 pt-2 pb-0">
              <div className="relative max-w-xs">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Search in conversation..." value={msgSearch} onChange={(e) => setMsgSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 scrollbar-thin" ref={scrollRef}>
              {filteredMessages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-slate-400">
                  <p className="text-sm font-bold">{msgSearch ? 'No messages match your search.' : 'No messages yet. Say hello!'}</p>
                </div>
              ) : (
                filteredMessages.map((msg, idx) => {
                  const isMe = msg.sender === currentUser;
                  const showAvatar = idx === 0 || filteredMessages[idx - 1].sender !== msg.sender;
                  const isRead = (msg.readBy || []).some(r => r !== currentUser && activeConv.participants?.includes(r));
                  return (
                    <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      {showAvatar && !isMe && (
                        <div className="flex items-center gap-2 mb-1 ml-1">
                          <span className="text-[10px] font-bold text-slate-500">{msg.sender?.split('@')[0]}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${msg.senderRole === 'driver' ? 'bg-emerald-50 text-emerald-600' : msg.senderRole === 'admin' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>
                            {msg.senderRole || 'user'}
                          </span>
                        </div>
                      )}
                      <div className={`max-w-[85%] md:max-w-[70%] px-4 py-2.5 rounded-2xl shadow-sm border ${isMe ? 'bg-blue-600 border-blue-500 text-white rounded-tr-none' : 'bg-slate-50 border-slate-100 text-slate-900 rounded-tl-none'}`}>
                        <p className="text-sm font-medium leading-relaxed break-words">{msg.text}</p>
                        <div className={`flex items-center justify-end gap-1 mt-1 ${isMe ? 'text-blue-100' : 'text-slate-400'}`}>
                          <span className="text-[9px] font-bold">{msg.timestamp ? timeStr(msg.timestamp) : '...'}</span>
                          {isMe && (isRead ? <CheckCheck size={12} className="text-blue-200" /> : <Check size={12} />)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 shrink-0">
              <form onSubmit={handleSend} className="flex gap-3">
                <div className="flex-1 relative flex items-center gap-2 bg-white border border-slate-200 rounded-[1.5rem] px-4 shadow-sm">
                  <input type="text" placeholder="Type a message..." value={message} onChange={(e) => { setMessage(e.target.value); handleTyping(); }}
                    className="flex-1 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none bg-transparent" />
                  <button type="button" onClick={() => setShowEmoji(!showEmoji)} className="p-1 text-slate-400 hover:text-slate-600 transition shrink-0">
                    <Smile size={18} />
                  </button>
                  {showEmoji && (
                    <div className="absolute bottom-full right-0 mb-2 bg-white border border-slate-200 rounded-xl p-2 shadow-xl grid grid-cols-5 gap-1 z-10">
                      {EMOJIS.map(e => (
                        <button key={e} type="button" onClick={() => insertEmoji(e)} className="w-8 h-8 hover:bg-slate-100 rounded-lg text-lg flex items-center justify-center transition">{e}</button>
                      ))}
                    </div>
                  )}
                </div>
                <button type="submit" disabled={!message.trim()}
                  className="px-5 py-3 bg-blue-600 text-white rounded-[1.5rem] hover:bg-blue-700 transition active:scale-95 disabled:opacity-50 shadow-lg shadow-blue-600/20">
                  <Send size={18} fill="currentColor" />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
            <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] flex items-center justify-center mb-6">
              <MessageCircle size={48} className="opacity-20" />
            </div>
            <p className="text-lg font-black text-slate-700">Agape Care Chat</p>
            <p className="text-sm font-medium mt-2 text-center max-w-xs">Select a conversation from the sidebar or start a new one.</p>
            <button onClick={() => setShowNewChat(true)} className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-[1.5rem] font-bold text-sm hover:bg-blue-700 transition active:scale-95 shadow-lg shadow-blue-600/20 flex items-center gap-2">
              <Plus size={18} /> New Conversation
            </button>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => { setShowNewChat(false); setNewChatSelected([]); setNewChatGroupName(''); }} />
          <div className="bg-white/95 backdrop-blur-xl w-full max-w-lg rounded-[2.5rem] p-6 md:p-8 shadow-2xl relative z-10 border border-white/50 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-900 flex items-center gap-2"><Users size={20} className="text-blue-600" /> New Conversation</h3>
              <button onClick={() => { setShowNewChat(false); setNewChatSelected([]); setNewChatGroupName(''); }} className="p-2 bg-slate-100 rounded-xl text-slate-500 hover:bg-slate-200 transition"><X size={18} /></button>
            </div>

            {newChatSelected.length > 1 && (
              <input type="text" placeholder="Group name (optional)" value={newChatGroupName} onChange={(e) => setNewChatGroupName(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:border-blue-500 outline-none mb-4" />
            )}

            <div className="relative mb-4">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Search by email..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white focus:border-blue-500 outline-none" />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
              {filteredUsers.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8 font-bold">No users found.</p>
              ) : (
                filteredUsers.map(u => {
                  const selected = newChatSelected.includes(u.email);
                  return (
                    <button key={u.email} onClick={() => toggleUserSelect(u.email)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl transition text-left ${selected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'}`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black ${selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                        {u.email.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 truncate">{u.email.split('@')[0]}</p>
                        <p className="text-[10px] font-medium text-slate-400 truncate">{u.email}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${u.role === 'driver' ? 'bg-emerald-50 text-emerald-600' : u.role === 'admin' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>
                        {u.role}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
              <p className="text-[11px] font-bold text-slate-500">{newChatSelected.length} selected{newChatSelected.length > 1 ? ' (group)' : ''}</p>
              <div className="flex gap-2">
                <button onClick={() => { setShowNewChat(false); setNewChatSelected([]); setNewChatGroupName(''); }} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition">Cancel</button>
                <button onClick={createConversation} disabled={newChatSelected.length === 0 || isCreating}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition disabled:opacity-50 active:scale-95 shadow-md shadow-blue-600/20">
                  {isCreating ? 'Creating...' : 'Start Chat'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPage;