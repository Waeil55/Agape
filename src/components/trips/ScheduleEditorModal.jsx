import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  X, Clock, Calendar, AlertTriangle, CheckCircle2, Repeat, Copy,
  ChevronDown, ChevronUp, Timer, MapPin, Users, Layers, Settings,
  Trash2, Plus, Save, ArrowRight, Zap, Shield, Info, AlertCircle,
  RefreshCw, CalendarDays, MoveRight, Bookmark, Star, History, Phone,
} from 'lucide-react';
import { IN_OUT_WAIT_MINUTES } from '../../utils/inOutTrips';
import { tripCalendarDateKey, timeToMinutes } from '../../utils/tripDate';

// ============================================================================
// CONSTANTS
// ============================================================================

const SCHEDULE_MODES = Object.freeze([
  { id: 'time', label: 'Set Time', hint: 'Exact pickup time', icon: Clock, color: 'blue' },
  { id: 'willcall', label: 'Will Call', hint: 'No fixed time', icon: Phone, color: 'slate' },
  { id: 'inout', label: 'IN/OUT', hint: `Stay ${IN_OUT_WAIT_MINUTES} min`, icon: Timer, color: 'emerald' },
  { id: 'urgent', label: 'Urgent', hint: 'Deadline countdown', icon: Zap, color: 'rose' },
]);

