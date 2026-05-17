import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, getDocs, doc, setDoc, getDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { MessageCircle, Send, Search, Plus, ArrowLeft, Phone, Truck, ShieldCheck, X, Trash2, Check, CheckCheck, Smile, Users, User, Clock, MoreVertical, Edit2, Image, Paperclip, Mic } from 'lucide-react';

const EMOJIS = ['😀','😂','❤️','🔥','👍','🙏','🎉','💯','⭐','💪','😍','🥳','😎','🤝','✅','🙌','👏','🎯','🚀','💡','🤗','🤩','😇','🥺','😊','😅','😁','🤔','😏','😴','🥱','😤','😭','😱','🥹','😈','👀','🫶','✨','🔥'];
const CONVERSATIONS_DOC = 'chatData/conversations';

const timeStr = (ts) => { if (!ts) return ''; const d = ts.toDate ? ts.toDate() : new Date(ts); return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
const dateLabel = (ts) => { if (!ts) return ''; const d = ts.toDate ? ts.toDate() : new Date(ts); const t = new Date(); if (d.toDateString() === t.toDateString()) return timeStr(ts); const w = new Date(t); w.setDate(w.getDate()-6); if (d > w) return d.toLocaleDateString([], { weekday: 'short' }); return d.toLocaleDateString([], { month: 'short', day: 'numeric' }); };
const fullDate = (ts) => { if (!ts) return ''; const d = ts.toDate ? ts.toDate() : new Date(ts); return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); };

