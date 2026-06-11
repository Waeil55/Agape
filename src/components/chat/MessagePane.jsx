import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCheck, Info, Loader2, SendHorizonal, Smartphone } from 'lucide-react';
import {
  avatarColor,
  formatClock,
  formatDateDivider,
  getInitials,
  isDifferentDay,
  normalizeEmail,
  readableName,
  shouldGroupMessage,
} from '../../utils/chatUtils';

function messageText(message) {
  return message?.text || message?.message || '';
}

function senderName(message, contactsByEmail) {
  const email = normalizeEmail(message?.sender || message?.from || '');
  return contactsByEmail.get(email)?.name || readableName(email || 'System');
}

function DateDivider({ timestamp }) {
  return (
    <div className="sticky top-2 z-10 flex justify-center py-2 pointer-events-none">
      <span className="rounded-full bg-white/90 backdrop-blur px-3 py-1 text-[11px] font-black text-slate-500 shadow-sm border border-slate-200">
        {formatDateDivider(timestamp)}
      </span>
    </div>
  );
}

function MessageBubble({
  message,
  previous,
  currentUserEmail,
  contactsByEmail,
}) {
  const mine = normalizeEmail(message.sender || message.from) === normalizeEmail(currentUserEmail) || message.direction === 'outbound';
  const grouped = shouldGroupMessage(previous, message, currentUserEmail);
  const name = senderName(message, contactsByEmail);
  const text = messageText(message);

  return (
    <div className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-1' : 'mt-3'}`}>
      {!mine && (
        <div className={`w-8 h-8 rounded-full ${grouped ? 'invisible' : avatarColor(message.sender || name)} text-white flex items-center justify-center text-[11px] font-black shrink-0 mt-1`}>
          {getInitials(name)}
        </div>
      )}
      <div className={`max-w-[82%] sm:max-w-[70%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
        {!mine && !grouped && <span className="mb-1 px-1 text-[11px] font-bold text-slate-500">{name}</span>}
        <div
          className={`px-3.5 py-2.5 text-sm leading-relaxed shadow-sm break-words whitespace-pre-wrap ${
            mine
              ? 'rounded-2xl rounded-br-md bg-blue-600 text-white'
              : 'rounded-2xl rounded-bl-md bg-white text-slate-900 border border-slate-200'
          }`}
        >
          {text}
        </div>
        {!grouped && (
          <div className={`mt-1 flex items-center gap-1 px-1 text-[10px] font-bold ${mine ? 'text-blue-200' : 'text-slate-400'}`}>
            <span className={mine ? 'text-slate-400' : ''}>{formatClock(message.timestamp)}</span>
            {mine && <CheckCheck size={12} className="text-slate-400" />}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator({ typingUsers = [], contactsByEmail }) {
  if (typingUsers.length === 0) return null;
  const names = typingUsers.map(user => contactsByEmail.get(normalizeEmail(user.email))?.name || readableName(user.email));
  return (
    <div className="flex items-center gap-2 px-4 py-1 text-xs font-bold text-slate-500">
      <span>{names.slice(0, 2).join(', ')} {names.length > 1 ? 'are' : 'is'} typing</span>
      <span className="flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:120ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:240ms]" />
      </span>
    </div>
  );
}

export default function MessagePane({
  conversation,
  messages = [],
  currentUserEmail,
  contactsByEmail,
  title,
  subtitle,
  typingUsers,
  loading,
  loadingOlder,
  hasOlderMessages,
  sending,
  error,
  onBack,
  onInfo,
  onSend,
  onTyping,
  onLoadOlder,
}) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const previousMessageCountRef = useRef(0);

  const renderedMessages = useMemo(() => messages.filter(item => messageText(item)), [messages]);

  useEffect(() => {
    const countWentUp = renderedMessages.length > previousMessageCountRef.current;
    previousMessageCountRef.current = renderedMessages.length;
    if (!countWentUp) return;
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ block: 'end', behavior: renderedMessages.length < 4 ? 'auto' : 'smooth' });
    });
  }, [renderedMessages.length]);

  const submit = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    onTyping(false);
    try {
      await onSend(text);
    } catch {
      setDraft(text);
    }
  };

  const handleDraft = (event) => {
    setDraft(event.target.value);
    onTyping(event.target.value.trim().length > 0);
  };

  const isClient = !!conversation?.isClient;

  return (
    <main className="h-full min-h-0 w-full flex flex-col bg-[#f6f7fb]">
      <header className="h-[64px] shrink-0 bg-white/95 backdrop-blur border-b border-slate-200 px-3 sm:px-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          title="Back to inbox"
          className="md:hidden w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center"
        >
          <ArrowLeft size={20} />
        </button>
        <div className={`w-10 h-10 rounded-full ${isClient ? 'bg-emerald-600' : avatarColor(title)} text-white flex items-center justify-center font-black shrink-0`}>
          {isClient ? <Smartphone size={18} /> : getInitials(title)}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-base font-black text-slate-950">{title}</h2>
          <p className="truncate text-xs font-bold text-slate-500">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onInfo}
          title="Conversation details"
          className="ml-auto w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center"
        >
          <Info size={19} />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-5 py-3">
        {hasOlderMessages && (
          <div className="flex justify-center py-2">
            <button
              type="button"
              onClick={onLoadOlder}
              disabled={loadingOlder}
              className="h-9 px-3 rounded-full bg-white border border-slate-200 text-xs font-black text-slate-600 shadow-sm inline-flex items-center gap-2"
            >
              {loadingOlder && <Loader2 size={14} className="animate-spin" />}
              Load earlier
            </button>
          </div>
        )}

        {loading ? (
          <div className="h-full min-h-[320px] flex items-center justify-center">
            <div className="w-9 h-9 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" />
          </div>
        ) : renderedMessages.length === 0 ? (
          <div className="h-full min-h-[320px] flex items-center justify-center text-center p-8">
            <div className="max-w-sm">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-white border border-slate-200 text-slate-500 flex items-center justify-center shadow-sm">
                {isClient ? <Smartphone size={24} /> : <SendHorizonal size={24} />}
              </div>
              <h3 className="mt-4 text-base font-black text-slate-950">Start the conversation</h3>
              <p className="mt-2 text-sm font-semibold text-slate-500">Messages appear here instantly for everyone in this thread.</p>
            </div>
          </div>
        ) : (
          <div className="pb-2">
            {renderedMessages.map((message, index) => {
              const previous = renderedMessages[index - 1];
              const showDate = index === 0 || isDifferentDay(previous?.timestamp, message.timestamp);
              return (
                <React.Fragment key={message.id}>
                  {showDate && <DateDivider timestamp={message.timestamp} />}
                  <MessageBubble
                    message={message}
                    previous={previous}
                    currentUserEmail={currentUserEmail}
                    contactsByEmail={contactsByEmail}
                  />
                </React.Fragment>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <TypingIndicator typingUsers={typingUsers} contactsByEmail={contactsByEmail} />

      {error && (
        <div className="mx-3 sm:mx-5 mb-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
          {error}
        </div>
      )}

      <form
        onSubmit={submit}
        className="shrink-0 bg-white/95 backdrop-blur border-t border-slate-200 px-3 sm:px-4 pt-2 pb-[calc(12px+env(safe-area-inset-bottom,0px))] md:pb-3"
      >
        <div className="min-h-[46px] rounded-2xl bg-slate-100 border border-slate-200 flex items-end gap-2 p-1.5 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100">
          <textarea
            value={draft}
            onChange={handleDraft}
            onBlur={() => onTyping(false)}
            rows={1}
            placeholder={isClient ? 'Message client' : 'Message team'}
            className="max-h-28 min-h-[34px] flex-1 resize-none bg-transparent border-0 outline-none px-3 py-2 text-[16px] sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 leading-snug"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit(event);
              }
            }}
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            title="Send message"
            className="w-10 h-10 rounded-xl bg-blue-600 disabled:bg-slate-300 text-white flex items-center justify-center shrink-0"
          >
            {sending ? <Loader2 size={18} className="animate-spin" /> : <SendHorizonal size={18} />}
          </button>
        </div>
      </form>
    </main>
  );
}
