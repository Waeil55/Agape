import React, { useState } from 'react';
import { X } from 'lucide-react';
import { IN_OUT_WAIT_MINUTES } from '../../utils/inOutTrips';

const to12hr = (time) => {
  if (!time) return '';
  const match = String(time).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return time;
  const h = parseInt(match[1], 10);
  const m = match[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
};

const formatTimeInput = (v) => {
  if (!v) return '';
  const s = String(v).trim();
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/i);
  if (!m) return '';
  let h = parseInt(m[1], 10);
  const min = (m[2] || '00').padStart(2, '0');
  const ap = (m[3] || '').toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:${min}`;
  return '';
};

const timeInputOrBlank = (value) => {
  const formatted = formatTimeInput(value);
  return /^\d{2}:\d{2}$/.test(formatted) ? formatted : '';
};

export default function ScheduleEditorModal({ trip, onSave, onClose }) {
  if (!trip) return null;

  const detectMode = (t) => {
    if (t?.urgentTrip) return 'urgent';
    if (t?.inOutTrip || t?.tripKind === 'IN_OUT') return 'inout';
    if (isWillCall(t)) return 'willcall';
    return 'time';
  };

  const isWillCall = (t) => {
    const time = String(t?.time || '').trim().toLowerCase();
    return !time || time === 'will call' || time === 'wc';
  };

  const deadlineBase = trip?.urgentDeadlineAt && !Number.isNaN(new Date(trip.urgentDeadlineAt).getTime())
    ? new Date(trip.urgentDeadlineAt)
    : new Date(Date.now() + 3 * 60 * 60000);

  const [draft, setDraft] = useState({
    mode: detectMode(trip),
    time: timeInputOrBlank(trip?.time),
    deadlineDate: trip?.urgentDeadlineDate || `${deadlineBase.getFullYear()}-${String(deadlineBase.getMonth() + 1).padStart(2, '0')}-${String(deadlineBase.getDate()).padStart(2, '0')}`,
    deadlineTime: trip?.urgentDeadlineTime || `${String(deadlineBase.getHours()).padStart(2, '0')}:${String(deadlineBase.getMinutes()).padStart(2, '0')}`,
    requiredWithinHours: trip?.urgentRequiredWithinHours || 3,
  });

  const [error, setError] = useState('');

  const updateDraft = (field, value) => {
    setDraft(prev => ({ ...prev, [field]: value }));
    setError('');
  };

  const applyWithinHours = () => {
    const hours = Number(draft.requiredWithinHours || 0);
    if (!Number.isFinite(hours) || hours <= 0) return;
    const d = new Date(Date.now() + hours * 60 * 60000);
    setDraft(prev => ({
      ...prev,
      deadlineDate: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      deadlineTime: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    }));
  };

  const handleSave = () => {
    const mode = draft.mode;
    const basePayload = {
      status: trip.status || 'Assigned',
      urgentTrip: false,
      urgentDeadlineAt: null,
      urgentDeadlineDate: null,
      urgentDeadlineTime: null,
      urgentRequiredWithinHours: null,
      priority: trip.priority === 'urgent' ? 'normal' : trip.priority || 'normal',
      tripKind: '',
      inOutTrip: false,
      inOutStayWithClient: false,
      inOutWaitMinutes: null,
      inOutGroupId: null,
      inOutGroupBookingId: null,
      inOutLeg: null,
      inOutPairBookingId: null,
      inOutPairTripId: null,
    };

    let payload = { ...basePayload };
    if (mode === 'time') {
      if (!draft.time) { setError('Choose a time before saving.'); return; }
      payload.time = draft.time;
    } else if (mode === 'willcall') {
      payload.time = 'Will Call';
      payload.tripKind = 'WILL_CALL';
    } else if (mode === 'inout') {
      payload.time = draft.time || '';
      payload.tripKind = 'IN_OUT';
      payload.inOutTrip = true;
      payload.inOutStayWithClient = true;
      payload.inOutWaitMinutes = IN_OUT_WAIT_MINUTES;
    } else if (mode === 'urgent') {
      if (!draft.deadlineDate || !draft.deadlineTime) { setError('Choose an urgent deadline date and time.'); return; }
      const deadline = new Date(`${draft.deadlineDate}T${draft.deadlineTime}`);
      if (Number.isNaN(deadline.getTime())) { setError('Use a valid urgent deadline.'); return; }
      payload.time = draft.time || trip.time || '';
      payload.tripKind = 'URGENT';
      payload.priority = 'urgent';
      payload.urgentTrip = true;
      payload.urgentDeadlineAt = deadline.toISOString();
      payload.urgentDeadlineDate = draft.deadlineDate;
      payload.urgentDeadlineTime = draft.deadlineTime;
      payload.urgentRequiredWithinHours = Number(draft.requiredWithinHours || 0) || null;
    }

    onSave(payload);
  };

  const countdownText = (() => {
    if (draft.mode !== 'urgent') return null;
    const deadline = draft.deadlineDate && draft.deadlineTime
      ? new Date(`${draft.deadlineDate}T${draft.deadlineTime}`)
      : null;
    if (!deadline || Number.isNaN(deadline.getTime())) return null;
    const diff = Math.ceil((deadline.getTime() - Date.now()) / 60000);
    const h = Math.floor(Math.abs(diff) / 60);
    const m = Math.abs(diff) % 60;
    const text = `${h ? `${h}h ` : ''}${m}m`;
    return diff < 0 ? `${text} late` : `${text} left`;
  })();

  return (
    <div className="fixed inset-0 z-[260] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Update trip schedule"
        className="max-h-[88vh] w-full overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-sm sm:rounded-3xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Update Trip Time</h3>
            <p className="text-[11px] text-slate-500 font-semibold">{trip.patient} #{trip.bookingId || trip.id}</p>
          </div>
          <button type="button" onClick={onClose} className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200">
            <X size={18} />
          </button>
        </header>

        <div className="max-h-[65vh] overflow-y-auto p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'time', label: 'Set Time', hint: 'Exact pickup time' },
              { id: 'willcall', label: 'Will Call', hint: 'No fixed time' },
              { id: 'inout', label: 'IN/OUT', hint: `Stay ${IN_OUT_WAIT_MINUTES} min` },
              { id: 'urgent', label: 'Urgent', hint: 'Deadline countdown' },
            ].map((mode) => {
              const active = draft.mode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => updateDraft('mode', mode.id)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-all ${active ? 'border-blue-500 bg-blue-50 text-blue-800 shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                >
                  <p className="text-xs font-bold uppercase tracking-wide">{mode.label}</p>
                  <p className="text-[10px] font-semibold opacity-70 mt-0.5">{mode.hint}</p>
                </button>
              );
            })}
          </div>

          {(draft.mode === 'time' || draft.mode === 'inout' || draft.mode === 'urgent') && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Pickup Time</label>
              <input
                type="time"
                value={draft.time || ''}
                onChange={(e) => updateDraft('time', e.target.value)}
                className="mt-1 w-full h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:bg-white"
              />
              {draft.mode === 'inout' && (
                <p className="mt-2 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-700">
                  IN/OUT keeps the related B leg stacked under A leg and tells the driver to stay with the client about {IN_OUT_WAIT_MINUTES} minutes.
                </p>
              )}
            </div>
          )}

          {draft.mode === 'willcall' && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">This trip will show as Will Call.</p>
              <p className="text-xs font-semibold text-slate-500 mt-1">It will stay separate from timed trips and can be changed back later.</p>
            </div>
          )}

          {draft.mode === 'urgent' && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-rose-600">Deadline Date</label>
                  <input type="date" value={draft.deadlineDate || ''} onChange={(e) => updateDraft('deadlineDate', e.target.value)}
                    className="mt-1 w-full h-10 rounded-xl border border-rose-100 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-rose-400" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-rose-600">Deadline Time</label>
                  <input type="time" value={draft.deadlineTime || ''} onChange={(e) => updateDraft('deadlineTime', e.target.value)}
                    className="mt-1 w-full h-10 rounded-xl border border-rose-100 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-rose-400" />
                </div>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-rose-600">Required Within Hours</label>
                  <input type="number" min="1" step="0.5" value={draft.requiredWithinHours || ''} onChange={(e) => updateDraft('requiredWithinHours', e.target.value)}
                    className="mt-1 w-full h-10 rounded-xl border border-rose-100 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-rose-400" placeholder="3" />
                </div>
                <button type="button" onClick={applyWithinHours} className="h-9 px-4 rounded-xl bg-rose-600 text-white text-xs font-bold">Apply</button>
              </div>
              {countdownText && (
                <p className="rounded-xl bg-white border border-rose-100 px-3 py-2 text-xs font-bold text-rose-700">
                  Countdown: {countdownText}
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>
          )}
        </div>

        <div className="flex gap-2 px-4 pb-4 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-all">Cancel</button>
          <button type="button" onClick={handleSave} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all">Save</button>
        </div>
      </section>
    </div>
  );
}
