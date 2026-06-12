import { useState, useEffect } from 'react';
import { resolveStatus } from '../constants/tripSeverity';

import {
  MapPin, Navigation, Clock, User, PhoneCall,
  ChevronDown, XCircle, AlertCircle,
  Ruler, Users, Activity, Building, Home, Accessibility,
  Copy, Check, RotateCcw, PhoneForwarded, MessageCircle,
  Square, CheckSquare, RefreshCw, Forward,
  Edit2, ArrowLeft, Shield, Zap, MoreHorizontal, Undo2
} from 'lucide-react';

const StatusBadge = ({ status }) => {
  const styles = {
    'NAVIGATING PICKUP': 'bg-blue-100 text-blue-700 border-blue-200',
    'PENDING': 'bg-slate-100 text-slate-700 border-slate-200',
    'COMPLETED': 'bg-emerald-100 text-emerald-700 border-emerald-200',
    'CANCELLED': 'bg-rose-100 text-rose-700 border-rose-200',
    'NO SHOW': 'bg-rose-100 text-rose-700 border-rose-200',
    'ASSIGNED': 'bg-blue-100 text-blue-700 border-blue-200',
    'UNASSIGNED': 'bg-slate-100 text-slate-500 border-slate-200',
    'IN PROGRESS': 'bg-cyan-100 text-cyan-700 border-cyan-200',
    'EN ROUTE': 'bg-blue-100 text-blue-700 border-blue-200',
    'AT PICKUP': 'bg-emerald-100 text-emerald-700 border-emerald-200',
    'IN TRANSIT': 'bg-orange-100 text-orange-700 border-orange-200',
    'NAVIGATING DROPOFF': 'bg-orange-100 text-orange-700 border-orange-200',
    'AT DROPOFF': 'bg-purple-100 text-purple-700 border-purple-200',
    'ARRIVED': 'bg-teal-100 text-teal-700 border-teal-200',
  };
  const key = (status || '').toUpperCase();
  return (
    <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${styles[key] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
      {status || 'PENDING'}
    </div>
  );
};

const getTimeUrgency = (timeStr, status) => {
  if (!timeStr || ['COMPLETED', 'CANCELLED', 'NO SHOW'].includes((status || '').toUpperCase())) return { type: 'normal' };
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const p = String(timeStr).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!p) return { type: 'normal' };
  let h = parseInt(p[1]), m = parseInt(p[2]);
  const ampm = p[3]?.toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  const tripMins = h * 60 + m;
  const diff = tripMins - nowMins;
  const activeStatuses = ['IN PROGRESS', 'IN TRANSIT', 'AT PICKUP', 'AT DROPOFF', 'NAVIGATING PICKUP', 'NAVIGATING DROPOFF'];
  if (diff < 0 && !activeStatuses.includes((status || '').toUpperCase())) return { type: 'critical', diff, isPastDue: true };
  if (diff > 0 && diff <= 30) return { type: 'critical', diff };
  if (diff > 30 && diff <= 60) return { type: 'warning', diff };
  return { type: 'normal' };
};

const getSiteIcon = (name) => {
  if (!name) return <MapPin size={14} />;
  const n = name.toLowerCase();
  if (n.includes('home') || n.includes('rsdnc')) return <Home size={14} />;
  if (n.includes('health') || n.includes('care') || n.includes('hospital') || n.includes('cardio') || n.includes('clinic')) return <Activity size={14} />;
  return <Building size={14} />;
};

