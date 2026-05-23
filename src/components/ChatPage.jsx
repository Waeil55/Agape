import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db, collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, getDocs, doc, setDoc, getDoc, updateDoc, deleteField, arrayUnion } from '../config/firebase';
import { MessageCircle, Send, Plus, ArrowLeft, X, Truck, ShieldCheck, Users, Phone, Trash2, Search } from 'lucide-react';
import { playMessageSound } from '../utils/notificationSound';

const ChatPage = ({ currentUser, role }) => {
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [text, setText] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [sidebar, setSidebar] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const scrollRef = useRef(null);
  const messagesEndRef = useRef(null);
  const audioCtxRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Pre-warm audio context for iOS
  useEffect(() => {
    const unlockAudio = () => {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          audioCtxRef.current = new AudioCtx();
          audioCtxRef.current.resume();
        }
      }
    };
    document.addEventListener('touchstart', unlockAudio, { once: true });
    document.addEventListener('click', unlockAudio, { once: true });
    return () => {
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('click', unlockAudio);
    };
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), snap => {
      const arr = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.email && data.email !== currentUser) arr.push(data.email);
      });
      setAllUsers(arr);
    });
    return () => unsub();
  }, [currentUser]);

  const prevConvsRef = useRef({});
  useEffect(() => {
    let isFirst = true;
    const unsub = onSnapshot(doc(db, 'chatData/conversations'), snap => {
      if (!snap.exists()) {
        setDoc(doc(db, 'chatData/conversations'), { conversations: {} }, { merge: true }).catch(() => {});
        setConversations([]);
        return;
      }
      const data = snap.data();
      const convs = Object.entries(data.conversations || {})
        .map(([id, c]) => ({ id, ...c }))
        .filter(c => role === 'admin' || c.participants?.includes(currentUser))
        .sort((a, b) => {
          const aTime = a.lastMessage?.timestamp?.toMillis?.() || 0;
          const bTime = b.lastMessage?.timestamp?.toMillis?.() || 0;
          return bTime - aTime;
        });

      // Detect new messages and play sound
      if (!isFirst) {
        convs.forEach(conv => {
          const prev = prevConvsRef.current[conv.id];
          const isNewMsg = prev && prev.lastMessage?.text !== conv.lastMessage?.text;
          if (isNewMsg && conv.lastMessage?.sender !== currentUser) {
            if (!activeConv || activeConv.id !== conv.id) {
              playMessageSound();
            }
          }
          prevConvsRef.current[conv.id] = { ...conv };
        });
      } else {
        convs.forEach(conv => { prevConvsRef.current[conv.id] = { ...conv }; });
        isFirst = false;
      }

      // Calculate unread counts
      const convsWithUnread = convs.map(conv => {
        const lastMsg = conv.lastMessage || {};
        const isUnread = lastMsg.sender !== currentUser && !(lastMsg.readBy || []).includes(currentUser);
        return { ...conv, unreadCount: isUnread ? 1 : 0 };
      });

      setConversations(convsWithUnread);
    });
    return () => unsub();
  }, [currentUser, role, activeConv?.id]);

  // Mark conversation as read
  useEffect(() => {
    if (!activeConv?.id) { setMessages([]); return; }
    let firstSnapshot = true;
    const q = query(collection(db, 'chat_messages'), where('conversationId', '==', activeConv.id));
    const unsub = onSnapshot(q, snap => {
      const msgs = [];
      snap.docChanges().forEach(change => {
        if (change.type === 'added' && !firstSnapshot) {
          const newMsg = { id: change.doc.id, ...change.doc.data() };
          if (newMsg.sender !== currentUser) {
            playMessageSound();
          }
        }
      });
      firstSnapshot = false;
      snap.forEach(d => {
        const msg = { id: d.id, ...d.data() };
        if (msg.sender !== currentUser && (!msg.readBy || !msg.readBy.includes(currentUser))) {
          updateDoc(doc(db, 'chat_messages', d.id), {
            readBy: [...(msg.readBy || []), currentUser]
          }).catch(() => {});
        }
        msgs.push(msg);
      });
      msgs.sort((a, b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0));
      setMessages(msgs);
      // Mark conversation lastMessage as read
      updateDoc(doc(db, 'chatData/conversations'), {
        [`conversations.${activeConv.id}.lastMessage.readBy`]: arrayUnion(currentUser)
      }).catch(() => {});
    });
    return () => unsub();
  }, [activeConv?.id, currentUser]);

  // Auto-scroll
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || !activeConv) return;
    const msg = text.trim();
    setText('');
    try {
      const msgRef = await addDoc(collection(db, 'chat_messages'), {
        conversationId: activeConv.id,
        text: msg,
        sender: currentUser,
        senderRole: role,
        timestamp: serverTimestamp(),
      });
      // Update conversation lastMessage
      await updateDoc(doc(db, 'chatData/conversations'), {
        [`conversations.${activeConv.id}.lastMessage`]: {
          text: msg,
          sender: currentUser,
          senderRole: role,
          timestamp: serverTimestamp(),
          readBy: [currentUser],
        },
      });
    } catch (err) {
      console.error('Failed to send message:', err);
      setText(msg); // Restore text on failure
    }
  };

  const createConv = async () => {
    if (selected.length === 0) return;
    const participants = [currentUser, ...selected];
    const id = `conv_${Date.now()}`;
    try {
      await setDoc(doc(db, 'chatData/conversations'), {
        [`conversations.${id}`]: {
          type: selected.length > 1 ? 'group' : 'direct',
          participants,
          name: selected.length > 1 ? `Group ${conversations.length + 1}` : selected[0].split('@')[0],
          createdAt: serverTimestamp(),
          lastMessage: { text: 'Started', sender: currentUser, timestamp: serverTimestamp(), readBy: [currentUser] },
        }
      }, { merge: true });
    } catch (err) {
      console.error('Failed to create conversation:', err);
      return;
    }
    setShowNew(false);
    setSelected([]);
    setActiveConv({ id, participants, type: selected.length > 1 ? 'group' : 'direct', name: selected.length > 1 ? `Group ${conversations.length + 1}` : selected[0].split('@')[0] });
    setSidebar(false);
  };

  const deleteConv = async (convId) => {
    if (!window.confirm('Delete this conversation?')) return;
    try {
      await updateDoc(doc(db, 'chatData/conversations'), {
        [`conversations.${convId}`]: deleteField()
      });
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
    if (activeConv?.id === convId) setActiveConv(null);
  };

  const label = (c) => {
    if (c.type === 'group') return c.name || 'Group';
    const other = (c.participants || []).filter(p => p !== currentUser);
    return other[0]?.split('@')[0] || 'Unknown';
  };

  const timeStr = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-1 bg-white overflow-hidden h-full">
      {/* Sidebar */}
      <div className={`${isMobile ? (sidebar && !activeConv ? 'flex' : 'hidden') : 'flex'} flex-col w-full md:w-80 border-r border-slate-100 shrink-0 bg-white h-full`}>
        <div className="p-4 border-b border-slate-100">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold text-slate-900">Messages</h2>
            <button onClick={() => setShowNew(true)} className="w-8 h-8 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-700"><Plus size={16} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <MessageCircle size={32} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm font-bold">No conversations</p>
              <p className="text-xs mt-1">Tap + to start a new chat.</p>
            </div>
          ) : (
            conversations.map(c => (
              <button key={c.id} onClick={() => { setActiveConv(c); if (isMobile) setSidebar(false); }}
                className={`w-full text-left p-4 hover:bg-slate-50 flex items-center gap-3 border-b border-slate-50 transition ${activeConv?.id === c.id ? 'bg-blue-50' : ''}`}>
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold shrink-0 ${c.unreadCount > 0 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {label(c).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className={`font-semibold text-sm truncate ${c.unreadCount > 0 ? 'text-slate-900' : 'text-slate-700'}`}>{label(c)}</p>
                    {c.lastMessage?.timestamp && (
                      <span className="text-xs text-slate-400 shrink-0 ml-2">{timeStr(c.lastMessage.timestamp)}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-slate-400 truncate flex-1">
                      {c.lastMessage?.sender === currentUser ? <span className="text-slate-300">You: </span> : ''}{c.lastMessage?.text || 'No messages'}
                    </p>
                    {c.unreadCount > 0 && (
                      <span className="ml-2 w-5 h-5 bg-blue-600 text-xs text-white rounded-full flex items-center justify-center font-bold shrink-0">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`flex-1 flex flex-col min-w-0 bg-slate-50 h-full ${isMobile && !activeConv ? 'hidden' : ''}`}>
        {activeConv ? (
          <>
            <div className="sticky top-0 z-10 px-4 py-3 bg-white border-b border-slate-100 flex items-center gap-3">
              {isMobile && <button onClick={() => { setActiveConv(null); setSidebar(true); }} className="p-1 text-slate-500"><ArrowLeft size={18} /></button>}
              <div className="flex-1">
                <p className="font-semibold text-sm text-slate-900">{label(activeConv)}</p>
                <p className="text-xs text-slate-400">{activeConv.type === 'group' ? `${activeConv.participants?.length || 0} members` : 'Direct message'}</p>
              </div>
              <button onClick={() => deleteConv(activeConv.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl"><Trash2 size={15} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2" ref={scrollRef}>
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-slate-400">
                  <div className="text-center">
                    <MessageCircle size={32} className="mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-bold">No messages yet</p>
                    <p className="text-xs mt-1">Say hello!</p>
                  </div>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const me = msg.sender === currentUser;
                  return (
                    <div key={msg.id || i} className={`flex ${me ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-sm ${me ? 'bg-blue-600 text-white rounded-br-md' : 'bg-white text-slate-800 rounded-bl-md shadow-sm border border-slate-100'}`}>
                        {!me && <p className="text-[10px] font-bold text-blue-600 mb-0.5">{msg.sender?.split('@')[0]}</p>}
                        <p className="leading-relaxed break-words">{msg.text}</p>
                        <p className={`text-[10px] mt-1 ${me ? 'text-blue-200 text-right' : 'text-slate-400'}`}>
                          {msg.timestamp ? timeStr(msg.timestamp) : ''}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="sticky bottom-0 z-10 px-3 py-2.5 bg-white border-t border-slate-100" style={{paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))'}}>
              <form onSubmit={send} className="flex items-end gap-2">
                <div className="flex-1 bg-slate-100 rounded-2xl px-4 py-2.5 border border-transparent focus-within:bg-white focus-within:border-blue-500 focus-within:shadow-sm transition">
                  <input type="text" placeholder="Type a message..." value={text} onChange={e => setText(e.target.value)}
                    className="flex-1 text-sm outline-none bg-transparent placeholder:text-slate-400"
                  />
                </div>
                <button type="submit" disabled={!text.trim()} className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 active:scale-90 transition disabled:opacity-40 shadow-sm shrink-0"><Send size={16} fill="currentColor" /></button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <div className="text-center">
              <MessageCircle size={48} className="mx-auto mb-4 opacity-20" />
              <p className="text-lg font-bold text-slate-700">Select a chat</p>
              <p className="text-sm mt-1">Choose a conversation or start a new one.</p>
            </div>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {showNew && (
        <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4" onClick={() => { setShowNew(false); setSelected([]); }}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 relative z-10" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">New Chat</h3>
              <button onClick={() => { setShowNew(false); setSelected([]); }} className="p-1 text-slate-400"><X size={18} /></button>
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto mb-4">
              {allUsers.map(email => {
                const sel = selected.includes(email);
                return (
                  <button key={email} onClick={() => setSelected(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email])}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition ${sel ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold">{email.charAt(0).toUpperCase()}</div>
                    <div className="text-left">
                      <p className="text-sm font-medium">{email.split('@')[0]}</p>
                      <p className="text-xs text-slate-400">{email}</p>
                    </div>
                    {sel && <span className="ml-auto text-blue-600 text-xs font-bold">✓</span>}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowNew(false); setSelected([]); }} className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-medium text-sm">Cancel</button>
              <button onClick={createConv} disabled={selected.length === 0} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">Start</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPage;
