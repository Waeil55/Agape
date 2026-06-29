import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { db, collection, addDoc, query, where, orderBy, serverTimestamp, doc, setDoc, updateDoc, deleteField, arrayUnion, onSnapshot } from '../config/firebase';
import { limit } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Search, Plus, Menu, ArrowLeft, Send, Check, CheckCheck, X, Trash2, Loader2, MessageCircle, BrainCircuit, Sparkles } from 'lucide-react';
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
  const [m, setM] = useState(window.innerWidth < 768);
  useEffect(() => { const h = () => setM(window.innerWidth < 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  return m;
};

const formatMsgTime = (ts) => {
  if (!ts) return '';
  const d = ts?.toMillis ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const formatConvTime = (ts) => {
  if (!ts) return '';
  const d = ts?.toMillis ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
};

const formatDateHeader = (ts) => {
  if (!ts) return '';
  const d = ts?.toMillis ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return 'Today';
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const COLORS = ['#1877F2', '#E4405F', '#25D366', '#833AB4', '#00C4CC', '#FF6B35', '#20C997', '#E74C3C', '#3498DB', '#2ECC71'];

const avatarColor = (name) => COLORS[String(name || '').length % COLORS.length];

const ChatPage = ({ currentUser, role, drivers = [], dispatchers = [], trips = [], onSwitchToDispatch }) => {
  const [filterTab, setFilterTab] = useState('all');
  const [teamConvs, setTeamConvs] = useState([]);
  const [clientConvs, setClientConvs] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newSmsPhone, setNewSmsPhone] = useState('');
  const [newSmsText, setNewSmsText] = useState('');
  const [newSmsSending, setNewSmsSending] = useState(false);
  const [sending, setSending] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [sentiments, setSentiments] = useState({});
  const [aiSuggestedReply, setAiSuggestedReply] = useState(null);
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('team');

  const isMobile = useMobile();
  const messagesEndRef = useRef(null);
  const analyzedRef = useRef(new Set());
  const pendRef = useRef(new Set());
  const scrollRef = useRef(null);
  const prevTeamConvsRef = useRef({});

  /* ============= TEAM CONVERSATIONS LISTENER ============= */
  useEffect(() => {
    let isFirst = true;
    const unsub = onSnapshot(doc(db, 'chatData/conversations'), (snap) => {
      if (!snap.exists()) { setDoc(doc(db, 'chatData/conversations'), { conversations: {} }, { merge: true }).catch(() => {}); setTeamConvs([]); return; }
      const data = snap.data();
      const convs = Object.entries(data.conversations || {})
        .map(([id, c]) => ({ id, ...c }))
        .filter(c => role === 'admin' || c.participants?.includes(currentUser))
        .sort((a, b) => (b.lastMessage?.timestamp?.toMillis?.() || 0) - (a.lastMessage?.timestamp?.toMillis?.() || 0));
      if (!isFirst) {
        convs.forEach(c => {
          const p = prevTeamConvsRef.current[c.id];
          if (p && p.lastMessage?.text !== c.lastMessage?.text && c.lastMessage?.sender !== currentUser && activeConv?.id !== c.id) playMessageSound();
          prevTeamConvsRef.current[c.id] = { ...c };
        });
      } else { convs.forEach(c => { prevTeamConvsRef.current[c.id] = { ...c }; }); isFirst = false; }
      setTeamConvs(convs);
    }, () => {});
    return () => unsub();
  }, [currentUser, role, activeConv?.id]);

  /* ============= USERS LISTENER ============= */
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const arr = [];
      snap.forEach(d => { const data = d.data(); if (data.email && data.email !== currentUser) arr.push(data.email); });
      setAllUsers(arr);
    }, () => {});
    return () => unsub();
  }, [currentUser]);

  /* ============= CLIENT CONVERSATIONS LISTENER ============= */
  const scopeFilter = useCallback((convs) => {
    if (role === 'driver') return [];
    if (role !== 'dispatcher') return convs;
    const disp = dispatchers.find(d => d.email?.toLowerCase() === (currentUser || '').toLowerCase());
    if (!disp) return [];
    const aDrivers = drivers.filter(d => d.assignedDispatcher === disp.id || d.assignedTo === disp.id);
    const ids = new Set(aDrivers.map(d => d.id));
    const emails = new Set(aDrivers.map(d => d.email?.toLowerCase()).filter(Boolean));
    const phones = new Set();
    (trips || []).forEach(t => {
      if (ids.has(t.driverId) || emails.has(t.driverEmail?.toLowerCase())) {
        [t.patientPhone, t.pickupPhone, t.dropoffPhone].filter(Boolean).forEach(p => phones.add(normalizePhone(p)));
      }
    });
    return convs.filter(c => phones.has(c.phone));
  }, [role, currentUser, dispatchers, drivers, trips]);

  const phoneToTrip = useMemo(() => {
    const map = {};
    (trips || []).forEach(t => {
      [t.patientPhone, t.pickupPhone, t.dropoffPhone].filter(Boolean).forEach(p => {
        const norm = normalizePhone(p);
        const tTime = t.date && t.time ? new Date(t.date + 'T' + (t.time.includes(':') ? t.time : t.time + ':00')).getTime() : 0;
        if (!map[norm] || tTime > (map[norm]._t || 0)) map[norm] = { ...t, _t: tTime };
      });
    });
    return map;
  }, [trips]);

  const resolveClient = useCallback((phone) => {
    const norm = normalizePhone(phone);
    const trip = norm ? phoneToTrip[norm] : null;
    if (trip?.patient) return { name: trip.patient, tripId: trip.id || trip.tripId, trip };
    if (norm) return { name: norm, tripId: null, trip: null };
    return { name: phone || 'Unknown', tripId: null, trip: null };
  }, [phoneToTrip]);

  const resolveClientFromMsgs = useCallback((msgs) => {
    for (const m of msgs) {
      const phone = m.direction === 'outbound' ? m.to : m.from;
      const r = resolveClient(phone);
      if (r.trip) return r;
    }
    for (const m of msgs) {
      if (m.tripId) {
        const t = (trips || []).find(trip => trip.id === m.tripId || trip.tripId === m.tripId);
        if (t?.patient) return { name: t.patient, tripId: m.tripId, trip: t };
      }
    }
    for (const m of msgs) {
      const phone = m.direction === 'outbound' ? m.to : m.from;
      if (phone) return { name: phone, tripId: null, trip: null };
    }
    return { name: 'Unknown', tripId: null, trip: null };
  }, [resolveClient, trips]);

  /* ============= SMS SNAPSHOT ============= */
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'smsLogs'), orderBy('timestamp', 'desc'), limit(500));
    const unsub = onSnapshot(q, (snap) => {
      const groups = {};
      snap.forEach(d => {
        const msg = { id: d.id, ...d.data() };
        if (pendRef.current.has(msg.id)) return;
        const other = msg.direction === 'outbound' ? msg.to : msg.from;
        if (!other) return;
        const norm = normalizePhone(other);
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
      convs.sort((a, b) => (b.lastMessage?.timestamp?.toMillis?.() || 0) - (a.lastMessage?.timestamp?.toMillis?.() || 0));
      setClientConvs(scopeFilter(convs));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [trips, resolveClientFromMsgs]);

  /* ============= TEAM MESSAGES LISTENER ============= */
  useEffect(() => {
    if (!activeConv || activeConv.type !== 'team') { setMessages([]); return; }
    let first = true;
    let known = new Set();
    const q = query(collection(db, 'chat_messages'), where('conversationId', '==', activeConv.id));
    const unsub = onSnapshot(q, (snap) => {
      const msgs = [];
      snap.forEach(d => {
        const msg = { id: d.id, ...d.data() };
        if (!first && !known.has(msg.id) && msg.sender !== currentUser) playMessageSound();
        if (msg.sender !== currentUser && (!msg.readBy || !msg.readBy.includes(currentUser))) updateDoc(doc(db, 'chat_messages', d.id), { readBy: [...(msg.readBy || []), currentUser] }).catch(() => {});
        msgs.push(msg);
      });
      known = new Set(msgs.map(m => m.id));
      msgs.sort((a, b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0));
      setMessages(msgs);
      updateDoc(doc(db, 'chatData/conversations'), { [`conversations.${activeConv.id}.lastMessage.readBy`]: arrayUnion(currentUser) }).catch(() => {});
      first = false;
    }, () => {});
    return () => unsub();
  }, [activeConv?.id, activeConv?.type, currentUser]);

  /* ============= SET CLIENT MESSAGES WHEN OPENING ============= */
  const openClientConv = useCallback((conv) => {
    setActiveConv({ type: 'client', ...conv });
    const allMsgs = [...(conv.messages || [])];
    allMsgs.sort((a, b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0));
    setMessages(allMsgs);
  }, []);

  /* ============= SYNC NEW CLIENT MSGS INTO ACTIVE VIEW ============= */
  useEffect(() => {
    if (!activeConv || activeConv.type !== 'client') return;
    const updated = clientConvs.find(c => c.phone === activeConv.phone);
    if (!updated?.messages) return;
    setMessages(prev => {
      const existing = new Set(prev.map(m => m.id));
      const newMsgs = updated.messages.filter(m => !existing.has(m.id));
      if (newMsgs.length === 0) return prev;
      const merged = [...prev, ...newMsgs];
      merged.sort((a, b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0));
      return merged;
    });
  }, [clientConvs, activeConv?.phone, activeConv?.type]);

  /* ============= SCROLL TO BOTTOM ============= */
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  /* ============= SENTIMENT ANALYSIS ============= */
  useEffect(() => {
    const unanalyzed = messages.filter(m => activeConv?.type === 'client' && m.direction !== 'outbound' && !analyzedRef.current.has(m.id) && m.text);
    unanalyzed.slice(0, 5).forEach(m => {
      analyzedRef.current.add(m.id);
      aiAnalyzeSentiment(m.text).then(r => { if (r) setSentiments(prev => ({ ...prev, [m.id]: r })); }).catch(() => {});
    });
  }, [messages, activeConv?.type]);

  /* ============= SEND TEAM MESSAGE ============= */
  const sendTeamMsg = async (e) => {
    e.preventDefault();
    if (!text.trim() || !activeConv) return;
    const msg = text.trim();
    setText('');
    try {
      await addDoc(collection(db, 'chat_messages'), { conversationId: activeConv.id, text: msg, sender: currentUser, senderRole: role, timestamp: serverTimestamp() });
      await updateDoc(doc(db, 'chatData/conversations'), { [`conversations.${activeConv.id}.lastMessage`]: { text: msg, sender: currentUser, senderRole: role, timestamp: serverTimestamp(), readBy: [currentUser] } });
    } catch (e) { console.error(e); setText(msg); }
  };

  /* ============= SEND CLIENT SMS ============= */
  const sendClientSms = async () => {
    const msg = text.trim();
    if (!msg || sending || !activeConv) return;
    setSending(true);
    try {
      const fn = getFunctions();
      const send = httpsCallable(fn, 'sendSms');
      const res = await send({ to: activeConv.phone, text: msg, tripId: activeConv.tripId });
      if (res.data?.success) {
        const id = 'pend-' + Date.now();
        pendRef.current.add(id);
        const newMsg = { id, direction: 'outbound', to: activeConv.phone, text: msg, timestamp: new Date().toISOString(), status: 'sent' };
        setMessages(prev => [...prev, newMsg]);
        setClientConvs(prev => prev.map(c => c.phone === activeConv.phone ? { ...c, messages: [...(c.messages || []), newMsg], lastMessage: newMsg } : c));
        setText('');
      }
    } catch (e) { console.error(e); }
    setSending(false);
  };

  /* ============= CREATE TEAM CONVERSATION ============= */
  const createConv = async () => {
    if (selectedUsers.length === 0) return;
    const participants = [currentUser, ...selectedUsers];
    const id = 'conv_' + Date.now();
    try {
      await setDoc(doc(db, 'chatData/conversations'), { [`conversations.${id}`]: { type: selectedUsers.length > 1 ? 'group' : 'direct', participants, name: selectedUsers.length > 1 ? 'Group ' + (teamConvs.length + 1) : selectedUsers[0].split('@')[0], createdAt: serverTimestamp(), lastMessage: { text: 'Started', sender: currentUser, timestamp: serverTimestamp(), readBy: [currentUser] } } }, { merge: true });
    } catch (e) { console.error(e); return; }
    setShowNewChat(false); setSelectedUsers([]);
    setActiveConv({ id, participants, type: 'team', name: selectedUsers.length > 1 ? 'Group ' + (teamConvs.length + 1) : selectedUsers[0].split('@')[0] });
  };

  /* ============= NEW SMS ============= */
  const sendNewSms = async () => {
    const phone = newSmsPhone.trim();
    const text = newSmsText.trim();
    if (!phone || !text || newSmsSending) return;
    setNewSmsSending(true);
    try {
      const fn = getFunctions();
      const send = httpsCallable(fn, 'sendSms');
      await send({ to: phone, text, tripId: null });
      setShowNewChat(false); setNewSmsPhone(''); setNewSmsText('');
      const norm = normalizePhone(phone);
      const id = 'pend-' + Date.now();
      pendRef.current.add(id);
      const newMsg = { id, direction: 'outbound', to: norm, from: TELNYX_NUMBER, text, timestamp: new Date().toISOString(), status: 'sent' };
      setClientConvs(prev => {
        const existing = prev.find(c => c.phone === norm);
        if (existing) {
          const u = { ...existing, messages: [...(existing.messages || []), newMsg], lastMessage: newMsg };
          return [u, ...prev.filter(c => c.phone !== norm)];
        }
        const r = resolveClient(phone);
        return [{ phone: norm, clientName: r.name, tripId: r.tripId, trip: r.trip, lastMessage: newMsg, messages: [newMsg] }, ...prev];
      });
      setActiveConv({ type: 'client', phone: norm, clientName: newSmsPhone, lastMessage: newMsg, messages: [newMsg] });
      setMessages([newMsg]);
    } catch (e) { console.error(e); }
    setNewSmsSending(false);
  };

  /* ============= DELETE TEAM CONVERSATION ============= */
  const deleteConv = (convId) => {
    if (!window.confirm('Delete this conversation?')) return;
    updateDoc(doc(db, 'chatData/conversations'), { [`conversations.${convId}`]: deleteField() }).catch(() => {});
    if (activeConv?.id === convId) setActiveConv(null);
  };

  /* ============= AI SUGGEST REPLY ============= */
  const handleAiSuggest = useCallback(async () => {
    if (!activeConv || aiSuggestLoading) return;
    setAiSuggestLoading(true);
    setAiSuggestedReply(null);
    const ctx = activeConv.trip || { patient: activeConv.clientName || activeConv.name, time: '', pickup: '', dropoff: '' };
    const result = await aiSuggestReply(messages.map(m => ({ direction: m.direction || (m.sender === currentUser ? 'outbound' : 'inbound'), body: m.text, text: m.text })), ctx);
    setAiSuggestedReply(result);
    setAiSuggestLoading(false);
  }, [activeConv, messages, aiSuggestLoading, currentUser]);

  /* ============= MERGED CONVERSATIONS ============= */
  const mergedConvs = useMemo(() => {
    const list = [];
    const label = (c) => {
      if (c.name) return c.name;
      const other = (c.participants || []).filter(p => p !== currentUser);
      return other[0]?.split('@')[0] || 'Unknown';
    };
    teamConvs.forEach(c => {
      const last = c.lastMessage || {};
      list.push({
        id: c.id,
        type: 'team',
        name: label(c),
        subtitle: last.sender === currentUser ? `You: ${last.text || ''}` : (last.text || 'No messages'),
        time: last.timestamp,
        unread: last.sender !== currentUser && !(last.readBy || []).includes(currentUser),
        participants: c.participants,
        raw: c,
      });
    });
    clientConvs.forEach(c => {
      const isNamed = c.clientName && c.clientName !== c.phone && !c.clientName.startsWith('+');
      const displayName = isNamed ? c.clientName : c.phone;
      const initial = isNamed ? c.clientName.charAt(0).toUpperCase() : '?';
      const last = c.lastMessage || {};
      list.push({
        id: c.phone,
        type: 'client',
        name: displayName,
        subtitle: last.direction === 'outbound' ? `You: ${last.text || ''}` : (last.text || 'No messages'),
        time: last.timestamp,
        unread: false,
        phone: c.phone,
        clientName: c.clientName,
        tripId: c.tripId,
        trip: c.trip,
        messages: c.messages || [],
        raw: c,
        initial,
      });
    });
    list.sort((a, b) => ((b.time?.toMillis?.() || 0) - (a.time?.toMillis?.() || 0)));
    return list;
  }, [teamConvs, clientConvs, currentUser]);

  const filteredConvs = useMemo(() => {
    let list = mergedConvs;
    if (filterTab === 'team') list = list.filter(c => c.type === 'team');
    else if (filterTab === 'clients') list = list.filter(c => c.type === 'client');
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q));
    }
    return list;
  }, [mergedConvs, filterTab, search]);

  const convLabel = (conv) => conv.type === 'team'
    ? ((conv) => { if (conv.name) return conv.name; const other = (conv.participants || []).filter(p => p !== currentUser); return other[0]?.split('@')[0] || 'Unknown'; })(conv.raw || conv)
    : (conv.name || conv.phone);

  const unreadCount = useMemo(() => mergedConvs.filter(c => c.unread).length, [mergedConvs]);

  /* ============= SELECT CONVERSATION ============= */
  const selectConv = (conv) => {
    if (conv.type === 'team') {
      setActiveConv({ ...conv.raw, type: 'team' });
    } else {
      openClientConv(conv.raw);
    }
    if (isMobile) setSidebarOpen(false);
  };

  /* ============= send handler ============= */
  const handleSend = (e) => {
    e?.preventDefault();
    if (!activeConv) return;
    if (activeConv.type === 'team') sendTeamMsg(e);
    else sendClientSms();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  /* ============= RENDER ============= */
  const sidebarWidth = isMobile ? (sidebarOpen ? 'w-full' : 'w-0') : (sidebarOpen ? 'w-[360px]' : 'w-0');

  return (
    <div className="flex h-full bg-white overflow-hidden">
      {/* SIDEBAR */}
      <div className={`${sidebarWidth} flex flex-col border-r border-gray-200 shrink-0 overflow-hidden transition-all duration-200 ${isMobile && sidebarOpen ? 'absolute inset-0 z-10 bg-white' : ''}`}>
        {/* Header */}
        <div className="shrink-0 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between px-4 h-14">
            <h1 className="text-xl font-bold text-gray-900">{currentUser?.split('@')[0] || 'Chats'}</h1>
            <button onClick={() => { setShowNewChat(true); setSelectedUsers([]); setNewSmsPhone(''); setNewSmsText(''); }} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 transition">
              <Plus size={20} />
            </button>
          </div>
          <div className="px-3 pb-2">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search Messenger" className="w-full h-9 pl-9 pr-3 bg-gray-100 rounded-full text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:bg-gray-200 transition" />
            </div>
          </div>
          <div className="flex gap-1 px-3 pb-2">
            {['all', 'team', 'clients'].map(tab => (
              <button key={tab} onClick={() => setFilterTab(tab)}
                className={`px-3 h-8 rounded-full text-sm font-semibold transition ${filterTab === tab ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}>
                {tab === 'all' ? 'All' : tab === 'team' ? 'Team' : 'Clients'}
              </button>
            ))}
          </div>
        </div>
        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {loading && mergedConvs.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 size={20} className="animate-spin text-gray-300" />
            </div>
          ) : filteredConvs.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm font-medium">
              {search ? 'No results' : 'No conversations'}
            </div>
          ) : (
            filteredConvs.map(conv => {
              const isActive = activeConv && ((conv.type === 'team' && activeConv.id === conv.id) || (conv.type === 'client' && activeConv.phone === conv.id));
              const initial = conv.type === 'client' ? (conv.initial || conv.name.charAt(0).toUpperCase()) : conv.name.charAt(0).toUpperCase();
              const color = avatarColor(conv.name);
              return (
                <button key={conv.id + conv.type} onClick={() => selectConv(conv)}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition border-b border-gray-100 ${isActive ? 'bg-blue-50' : ''}`}>
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ backgroundColor: color }}>
                    {initial}
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm truncate ${conv.unread ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'}`}>{conv.name}</span>
                      <span className="text-xs text-gray-400 shrink-0 ml-2">{formatConvTime(conv.time)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-sm truncate ${conv.unread ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{conv.subtitle}</span>
                      {conv.unread && <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
      {/* OVERLAY ON MOBILE */}
      {isMobile && sidebarOpen && <div className="fixed inset-0 z-0" onClick={() => setSidebarOpen(false)} />}

      {/* MAIN CHAT AREA */}
      {activeConv ? (
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          {/* Chat Header */}
          <div className="shrink-0 flex items-center gap-3 px-4 h-14 border-b border-gray-200 bg-white">
            {isMobile && (
              <button onClick={() => { setSidebarOpen(true); }} className="p-1 -ml-1 text-gray-500 hover:bg-gray-100 rounded-full transition">
                <ArrowLeft size={20} />
              </button>
            )}
            {!isMobile && (
              <button onClick={() => setSidebarOpen(s => !s)} className="p-1 -ml-1 text-gray-500 hover:bg-gray-100 rounded-full transition">
                <Menu size={20} />
              </button>
            )}
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ backgroundColor: avatarColor(convLabel(activeConv)) }}>
              {convLabel(activeConv).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-gray-900 truncate">{convLabel(activeConv)}</p>
              <p className="text-xs text-gray-400">
                {activeConv.type === 'team' ? (activeConv.participants?.length > 2 ? `${activeConv.participants?.length} members` : 'Active now') : (activeConv.phone || 'SMS')}
              </p>
            </div>
            {activeConv.type === 'client' && (
              <button onClick={handleAiSuggest} disabled={aiSuggestLoading} className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-full transition" title="AI suggest reply">
                {aiSuggestLoading ? <Loader2 size={18} className="animate-spin" /> : <BrainCircuit size={18} />}
              </button>
            )}
            {activeConv.type === 'team' && (
              <button onClick={() => deleteConv(activeConv.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition">
                <Trash2 size={16} />
              </button>
            )}
          </div>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <MessageCircle size={36} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-semibold">No messages yet</p>
                  <p className="text-xs mt-1">Say hello!</p>
                </div>
              </div>
            ) : (
              messages.map((m, i) => {
                const me = activeConv.type === 'team' ? m.sender === currentUser : m.direction === 'outbound';
                const prev = i > 0 ? messages[i - 1] : null;
                const showHeader = !prev || formatDateHeader(prev.timestamp) !== formatDateHeader(m.timestamp);
                const showTime = !prev || !prev.timestamp || (m.timestamp?.toMillis?.() || new Date(m.timestamp).getTime()) - (prev.timestamp?.toMillis?.() || new Date(prev.timestamp).getTime()) > 300000;
                return (
                  <React.Fragment key={m.id || i}>
                    {showHeader && (
                      <div className="flex justify-center my-3">
                        <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">{formatDateHeader(m.timestamp)}</span>
                      </div>
                    )}
                    <div className={`flex mb-1 ${me ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] ${me ? 'items-end' : 'items-start'}`}>
                        {activeConv.type === 'team' && !me && (
                          <p className="text-xs font-semibold text-gray-500 mb-0.5 px-1">{m.sender?.split('@')[0]}</p>
                        )}
                        <div className={`px-3 py-2 text-[15px] leading-relaxed break-words ${
                          me
                            ? 'bg-[#0084ff] text-white rounded-2xl rounded-br-md'
                            : 'bg-[#E4E6EB] text-gray-900 rounded-2xl rounded-bl-md'
                        }`}>
                          <p className="whitespace-pre-wrap">{m.text}</p>
                        </div>
                        <div className={`flex items-center gap-1 mt-0.5 px-1 ${me ? 'justify-end' : 'justify-start'}`}>
                          <span className="text-[11px] text-gray-400">{formatMsgTime(m.timestamp)}</span>
                          {me && (activeConv.type === 'team' ? <CheckCheck size={12} className="text-blue-400" /> : (m.status === 'sent' || m.status === 'delivered') && <CheckCheck size={12} className="text-blue-400" />)}
                          {activeConv.type === 'client' && !me && sentiments[m.id] && (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                              sentiments[m.id].sentiment === 'positive' ? 'bg-green-100 text-green-700' :
                              sentiments[m.id].sentiment === 'negative' ? 'bg-red-100 text-red-700' :
                              sentiments[m.id].sentiment === 'urgent' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {sentiments[m.id].sentiment === 'positive' ? 'Positive' :
                               sentiments[m.id].sentiment === 'negative' ? 'Negative' :
                               sentiments[m.id].sentiment === 'urgent' ? 'Urgent' : 'Neutral'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
          {/* AI Suggested Reply */}
          {aiSuggestedReply && (
            <div className="shrink-0 px-4 py-2 bg-indigo-50 border-t border-indigo-100">
              <div className="flex items-start gap-2">
                <Sparkles size={14} className="text-indigo-500 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-[10px] font-bold text-indigo-600 uppercase mb-1">AI Suggested</p>
                  <p className="text-sm text-gray-700 bg-white rounded-lg p-2.5 border border-indigo-100">{aiSuggestedReply.suggestedReply}</p>
                  <div className="flex gap-2 mt-1.5">
                    <button onClick={() => { setText(aiSuggestedReply.suggestedReply); setAiSuggestedReply(null); }} className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition">Use</button>
                    <button onClick={() => setAiSuggestedReply(null)} className="px-3 py-1 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-50 transition">Dismiss</button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* Input */}
          <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-2" style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))' }}>
            <form onSubmit={handleSend} className="flex items-end gap-2">
              <div className="flex-1 bg-gray-100 rounded-3xl px-4 py-2 flex items-center focus-within:bg-white focus-within:border focus-within:border-blue-400 transition">
                <input value={text} onChange={e => setText(e.target.value)} onKeyDown={handleKeyDown} placeholder="Aa" className="flex-1 bg-transparent text-[15px] text-gray-800 placeholder:text-gray-400 outline-none" />
              </div>
              <button type="submit" disabled={!text.trim() || sending}
                className="w-9 h-9 rounded-full bg-[#0084ff] text-white flex items-center justify-center hover:bg-[#0073e6] active:scale-95 transition disabled:opacity-40 shrink-0">
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} fill="currentColor" />}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center mx-auto mb-4">
              <MessageCircle size={32} className="text-gray-400" />
            </div>
            <p className="text-lg font-bold text-gray-700">Your messages</p>
            <p className="text-sm text-gray-500 mt-1">Select a conversation to start chatting</p>
          </div>
        </div>
      )}

      {/* NEW CHAT / SMS MODAL */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => { setShowNewChat(false); setSelectedUsers([]); setNewSmsPhone(''); setNewSmsText(''); }}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">New conversation</h3>
              <button onClick={() => { setShowNewChat(false); setSelectedUsers([]); setNewSmsPhone(''); setNewSmsText(''); }} className="p-1 text-gray-400 hover:bg-gray-100 rounded-lg transition"><X size={20} /></button>
            </div>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setActiveTab('team')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${activeTab === 'team' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'}`}>Team</button>
              <button onClick={() => setActiveTab('sms')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${activeTab === 'sms' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'}`}>SMS</button>
            </div>
            {activeTab === 'team' ? (
              <>
                <div className="space-y-0.5 max-h-60 overflow-y-auto -mx-1 px-1 mb-4">
                  {allUsers.map(email => {
                    const sel = selectedUsers.includes(email);
                    return (
                      <button key={email} onClick={() => setSelectedUsers(p => p.includes(email) ? p.filter(e => e !== email) : [...p, email])}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition ${sel ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${sel ? 'bg-blue-500' : 'bg-gray-300'}`} style={sel ? {} : { backgroundColor: avatarColor(email) }}>
                          {email.charAt(0).toUpperCase()}
                        </div>
                        <div className="text-left min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{email.split('@')[0]}</p>
                          <p className="text-xs text-gray-400 truncate">{email}</p>
                        </div>
                        {sel && <Check size={16} className="text-blue-500 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setShowNewChat(false); setSelectedUsers([]); }} className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-medium text-sm hover:bg-gray-200 transition">Cancel</button>
                  <button onClick={createConv} disabled={selectedUsers.length === 0} className="flex-1 py-2.5 bg-blue-500 text-white rounded-xl font-medium text-sm disabled:opacity-40 hover:bg-blue-600 transition">Start</button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">Phone</label>
                    <input value={newSmsPhone} onChange={e => setNewSmsPhone(e.target.value)} placeholder="+1 (317) 555-1234" className="w-full px-3 py-2.5 bg-gray-100 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-300 focus:bg-white transition" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">Message</label>
                    <textarea value={newSmsText} onChange={e => setNewSmsText(e.target.value)} rows={3} placeholder="Type your message..." className="w-full px-3 py-2.5 bg-gray-100 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-300 focus:bg-white transition resize-none" />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => { setShowNewChat(false); setNewSmsPhone(''); setNewSmsText(''); }} className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-medium text-sm hover:bg-gray-200 transition">Cancel</button>
                  <button onClick={sendNewSms} disabled={!newSmsPhone.trim() || !newSmsText.trim() || newSmsSending} className="flex-1 py-2.5 bg-blue-500 text-white rounded-xl font-medium text-sm disabled:opacity-40 hover:bg-blue-600 transition flex items-center justify-center gap-1">
                    {newSmsSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={14} />} Send
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPage;