const PRIORITY_LEVELS = Object.freeze([
  { id: 'low', label: 'Low', color: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-400' },
  { id: 'normal', label: 'Normal', color: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  { id: 'high', label: 'High', color: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  { id: 'urgent', label: 'Urgent', color: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
]);

const RECURRENCE_PATTERNS = Object.freeze([
  { id: 'none', label: 'No Repeat' },
  { id: 'daily', label: 'Every Day' },
  { id: 'weekdays', label: 'Weekdays (Mon-Fri)' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'biweekly', label: 'Every 2 Weeks' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'custom', label: 'Custom Pattern' },
]);

const BUFFER_PRESETS = Object.freeze([
  { label: 'None', value: 0 },
  { label: '5 min', value: 5 },
  { label: '10 min', value: 10 },
  { label: '15 min', value: 15 },
  { label: '20 min', value: 20 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '1 hr', value: 60 },
]);

const QUICK_TIMES = Object.freeze([
  '6:00 AM', '6:30 AM', '7:00 AM', '7:30 AM', '8:00 AM', '8:30 AM',
  '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM',
  '3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM', '5:00 PM', '5:30 PM',
  '6:00 PM', '6:30 PM', '7:00 PM', '7:30 PM', '8:00 PM',
]);

// ============================================================================
// UTILITIES
// ============================================================================

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

const timeToMinutesVal = (timeStr) => {
  if (!timeStr) return null;
  const clean = String(timeStr).trim();
  if (/will\s*call/i.test(clean)) return null;
  const match = clean.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ap = match[3]?.toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + m;
};

const minutesToTimeStr = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const addMinutesToTime = (timeStr, addMins) => {
  const base = timeToMinutesVal(timeStr);
  if (base === null) return timeStr;
  const newMin = Math.max(0, Math.min(1439, base + addMins));
  return minutesToTimeStr(newMin);
};

const isSameDay = (d1, d2) => d1 === d2;

const getRecurrenceEndDate = (startDate, pattern, count = 10) => {
  if (pattern === 'none' || !startDate) return startDate;
  const d = new Date(`${startDate}T12:00:00`);
  if (isNaN(d.getTime())) return startDate;
  switch (pattern) {
    case 'daily': d.setDate(d.getDate() + count); break;
    case 'weekdays': {
      let added = 0;
      while (added < count) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) added++; }
      break;
    }
    case 'weekly': d.setDate(d.getDate() + count * 7); break;
    case 'biweekly': d.setDate(d.getDate() + count * 14); break;
    case 'monthly': d.setMonth(d.getMonth() + count); break;
    default: d.setDate(d.getDate() + count); break;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ============================================================================
// CONFLICT DETECTION
// ============================================================================

function detectConflicts(draft, allTrips = [], currentTripId = null) {
  const conflicts = [];
  if (!draft.time || draft.mode === 'willcall') return conflicts;

  const newStart = timeToMinutesVal(draft.time);
  if (newStart === null) return conflicts;

  const newDate = draft.date || tripCalendarDateKey(new Date());
  const bufferMin = Number(draft.bufferMinutes || 0);
  const effectiveStart = Math.max(0, newStart - bufferMin);
  const effectiveEnd = Math.min(1439, newStart + (draft.mode === 'inout' ? IN_OUT_WAIT_MINUTES : 0) + bufferMin);

  for (const trip of allTrips) {
    if (trip.id === currentTripId) continue;
    if (trip.status === 'Cancelled' || trip.status === 'Completed' || trip.status === 'No Show') continue;

    const tripDate = tripCalendarDateKey(trip.date);
    if (tripDate !== newDate) continue;

    const tripTime = timeToMinutesVal(trip.time);
    if (tripTime === null) continue;

    const tripBuffer = 10;
    const tripStart = Math.max(0, tripTime - tripBuffer);
    const tripEnd = Math.min(1439, tripTime + tripBuffer);

    if (effectiveStart <= tripEnd && effectiveEnd >= tripStart) {
      const severity = (newStart >= tripStart && newStart <= tripEnd) ? 'direct' : 'proximity';
      conflicts.push({
        tripId: trip.id,
        patient: trip.patient || 'Unknown',
        bookingId: trip.bookingId || trip.id,
        time: trip.time,
        status: trip.status,
        severity,
      });
    }
  }

  return conflicts;
}

// ============================================================================
// RECURRING DATE GENERATOR
// ============================================================================

function generateRecurringDates(startDate, pattern, customDays = [], maxCount = 20) {
  if (!startDate || pattern === 'none') return [startDate];
  const dates = [];
  const d = new Date(`${startDate}T12:00:00`);
  if (isNaN(d.getTime())) return [startDate];

  let safety = 0;
  while (dates.length < maxCount && safety < 365) {
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayOfWeek = d.getDay();

    let include = false;
    switch (pattern) {
      case 'daily': include = true; break;
      case 'weekdays': include = dayOfWeek >= 1 && dayOfWeek <= 5; break;
      case 'weekly': include = dayOfWeek === (new Date(`${startDate}T12:00:00`)).getDay(); break;
      case 'biweekly': {
        const base = new Date(`${startDate}T12:00:00`);
        const diffDays = Math.floor((d - base) / 86400000);
        include = diffDays % 14 === 0;
        break;
      }
      case 'monthly': include = d.getDate() === new Date(`${startDate}T12:00:00`).getDate(); break;
      case 'custom': include = customDays.includes(dayOfWeek); break;
      default: include = true;
    }

    if (include) dates.push(dateStr);

    if (pattern === 'monthly') {
      d.setMonth(d.getMonth() + 1);
    } else {
      d.setDate(d.getDate() + 1);
    }
    safety++;
  }

  return dates;
}

// ============================================================================
// SCHEDULE TEMPLATES
// ============================================================================

const DEFAULT_TEMPLATES = Object.freeze([
  { id: 'morning-commute', name: 'Morning Commute', time: '07:00', mode: 'time', priority: 'normal', buffer: 15, recurrence: 'weekdays', notes: 'Standard morning pickup' },
  { id: 'medical-routine', name: 'Medical Routine', time: '09:30', mode: 'time', priority: 'normal', buffer: 20, recurrence: 'weekly', notes: 'Regular medical appointment' },
  { id: 'dialysis', name: 'Dialysis Session', time: '06:00', mode: 'time', priority: 'high', buffer: 30, recurrence: 'weekdays', notes: 'Dialysis - allow extra time' },
  { id: 'willcall-flex', name: 'Will Call Flexible', time: '', mode: 'willcall', priority: 'low', buffer: 0, recurrence: 'none', notes: 'Client will call when ready' },
  { id: 'urgent-response', name: 'Urgent Response', time: '', mode: 'urgent', priority: 'urgent', buffer: 10, recurrence: 'none', notes: 'Urgent dispatch - respond ASAP' },
  { id: 'inout-errand', name: 'IN/OUT Errand', time: '10:00', mode: 'inout', priority: 'normal', buffer: 15, recurrence: 'none', notes: 'Quick errand, driver stays' },
]);

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function ConflictBadge({ conflict }) {
  const isDirect = conflict.severity === 'direct';
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 ${isDirect ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}>
      <AlertTriangle size={14} className={`shrink-0 mt-0.5 ${isDirect ? 'text-rose-500' : 'text-amber-500'}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-bold ${isDirect ? 'text-rose-700' : 'text-amber-700'}`}>
          {isDirect ? 'Direct Conflict' : 'Proximity Warning'}
        </p>
        <p className="text-[11px] font-semibold text-slate-600 mt-0.5">
          {conflict.patient} (#{conflict.bookingId}) at {to12hr(conflict.time)} — {conflict.status}
        </p>
      </div>
    </div>
  );
}

function RecurrenceVisualizer({ pattern, startDate, customDays }) {
  const dates = useMemo(() => generateRecurringDates(startDate, pattern, customDays, 8), [startDate, pattern, customDays]);
  if (pattern === 'none' || !startDate) return null;

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-1.5">
        <Repeat size={12} className="text-indigo-500" />
        <span className="text-[11px] font-bold text-indigo-700">Recurring Schedule Preview</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {dates.slice(0, 7).map((d, i) => {
          const dateObj = new Date(`${d}T12:00:00`);
          const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
          const dayNum = dateObj.getDate();
          return (
            <span key={i} className="inline-flex items-center gap-1 rounded-lg bg-white border border-indigo-200 px-2 py-1 text-[10px] font-bold text-indigo-700">
              <CalendarDays size={10} /> {dayName} {dayNum}
            </span>
          );
        })}
        {dates.length > 7 && (
          <span className="inline-flex items-center rounded-lg bg-indigo-100 px-2 py-1 text-[10px] font-bold text-indigo-600">
            +{dates.length - 7} more
          </span>
        )}
      </div>
      <p className="text-[10px] font-semibold text-indigo-600">
        {dates.length} occurrences generated
      </p>
    </div>
  );
}

function QuickTimePicker({ selectedTime, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  const visibleTimes = expanded ? QUICK_TIMES : QUICK_TIMES.filter((_, i) => i % 2 === 0);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Quick Select</label>
        <button type="button" onClick={() => setExpanded(!expanded)} className="text-[10px] font-bold text-blue-600 flex items-center gap-0.5">
          {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          {expanded ? 'Less' : 'All times'}
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {visibleTimes.map((t) => {
          const isSelected = timeInputOrBlank(selectedTime) === timeInputOrBlank(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => onSelect(formatTimeInput(t))}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${isSelected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400 hover:text-blue-600'}`}
            >
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BufferTimeSelector({ value, onChange }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
        <Shield size={10} /> Travel Buffer
      </label>
      <div className="flex flex-wrap gap-1">
        {BUFFER_PRESETS.map((preset) => {
          const isActive = value === preset.value;
          return (
            <button
              key={preset.value}
              type="button"
              onClick={() => onChange(preset.value)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${isActive ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400'}`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] font-semibold text-slate-400">
        Adds {value} min buffer before/after to prevent overlap with adjacent trips.
      </p>
    </div>
  );
}

function BatchSchedulePanel({ trips, selectedIds, onApplyBatch }) {
  const [batchTime, setBatchTime] = useState('');
  const [batchMode, setBatchMode] = useState('time');
  const [batchBuffer, setBatchBuffer] = useState(10);

  const selectedTrips = useMemo(
    () => trips.filter(t => selectedIds.has(t.id)),
    [trips, selectedIds]
  );

  if (selectedTrips.length === 0) return null;

  return (
    <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/50 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <Layers size={14} className="text-indigo-600" />
        <span className="text-xs font-bold text-indigo-700">Batch Schedule ({selectedTrips.length} trips)</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-bold text-indigo-600 uppercase">Time</label>
          <input type="time" value={batchTime} onChange={(e) => setBatchTime(e.target.value)}
            className="mt-0.5 w-full h-9 rounded-lg border border-indigo-200 bg-white px-2 text-xs font-semibold outline-none focus:border-indigo-500" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-indigo-600 uppercase">Mode</label>
          <select value={batchMode} onChange={(e) => setBatchMode(e.target.value)}
            className="mt-0.5 w-full h-9 rounded-lg border border-indigo-200 bg-white px-2 text-xs font-semibold outline-none focus:border-indigo-500">
            {SCHEDULE_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
      </div>
      <BufferTimeSelector value={batchBuffer} onChange={setBatchBuffer} />
      <div className="flex gap-2">
        <button type="button" onClick={() => onApplyBatch({ time: batchTime, mode: batchMode, buffer: batchBuffer, trips: selectedTrips })}
          className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1.5">
          <MoveRight size={12} /> Apply to {selectedTrips.length} Trips
        </button>
      </div>
    </div>
  );
}

function ScheduleTemplatePicker({ onSelect, onClose }) {
  return (
    <div className="fixed inset-0 z-[270] flex items-end justify-center bg-slate-950/55 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Schedule templates"
        className="max-h-[80vh] w-full overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-sm sm:rounded-3xl"
        onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <Bookmark size={16} className="text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Schedule Templates</h3>
          </div>
          <button type="button" onClick={onClose} className="flex min-h-10 min-w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200">
            <X size={16} />
          </button>
        </header>
        <div className="max-h-[60vh] overflow-y-auto p-3 space-y-2">
          {DEFAULT_TEMPLATES.map((tmpl) => (
            <button key={tmpl.id} type="button" onClick={() => { onSelect(tmpl); onClose(); }}
              className="w-full text-left rounded-xl border border-slate-200 bg-white p-3 hover:border-indigo-400 hover:bg-indigo-50/30 transition-all space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">{tmpl.name}</span>
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{to12hr(tmpl.time) || tmpl.mode.toUpperCase()}</span>
              </div>
              <p className="text-[10px] font-semibold text-slate-500">{tmpl.notes}</p>
              <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400">
                <span>{tmpl.recurrence !== 'none' ? `Repeats: ${tmpl.recurrence}` : 'One-time'}</span>
                {tmpl.buffer > 0 && <span>· {tmpl.buffer}min buffer</span>}
                <span className={`px-1 py-0.5 rounded ${PRIORITY_LEVELS.find(p => p.id === tmpl.priority)?.color || ''}`}>{tmpl.priority}</span>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ScheduleEditorModal({
  trip,
  allTrips = [],
  onSave,
  onClose,
  onBatchSave,
  selectedBatchIds = new Set(),
}) {
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
    date: trip?.date || tripCalendarDateKey(new Date()) || '',
    priority: trip?.priority === 'urgent' ? 'urgent' : trip?.priority || 'normal',
    deadlineDate: trip?.urgentDeadlineDate || `${deadlineBase.getFullYear()}-${String(deadlineBase.getMonth() + 1).padStart(2, '0')}-${String(deadlineBase.getDate()).padStart(2, '0')}`,
    deadlineTime: trip?.urgentDeadlineTime || `${String(deadlineBase.getHours()).padStart(2, '0')}:${String(deadlineBase.getMinutes()).padStart(2, '0')}`,
    requiredWithinHours: trip?.urgentRequiredWithinHours || 3,
    bufferMinutes: trip?.scheduleBufferMinutes || 10,
    recurrence: trip?.recurrence || 'none',
    customDays: trip?.customRecurrenceDays || [1, 2, 3, 4, 5],
    notes: trip?.scheduleNotes || '',
    pickupAddress: trip?.pickup || '',
    dropoffAddress: trip?.dropoff || '',
    estimatedTravelMin: trip?.estimatedTravelMinutes || 0,
    editScope: 'one-time',
  });

  const [error, setError] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expandedSections, setExpandedSections] = useState({ time: true, conflict: true, recurrence: false, notes: false });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const conflicts = useMemo(
    () => detectConflicts(draft, allTrips, trip.id),
    [draft.time, draft.date, draft.bufferMinutes, draft.mode, allTrips, trip.id]
  );

  const hasConflicts = conflicts.length > 0;
  const directConflicts = conflicts.filter(c => c.severity === 'direct');

  const recurrencePreview = useMemo(
    () => generateRecurringDates(draft.date, draft.recurrence, draft.customDays, 10),
    [draft.date, draft.recurrence, draft.customDays]
  );

  const updateDraft = useCallback((field, value) => {
    setDraft(prev => ({ ...prev, [field]: value }));
    setError('');
    setSaved(false);
  }, []);

  const toggleSection = useCallback((section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const applyWithinHours = () => {
    const hours = Number(draft.requiredWithinHours || 0);
    if (!Number.isFinite(hours) || hours <= 0) return;
    const d = new Date(Date.now() + hours * 60 * 60000);
    updateDraft('deadlineDate', `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    updateDraft('deadlineTime', `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  };

  const applyTemplate = (template) => {
    updateDraft('mode', template.mode);
    updateDraft('time', template.time);
    updateDraft('priority', template.priority);
    updateDraft('bufferMinutes', template.buffer);
    updateDraft('recurrence', template.recurrence);
    updateDraft('notes', template.notes);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      if (draft.mode === 'time' && !draft.time) {
        setError('Choose a time before saving.');
        setSaving(false);
        return;
      }
      if (draft.mode === 'urgent') {
        if (!draft.deadlineDate || !draft.deadlineTime) {
          setError('Choose an urgent deadline date and time.');
          setSaving(false);
          return;
        }
        const deadline = new Date(`${draft.deadlineDate}T${draft.deadlineTime}`);
        if (Number.isNaN(deadline.getTime())) {
          setError('Use a valid urgent deadline.');
          setSaving(false);
          return;
        }
      }
      if (draft.mode === 'time' && directConflicts.length > 0) {
        setError(`Resolve ${directConflicts.length} direct conflict(s) before saving.`);
        setSaving(false);
        return;
      }

      const basePayload = {
        status: trip.status || 'Assigned',
        urgentTrip: false,
        urgentDeadlineAt: null,
        urgentDeadlineDate: null,
        urgentDeadlineTime: null,
        urgentRequiredWithinHours: null,
        priority: draft.priority === 'urgent' ? 'urgent' : draft.priority || 'normal',
        tripKind: '',
        inOutTrip: false,
        inOutStayWithClient: false,
        inOutWaitMinutes: null,
        inOutGroupId: null,
        inOutGroupBookingId: null,
        inOutLeg: null,
        inOutPairBookingId: null,
        inOutPairTripId: null,
        scheduleBufferMinutes: draft.bufferMinutes || 0,
        recurrence: draft.recurrence,
        customRecurrenceDays: draft.customDays,
        scheduleNotes: draft.notes,
        estimatedTravelMinutes: draft.estimatedTravelMin,
        saveAsProfile: draft.editScope === 'permanent',
        editScope: draft.editScope,
        permanentEdit: draft.editScope === 'permanent',
        oneTimeEdit: draft.editScope === 'one-time',
      };

      let payload = { ...basePayload };

      if (draft.mode === 'time') {
        payload.time = draft.time;
      } else if (draft.mode === 'willcall') {
        payload.time = 'Will Call';
        payload.tripKind = 'WILL_CALL';
      } else if (draft.mode === 'inout') {
        payload.time = draft.time || '';
        payload.tripKind = 'IN_OUT';
        payload.inOutTrip = true;
        payload.inOutStayWithClient = true;
        payload.inOutWaitMinutes = IN_OUT_WAIT_MINUTES;
      } else if (draft.mode === 'urgent') {
        const deadline = new Date(`${draft.deadlineDate}T${draft.deadlineTime}`);
        payload.time = draft.time || trip.time || '';
        payload.tripKind = 'URGENT';
        payload.priority = 'urgent';
        payload.urgentTrip = true;
        payload.urgentDeadlineAt = deadline.toISOString();
        payload.urgentDeadlineDate = draft.deadlineDate;
        payload.urgentDeadlineTime = draft.deadlineTime;
        payload.urgentRequiredWithinHours = Number(draft.requiredWithinHours || 0) || null;
      }

      await Promise.resolve(onSave(payload));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err?.message || 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
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

  const estimatedArrival = useMemo(() => {
    if (!draft.time || draft.mode === 'willcall') return null;
    const base = timeToMinutesVal(draft.time);
    if (base === null) return null;
    const travel = Number(draft.estimatedTravelMin || 0);
    const buffer = Number(draft.bufferMinutes || 0);
    const totalAdd = travel + buffer;
    if (totalAdd <= 0) return null;
    return to12hr(minutesToTimeStr(Math.min(1439, base + totalAdd)));
  }, [draft.time, draft.estimatedTravelMin, draft.bufferMinutes, draft.mode]);

  return (
    <div className="fixed inset-0 z-[260] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Enterprise schedule editor"
        className="max-h-[92vh] w-full overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-md sm:rounded-3xl flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <header className="shrink-0 flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-indigo-50/30 px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Schedule Editor</h3>
            <p className="text-[11px] text-slate-500 font-semibold">{trip.patient} #{trip.bookingId || trip.id}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setShowTemplates(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-all">
              <Bookmark size={11} /> Templates
            </button>
            <button type="button" onClick={onClose} className="flex min-h-10 min-w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200">
              <X size={16} />
            </button>
          </div>
        </header>

        {/* SCROLLABLE CONTENT */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 overscroll-contain touch-pan-y">

          {/* STATUS BAR */}
          <div className="flex items-center gap-2">
            {saved && (
              <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 animate-in fade-in">
                <CheckCircle2 size={12} className="text-emerald-500" />
                <span className="text-[11px] font-bold text-emerald-700">Saved</span>
              </div>
            )}
            {hasConflicts && (
              <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 ${directConflicts.length > 0 ? 'bg-rose-50 border border-rose-200' : 'bg-amber-50 border border-amber-200'}`}>
                <AlertTriangle size={12} className={directConflicts.length > 0 ? 'text-rose-500' : 'text-amber-500'} />
                <span className={`text-[11px] font-bold ${directConflicts.length > 0 ? 'text-rose-700' : 'text-amber-700'}`}>
                  {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>

          {/* EDIT SCOPE: ONE-TIME VS PERMANENT */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Apply Update As</label>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100/90 rounded-xl border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => updateDraft('editScope', 'one-time')}
                className={`py-2 px-2.5 rounded-lg text-center font-bold transition-all flex items-center justify-center gap-1.5 ${
                  draft.editScope === 'one-time'
                    ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>One-Time</span>
                <span className="text-[9px] font-medium opacity-70">(This trip)</span>
              </button>
              <button
                type="button"
                onClick={() => updateDraft('editScope', 'permanent')}
                className={`py-2 px-2.5 rounded-lg text-center font-bold transition-all flex items-center justify-center gap-1.5 ${
                  draft.editScope === 'permanent'
                    ? 'bg-white text-purple-700 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Permanent</span>
                <span className="text-[9px] font-medium opacity-70">(Client & future)</span>
              </button>
            </div>
          </div>

          {/* MODE SELECTOR */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Schedule Type</label>
            <div className="grid grid-cols-2 gap-1.5">
              {SCHEDULE_MODES.map((mode) => {
                const active = draft.mode === mode.id;
                const ModeIcon = mode.icon;
                return (
                  <button key={mode.id} type="button" onClick={() => updateDraft('mode', mode.id)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-all ${active ? `border-${mode.color}-500 bg-${mode.color}-50 shadow-sm` : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                    <div className="flex items-center gap-1.5">
                      <ModeIcon size={13} className={active ? `text-${mode.color}-600` : 'text-slate-400'} />
                      <p className="text-[11px] font-bold uppercase tracking-wide">{mode.label}</p>
                    </div>
                    <p className="text-[10px] font-semibold opacity-60 mt-0.5">{mode.hint}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* DATE & TIME */}
          {(draft.mode === 'time' || draft.mode === 'inout' || draft.mode === 'urgent') && (
            <div className="space-y-2.5">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Service Date</label>
                <input type="date" value={draft.date || ''} onChange={(e) => updateDraft('date', e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:bg-white" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Pickup Time</label>
                <input type="time" value={draft.time || ''} onChange={(e) => updateDraft('time', e.target.value)}
                  className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:bg-white" />
                {draft.mode === 'inout' && (
                  <p className="mt-1.5 rounded-lg bg-emerald-50 border border-emerald-100 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700">
                    IN/OUT: Driver stays with client ~{IN_OUT_WAIT_MINUTES} min. Related B leg stacked under A leg.
                  </p>
                )}
              </div>
              <QuickTimePicker selectedTime={draft.time} onSelect={(t) => updateDraft('time', t)} />
              {estimatedArrival && (
                <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-100 px-2.5 py-1.5">
                  <ArrowRight size={11} className="text-blue-500" />
                  <span className="text-[11px] font-bold text-blue-700">Est. arrival at destination: {estimatedArrival}</span>
                </div>
              )}
            </div>
          )}

          {draft.mode === 'willcall' && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <Info size={14} className="text-slate-500" />
                <p className="text-sm font-bold text-slate-900">Will Call Mode</p>
              </div>
              <p className="text-[11px] font-semibold text-slate-500">Trip shows as "Will Call" — no fixed time. Stays separate from timed trips. Can be changed back anytime.</p>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Service Date</label>
                <input type="date" value={draft.date || ''} onChange={(e) => updateDraft('date', e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500" />
              </div>
            </div>
          )}

          {/* URGENT PANEL */}
          {draft.mode === 'urgent' && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-rose-500" />
                <span className="text-xs font-bold text-rose-700">Urgent Deadline</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-rose-600 uppercase">Deadline Date</label>
                  <input type="date" value={draft.deadlineDate || ''} onChange={(e) => updateDraft('deadlineDate', e.target.value)}
                    className="mt-0.5 w-full h-9 rounded-lg border border-rose-200 bg-white px-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-rose-400" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-rose-600 uppercase">Deadline Time</label>
                  <input type="time" value={draft.deadlineTime || ''} onChange={(e) => updateDraft('deadlineTime', e.target.value)}
                    className="mt-0.5 w-full h-9 rounded-lg border border-rose-200 bg-white px-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-rose-400" />
                </div>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                <div>
                  <label className="text-[10px] font-bold text-rose-600 uppercase">Required Within (hrs)</label>
                  <input type="number" min="0.5" step="0.5" value={draft.requiredWithinHours || ''} onChange={(e) => updateDraft('requiredWithinHours', e.target.value)}
                    className="mt-0.5 w-full h-9 rounded-lg border border-rose-200 bg-white px-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-rose-400" placeholder="3" />
                </div>
                <button type="button" onClick={applyWithinHours} className="h-9 px-3 rounded-lg bg-rose-600 text-white text-[11px] font-bold hover:bg-rose-700 transition-colors">Apply</button>
              </div>
              {countdownText && (
                <div className="flex items-center gap-2 rounded-lg bg-white border border-rose-200 px-3 py-2">
                  <Timer size={13} className="text-rose-500" />
                  <span className="text-xs font-bold text-rose-700">Countdown: {countdownText}</span>
                </div>
              )}
            </div>
          )}

          {/* PRIORITY */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Priority Level</label>
            <div className="flex gap-1.5">
              {PRIORITY_LEVELS.map((p) => {
                const active = draft.priority === p.id;
                return (
                  <button key={p.id} type="button" onClick={() => updateDraft('priority', p.id)}
                    className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-bold border transition-all ${active ? p.color + ' shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                    <span className={`w-2 h-2 rounded-full ${p.dot}`} />
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* BUFFER TIME */}
          <BufferTimeSelector value={draft.bufferMinutes} onChange={(v) => updateDraft('bufferMinutes', v)} />

          {/* CONFLICTS */}
          {hasConflicts && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <AlertCircle size={10} /> Schedule Conflicts ({conflicts.length})
              </label>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {conflicts.map((c, i) => <ConflictBadge key={i} conflict={c} />)}
              </div>
            </div>
          )}

          {/* RECURRENCE */}
          <div className="space-y-2">
            <button type="button" onClick={() => toggleSection('recurrence')}
              className="flex items-center justify-between w-full text-left">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Repeat size={10} /> Recurrence
              </label>
              {expandedSections.recurrence ? <ChevronUp size={12} className="text-slate-400" /> : <ChevronDown size={12} className="text-slate-400" />}
            </button>
            {expandedSections.recurrence && (
              <div className="space-y-2 animate-in fade-in duration-150">
                <div className="flex flex-wrap gap-1">
                  {RECURRENCE_PATTERNS.map((rp) => {
                    const active = draft.recurrence === rp.id;
                    return (
                      <button key={rp.id} type="button" onClick={() => updateDraft('recurrence', rp.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400'}`}>
                        {rp.label}
                      </button>
                    );
                  })}
                </div>
                {draft.recurrence === 'custom' && (
                  <div className="flex gap-1">
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day, i) => {
                      const active = draft.customDays.includes(i);
                      return (
                        <button key={i} type="button" onClick={() => {
                          const newDays = active ? draft.customDays.filter(d => d !== i) : [...draft.customDays, i];
                          updateDraft('customDays', newDays);
                        }}
                          className={`w-9 h-9 rounded-lg text-[10px] font-bold border transition-all ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'}`}>
                          {day}
                        </button>
                      );
                    })}
                  </div>
                )}
                <RecurrenceVisualizer pattern={draft.recurrence} startDate={draft.date} customDays={draft.customDays} />
              </div>
            )}
          </div>

          {/* NOTES */}
          <div className="space-y-2">
            <button type="button" onClick={() => toggleSection('notes')}
              className="flex items-center justify-between w-full text-left">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Schedule Notes</label>
              {expandedSections.notes ? <ChevronUp size={12} className="text-slate-400" /> : <ChevronDown size={12} className="text-slate-400" />}
            </button>
            {expandedSections.notes && (
              <textarea value={draft.notes} onChange={(e) => updateDraft('notes', e.target.value)} rows={3}
                placeholder="Add scheduling notes, instructions, or special requirements..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-500 focus:bg-white resize-none" />
            )}
          </div>

          {/* BATCH SCHEDULE */}
          {selectedBatchIds.size > 0 && (
            <BatchSchedulePanel
              trips={allTrips}
              selectedIds={selectedBatchIds}
              onApplyBatch={(batch) => {
                if (onBatchSave) onBatchSave(batch);
              }}
            />
          )}

          {/* ERROR */}
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 flex items-start gap-2">
              <AlertCircle size={14} className="text-rose-500 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-rose-700">{error}</p>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="shrink-0 flex gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-3 border-t border-slate-100 bg-white">
          <button type="button" onClick={onClose}
            className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-all">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving || (draft.mode === 'time' && directConflicts.length > 0)}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
            {saving ? (
              <><RefreshCw size={13} className="animate-spin" /> Saving...</>
            ) : saved ? (
              <><CheckCircle2 size={13} /> Saved</>
            ) : (
              'Save Schedule'
            )}
          </button>
        </div>
      </section>

      {/* TEMPLATE PICKER MODAL */}
      {showTemplates && (
        <ScheduleTemplatePicker onSelect={applyTemplate} onClose={() => setShowTemplates(false)} />
      )}
    </div>
  );
}
