import { useState, useMemo } from 'react';
import { X, Send, CheckCircle, AlertCircle, Loader2, MessageSquare } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { resolveClientPhoneForTrip } from '../utils/clientPhoneResolution';
import {
  businessSmsErrorMessage,
  createSmsRequestId,
  prepareClientSmsText,
} from '../utils/clientSms';

const DEFAULT_TEMPLATE = 'confirming your transportation on {date} at {time}. Please reply YES or NO. Call 317-777-7707 if you have questions.';

const fillTemplate = (template, trip) => prepareClientSmsText(
  template
    .replace(/\{patient\}/g, trip.patient || 'Client')
    .replace(/\{time\}/g, trip.time || '')
    .replace(/\{date\}/g, trip.date || '')
    .replace(/\{pickup\}/g, trip.pickup || '')
    .replace(/\{dropoff\}/g, trip.dropoff || ''),
  trip,
);

const SendSmsModal = ({ trips = [], onClose }) => {
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState(null);
  const [retryMessages, setRetryMessages] = useState([]);

  const previews = useMemo(() => {
    return trips.slice(0, 5).map(t => ({
      ...t,
      preview: fillTemplate(template, t),
    }));
  }, [trips, template]);

  const getClientPhone = (trip) => resolveClientPhoneForTrip(trip, trips);

  const canSend = trips.every(t => getClientPhone(t));

  const submitMessages = async (messages) => {
    if (!messages.length || sending) return;
    setSending(true);
    setResults(null);
    try {
      const functions = getFunctions();
      const sendBulkSms = httpsCallable(functions, 'sendBulkSms');
      const res = await sendBulkSms({ messages });
      const responseResults = Array.isArray(res.data?.results) ? res.data.results : [];
      setRetryMessages(messages.filter((_message, index) => responseResults[index]?.success === false));
      setResults(res.data || { success: false, error: 'Business SMS returned no result.' });
    } catch (err) {
      // The server may have accepted one or more messages before the response
      // was interrupted. Reuse these exact IDs so a retry cannot duplicate them.
      setRetryMessages(messages);
      setResults({ success: false, error: businessSmsErrorMessage(err) });
    } finally {
      setSending(false);
    }
  };

  const handleSend = async () => {
    if (!canSend || sending) return;
    const messages = trips.map(t => ({
      to: getClientPhone(t),
      text: fillTemplate(template, t),
      requestId: createSmsRequestId(),
      metadata: { tripId: t.id },
    }));
    await submitMessages(messages);
  };

  if (results) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="bg-white w-full max-w-md rounded-3xl shadow-sm relative z-10 border border-slate-200 p-6 text-center" onClick={e => e.stopPropagation()}>
          {results.error ? <AlertCircle size={40} className="mx-auto text-rose-500 mb-3" /> : <CheckCircle size={40} className="mx-auto text-emerald-500 mb-3" />}
          <h3 className="text-lg font-semibold text-slate-900 mb-1">{results.error || results.failed ? 'Messages need attention' : 'Messages Sent'}</h3>
          {results.sent !== undefined && <p className="text-sm text-slate-600 mb-4">{results.sent} sent, {results.failed} failed</p>}
          {results.error && <p className="text-sm text-rose-600 mb-4">{results.error}</p>}
          <div className="flex items-center justify-center gap-2">
            {retryMessages.length > 0 && (
              <button onClick={() => void submitMessages(retryMessages)} disabled={sending} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50">
                {sending ? 'Retrying…' : `Retry ${retryMessages.length} safely`}
              </button>
            )}
            <button onClick={onClose} className="px-6 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl text-sm hover:bg-slate-200">Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-sm relative z-10 border border-slate-200 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3.5 flex items-center justify-between z-10 rounded-t-3xl">
          <div className="flex items-center gap-2"><MessageSquare size={16} className="text-blue-600" /><h3 className="text-sm font-semibold text-slate-900">Send Confirmation</h3></div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-50 transition-colors"><X size={16} className="text-slate-500" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Message Template</p>
            <textarea value={template} onChange={e => setTemplate(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none" rows={4} />
            <p className="text-[10px] text-slate-400 mt-1">Use {'{patient}'}, {'{time}'}, {'{date}'}, {'{pickup}'}, {'{dropoff}'}. Agape Care identification and opt-out text are added automatically.</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Recipients ({trips.length})</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {previews.map((t, i) => (
                <div key={t.id || i} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-black text-blue-700 shrink-0">{(t.patient || '?')[0]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5"><p className="text-xs font-semibold text-slate-900">{t.patient}</p><span className="text-[9px] text-slate-400">{getClientPhone(t)}</span></div>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{t.preview}</p>
                  </div>
                </div>
              ))}
              {trips.length > 5 && <p className="text-[10px] text-slate-400 text-center py-1">...and {trips.length - 5} more</p>}
            </div>
          </div>
          {!canSend && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[10px] font-medium text-amber-800">Some trips are missing phone numbers.</p>
            </div>
          )}
          <button onClick={handleSend} disabled={sending || !canSend} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-bold rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {sending ? 'Sending...' : `Send to ${trips.length} recipient${trips.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SendSmsModal;
