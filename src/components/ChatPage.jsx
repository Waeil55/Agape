import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { db, collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, getDocs, doc, setDoc, getDoc, updateDoc, deleteField, arrayUnion } from '../config/firebase';
import { limit } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { MessageCircle, Send, Plus, ArrowLeft, X, Trash2, Search, ExternalLink, Loader2, Check, CheckCheck, BrainCircuit, Sparkles } from 'lucide-react';
import { playMessageSound } from '../utils/notificationSound';
import { aiSuggestReply, aiAnalyzeSentiment } from '../config/ai';

const normalizePhone = (raw) => {
  if (!raw) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  if (digits.length === 10) return "+1" + digits;
  return "+" + digits;
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

const formatTime = (ts) => {
  if (!ts) return '';
  const d = ts?.toMillis ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const formatDate = (ts) => {
  if (!ts) return '';
  const d = ts?.toMillis ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (isToday) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const ChatPage = ({ currentUser, role, drivers = [], dispatchers = [], trips = [], onSwitchToDispatch }) => {
  const [activeTab, setActiveTab] = useState('team');
  const isMobile = useMobile();

  const switchToDispatch = useCallback((tripId) => {
    if (onSwitchToDispatch) onSwitchToDispatch(tripId);
  }, [onSwitchToDispatch]);

  return (
    <div className="flex flex-1 bg-[#F3F4F6] overflow-hidden h-full">
      {isMobile ? (
        <div className="flex flex-col flex-1 min-h-0">
          {role !== 'driver' && (
            <div className="sticky top-0 z-10 bg-white shrink-0 border-b border-slate-200">
              <div className="flex px-3 py-2 gap-1">
                <button onClick={() => setActiveTab('team')}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                    activeTab === 'team'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}>
                  Team
                </button>
                <button onClick={() => setActiveTab('clients')}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                    activeTab === 'clients'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}>
                  Clients
                </button>
              </div>
            </div>
          )}
          <div className="flex-1 min-h-0">
            {role === 'driver' || activeTab === 'team' ? (
              <TeamChatPanel currentUser={currentUser} role={role} />
            ) : (
              <ClientChatPanel currentUser={currentUser} role={role} drivers={drivers} dispatchers={dispatchers} trips={trips} onSwitchToDispatch={switchToDispatch} />
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 min-w-0">
          <div className={`${role === 'driver' ? 'w-full' : 'w-1/2'} border-r border-slate-200 flex flex-col min-h-0`}>
            <TeamChatPanel currentUser={currentUser} role={role} />
          </div>
          {role !== 'driver' && (
            <div className="w-1/2 flex flex-col min-h-0">
              <ClientChatPanel currentUser={currentUser} role={role} drivers={drivers} dispatchers={dispatchers} trips={trips} onSwitchToDispatch={switchToDispatch} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ===================== TEAM CHAT PANEL ===================== */
const TeamChatPanel = ({ currentUser, role }) => {
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [text, setText] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const isMobile = useMobile();
  const scrollRef = useRef(null);
  const messagesEndRef = useRef(null);
  const audioCtxRef = useRef(null);

  useEffect(() => {
    const unlockAudio = () => {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) { audioCtxRef.current = new AudioCtx(); audioCtxRef.current.resume(); }
      }
    };
    document.addEventListener('touchstart', unlockAudio, { once: true });
    document.addEventListener('click', unlockAudio, { once: true });
    return () => { document.removeEventListener('touchstart', unlockAudio); document.removeEventListener('click', unlockAudio); };
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), snap => {
      const arr = [];
      snap.forEach(d => { const data = d.data(); if (data.email && data.email !== currentUser) arr.push(data.email); });
      setAllUsers(arr);
    });
    return () => unsub();
  }, [currentUser]);

  const prevConvsRef = useRef({});
  useEffect(() => {
    let isFirst = true;
    const unsub = onSnapshot(doc(db, 'chatData/conversations'), snap => {
      if (!snap.exists()) { setDoc(doc(db, 'chatData/conversations'), { conversations: {} }, { merge: true }).catch(() => {}); setConversations([]); return; }
      const data = snap.data();
      const convs = Object.entries(data.conversations || {})
        .map(([id, c]) => ({ id, ...c }))
        .filter(c => role === 'admin' || c.participants?.includes(currentUser))
        .sort((a, b) => { const aTime = a.lastMessage?.timestamp?.toMillis?.() || 0; const bTime = b.lastMessage?.timestamp?.toMillis?.() || 0; return bTime - aTime; });
      if (!isFirst) {
        convs.forEach(conv => {
          const prev = prevConvsRef.current[conv.id];
          if (prev && prev.lastMessage?.text !== conv.lastMessage?.text && conv.lastMessage?.sender !== currentUser && (!activeConv || activeConv.id !== conv.id)) playMessageSound();
          prevConvsRef.current[conv.id] = { ...conv };
        });
      } else { convs.forEach(conv => { prevConvsRef.current[conv.id] = { ...conv }; }); isFirst = false; }
      const convsWithUnread = convs.map(conv => { const lastMsg = conv.lastMessage || {}; return { ...conv, unreadCount: lastMsg.sender !== currentUser && !(lastMsg.readBy || []).includes(currentUser) ? 1 : 0 }; });
      setConversations(convsWithUnread);
    });
    return () => unsub();
  }, [currentUser, role, activeConv?.id]);

  useEffect(() => {
    if (!activeConv?.id) { setMessages([]); return; }
    let firstSnapshot = true;
    const q = query(collection(db, 'chat_messages'), where('conversationId', '==', activeConv.id));
    const unsub = onSnapshot(q, snap => {
      snap.docChanges().forEach(change => {
        if (change.type === 'added' && !firstSnapshot) { const newMsg = { id: change.doc.id, ...change.doc.data() }; if (newMsg.sender !== currentUser) playMessageSound(); }
      });
      firstSnapshot = false;
      const msgs = [];
      snap.forEach(d => {
        const msg = { id: d.id, ...d.data() };
        if (msg.sender !== currentUser && (!msg.readBy || !msg.readBy.includes(currentUser))) updateDoc(doc(db, 'chat_messages', d.id), { readBy: [...(msg.readBy || []), currentUser] }).catch(() => {});
        msgs.push(msg);
      });
      msgs.sort((a, b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0));
      setMessages(msgs);
      updateDoc(doc(db, 'chatData/conversations'), { [`conversations.${activeConv.id}.lastMessage.readBy`]: arrayUnion(currentUser) }).catch(() => {});
    });
    return () => unsub();
  }, [activeConv?.id, currentUser]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || !activeConv) return;
    const msg = text.trim();
    setText('');
    try {
      await addDoc(collection(db, 'chat_messages'), { conversationId: activeConv.id, text: msg, sender: currentUser, senderRole: role, timestamp: serverTimestamp() });
      await updateDoc(doc(db, 'chatData/conversations'), { [`conversations.${activeConv.id}.lastMessage`]: { text: msg, sender: currentUser, senderRole: role, timestamp: serverTimestamp(), readBy: [currentUser] } });
    } catch (err) { console.error('Failed to send message:', err); setText(msg); }
  };

  const createConv = async () => {
    if (selected.length === 0) return;
    const participants = [currentUser, ...selected];
    const id = 'conv_' + Date.now();
    try {
      await setDoc(doc(db, 'chatData/conversations'), { [`conversations.${id}`]: { type: selected.length > 1 ? 'group' : 'direct', participants, name: selected.length > 1 ? 'Group ' + (conversations.length + 1) : selected[0].split('@')[0], createdAt: serverTimestamp(), lastMessage: { text: 'Started', sender: currentUser, timestamp: serverTimestamp(), readBy: [currentUser] } } }, { merge: true });
    } catch (err) { console.error('Failed to create conversation:', err); return; }
    setShowNew(false); setSelected([]);
    setActiveConv({ id, participants, type: selected.length > 1 ? 'group' : 'direct', name: selected.length > 1 ? 'Group ' + (conversations.length + 1) : selected[0].split('@')[0] });
  };

  const deleteConv = async (convId) => {
    if (!window.confirm('Delete this conversation?')) return;
    try { await updateDoc(doc(db, 'chatData/conversations'), { [`conversations.${convId}`]: deleteField() }); } catch (err) { console.error('Failed to delete conversation:', err); }
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

  const filteredConvs = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(c => label(c).toLowerCase().includes(q));
  }, [conversations, search]);

  const showList = isMobile ? !activeConv : true;
  const showChat = isMobile ? !!activeConv : true;

  const listEl = (
    <div className="flex flex-col h-full bg-white">
      <div className="shrink-0 border-b border-slate-200">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-lg font-black text-slate-900">Messages</h2>
          <button onClick={() => setShowNew(true)} className="w-9 h-9 bg-slate-900 text-white rounded-2xl flex items-center justify-center hover:bg-slate-800 active:scale-95 transition shadow-sm"><Plus size={16} /></button>
        </div>
        <div className="px-3 pb-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search" className="w-full pl-9 pr-3 py-2.5 bg-slate-100 rounded-2xl text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition" />
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filteredConvs.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <MessageCircle size={32} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm font-bold">{search ? 'No results' : 'No conversations'}</p>
            <p className="text-xs mt-1">{search ? 'Try a different search.' : 'Tap + to start a new chat.'}</p>
          </div>
        ) : (
          filteredConvs.map(c => (
            <button key={c.id} onClick={() => setActiveConv(c)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-slate-100 transition active:bg-slate-50 ${activeConv?.id === c.id ? 'bg-blue-50' : ''}`}>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${c.unreadCount > 0 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                {label(c).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className={`text-sm truncate ${c.unreadCount > 0 ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>
                    {label(c)}
                  </p>
                  {c.lastMessage?.timestamp && (
                    <span className={`text-[10px] shrink-0 ml-2 ${c.unreadCount > 0 ? 'text-blue-600 font-bold' : 'text-slate-400'}`}>{formatDate(c.lastMessage.timestamp)}</span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-xs text-slate-400 truncate flex-1">
                    {c.lastMessage?.sender === currentUser ? 'You: ' : ''}
                    {c.lastMessage?.text || 'No messages'}
                  </p>
                  {c.unreadCount > 0 && (
                    <span className="ml-2 min-w-[18px] h-[18px] bg-blue-600 text-[10px] text-white rounded-full flex items-center justify-center font-bold shrink-0 px-1">
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
  );

  const chatEl = activeConv ? (
    <div className="flex flex-col h-full bg-[#F3F4F6]">
      <div className="shrink-0 bg-white border-b border-slate-200 px-3 py-2.5 flex items-center gap-3">
        {isMobile && (
          <button onClick={() => setActiveConv(null)} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-xl transition -ml-1">
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold shrink-0">
          {label(activeConv).charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm text-slate-900 truncate">{label(activeConv)}</p>
          <p className="text-[10px] text-slate-400">
            {activeConv.type === 'group' ? `${activeConv.participants?.length || 0} members` : 'Direct message'}
          </p>
        </div>
        <button onClick={() => deleteConv(activeConv.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl shrink-0 transition">
          <Trash2 size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <div className="text-center">
              <div className="w-16 h-16 bg-white rounded-3xl shadow-sm flex items-center justify-center mx-auto mb-4">
                <MessageCircle size={24} className="text-slate-300" />
              </div>
              <p className="text-sm font-bold text-slate-600">No messages yet</p>
              <p className="text-xs mt-1 text-slate-400">Say hello!</p>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => {
            const me = msg.sender === currentUser;
            return (
              <div key={msg.id || i} className={`flex ${me ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] px-4 py-2.5 text-sm leading-relaxed ${
                  me
                    ? 'bg-blue-600 text-white rounded-2xl rounded-br-md'
                    : 'bg-white text-slate-800 rounded-2xl rounded-bl-md shadow-sm'
                }`}>
                  {!me && (
                    <p className="text-[10px] font-bold text-blue-600 mb-0.5">{msg.sender?.split('@')[0]}</p>
                  )}
                  <p className="break-words">{msg.text}</p>
                  <p className={`text-[10px] mt-1 flex items-center gap-1 ${me ? 'text-blue-200 justify-end' : 'text-slate-400'}`}>
                    {msg.timestamp ? timeStr(msg.timestamp) : ''}
                    {me && <CheckCheck size={10} />}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="shrink-0 bg-white border-t border-slate-200"
        style={{paddingBottom: 'calc(70px + env(safe-area-inset-bottom, 0px))'}}>
        <form onSubmit={send} className="flex items-end gap-2 px-3 py-2.5">
          <div className="flex-1 bg-slate-100 rounded-2xl px-4 py-2.5 border border-transparent focus-within:bg-white focus-within:border-blue-500 focus-within:shadow-sm transition">
            <input type="text" placeholder="Message" value={text} onChange={e => setText(e.target.value)}
              className="w-full text-sm outline-none bg-transparent placeholder:text-slate-400" />
          </div>
          <button type="submit" disabled={!text.trim()}
            className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 active:scale-90 transition disabled:opacity-40 shadow-sm shrink-0">
            <Send size={16} fill="currentColor" />
          </button>
        </form>
      </div>
    </div>
  ) : (
    <div className="flex-1 flex flex-col bg-[#F3F4F6]">
      <div className="flex-1 flex items-center justify-center text-slate-400">
        <div className="text-center">
          <div className="w-20 h-20 bg-white rounded-3xl shadow-sm flex items-center justify-center mx-auto mb-4">
            <MessageCircle size={32} className="text-slate-300" />
          </div>
          <p className="text-base font-bold text-slate-700">Select a chat</p>
          <p className="text-sm mt-1 text-slate-400">Choose a conversation or start a new one.</p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {isMobile ? (
        <div className="flex flex-col flex-1 min-h-0">
          {showList && listEl}
          {showChat && <div className="flex-1 min-h-0">{chatEl}</div>}
        </div>
      ) : (
        <div className="flex flex-1 h-full min-w-0">
          <div className="w-80 shrink-0 border-r border-slate-200">{listEl}</div>
          <div className="flex-1 min-w-0">{chatEl}</div>
        </div>
      )}
      {showNew && (
        <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4"
          onClick={() => { setShowNew(false); setSelected([]); }}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 relative z-10 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-slate-900">New Chat</h3>
              <button onClick={() => { setShowNew(false); setSelected([]); }} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-xl transition">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-0.5 max-h-60 overflow-y-auto mb-4 -mx-1 px-1">
              {allUsers.map(email => {
                const sel = selected.includes(email);
                return (
                  <button key={email} onClick={() => setSelected(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email])}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-2xl transition ${sel ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${sel ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                      {email.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-left min-w-0 flex-1">
                      <p className="text-sm font-medium truncate text-slate-900">{email.split('@')[0]}</p>
                      <p className="text-xs text-slate-400 truncate">{email}</p>
                    </div>
                    {sel && <span className="text-blue-600 text-xs font-bold shrink-0">&#x2713;</span>}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowNew(false); setSelected([]); }}
                className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-2xl font-medium text-sm hover:bg-slate-200 transition">Cancel</button>
              <button onClick={createConv} disabled={selected.length === 0}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-2xl font-medium text-sm disabled:opacity-40 hover:bg-blue-700 transition">Start</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

/* ===================== CLIENT CHAT PANEL ===================== */
const ClientChatPanel = ({ currentUser, role, drivers = [], dispatchers = [], trips = [], onSwitchToDispatch }) => {
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [search, setSearch] = useState('');
  const isMobile = useMobile();
  const [clientMessages, setClientMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aiSuggestedReply, setAiSuggestedReply] = useState(null);
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false);
  const [sentiments, setSentiments] = useState({});
  const [showNewSms, setShowNewSms] = useState(false);
  const [newSmsPhone, setNewSmsPhone] = useState('');
  const [newSmsText, setNewSmsText] = useState('');
  const [newSmsSending, setNewSmsSending] = useState(false);
  const messagesEndRef = useRef(null);

  const scopeFilter = useCallback((convs) => {
    if (role === 'driver') return [];
    if (role !== 'dispatcher') return convs;
    const disp = dispatchers.find(d => d.email?.toLowerCase() === (currentUser || '').toLowerCase());
    if (!disp) return [];
    const aDrivers = drivers.filter(d => d.assignedDispatcher === disp.id || d.assignedTo === disp.id);
    const scopedIds = new Set(aDrivers.map(d => d.id));
    const scopedEmails = new Set(aDrivers.map(d => d.email?.toLowerCase()).filter(Boolean));
    const allowedPhones = new Set();
    (trips || []).forEach(t => {
      if (scopedIds.has(t.driverId) || scopedEmails.has(t.driverEmail?.toLowerCase())) {
        [t.patientPhone, t.pickupPhone, t.dropoffPhone].filter(Boolean).forEach(p => allowedPhones.add(normalizePhone(p)));
      }
    });
    return convs.filter(c => allowedPhones.has(c.phone));
  }, [role, currentUser, dispatchers, drivers, trips]);

  const phoneToTrip = useMemo(() => {
    const map = {};
    (trips || []).forEach(t => {
      const phones = [t.patientPhone, t.pickupPhone, t.dropoffPhone].filter(Boolean);
      phones.forEach(p => {
        const norm = normalizePhone(p);
        const tripTime = t.date && t.time ? new Date(t.date + 'T' + (t.time.includes(':') ? t.time : t.time + ':00')) : new Date(0);
        const existing = map[norm];
        if (!existing || (existing._tripTime && tripTime > existing._tripTime)) {
          map[norm] = { ...t, _tripTime: tripTime };
        }
      });
    });
    return map;
  }, [trips]);

  const resolveClient = useCallback((phone) => {
    const norm = normalizePhone(phone);
    const raw = phone || norm || '';
    const trip = norm ? phoneToTrip[norm] : null;
    if (trip && trip.patient) return { name: trip.patient, tripId: trip.id || trip.tripId, trip };
    if (norm) return { name: norm, tripId: null, trip: null };
    return { name: raw || 'Unknown', tripId: null, trip: null };
  }, [phoneToTrip]);

  const resolveClientFromMsgs = useCallback((msgs) => {
    for (const m of msgs) {
      const phone = m.direction === 'outbound' ? m.to : m.from;
      const resolved = resolveClient(phone);
      if (resolved.trip) return resolved;
    }
    for (const m of msgs) {
      if (m.tripId) {
        const trip = (trips || []).find(t => t.id === m.tripId || t.tripId === m.tripId);
        if (trip && trip.patient) return { name: trip.patient, tripId: m.tripId, trip };
      }
    }
    for (const m of msgs) {
      const phone = m.direction === 'outbound' ? m.to : m.from;
      if (phone) return { name: phone, tripId: null, trip: null };
    }
    return { name: 'Unknown', tripId: null, trip: null };
  }, [resolveClient, trips]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
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
        const convs = Object.entries(groups).map(([phone, msgs]) => {
          msgs.sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0));
          const last = msgs[0];
          const resolved = resolveClientFromMsgs(msgs);
          return { phone, clientName: resolved.name, tripId: resolved.tripId, trip: resolved.trip, lastMessage: last, messages: msgs };
        });
        convs.sort((a, b) => (b.lastMessage.timestamp?.toMillis?.() || 0) - (a.lastMessage.timestamp?.toMillis?.() || 0));
        setConversations(scopeFilter(convs));
      } catch (e) { console.error('Failed to load client conversations:', e); }
      setLoading(false);
    };
    load();
  }, [trips, resolveClientFromMsgs]);

  const openConversation = async (conv) => {
    setActiveConv(conv);
    const allMsgs = [...(conv.messages || [])];
    allMsgs.sort((a, b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0));
    setClientMessages(allMsgs);
  };

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [clientMessages]);

  useEffect(() => {
    const unanalyzed = clientMessages.filter(m => m.direction !== 'outbound' && !analyzedSentimentsRef.current.has(m.id) && m.text);
    unanalyzed.slice(0, 5).forEach(m => {
      analyzedSentimentsRef.current.add(m.id);
      aiAnalyzeSentiment(m.text).then(result => {
        if (result) setSentiments(prev => ({ ...prev, [m.id]: result }));
      }).catch(() => {});
    });
  }, [clientMessages]);

  const filteredConvs = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(c => c.clientName.toLowerCase().includes(q) || c.phone.includes(q));
  }, [conversations, search]);

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

  const handleAiSuggestReply = useCallback(async () => {
    if (!activeConv || aiSuggestLoading) return;
    setAiSuggestLoading(true);
    setAiSuggestedReply(null);
    const tripContext = activeConv.trip || { patient: activeConv.clientName, time: '', pickup: '', dropoff: '' };
    const result = await aiSuggestReply(
      clientMessages.map(m => ({ direction: m.direction, body: m.text, text: m.text })),
      tripContext
    );
    setAiSuggestedReply(result);
    setAiSuggestLoading(false);
  }, [activeConv, clientMessages, aiSuggestLoading]);

  const analyzedSentimentsRef = useRef(new Set());

  const handleNewSms = async () => {
    const phone = newSmsPhone.trim();
    const text = newSmsText.trim();
    if (!phone || !text || newSmsSending) return;
    setNewSmsSending(true);
    try {
      const functions = getFunctions();
      const sendSms = httpsCallable(functions, 'sendSms');
      await sendSms({ to: phone, text, tripId: null });
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
        const resolved = resolveClientFromMsgs(msgs);
        return { phone: ph, clientName: resolved.name, tripId: resolved.tripId, trip: resolved.trip, lastMessage: last, messages: msgs };
      });
      convs.sort((a, b) => (b.lastMessage.timestamp?.toMillis?.() || 0) - (a.lastMessage.timestamp?.toMillis?.() || 0));
      const filteredConvs = scopeFilter(convs);
      setConversations(filteredConvs);
      const norm = normalizePhone(phone);
      const conv = filteredConvs.find(c => c.phone === norm);
      if (conv) openConversation(conv);
    } catch (err) { console.error('New SMS failed:', err); }
    setNewSmsSending(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#F3F4F6]">
        <Loader2 size={24} className="animate-spin text-slate-400" />
      </div>
    );
  }

  const convDisplayName = (() => { if (!activeConv) return ''; const n = activeConv.clientName; const p = activeConv.phone; return n && n !== p && !n.startsWith('+') ? n : p; })();
  const convDisplayInitial = (() => { if (!activeConv) return '?'; const n = activeConv.clientName; const p = activeConv.phone; const named = n && n !== p && !n.startsWith('+'); return named ? n.charAt(0).toUpperCase() : String(p || '').replace(/\D/g, '').slice(-2) || '?'; })();

  const showList = isMobile ? !activeConv : true;
  const showChat = isMobile ? !!activeConv : true;

  const listEl = (
    <div className="flex flex-col h-full bg-white">
      <div className="shrink-0 border-b border-slate-200">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-lg font-black text-slate-900">Clients</h2>
          <button onClick={() => setShowNewSms(true)} className="w-9 h-9 bg-slate-900 text-white rounded-2xl flex items-center justify-center hover:bg-slate-800 active:scale-95 transition shadow-sm"><Plus size={16} /></button>
        </div>
        <div className="px-3 pb-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search" className="w-full pl-9 pr-3 py-2.5 bg-slate-100 rounded-2xl text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition" />
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filteredConvs.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <MessageCircle size={32} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm font-bold">{search ? 'No results' : 'No client conversations'}</p>
            <p className="text-xs mt-1">{search ? 'Try a different search.' : 'Send an SMS to a client to start.'}</p>
          </div>
        ) : (
          filteredConvs.map(conv => {
            const isNamed = conv.clientName && conv.clientName !== conv.phone && !conv.clientName.startsWith('+');
            const displayName = isNamed ? conv.clientName : conv.phone;
            const initial = isNamed ? conv.clientName.charAt(0).toUpperCase() : (conv.phone || '').replace(/\D/g, '').slice(-2) || '?';
            return (
              <button key={conv.phone} onClick={() => openConversation(conv)}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-slate-100 transition active:bg-slate-50 ${activeConv?.phone === conv.phone ? 'bg-blue-50' : ''}`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${isNamed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 truncate">{displayName}</p>
                    {conv.lastMessage?.timestamp && (
                      <span className="text-[10px] text-slate-400 shrink-0">{formatDate(conv.lastMessage.timestamp)}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-slate-400 truncate flex-1">
                      {conv.lastMessage?.direction === 'outbound' ? <span className="text-slate-400">You: </span> : ''}
                      {conv.lastMessage?.text || 'No messages'}
                    </p>
                  </div>
                  {conv.tripId && (
                    <p className="text-[10px] text-blue-500 font-medium mt-0.5">Trip #{conv.tripId.replace('trip_', '').replace('trip-', '').substring(0, 8)}</p>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  const chatEl = activeConv ? (
    <div className="flex flex-col h-full bg-[#F3F4F6]">
      <div className="shrink-0 bg-white border-b border-slate-200 px-3 py-2.5 flex items-center gap-3">
        {isMobile && (
          <button onClick={() => { setActiveConv(null); setClientMessages([]); }} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-xl transition -ml-1">
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold shrink-0">
          {convDisplayInitial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm text-slate-900 truncate">{convDisplayName}</p>
          <p className="text-[10px] text-slate-400 flex items-center gap-1">
            {activeConv.tripId && (
              <span className="flex items-center gap-1">
                <span className="text-blue-500 font-medium">Trip #{activeConv.tripId.replace('trip_', '').replace('trip-', '').substring(0, 8)}</span>
                {onSwitchToDispatch && (
                  <button onClick={() => onSwitchToDispatch(activeConv.tripId)} className="text-blue-600 hover:text-blue-800" title="View in dispatch">
                    <ExternalLink size={10} />
                  </button>
                )}
              </span>
            )}
            {activeConv.tripId && activeConv.clientName !== activeConv.phone && <span className="text-slate-300">|</span>}
            <span className="text-slate-400">{activeConv.phone}</span>
          </p>
        </div>
        <button onClick={handleAiSuggestReply} disabled={aiSuggestLoading} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition shrink-0" title="AI Suggest Reply">
          {aiSuggestLoading ? <Loader2 size={16} className="animate-spin" /> : <BrainCircuit size={16} />}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {clientMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <div className="text-center">
              <div className="w-16 h-16 bg-white rounded-3xl shadow-sm flex items-center justify-center mx-auto mb-4">
                <MessageCircle size={24} className="text-slate-300" />
              </div>
              <p className="text-sm font-bold text-slate-600">No messages</p>
            </div>
          </div>
        ) : (
          clientMessages.map((m, i) => {
            const isOutbound = m.direction === 'outbound';
            const prev = i > 0 ? clientMessages[i - 1] : null;
            const showDateHeader = !prev || formatDate(prev.timestamp) !== formatDate(m.timestamp);
            return (
              <React.Fragment key={m.id || m.messageId || i}>
                {showDateHeader && <p className="text-[10px] font-bold text-slate-400 text-center pt-2 pb-1">{formatDate(m.timestamp)}</p>}
                <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${isOutbound ? 'bg-blue-600 text-white rounded-br-md' : 'bg-white text-slate-800 rounded-bl-md shadow-sm'}`}>
                    {!isOutbound && (
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <p className="text-[10px] font-bold text-slate-500">{activeConv.clientName}</p>
                        {sentiments[m.id] && (
                          <span className={`text-[8px] font-bold px-1 py-0.5 rounded-full ${
                            sentiments[m.id].sentiment === 'positive' ? 'bg-emerald-100 text-emerald-700' :
                            sentiments[m.id].sentiment === 'negative' ? 'bg-rose-100 text-rose-700' :
                            sentiments[m.id].sentiment === 'urgent' ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-500'
                          }`}>
                            {sentiments[m.id].sentiment === 'positive' ? 'Positive' :
                             sentiments[m.id].sentiment === 'negative' ? 'Negative' :
                             sentiments[m.id].sentiment === 'urgent' ? 'Urgent' : 'Neutral'}
                          </span>
                        )}
                      </div>
                    )}
                    <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">{m.text}</p>
                    <p className={`text-[9px] mt-1 flex items-center gap-1 ${isOutbound ? 'text-blue-200 justify-end' : 'text-slate-400'}`}>
                      {formatTime(m.timestamp)}
                      {isOutbound && (m.status === 'queued' ? ' • queued' : m.status === 'sent' ? '' : m.status === 'delivered' ? ' • delivered' : '')}
                      {isOutbound && (m.status === 'sent' || m.status === 'delivered') && <CheckCheck size={9} />}
                    </p>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>
      {aiSuggestedReply && (
        <div className="px-4 py-2 bg-indigo-50 border-t border-indigo-100">
          <div className="flex items-start gap-2">
            <Sparkles size={14} className="text-indigo-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1">AI Suggested Reply</p>
              <p className="text-xs text-slate-700 bg-white rounded-xl p-2.5 border border-indigo-100">{aiSuggestedReply.suggestedReply}</p>
              <div className="flex gap-2 mt-1.5">
                <button onClick={() => { setReplyText(aiSuggestedReply.suggestedReply); setAiSuggestedReply(null); }} className="px-2.5 py-1 bg-indigo-600 text-white rounded-xl text-[10px] font-bold hover:bg-indigo-700 transition">Use Reply</button>
                <button onClick={() => setAiSuggestedReply(null)} className="px-2.5 py-1 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-bold hover:bg-slate-50 transition">Dismiss</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="shrink-0 bg-white border-t border-slate-200"
        style={{paddingBottom: 'calc(70px + env(safe-area-inset-bottom, 0px))'}}>
        <div className="flex items-center gap-2 px-3 py-2.5">
          <input value={replyText} onChange={e => setReplyText(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Message" className="flex-1 bg-slate-100 rounded-2xl px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition" />
          <button onClick={handleSend} disabled={!replyText.trim() || sending}
            className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:scale-90 transition disabled:opacity-40 shrink-0 shadow-sm">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  ) : (
    <div className="flex-1 flex flex-col bg-[#F3F4F6]">
      <div className="flex-1 flex items-center justify-center text-slate-400">
        <div className="text-center">
          <div className="w-20 h-20 bg-white rounded-3xl shadow-sm flex items-center justify-center mx-auto mb-4">
            <MessageCircle size={32} className="text-slate-300" />
          </div>
          <p className="text-base font-bold text-slate-700">Select a conversation</p>
          <p className="text-sm mt-1 text-slate-400">Choose a client or send an SMS.</p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {isMobile ? (
        <div className="flex flex-col flex-1 min-h-0">
          {showList && listEl}
          {showChat && <div className="flex-1 min-h-0">{chatEl}</div>}
        </div>
      ) : (
        <div className="flex flex-1 h-full min-w-0">
          <div className="w-80 shrink-0 border-r border-slate-200">{listEl}</div>
          <div className="flex-1 min-w-0">{chatEl}</div>
        </div>
      )}
      {showNewSms && (
        <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4"
          onClick={() => { setShowNewSms(false); setNewSmsPhone(''); setNewSmsText(''); }}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 relative z-10 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-slate-900">New Message</h3>
              <button onClick={() => { setShowNewSms(false); setNewSmsPhone(''); setNewSmsText(''); }} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-xl transition">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Phone Number</label>
                <input value={newSmsPhone} onChange={e => setNewSmsPhone(e.target.value)} placeholder="+1 (317) 555-1234" className="w-full px-3 py-2.5 bg-slate-100 rounded-2xl text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Message</label>
                <textarea value={newSmsText} onChange={e => setNewSmsText(e.target.value)} rows={3} placeholder="Type your message..." className="w-full px-3 py-2.5 bg-slate-100 rounded-2xl text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition resize-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setShowNewSms(false); setNewSmsPhone(''); setNewSmsText(''); }}
                className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-2xl font-medium text-sm hover:bg-slate-200 transition">Cancel</button>
              <button onClick={handleNewSms} disabled={!newSmsPhone.trim() || !newSmsText.trim() || newSmsSending}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-2xl font-medium text-sm disabled:opacity-40 hover:bg-blue-700 transition flex items-center justify-center gap-1">
                {newSmsSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={14} />}
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatPage;
