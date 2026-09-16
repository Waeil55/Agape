import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Paperclip, Image, Mic, X, Check, Clock } from 'lucide-react';
import { 
  collection, query, orderBy, onSnapshot, limit, startAfter, 
  getDocs, addDoc, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { designTokens } from '../../utils/designTokens';
import { normalizeEmail } from '../../utils/accessControl';

const FALLBACK = () => <div className="flex items-center justify-center py-8"><div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>;

const formatMessageTime = (ts) => {
  if (!ts) return '';
  try {
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

const MessageThread = ({ 
  tripId, 
  messages: initialMessages = [], 
  loading, 
  currentUser = '', 
  role = 'dispatcher',
  onSend 
}) => {
  const tokens = designTokens;
  const [messages, setMessages] = useState(initialMessages);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadEarlier, setLoadEarlier] = useState(false);
  const messagesEndRef = useRef(null);
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    if (!tripId) return;
    if (unsubscribeRef.current) unsubscribeRef.current();

    const msgsQuery = query(
      collection(db, 'trips', tripId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    unsubscribeRef.current = onSnapshot(msgsQuery, (snapshot) => {
      const newMsgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
      setMessages(newMsgs);
      if (snapshot.docs.length > 0) setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === 50);
    }, (err) => console.error('[MessageThread] Error:', err));

    return () => { if (unsubscribeRef.current) unsubscribeRef.current(); };
  }, [tripId]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const handleSend = async () => {
    if (!newMessage.trim() || sending || !tripId) return;
    const text = newMessage.trim();
    setSending(true);
    setNewMessage('');
    try {
      await addDoc(collection(db, 'trips', tripId, 'messages'), {
        body: text,
        senderId: currentUser,
        senderRole: role,
        createdAt: serverTimestamp(),
      });
      scrollToBottom();
    } catch (err) {
      console.error('[MessageThread] Send error:', err);
      setNewMessage(text);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const loadMore = async () => {
    if (!tripId || !lastDoc || !hasMore || loading) return;
    setLoadEarlier(true);
    try {
      const msgsQuery = query(
        collection(db, 'trips', tripId, 'messages'),
        orderBy('createdAt', 'desc'),
        startAfter(lastDoc),
        limit(50)
      );
      const snapshot = await getDocs(msgsQuery);
      const older = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
      setMessages(prev => [...older, ...prev]);
      if (snapshot.docs.length > 0) setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === 50);
    } catch (err) {
      console.error('[MessageThread] Load more error:', err);
    } finally {
      setLoadEarlier(false);
    }
  };

  const isFromCurrentUser = (msg) => normalizeEmail(msg.senderId) === normalizeEmail(currentUser);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto space-y-3 pb-4" role="log" aria-live="polite" aria-label="Messages">
        {loading && !messages.length && <FALLBACK />}
        
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <MessageSquare size={24} className="text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-900">No messages yet</p>
            <p className="text-xs text-slate-500 mt-1">Start the conversation</p>
          </div>
        )}

        {hasMore && messages.length > 0 && (
          <button 
            onClick={loadMore}
            disabled={loadEarlier}
            className="mx-auto px-4 py-2 text-xs font-semibold text-blue-600 hover:text-blue-700"
          >
            {loadEarlier ? 'Loading…' : 'Load earlier messages'}
          </button>
        )}

        {messages.map((msg, index) => {
          const fromMe = isFromCurrentUser(msg);
          const time = formatMessageTime(msg.createdAt);
          const statusIcon = msg.readAt ? <Check size={12} className="text-blue-600" /> : <Clock size={12} className="text-slate-400" />;
          
          return (
            <div 
              key={msg.id || index} 
              className={`flex gap-2 ${fromMe ? 'flex-row-reverse' : ''}`}
            >
              {!fromMe && (
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 flex-col items-end">
                  <span className="text-[9px] font-bold text-blue-700">{msg.senderRole?.charAt(0) || 'D'}</span>
                </div>
              )}
              <div className={`max-w-[75%] ${fromMe ? 'items-end' : 'items-start'} flex flex-col`}>
                <div className={`flex items-end gap-1.5 ${fromMe ? 'flex-row-reverse' : ''}`}>
                  <div className={`rounded-2xl px-4 py-2 ${fromMe 
                    ? 'bg-blue-600 text-white rounded-tr-sm' 
                    : 'bg-white text-slate-900 border border-slate-200 rounded-tl-sm shadow-sm'
                  }`}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-400">
                    <span>{time}</span>
                    {fromMe && statusIcon}
                  </div>
                </div>
              </div>
              {fromMe && <div className="w-8" />}
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white p-3">
        <div className="flex items-end gap-2">
          <button type="button" className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 touch-manipulation" aria-label="Attach file">
            <Paperclip size={20} />
          </button>
          <button type="button" className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 touch-manipulation" aria-label="Attach photo">
            <Image size={20} />
          </button>
          <button type="button" className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 touch-manipulation" aria-label="Voice message">
            <Mic size={20} />
          </button>
          <div className="flex-1 relative">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message"
              rows={1}
              maxRows={5}
              className="w-full px-4 py-2.5 bg-slate-100 border-0 rounded-2xl text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none resize-none pr-12"
              aria-label="Message input"
            />
          </div>
          <button
            type="button"
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center touch-manipulation active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            {sending ? <Clock size={20} className="animate-spin" /> : <Send size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export { MessageThread };
export default React.memo(MessageThread);