const TaskCard = ({ task, expandedId, onToggle, isSelected, onSelect, actions }) => {
  const isExpanded = expandedId === task.id;
  const isAnotherExpanded = expandedId !== null && expandedId !== task.id;
  const [copiedId, setCopiedId] = useState('');
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [showContactSheet, setShowContactSheet] = useState(false);

  const timeUrgency = getTimeUrgency(task.time, task.status);
  const isTerminal = ['Completed', 'Cancelled', 'No Show'].includes(task.status);
  const dropoffAddress = task.dropoff?.address || task.dropoff || '';
  const dropoffSiteName = (task.dropoff?.site || task.dropoffSite || '').trim();
  const pickupAddress = task.pickup?.address || task.pickup || '';
  const pickupSiteName = (task.pickup?.site || task.pickupSite || '').trim();

  useEffect(() => {
    if (isExpanded) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isExpanded]);

  const handleCopy = (text, id) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(''), 2000);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const readyMessage = `${getGreeting()}, I'm on my way. Medical Transportation thank you. ETA:`;

  const contacts = [
    { label: 'Patient', phone: task.patientPhone },
    { label: 'Patient Mobile', phone: task.patientMobile },
    { label: 'Pickup', phone: task.pickupPhone },
    { label: 'Dropoff', phone: task.dropoffPhone },
    { label: 'Guardian', phone: task.guardianPhone },
    { label: 'Escort', phone: task.escortPhone },
    { label: 'Emergency', phone: task.emergencyContact },
  ].filter(c => c.phone);

  return (
    <div
      className={`relative bg-white rounded-3xl mb-3
        ${isExpanded ? 'shadow-2xl ring-2 ring-blue-500/15' : 'shadow-sm border border-slate-100/50 hover:shadow-md overflow-hidden'}
        ${isAnotherExpanded ? 'opacity-35 scale-[0.98] blur-[1px] pointer-events-none' : ''}
        ${!isExpanded && timeUrgency.type === 'critical' ? 'border-rose-300 shadow-rose-100 shadow-md' : ''}
        ${!isExpanded && timeUrgency.type === 'warning' ? 'border-orange-300 shadow-orange-50 shadow-sm' : ''}
        ${task.isPairedInOut && task.pairType === 'a-leg' ? 'border-l-4 border-l-amber-400' : ''}
        ${task.isPairedInOut && task.pairType === 'b-leg' ? 'border-l-4 border-l-amber-300 bg-amber-50/20 -mt-1 rounded-t-none' : ''}
      `}
    >
      {/* Collapsed Header */}
      <div
        className={`relative cursor-pointer select-none transition-colors ${isExpanded ? 'shrink-0' : ''} ${
          !isExpanded && timeUrgency.type === 'critical' ? 'bg-rose-50/30 hover:bg-rose-50/50' :
          !isExpanded && timeUrgency.type === 'warning' ? 'bg-orange-50/30 hover:bg-orange-50/50' :
          'active:bg-slate-50'
        }`}
        onClick={() => onToggle(task.id)}
      >
        {timeUrgency.type !== 'normal' && (
          <div className={`absolute left-0 top-6 w-1.5 h-12 rounded-r-full ${
            timeUrgency.type === 'critical' ? 'bg-rose-500' : 'bg-orange-400'
          }`} />
        )}

        <div className="p-4 sm:p-5">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-3 min-w-0 pr-2">
              {onSelect && (
                <div className="min-h-[44px] min-w-[44px] flex items-center justify-center">
                  <button onClick={(e) => { e.stopPropagation(); onSelect(task.id); }} className="shrink-0">
                    {isSelected ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} className="text-slate-300" />}
                  </button>
                </div>
              )}
              <Clock size={timeUrgency.type === 'critical' ? 18 : 16} className={`shrink-0 ${
                timeUrgency.type === 'critical' ? 'text-rose-600 animate-pulse' :
                timeUrgency.type === 'warning' ? 'text-orange-500' :
                isExpanded ? 'text-blue-600' : 'text-slate-400'
              }`} strokeWidth={timeUrgency.type === 'normal' ? 2.5 : 3} />
              <span className={`text-[19px] font-black tracking-tight whitespace-nowrap ${
                timeUrgency.type === 'critical' ? 'text-rose-600' :
                timeUrgency.type === 'warning' ? 'text-orange-500' :
                'text-slate-900'
              }`}>
                {task.time || 'TBD'}
              </span>
              {timeUrgency.type !== 'normal' && (
                <span className={`px-2 py-0.5 rounded-md text-xs font-bold whitespace-nowrap ${
                  timeUrgency.type === 'critical' ? 'bg-rose-50 text-rose-600' :
                  'bg-orange-50 text-orange-600'
                }`}>
                  {timeUrgency.isPastDue ? 'Past due' : `${timeUrgency.diff}m away`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {task.legLabel && (
                <button onClick={(e) => { e.stopPropagation(); actions?.onShowLegs?.(task); }}
                  className="px-2.5 py-1 min-h-[36px] rounded-lg text-[10px] font-bold tracking-wider cursor-pointer transition-colors bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100">
                  {task.legLabel}
                </button>
              )}
              {isExpanded && <StatusBadge status={task.status} />}
              <button onClick={(e) => { e.stopPropagation(); setShowContactSheet(true); }} className="w-10 h-10 min-h-[44px] rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
                <ChevronDown size={18} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} strokeWidth={2} />
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center mb-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-bold text-slate-800 truncate">
                {task.patient || task.patientName}
                {task.bookingId && <span className="ml-1.5 text-xs font-bold text-blue-600">#{task.bookingId}</span>}
              </h3>
              {task.isInOut && !isExpanded && (
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mt-0.5">In/Out — Client returns shortly</p>
              )}
              {task.isWillCallTrip && !isExpanded && (
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Will Call — Awaiting client call</p>
              )}
            </div>
            {!isExpanded && task.details?.distance && (
              <span className="text-[13px] font-semibold text-slate-400 shrink-0 ml-2">{task.details.distance}</span>
            )}
          </div>

          {!isExpanded && (
            <div className="flex items-stretch gap-3">
              <div className="flex flex-col items-center justify-center pt-1.5 pb-1.5">
                <div className="w-[7px] h-[7px] rounded-full bg-blue-500 ring-2 ring-blue-100"></div>
                <div className="w-[1.5px] h-5 bg-slate-200 my-0.5 rounded-full"></div>
                <div className="w-[7px] h-[7px] rounded-full bg-emerald-500 ring-2 ring-emerald-100"></div>
              </div>
              <div className="flex flex-col justify-between flex-1 gap-2 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-[13px] font-medium text-slate-600 truncate">{pickupAddress}</p>
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-[13px] font-medium text-slate-600 truncate">{dropoffAddress}</p>
                </div>
              </div>
            </div>
            )}
            {showContactSheet && (
              <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" onClick={() => setShowContactSheet(false)}>
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
                <div onClick={(e) => e.stopPropagation()}
                  className="relative w-full sm:w-[420px] max-h-[85vh] bg-white rounded-t-[2rem] sm:rounded-[2rem] animate-scale-in overflow-hidden shadow-2xl shadow-slate-900/20 ring-1 ring-black/5">
                  <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-slate-300" />
                  </div>
                  <div className="px-5 flex items-center justify-between border-b border-slate-100">
                    <h3 className="font-extrabold text-[15px] text-slate-900 py-3">Quick Contact</h3>
                    <button onClick={() => setShowContactSheet(false)}
                      className="w-11 h-11 min-h-[44px] rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors cursor-pointer">
                      <XCircle size={16} className="text-slate-400" />
                    </button>
                  </div>
                  <div className="overflow-y-auto p-5 space-y-4 pb-[calc(env(safe-area-inset-bottom)+20px)]">
                    <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
                      <p className="text-[13px] text-blue-900 leading-relaxed">{readyMessage}</p>
                    </div>
                    <div className="flex gap-2">
                      {actions?.onCall && (
                        <button onClick={(e) => { e.stopPropagation(); actions.onCall(task); setShowContactSheet(false); }}
                          className="flex-1 h-12 flex items-center justify-center gap-2 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 active:scale-[0.97] transition-all text-[13px]">
                          <PhoneCall size={15} /> Quick Call
                        </button>
                      )}
                      {actions?.onSms && (
                        <button onClick={(e) => { e.stopPropagation(); actions.onSms({ ...task, _smsMessage: readyMessage }); setShowContactSheet(false); }}
                          className="flex-1 h-12 flex items-center justify-center gap-2 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 active:scale-[0.97] transition-all text-[13px]">
                          <MessageCircle size={15} /> Quick SMS
                        </button>
                      )}
                    </div>
                    {contacts.map((c, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-bold text-slate-700">{c.label}</p>
                          <p className="text-[12px] text-slate-500 truncate">{c.phone}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <button onClick={(e) => { e.stopPropagation(); actions?.onCallNumber?.(c.phone, c.label); }}
                            className="w-11 h-11 min-h-[44px] rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:scale-90 transition-all cursor-pointer">
                            <PhoneCall size={16} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); actions?.onSmsNumber?.(c.phone, c.label, readyMessage); }}
                            className="w-11 h-11 min-h-[44px] rounded-xl bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 active:scale-90 transition-all cursor-pointer">
                            <MessageCircle size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {contacts.length === 0 && (
                      <p className="text-center text-[13px] text-slate-400 py-8">No contact numbers available</p>
                    )}
                    <div className="border-t border-slate-100 pt-4 space-y-2">
                      {actions?.onNoShow && (
                        <button onClick={(e) => { e.stopPropagation(); setShowContactSheet(false); actions.onNoShow(task); }}
                          className="w-full h-12 flex items-center gap-3 px-4 bg-rose-50 text-rose-600 font-bold rounded-2xl hover:bg-rose-100 active:scale-[0.97] transition-all text-[13px] border border-rose-100">
                          <AlertCircle size={16} /> No Show
                        </button>
                      )}
                      {actions?.onCancel && (
                        <button onClick={(e) => { e.stopPropagation(); setShowContactSheet(false); actions.onCancel(task); }}
                          className="w-full h-12 flex items-center gap-3 px-4 bg-slate-50 text-slate-600 font-bold rounded-2xl hover:bg-slate-100 active:scale-[0.97] transition-all text-[13px] border border-slate-200">
                          <XCircle size={16} /> Cancelled
                        </button>
                      )}
                      {actions?.onReroute && (
                        <button onClick={(e) => { e.stopPropagation(); setShowContactSheet(false); actions.onReroute(task); }}
                          className="w-full h-12 flex items-center gap-3 px-4 bg-purple-50 text-purple-600 font-bold rounded-2xl hover:bg-purple-100 active:scale-[0.97] transition-all text-[13px] border border-purple-100">
                          <RefreshCw size={16} /> Rerouted
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
      </div>

      {/* Expanded Content - Premium Full Screen Page */}
      {isExpanded && (() => {
        const sev = resolveStatus(task);
        const stepIdx = (() => {
          const s = String(task.status || '').toUpperCase();
          if (s === 'COMPLETED' || s === 'CANCELLED' || s === 'NO SHOW' || s === 'REROUTED') return 4;
          if (s === 'IN TRANSIT' || s === 'NAVIGATING DROPOFF' || s === 'AT DROPOFF' || s === 'ARRIVED') return 3;
          if (s === 'AT PICKUP') return 2;
          if (s === 'EN ROUTE' || s === 'NAVIGATING PICKUP' || s === 'IN PROGRESS') return 1;
          return 0;
        })();
        const steps = ['Scheduled', 'En Route', 'At Pickup', 'In Transit', 'Complete'];
        const timeUrg = getTimeUrgency(task.time, task.status);
        return (
        <>
          <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-slate-50 to-slate-100" style={{ zIndex: 220 }}>

            {/* === GLASS HEADER === */}
            <div
              className="backdrop-blur-xl bg-white/90 border-b border-slate-200/50 px-4 pb-3 flex items-center gap-3 shrink-0"
              style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
            >
              <button
                type="button"
                onClick={() => onToggle(task.id)}
                title="Back to trips"
                className="relative z-10 w-12 h-12 min-h-[48px] min-w-[48px] rounded-2xl bg-white border border-slate-200 flex items-center justify-center active:scale-90 cursor-pointer shrink-0 shadow-sm hover:bg-slate-50 transition-colors"
              >
                <ArrowLeft size={18} className="text-slate-600" />
              </button>
              <div className="flex-1 min-w-0">
                <h2 className="font-extrabold text-[15px] text-slate-900 truncate leading-tight">
                  {task.patient || task.patientName}
                  {task.bookingId && <span className="ml-1.5 text-xs font-bold text-blue-500">#{task.bookingId}</span>}
                </h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Clock size={11} className={`shrink-0 ${timeUrg.type === 'critical' ? 'text-rose-500' : timeUrg.type === 'warning' ? 'text-amber-500' : 'text-slate-400'}`} />
                  <span className={`text-[11px] font-semibold ${timeUrg.type === 'critical' ? 'text-rose-600' : timeUrg.type === 'warning' ? 'text-amber-600' : 'text-slate-400'}`}>
                    {task.time || 'TBD'}
                  </span>
                </div>
                {task.isInOut && (
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mt-1">In/Out — Client returns shortly</p>
                )}
                {task.isWillCallTrip && (
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Will Call — Awaiting client call</p>
                )}
              </div>
              <StatusBadge status={task.status} />
            </div>

            {/* Severity Bar */}
            {sev && <div className={`h-[3px] shrink-0 ${sev.bg}`} />}

            {/* === SCROLLABLE === */}
            <div className="flex-1 overflow-y-auto overscroll-contain">

              {/* --- ROUTE CARD --- */}
              <div className="mx-4 sm:mx-5 mt-4 rounded-2xl overflow-hidden shadow-2xl shadow-slate-900/10 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
                <div className="relative p-5 pb-4">
                  {/* Decorative dots */}
                  <div className="absolute top-4 right-4 flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                    <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                    <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                  </div>

                  {/* Time + Badge */}
                  <div className="flex items-end justify-between mb-5">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/30 mb-1">Scheduled Time</p>
                      <span className="text-[32px] font-black text-white tracking-tight leading-none">{task.time || 'TBD'}</span>
                    </div>
                    {sev && (
                      <span className={`px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${sev.badge} backdrop-blur-sm`}>
                        {sev.label}
                      </span>
                    )}
                  </div>

                  {/* Route Visualization */}
                  <div className="flex gap-4">
                    {/* Vertical Line */}
                    <div className="flex flex-col items-center pt-2">
                      <div className="w-3 h-3 rounded-full bg-blue-400 shadow-lg shadow-blue-500/30" />
                      <div className="w-[2px] flex-1 my-1.5 rounded-full" style={{ background: 'linear-gradient(180deg, rgba(96,165,250,0.5) 0%, rgba(52,211,153,0.5) 100%)' }} />
                      <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-lg shadow-emerald-500/30" />
                    </div>

                    {/* Addresses */}
                    <div className="flex-1 min-w-0 space-y-5">
                      <div className="group">
                        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-blue-400/80 mb-1">From</p>
                        <p className="text-[13px] font-semibold text-white/95 leading-snug truncate">{pickupAddress}</p>
                        {pickupSiteName && pickupSiteName !== pickupAddress && (
                          <p className="text-[11px] text-white/40 mt-0.5 flex items-center gap-1">
                            {getSiteIcon(pickupSiteName)} {pickupSiteName}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 mt-2.5">
                           <button onClick={(e) => { e.stopPropagation(); handleCopy(pickupAddress, 'pickup'); }}
                             className="min-h-[40px] px-3 py-2 bg-white/8 hover:bg-white/15 rounded-lg text-[10px] font-bold text-white/60 flex items-center gap-1 transition-colors cursor-pointer">
                             {copiedId === 'pickup' ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                             {copiedId === 'pickup' ? 'Copied' : 'Copy'}
                           </button>
                          {task.details?.distance && (
                            <span className="text-[10px] font-bold text-white/40 px-1">{task.details.distance}</span>
                          )}
                           <button onClick={(e) => { e.stopPropagation(); actions?.onNavigatePickup?.(task); }}
                             className="ml-auto min-h-[40px] px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg text-[10px] font-bold text-blue-300 flex items-center gap-1 transition-colors cursor-pointer">
                             <Navigation size={10} /> Navigate
                           </button>
                        </div>
                      </div>

                      <div className="group">
                        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-400/80 mb-1">To</p>
                        <p className="text-[13px] font-semibold text-white/95 leading-snug truncate">{dropoffAddress}</p>
                        {dropoffSiteName && dropoffSiteName !== dropoffAddress && (
                          <p className="text-[11px] text-white/40 mt-0.5 flex items-center gap-1">
                            {getSiteIcon(dropoffSiteName)} {dropoffSiteName}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 mt-2.5">
                           <button onClick={(e) => { e.stopPropagation(); handleCopy(dropoffAddress, 'dropoff'); }}
                             className="min-h-[40px] px-3 py-2 bg-white/8 hover:bg-white/15 rounded-lg text-[10px] font-bold text-white/60 flex items-center gap-1 transition-colors cursor-pointer">
                             {copiedId === 'dropoff' ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                             {copiedId === 'dropoff' ? 'Copied' : 'Copy'}
                           </button>
                           <button onClick={(e) => { e.stopPropagation(); actions?.onNavigateDropoff?.(task); }}
                             className="ml-auto min-h-[40px] px-3 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 rounded-lg text-[10px] font-bold text-emerald-300 flex items-center gap-1 transition-colors cursor-pointer">
                             <Navigation size={10} /> Navigate
                           </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Contact Strip */}
                  <div className="flex gap-2 mt-5">
                    <button onClick={(e) => { e.stopPropagation(); actions?.onCall?.(task); }}
                      className="flex-1 min-h-[44px] bg-white/10 backdrop-blur hover:bg-white/15 rounded-2xl text-[11px] font-bold text-white/80 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer border border-white/5">
                      <PhoneCall size={13} /> Call
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); actions?.onSms?.(task); }}
                      className="flex-1 min-h-[44px] bg-white/10 backdrop-blur hover:bg-white/15 rounded-2xl text-[11px] font-bold text-white/80 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer border border-white/5">
                      <MessageCircle size={13} /> SMS
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); actions?.onContacts?.(task); }}
                      className="flex-1 min-h-[44px] bg-white/10 backdrop-blur hover:bg-white/15 rounded-2xl text-[11px] font-bold text-white/80 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer border border-white/5">
                      <PhoneForwarded size={13} /> Contacts
                    </button>
                    {!isTerminal && (
                      <button onClick={(e) => { e.stopPropagation(); setShowMoreSheet(true); }}
                        className="min-h-[44px] px-3 bg-white/10 backdrop-blur hover:bg-white/15 rounded-2xl text-[11px] font-bold text-white/80 flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer border border-white/5">
                        <MoreHorizontal size={13} /> More
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* --- PROGRESS --- */}
              <div className="mx-4 sm:mx-5 mt-3 bg-white/80 backdrop-blur rounded-2xl p-4 border border-white shadow-sm">
                <div className="flex items-center gap-0">
                  {steps.map((step, i) => (
                    <div key={step} className="flex items-center flex-1">
                      <div className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[9px] font-extrabold shrink-0 transition-all duration-300 ${
                        i < stepIdx ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200' :
                        i === stepIdx ? 'bg-slate-900 text-white shadow-md shadow-slate-300 ring-2 ring-slate-900/10' :
                        'bg-slate-100 text-slate-400'
                      }`}>
                        {i < stepIdx ? <Check size={11} strokeWidth={3} /> : i + 1}
                      </div>
                      {i < steps.length - 1 && (
                        <div className={`flex-1 h-[3px] mx-1 rounded-full transition-all duration-500 ${
                          i < stepIdx ? 'bg-emerald-400' : i === stepIdx ? 'bg-gradient-to-r from-slate-900 to-slate-200' : 'bg-slate-100'
                        }`} />
                      )}
                    </div>
                  ))}
                  {!isTerminal && stepIdx > 0 && actions?.onRevert && (
                    <button onClick={(e) => { e.stopPropagation(); actions.onRevert(task); }}
                      className="ml-2 min-h-[36px] min-w-[36px] rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center shrink-0 transition-all active:scale-90 cursor-pointer border border-slate-200"
                      title="Undo last step">
                      <Undo2 size={11} className="text-slate-600" />
                    </button>
                  )}
                </div>
                <div className="flex justify-between mt-2 px-0.5">
                  {steps.map((step, i) => (
                    <span key={step} className={`text-[8px] font-bold tracking-wide ${i <= stepIdx ? 'text-slate-700' : 'text-slate-300'}`}>{step}</span>
                  ))}
                </div>
              </div>

              {/* --- DRIVER NOTES BOX (between progress and workflow) --- */}
              {(task.notes || task.details?.generalComments) && (
                <div className="mx-4 sm:mx-5 mt-3 rounded-xl border border-amber-200/40 bg-amber-50/80 px-3 py-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertCircle size={12} className="text-amber-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Driver Notes</span>
                  </div>
                  <div className="max-h-[64px] overflow-y-auto text-[12px] text-amber-900 font-medium leading-relaxed">
                    {task.notes || task.details.generalComments}
                  </div>
                </div>
              )}

              {/* --- PRIMARY ACTION (right after progress) --- */}
              {actions?.renderWorkflow && (
                <div className="mx-4 sm:mx-5 mt-3">
                  {actions.renderWorkflow(task)}
                </div>
              )}
              {!isTerminal && !actions?.renderWorkflow && actions?.onPrimary && (
                <div className="mx-4 sm:mx-5 mt-3 flex items-center gap-2.5">
                  <button onClick={(e) => { e.stopPropagation(); actions.onPrimary(task); }}
                    className="flex-[4] h-[50px] bg-slate-900 text-white font-extrabold text-[13px] rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/25 flex items-center justify-center gap-2 active:scale-[0.98]">
                    {actions.primaryLabel || 'Start'} <Navigation size={16} strokeWidth={2.5} />
                  </button>
                  {actions?.onSkipNav && (
                    <button onClick={(e) => { e.stopPropagation(); actions.onSkipNav(task); }}
                      className="flex-1 h-[50px] bg-slate-100 text-slate-600 rounded-2xl hover:bg-slate-200 transition-all text-[12px] font-bold flex items-center justify-center gap-1.5 active:scale-[0.98]">
                      <Forward size={14} /> Skip
                    </button>
                  )}
                </div>
              )}

              {/* --- TAGS --- */}
              {(task.details?.passengerType || task.details?.mobility || (task.tags && task.tags.length > 0)) && (
                <div className="flex flex-wrap gap-1.5 px-4 sm:px-5 mt-3">
                  {task.details?.passengerType && (
                    <span className="inline-flex items-center gap-1 bg-blue-50/80 text-blue-600 px-2.5 py-1 rounded-xl text-[10px] font-bold border border-blue-100/60">
                      <User size={10} /> {task.details.passengerType.split(',')[0]}
                    </span>
                  )}
                  {(task.details?.passengerType || '').includes('ESC') && (
                    <span className="inline-flex items-center gap-1 bg-purple-50/80 text-purple-600 px-2.5 py-1 rounded-xl text-[10px] font-bold border border-purple-100/60">
                      <Users size={10} /> Escort
                    </span>
                  )}
                  {task.details?.mobility && task.details.mobility !== 'WLK' && (
                    <span className="inline-flex items-center gap-1 bg-orange-50/80 text-orange-600 px-2.5 py-1 rounded-xl text-[10px] font-bold border border-orange-100/60">
                      <Accessibility size={10} /> {task.details.mobility}
                    </span>
                  )}
                  {task.tags?.map((tag, i) => (
                    <span key={i} className="inline-flex items-center bg-slate-50/80 text-slate-400 px-2.5 py-1 rounded-xl text-[10px] font-semibold border border-slate-200/60">{tag}</span>
                  ))}
                </div>
              )}
            </div>

            {/* === MORE BOTTOM SHEET === */}
            {showMoreSheet && (
              <div className="fixed inset-0 flex items-end justify-center" style={{ zIndex: 60 }} onClick={() => setShowMoreSheet(false)}>
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
                <div className="relative w-full max-w-lg bg-white rounded-t-3xl shadow-2xl animate-slide-up"
                  onClick={(e) => e.stopPropagation()}>
                  {/* Handle */}
                  <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-slate-200" />
                  </div>
                  {/* Header */}
                  <div className="px-5 pb-3 flex items-center justify-between border-b border-slate-100">
                    <h3 className="font-extrabold text-[15px] text-slate-900">More Actions</h3>
                    <button onClick={() => setShowMoreSheet(false)}
                      className="w-11 h-11 min-h-[44px] rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors cursor-pointer">
                      <XCircle size={16} className="text-slate-400" />
                    </button>
                  </div>
                  {/* Actions Grid */}
                  <div className="p-5 space-y-2 pb-[calc(env(safe-area-inset-bottom)+20px)]">
                    {actions?.onSms && (
                      <button onClick={(e) => { e.stopPropagation(); setShowMoreSheet(false); actions.onSms({ ...task, _smsMessage: readyMessage }); }}
                        className="w-full h-12 flex items-center gap-3 px-4 bg-emerald-50 text-emerald-700 font-bold rounded-2xl hover:bg-emerald-100 active:scale-[0.97] transition-all text-[13px] border border-emerald-200">
                        <MessageCircle size={16} /> Quick SMS
                      </button>
                    )}
                    {actions?.onNoShow && (
                      <button onClick={(e) => { e.stopPropagation(); setShowMoreSheet(false); actions.onNoShow(task); }}
                        className="w-full h-12 flex items-center gap-3 px-4 bg-rose-50 text-rose-600 font-bold rounded-2xl hover:bg-rose-100 active:scale-[0.97] transition-all text-[13px] border border-rose-100">
                        <AlertCircle size={16} /> No Show
                      </button>
                    )}
                    {actions?.onCancel && (
                      <button onClick={(e) => { e.stopPropagation(); setShowMoreSheet(false); actions.onCancel(task); }}
                        className="w-full h-12 flex items-center gap-3 px-4 bg-slate-50 text-slate-600 font-bold rounded-2xl hover:bg-slate-100 active:scale-[0.97] transition-all text-[13px] border border-slate-200">
                        <XCircle size={16} /> Cancelled
                      </button>
                    )}
                    {actions?.onReroute && (
                      <button onClick={(e) => { e.stopPropagation(); setShowMoreSheet(false); actions.onReroute(task); }}
                        className="w-full h-12 flex items-center gap-3 px-4 bg-purple-50 text-purple-600 font-bold rounded-2xl hover:bg-purple-100 active:scale-[0.97] transition-all text-[13px] border border-purple-100">
                        <RefreshCw size={16} /> Rerouted
                      </button>
                    )}
                    {actions?.onEditTrip && !isTerminal && (
                      <button onClick={(e) => { e.stopPropagation(); setShowMoreSheet(false); actions.onEditTrip(task); }}
                        className="w-full h-12 flex items-center gap-3 px-4 bg-slate-50 text-slate-600 font-bold rounded-2xl hover:bg-slate-100 active:scale-[0.97] transition-all text-[13px] border border-slate-200">
                        <Edit2 size={16} /> Edit Trip
                      </button>
                    )}
                    {actions?.onTransfer && !isTerminal && (
                      <button onClick={(e) => { e.stopPropagation(); setShowMoreSheet(false); actions.onTransfer(task); }}
                        className="w-full h-12 flex items-center gap-3 px-4 bg-amber-50 text-amber-600 font-bold rounded-2xl hover:bg-amber-100 active:scale-[0.97] transition-all text-[13px] border border-amber-100">
                        <Zap size={16} /> Transfer
                      </button>
                    )}
                    {actions?.onRevert && !isTerminal && (
                      <button onClick={(e) => { e.stopPropagation(); setShowMoreSheet(false); actions.onRevert(task); }}
                        className="w-full h-12 flex items-center gap-3 px-4 bg-slate-50 text-slate-500 font-bold rounded-2xl hover:bg-slate-100 active:scale-[0.97] transition-all text-[13px] border border-slate-200">
                        <RotateCcw size={16} /> Revert Status
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
        );
      })()}
    </div>
  );
};

export default TaskCard;
export { StatusBadge, getTimeUrgency, getSiteIcon };
