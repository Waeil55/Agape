import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft, MessageCircle, Search, Users, Phone, Filter,
  Plus, Send, Smile, Paperclip, X, Info, ChevronDown, Loader2
} from 'lucide-react';
import {
  db, auth, collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc,
  serverTimestamp, query, where, orderBy, limit, getDoc, getDocs
} from '../../config/firebase';
import { startAfter, increment } from 'firebase/firestore';

const COLORS = ['#2b4c7e','#e8455b','#059669','#7c3aed','#ea580c','#0891b2','#be185d','#65a30d'];
const color = (s = '') => COLORS[[...s].reduce((h,c) => (h*31+c.charCodeAt(0))|0, 0) % COLORS.length];

const toDate = (t) => { if (!t) return null; if (t?.toDate) return t.toDate(); const d = new Date(t); return isNaN(d?.getTime()) ? null : d; };
const clock = (t) => { const d = toDate(t); return d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''; };
const sameDay = (a, b) => toDate(a)?.toDateString() === toDate(b)?.toDateString();
const dayLabel = (t) => {
  const d = toDate(t);
  if (!d) return '';
  const n = new Date();
  if (d.toDateString() === n.toDateString()) return 'Today';
  const y = new Date(n); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
};
const initials = (name) => (name || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();

export default function ChatPage({ currentUser, role, drivers = [], dispatchers = [], trips, onSwitchToDispatch }) {
  const uid = auth.currentUser?.uid || '';

  // state
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newTab, setNewTab] = useState('team');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newSelected, setNewSelected] = useState([]);
  const [newSearch, setNewSearch] = useState('');
  const [sending, setSending] = useState(false);

  const msgEnd = useRef(null);
  const msgBox = useRef(null);
  const lastDocRef = useRef(null);
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  // responsive
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const h = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  // reset on convo change
  useEffect(() => {
    if (activeId) {
      setMessages([]);
      lastDocRef.current = null;
      setHasMore(true);
      setReplyTo(null);
    }
  }, [activeId]);

  // listen to conversations
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'chatData'), where('participants', 'array-contains', uid), orderBy('lastMessageTime', 'desc'));
    return onSnapshot(q, s => setConversations(s.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [uid]);

  // listen to messages
  useEffect(() => {
    if (!activeId) return;
    const q = query(collection(db, 'chatData', activeId, 'messages'), orderBy('createdAt', 'desc'), limit(25));
    return onSnapshot(q, s => {
      setMessages(s.docs.map(d => ({ id: d.id, ...d.data() })).reverse());
      lastDocRef.current = s.docs[s.docs.length - 1];
      setHasMore(s.docs.length >= 25);
      setTimeout(() => msgEnd.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    });
  }, [activeId]);

  // listen to ALL user profiles for name resolution
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(collection(db, 'users'), s => {
      const p = {};
      s.docs.forEach(d => {
        const data = d.data();
        const id = d.id;
        const email = (data.email || '').toLowerCase().trim();
        const fullName = data.displayName || data.name || [data.firstName, data.lastName].filter(Boolean).join(' ');
        const label = fullName || (email ? email.split('@')[0] : null) || data.phoneNumber || id.slice(0, 8);
        p[id] = label;
        if (email) p[email] = label;
        if (data.phone) p[data.phone] = label;
      });
      setProfiles(p);
    });
  }, [uid]);

  // scroll listener for "scroll to bottom" button
  useEffect(() => {
    const box = msgBox.current;
    if (!box) return;
    const h = () => setShowScrollBtn(box.scrollHeight - box.scrollTop - box.clientHeight > 120);
    box.addEventListener('scroll', h, { passive: true });
    return () => box.removeEventListener('scroll', h);
  }, [activeId]);

  // infinite scroll (load older messages)
  useEffect(() => {
    if (!hasMore || !activeId || !lastDocRef.current) return;
    const box = msgBox.current;
    if (!box) return;
    const h = () => {
      if (box.scrollTop < 60 && !loadingMore) {
        setLoadingMore(true);
        const q = query(collection(db, 'chatData', activeId, 'messages'), orderBy('createdAt', 'desc'), startAfter(lastDocRef.current), limit(25));
        getDocs(q).then(s => {
          setMessages(p => [...s.docs.map(d => ({ id: d.id, ...d.data() })).reverse(), ...p]);
          lastDocRef.current = s.docs[s.docs.length - 1];
          setHasMore(s.docs.length >= 25);
          setLoadingMore(false);
        }).catch(() => setLoadingMore(false));
      }
    };
    box.addEventListener('scroll', h, { passive: true });
    return () => box.removeEventListener('scroll', h);
  }, [hasMore, activeId, loadingMore]);

  // name resolver — tries profiles map, drivers, dispatchers, email, fallback
  const name = useCallback((id) => {
    if (!id) return 'Unknown';
    if (profiles[id]) return profiles[id];
    if (id.includes('@')) {
      const emailKey = id.toLowerCase();
      if (profiles[emailKey]) return profiles[emailKey];
      const d = drivers.find(x => (x.email||'').toLowerCase() === emailKey);
      if (d) return d.name || id.split('@')[0];
      const dp = dispatchers.find(x => (x.email||'').toLowerCase() === emailKey);
      if (dp) return dp.name || id.split('@')[0];
      return id.split('@')[0];
    }
    const d = drivers.find(x => x.id === id);
    if (d) return d.name || id;
    const dp = dispatchers.find(x => x.id === id);
    if (dp) return dp.name || id;
    if (currentUser && id === uid) return currentUser.split('@')[0];
    return 'Unknown';
  }, [profiles, drivers, dispatchers, currentUser, uid]);

  // unread count
  const unread = conversations.reduce((s, c) => s + (c.unread?.[uid] || 0), 0);

  // filtered list
  const list = conversations.filter(c => {
    if (filter === 'unread' && !c.unread?.[uid]) return false;
    if (filter === 'team' && !c.isTeamChat) return false;
    if (filter === 'sms' && c.isTeamChat) return false;
    if (search) {
      const q = search.toLowerCase();
      const n = (c.name || '').toLowerCase();
      const m = (c.lastMessage || '').toLowerCase();
      if (!n.includes(q) && !m.includes(q)) return false;
    }
    return true;
  });

  // send
  const send = async () => {
    if (!activeId || !input.trim() || !uid || sending) return;
    setSending(true);
    const body = input.trim();
    const me = name(currentUser);
    const data = {
      text: body, senderId: uid, senderName: me, createdAt: serverTimestamp(), read: false,
      ...(replyTo ? { replyToId: replyTo.id, replyToText: replyTo.text, replyToName: replyTo.senderName } : {}),
    };
    await addDoc(collection(db, 'chatData', activeId, 'messages'), data);
    await updateDoc(doc(db, 'chatData', activeId), {
      lastMessage: body, lastMessageBy: uid, lastMessageTime: serverTimestamp(),
      [`unread.${activeRef.current}`]: increment(1),
    });
    setInput('');
    setReplyTo(null);
    setSending(false);
    setTimeout(() => msgEnd.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  // mark read
  const markRead = async (cid) => {
    if (!cid || !uid) return;
    try { await updateDoc(doc(db, 'chatData', cid), { [`unread.${uid}`]: 0 }); } catch {}
  };

  // create conversation
  const create = async () => {
    if (newTab === 'team') {
      if (!newSelected.length) return;
      const ref = await addDoc(collection(db, 'chatData'), {
        participants: [...new Set([uid, ...newSelected])], isTeamChat: true,
        name: newName || 'Team Chat', lastMessage: '', lastMessageTime: serverTimestamp(), createdAt: serverTimestamp(),
      });
      setActiveId(ref.id);
    } else {
      if (!newPhone.trim()) return;
      const norm = '+1' + newPhone.replace(/\D/g, '').slice(0, 10);
      const ref = await addDoc(collection(db, 'chatData'), {
        participants: [uid], isTeamChat: false, smsNumbers: ['+18552223330', norm],
        name: newName || norm, lastMessage: '', lastMessageTime: serverTimestamp(), createdAt: serverTimestamp(),
      });
      setActiveId(ref.id);
    }
    setShowNewChat(false);
    setNewSelected([]);
    setNewName('');
    setNewPhone('');
  };

  // conversation name
  const convoName = (c) => {
    if (c.name) return c.name;
    const other = (c.participants || []).find(p => p !== uid);
    return name(other);
  };

  // ──────────────── MOBILE: LIST ────────────────
  if (isMobile && !activeId) {
    return (
      <div className="w-full h-[100dvh] bg-white flex flex-col overflow-hidden pb-[100px]">
        {/* top bar */}
        <div className="px-4 py-3 flex items-center justify-between bg-white border-b border-gray-100 shrink-0 sticky top-0 z-50" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 font-semibold border border-blue-100 shrink-0">
              <MessageCircle size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-sm text-gray-900">Messages</h1>
                {unread > 0 && <span className="px-2 py-0.5 rounded-full bg-[#2b4c7e] text-white text-[10px] font-bold leading-none">{unread}</span>}
              </div>
              <p className="text-[10px] text-gray-500 font-medium truncate max-w-[220px]">{currentUser}</p>
            </div>
          </div>
          <button onClick={() => { setNewTab('team'); setShowNewChat(true); }} className="p-2.5 rounded-full bg-[#2b4c7e] text-white shadow-md active:scale-95 transition-all">
            <Plus size={18} />
          </button>
        </div>

        {/* search + filters */}
        <div className="px-3 py-2 shrink-0 bg-white border-b border-gray-50">
          <div className="relative mb-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
              className="w-full h-10 pl-9 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#2b4c7e] transition-all" />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {[{ k: 'all', l: 'All' }, { k: 'unread', l: 'Unread' }, { k: 'team', l: 'Team' }, { k: 'sms', l: 'SMS' }].map(f => (
              <button key={f.k} onClick={() => setFilter(f.k)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-semibold whitespace-nowrap transition-all shrink-0 min-h-[32px] ${filter === f.k ? 'bg-[#1e3a5f] text-white' : 'bg-slate-100 text-slate-500'}`}>
                {f.l}
              </button>
            ))}
          </div>
        </div>

        {/* list */}
        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}>
          {list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <MessageCircle size={28} className="text-slate-300" />
              </div>
              <p className="text-sm font-bold text-slate-500">No conversations yet</p>
              <p className="text-xs text-slate-400 mt-1">Tap + to start messaging</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {list.map(c => {
                const un = c.unread?.[uid] || 0;
                const clr = color(c.id);
                const other = (c.participants || []).find(p => p !== uid);
                const n = convoName(c);
                const ini = initials(n);
                return (
                  <button key={c.id} onClick={() => { setActiveId(c.id); markRead(c.id); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 active:bg-slate-100 transition-all min-h-[64px]">
                    <div className="relative shrink-0">
                      <div className="w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: clr }}>{ini}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm truncate ${un > 0 ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>{n}</span>
                        <span className="text-[10px] text-gray-400 shrink-0 ml-2">{clock(c.lastMessageTime)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className={`text-xs truncate ${un > 0 ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>{c.lastMessage || 'No messages yet'}</span>
                        {un > 0 && <span className="shrink-0 ml-2 px-1.5 py-0.5 rounded-full bg-[#2b4c7e] text-white text-[9px] font-bold min-w-[18px] text-center">{un}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* FAB */}
        <button onClick={() => { setNewTab('team'); setShowNewChat(true); }}
          className="fixed z-30 right-4 w-14 h-14 rounded-full bg-[#2b4c7e] text-white shadow-xl flex items-center justify-center active:scale-95 transition-all border border-[#1e3a5f]"
          style={{ bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))', boxShadow: '0 8px 24px rgba(43,76,126,0.3)' }}>
          <Plus size={22} />
        </button>

        {/* new chat modal */}
        {showNewChat && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowNewChat(false)} />
            <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden">
              <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-10 h-1 rounded-full bg-gray-200" /></div>
              <div className="flex items-center justify-between px-5 pb-3 pt-2 border-b border-gray-100">
                <h2 className="text-base font-bold text-gray-900">New Conversation</h2>
                <button onClick={() => setShowNewChat(false)} className="p-2 rounded-full hover:bg-gray-100 text-gray-400"><X size={20} /></button>
              </div>
              <div className="flex border-b border-gray-100 px-5">
                {[{ k: 'team', l: 'Team Chat' }, { k: 'sms', l: 'SMS' }].map(t => (
                  <button key={t.k} onClick={() => setNewTab(t.k)}
                    className={`px-4 py-3 text-xs font-semibold border-b-2 transition-all ${newTab === t.k ? 'border-[#2b4c7e] text-[#2b4c7e]' : 'border-transparent text-gray-400'}`}>
                    {t.l}
                  </button>
                ))}
              </div>
              <div className="p-5 max-h-[60vh] overflow-y-auto">
                {newTab === 'team' ? (
                  <>
                    <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Group name (optional)"
                      className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#2b4c7e] mb-3" />
                    <div className="relative mb-3">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input value={newSearch} onChange={e => setNewSearch(e.target.value)} placeholder="Search people..."
                        className="w-full h-10 pl-9 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#2b4c7e]" />
                    </div>
                    <div className="space-y-1">
                      {[...drivers.map(d => ({ id: d.id, name: d.name || 'Driver', email: d.email || '' })), ...dispatchers.map(d => ({ id: d.id, name: d.name || 'Dispatcher', email: d.email || '' }))].filter(p => {
                        if (!newSearch) return true;
                        const s = newSearch.toLowerCase();
                        return p.name.toLowerCase().includes(s) || p.email.toLowerCase().includes(s);
                      }).map(p => (
                        <button key={p.id} onClick={() => setNewSelected(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all min-h-[48px] ${newSelected.includes(p.id) ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'}`}>
                          <div className="w-9 h-9 rounded-full bg-[#2b4c7e] flex items-center justify-center text-[10px] font-bold text-white">{initials(p.name)}</div>
                          <div className="flex-1 text-left min-w-0">
                            <span className="text-sm font-medium text-gray-800 block truncate">{p.name}</span>
                            {p.email && <span className="text-[10px] text-gray-400 block truncate">{p.email}</span>}
                          </div>
                          {newSelected.includes(p.id) && <span className="text-[#2b4c7e] text-xs font-bold">✓</span>}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name (optional)"
                      className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#2b4c7e] mb-3" />
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">+1</span>
                      <input value={newPhone} onChange={e => setNewPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="(555) 123-4567" type="tel"
                        className="w-full h-11 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#2b4c7e] font-medium tracking-wider" />
                    </div>
                  </>
                )}
              </div>
              <div className="px-5 py-4 border-t border-gray-100" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                <button onClick={create} disabled={newTab === 'team' ? !newSelected.length : !newPhone.trim()}
                  className="w-full h-12 rounded-xl bg-[#2b4c7e] text-white text-sm font-bold shadow-md active:scale-[0.98] transition-all disabled:opacity-40 min-h-[48px]">
                  Start Conversation
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ──────────────── MOBILE: CHAT ────────────────
  if (isMobile && activeId) {
    const c = conversations.find(x => x.id === activeId);
    const other = (c?.participants || []).find(p => p !== uid);
    const otherN = name(other);
    const clr = color(activeId);

    return (
      <div className="w-full h-[100dvh] bg-white flex flex-col overflow-hidden">
        {/* header */}
        <div className="px-3 py-2.5 flex items-center gap-2 bg-white border-b border-gray-100 shrink-0" style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}>
          <button onClick={() => setActiveId(null)} className="p-1.5 -ml-1 mr-1 text-gray-400 hover:text-gray-600 rounded-full bg-gray-50">
            <ChevronLeft size={20} />
          </button>
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: clr }}>
            {initials(otherN)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-gray-900 truncate">{otherN}</h2>
            <p className="text-[10px] text-gray-400 truncate">{c?.isTeamChat ? 'Team Chat' : 'Direct Message'}</p>
          </div>
          <button onClick={() => {}} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-50">
            <Info size={18} />
          </button>
        </div>

        {/* messages */}
        <div ref={msgBox} data-chat-messages className="flex-1 overflow-y-auto px-0 py-2" style={{ paddingBottom: 'calc(70px + env(safe-area-inset-bottom, 0px))' }}>
          {loadingMore && <div className="flex justify-center py-2"><Loader2 size={16} className="animate-spin text-gray-400" /></div>}
          {messages.map((msg, i) => {
            const prev = messages[i - 1];
            const showDate = !prev || !sameDay(prev.createdAt, msg.createdAt);
            const isMe = msg.senderId === uid;
            const senderName = name(msg.senderId);
            const ini = initials(senderName);
            return (
              <React.Fragment key={msg.id}>
                {showDate && (
                  <div className="flex justify-center py-2">
                    <span className="px-3 py-1 rounded-full bg-white border border-gray-100 text-[10px] font-semibold text-gray-400 shadow-sm">{dayLabel(msg.createdAt)}</span>
                  </div>
                )}
                <div className={`flex gap-2 px-3 py-0.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                  {!isMe && <div className="shrink-0 w-7 h-7 rounded-full bg-[#2b4c7e] flex items-center justify-center text-[8px] font-bold text-white mt-1">{ini}</div>}
                  <div className={`max-w-[78%] min-w-[50px]`}>
                    {!isMe && <span className="text-[9px] font-semibold text-gray-400 ml-1 mb-0.5 block">{senderName}</span>}
                    {msg.replyToId && (
                      <div className={`mb-1 rounded-xl px-2.5 py-1 text-[10px] border ${isMe ? 'bg-blue-50 border-blue-100 text-blue-600' : 'bg-gray-50 border-gray-100 text-gray-500'}`}>
                        <span className="font-semibold">{msg.replyToName || 'Message'}</span>
                        <p className="truncate opacity-70 mt-0.5">{msg.replyToText}</p>
                      </div>
                    )}
                    <div onDoubleClick={() => setReplyTo(msg)}
                      className={`rounded-2xl px-3 py-2 shadow-sm text-[13px] leading-relaxed ${isMe ? 'bg-[#2b4c7e] text-white rounded-br-md' : 'bg-white border border-gray-100 text-gray-900 rounded-bl-md'}`}>
                      {msg.text}
                    </div>
                    <div className={`flex items-center gap-1 mt-0.5 ${isMe ? 'justify-end mr-1' : 'ml-1'}`}>
                      <span className="text-[9px] text-gray-400">{clock(msg.createdAt)}</span>
                      {isMe && msg.read && <span className="text-[8px] text-blue-200 font-semibold">✓✓</span>}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          <div ref={msgEnd} />
        </div>

        {/* scroll to bottom */}
        {showScrollBtn && (
          <button onClick={() => { msgEnd.current?.scrollIntoView({ behavior: 'smooth' }); setShowScrollBtn(false); }}
            className="fixed z-30 right-4 w-10 h-10 rounded-full bg-white border border-gray-200 shadow-lg flex items-center justify-center text-gray-500 active:scale-95 transition-all"
            style={{ bottom: 'calc(90px + env(safe-area-inset-bottom, 0px))' }}>
            <ChevronDown size={18} />
          </button>
        )}

        {/* input */}
        <div className="shrink-0 bg-white border-t border-gray-100" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
          {replyTo && (
            <div className="flex items-center gap-2 px-4 pt-2 pb-1 bg-blue-50/50 border-b border-blue-100">
              <div className="flex-1 min-w-0">
                <span className="text-[9px] font-bold text-blue-600 block">Replying to {name(replyTo.senderId)}</span>
                <span className="text-[11px] text-gray-500 truncate block">{replyTo.text}</span>
              </div>
              <button onClick={() => setReplyTo(null)} className="p-1 rounded-full hover:bg-blue-100 text-gray-400"><X size={14} /></button>
            </div>
          )}
            <div className="flex items-end gap-2 px-3 py-2">
              <button className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-50 shrink-0"><Paperclip size={18} /></button>
              <div className="flex-1 min-h-[40px] bg-gray-50 rounded-2xl border border-gray-200 flex items-center px-3 py-1.5 focus-within:border-[#2b4c7e] focus-within:ring-1 focus-within:ring-[#2b4c7e]/20 transition-all">
                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
                  placeholder="Type a message..." type="text"
                  className="flex-1 bg-transparent text-[13px] text-gray-900 placeholder-gray-400 outline-none" />
                <button className="p-1 text-gray-400 hover:text-gray-600 ml-1"><Smile size={16} /></button>
              </div>
              <button onClick={send} disabled={!input.trim() || sending}
                className="p-2.5 rounded-full bg-[#2b4c7e] text-white shadow-md active:scale-95 transition-all disabled:opacity-40 shrink-0">
                <Send size={16} />
              </button>
            </div>
        </div>
      </div>
    );
  }

  // ──────────────── DESKTOP ────────────────
  return (
    <div className="w-full h-[100dvh] flex bg-white overflow-hidden">
      {/* sidebar */}
      <div className="w-80 xl:w-96 shrink-0 border-r border-slate-200 h-full flex flex-col">
        <div className="px-4 pt-4 pb-2 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-lg font-bold text-slate-900">Messages</h1>
            <button onClick={() => { setNewTab('team'); setShowNewChat(true); }} className="p-2 rounded-lg bg-[#2b4c7e] text-white shadow-sm hover:bg-[#1e3a5f] transition-all"><Plus size={16} /></button>
          </div>
          <p className="text-[10px] text-slate-400 font-medium">{currentUser}</p>
        </div>
        <div className="px-3 py-2 shrink-0 bg-white border-b border-slate-50">
          <div className="relative mb-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
              className="w-full h-9 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#2b4c7e] transition-all" />
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {[{ k: 'all', l: 'All' }, { k: 'unread', l: 'Unread' }, { k: 'team', l: 'Team' }, { k: 'sms', l: 'SMS' }].map(f => (
              <button key={f.k} onClick={() => setFilter(f.k)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap transition-all shrink-0 ${filter === f.k ? 'bg-[#1e3a5f] text-white' : 'bg-slate-100 text-slate-500'}`}>
                {f.l}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3"><MessageCircle size={22} className="text-slate-300" /></div>
              <p className="text-xs font-bold text-slate-500">No conversations</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {list.map(c => {
                const un = c.unread?.[uid] || 0;
                const clr = color(c.id);
                const n = convoName(c);
                const ini = initials(n);
                return (
                  <button key={c.id} onClick={() => { setActiveId(c.id); markRead(c.id); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all min-h-[56px] ${activeId === c.id ? 'bg-blue-50/80' : 'hover:bg-slate-50'}`}>
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: clr }}>{ini}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs truncate ${un > 0 ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>{n}</span>
                        <span className="text-[9px] text-slate-400 shrink-0 ml-1.5">{clock(c.lastMessageTime)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className={`text-[11px] truncate ${un > 0 ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>{c.lastMessage || 'No messages yet'}</span>
                        {un > 0 && <span className="shrink-0 ml-1.5 px-1.5 py-0.5 rounded-full bg-[#2b4c7e] text-white text-[8px] font-bold min-w-[16px] text-center">{un}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* main */}
      <div className="flex-1 h-full flex">
        {activeId ? (() => {
          const c = conversations.find(x => x.id === activeId);
          const other = (c?.participants || []).find(p => p !== uid);
          const otherN = name(other);
          const clr = color(activeId);
          return (
            <div className="w-full h-full flex flex-col">
              <div className="px-3 py-2.5 flex items-center gap-2 bg-white border-b border-gray-100 shrink-0">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: clr }}>{initials(otherN)}</div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-bold text-gray-900 truncate">{otherN}</h2>
                  <p className="text-[10px] text-gray-400 truncate">{c?.isTeamChat ? 'Team Chat' : 'Direct Message'}</p>
                </div>
              </div>
              <div ref={msgBox} data-chat-messages className="flex-1 overflow-y-auto px-0 py-2">
                {messages.map((msg, i) => {
                  const prev = messages[i - 1];
                  const showDate = !prev || !sameDay(prev.createdAt, msg.createdAt);
                  const isMe = msg.senderId === uid;
                  const senderName = name(msg.senderId);
                  const ini = initials(senderName);
                  return (
                    <React.Fragment key={msg.id}>
                      {showDate && (
                        <div className="flex justify-center py-2">
                          <span className="px-3 py-1 rounded-full bg-white border border-gray-100 text-[10px] font-semibold text-gray-400 shadow-sm">{dayLabel(msg.createdAt)}</span>
                        </div>
                      )}
                      <div className={`flex gap-2 px-3 py-0.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                        {!isMe && <div className="shrink-0 w-7 h-7 rounded-full bg-[#2b4c7e] flex items-center justify-center text-[8px] font-bold text-white mt-1">{ini}</div>}
                        <div className="max-w-[78%] min-w-[50px]">
                          {!isMe && <span className="text-[9px] font-semibold text-gray-400 ml-1 mb-0.5 block">{senderName}</span>}
                          <div onDoubleClick={() => setReplyTo(msg)}
                            className={`rounded-2xl px-3 py-2 shadow-sm text-[13px] leading-relaxed ${isMe ? 'bg-[#2b4c7e] text-white rounded-br-md' : 'bg-white border border-gray-100 text-gray-900 rounded-bl-md'}`}>
                            {msg.text}
                          </div>
                          <div className={`flex items-center gap-1 mt-0.5 ${isMe ? 'justify-end mr-1' : 'ml-1'}`}>
                            <span className="text-[9px] text-gray-400">{clock(msg.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
                <div ref={msgEnd} />
              </div>
              <div className="shrink-0 bg-white border-t border-gray-100">
                {replyTo && (
                  <div className="flex items-center gap-2 px-4 pt-2 pb-1 bg-blue-50/50 border-b border-blue-100">
                    <div className="flex-1 min-w-0">
                      <span className="text-[9px] font-bold text-blue-600 block">Replying to {name(replyTo.senderId)}</span>
                      <span className="text-[11px] text-gray-500 truncate block">{replyTo.text}</span>
                    </div>
                    <button onClick={() => setReplyTo(null)} className="p-1 rounded-full hover:bg-blue-100 text-gray-400"><X size={14} /></button>
                  </div>
                )}
                <div className="flex items-end gap-2 px-3 py-2">
                  <div className="flex-1 min-h-[40px] bg-gray-50 rounded-2xl border border-gray-200 flex items-center px-3 py-1.5 focus-within:border-[#2b4c7e] focus-within:ring-1 focus-within:ring-[#2b4c7e]/20 transition-all">
                    <input value={input} onChange={e => setInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
                      placeholder="Type a message..." type="text"
                      className="flex-1 bg-transparent text-[13px] text-gray-900 placeholder-gray-400 outline-none" />
                  </div>
                  <button onClick={send} disabled={!input.trim() || sending}
                    className="p-2.5 rounded-full bg-[#2b4c7e] text-white shadow-md active:scale-95 transition-all disabled:opacity-40 shrink-0">
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
          );
        })() : (
          <div className="flex flex-col items-center justify-center h-full bg-slate-50 px-6 text-center">
            <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mb-5"><MessageCircle size={36} className="text-[#2b4c7e]" /></div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Welcome to Chat</h2>
            <p className="text-xs text-slate-500 max-w-[280px] leading-relaxed mb-6">Select a conversation or start a new one.</p>
          </div>
        )}
      </div>

      {/* new chat modal */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowNewChat(false)} />
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 pb-3 pt-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">New Conversation</h2>
              <button onClick={() => setShowNewChat(false)} className="p-2 rounded-full hover:bg-gray-100 text-gray-400"><X size={20} /></button>
            </div>
            <div className="flex border-b border-gray-100 px-5">
              {[{ k: 'team', l: 'Team Chat' }, { k: 'sms', l: 'SMS' }].map(t => (
                <button key={t.k} onClick={() => setNewTab(t.k)}
                  className={`px-4 py-3 text-xs font-semibold border-b-2 transition-all ${newTab === t.k ? 'border-[#2b4c7e] text-[#2b4c7e]' : 'border-transparent text-gray-400'}`}>
                  {t.l}
                </button>
              ))}
            </div>
            <div className="p-5 max-h-[60vh] overflow-y-auto">
              {newTab === 'team' ? (
                <>
                  <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Group name (optional)"
                    className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#2b4c7e] mb-3" />
                  <div className="relative mb-3">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={newSearch} onChange={e => setNewSearch(e.target.value)} placeholder="Search people..."
                      className="w-full h-10 pl-9 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#2b4c7e]" />
                  </div>
                  <div className="space-y-1">
                    {[...drivers.map(d => ({ id: d.id, name: d.name || 'Driver', email: d.email || '' })), ...dispatchers.map(d => ({ id: d.id, name: d.name || 'Dispatcher', email: d.email || '' }))].filter(p => {
                      if (!newSearch) return true;
                      const s = newSearch.toLowerCase();
                      return p.name.toLowerCase().includes(s) || p.email.toLowerCase().includes(s);
                    }).map(p => (
                      <button key={p.id} onClick={() => setNewSelected(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all min-h-[48px] ${newSelected.includes(p.id) ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'}`}>
                        <div className="w-9 h-9 rounded-full bg-[#2b4c7e] flex items-center justify-center text-[10px] font-bold text-white">{initials(p.name)}</div>
                        <div className="flex-1 text-left min-w-0">
                          <span className="text-sm font-medium text-gray-800 block truncate">{p.name}</span>
                          {p.email && <span className="text-[10px] text-gray-400 block truncate">{p.email}</span>}
                        </div>
                        {newSelected.includes(p.id) && <span className="text-[#2b4c7e] text-xs font-bold">✓</span>}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name (optional)"
                    className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#2b4c7e] mb-3" />
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">+1</span>
                    <input value={newPhone} onChange={e => setNewPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="(555) 123-4567" type="tel"
                      className="w-full h-11 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#2b4c7e] font-medium tracking-wider" />
                  </div>
                </>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100">
              <button onClick={create} disabled={newTab === 'team' ? !newSelected.length : !newPhone.trim()}
                className="w-full h-12 rounded-xl bg-[#2b4c7e] text-white text-sm font-bold shadow-md active:scale-[0.98] transition-all disabled:opacity-40 min-h-[48px]">
                Start Conversation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
