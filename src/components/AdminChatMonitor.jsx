import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Search, MessageCircle, ChevronRight } from 'lucide-react';
import { getInitials, getAvatarColor, formatChatTime } from '../utils/chatHelpers';

const normalizeEmail = (e) => String(e || '').trim().toLowerCase();

const AdminChatMonitor = () => {
  const [channels, setChannels] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'chat_channels'), where('type', '==', 'dm'));
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const ta = a.lastMessageAt?.toMillis?.() || 0;
        const tb = b.lastMessageAt?.toMillis?.() || 0;
        return tb - ta;
      });
      setChannels(list);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!selectedChannel) { setMessages([]); return; }
    const q = query(
      collection(db, 'chat_messages'),
      where('channelId', '==', selectedChannel),
      orderBy('timestamp', 'desc'),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      list.reverse();
      setMessages(list);
    }, () => setMessages([]));
    return () => unsub();
  }, [selectedChannel]);

  const filtered = useMemo(() => {
    if (!search.trim()) return channels;
    const s = search.toLowerCase();
    return channels.filter(c => {
      const participants = (c.participantIds || []).join(' ');
      const name = c.name || '';
      const last = c.lastMessage || '';
      return participants.includes(s) || name.toLowerCase().includes(s) || last.toLowerCase().includes(s);
    });
  }, [channels, search]);

  const getChannelTitle = (ch) => {
    const participants = (ch.participantIds || ch.dmParticipants || []);
    return ch.name || participants[0]?.split('@')[0] || 'Unknown';
  };

  const getChannelEmail = (ch) => {
    const participants = (ch.participantIds || ch.dmParticipants || []);
    return participants[0] || '';
  };

  return (
    <div className="flex flex-col h-[60vh] min-h-[400px]">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search conversations..." className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
        </div>
        <span className="text-[10px] font-semibold text-slate-400 shrink-0">{channels.length} chats</span>
      </div>

      <div className="flex flex-1 min-h-0 gap-3">
        {/* Channel list */}
        <div className="w-full sm:w-80 shrink-0 overflow-y-auto rounded-xl border border-slate-100 bg-white divide-y divide-slate-50">
          {loading && <p className="text-xs text-slate-400 text-center py-8">Loading...</p>}
          {!loading && filtered.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-8">No conversations found</p>
          )}
          {filtered.map(ch => {
            const email = getChannelEmail(ch);
            const title = getChannelTitle(ch);
            const isSelected = selectedChannel === ch.id;
            const lastTime = ch.lastMessageAt?.toDate?.();
            return (
              <button key={ch.id} onClick={() => setSelectedChannel(ch.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                <div className={`w-10 h-10 rounded-full ${getAvatarColor(email)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                  {getInitials(title)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className={`text-sm truncate font-semibold ${isSelected ? 'text-slate-900' : 'text-slate-800'}`}>{title}</p>
                    {lastTime && <span className="text-[10px] text-slate-400 shrink-0 ml-2">{formatChatTime(ch.lastMessageAt)}</span>}
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{ch.lastMessage || 'No messages yet'}</p>
                </div>
                <ChevronRight size={14} className="text-slate-300 shrink-0" />
              </button>
            );
          })}
        </div>

        {/* Message view (desktop only) */}
        <div className="hidden sm:flex flex-1 flex-col min-h-0 rounded-xl border border-slate-100 bg-slate-50">
          {!selectedChannel && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
              <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center text-blue-500 mb-3">
                <MessageCircle size={28} />
              </div>
              <p className="text-sm font-semibold text-slate-600">Select a conversation</p>
              <p className="text-xs text-slate-400 mt-1">Read-only view of all employee chats</p>
            </div>
          )}
          {selectedChannel && (
            <>
              <div className="shrink-0 bg-white border-b border-slate-200 px-4 py-2.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                  {getInitials(getChannelTitle(channels.find(c => c.id === selectedChannel)))}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{getChannelTitle(channels.find(c => c.id === selectedChannel))}</p>
                  <p className="text-[10px] text-slate-400">Read-only</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {messages.map(msg => {
                  const isSystem = msg.type === 'system';
                  return (
                    <div key={msg.id} className="flex justify-start">
                      <div className={`max-w-[75%] px-3 py-2 rounded-xl text-sm ${isSystem ? 'bg-slate-200 text-slate-600 text-xs italic mx-auto' : 'bg-white shadow-sm text-slate-800'}`}>
                        {!isSystem && <p className="text-[10px] font-semibold text-slate-500 mb-0.5">{msg.senderName || msg.senderEmail}</p>}
                        <p className="break-words">{msg.text}</p>
                        {msg.fileUrl && <p className="text-xs text-blue-500 mt-1 underline">📎 Attachment</p>}
                      </div>
                    </div>
                  );
                })}
                {messages.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-8">No messages in this conversation</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminChatMonitor;