const ChatPage = ({ currentUser, role }) => {
  const [convs, setConvs] = useState([]);
  const [msgs, setMsgs] = useState([]);
  const [active, setActive] = useState(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [sel, setSel] = useState([]);
  const [grp, setGrp] = useState('');
  const [creating, setCreating] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [online, setOnline] = useState({});
  const [typing, setTyping] = useState({});
  const [sidebar, setSidebar] = useState(true);
  const [unread, setUnread] = useState({});
  const scrollRef = useRef(null);
  const timer = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const ref = doc(db, 'presence', currentUser);
    setDoc(ref, { email: currentUser, online: true, lastSeen: serverTimestamp() }, { merge: true });
    const interval = setInterval(() => updateDoc(ref, { lastSeen: serverTimestamp() }).catch(() => {}), 30000);
    const unsub = onSnapshot(collection(db, 'presence'), snap => { const m = {}; snap.forEach(d => { m[d.id] = d.data(); }); setOnline(m); });
    const hb = () => updateDoc(ref, { online: false, lastSeen: serverTimestamp() });
    window.addEventListener('beforeunload', hb);
    return () => { unsub(); clearInterval(interval); window.removeEventListener('beforeunload', hb); updateDoc(ref, { online: false, lastSeen: serverTimestamp() }); };
  }, [currentUser]);

  useEffect(() => onSnapshot(collection(db, 'users'), snap => { const a = []; snap.forEach(d => { const dt = d.data(); if (dt.email && dt.email !== currentUser) a.push({ uid: d.id, email: dt.email, role: dt.role || 'unknown' }); }); setUsers(a); }), [currentUser]);

  useEffect(() => onSnapshot(doc(db, CONVERSATIONS_DOC), snap => {
    if (!snap.exists()) { setLoading(false); return; }
    const dt = snap.data();
    const c = Object.entries(dt.conversations || {}).map(([id, v]) => ({ id, ...v })).filter(x => x.participants?.includes(currentUser)).sort((a, b) => (b.lastMessage?.timestamp?.toMillis?.() || 0) - (a.lastMessage?.timestamp?.toMillis?.() || 0));
    setConvs(c);
    const m = {}; c.forEach(x => { const u = (x.unread || {})[currentUser] || 0; m[x.id] = u; }); setUnread(m);
    setLoading(false);
  }, (err) => console.error('Chat convs snapshot error:', err)), [currentUser]);

  useEffect(() => {
    if (!active) { setMsgs([]); return; }
    const q = query(collection(db, 'chat_messages'), where('conversationId', '==', active.id), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, snap => {
      const m = []; snap.forEach(d => m.push({ id: d.id, ...d.data() })); setMsgs(m);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 100);
      getDoc(doc(db, CONVERSATIONS_DOC)).then(s => { if (s.exists()) { const d = s.data(); const c = d.conversations?.[active.id]; if (c && (c.unread?.[currentUser] || 0) > 0) updateDoc(doc(db, CONVERSATIONS_DOC), { [`conversations.${active.id}.unread.${currentUser}`]: 0 }); } });
    }, (err) => console.error('Chat messages snapshot error:', err));
    const tq = query(collection(db, 'chat_typing'), where('conversationId', '==', active.id));
    const tunsub = onSnapshot(tq, snap => { const m = {}; snap.forEach(d => { const dt = d.data(); if (dt.email !== currentUser) m[dt.email] = true; }); setTyping(m); });
    return () => { unsub(); tunsub(); };
  }, [active?.id, currentUser]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || !active) return;
    const msg = text.trim(); setText(''); setShowEmoji(false);
    await addDoc(collection(db, 'chat_messages'), { conversationId: active.id, participants: active.participants || [], text: msg, sender: currentUser, senderRole: role, timestamp: serverTimestamp(), readBy: [currentUser] });
    const s = await getDoc(doc(db, CONVERSATIONS_DOC));
    const d = s.exists() ? s.data() : { conversations: {} };
    d.conversations = d.conversations || {};
    const c = d.conversations[active.id] || {};
    c.lastMessage = { text: msg, sender: currentUser, timestamp: serverTimestamp() };
    (active.participants || []).forEach(p => { if (p !== currentUser) { c.unread = c.unread || {}; c.unread[p] = (c.unread[p] || 0) + 1; } });
    d.conversations[active.id] = c;
    await setDoc(doc(db, CONVERSATIONS_DOC), d);
    const tq = query(collection(db, 'chat_typing'), where('conversationId', '==', active.id), where('email', '==', currentUser));
    (await getDocs(tq)).forEach(d => deleteDoc(d.ref));
  };

  const handleTyping = () => {
    if (!active) return;
    addDoc(collection(db, 'chat_typing'), { conversationId: active.id, email: currentUser, timestamp: serverTimestamp() });
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => { const tq = query(collection(db, 'chat_typing'), where('conversationId', '==', active.id), where('email', '==', currentUser)); (await getDocs(tq)).forEach(d => deleteDoc(d.ref)); }, 3000);
  };

  const createConv = async () => {
    if (sel.length === 0) return; setCreating(true);
    const participants = [currentUser, ...sel];
    const id = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const isGroup = sel.length > 1 || grp.trim();
    const initUnread = {}; participants.forEach(p => initUnread[p] = 0);
    const data = { type: isGroup ? 'group' : 'direct', participants, name: isGroup ? (grp.trim() || sel.map(e => e.split('@')[0]).join(', ')) : sel[0].split('@')[0], createdAt: serverTimestamp(), lastMessage: { text: 'Conversation started', sender: currentUser, timestamp: serverTimestamp() }, unread: initUnread, createdBy: currentUser };
    const s = await getDoc(doc(db, CONVERSATIONS_DOC));
    const d = s.exists() ? s.data() : { conversations: {} };
    d.conversations = d.conversations || {};
    d.conversations[id] = data;
    await setDoc(doc(db, CONVERSATIONS_DOC), d);
    setShowNew(false); setSel([]); setGrp(''); setActive({ id, ...data }); setSidebar(false); setCreating(false);
  };

  const delConv = async (convId) => { if (!window.confirm('Delete this conversation?')) return; const s = await getDoc(doc(db, CONVERSATIONS_DOC)); const d = s.data(); delete d.conversations[convId]; await setDoc(doc(db, CONVERSATIONS_DOC), d); if (active?.id === convId) setActive(null); };

  const toggle = (email) => setSel(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]);
  const filtered = users.filter(u => u.email.toLowerCase().includes(search.toLowerCase()));
  const label = (c) => { if (c.type === 'group') return c.name || 'Group'; const o = (c.participants || []).filter(p => p !== currentUser); return o[0]?.split('@')[0] || 'Unknown'; };
  const convIcon = (c) => { if (c.type === 'group') return <Users size={16} />; const r = (c.participants || []).filter(p => p !== currentUser).map(p => users.find(u => u.email === p)).filter(Boolean)[0]?.role; return r === 'driver' ? <Truck size={16} /> : <ShieldCheck size={16} />; };
  const isOnline = (email) => online[email]?.online === true;
  const typingText = () => { const n = Object.keys(typing); if (n.length === 0) return ''; return `${n.map(e => e.split('@')[0]).join(', ')} ${n.length === 1 ? 'is' : 'are'} typing...`; };
  const otherEmail = (c) => (c.participants || []).filter(p => p !== currentUser)[0];

  return (
    <div className="flex flex-1 bg-white overflow-hidden h-full">
      {/* Sidebar */}
      <div className={`${sidebar ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-[340px] border-r border-slate-100 bg-white shrink-0`}>
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-slate-900">Chats</h2>
            <button onClick={() => { setShowNew(true); setSearch(''); }} className="w-9 h-9 rounded-2xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:scale-90 transition shadow-sm"><Plus size={18} /></button>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search conversations..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-100 rounded-2xl text-sm font-medium outline-none focus:bg-white focus:border focus:border-blue-500 transition placeholder:text-slate-400" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full"><div className="w-7 h-7 border-3 border-blue-100 border-t-blue-600 rounded-full animate-spin" /></div>
          ) : convs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center mb-4"><MessageCircle size={28} className="text-slate-300" /></div>
              <p className="text-base font-bold text-slate-700">No conversations</p>
              <p className="text-sm text-slate-400 mt-1">Start a new chat with someone.</p>
            </div>
          ) : (
            <div>{convs.map(c => {
              const u = unread[c.id] || 0;
              const o = otherEmail(c);
              const lastMsg = c.lastMessage?.text || 'No messages';
              const isTyping = typingText() && active?.id === c.id;
              return (
                <button key={c.id} onClick={() => { setActive(c); if (window.innerWidth < 768) setSidebar(false); }}
                  className={`w-full text-left px-4 py-3.5 hover:bg-slate-50 transition flex items-center gap-3 border-b border-slate-50 ${active?.id === c.id ? 'bg-blue-50/50' : ''}`}>
                  <div className="relative shrink-0">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-bold ${c.type === 'group' ? 'bg-indigo-100 text-indigo-600' : 'bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600'}`}>{c.type === 'group' ? <Users size={18} /> : (label(c).charAt(0).toUpperCase())}</div>
                    {c.type !== 'group' && isOnline(o) && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-[2.5px] border-white rounded-full" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900 truncate">{label(c)}</p>
                      {c.lastMessage?.timestamp && <span className="text-[10px] text-slate-400 shrink-0 font-medium">{dateLabel(c.lastMessage.timestamp)}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className={`text-[12px] truncate flex-1 ${u > 0 ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
                        {c.lastMessage?.sender === currentUser && <span className="text-slate-400">You: </span>}{lastMsg}
                      </p>
                      {u > 0 && <span className="shrink-0 bg-blue-600 text-white text-[9px] font-bold min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center leading-none">{u > 99 ? '99+' : u}</span>}
                    </div>
                  </div>
                </button>
              );})}</div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#f0f2f5]">
        {active ? (
          <>
            {/* Chat Header */}
            <div className="px-4 py-3 bg-white border-b border-slate-100 flex items-center gap-3 shrink-0 shadow-sm">
              {!sidebar && <button onClick={() => setSidebar(true)} className="md:hidden p-1.5 -ml-1.5 text-slate-500 hover:bg-slate-100 rounded-xl"><ArrowLeft size={18} /></button>}
              <div className="relative shrink-0">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold ${active.type === 'group' ? 'bg-indigo-100 text-indigo-600' : 'bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600'}`}>
                  {active.type === 'group' ? <Users size={16} /> : label(active).charAt(0).toUpperCase()}
                </div>
                {active.type !== 'group' && isOnline(otherEmail(active)) && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full" />}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-semibold text-sm text-slate-900 truncate">{label(active)}</h4>
                <p className="text-[11px] text-slate-500">{typingText() || (active.type === 'group' ? `${active.participants?.length || 0} members` : isOnline(otherEmail(active)) ? 'Online' : 'Offline')}</p>
              </div>
              <button onClick={() => { const e = otherEmail(active); if (e) window.open(`tel:${e.replace(/[^0-9]/g, '')}`); }} className="w-9 h-9 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 flex items-center justify-center transition"><Phone size={16} /></button>
              <button onClick={() => delConv(active.id)} className="w-9 h-9 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition"><Trash2 size={16} /></button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1" ref={scrollRef}>
              {msgs.length === 0 ? (
                <div className="flex items-center justify-center h-full text-slate-400">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-white rounded-3xl shadow-sm flex items-center justify-center mx-auto mb-4"><MessageCircle size={24} className="text-slate-300" /></div>
                    <p className="text-sm font-bold text-slate-600">No messages yet</p>
                    <p className="text-xs text-slate-400 mt-1">Send a message to start the conversation.</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Date separator */}
                  <div className="flex justify-center my-3"><span className="text-[11px] text-slate-400 bg-white/80 px-3 py-1 rounded-full shadow-sm font-medium">{fullDate(msgs[0]?.timestamp)}</span></div>
                  {msgs.map((msg, idx) => {
                    const isMe = msg.sender === currentUser;
                    const showAvatar = idx === 0 || msgs[idx-1]?.sender !== msg.sender;
                    const read = (msg.readBy || []).some(r => r !== currentUser && active.participants?.includes(r));
                    const showDate = idx > 0 && msg.timestamp && msgs[idx-1]?.timestamp && new Date(msg.timestamp.toDate?.() || msg.timestamp).toDateString() !== new Date(msgs[idx-1].timestamp.toDate?.() || msgs[idx-1].timestamp).toDateString();
                    return (
                      <div key={msg.id}>
                        {showDate && <div className="flex justify-center my-3"><span className="text-[11px] text-slate-400 bg-white/80 px-3 py-1 rounded-full shadow-sm font-medium">{fullDate(msg.timestamp)}</span></div>}
                        <div className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : ''} ${showAvatar ? 'my-1.5' : 'my-0.5'}`}>
                          {!isMe && <div className={`w-7 h-7 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0 ${showAvatar ? '' : 'invisible'}`}>{label(active).charAt(0).toUpperCase()}</div>}
                          <div className={`max-w-[75%] px-3.5 py-2.5 leading-relaxed text-sm ${isMe ? 'bg-blue-600 text-white rounded-[18px] rounded-br-[4px]' : 'bg-white text-slate-800 rounded-[18px] rounded-bl-[4px] shadow-sm border border-slate-50'}`}>
                            <p className="text-[14px] leading-relaxed">{msg.text}</p>
                            <div className={`flex items-center justify-end gap-1 mt-0.5 ${isMe ? 'text-blue-200' : 'text-slate-400'}`}>
                              <span className="text-[9px] font-medium">{msg.timestamp ? timeStr(msg.timestamp) : ''}</span>
                              {isMe && (read ? <CheckCheck size={12} className="text-blue-200" /> : <Check size={12} />)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            {/* Input */}
            <div className="px-3 py-3 bg-white border-t border-slate-100 shrink-0">
              <form onSubmit={send} className="flex items-end gap-2">
                <div className="flex-1 relative flex items-center bg-slate-50 rounded-2xl px-4 py-2.5 border border-slate-200 focus-within:border-blue-500 focus-within:bg-white transition">
                  <input ref={inputRef} type="text" placeholder="Type a message..." value={text} onChange={e => { setText(e.target.value); handleTyping(); }} className="flex-1 text-sm outline-none bg-transparent placeholder:text-slate-400" />
                  <button type="button" onClick={() => setShowEmoji(!showEmoji)} className="p-0.5 text-slate-400 hover:text-slate-600 shrink-0 ml-1"><Smile size={20} /></button>
                  {showEmoji && (
                    <div className="absolute bottom-full right-0 mb-2 bg-white border border-slate-200 rounded-2xl p-3 shadow-2xl grid grid-cols-8 gap-1 z-10 max-w-[320px]">
                      {EMOJIS.map(e => <button key={e} type="button" onClick={() => { setText(t => t + e); setShowEmoji(false); inputRef.current?.focus(); }} className="w-8 h-8 hover:bg-slate-100 rounded-lg text-lg flex items-center justify-center transition">{e}</button>)}
                    </div>
                  )}
                </div>
                <button type="submit" disabled={!text.trim()} className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:scale-90 transition disabled:opacity-40 shadow-sm"><Send size={18} fill="currentColor" /></button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-[#f0f2f5]">
            <div className="text-center">
              <div className="w-24 h-24 bg-white rounded-[2.5rem] shadow-lg flex items-center justify-center mx-auto mb-6">
                <MessageCircle size={44} className="text-blue-600 opacity-60" />
              </div>
              <h3 className="text-xl font-bold text-slate-700">Agape Care Chat</h3>
              <p className="text-sm text-slate-400 mt-2 max-w-[260px] mx-auto leading-relaxed">Select a conversation from the sidebar to start messaging.</p>
              <button onClick={() => { setShowNew(true); setSearch(''); }} className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold text-sm hover:bg-blue-700 active:scale-95 transition shadow-lg shadow-blue-600/20 flex items-center gap-2 mx-auto"><Plus size={18} /> New Conversation</button>
            </div>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {showNew && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => { setShowNew(false); setSel([]); setGrp(''); }} />
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl relative z-10 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-5"><h3 className="text-lg font-bold text-slate-900">New Conversation</h3><button onClick={() => { setShowNew(false); setSel([]); setGrp(''); }} className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center hover:bg-slate-200 transition"><X size={16} /></button></div>
            {sel.length > 1 && <input type="text" placeholder="Group name (optional)" value={grp} onChange={e => setGrp(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium outline-none mb-4" />}
            <div className="relative mb-4"><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" placeholder="Search people..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-100 rounded-2xl text-sm font-medium outline-none" /></div>
            <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
              {filtered.length === 0 ? <p className="text-sm text-slate-400 text-center py-8 font-medium">No users found.</p> : filtered.map(u => {
                const s = sel.includes(u.email);
                return (
                  <button key={u.email} onClick={() => toggle(u.email)} className={`w-full flex items-center gap-3 p-3 rounded-2xl transition text-left ${s ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'}`}>
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold ${s ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{u.email.charAt(0).toUpperCase()}</div>
                    <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-900 truncate">{u.email.split('@')[0]}</p><p className="text-[11px] text-slate-400 truncate">{u.email}</p></div>
                    <span className={`px-2 py-0.5 rounded-lg text-[8px] font-bold uppercase ${u.role === 'driver' ? 'bg-emerald-50 text-emerald-600' : u.role === 'admin' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>{u.role}</span>
                  </button>
                );})}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">{sel.length} selected{sel.length > 1 ? ' (group)' : ''}</p>
              <div className="flex gap-2">
                <button onClick={() => { setShowNew(false); setSel([]); setGrp(''); }} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-2xl font-semibold text-sm hover:bg-slate-200 transition">Cancel</button>
                <button onClick={createConv} disabled={sel.length === 0 || creating} className="px-5 py-2.5 bg-blue-600 text-white rounded-2xl font-semibold text-sm hover:bg-blue-700 transition disabled:opacity-50 shadow-sm">{creating ? 'Creating...' : 'Start Chat'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPage;