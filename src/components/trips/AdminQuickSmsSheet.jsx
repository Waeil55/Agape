import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  X, Send, MessageSquare, Clock, CheckCircle2, AlertCircle, Phone, User,
  ChevronDown, ChevronUp, Search, MoreHorizontal, Trash2, Edit2, Copy,
  Star, Archive, RefreshCw, Bell, BellOff, Timer, Users, Hash, Settings,
  Eye, EyeOff, RotateCcw, ArrowUpRight, Download, Filter, Calendar,
  Zap, Shield, Info, AlertTriangle, MessageCircle, Reply, Forward,
} from 'lucide-react';
import { QUICK_SMS_TEMPLATES, buildQuickSmsText, clientFirstName, prepareClientSmsText } from '../../utils/clientSms';

// ============================================================================
// CONSTANTS
// ============================================================================

const MESSAGE_CATEGORIES = Object.freeze([
  { id: 'all', label: 'All', icon: MessageSquare },
  { id: 'sent', label: 'Sent', icon: ArrowUpRight },
  { id: 'scheduled', label: 'Scheduled', icon: Clock },
  { id: 'failed', label: 'Failed', icon: AlertCircle },
  { id: 'starred', label: 'Starred', icon: Star },
]);

const DELIVERY_STATUSES = Object.freeze({
  pending: { label: 'Pending', color: 'bg-slate-100 text-slate-600', icon: Clock },
  sent: { label: 'Sent', color: 'bg-blue-50 text-blue-700', icon: ArrowUpRight },
  delivered: { label: 'Delivered', color: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
  read: { label: 'Read', color: 'bg-indigo-50 text-indigo-700', icon: Eye },
  failed: { label: 'Failed', color: 'bg-rose-50 text-rose-700', icon: AlertCircle },
  scheduled: { label: 'Scheduled', color: 'bg-amber-50 text-amber-700', icon: Timer },
  cancelled: { label: 'Cancelled', color: 'bg-slate-100 text-slate-500', icon: X },
});

const MESSAGE_VARIABLES = Object.freeze([
  { key: '{{patient_name}}', label: 'Patient Name', example: 'John' },
  { key: '{{patient_full}}', label: 'Patient Full Name', example: 'John Smith' },
  { key: '{{booking_id}}', label: 'Booking ID', example: 'BK-12345' },
  { key: '{{pickup_time}}', label: 'Pickup Time', example: '9:30 AM' },
  { key: '{{pickup_address}}', label: 'Pickup Address', example: '123 Main St' },
  { key: '{{dropoff_address}}', label: 'Dropoff Address', example: '456 Oak Ave' },
  { key: '{{driver_name}}', label: 'Driver Name', example: 'Mike D.' },
  { key: '{{vehicle}}', label: 'Vehicle', example: 'Van #7' },
  { key: '{{trip_date}}', label: 'Trip Date', example: 'Sep 14, 2026' },
  { key: '{{company_name}}', label: 'Company', example: 'Agape Care' },
  { key: '{{phone}}', label: 'Business Phone', example: '(855) 222-3330' },
]);

const ESCALATION_RULES = Object.freeze([
  { id: 'none', label: 'No Escalation', description: 'Message only, no follow-up' },
  { id: 'no-reply-30m', label: 'No Reply in 30 min', description: 'Escalate to dispatcher if no reply' },
  { id: 'no-reply-1h', label: 'No Reply in 1 Hour', description: 'Escalate to supervisor' },
  { id: 'no-reply-2h', label: 'No Reply in 2 Hours', description: 'Emergency escalation' },
  { id: 'failed-retry', label: 'Auto-Retry on Failure', description: 'Retry up to 3 times with 5min delay' },
]);

const QUICK_SMS_EXTENDED = Object.freeze([
  ...QUICK_SMS_TEMPLATES,
  { id: 'delay-notify', label: 'Delay Notification', body: "there's a delay with your transportation. Your driver will arrive as soon as possible. We apologize for the inconvenience.", driverBody: "There's a delay with your transportation. I'll arrive as soon as possible. Sorry for the wait." },
  { id: 'route-change', label: 'Route Change', body: "your pickup location has been updated. Please check your new pickup address.", driverBody: "Your pickup location has been updated. Please check the new address." },
  { id: 'schedule-change', label: 'Schedule Changed', body: "your transportation time has been changed. Please reply to confirm the new time.", driverBody: "Your transportation time has been changed. Please reply to confirm." },
  { id: 'cancellation', label: 'Trip Cancelled', body: "your scheduled transportation has been cancelled. Please contact us if you have questions.", driverBody: "Your scheduled transportation has been cancelled. Call us if you need help." },
  { id: 'return-pickup', label: 'Return Pickup', body: "your return transportation is ready. Please be ready for pickup at the designated time.", driverBody: "Your return transportation is ready. Please be ready at the designated time." },
  { id: 'weather-alert', label: 'Weather Alert', body: "due to weather conditions, your transportation may be delayed. We'll keep you updated.", driverBody: "Due to weather, your transportation may be delayed. I'll keep you updated." },
  { id: 'custom', label: 'Custom Message', body: '', driverBody: '' },
]);

// ============================================================================
// UTILITIES
// ============================================================================

const interpolateVariables = (text, trip = {}, extraVars = {}) => {
  let result = text;
  const vars = {
    '{{patient_name}}': clientFirstName(trip),
    '{{patient_full}}': trip.patient || trip.clientName || '',
    '{{booking_id}}': trip.bookingId || trip.id || '',
    '{{pickup_time}}': trip.time || '',
    '{{pickup_address}}': trip.pickup || '',
    '{{dropoff_address}}': trip.dropoff || '',
    '{{driver_name}}': trip.driverName || '',
    '{{vehicle}}': trip.completedVehicle || '',
    '{{trip_date}}': trip.date || '',
    '{{company_name}}': 'Agape Care',
    '{{phone}}': '+1 (855) 222-3330',
    ...extraVars,
  };
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(key).join(value || key);
  }
  return result;
};

