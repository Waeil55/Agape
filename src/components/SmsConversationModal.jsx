import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Loader2, MessageSquare, ChevronDown, ChevronUp, Phone } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, collection, query, where, orderBy, getDocs } from '../config/firebase';
import { limit } from 'firebase/firestore';

const DEFAULT_TEMPLATE = `Hi {patient}, this is Agape Care confirming your trip on {date} at {time}. Reply YES to confirm or NO to cancel. Call 317-777-7707 if you have questions.`;

const SmsConversationModal = ({ trip, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showTemplate, setShowTemplate] = useState(!messages.length);
  const bottomRef = useRef(null);

  const normalizePhone = (raw) => {
    if (!raw) return raw;
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
    if (digits.length === 10) return "+1" + digits;
    return "+" + digits;
  };
  const phone = normalizePhone(trip.patientPhone || trip.pickupPhone);

  const templatePreview = DEFAULT_TEMPLATE
    .replace(/\{patient\}/g, trip.patient || 'Client')
    .replace(/\{time\}/g, trip.time || '')
    .replace(/\{date\}/g, trip.date || '')
    .replace(/\{pickup\}/g, trip.pickup || '')
    .replace(/\{dropoff\}/g, trip.dropoff || '');

  useEffect(() => {
    if (!phone) { setLoading(false); return; }
    const fetch = async () => {
      try {
        const q1 = query(collection(db, 'smsLogs'), where('tripId', '==', trip.id), orderBy('timestamp', 'desc'), limit(50));
        const q2 = query(collection(db, 'smsLogs'), where('to', '==', phone), orderBy('timestamp', 'desc'), limit(50));
        const q3 = query(collection(db, 'smsLogs'), where('from', '==', phone), orderBy('timestamp', 'desc'), limit(50));
        const [s1, s2, s3] = await Promise.all([getDocs(q1), getDocs(q2), getDocs(q3)]);
        const seen = new Set();
        const all = [...s1.docs, ...s2.docs, ...s3.docs]
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(m => { const k = m.id || m.messageId; if (seen.has(k)) return false; seen.add(k); return true; })
          .sort((a, b) => {
            const ta = a.timestamp?.toMillis?.() || a.timestamp || 0;
            const tb = b.timestamp?.toMillis?.() || b.timestamp || 0;
            return ta - tb;
          });
        setMessages(all);
        if (all.length) setShowTemplate(false);
      } catch (e) { console.error('Failed to load SMS history:', e); }
      setLoading(false);
    };
    fetch();
  }, [trip.id, phone]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async (text) => {
    const msg = (text || replyText).trim();
    if (!msg || sending || !phone) return;
    setSending(true);
    try {
      const functions = getFunctions();
      const sendSms = httpsCallable(functions, 'sendSms');
      const res = await sendSms({ to: phone, text: msg, tripId: trip.id });
      if (res.data?.success) {
        setMessages(prev => [...prev, {
          id: 'pending-' + Date.now(),
          direction: 'outbound',
          to: phone,
          text: msg,
          timestamp: new Date().toISOString(),
          status: 'sent',
        }]);
        setReplyText('');
      }
    } catch (err) {
      console.error('Send failed:', err);
    }
    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = ts?.toMillis ? ts.toDate() : new Date(ts);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="bg-white w-full max-w-md rounded-3xl shadow-sm relative z-10 border border-slate-200 flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare size={16} className="text-blue-600 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 truncate">{trip.patient || 'Client'}</h3>
              <p className="text-[10px] text-slate-500">{phone || 'No phone'}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition shrink-0 min-h-[44px] min-w-[44px]"><X size={16} className="text-slate-500" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-[200px]">
          <button onClick={() => setShowTemplate(!showTemplate)} className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 transition-colors text-xs font-semibold">
            <span>Send confirmation message</span>
            {showTemplate ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showTemplate && (
            <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
              <p className="text-[10px] leading-relaxed text-slate-700 whitespace-pre-wrap">{templatePreview}</p>
              <button onClick={() => handleSend(templatePreview)} disabled={sending || !phone} className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white font-bold rounded-lg text-xs hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                Send confirmation
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 size={20} className="animate-spin text-slate-400" /></div>
          ) : messages.length === 0 ? (
            <div className="text-center py-6">
              <MessageSquare size={24} className="mx-auto text-slate-300 mb-2" />
              <p className="text-xs text-slate-400">No messages yet</p>
            </div>
          ) : (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 pt-1">History</p>
              {messages.map(m => (
                <div key={m.id || m.messageId} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${m.direction === 'outbound' ? 'bg-blue-600 text-white rounded-br-md' : 'bg-slate-100 text-slate-800 rounded-bl-md'}`}>
                    <p className="text-xs leading-relaxed whitespace-pre-wrap">{m.text}</p>
                    <p className={`text-[9px] mt-1 ${m.direction === 'outbound' ? 'text-blue-200' : 'text-slate-400'}`}>
                      {formatTime(m.timestamp)}
                      {m.direction === 'outbound' && (m.status === 'queued' ? ' | queued' : m.status === 'sent' ? ' | sent' : '')}
                    </p>
                  </div>
                </div>
              ))}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {phone && (
          <div className="border-t border-slate-100 p-3 shrink-0">
            <div className="flex items-center gap-2">
              <input
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a custom message..."
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 placeholder:text-slate-400"
              />
              <button onClick={() => handleSend()} disabled={!replyText.trim() || sending} className="p-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0">
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SmsConversationModal;
