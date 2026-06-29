import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { db, collection, addDoc, query, where, orderBy, serverTimestamp, doc, setDoc, updateDoc, deleteField, arrayUnion, onSnapshot } from '../config/firebase';
import { limit } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  Search, Plus, Menu, ArrowLeft, Send, Check, CheckCheck, X, Trash2, Loader2,
  MessageCircle, BrainCircuit, Sparkles, MoreVertical, Pin, Phone, Video,
  Copy, Reply, Info, Paperclip, Smile, Clock, User, Users, ExternalLink,
  FileText, Download, Flag, Archive, Bell, BellOff, AlertCircle, CheckCircle2,
  Eye, EyeOff, AtSign, Hash, Link, Image
} from 'lucide-react';
import { playMessageSound } from '../utils/notificationSound';
import { aiSuggestReply, aiAnalyzeSentiment } from '../config/ai';

const normalizePhone = (raw) => {
  if (!raw) return raw;
  const d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  if (d.length === 10) return "+1" + d;
  return "+" + d;
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
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
};

const formatDateHeader = (ts) => {
  if (!ts) return '';
  const d = ts?.toMillis ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return 'Today';
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
};

const AVATARS = ['#1a73e8', '#e8455b', '#0d9488', '#7c3aed', '#ea580c', '#0891b2', '#db2777', '#65a30d', '#c026d3', '#2563eb'];

const avatarColor = (name) => AVATARS[String(name || '').length % AVATARS.length];

/* ===================== SKELETON LOADER ===================== */
const Skeleton = ({ className = '' }) => <div className={`animate-pulse bg-gray-200 rounded ${className}`} />;

const ChatSkeleton = () => (
  <div className="space-y-1 p-3">
    {[1,2,3,4,5,6].map(i => (
      <div key={i} className="flex items-center gap-3 p-3">
        <Skeleton className="w-12 h-12 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-10" />
          </div>
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
    ))}
  </div>
);

/* ===================== MESSAGE CONTEXT MENU ===================== */
const MessageActions = ({ me, onCopy, onDelete }) => (
  <div className="absolute top-0 right-0 hidden group-hover:flex items-center gap-0.5 bg-white rounded-lg shadow-lg border border-gray-200 p-0.5 z-10 -mt-2 -mr-2">
    <button onClick={onCopy} className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700 transition" title="Copy">
      <Copy size={13} />
    </button>
    {me && (
      <button onClick={onDelete} className="p-1.5 hover:bg-red-50 rounded text-gray-500 hover:text-red-600 transition" title="Delete">
        <Trash2 size={13} />
      </button>
    )}
  </div>
);

