import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, Send, Search, Plus, ArrowLeft, Phone, Truck, ShieldCheck, X, Trash2, Check, CheckCheck, Smile, User, Clock, Bell } from 'lucide-react';
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, getDocs, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

const EMOJIS = ['😀','😂','❤️','🔥','👍','🙏','🎉','💯','⭐','💪','😍','🥳','😎','🤝','✅','🙌','👏','🎯','🚀','💡'];

const CONVERSATIONS_DOC = 'chatData/conversations';
const timeStr = (ts) => { if (!ts) return ''; const d = ts.toDate ? ts.toDate() : new Date(ts); return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
const dateLabel = (ts) => { if (!ts) return ''; const d = ts.toDate ? ts.toDate() : new Date(ts); const today = new Date(); if (d.toDateString() === today.toDateString()) return timeStr(ts); return d.toLocaleDateString([], { month: 'short', day: 'numeric' }); };

const ChatPage = ({ currentUser, role }) => {
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [online, setOnline] = useState({});
  const [typing, setTyping] = useState({});
  const [sidebar, setSidebar] = useState(true);
  const [unread, setUnread] = useState({});
  const scrollRef = useRef(null);
  const timer = useRef(null);

  // Presence
  useEffect(() => {
    const ref = doc(db, 'presence', currentUser);
    setDoc(ref, { email: currentUser, online: true, lastSeen: serverTimestamp() }, { merge: true });
    const interval = setInterval(() => { updateDoc(ref, { lastSeen: serverTimestamp() }).catch(() => {}); }, 30000);
    const unsub = onSnapshot(collection(db, 'presence'), snap => { const m = {}; snap.forEach(d => { m[d.id] = d.data(); }); setOnline(m); });
    window.addEventListener('beforeunload', () => updateDoc(ref, { online: false, lastSeen: serverTimestamp() }));
    return () => { unsub(); clearInterval(interval); updateDoc(ref, { online: false, lastSeen: serverTimestamp() }); };
  }, [currentUser]);

  // Users
  useEffect(() => {
    return onSnapshot(collection(db, 'users'), snap => {
      const arr = []; snap.forEach(d => { const dt = d.data(); if (dt.email && dt.email !== currentUser) arr.push({ uid: d.id, email: dt.email, role: dt.role || 'unknown' }); });
      setUsers(arr);
    });
  }, [currentUser]);

  // Conversations
  useEffect(() => {
    return onSnapshot(doc(db, CONVERSATIONS_DOC), snap => {
      if (snap.exists()) {
        const dt = snap.data();
        const convs = Object.entries(dt.conversations || {}).map(([id, c]) => ({ id, ...c })).filter(c => c.participants?.includes(currentUser)).sort((a, b) => (b.lastMessage?.timestamp?.toMillis?.() || 0) - (a.lastMessage?.timestamp?.toMillis?.() || 0));
        setConversations(convs);
        const m = {}; convs.forEach(c => { const u = (c.unread || {})[currentUser] || 0; m[c.id] = u; }); setUnread(m);
      }
      setLoading(false);
    });
  }, [currentUser]);

  // Messages
  useEffect(() => {
    if (!activeConv) { setMessages([]); return; }
    const q = query(collection(db, 'chat_messages'), where('conversationId', '==', activeConv.id), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, snap => {
      const msgs = []; snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
      setMessages(msgs);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 100);
      getDoc(doc(db, CONVERSATIONS_DOC)).then(s => { if (s.exists()) { const d = s.data(); const c = d.conversations?.[activeConv.id]; if (c && (c.unread?.[currentUser] || 0) > 0) updateDoc(doc(db, CONVERSATIONS_DOC), { [`conversations.${activeConv.id}.unread.${currentUser}`]: 0 }); } });
    });
    const tq = query(collection(db, 'chat_typing'), where('conversationId', '==', activeConv.id));
    const tunsub = onSnapshot(tq, snap => { const m = {}; snap.forEach(d => { const dt = d.data(); if (dt.email !== currentUser) m[dt.email] = true; }); setTyping(m); });
    return () => { unsub(); tunsub(); };
  }, [activeConv?.id, currentUser]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || !activeConv) return;
    const msg = text.trim();
    setText(''); setShowEmoji(false);
    await addDoc(collection(db, 'chat_messages'), { conversationId: activeConv.id, participants: activeConv.participants || [], text: msg, sender: currentUser, senderRole: role, timestamp: serverTimestamp(), readBy: [currentUser] });
    const s = await getDoc(doc(db, CONVERSATIONS_DOC));
    const d = s.exists() ? s.data() : { conversations: {} };
    d.conversations = d.conversations || {};
    const c = d.conversations[activeConv.id] || {};
    c.lastMessage = { text: msg, sender: currentUser, timestamp: serverTimestamp() };
    (activeConv.participants || []).forEach(p => { if (p !== currentUser) { c.unread = c.unread || {}; c.unread[p] = (c.unread[p] || 0) + 1; } });
    d.conversations[activeConv.id] = c;
    await setDoc(doc(db, CONVERSATIONS_DOC), d);
    const tq = query(collection(db, 'chat_typing'), where('conversationId', '==', activeConv.id), where('email', '==', currentUser));
    (await getDocs(tq)).forEach(d => deleteDoc(d.ref));
  };

  const handleTyping = () => {
    if (!activeConv) return;
    addDoc(collection(db, 'chat_typing'), { conversationId: activeConv.id, email: currentUser, timestamp: serverTimestamp() });
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const tq = query(collection(db, 'chat_typing'), where('conversationId', '==', activeConv.id), where('email', '==', currentUser));
      (await getDocs(tq)).forEach(d => deleteDoc(d.ref));
    }, 3000);
  };

  const createConv = async () => {
    if (selected.length === 0) return;
    setCreating(true);
    const participants = [currentUser, ...selected];
    const id = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const isGroup = selected.length > 1 || groupName.trim();
    const initUnread = {}; participants.forEach(p => { initUnread[p] = 0; });
    const data = { type: isGroup ? 'group' : 'direct', participants, name: isGroup ? (groupName.trim() || selected.map(e => e.split('@')[0]).join(', ')) : selected[0].split('@')[0], createdAt: serverTimestamp(), lastMessage: { text: 'Conversation started', sender: currentUser, timestamp: serverTimestamp() }, unread: initUnread, createdBy: currentUser };
    const s = await getDoc(doc(db, CONVERSATIONS_DOC));
    const d = s.exists() ? s.data() : { conversations: {} };
    d.conversations = d.conversations || {};
    d.conversations[id] = data;
    await setDoc(doc(db, CONVERSATIONS_DOC), d);
    setShowNew(false); setSelected([]); setGroupName(''); setActiveConv({ id, ...data }); setSidebar(false);
    setCreating(false);
  };

  const delConv = async (convId) => { if (!window.confirm('Delete this conversation?')) return; const s = await getDoc(doc(db, CONVERSATIONS_DOC)); const d = s.data(); delete d.conversations[convId]; await setDoc(doc(db, CONVERSATIONS_DOC), d); if (activeConv?.id === convId) setActiveConv(null); };

  const toggle = (email) => setSelected(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]);
  const filteredUsers = users.filter(u => u.email.toLowerCase().includes(search.toLowerCase()));
  const label = (c) => { if (c.type === 'group') return c.name || 'Group'; const o = (c.participants || []).filter(p => p !== currentUser); return o[0]?.split('@')[0] || 'Unknown'; };
  const icon = (c) => { if (c.type === 'group') return <Users size={16} />; const r = (c.participants || []).filter(p => p !== currentUser).map(p => users.find(u => u.email === p)).filter(Boolean)[0]?.role; return r === 'driver' ? <Truck size={16} /> : <ShieldCheck size={16} />; };
  const isOnline = (email) => online[email]?.online === true;
  const typingText = () => { const names = Object.keys(typing); if (names.length === 0) return ''; return `${names.map(e => e.split('@')[0]).join(', ')} ${names.length === 1 ? 'is' : 'are'} typing...`; };

  return (
    <div className="flex flex-1 bg-white overflow-hidden">
      {/* Sidebar */}
      <div className={`${sidebar ? 'flex' : 'hidden'} md:flex flex-col w-full border-r border-slate-100 bg-slate-50/50 shrink-0 ${activeConv ? 'md:w-72 lg:w-80' : 'md:w-full'}`}>
        <div className="p-3 border-b border-slate-100 bg-white">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-slate-900">Messages</h3>
            <button onClick={() => { setShowNew(true); setSearch(''); }} className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:scale-90 transition"><Plus size={16} /></button>
          </div>
          <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-slate-100 rounded-xl text-xs font-bold outline-none" /></div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? <div className="flex items-center justify-center h-full"><div className="w-6 h-6 border-2 border-blue-100 border-t-blue-600 rounded-full animate-spin" /></div> : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center text-slate-400"><MessageCircle size={32} className="opacity-20 mb-3" /><p className="text-sm font-bold">No conversations</p><p className="text-[11px] mt-1">Start a new chat.</p></div>
          ) : (
            <div className="divide-y divide-slate-100">{conversations.map(c => { const u = unread[c.id] || 0; const o = (c.participants || []).filter(p => p !== currentUser)[0]; return (
              <button key={c.id} onClick={() => { setActiveConv(c); if (window.innerWidth < 768) setSidebar(false); }} className={`w-full text-left p-3 hover:bg-slate-100 transition flex items-center gap-3 ${activeConv?.id === c.id ? 'bg-blue-50' : ''}`}>
                <div className="relative shrink-0"><div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.type === 'group' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-600'}`}>{icon(c)}</div>{c.type !== 'group' && isOnline(o) && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full" />}</div>
                <div className="min-w-0 flex-1"><div className="flex justify-between items-center"><p className="text-sm font-bold text-slate-900 truncate">{label(c)}</p>{c.lastMessage?.timestamp && <span className="text-[8px] text-slate-400 shrink-0 ml-2">{dateLabel(c.lastMessage.timestamp)}</span>}</div><p className={`text-[11px] truncate mt-0.5 ${u > 0 ? 'font-bold text-slate-900' : 'text-slate-500'}`}>{c.lastMessage?.sender === currentUser ? 'You: ' : ''}{c.lastMessage?.text || 'No messages'}</p></div>
                {u > 0 && <span className="shrink-0 bg-blue-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{u > 99 ? '99+' : u}</span>}
              </button>);})}</div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeConv ? (
          <>
            <div className="px-3 py-3 border-b border-slate-100 bg-white flex items-center gap-3 shrink-0">
              {window.innerWidth < 768 && <button onClick={() => setSidebar(true)} className="p-1 -ml-1 text-slate-500"><ArrowLeft size={18} /></button>}
              <div className="relative shrink-0"><div className={`w-9 h-9 rounded-xl flex items-center justify-center ${activeConv.type === 'group' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-600'}`}>{icon(activeConv)}</div>{activeConv.type !== 'group' && isOnline(activeConv.participants?.filter(p => p !== currentUser)[0]) && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full" />}</div>
              <div className="min-w-0 flex-1"><h4 className="font-bold text-sm text-slate-900 truncate">{label(activeConv)}</h4><p className="text-[9px] text-slate-400">{typingText() || (activeConv.type === 'group' ? `${activeConv.participants?.length || 0} members` : isOnline(activeConv.participants?.filter(p => p !== currentUser)[0]) ? 'Online' : 'Offline')}</p></div>
              <button onClick={() => delConv(activeConv.id)} className="w-8 h-8 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition"><Trash2 size={14} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-thin" ref={scrollRef}>
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-slate-400"><p className="text-sm font-bold">No messages yet.</p></div>
              ) : messages.map((msg, idx) => {
                const isMe = msg.sender === currentUser;
                const showAvatar = idx === 0 || messages[idx - 1].sender !== msg.sender;
                const read = (msg.readBy || []).some(r => r !== currentUser && activeConv.participants?.includes(r));
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    {showAvatar && !isMe && <div className="flex items-center gap-2 mb-1 ml-1"><span className="text-[9px] font-bold text-slate-500">{msg.sender?.split('@')[0]}</span><span className={`px-1.5 py-0.5 rounded text-[7px] font-bold uppercase ${msg.senderRole === 'driver' ? 'bg-emerald-50 text-emerald-600' : msg.senderRole === 'admin' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>{msg.senderRole || 'user'}</span></div>}
                    <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl ${isMe ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-slate-100 text-slate-900 rounded-bl-sm'}`}>
                      <p className="text-sm leading-relaxed">{msg.text}</p>
                      <div className={`flex items-center justify-end gap-1 mt-1 ${isMe ? 'text-blue-200' : 'text-slate-400'}`}>
                        <span className="text-[8px] font-bold">{msg.timestamp ? timeStr(msg.timestamp) : ''}</span>
                        {isMe && (read ? <CheckCheck size={11} className="text-blue-200" /> : <Check size={11} />)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-3 py-3 bg-white border-t border-slate-100 shrink-0">
              <form onSubmit={send} className="flex gap-2 items-end">
                <div className="flex-1 relative flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2 focus-within:border-blue-500 focus-within:bg-white transition">
                  <input type="text" placeholder="Type a message..." value={text} onChange={e => { setText(e.target.value); handleTyping(); }} className="flex-1 text-sm font-medium outline-none bg-transparent" />
                  <button type="button" onClick={() => setShowEmoji(!showEmoji)} className="p-0.5 text-slate-400 hover:text-slate-600 shrink-0"><Smile size={17} /></button>
                  {showEmoji && <div className="absolute bottom-full right-0 mb-2 bg-white border border-slate-200 rounded-xl p-2 shadow-xl grid grid-cols-5 gap-0.5 z-10">{EMOJIS.map(e => <button key={e} type="button" onClick={() => { setText(t => t + e); setShowEmoji(false); }} className="w-7 h-7 hover:bg-slate-100 rounded-lg text-sm flex items-center justify-center transition">{e}</button>)}</div>}
                </div>
                <button type="submit" disabled={!text.trim()} className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:scale-90 transition disabled:opacity-40 shadow-sm"><Send size={16} fill="currentColor" /></button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
            <div className="w-20 h-20 bg-slate-50 rounded-[2.5rem] flex items-center justify-center mb-5"><MessageCircle size={40} className="opacity-20" /></div>
            <p className="text-base font-bold text-slate-700">Agape Care Chat</p>
            <p className="text-xs font-medium mt-2 text-center max-w-[220px]">Select a conversation or start a new one.</p>
            <button onClick={() => { setShowNew(true); setSearch(''); }} className="mt-5 px-5 py-2.5 bg-blue-600 text-white rounded-2xl font-bold text-xs hover:bg-blue-700 active:scale-95 transition shadow-sm flex items-center gap-2"><Plus size={16} /> New Chat</button>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {showNew && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => { setShowNew(false); setSelected([]); setGroupName(''); }} />
          <div className="bg-white/95 backdrop-blur-xl w-full max-w-sm rounded-3xl p-5 shadow-2xl relative z-10 border border-white/50 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4"><h3 className="text-base font-bold text-slate-900">New Chat</h3><button onClick={() => { setShowNew(false); setSelected([]); setGroupName(''); }} className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200"><X size={14} /></button></div>
            {selected.length > 1 && <input type="text" placeholder="Group name (optional)" value={groupName} onChange={e => setGroupName(e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none mb-3" />}
            <div className="relative mb-3"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" placeholder="Search by email..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-slate-100 rounded-xl text-xs font-bold outline-none" /></div>
            <div className="flex-1 overflow-y-auto space-y-1 min-h-0">{filteredUsers.length === 0 ? <p className="text-xs text-slate-400 text-center py-6 font-bold">No users found.</p> : filteredUsers.map(u => { const sel = selected.includes(u.email); return (
              <button key={u.email} onClick={() => toggle(u.email)} className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl transition text-left ${sel ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${sel ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{u.email.charAt(0).toUpperCase()}</div>
                <div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-900 truncate">{u.email.split('@')[0]}</p><p className="text-[9px] text-slate-400 truncate">{u.email}</p></div>
                <span className={`px-1.5 py-0.5 rounded text-[7px] font-bold uppercase ${u.role === 'driver' ? 'bg-emerald-50 text-emerald-600' : u.role === 'admin' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>{u.role}</span>
              </button>);})}</div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between"><p className="text-[10px] font-bold text-slate-500">{selected.length} selected{selected.length > 1 ? ' (group)' : ''}</p><div className="flex gap-2"><button onClick={() => { setShowNew(false); setSelected([]); setGroupName(''); }} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-200 transition">Cancel</button><button onClick={createConv} disabled={selected.length === 0 || creating} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs hover:bg-blue-700 transition disabled:opacity-50 shadow-sm">{creating ? 'Creating...' : 'Start Chat'}</button></div></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPage;