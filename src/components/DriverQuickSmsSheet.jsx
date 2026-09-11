import { useMemo, useState } from 'react';
import { AlertCircle, MessageCircle, Send, Smartphone, X } from 'lucide-react';
import { resolveClientPhoneForTrip } from '../utils/clientPhoneResolution';
import {
  buildDriverQuickSmsText,
  QUICK_SMS_TEMPLATES,
  suggestedQuickSmsTemplateId,
} from '../utils/clientSms';
import { sendSMSWithBody } from '../utils/nativeActions';

const normalizePhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return '';
};

const formatPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return digits.length === 10
    ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    : value;
};

const DriverQuickSmsSheet = ({ trip, allTrips = [], onClose }) => {
  const [openingTemplateId, setOpeningTemplateId] = useState('');
  const [error, setError] = useState('');
  const phone = useMemo(
    () => normalizePhone(resolveClientPhoneForTrip(trip, allTrips)),
    [allTrips, trip],
  );
  const suggestedTemplateId = useMemo(() => suggestedQuickSmsTemplateId(trip), [trip]);

  const openMessages = async (template = null) => {
    if (!phone || openingTemplateId) return;
    const templateId = template?.id || 'blank';
    setOpeningTemplateId(templateId);
    setError('');
    try {
      const body = template ? buildDriverQuickSmsText(template, trip) : '';
      const opened = await sendSMSWithBody(phone, body, trip.patient || 'Client');
      if (!opened) throw new Error('The verified client phone number is unavailable.');
      onClose();
    } catch (openError) {
      setError(openError?.message || 'Your phone Messages app could not be opened.');
      setOpeningTemplateId('');
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center overflow-hidden md:items-center md:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <section
        aria-label={`Text ${trip.patient || 'client'} from this phone`}
        className="relative z-10 flex max-h-[82vh] min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-3xl rounded-b-none border border-slate-200 bg-white shadow-xl md:rounded-b-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-slate-100 bg-white px-4 pb-3 pt-2 md:pt-3">
          <div className="mb-2 flex justify-center md:hidden"><span className="h-1 w-10 rounded-full bg-slate-300" /></div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><Smartphone size={18} /></span>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-slate-900">Text {trip.patient || 'Client'}</h3>
                <p className="truncate text-xs font-medium text-slate-500">{phone ? formatPhone(phone) : 'Verified client phone required'}</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200" aria-label="Close quick messages"><X size={17} /></button>
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-800">
            <MessageCircle size={14} className="shrink-0" />
            <span>Opens your phone's Messages app. Review and tap Send there from your phone line.</span>
          </div>
        </header>

        <div data-scroll-region="driver-quick-sms" className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain p-3 pb-4" style={{ WebkitOverflowScrolling: 'touch' }}>
          {!phone && (
            <div role="alert" className="mb-2 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
              <AlertCircle size={15} className="mt-0.5 shrink-0" /> The client phone number is missing or needs dispatcher review.
            </div>
          )}
          {QUICK_SMS_TEMPLATES.map((template) => {
            const preview = buildDriverQuickSmsText(template, trip);
            const suggested = suggestedTemplateId === template.id;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => void openMessages(template)}
                disabled={!phone || Boolean(openingTemplateId)}
                className="flex w-full items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-emerald-200 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send size={15} className="mt-0.5 shrink-0 text-emerald-600" />
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
          <button
            type="button"
            onClick={() => void openMessages()}
            disabled={!phone || Boolean(openingTemplateId)}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            <MessageCircle size={15} /> Blank message
          </button>
          {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}
        </div>
      </section>
    </div>
  );
};

export default DriverQuickSmsSheet;