/* ===================== ENTERPRISE CHAT PAGE ===================== */
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
  const [showInfo, setShowInfo] = useState(false);
  const [pinned, setPinned] = useState(new Set());

  const isMobile = useMobile();
  const messagesEndRef = useRef(null);
  const analyzedRef = useRef(new Set());
  const pendRef = useRef(new Set());
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const prevTeamRef = useRef({});

  /* ============= TEAM CONVERSATIONS ============= */
  useEffect(() => {
    let first = true;
    const unsub = onSnapshot(doc(db, 'chatData/conversations'), (snap) => {
      if (!snap.exists()) { setDoc(doc(db, 'chatData/conversations'), { conversations: {} }, { merge: true }).catch(() => {}); setTeamConvs([]); return; }
      const data = snap.data();
      const convs = Object.entries(data.conversations || {})
        .map(([id, c]) => ({ id, ...c }))
        .filter(c => role === 'admin' || c.participants?.includes(currentUser))
        .sort((a, b) => (b.lastMessage?.timestamp?.toMillis?.() || 0) - (a.lastMessage?.timestamp?.toMillis?.() || 0));
      if (!first) {
        convs.forEach(c => {
          const p = prevTeamRef.current[c.id];
          if (p && p.lastMessage?.text !== c.lastMessage?.text && c.lastMessage?.sender !== currentUser && activeConv?.id !== c.id) playMessageSound();
          prevTeamRef.current[c.id] = { ...c };
        });
      } else { convs.forEach(c => { prevTeamRef.current[c.id] = { ...c }; }); first = false; }
      setTeamConvs(convs);
    }, () => {});
    return () => unsub();
  }, [currentUser, role, activeConv?.id]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const arr = [];
      snap.forEach(d => { const data = d.data(); if (data.email && data.email !== currentUser) arr.push(data.email); });
      setAllUsers(arr);
    }, () => {});
    return () => unsub();
  }, [currentUser]);

  /* ============= CLIENT CONVERSATIONS ============= */
  useEffect(() => {
    let cancelled = false;
    const q = query(collection(db, 'smsLogs'), orderBy('timestamp', 'desc'), limit(500));
    const unsub = onSnapshot(q, (snap) => {
      if (cancelled) return;
      const t = tripsRef.current;
      const d = dispatchRef.current;
      const dr = driversRef.current;
      const cu = currentUserRef.current;
      const groups = {};
      snap.forEach(doc => {
        const msg = { id: doc.id, ...doc.data() };
        if (pendRef.current.has(msg.id)) return;
        const other = msg.direction === 'outbound' ? (msg.to || msg.from) : (msg.from || msg.to);
        if (!other) return;
        const norm = normalizePhone(other);
        if (norm === normalizePhone(TELNYX_NUMBER)) return;
        if (!groups[norm]) groups[norm] = [];
        groups[norm].push(msg);
      });
      const map = {};
      (t || []).forEach(trip => {
        [trip.patientPhone, trip.pickupPhone, trip.dropoffPhone].filter(Boolean).forEach(p => {
          const norm = normalizePhone(p);
          const tt = trip.date && trip.time ? new Date(trip.date + 'T' + (trip.time.includes(':') ? trip.time : trip.time + ':00')).getTime() : 0;
          if (!map[norm] || tt > (map[norm]._t || 0)) map[norm] = { ...trip, _t: tt };
        });
      });
      const rCli = (phone) => {
        const norm = normalizePhone(phone);
        const trip = norm ? map[norm] : null;
        if (trip?.patient) return { name: trip.patient, tripId: trip.id || trip.tripId, trip };
        if (norm) return { name: norm, tripId: null, trip: null };
        return { name: phone || 'Unknown', tripId: null, trip: null };
      };
      const phoneOf = (m) => m.direction === 'outbound' ? (m.to || m.from) : (m.from || m.to);
      const rFromMsgs = (msgs) => {
        for (const m of msgs) { const p = phoneOf(m); if (p) { const r = rCli(p); if (r.trip) return r; } }
        for (const m of msgs) { if (m.tripId) { const t2 = (t || []).find(trip => trip.id === m.tripId || trip.tripId === m.tripId); if (t2?.patient) return { name: t2.patient, tripId: m.tripId, trip: t2 }; } }
        for (const m of msgs) { const p = phoneOf(m); if (p) return { name: p, tripId: null, trip: null }; }
        return { name: msgs[0]?.to || msgs[0]?.from || 'Unknown', tripId: null, trip: null };
      };
      const sFilter = (convs) => {
        if (cu === 'driver') return [];
        const disp = d.find(dd => dd.email?.toLowerCase() === (cu || '').toLowerCase());
        if (cu !== 'dispatcher' || !disp) return convs;
        const aDr = dr.filter(dd => dd.assignedDispatcher === disp.id || dd.assignedTo === disp.id);
        const ids = new Set(aDr.map(dd => dd.id));
        const emails = new Set(aDr.map(dd => dd.email?.toLowerCase()).filter(Boolean));
        const phones = new Set();
        (t || []).forEach(trip => {
          if (ids.has(trip.driverId) || emails.has(trip.driverEmail?.toLowerCase())) {
            [trip.patientPhone, trip.pickupPhone, trip.dropoffPhone].filter(Boolean).forEach(p => phones.add(normalizePhone(p)));
          }
        });
        return convs.filter(c => phones.has(c.phone));
      };
      const convs = Object.entries(groups).map(([phone, msgs]) => {
        msgs.sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0));
        const last = msgs[0];
        const r = rFromMsgs(msgs);
        return { phone, clientName: r.name, tripId: r.tripId, trip: r.trip, lastMessage: last, messages: msgs };
      });
      convs.sort((a, b) => (b.lastMessage?.timestamp?.toMillis?.() || 0) - (a.lastMessage?.timestamp?.toMillis?.() || 0));
      setClientConvs(sFilter(convs));
      setLoading(false);
    }, () => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; unsub(); };
  }, []);

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

  const openClientConv = useCallback((conv) => {
    setActiveConv({ type: 'client', ...conv });
    const allMsgs = [...(conv.messages || [])];
    allMsgs.sort((a, b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0));
    setMessages(allMsgs);
  }, []);

  useEffect(() => {
    if (!activeConv || activeConv.type !== 'client') return;
    const updated = clientConvs.find(c => c.phone === activeConv.phone);
    if (!updated?.messages) return;
    setMessages(prev => {
      const existing = new Set(prev.map(m => m.id));
      const incoming = updated.messages.filter(m => !existing.has(m.id));
      if (incoming.length === 0) return prev;
      if (incoming.some(m => m.direction !== 'outbound')) playMessageSound();
      const merged = [...prev, ...incoming];
      merged.sort((a, b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0));
      return merged;
    });
  }, [clientConvs, activeConv?.phone, activeConv?.type]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    const unanalyzed = messages.filter(m => activeConv?.type === 'client' && m.direction !== 'outbound' && !analyzedRef.current.has(m.id) && m.text);
    unanalyzed.slice(0, 5).forEach(m => {
      analyzedRef.current.add(m.id);
      aiAnalyzeSentiment(m.text).then(r => { if (r) setSentiments(p => ({ ...p, [m.id]: r })); }).catch(() => {});
    });
  }, [messages, activeConv?.type]);

  /* ============= SEND ============= */
  const sendTeamMsg = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!text.trim() || !activeConv) return;
    const msg = text.trim();
    setText('');
    try {
      await addDoc(collection(db, 'chat_messages'), { conversationId: activeConv.id, text: msg, sender: currentUser, senderRole: role, timestamp: serverTimestamp() });
      await updateDoc(doc(db, 'chatData/conversations'), { [`conversations.${activeConv.id}.lastMessage`]: { text: msg, sender: currentUser, senderRole: role, timestamp: serverTimestamp(), readBy: [currentUser] } });
    } catch (e) { console.error(e); setText(msg); }
  };

  const sendClientSms = async () => {
    const msg = text.trim();
    if (!msg || sending || !activeConv) return;
    setSending(true);
    try {
      const fn = getFunctions();
      const call = httpsCallable(fn, 'sendSms');
      const res = await call({ to: activeConv.phone, text: msg, tripId: activeConv.tripId });
      if (res.data?.success) {
        const id = 'pend-' + Date.now();
        pendRef.current.add(id);
        const newMsg = { id, direction: 'outbound', to: activeConv.phone, text: msg, timestamp: new Date().toISOString(), status: 'sent' };
        setMessages(p => [...p, newMsg]);
        setClientConvs(p => p.map(c => c.phone === activeConv.phone ? { ...c, messages: [...(c.messages || []), newMsg], lastMessage: newMsg } : c));
        setText('');
      }
    } catch (e) { console.error(e); }
    setSending(false);
  };

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

  const sendNewSms = async () => {
    const phone = newSmsPhone.trim(); const msg = newSmsText.trim();
    if (!phone || !msg || newSmsSending) return;
    setNewSmsSending(true);
    try {
      const fn = getFunctions();
      const call = httpsCallable(fn, 'sendSms');
      await call({ to: phone, text: msg, tripId: null });
      setShowNewChat(false); setNewSmsPhone(''); setNewSmsText('');
      const norm = normalizePhone(phone);
      const id = 'pend-' + Date.now();
      pendRef.current.add(id);
      const newMsg = { id, direction: 'outbound', to: norm, from: TELNYX_NUMBER, text: msg, timestamp: new Date().toISOString(), status: 'sent' };
      setClientConvs(p => {
        const ex = p.find(c => c.phone === norm);
        if (ex) { const u = { ...ex, messages: [...(ex.messages || []), newMsg], lastMessage: newMsg }; return [u, ...p.filter(c => c.phone !== norm)]; }
        const r = (() => { const t = tripsRef.current; const norm = normalizePhone(phone); const trip = norm ? (() => { const map = {}; (t || []).forEach(trip => { [trip.patientPhone, trip.pickupPhone, trip.dropoffPhone].filter(Boolean).forEach(p => { const n = normalizePhone(p); const tt = trip.date && trip.time ? new Date(trip.date + 'T' + (trip.time.includes(':') ? trip.time : trip.time + ':00')).getTime() : 0; if (!map[n] || tt > (map[n]._t || 0)) map[n] = { ...trip, _t: tt }; }); }); return map[norm]; })() : null; return { name: trip?.patient || norm || 'Unknown', tripId: trip?.id || trip?.tripId || null, trip: trip || null }; })();
        return [{ phone: norm, clientName: r.name, tripId: r.tripId, trip: r.trip, lastMessage: newMsg, messages: [newMsg] }, ...p];
      });
      setActiveConv({ type: 'client', phone: norm, clientName: newSmsPhone, lastMessage: newMsg, messages: [newMsg] });
      setMessages([newMsg]);
    } catch (e) { console.error(e); }
    setNewSmsSending(false);
  };

  const deleteConv = (convId) => {
    if (!window.confirm('Delete this conversation?')) return;
    updateDoc(doc(db, 'chatData/conversations'), { [`conversations.${convId}`]: deleteField() }).catch(() => {});
    if (activeConv?.id === convId) setActiveConv(null);
  };

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
        id: c.id, type: 'team', name: label(c),
        subtitle: last.sender === currentUser ? `You: ${last.text || ''}` : (last.text || 'No messages'),
        time: last.timestamp, unread: last.sender !== currentUser && !(last.readBy || []).includes(currentUser),
        participants: c.participants, raw: c, pinned: pinned.has(c.id),
      });
    });
    clientConvs.forEach(c => {
      const phone = c.phone || c.clientName || '';
      const named = c.clientName && c.clientName !== phone && !c.clientName.startsWith('+');
      const dn = named ? c.clientName : phone;
      const last = c.lastMessage || {};
      list.push({
        id: c.phone, type: 'client', name: dn,
        subtitle: last.direction === 'outbound' ? `You: ${last.text || ''}` : (last.text || 'No messages'),
        time: last.timestamp, unread: false, phone: c.phone, clientName: c.clientName,
        tripId: c.tripId, trip: c.trip, messages: c.messages || [], raw: c, pinned: pinned.has(c.phone),
      });
    });
    const pinnedList = list.filter(c => c.pinned);
    const unpinnedList = list.filter(c => !c.pinned);
    pinnedList.sort((a, b) => ((b.time?.toMillis?.() || 0) - (a.time?.toMillis?.() || 0)));
    unpinnedList.sort((a, b) => ((b.time?.toMillis?.() || 0) - (a.time?.toMillis?.() || 0)));
    return [...pinnedList, ...unpinnedList];
  }, [teamConvs, clientConvs, currentUser, pinned]);

  const filteredConvs = useMemo(() => {
    let list = mergedConvs;
    if (filterTab === 'team') list = list.filter(c => c.type === 'team');
    else if (filterTab === 'clients') list = list.filter(c => c.type === 'client');
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(c => c.name.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q)); }
    return list;
  }, [mergedConvs, filterTab, search]);

  const convLabel = useCallback((conv) => {
    if (!conv) return '';
    if (conv.type === 'team') {
      if (conv.name) return conv.name;
      const other = (conv.participants || []).filter(p => p !== currentUser);
      return other[0]?.split('@')[0] || 'Unknown';
    }
    return conv.name || conv.phone || '';
  }, [currentUser]);

  const unreadTotal = useMemo(() => mergedConvs.filter(c => c.unread).length, [mergedConvs]);

  const selectConv = (conv) => {
    if (conv.type === 'team') setActiveConv({ ...conv.raw, type: 'team' });
    else openClientConv(conv.raw);
    if (isMobile) setSidebarOpen(false);
    setShowInfo(false);
  };

  const handleSend = (e) => {
    e?.preventDefault();
    if (!activeConv) return;
    if (activeConv.type === 'team') sendTeamMsg(e);
    else sendClientSms();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const copyText = (text) => navigator.clipboard?.writeText(text);

  /* ============= RENDER ============= */
  return (
    <div className="flex h-full bg-gray-50 overflow-hidden font-sans">
      {/* ===== SIDEBAR ===== */}
      <div className={`${isMobile ? (sidebarOpen ? 'absolute inset-0 z-20 bg-white' : 'hidden') : `${sidebarOpen ? 'w-[380px]' : 'w-0'} border-r border-gray-200`} flex flex-col shrink-0 overflow-hidden transition-all duration-200 bg-white`}>
        {/* Header */}
        <div className="shrink-0 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between px-5 h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-sm shadow-sm">AC</div>
              <div>
                <h1 className="text-[17px] font-bold text-gray-900 leading-tight">Messages</h1>
                <p className="text-[11px] text-gray-500 font-medium">{unreadTotal > 0 ? `${unreadTotal} unread` : 'All caught up'}</p>
              </div>
            </div>
            <button onClick={() => { setShowNewChat(true); setSelectedUsers([]); setNewSmsPhone(''); setNewSmsText(''); }}
              className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition active:scale-95">
              <Plus size={20} />
            </button>
          </div>
          <div className="px-4 pb-3">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations..."
                className="w-full h-10 pl-9 pr-4 bg-gray-100 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition border border-transparent focus:border-blue-400" />
            </div>
          </div>
          <div className="flex gap-1 px-4 pb-3">
            {[{k:'all',l:'All'},{k:'team',l:'Team'},{k:'clients',l:'Clients'}].map(t => (
              <button key={t.k} onClick={() => setFilterTab(t.k)}
                className={`px-3.5 h-8 rounded-lg text-[13px] font-semibold transition-all ${filterTab === t.k ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>{t.l}</button>
            ))}
          </div>
        </div>
        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {loading && mergedConvs.length === 0 ? <ChatSkeleton /> : filteredConvs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-60 text-gray-400 px-8">
              <MessageCircle size={40} className="mb-4 opacity-30" />
              <p className="text-sm font-bold text-gray-500">{search ? 'No results found' : 'No conversations yet'}</p>
              <p className="text-xs mt-1 text-center">{search ? 'Try a different search term.' : 'Start a new chat or send an SMS.'}</p>
            </div>
          ) : (
            <div className="py-1">
              {filteredConvs.map(conv => {
                const isActive = activeConv && ((conv.type === 'team' && activeConv.id === conv.id) || (conv.type === 'client' && activeConv.phone === conv.id));
                const initial = conv.type === 'client' ? (conv.name.charAt(0).toUpperCase()) : conv.name.charAt(0).toUpperCase();
                const color = avatarColor(conv.name);
                return (
                  <button key={conv.id + conv.type} onClick={() => selectConv(conv)}
                    className={`w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-all border-l-[3px] ${isActive ? 'bg-blue-50 border-l-blue-500' : 'border-l-transparent'}`}>
                    <div className="relative shrink-0">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm" style={{ backgroundColor: color }}>
                        {initial}
                      </div>
                      {conv.pinned && <div className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center shadow-sm"><Pin size={8} className="text-white" /></div>}
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex items-center justify-between">
                        <span className={`text-[14px] truncate ${conv.unread ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'}`}>{conv.name}</span>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {conv.unread && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                          <span className="text-[11px] text-gray-400 font-medium">{formatConvTime(conv.time)}</span>
                        </div>
                      </div>
                      <div className="flex items-center mt-0.5">
                        <span className={`text-[13px] truncate ${conv.unread ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{conv.subtitle}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ===== MAIN CHAT AREA ===== */}
      {activeConv ? (
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          {/* Chat Header */}
          <div className="shrink-0 flex items-center gap-2 px-4 h-16 border-b border-gray-200 bg-white shadow-sm z-10">
            {isMobile && (
              <button onClick={() => { setSidebarOpen(true); }} className="p-2 -ml-1 text-gray-500 hover:bg-gray-100 rounded-full transition">
                <ArrowLeft size={20} />
              </button>
            )}
            {!isMobile && (
              <button onClick={() => setSidebarOpen(s => !s)} className="p-2 -ml-1 text-gray-500 hover:bg-gray-100 rounded-full transition">
                <Menu size={20} />
              </button>
            )}
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm" style={{ backgroundColor: avatarColor(convLabel(activeConv)) }}>
              {convLabel(activeConv).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 ml-1">
              <p className="font-bold text-[15px] text-gray-900 truncate">{convLabel(activeConv)}</p>
              <p className="text-[12px] text-gray-500 font-medium">
                {activeConv.type === 'team'
                  ? (activeConv.participants?.length > 2 ? `${activeConv.participants?.length} participants` : 'Direct message')
                  : (activeConv.phone || 'SMS')}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {activeConv.type === 'client' && (
                <button onClick={handleAiSuggest} disabled={aiSuggestLoading} className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-full transition" title="AI suggest reply">
                  {aiSuggestLoading ? <Loader2 size={18} className="animate-spin" /> : <BrainCircuit size={18} />}
                </button>
              )}
              <button onClick={() => setShowInfo(!showInfo)} className={`p-2 rounded-full transition ${showInfo ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`} title="Info">
                <Info size={18} />
              </button>
              <button onClick={() => setPinned(p => { const n = new Set(p); const id = activeConv.type === 'team' ? activeConv.id : activeConv.phone; if (n.has(id)) n.delete(id); else n.add(id); return n; })}
                className={`p-2 rounded-full transition ${(activeConv.type === 'team' ? pinned.has(activeConv.id) : pinned.has(activeConv.phone)) ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:bg-gray-100'}`} title="Pin">
                <Pin size={18} />
              </button>
              {activeConv.type === 'team' && (
                <button onClick={() => deleteConv(activeConv.id)} className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-full transition" title="Delete">
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-1 min-h-0">
            {/* Messages */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex-1 overflow-y-auto px-6 py-4" ref={scrollRef}>
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    <div className="text-center">
                      <MessageCircle size={44} className="mx-auto mb-4 opacity-20" />
                      <p className="text-base font-bold text-gray-500">No messages yet</p>
                      <p className="text-sm mt-1 text-gray-400">Send a message to start the conversation</p>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-[700px] mx-auto">
                    {messages.map((m, i) => {
                      const me = activeConv.type === 'team' ? m.sender === currentUser : m.direction === 'outbound';
                      const prev = i > 0 ? messages[i - 1] : null;
                      const next = i < messages.length - 1 ? messages[i + 1] : null;
                      const showHeader = !prev || formatDateHeader(prev.timestamp) !== formatDateHeader(m.timestamp);
                      const showAvatar = activeConv.type === 'team' && !me && (!next || next.sender !== m.sender || formatDateHeader(next.timestamp) !== formatDateHeader(m.timestamp));
                      const sameSender = prev && ((activeConv.type === 'team' && prev.sender === m.sender) || (activeConv.type === 'client' && prev.direction === m.direction));
                      const timeGap = !prev || !prev.timestamp || (m.timestamp?.toMillis?.() || new Date(m.timestamp).getTime()) - (prev.timestamp?.toMillis?.() || new Date(prev.timestamp).getTime()) > 600000;
                      const isFirst = !sameSender || timeGap;
                      return (
                        <React.Fragment key={m.id || i}>
                          {showHeader && (
                            <div className="flex justify-center my-4">
                              <span className="text-[11px] font-bold text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full uppercase tracking-wider">{formatDateHeader(m.timestamp)}</span>
                            </div>
                          )}
                          <div className={`flex mb-0.5 group relative ${me ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[75%] ${me ? 'items-end' : 'items-start'}`}>
                              {activeConv.type === 'team' && !me && isFirst && (
                                <div className="flex items-center gap-2 mb-1 ml-1">
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-[10px] shrink-0" style={{ backgroundColor: avatarColor(m.sender) }}>
                                    {(m.sender?.split('@')[0] || '?').charAt(0).toUpperCase()}
                                  </div>
                                  <span className="text-[12px] font-bold text-gray-700">{m.sender?.split('@')[0]}</span>
                                  {activeConv.type === 'client' && !me && sentiments[m.id] && (
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                      sentiments[m.id].sentiment === 'positive' ? 'bg-green-100 text-green-700' :
                                      sentiments[m.id].sentiment === 'negative' ? 'bg-red-100 text-red-700' :
                                      sentiments[m.id].sentiment === 'urgent' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                                    }`}>
                                      {sentiments[m.id].sentiment === 'positive' ? 'Positive' : sentiments[m.id].sentiment === 'negative' ? 'Negative' : sentiments[m.id].sentiment === 'urgent' ? 'Urgent' : 'Neutral'}
                                    </span>
                                  )}
                                </div>
                              )}
                              <MessageActions me={me} onCopy={() => copyText(m.text)} onDelete={() => setMessages(p => p.filter(msg => msg.id !== m.id))} />
                              <div className={`px-4 py-2.5 text-[15px] leading-relaxed break-words ${
                                me
                                  ? 'bg-[#0084ff] text-white rounded-[18px] rounded-br-[4px]'
                                  : 'bg-[#E4E6EB] text-gray-900 rounded-[18px] rounded-bl-[4px]'
                              } ${!isFirst && me ? 'rounded-tr-[4px]' : ''} ${!isFirst && !me ? 'rounded-tl-[4px]' : ''}`}>
                                <p className="whitespace-pre-wrap">{m.text}</p>
                              </div>
                              <div className={`flex items-center gap-1 mt-0.5 px-1 h-4 ${me ? 'justify-end' : 'justify-start'}`}>
                                <span className="text-[11px] text-gray-400">{isFirst ? formatMsgTime(m.timestamp) : ''}</span>
                                {me && <CheckCheck size={12} className="text-blue-400" />}
                              </div>
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
              {/* AI Suggested Reply */}
              {aiSuggestedReply && (
                <div className="shrink-0 px-6 py-3 bg-indigo-50/80 border-t border-indigo-100 backdrop-blur-sm">
                  <div className="max-w-[700px] mx-auto flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0"><Sparkles size={14} className="text-indigo-600" /></div>
                    <div className="flex-1">
                      <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider mb-1">AI Suggested Reply</p>
                      <p className="text-[14px] text-gray-700 bg-white rounded-xl p-3 border border-indigo-200 shadow-sm">{aiSuggestedReply.suggestedReply}</p>
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => { setText(aiSuggestedReply.suggestedReply); setAiSuggestedReply(null); inputRef.current?.focus(); }} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-[12px] font-bold hover:bg-indigo-700 transition shadow-sm">Use Reply</button>
                        <button onClick={() => setAiSuggestedReply(null)} className="px-4 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-[12px] font-bold hover:bg-gray-50 transition">Dismiss</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {/* Input */}
              <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
                <form onSubmit={handleSend} className="max-w-[700px] mx-auto flex items-end gap-2">
                  <button type="button" className="w-9 h-9 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition shrink-0">
                    <Paperclip size={18} />
                  </button>
                  <div className="flex-1 bg-gray-100 rounded-2xl px-4 py-2 flex items-center focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-400 transition border border-transparent">
                    <input ref={inputRef} value={text} onChange={e => setText(e.target.value)} onKeyDown={handleKeyDown} placeholder="Type a message..."
                      className="flex-1 bg-transparent text-[15px] text-gray-800 placeholder:text-gray-400 outline-none" />
                  </div>
                  <button type="submit" disabled={!text.trim() || sending}
                    className="w-9 h-9 rounded-full bg-[#0084ff] text-white flex items-center justify-center hover:bg-[#0073e6] active:scale-95 transition disabled:opacity-40 shrink-0 shadow-sm">
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} fill="currentColor" />}
                  </button>
                </form>
              </div>
            </div>
            {/* Info Panel */}
            {showInfo && (
              <div className="w-72 shrink-0 border-l border-gray-200 bg-gray-50 overflow-y-auto p-4 hidden lg:block">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl mx-auto shadow-sm" style={{ backgroundColor: avatarColor(convLabel(activeConv)) }}>
                    {convLabel(activeConv).charAt(0).toUpperCase()}
                  </div>
                  <h3 className="font-bold text-gray-900 mt-3">{convLabel(activeConv)}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{activeConv.type === 'team' ? 'Team conversation' : 'SMS conversation'}</p>
                </div>
                {activeConv.type === 'team' && (
                  <div>
                    <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Participants</h4>
                    <div className="space-y-2">
                      {(activeConv.participants || []).map(p => (
                        <div key={p} className="flex items-center gap-2.5 p-2 rounded-xl bg-white border border-gray-100">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[10px] shrink-0" style={{ backgroundColor: avatarColor(p) }}>{p.charAt(0).toUpperCase()}</div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-gray-800 truncate">{p.split('@')[0]}</p>
                            <p className="text-[10px] text-gray-400">{p === currentUser ? 'You' : p}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {activeConv.type === 'client' && activeConv.trip && (
                  <div>
                    <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Trip Info</h4>
                    <div className="bg-white border border-gray-100 rounded-xl p-3 space-y-2">
                      {activeConv.trip.patient && <div className="flex justify-between text-xs"><span className="text-gray-500">Patient</span><span className="font-semibold text-gray-800">{activeConv.trip.patient}</span></div>}
                      {activeConv.trip.pickup && <div className="flex justify-between text-xs"><span className="text-gray-500">Pickup</span><span className="font-semibold text-gray-800 truncate ml-2">{activeConv.trip.pickup}</span></div>}
                      {activeConv.trip.dropoff && <div className="flex justify-between text-xs"><span className="text-gray-500">Dropoff</span><span className="font-semibold text-gray-800 truncate ml-2">{activeConv.trip.dropoff}</span></div>}
                      {activeConv.tripId && onSwitchToDispatch && (
                        <button onClick={() => onSwitchToDispatch(activeConv.tripId)} className="w-full mt-2 py-2 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 transition flex items-center justify-center gap-1.5">
                          <ExternalLink size={12} /> View in Dispatch
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <div className="mt-6">
                  <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Actions</h4>
                  <div className="space-y-1">
                    <button onClick={() => { setPinned(p => { const n = new Set(p); const id = activeConv.type === 'team' ? activeConv.id : activeConv.phone; if (n.has(id)) n.delete(id); else n.add(id); return n; })}}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white border border-transparent hover:border-gray-100 text-sm text-gray-600 font-medium transition">
                      <Pin size={15} className="text-gray-400" /> {(activeConv.type === 'team' ? pinned.has(activeConv.id) : pinned.has(activeConv.phone)) ? 'Unpin' : 'Pin'} conversation
                    </button>
                    <button onClick={() => copyText(convLabel(activeConv))} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white border border-transparent hover:border-gray-100 text-sm text-gray-600 font-medium transition">
                      <Copy size={15} className="text-gray-400" /> Copy name
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Empty State */
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center max-w-sm">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center mx-auto mb-6 shadow-lg">
              <MessageCircle size={40} className="text-white/90" />
            </div>
            <h2 className="text-xl font-bold text-gray-800">Welcome to Messages</h2>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">Select a conversation from the sidebar or start a new chat to communicate with your team and clients.</p>
            <button onClick={() => { setShowNewChat(true); setSelectedUsers([]); setNewSmsPhone(''); setNewSmsText(''); }}
              className="mt-6 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition shadow-sm inline-flex items-center gap-2">
              <Plus size={16} /> New Conversation
            </button>
          </div>
        </div>
      )}

      {/* NEW CHAT MODAL */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => { setShowNewChat(false); setSelectedUsers([]); setNewSmsPhone(''); setNewSmsText(''); }}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-[fadeIn_0.2s_ease-out]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-gray-900">New Conversation</h3>
              <button onClick={() => { setShowNewChat(false); setSelectedUsers([]); setNewSmsPhone(''); setNewSmsText(''); }} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition"><X size={20} /></button>
            </div>
            <div className="flex gap-2 mb-5 bg-gray-100 rounded-xl p-1">
              {[{k:'team',l:'Team Chat',i:User},{k:'sms',l:'SMS',i:MessageCircle}].map(t => (
                <button key={t.k} onClick={() => setActiveTab(t.k)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === t.k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  <t.i size={16} /> {t.l}
                </button>
              ))}
            </div>
            {activeTab === 'team' ? (
              <>
                <div className="max-h-64 overflow-y-auto -mx-2 px-2 mb-4 space-y-0.5">
                  {allUsers.map(email => {
                    const sel = selectedUsers.includes(email);
                    return (
                      <button key={email} onClick={() => setSelectedUsers(p => p.includes(email) ? p.filter(e => e !== email) : [...p, email])}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all ${sel ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-50'}`}>
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ backgroundColor: avatarColor(email) }}>
                          {email.charAt(0).toUpperCase()}
                        </div>
                        <div className="text-left min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-800 truncate">{email.split('@')[0]}</p>
                          <p className="text-xs text-gray-400 truncate">{email}</p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition ${sel ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                          {sel && <Check size={12} className="text-white" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setShowNewChat(false); setSelectedUsers([]); }} className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-200 transition">Cancel</button>
                  <button onClick={createConv} disabled={selectedUsers.length === 0} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm disabled:opacity-40 hover:bg-blue-700 transition">{selectedUsers.length > 1 ? 'Create Group' : 'Start Chat'}</button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1.5">Phone Number</label>
                    <input value={newSmsPhone} onChange={e => setNewSmsPhone(e.target.value)} placeholder="+1 (317) 555-1234"
                      className="w-full px-3.5 py-2.5 bg-gray-100 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1.5">Message</label>
                    <textarea value={newSmsText} onChange={e => setNewSmsText(e.target.value)} rows={3} placeholder="Type your message..."
                      className="w-full px-3.5 py-2.5 bg-gray-100 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition resize-none" />
                  </div>
                </div>
                <div className="flex gap-2 mt-5">
                  <button onClick={() => { setShowNewChat(false); setNewSmsPhone(''); setNewSmsText(''); }} className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-200 transition">Cancel</button>
                  <button onClick={sendNewSms} disabled={!newSmsPhone.trim() || !newSmsText.trim() || newSmsSending}
                    className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm disabled:opacity-40 hover:bg-blue-700 transition flex items-center justify-center gap-1.5">
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