const formatTimestamp = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatScheduledTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function DeliveryStatusBadge({ status }) {
  const info = DELIVERY_STATUSES[status] || DELIVERY_STATUSES.pending;
  const Icon = info.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${info.color}`}>
      <Icon size={10} />
      {info.label}
    </span>
  );
}

function VariablePicker({ onSelect, onClose }) {
  return (
    <div className="fixed inset-0 z-[270] flex items-end justify-center bg-slate-950/55 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Insert variable"
        className="max-h-[70vh] w-full overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-sm sm:rounded-3xl"
        onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <Hash size={14} className="text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Insert Variable</h3>
          </div>
          <button type="button" onClick={onClose} className="flex min-h-10 min-w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200">
            <X size={16} />
          </button>
        </header>
        <div className="max-h-[55vh] overflow-y-auto p-3 space-y-1.5">
          <p className="text-[11px] font-semibold text-slate-500 px-1">Variables are replaced with real data when the message is sent.</p>
          {MESSAGE_VARIABLES.map((v) => (
            <button key={v.key} type="button" onClick={() => { onSelect(v.key); onClose(); }}
              className="w-full text-left rounded-xl border border-slate-200 bg-white p-2.5 hover:border-indigo-400 hover:bg-indigo-50/30 transition-all flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-900">{v.label}</p>
                <p className="text-[10px] font-semibold text-slate-400 font-mono">{v.key}</p>
              </div>
              <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{v.example}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function SchedulePicker({ value, onChange, onClose }) {
  const [date, setDate] = useState(() => {
    if (!value) return '';
    const d = new Date(value);
    return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [time, setTime] = useState(() => {
    if (!value) return '';
    const d = new Date(value);
    return isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });

  const handleConfirm = () => {
    if (!date || !time) return;
    const dt = new Date(`${date}T${time}`);
    if (!isNaN(dt.getTime())) {
      onChange(dt.toISOString());
      onClose();
    }
  };

  const quickSchedule = (minutesFromNow) => {
    const d = new Date(Date.now() + minutesFromNow * 60000);
    onChange(d.toISOString());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[270] flex items-end justify-center bg-slate-950/55 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Schedule message"
        className="max-h-[70vh] w-full overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-sm sm:rounded-3xl"
        onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <Timer size={14} className="text-amber-600" />
            <h3 className="text-sm font-bold text-slate-900">Schedule Message</h3>
          </div>
          <button type="button" onClick={onClose} className="flex min-h-10 min-w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200">
            <X size={16} />
          </button>
        </header>
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => quickSchedule(5)} className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-700 hover:bg-amber-100 transition-colors">In 5 min</button>
            <button onClick={() => quickSchedule(15)} className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-700 hover:bg-amber-100 transition-colors">In 15 min</button>
            <button onClick={() => quickSchedule(30)} className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-700 hover:bg-amber-100 transition-colors">In 30 min</button>
            <button onClick={() => quickSchedule(60)} className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-700 hover:bg-amber-100 transition-colors">In 1 hour</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="mt-0.5 w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-sm font-semibold outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Time</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                className="mt-0.5 w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-sm font-semibold outline-none focus:border-amber-500" />
            </div>
          </div>
          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-all">Cancel</button>
            <button type="button" onClick={handleConfirm} disabled={!date || !time}
              className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
              <Clock size={13} /> Schedule
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function EscalationConfig({ value, onChange }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
        <Zap size={10} /> Escalation Rule
      </label>
      <div className="space-y-1">
        {ESCALATION_RULES.map((rule) => {
          const active = value === rule.id;
          return (
            <button key={rule.id} type="button" onClick={() => onChange(rule.id)}
              className={`w-full text-left rounded-xl border p-2.5 transition-all ${active ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">{rule.label}</span>
                {active && <CheckCircle2 size={12} className="text-indigo-500" />}
              </div>
              <p className="text-[10px] font-semibold text-slate-500 mt-0.5">{rule.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MessageHistoryItem({ message, trip, onResend, onCopy }) {
  const status = message.status || 'sent';
  const statusInfo = DELIVERY_STATUSES[status] || DELIVERY_STATUSES.sent;

  return (
    <div className={`rounded-xl border p-3 space-y-2 transition-all ${status === 'failed' ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <DeliveryStatusBadge status={status} />
          {message.starred && <Star size={11} className="text-amber-400 fill-amber-400 shrink-0" />}
        </div>
        <span className="text-[10px] font-semibold text-slate-400 shrink-0">{formatTimestamp(message.sentAt || message.createdAt)}</span>
      </div>
      <p className="text-[11px] font-semibold text-slate-700 leading-relaxed">{message.body || message.text || ''}</p>
      {message.scheduledFor && status === 'scheduled' && (
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-600">
          <Clock size={10} /> Scheduled for {formatScheduledTime(message.scheduledFor)}
        </div>
      )}
      {message.escalation && message.escalation !== 'none' && (
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600">
          <Zap size={10} /> Escalation: {ESCALATION_RULES.find(r => r.id === message.escalation)?.label || message.escalation}
        </div>
      )}
      {message.error && (
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-rose-600">
          <AlertCircle size={10} /> {message.error}
        </div>
      )}
      <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
        <button onClick={() => onCopy(message.body || message.text || '')} className="px-2 py-1 rounded-lg bg-slate-100 text-[10px] font-bold text-slate-600 hover:bg-slate-200 transition-colors flex items-center gap-1">
          <Copy size={10} /> Copy
        </button>
        {status === 'failed' && (
          <button onClick={() => onResend(message)} className="px-2 py-1 rounded-lg bg-blue-50 text-[10px] font-bold text-blue-700 hover:bg-blue-100 transition-colors flex items-center gap-1">
            <RotateCcw size={10} /> Retry
          </button>
        )}
        <div className="flex-1" />
        {message.readAt && (
          <span className="text-[10px] font-semibold text-indigo-500 flex items-center gap-0.5">
            <Eye size={9} /> Read {formatTimestamp(message.readAt)}
          </span>
        )}
        {message.deliveredAt && !message.readAt && (
          <span className="text-[10px] font-semibold text-emerald-500 flex items-center gap-0.5">
            <CheckCircle2 size={9} /> Delivered {formatTimestamp(message.deliveredAt)}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AdminQuickSmsSheet({
  trip,
  messageHistory = [],
  onSend,
  onScheduleSend,
  onClose,
  readOnly = false,
}) {
  const [activeTab, setActiveTab] = useState('compose');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [customMessage, setCustomMessage] = useState('');
  const [isDriverMode, setIsDriverMode] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showVariablePicker, setShowVariablePicker] = useState(false);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduledTime, setScheduledTime] = useState(null);
  const [escalationRule, setEscalationRule] = useState('none');
  const [showEscalation, setShowEscalation] = useState(false);
  const [searchHistory, setSearchHistory] = useState('');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [expandedHistory, setExpandedHistory] = useState(true);
  const textareaRef = useRef(null);

  const [messageTemplates, setMessageTemplates] = useState(QUICK_SMS_EXTENDED);

  const filteredHistory = useMemo(() => {
    let list = [...messageHistory];
    if (historyFilter !== 'all') {
      if (historyFilter === 'starred') list = list.filter(m => m.starred);
      else list = list.filter(m => m.status === historyFilter);
    }
    if (searchHistory) {
      const q = searchHistory.toLowerCase();
      list = list.filter(m => (m.body || m.text || '').toLowerCase().includes(q));
    }
    return list.sort((a, b) => new Date(b.sentAt || b.createdAt || 0) - new Date(a.sentAt || a.createdAt || 0));
  }, [messageHistory, historyFilter, searchHistory]);

  const stats = useMemo(() => ({
    total: messageHistory.length,
    sent: messageHistory.filter(m => m.status === 'sent' || m.status === 'delivered' || m.status === 'read').length,
    delivered: messageHistory.filter(m => m.status === 'delivered' || m.status === 'read').length,
    read: messageHistory.filter(m => m.status === 'read').length,
    failed: messageHistory.filter(m => m.status === 'failed').length,
    scheduled: messageHistory.filter(m => m.status === 'scheduled').length,
  }), [messageHistory]);

  const getPreviewText = useCallback(() => {
    if (selectedTemplate && selectedTemplate.id !== 'custom') {
      const body = isDriverMode ? (selectedTemplate.driverBody || selectedTemplate.body) : selectedTemplate.body;
      return interpolateVariables(body || '', trip);
    }
    return interpolateVariables(customMessage, trip);
  }, [selectedTemplate, customMessage, isDriverMode, trip]);

  const insertVariable = useCallback((variable) => {
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const newVal = customMessage.substring(0, start) + variable + customMessage.substring(end);
      setCustomMessage(newVal);
      setTimeout(() => {
        textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + variable.length;
        textareaRef.current.focus();
      }, 0);
    } else {
      setCustomMessage(prev => prev + variable);
    }
  }, [customMessage]);

  const handleSend = async (scheduleTime = null) => {
    setSending(true);
    setError('');
    setSuccess('');
    try {
      let text = '';
      if (selectedTemplate && selectedTemplate.id !== 'custom') {
        const body = isDriverMode ? (selectedTemplate.driverBody || selectedTemplate.body) : selectedTemplate.body;
        text = prepareClientSmsText(body || '', trip);
      } else {
        text = prepareClientSmsText(customMessage, trip);
      }
      if (!text.trim()) {
        setError('Write a message before sending.');
        setSending(false);
        return;
      }
      const payload = {
        text,
        templateId: selectedTemplate?.id || 'custom',
        category: selectedTemplate?.id || 'custom',
        escalation: escalationRule,
        scheduledFor: scheduleTime,
        isDriverMode,
        tripId: trip?.id,
        tripBookingId: trip?.bookingId,
        patientName: trip?.patient,
        phone: trip?.phone || trip?.pickupPhone,
      };
      if (scheduleTime) {
        await Promise.resolve(onScheduleSend?.(payload));
        setSuccess('Message scheduled successfully.');
      } else {
        await Promise.resolve(onSend?.(text, selectedTemplate, payload));
        setSuccess('Message sent successfully.');
      }
      setTimeout(() => { setSuccess(''); onClose(); }, 1500);
    } catch (err) {
      setError(err?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleCopyMessage = (text) => {
    navigator.clipboard?.writeText(text).then(() => {
      setSuccess('Copied to clipboard');
      setTimeout(() => setSuccess(''), 1500);
    }).catch(() => {});
  };

  const handleResend = async (message) => {
    setSending(true);
    try {
      await Promise.resolve(onSend?.(message.body || message.text, null, { resentFrom: message.id }));
      setSuccess('Message resent.');
      setTimeout(() => setSuccess(''), 1500);
    } catch (err) {
      setError(err?.message || 'Failed to resend');
    } finally {
      setSending(false);
    }
  };

  if (!trip) return null;

  return (
    <div className="fixed inset-0 z-[260] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Enterprise messaging center"
        className="max-h-[92vh] w-full overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-md sm:rounded-3xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <header className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50/30 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
                <MessageSquare size={17} className="text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Messaging Center</h3>
                <p className="text-[11px] text-slate-500 font-semibold">{trip.patient} · {trip.phone || trip.pickupPhone || ''}</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="flex min-h-10 min-w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200">
              <X size={16} />
            </button>
          </div>

          {/* STATS BAR */}
          {messageHistory.length > 0 && (
            <div className="flex items-center gap-3 mt-2.5 text-[10px] font-bold">
              <span className="text-slate-500">{stats.total} total</span>
              <span className="text-emerald-600">{stats.delivered} delivered</span>
              <span className="text-indigo-600">{stats.read} read</span>
              {stats.failed > 0 && <span className="text-rose-600">{stats.failed} failed</span>}
              {stats.scheduled > 0 && <span className="text-amber-600">{stats.scheduled} scheduled</span>}
            </div>
          )}

          {/* TABS */}
          <div className="flex items-center gap-1 mt-2.5 bg-slate-200/70 p-0.5 rounded-xl">
            {[
              { id: 'compose', label: 'Compose', icon: Send },
              { id: 'history', label: 'History', icon: Clock, count: messageHistory.length },
              { id: 'templates', label: 'Templates', icon: Star },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 text-[11px] font-bold transition-all ${activeTab === tab.id ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>
                <tab.icon size={12} />
                <span>{tab.label}</span>
                {tab.count !== undefined && <span className="bg-slate-300/80 text-slate-700 px-1 py-0.2 rounded text-[9px] font-black">{tab.count}</span>}
              </button>
            ))}
          </div>
        </header>

        {/* CONTENT */}
        <div className="max-h-[62vh] overflow-y-auto">

          {/* COMPOSE TAB */}
          {activeTab === 'compose' && (
            <div className="p-4 space-y-3">
              {/* MODE TOGGLE */}
              <div className="flex items-center gap-2 rounded-xl bg-slate-100 p-1">
                <button type="button" onClick={() => setIsDriverMode(false)}
                  className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-all ${!isDriverMode ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'}`}>
                  <User size={12} className="inline mr-1" /> Dispatcher Mode
                </button>
                <button type="button" onClick={() => setIsDriverMode(true)}
                  className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-all ${isDriverMode ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'}`}>
                  <Phone size={12} className="inline mr-1" /> Driver Mode
                </button>
              </div>

              {/* TEMPLATE QUICK PICKS */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Quick Templates</label>
                <div className="flex flex-wrap gap-1">
                  {messageTemplates.filter(t => t.id !== 'custom').map((template) => {
                    const active = selectedTemplate?.id === template.id;
                    return (
                      <button key={template.id} type="button"
                        onClick={() => { setSelectedTemplate(active ? null : template); setCustomMessage(''); }}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400'}`}>
                        {template.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* MESSAGE INPUT */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Message</label>
                  <button type="button" onClick={() => setShowVariablePicker(true)}
                    className="text-[10px] font-bold text-indigo-600 flex items-center gap-0.5 hover:text-indigo-700">
                    <Hash size={10} /> Variables
                  </button>
                </div>
                <textarea ref={textareaRef} rows={4} value={customMessage}
                  onChange={(e) => { setCustomMessage(e.target.value); setSelectedTemplate(null); }}
                  placeholder={selectedTemplate ? 'Template selected — edit if needed...' : 'Type your message or select a template...'}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-blue-500 focus:bg-white resize-none" />
                <p className="text-[10px] font-semibold text-slate-400">{customMessage.length}/1600 characters</p>
              </div>

              {/* LIVE PREVIEW */}
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 space-y-1.5">
                <label className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1">
                  <Eye size={10} /> Live Preview
                </label>
                <p className="text-[11px] font-semibold text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {getPreviewText() || 'Select a template or type a message to see preview...'}
                </p>
              </div>

              {/* ESCALATION */}
              <div className="space-y-1.5">
                <button type="button" onClick={() => setShowEscalation(!showEscalation)}
                  className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider hover:text-slate-700">
                  <Zap size={10} /> Escalation {showEscalation ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                </button>
                {showEscalation && <EscalationConfig value={escalationRule} onChange={setEscalationRule} />}
              </div>

              {/* FEEDBACK */}
              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 flex items-start gap-2">
                  <AlertCircle size={14} className="text-rose-500 shrink-0 mt-0.5" />
                  <p className="text-xs font-semibold text-rose-700">{error}</p>
                </div>
              )}
              {success && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 flex items-start gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                  <p className="text-xs font-semibold text-emerald-700">{success}</p>
                </div>
              )}
            </div>
          )}

          {/* HISTORY TAB */}
          {activeTab === 'history' && (
            <div className="p-3 space-y-3">
              <div className="flex gap-1.5">
                <div className="flex-1 relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" value={searchHistory} onChange={(e) => setSearchHistory(e.target.value)} placeholder="Search messages..."
                    className="w-full h-9 rounded-lg border border-slate-200 bg-white pl-8 pr-2.5 text-[11px] font-semibold outline-none focus:border-blue-500" />
                </div>
                <select value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold outline-none">
                  {MESSAGE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              {filteredHistory.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <MessageCircle size={28} className="mx-auto text-slate-300" />
                  <p className="text-xs font-bold text-slate-600">No messages yet</p>
                  <p className="text-[10px] text-slate-400">Message history for this trip will appear here.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredHistory.map((msg, i) => (
                    <MessageHistoryItem key={msg.id || i} message={msg} trip={trip} onResend={handleResend} onCopy={handleCopyMessage} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TEMPLATES TAB */}
          {activeTab === 'templates' && (
            <div className="p-3 space-y-2">
              {messageTemplates.map((template) => (
                <button key={template.id} type="button"
                  onClick={() => { setSelectedTemplate(template); setActiveTab('compose'); }}
                  className="w-full text-left rounded-xl border border-slate-200 bg-white p-3 hover:border-blue-300 hover:bg-blue-50/30 transition-all space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{template.label}</span>
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Use</span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-semibold line-clamp-2">
                    {interpolateVariables(template.body || '', trip).substring(0, 120)}...
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3 space-y-2">
          {activeTab === 'compose' && (
            <div className="flex gap-2">
              <button type="button" onClick={onClose}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-all">
                Cancel
              </button>
              <button type="button" onClick={() => setShowSchedulePicker(true)} disabled={readOnly}
                className="py-3 px-4 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center gap-1.5">
                <Clock size={13} />
              </button>
              <button type="button" onClick={() => handleSend()} disabled={sending || readOnly}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
                {sending ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
                {sending ? 'Sending...' : 'Send Now'}
              </button>
            </div>
          )}
          {activeTab !== 'compose' && (
            <button type="button" onClick={onClose}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-all">
              Close
            </button>
          )}
        </div>
      </section>

      {/* MODALS */}
      {showVariablePicker && <VariablePicker onSelect={insertVariable} onClose={() => setShowVariablePicker(false)} />}
      {showSchedulePicker && (
        <SchedulePicker value={scheduledTime} onChange={setScheduledTime}
          onClose={() => { setShowSchedulePicker(false); if (scheduledTime) handleSend(scheduledTime); }} />
      )}
    </div>
  );
}
