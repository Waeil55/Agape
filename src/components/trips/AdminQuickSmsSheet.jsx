import React, { useState } from 'react';
import { X, Send, MessageSquare } from 'lucide-react';
import { QUICK_SMS_TEMPLATES, buildQuickSmsText, clientFirstName } from '../../utils/clientSms';

export default function AdminQuickSmsSheet({ trip, onSend, onClose }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  if (!trip) return null;

  const handleSend = async (template) => {
    setSending(true);
    setError('');
    try {
      const text = buildQuickSmsText(template, trip);
      await onSend(text, template);
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleBlankSend = async () => {
    setSending(true);
    setError('');
    try {
      const text = `Agape Care: Hi ${clientFirstName(trip)}, this is the dispatch team. How can we help? Reply STOP to opt out.`;
      await onSend(text, null);
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[260] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Quick SMS"
        className="max-h-[80vh] w-full overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-sm sm:rounded-3xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <MessageSquare size={17} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Quick SMS</h3>
              <p className="text-[11px] text-slate-500 font-semibold">{trip.patient} · {trip.phone || ''}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200">
            <X size={18} />
          </button>
        </header>

        <div className="max-h-[60vh] overflow-y-auto p-3 space-y-2">
          {QUICK_SMS_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => handleSend(template)}
              disabled={sending}
              className="w-full text-left rounded-xl border border-slate-200 bg-white px-3.5 py-3 hover:border-blue-300 hover:bg-blue-50/30 transition-all disabled:opacity-50"
            >
              <p className="text-xs font-bold text-slate-900">{template.label}</p>
              <p className="text-[11px] text-slate-500 font-semibold mt-0.5 line-clamp-2">
                {buildQuickSmsText(template, trip).substring(0, 100)}...
              </p>
            </button>
          ))}

          <button
            type="button"
            onClick={handleBlankSend}
            disabled={sending}
            className="w-full text-left rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3.5 py-3 hover:border-blue-300 hover:bg-blue-50/30 transition-all disabled:opacity-50"
          >
            <p className="text-xs font-bold text-slate-600">Blank message</p>
            <p className="text-[11px] text-slate-400 font-semibold mt-0.5">Send a custom text</p>
          </button>

          {error && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>
          )}
        </div>

        <div className="px-4 pb-4 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-all">Cancel</button>
        </div>
      </section>
    </div>
  );
}
