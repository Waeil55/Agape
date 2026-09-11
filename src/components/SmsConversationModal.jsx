import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Loader2,
  MessageCircle,
  MessageSquare,
  Send,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { limit } from 'firebase/firestore';
import {
  collection,
  db,
  onSnapshot,
  orderBy,
  query,
  where,
} from '../config/firebase';
import { resolveClientPhoneForTrip } from '../utils/clientPhoneResolution';
import {
  AGAPE_BUSINESS_SMS_NUMBER,
  buildQuickSmsText,
  businessSmsErrorPresentation,
  createSmsRequestId,
  prepareClientSmsText,
  QUICK_SMS_TEMPLATES,
  suggestedQuickSmsTemplateId,
} from '../utils/clientSms';

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return '';
}

function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMessageTime(value) {
  const millis = timestampMillis(value);
  if (!millis) return '';
  return new Date(millis).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function deliveryMeta(message) {
  if (message.direction !== 'outbound') return null;
  const status = String(message.status || 'queued').toLowerCase();
  if (['delivered', 'delivery_success'].includes(status)) {
    return { label: 'Delivered', icon: CheckCircle2, className: 'text-emerald-200' };
  }
  if (['failed', 'delivery_failed', 'delivery_unconfirmed', 'expired', 'undeliverable'].includes(status)) {
    return { label: 'Not delivered', icon: XCircle, className: 'text-rose-200' };
  }
  if (status === 'sent') return { label: 'Sent', icon: CheckCircle2, className: 'text-blue-200' };
  return { label: 'Queued', icon: Clock3, className: 'text-blue-200' };
}

function belongsToConversation(message, phone, tripId) {
  return message.conversationKey === phone
    || normalizePhone(message.from) === phone
    || normalizePhone(message.to) === phone
    || String(message.tripId || '') === String(tripId || '');
}

const SmsConversationModal = ({ trip, role, allTrips = [], onClose }) => {
  const phone = useMemo(
    () => normalizePhone(resolveClientPhoneForTrip(trip, allTrips)),
    [allTrips, trip],
  );
  const canUseBusinessSms = ['admin', 'dispatcher'].includes(String(role || '').toLowerCase());
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(Boolean(phone && canUseBusinessSms));
  const [loadError, setLoadError] = useState('');
  const [sendError, setSendError] = useState('');
  const [retryPayload, setRetryPayload] = useState(null);
  const [showTemplates, setShowTemplates] = useState(true);
  const bottomRef = useRef(null);
  const suggestedTemplateId = useMemo(() => suggestedQuickSmsTemplateId(trip), [trip]);

  useEffect(() => {
    if (!phone || !canUseBusinessSms) {
      return undefined;
    }

    const snapshots = new Map();
    const sources = [
      query(collection(db, 'smsLogs'), where('conversationKey', '==', phone), orderBy('timestamp', 'desc'), limit(100)),
      query(collection(db, 'smsLogs'), where('tripId', '==', trip.id), orderBy('timestamp', 'desc'), limit(100)),
      query(collection(db, 'smsLogs'), where('to', '==', phone), orderBy('timestamp', 'desc'), limit(100)),
      query(collection(db, 'smsLogs'), where('from', '==', phone), orderBy('timestamp', 'desc'), limit(100)),
    ];

    const publish = () => {
      const unique = new Map();
      snapshots.forEach((docs) => docs.forEach((message) => {
        if (belongsToConversation(message, phone, trip.id)) unique.set(message.id, message);
      }));
      setMessages([...unique.values()].sort((a, b) => timestampMillis(a.timestamp) - timestampMillis(b.timestamp)));
      setLoading(false);
    };

    const unsubscribes = sources.map((source, index) => onSnapshot(source, (snapshot) => {
      snapshots.set(index, snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
      publish();
    }, (error) => {
      console.error('[clientSms] Conversation listener failed:', error?.code || error?.message || error);
      setLoadError('Messages could not be loaded. Check your connection and try again.');
      setLoading(false);
    }));

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [canUseBusinessSms, phone, trip.id]);

  useEffect(() => {
    if (!canUseBusinessSms || !phone || !trip.id) return;
    const markClientSmsRead = httpsCallable(getFunctions(), 'markClientSmsRead');
    markClientSmsRead({ tripId: trip.id, phone }).catch((error) => {
      console.warn('[clientSms] Could not mark conversation read:', error?.code || error?.message || error);
    });
  }, [canUseBusinessSms, messages.length, phone, trip.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: loading ? 'auto' : 'smooth', block: 'end' });
  }, [loading, messages]);

  const sendPreparedMessage = async ({ text, requestId }) => {
    if (!canUseBusinessSms || !text || !requestId || sending || !phone) return;
    setSending(true);
    setSendError('');
    try {
      const sendClientSms = httpsCallable(getFunctions(), 'sendClientSms');
      const response = await sendClientSms({
        to: phone,
        text,
        tripId: trip.id,
        requestId,
      });
      if (!response.data?.success) throw new Error('The message was not accepted by the business SMS service.');
      setReplyText('');
      setRetryPayload(null);
      setShowTemplates(false);
    } catch (error) {
      const failure = businessSmsErrorPresentation(error);
      setRetryPayload(failure.retryable ? { text, requestId } : null);
      setSendError(failure.message);
    } finally {
      setSending(false);
    }
  };

  const handleSend = async (message) => {
    const preparedText = prepareClientSmsText(message ?? replyText, trip);
    if (!preparedText) return;
    const requestId = createSmsRequestId();
    await sendPreparedMessage({ text: preparedText, requestId });
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  if (!canUseBusinessSms) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center overflow-hidden md:items-center md:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <section
        aria-label={`SMS conversation with ${trip.patient || 'client'}`}
        className="relative z-10 flex max-h-[88dvh] min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-3xl rounded-b-none border border-slate-200 bg-white shadow-xl md:h-[min(82vh,760px)] md:rounded-b-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-slate-100 bg-white px-4 pb-3 pt-2 md:pt-3">
          <div className="mb-2 flex justify-center md:hidden"><span className="h-1 w-10 rounded-full bg-slate-300" /></div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><MessageSquare size={18} /></span>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-slate-900">{trip.patient || 'Client'}</h3>
                <p className="truncate text-xs font-medium text-slate-500">Agape Care business SMS {AGAPE_BUSINESS_SMS_NUMBER} · {phone || 'No verified client phone'}</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200" aria-label="Close SMS conversation"><X size={17} /></button>
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-800">
            <ShieldCheck size={14} className="shrink-0" />
            <span>Messages and client replies stay in this business conversation. Your personal iPhone Messages app is not used.</span>
          </div>
        </header>

        <div data-scroll-region="client-sms-conversation" className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-4" style={{ WebkitOverflowScrolling: 'touch' }}>
          <button type="button" onClick={() => setShowTemplates((value) => !value)} className="flex w-full items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100">
            <span>Quick messages</span>
            {showTemplates ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>

          {showTemplates && (
            <div className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-2">
              {QUICK_SMS_TEMPLATES.map((template) => {
                const preview = buildQuickSmsText(template, trip);
                const suggested = suggestedTemplateId === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => void handleSend(preview)}
                    disabled={sending || !phone}
                    className="flex w-full items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-left transition-colors hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <MessageCircle size={15} className="mt-0.5 shrink-0 text-blue-600" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-900">{template.label}</span>
                        {suggested && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">Suggested</span>}
                      </span>
                      <span className="mt-0.5 block text-[11px] font-medium leading-relaxed text-slate-500">{preview}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {loadError && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
              <AlertCircle size={15} className="mt-0.5 shrink-0" /> {loadError}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-slate-400" /></div>
          ) : messages.length === 0 ? (
            <div className="py-6 text-center">
              <MessageSquare size={25} className="mx-auto mb-2 text-slate-300" />
              <p className="text-xs font-semibold text-slate-500">No business messages yet</p>
              <p className="mt-1 text-[11px] font-medium text-slate-400">Choose a quick message or write one below.</p>
            </div>
          ) : (
            <>
              <p className="pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Conversation</p>
              {messages.map((message) => {
                const delivery = deliveryMeta(message);
                const DeliveryIcon = delivery?.icon;
                const outbound = message.direction === 'outbound';
                return (
                  <div key={message.id || message.messageId} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[84%] rounded-xl px-3.5 py-2 ${outbound ? 'rounded-br-md bg-blue-600 text-white' : 'rounded-bl-md bg-slate-100 text-slate-800'}`}>
                      <p className="whitespace-pre-wrap text-xs font-medium leading-relaxed">{message.text}</p>
                      <p className={`mt-1 flex items-center gap-1 text-[9px] font-semibold ${outbound ? delivery?.className || 'text-blue-200' : 'text-slate-400'}`}>
                        <span>{formatMessageTime(message.timestamp)}</span>
                        {delivery && <><span>·</span><DeliveryIcon size={10} /><span>{delivery.label}</span></>}
                      </p>
                      {outbound && delivery?.label === 'Not delivered' && (
                        <p className="mt-1 text-[10px] font-semibold text-rose-100">This message did not reach the client.</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        <footer className="shrink-0 border-t border-slate-100 bg-white p-3 pb-[calc(.75rem+env(safe-area-inset-bottom,0px))]">
          {sendError && (
            <div role="alert" className="mb-2 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p>{sendError}</p>
                {retryPayload && (
                  <button
                    type="button"
                    onClick={() => void sendPreparedMessage(retryPayload)}
                    disabled={sending}
                    className="mt-2 min-h-9 rounded-xl border border-rose-300 bg-white px-3 text-[11px] font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                  >
                    Retry same message
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={replyText}
              onChange={(event) => {
                setReplyText(event.target.value);
                setRetryPayload(null);
                setSendError('');
              }}
              onKeyDown={handleKeyDown}
              disabled={!phone || sending}
              placeholder={phone ? 'Write a message…' : 'Verified client phone required'}
              rows={2}
              className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 disabled:bg-slate-100"
            />
            <button type="button" onClick={() => void handleSend()} disabled={!replyText.trim() || sending || !phone} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send business SMS">
              {sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
            </button>
          </div>
          <p className="mt-1.5 text-[10px] font-medium text-slate-400">Agape Care identification and opt-out instructions are added automatically.</p>
        </footer>
      </section>
    </div>
  );
};

export default SmsConversationModal;
