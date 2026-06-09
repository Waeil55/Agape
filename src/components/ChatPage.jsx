import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { db, collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, getDocs, doc, setDoc, updateDoc, deleteField } from '../config/firebase';
import { limit } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { MessageCircle, Send, Plus, ArrowLeft, X, Search, Loader2, CheckCheck } from 'lucide-react';
import { playMessageSound } from '../utils/notificationSound';

const normalizePhone = (raw) => {
  if (!raw) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  if (digits.length === 10) return '+1' + digits;
  return '+' + digits;
};

const TELNYX_NUMBER = '+18552223330';

const useMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return isMobile;
};

const fmtTime = (ts) => {
  if (!ts) return '';
  const d = ts?.toMillis ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = ts?.toMillis ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const ChatPage = ({ currentUser, role, drivers = [], dispatchers = [], trips = [], onSwitchToDispatch }) => {
  const [activeTab, setActiveTab] = useState('team');
  return (
    <div className="flex flex-col min-h-0 flex-1 bg-slate-100 overflow-hidden">
      {role !== 'driver' && (
        <div className="shrink-0 bg-white border-b border-slate-200 px-3 py-2 flex gap-1 z-10">
          <button onClick={() => setActiveTab('team')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${activeTab === 'team' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>
            Team
          </button>
          <button onClick={() => setActiveTab('clients')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${activeTab === 'clients' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>
            Clients
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        {role === 'driver' || activeTab === 'team' ? (
          <TeamChat currentUser={currentUser} role={role} />
        ) : (
          <ClientChat currentUser={currentUser} role={role} drivers={drivers} dispatchers={dispatchers} trips={trips} onSwitchToDispatch={onSwitchToDispatch} />
        )}
      </div>
    </div>
  );
};

const TeamChat = ({ currentUser, role }) => {
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const isMobile = useMobile();
  const msgsEndRef = useRef(null);
  const inputRef = useRef(null);
  const prevConvsRef = useRef({});
  const activeConvRef = useRef(null);

  useEffect(() => { activeConvRef.current = activeConv; }, [activeConv]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), snap => {
      const arr = [];
      snap.forEach(d => { const data = d.data(); if (data.email && data.email !== currentUser) arr.push(data.email); });
      setAllUsers(arr);
    }, (err) => console.error('Users listener error:', err));
    return () => unsub();
  }, [currentUser]);

  useEffect(() => {
    let isFirst = true;
    const unsub = onSnapshot(doc(db, 'chatData/conversations'), snap => {
      if (!snap.exists()) {
        setDoc(doc(db, 'chatData/conversations'), { conversations: {} }, { merge: true }).catch((e) => console.error('Failed to init chatData:', e));
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
      if (!isFirst) {
        convs.forEach(conv => {
          const prev = prevConvsRef.current[conv.id];
          const curActive = activeConvRef.current;
          if (prev && prev.lastMessage?.text !== conv.lastMessage?.text && conv.lastMessage?.sender !== currentUser && (!curActive || curActive.id !== conv.id)) {
            try { playMessageSound(); } catch {}
          }
          prevConvsRef.current[conv.id] = { ...conv };
        });
      } else {
        convs.forEach(conv => { prevConvsRef.current[conv.id] = { ...conv }; });
        isFirst = false;
      }
      const withUnread = convs.map(conv => {
        const last = conv.lastMessage || {};
        return { ...conv, unreadCount: last.sender !== currentUser && !(last.readBy || []).includes(currentUser) ? 1 : 0 };
      });
      setConversations(withUnread);
    }, (err) => console.error('Conversations listener error:', err));
    return () => unsub();
  }, [currentUser, role]);

  useEffect(() => {
    if (!activeConv?.id) { setMessages([]); return; }
    let firstSnapshot = true;
    const q = query(collection(db, 'chat_messages'), where('conversationId', '==', activeConv.id), limit(300));
    const unsub = onSnapshot(q, snap => {
      snap.docChanges().forEach(change => {
        if (change.type === 'added' && !firstSnapshot) {
          const newMsg = { id: change.doc.id, ...change.doc.data() };
          if (newMsg.sender !== currentUser) {
            try { playMessageSound(); } catch {}
          }
        }
      });
      firstSnapshot = false;
      const msgs = [];
      snap.forEach(d => {
        const msg = { id: d.id, ...d.data() };
        if (msg.sender !== currentUser && (!msg.readBy || !msg.readBy.includes(currentUser))) {
          updateDoc(doc(db, 'chat_messages', d.id), { readBy: [...(msg.readBy || []), currentUser] }).catch(() => {});
        }
        msgs.push(msg);
      });
      msgs.sort((a, b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0));
      setMessages(msgs);
      if (activeConvRef.current?.id === activeConv.id) {
        updateDoc(doc(db, 'chatData/conversations'), {
          [`conversations.${activeConv.id}.lastMessage.readBy`]: [...(activeConv.lastMessage?.readBy || []), currentUser]
        }).catch(() => {});
      }
    }, (err) => console.error('Messages listener error:', err));
    return () => unsub();
  }, [activeConv?.id, currentUser]);

  useEffect(() => { msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const convLabel = useCallback((c) => {
    if (c.type === 'group') return c.name || 'Group';
    const other = (c.participants || []).filter(p => p !== currentUser);
    return other[0]?.split('@')[0] || 'Unknown';
  }, [currentUser]);

  const filteredConvs = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(c => convLabel(c).toLowerCase().includes(q));
  }, [conversations, search, convLabel]);

  const handleSend = async () => {
    if (!text.trim() || !activeConv || sending) return;
    const msg = text.trim();
    setText('');
    setSending(true);
    try {
      await addDoc(collection(db, 'chat_messages'), {
        conversationId: activeConv.id,
        text: msg,
        sender: currentUser,
        senderRole: role,
        timestamp: serverTimestamp(),
      });
      await updateDoc(doc(db, 'chatData/conversations'), {
        [`conversations.${activeConv.id}.lastMessage`]: {
          text: msg, sender: currentUser, senderRole: role, timestamp: serverTimestamp(), readBy: [currentUser]
        }
      });
    } catch (err) {
      console.error('Send failed:', err);
      setText(msg);
    }
    setSending(false);
  };

  const handleCreateConv = async () => {
    if (selected.length === 0) return;
    const participants = [currentUser, ...selected];
    const id = 'conv_' + Date.now();
    const name = selected.length > 1 ? 'Group' : selected[0].split('@')[0];
    const type = selected.length > 1 ? 'group' : 'direct';
    try {
      await setDoc(doc(db, 'chatData/conversations'), {
        [`conversations.${id}`]: {
          type, participants, name, createdAt: serverTimestamp(),
          lastMessage: { text: 'Started', sender: currentUser, timestamp: serverTimestamp(), readBy: [currentUser] }
        }
      }, { merge: true });
      const newConv = { id, type, participants, name };
      setShowNew(false);
      setSelected([]);
      setActiveConv(newConv);
    } catch (err) { console.error('Create conversation failed:', err); }
  };

  const handleDeleteConv = async (convId) => {
    if (!window.confirm('Delete this conversation?')) return;
    try { await updateDoc(doc(db, 'chatData/conversations'), { [`conversations.${convId}`]: deleteField() }); } catch (err) { console.error(err); }
    if (activeConv?.id === convId) setActiveConv(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const showList = isMobile ? !activeConv : true;
  const showChat = isMobile ? !!activeConv : true;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {showList && (
        <div className={`${isMobile ? 'w-full' : 'w-80 shrink-0 border-r border-slate-200'} flex flex-col min-h-0`}>
          <div className="shrink-0 bg-white border-b border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-black text-slate-900">Messages</h2>
              <button onClick={() => setShowNew(true)} className="w-11 h-11 min-h-[44px] bg-slate-900 text-white rounded-xl flex items-center justify-center hover:bg-slate-800 active:scale-95 transition">
                <Plus size={16} />
              </button>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search"
                className="w-full pl-9 pr-3 py-2 bg-slate-100 rounded-xl text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredConvs.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <MessageCircle size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm font-bold">{search ? 'No results' : 'No conversations'}</p>
                <p className="text-xs mt-1">{search ? 'Try a different search.' : 'Tap + to start a new chat.'}</p>
              </div>
            ) : (
              filteredConvs.map(c => (
                <button key={c.id} onClick={() => { setActiveConv(c); inputRef.current?.focus(); }}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-slate-100 transition ${activeConv?.id === c.id ? 'bg-blue-50' : 'active:bg-slate-50'}`}>
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${c.unreadCount > 0 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    {convLabel(c).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className={`text-sm truncate ${c.unreadCount > 0 ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>{convLabel(c)}</p>
                      {c.lastMessage?.timestamp && <span className="text-[10px] text-slate-400 shrink-0 ml-2">{fmtDate(c.lastMessage.timestamp)}</span>}
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-slate-400 truncate">
                        {c.lastMessage?.sender === currentUser ? 'You: ' : ''}{c.lastMessage?.text || 'No messages'}
                      </p>
                      {c.unreadCount > 0 && <span className="ml-2 w-[18px] h-[18px] bg-blue-600 text-[10px] text-white rounded-full flex items-center justify-center font-bold shrink-0">1</span>}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {showChat && (
        <div className="min-h-0 flex-1 flex flex-col">
          {activeConv ? (
            <div className="flex flex-col min-h-0 flex-1 bg-slate-100">
              <div className="shrink-0 bg-white border-b border-slate-200 px-3 py-2.5 flex items-center gap-3">
                {isMobile && (
                  <button onClick={() => setActiveConv(null)} className="p-2.5 min-h-[44px] min-w-[44px] text-slate-500 hover:bg-slate-100 rounded-lg flex items-center justify-center">
                    <ArrowLeft size={20} />
                  </button>
                )}
                <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold shrink-0">
                  {convLabel(activeConv).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm text-slate-900 truncate">{convLabel(activeConv)}</p>
                  <p className="text-[10px] text-slate-400">{activeConv.type === 'group' ? `${activeConv.participants?.length || 0} members` : 'Direct message'}</p>
                </div>
                <button onClick={() => handleDeleteConv(activeConv.id)} className="p-2.5 min-h-[44px] min-w-[44px] text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-1">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-slate-400">
                    <div className="text-center">
                      <div className="w-14 h-14 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-3">
                        <MessageCircle size={22} className="text-slate-300" />
                      </div>
                      <p className="text-sm font-bold text-slate-600">No messages yet</p>
                      <p className="text-xs mt-1 text-slate-400">Say hello!</p>
                    </div>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const me = msg.sender === currentUser;
                    return (
                      <div key={msg.id} className={`flex ${me ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] px-3.5 py-2 text-sm leading-relaxed ${
                          me ? 'bg-blue-600 text-white rounded-2xl rounded-br-md' : 'bg-white text-slate-800 rounded-2xl rounded-bl-md shadow-sm'
                        }`}>
                          {!me && <p className="text-[10px] font-bold text-blue-600 mb-0.5">{msg.sender?.split('@')[0]}</p>}
                          <p className="break-words">{msg.text}</p>
                          <p className={`text-[10px] mt-1 flex items-center gap-1 ${me ? 'text-blue-200 justify-end' : 'text-slate-400'}`}>
                            {fmtTime(msg.timestamp)}
                            {me && <CheckCheck size={10} />}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={msgsEndRef} />
              </div>
              <div className="shrink-0 bg-white border-t border-slate-200 px-3 py-2.5 safe-bottom">
                <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex items-center gap-2">
                  <input ref={inputRef} type="text" placeholder="Message" value={text} onChange={e => setText(e.target.value)} onKeyDown={handleKeyDown}
                    className="flex-1 bg-slate-100 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition min-h-[40px] max-h-[40px]" />
                  <button type="submit" disabled={!text.trim() || sending}
                    className="w-11 h-11 min-h-[44px] bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 active:scale-95 transition disabled:opacity-40 shrink-0">
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} fill="currentColor" />}
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center flex-1 text-slate-400">
              <div className="text-center">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-3">
                  <MessageCircle size={28} className="text-slate-300" />
                </div>
                <p className="text-sm font-bold text-slate-700">Select a chat</p>
                <p className="text-xs mt-1 text-slate-400">Choose a conversation or start a new one.</p>
              </div>
            </div>
          )}
        </div>
      )}
      {showNew && (
        <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4" onClick={() => { setShowNew(false); setSelected([]); }}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 relative z-10 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-slate-900">New Chat</h3>
              <button onClick={() => { setShowNew(false); setSelected([]); }} className="p-2.5 min-h-[44px] min-w-[44px] text-slate-400 hover:bg-slate-100 rounded-lg flex items-center justify-center">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-0.5 max-h-60 overflow-y-auto mb-4">
              {allUsers.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No other users found.</p>
              ) : (
                allUsers.map(email => {
                  const sel = selected.includes(email);
                  return (
                    <button key={email} onClick={() => setSelected(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email])}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition ${sel ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${sel ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                        {email.charAt(0).toUpperCase()}
                      </div>
                      <div className="text-left min-w-0 flex-1">
                        <p className="text-sm font-medium truncate text-slate-900">{email.split('@')[0]}</p>
                        <p className="text-[10px] text-slate-400 truncate">{email}</p>
                      </div>
                      {sel && <span className="text-blue-600 text-xs font-bold shrink-0">✓</span>}
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowNew(false); setSelected([]); }}
                className="flex-1 py-2.5 min-h-[44px] bg-slate-100 text-slate-600 rounded-xl font-medium text-sm hover:bg-slate-200 transition">Cancel</button>
              <button onClick={handleCreateConv} disabled={selected.length === 0}
                className="flex-1 py-2.5 min-h-[44px] btn-gradient-primary font-medium text-sm disabled:opacity-40 hover:bg-blue-700 transition">Start</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ClientChat = ({ currentUser, role, drivers = [], dispatchers = [], trips = [], onSwitchToDispatch }) => {
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [clientMessages, setClientMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNewSms, setShowNewSms] = useState(false);
  const [newSmsPhone, setNewSmsPhone] = useState('');
  const [newSmsText, setNewSmsText] = useState('');
  const [newSmsSending, setNewSmsSending] = useState(false);
  const [aiSuggestedReply, setAiSuggestedReply] = useState(null);
  const isMobile = useMobile();
  const msgsEndRef = useRef(null);
  const inputRef = useRef(null);

  const phoneToTrip = useMemo(() => {
    const map = {};
    (trips || []).forEach(t => {
      [t.patientPhone, t.pickupPhone, t.dropoffPhone].filter(Boolean).forEach(p => {
        const norm = normalizePhone(p);
        const tripTime = t.date && t.time ? new Date(t.date + 'T' + (t.time.includes(':') ? t.time : t.time + ':00')) : new Date(0);
        if (!map[norm] || tripTime > map[norm]._tripTime) map[norm] = { ...t, _tripTime: tripTime };
      });
    });
    return map;
  }, [trips]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, 'smsLogs'), orderBy('timestamp', 'desc'), limit(500));
        const snap = await getDocs(q);
        if (cancelled) return;
        const groups = {};
        snap.forEach(d => {
          const msg = { id: d.id, ...d.data() };
          const otherPhone = msg.direction === 'outbound' ? msg.to : msg.from;
          if (!otherPhone) return;
          const norm = normalizePhone(otherPhone);
          if (norm === normalizePhone(TELNYX_NUMBER)) return;
          if (!groups[norm]) groups[norm] = [];
          groups[norm].push(msg);
        });
        const convs = Object.entries(groups).map(([phone, msgs]) => {
          msgs.sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0));
          const last = msgs[0];
          const trip = phoneToTrip[normalizePhone(phone)];
          const clientName = trip?.patient || phone;
          const tripId = trip?.id || trip?.tripId || null;
          return { phone, clientName, tripId, trip: trip || null, lastMessage: last, messages: msgs };
        });
        convs.sort((a, b) => (b.lastMessage.timestamp?.toMillis?.() || 0) - (a.lastMessage.timestamp?.toMillis?.() || 0));
        setConversations(convs);
      } catch (e) { console.error('Failed to load client conversations:', e); }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [trips, phoneToTrip]);

  useEffect(() => { msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [clientMessages]);

  const filteredConvs = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(c => c.clientName.toLowerCase().includes(q) || c.phone.includes(q));
  }, [conversations, search]);

  const openConversation = (conv) => {
    setActiveConv(conv);
    const allMsgs = [...(conv.messages || [])].sort((a, b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0));
    setClientMessages(allMsgs);
  };

  const handleSend = async () => {
    const msg = replyText.trim();
    if (!msg || sending || !activeConv) return;
    setSending(true);
    try {
      const functions = getFunctions();
      const sendSms = httpsCallable(functions, 'sendSms');
      const res = await sendSms({ to: activeConv.phone, text: msg, tripId: activeConv.tripId });
      if (res.data?.success) {
        const newMsg = { id: 'pending-' + Date.now(), direction: 'outbound', to: activeConv.phone, text: msg, timestamp: new Date().toISOString(), status: 'sent' };
        setClientMessages(prev => [...prev, newMsg]);
        setConversations(prev => prev.map(c => c.phone === activeConv.phone ? { ...c, lastMessage: newMsg } : c));
        setReplyText('');
      }
    } catch (err) { console.error('Send failed:', err); }
    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleNewSms = async () => {
    const phone = newSmsPhone.trim();
    const smsText = newSmsText.trim();
    if (!phone || !smsText || newSmsSending) return;
    setNewSmsSending(true);
    try {
      const functions = getFunctions();
      const sendSms = httpsCallable(functions, 'sendSms');
      await sendSms({ to: phone, text: smsText, tripId: null });
      setShowNewSms(false);
      setNewSmsPhone('');
      setNewSmsText('');
      const q = query(collection(db, 'smsLogs'), orderBy('timestamp', 'desc'), limit(500));
      const snap = await getDocs(q);
      const groups = {};
      snap.forEach(d => {
        const msg = { id: d.id, ...d.data() };
        const otherPhone = msg.direction === 'outbound' ? msg.to : msg.from;
        if (!otherPhone) return;
        const norm = normalizePhone(otherPhone);
        if (norm === normalizePhone(TELNYX_NUMBER)) return;
        if (!groups[norm]) groups[norm] = [];
        groups[norm].push(msg);
      });
      const convs = Object.entries(groups).map(([ph, msgs]) => {
        msgs.sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0));
        const last = msgs[0];
        const trip = phoneToTrip[normalizePhone(ph)];
        return { phone: ph, clientName: trip?.patient || ph, tripId: trip?.id || trip?.tripId || null, trip: trip || null, lastMessage: last, messages: msgs };
      });
      convs.sort((a, b) => (b.lastMessage.timestamp?.toMillis?.() || 0) - (a.lastMessage.timestamp?.toMillis?.() || 0));
      setConversations(convs);
      const norm = normalizePhone(phone);
      const conv = convs.find(c => c.phone === norm);
      if (conv) openConversation(conv);
    } catch (err) { console.error('New SMS failed:', err); }
    setNewSmsSending(false);
  };

  const showList = isMobile ? !activeConv : true;
  const showChat = isMobile ? !!activeConv : true;

  const convDisplayName = activeConv ? (activeConv.clientName && activeConv.clientName !== activeConv.phone ? activeConv.clientName : activeConv.phone) : '';
  const convInitial = activeConv ? (activeConv.clientName && activeConv.clientName !== activeConv.phone ? activeConv.clientName.charAt(0).toUpperCase() : (activeConv.phone || '').replace(/\D/g, '').slice(-2) || '?') : '?';

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1 bg-slate-100">
        <Loader2 size={24} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {showList && (
        <div className={`${isMobile ? 'w-full' : 'w-80 shrink-0 border-r border-slate-200'} flex flex-col min-h-0`}>
          <div className="shrink-0 bg-white border-b border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-black text-slate-900">Clients</h2>
              <button onClick={() => setShowNewSms(true)} className="w-11 h-11 min-h-[44px] bg-slate-900 text-white rounded-xl flex items-center justify-center hover:bg-slate-800 active:scale-95 transition">
                <Plus size={16} />
              </button>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search"
                className="w-full pl-9 pr-3 py-2 bg-slate-100 rounded-xl text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredConvs.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <MessageCircle size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm font-bold">{search ? 'No results' : 'No client conversations'}</p>
                <p className="text-xs mt-1">{search ? 'Try a different search.' : 'Send an SMS to start.'}</p>
              </div>
            ) : (
              filteredConvs.map(conv => {
                const isNamed = conv.clientName && conv.clientName !== conv.phone && !conv.clientName.startsWith('+');
                return (
                  <button key={conv.phone} onClick={() => { openConversation(conv); inputRef.current?.focus(); }}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-slate-100 transition ${activeConv?.phone === conv.phone ? 'bg-blue-50' : 'active:bg-slate-50'}`}>
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${isNamed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                      {isNamed ? conv.clientName.charAt(0).toUpperCase() : (conv.phone || '').replace(/\D/g, '').slice(-2) || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900 truncate">{isNamed ? conv.clientName : conv.phone}</p>
                        {conv.lastMessage?.timestamp && <span className="text-[10px] text-slate-400 shrink-0">{fmtDate(conv.lastMessage.timestamp)}</span>}
                      </div>
                      <p className="text-xs text-slate-400 truncate mt-0.5">
                        {conv.lastMessage?.direction === 'outbound' ? 'You: ' : ''}{conv.lastMessage?.text || 'No messages'}
                      </p>
                      {conv.tripId && <p className="text-[10px] text-blue-500 font-medium mt-0.5">Trip #{String(conv.tripId).slice(-6)}</p>}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
      {showChat && (
        <div className="min-h-0 flex-1 flex flex-col">
          {activeConv ? (
            <div className="flex flex-col min-h-0 flex-1 bg-slate-100">
              <div className="shrink-0 bg-white border-b border-slate-200 px-3 py-2.5 flex items-center gap-3">
                {isMobile && (
                  <button onClick={() => { setActiveConv(null); setClientMessages([]); }} className="p-2.5 min-h-[44px] min-w-[44px] text-slate-500 hover:bg-slate-100 rounded-lg flex items-center justify-center">
                    <ArrowLeft size={20} />
                  </button>
                )}
                <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold shrink-0">
                  {convInitial}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm text-slate-900 truncate">{convDisplayName}</p>
                  <p className="text-[10px] text-slate-400">{activeConv.phone}</p>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-1">
                {clientMessages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-slate-400">
                    <div className="text-center">
                      <div className="w-14 h-14 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-3">
                        <MessageCircle size={22} className="text-slate-300" />
                      </div>
                      <p className="text-sm font-bold text-slate-600">No messages</p>
                    </div>
                  </div>
                ) : (
                  clientMessages.map((m, i) => {
                    const isOutbound = m.direction === 'outbound';
                    const prev = i > 0 ? clientMessages[i - 1] : null;
                    const showDateHeader = !prev || fmtDate(prev.timestamp) !== fmtDate(m.timestamp);
                    return (
                      <React.Fragment key={m.id || i}>
                        {showDateHeader && <p className="text-[10px] font-bold text-slate-400 text-center pt-2 pb-1">{fmtDate(m.timestamp)}</p>}
                        <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${isOutbound ? 'bg-blue-600 text-white rounded-br-md' : 'bg-white text-slate-800 rounded-bl-md shadow-sm'}`}>
                            <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">{m.text}</p>
                            <p className={`text-[10px] mt-1 flex items-center gap-1 ${isOutbound ? 'text-blue-200 justify-end' : 'text-slate-400'}`}>
                              {fmtTime(m.timestamp)}
                              {isOutbound && (m.status === 'sent' || m.status === 'delivered') && <CheckCheck size={9} />}
                            </p>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
                <div ref={msgsEndRef} />
              </div>
              {aiSuggestedReply && (
                <div className="px-4 py-2 bg-indigo-50 border-t border-indigo-100 shrink-0">
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1">AI Suggested Reply</p>
                      <p className="text-xs text-slate-700 bg-white rounded-lg p-2 border border-indigo-100">{aiSuggestedReply.suggestedReply}</p>
                      <div className="flex gap-2 mt-1.5">
                        <button onClick={() => { setReplyText(aiSuggestedReply.suggestedReply); setAiSuggestedReply(null); }} className="px-3 py-2 min-h-[40px] bg-indigo-600 text-white rounded-lg text-[10px] font-bold flex items-center justify-center">Use Reply</button>
                        <button onClick={() => setAiSuggestedReply(null)} className="px-3 py-2 min-h-[40px] bg-white border border-slate-200 text-slate-600 rounded-lg text-[10px] font-bold flex items-center justify-center">Dismiss</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="shrink-0 bg-white border-t border-slate-200 px-3 py-2.5 safe-bottom">
                <div className="flex items-center gap-2">
                  <input ref={inputRef} value={replyText} onChange={e => setReplyText(e.target.value)} onKeyDown={handleKeyDown}
                    placeholder="Message" className="flex-1 bg-slate-100 rounded-xl px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition min-h-[40px] max-h-[40px]" />
                  <button onClick={handleSend} disabled={!replyText.trim() || sending}
                    className="w-11 h-11 min-h-[44px] rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:scale-95 transition disabled:opacity-40 shrink-0">
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center flex-1 text-slate-400">
              <div className="text-center">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-3">
                  <MessageCircle size={28} className="text-slate-300" />
                </div>
                <p className="text-sm font-bold text-slate-700">Select a conversation</p>
                <p className="text-xs mt-1 text-slate-400">Choose a client or send an SMS.</p>
              </div>
            </div>
          )}
        </div>
      )}
      {showNewSms && (
        <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4" onClick={() => { setShowNewSms(false); setNewSmsPhone(''); setNewSmsText(''); }}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 relative z-10 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-slate-900">New Message</h3>
              <button onClick={() => { setShowNewSms(false); setNewSmsPhone(''); setNewSmsText(''); }} className="p-2.5 min-h-[44px] min-w-[44px] text-slate-400 hover:bg-slate-100 rounded-lg flex items-center justify-center">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Phone Number</label>
                <input value={newSmsPhone} onChange={e => setNewSmsPhone(e.target.value)} placeholder="+1 (317) 555-1234"
                  className="w-full px-3 py-2.5 bg-slate-100 rounded-xl text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Message</label>
                <textarea value={newSmsText} onChange={e => setNewSmsText(e.target.value)} rows={3} placeholder="Type your message..."
                  className="w-full px-3 py-2.5 bg-slate-100 rounded-xl text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20 resize-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setShowNewSms(false); setNewSmsPhone(''); setNewSmsText(''); }}
                className="flex-1 py-2.5 min-h-[44px] bg-slate-100 text-slate-600 rounded-xl font-medium text-sm hover:bg-slate-200 transition">Cancel</button>
              <button onClick={handleNewSms} disabled={!newSmsPhone.trim() || !newSmsText.trim() || newSmsSending}
                className="flex-1 py-2.5 min-h-[44px] btn-gradient-primary font-medium text-sm disabled:opacity-40 hover:bg-blue-700 transition flex items-center justify-center gap-1">
                {newSmsSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={14} />}
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPage;
