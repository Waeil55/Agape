import { useState, useEffect, useRef } from 'react';

import {
  MapPin, Navigation, Clock, User, PhoneCall,
  ChevronDown, XCircle, AlertCircle,
  Ruler, Users, Activity, Building, Home, Accessibility,
  Copy, Check, RotateCcw, PhoneForwarded, MessageCircle,
  Square, CheckSquare, RefreshCw, Forward,
  Edit2, Truck, X, MoreVertical
} from 'lucide-react';

const StatusBadge = ({ status }) => {
  const styles = {
    'NAVIGATING PICKUP': 'bg-blue-100 text-blue-700 border-blue-200',
    'PENDING': 'bg-slate-100 text-slate-700 border-slate-200',
    'COMPLETED': 'bg-emerald-100 text-emerald-700 border-emerald-200',
    'CANCELLED': 'bg-rose-100 text-rose-700 border-rose-200',
    'NO SHOW': 'bg-rose-100 text-rose-700 border-rose-200',
    'ASSIGNED': 'bg-indigo-100 text-indigo-700 border-indigo-200',
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

const formatCountdown = (minutes) => {
  const abs = Math.abs(Math.round(minutes));
  if (abs < 60) return `${abs}m`;
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

const getTimeUrgency = (timeOrTask, status) => {
  const task = typeof timeOrTask === 'object' && timeOrTask !== null ? timeOrTask : null;
  const timeStr = task ? task.time : timeOrTask;
  const tripStatus = task ? task.status : status;
  if (task?.urgentTrip && task?.urgentDeadlineAt && !['COMPLETED', 'CANCELLED', 'NO SHOW'].includes((tripStatus || '').toUpperCase())) {
    const deadlineMs = new Date(task.urgentDeadlineAt).getTime();
    if (!Number.isNaN(deadlineMs)) {
      const diff = Math.ceil((deadlineMs - Date.now()) / 60000);
      return {
        type: diff <= 60 ? 'critical' : 'warning',
        diff,
        isPastDue: diff < 0,
        label: diff < 0 ? `${formatCountdown(diff)} late` : `${formatCountdown(diff)} left`,
      };
    }
  }
  if (!timeStr || ['COMPLETED', 'CANCELLED', 'NO SHOW'].includes((tripStatus || '').toUpperCase())) return { type: 'normal' };
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
  if (diff < 0) return { type: 'critical', diff, isPastDue: true };
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
  const isAnotherExpanded = expandedId !== null && expandedId !== undefined && expandedId !== task.id;
  const [copiedId, setCopiedId] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const timeUrgency = getTimeUrgency(task);
  const isTerminal = ['Completed', 'Cancelled', 'No Show', 'Rerouted'].includes(task.status);
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

  return (
    <div
      className={`relative bg-white rounded-3xl mb-3
        ${isExpanded ? 'shadow-2xl ring-2 ring-blue-500/15' : 'shadow-sm border border-slate-100/50 hover:shadow-md'}
        ${isAnotherExpanded ? 'opacity-35 scale-[0.98] blur-[1px] pointer-events-none' : ''}
        ${!isExpanded && timeUrgency.type === 'critical' ? 'border-rose-300 shadow-rose-100 shadow-md bg-rose-50' : ''}
        ${!isExpanded && timeUrgency.type === 'warning' ? 'border-orange-300 shadow-orange-50 shadow-sm' : ''}
      `}
    >
      {/* Collapsed Header */}
      <div
        className={`relative cursor-pointer select-none transition-colors ${isExpanded ? 'shrink-0' : ''} ${
          !isExpanded && timeUrgency.type === 'critical' ? 'bg-rose-100/60 hover:bg-rose-100/80' :
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
                <button onClick={(e) => { e.stopPropagation(); onSelect(task.id); }} className="shrink-0">
                  {isSelected ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} className="text-slate-300" />}
                </button>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); actions?.onScheduleEdit?.(task); }}
                className="flex items-center gap-2 rounded-xl -ml-1 px-1.5 py-1 hover:bg-white/70 active:scale-95 transition-all cursor-pointer"
                title="Update time, Will Call, IN/OUT, or urgent deadline"
              >
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
              </button>
              {timeUrgency.type !== 'normal' && (
                <span className={`px-2 py-0.5 rounded-md text-xs font-bold whitespace-nowrap ${
                  timeUrgency.type === 'critical' ? 'bg-rose-50 text-rose-600' :
                  'bg-orange-50 text-orange-600'
                }`}>
                  {timeUrgency.label || (timeUrgency.isPastDue ? 'Past due' : `${timeUrgency.diff}m away`)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {task.legs && (
                <button onClick={(e) => { e.stopPropagation(); actions?.onShowLegs?.(task); }}
                  className={`border px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wider cursor-pointer transition-colors ${
                    isExpanded ? 'border-indigo-100 text-indigo-600 bg-indigo-50' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}>
                  {task.legs}
                </button>
              )}
              {isExpanded && <StatusBadge status={task.status} />}
              {!isExpanded && !isTerminal && actions && (actions.onNoShow || actions.onCancel || actions.onReroute || actions.onTransfer) && (
                <div className="relative" ref={menuRef}>
                  <button onClick={(e) => { e.stopPropagation(); setMenuOpen(prev => !prev); }} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
                    <MoreVertical size={16} strokeWidth={2} />
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl py-1 min-w-[150px] overflow-hidden">
                      {actions?.onNoShow && (
                        <button onClick={(e) => { e.stopPropagation(); actions.onNoShow(task); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors text-left">
                          <AlertCircle size={14} /> No Show
                        </button>
                      )}
                      {actions?.onCancel && (
                        <button onClick={(e) => { e.stopPropagation(); actions.onCancel(task); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors text-left">
                          <XCircle size={14} /> Cancel Trip
                        </button>
                      )}
                      {actions?.onReroute && (
                        <button onClick={(e) => { e.stopPropagation(); actions.onReroute(task); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-purple-700 hover:bg-purple-50 transition-colors text-left">
                          <RefreshCw size={14} /> Rerouted
                        </button>
                      )}
                      {actions?.onTransfer && (
                        <button onClick={(e) => { e.stopPropagation(); actions.onTransfer(task); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-50 transition-colors text-left">
                          <Forward size={14} /> Transfer
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center mb-3">
            <h3 className="text-[15px] font-bold text-slate-800 truncate min-w-0 flex items-center gap-0.5">
              {task.patient || task.patientName}
              {task.activeTrip && (
                <span className="inline-flex items-center gap-0.5 shrink-0 ml-0.5">
                  <Truck size={14} className="text-blue-600" strokeWidth={2.5} />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); actions?.onClearActiveTrip?.(); }}
                    className="w-3.5 h-3.5 flex items-center justify-center rounded-full bg-slate-200 hover:bg-slate-300 transition-colors"
                    title="Dismiss active trip"
                  >
                    <X size={8} className="text-slate-500" />
                  </button>
                </span>
              )}
            </h3>
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
        </div>
      </div>

      {/* Expanded Content - Full Screen Overlay */}
      {isExpanded && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-slate-900/15 backdrop-blur-sm z-40 transition-opacity duration-300" onClick={() => onToggle(task.id)} />
          {/* Modal Card */}
          <div className="fixed z-50 bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()} style={{ top: 'calc(env(safe-area-inset-top) + 8px)', left: '2%', right: '2%', bottom: 'calc(env(safe-area-inset-bottom) + 86px)' }}>
            {/* Header Bar */}
            <div className="shrink-0 bg-white border-b border-slate-200/70 flex items-center justify-between px-4 py-3" style={{ fontSize: '112%' }}>
              <div className="flex items-center gap-3 min-w-0">
                <Clock size={16} className={`shrink-0 ${timeUrgency.type === 'critical' ? 'text-rose-600' : timeUrgency.type === 'warning' ? 'text-orange-500' : 'text-blue-600'}`} strokeWidth={2.5} />
                <span className={`font-black tracking-tight ${timeUrgency.type === 'critical' ? 'text-rose-600' : timeUrgency.type === 'warning' ? 'text-orange-500' : 'text-slate-900'}`}>
                  {task.time || 'TBD'}
                </span>
                <span className="font-bold text-slate-800 truncate">{task.patient || task.patientName}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge status={task.status} />
                <button onClick={() => onToggle(task.id)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
                  <ChevronDown size={18} className="rotate-180" strokeWidth={2} />
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3" style={{ fontSize: '112%' }}>
              {/* Tags Row */}
              <div className="flex flex-wrap gap-2 pb-3 border-b border-slate-100 mb-3">
                {task.bookingId && (
                  <span className="text-[0.75em] font-mono font-extrabold text-blue-600 bg-blue-50 px-2 py-1 rounded-md border border-blue-100 shrink-0">
                    Trip: {task.bookingId}
                  </span>
                )}
                {(task.details?.passengerType) && (
                  <div className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-[0.75em] font-bold border border-blue-100">
                    <User size={12} /> {task.details.passengerType.split(',')[0]}
                  </div>
                )}
                {(task.details?.passengerType || '').includes('ESC') && (
                  <div className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md text-[0.75em] font-bold border border-indigo-100">
                    <Users size={12} /> Escort
                  </div>
                )}
                {task.details?.mobility && task.details.mobility !== 'WLK' && (
                  <div className="flex items-center gap-1 bg-orange-50 text-orange-700 px-2 py-1 rounded-md text-[0.75em] font-bold border border-orange-100">
                    <Accessibility size={12} /> {task.details.mobility}
                  </div>
                )}
                {task.tags?.map((tag, i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={(e) => { e.stopPropagation(); actions?.onScheduleEdit?.(task); }}
                    className="flex items-center gap-1 bg-slate-50 text-slate-600 px-2 py-1 rounded-md text-[0.75em] font-semibold border border-slate-200 hover:bg-slate-100 cursor-pointer"
                  >
                    {tag}
                  </button>
                ))}
              </div>

              {/* Notes */}
              {(task.notes || task.details?.generalComments) && (
                <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg p-2 flex gap-2 items-start">
                  <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-amber-800 text-[0.75em] font-medium leading-snug">{task.notes || task.details.generalComments}</p>
                </div>
              )}

              {/* Pickup / Dropoff */}
              <div className="space-y-0 mb-4">
                {/* Pickup */}
                <div className="flex items-stretch gap-3 mb-3">
                  <div className="flex flex-col items-center pt-1.5">
                    <div className="w-3 h-3 rounded-full bg-blue-500 ring-2 ring-blue-100"></div>
                    <div className="w-0.5 flex-1 bg-slate-200 mt-0.5"></div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-blue-600 text-[0.6875em] font-extrabold uppercase tracking-widest mb-1">
                      <Navigation size={12} /> Pickup
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                          {pickupSiteName && pickupSiteName !== pickupAddress && (
                            <h4 className="text-slate-900 font-bold text-[0.875em] flex items-center gap-1.5 mb-1 leading-tight">
                              {getSiteIcon(pickupSiteName)} {pickupSiteName}
                            </h4>
                          )}
                          <p className="text-slate-600 text-[0.75em] leading-tight">{pickupAddress}</p>
                        </div>
                        <div className="flex shrink-0 gap-1 items-center">
                          <button onClick={(e) => { e.stopPropagation(); handleCopy(pickupAddress, 'pickup'); }}
                            className="bg-white border border-slate-200 text-slate-600 p-1.5 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
                            {copiedId === 'pickup' ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                          </button>
                          {actions?.onNavigatePickup && (
                            <button onClick={(e) => { e.stopPropagation(); actions.onNavigatePickup(task); }}
                              className="bg-blue-50 border border-blue-100 text-blue-700 p-1.5 rounded-xl hover:bg-blue-100 transition-colors shadow-sm">
                              <Navigation size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                      {(actions?.onCall || actions?.onSms) && (
                        <div className="flex items-center gap-2 mt-2">
                          {actions?.onCall && (
                            <button onClick={(e) => { e.stopPropagation(); actions.onCall(task); }}
                              className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-xl hover:bg-blue-100 hover:border-blue-300 hover:shadow-md active:scale-95 transition-all text-[0.75em] font-bold flex items-center gap-1.5 shadow-sm">
                              <PhoneCall size={12} /> Call
                            </button>
                          )}
                          {actions?.onSms && (
                            <button onClick={(e) => { e.stopPropagation(); actions.onSms(task); }}
                              className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-xl hover:bg-indigo-100 hover:border-indigo-300 hover:shadow-md active:scale-95 transition-all text-[0.75em] font-bold flex items-center gap-1.5 shadow-sm">
                              <MessageCircle size={12} /> SMS
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Dropoff */}
                <div className="flex items-stretch gap-3">
                  <div className="flex flex-col items-center pb-1.5">
                    <div className="w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-emerald-100"></div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-emerald-600 text-[0.6875em] font-extrabold uppercase tracking-widest mb-1">
                      <MapPin size={12} /> Dropoff
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                          {dropoffSiteName && dropoffSiteName !== dropoffAddress && (
                            <h4 className="text-slate-900 font-bold text-[0.875em] flex items-center gap-1.5 mb-1 leading-tight">
                              {getSiteIcon(dropoffSiteName)} {dropoffSiteName}
                            </h4>
                          )}
                          <p className="text-slate-600 text-[0.75em] leading-tight">{dropoffAddress}</p>
                        </div>
                        <div className="flex shrink-0 gap-1 items-center">
                          <button onClick={(e) => { e.stopPropagation(); handleCopy(dropoffAddress, 'dropoff'); }}
                            className="bg-white border border-slate-200 text-slate-600 p-1.5 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
                            {copiedId === 'dropoff' ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                          </button>
                          {actions?.onNavigateDropoff && (
                            <button onClick={(e) => { e.stopPropagation(); actions.onNavigateDropoff(task); }}
                              className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-1.5 rounded-xl hover:bg-emerald-100 transition-colors shadow-sm">
                              <Navigation size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                      {(actions?.onCall || actions?.onSms) && (
                        <div className="flex items-center gap-2 mt-2">
                          {actions?.onCall && (
                            <button onClick={(e) => { e.stopPropagation(); actions.onCall(task); }}
                              className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-xl hover:bg-emerald-100 hover:border-emerald-300 hover:shadow-md active:scale-95 transition-all text-[0.75em] font-bold flex items-center gap-1.5 shadow-sm">
                              <PhoneCall size={12} /> Call
                            </button>
                          )}
                          {actions?.onSms && (
                            <button onClick={(e) => { e.stopPropagation(); actions.onSms(task); }}
                              className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-xl hover:bg-indigo-100 hover:border-indigo-300 hover:shadow-md active:scale-95 transition-all text-[0.75em] font-bold flex items-center gap-1.5 shadow-sm">
                              <MessageCircle size={12} /> SMS
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Workflow / Action Buttons */}
              <div className="pt-3 border-t border-slate-100 mb-3">
                {actions?.renderWorkflow ? (
                  actions.renderWorkflow(task)
                ) : !isTerminal ? (
                  <div className="space-y-2">
                    {actions?.onPrimary && (
                      <div className="flex items-center gap-2">
                         <button onClick={(e) => { e.stopPropagation(); actions.onPrimary(task); }}
                           className="flex-[4] h-11 bg-slate-900 text-white font-bold text-[0.875em] rounded-xl hover:bg-slate-800 transition-colors shadow-sm flex items-center justify-center gap-2">
                          {actions.primaryLabel || 'Start'} <Navigation size={14} />
                        </button>
                        {actions?.onSkipNav && (
                          <button onClick={(e) => { e.stopPropagation(); actions.onSkipNav(task); }}
                           className="flex-1 h-11 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors text-[0.75em] font-bold flex items-center justify-center gap-1">
                             <Forward size={14} /> Skip
                          </button>
                        )}
                      </div>
                    )}
                    <div className="flex gap-2">
                      {actions?.onNoShow && (
                         <button onClick={(e) => { e.stopPropagation(); actions.onNoShow(task); }}
                           className="flex-1 h-10 flex items-center justify-center gap-1 bg-rose-50 text-rose-600 font-bold rounded-xl hover:bg-rose-100 transition-all text-[0.75em] border border-rose-100">
                          <AlertCircle size={12} /> No Show
                        </button>
                      )}
                      {actions?.onCancel && (
                         <button onClick={(e) => { e.stopPropagation(); actions.onCancel(task); }}
                           className="flex-1 h-10 flex items-center justify-center gap-1 bg-white text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all text-[0.75em] border border-slate-200">
                          <XCircle size={12} /> Cancel
                        </button>
                      )}
                      {actions?.onReroute && (
                         <button onClick={(e) => { e.stopPropagation(); actions.onReroute(task); }}
                           className="flex-1 h-10 flex items-center justify-center gap-1 bg-purple-50 text-purple-700 font-bold rounded-xl hover:bg-purple-100 transition-all text-[0.75em] border border-purple-200">
                          <RefreshCw size={12} /> Rerouted
                        </button>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Extra Utility Buttons */}
              <div className="flex items-center gap-1 justify-center flex-wrap mb-2">
                {task.details?.distance && (
                  <span className="px-2 py-1 bg-slate-50 text-slate-600 rounded-lg text-[0.625em] font-bold flex items-center gap-1 border border-slate-200">
                    <Ruler size={10} /> {task.details.distance}
                  </span>
                )}
                {actions?.onContacts && (
                  <button onClick={(e) => { e.stopPropagation(); actions.onContacts(task); }}
                    className="px-2 py-1 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors text-[0.625em] font-bold flex items-center gap-1 border border-slate-200">
                    <PhoneForwarded size={10} /> Contacts
                  </button>
                )}
                {actions?.onRevert && !isTerminal && (
                  <button onClick={(e) => { e.stopPropagation(); actions.onRevert(task); }}
                    className="px-2 py-1 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors text-[0.625em] font-bold flex items-center gap-1 border border-slate-200">
                    <RotateCcw size={10} /> Back
                  </button>
                )}
                {actions?.onEditTrip && !isTerminal && (
                  <button onClick={(e) => { e.stopPropagation(); actions.onEditTrip(task); }}
                    className="px-2 py-1 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors text-[0.625em] font-bold flex items-center gap-1 border border-slate-200">
                    <Edit2 size={10} /> Edit
                  </button>
                )}
                {actions?.onTransfer && !isTerminal && (
                  <button onClick={(e) => { e.stopPropagation(); actions.onTransfer(task); }}
                    className="px-2 py-1 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors text-[0.625em] font-bold flex items-center gap-1 border border-amber-200">
                    <Forward size={10} /> Transfer
                  </button>
                )}
              </div>

              {/* Close hint */}
              <div className="flex justify-center mt-1" onClick={(e) => { e.stopPropagation(); onToggle(task.id); }}>
                <ChevronDown size={16} className="text-slate-300 hover:text-slate-500 rotate-180 cursor-pointer transition-colors" />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default TaskCard;
export { StatusBadge, getTimeUrgency, getSiteIcon };
