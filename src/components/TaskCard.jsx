import { memo, useState, useEffect, useRef } from 'react';

import {
  MapPin, Navigation, Clock, User, PhoneCall,
  ChevronDown, XCircle, AlertCircle,
  Ruler, Users, Activity, Building, Home, Accessibility,
  Copy, Check, RotateCcw, PhoneForwarded, MessageCircle,
  Square, CheckSquare, RefreshCw, Forward,
  Edit2, Truck, X, MoreVertical
} from 'lucide-react';
import { MOBILE_MEDIA_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { ManifestTripCard, getTripCountdown, isTripActionTerminal, getManifestStatusBadge } from './trips/MobileTripManifest';
import { getTripActionCapabilities } from './trips/tripActionPolicy';

const StatusBadge = ({ status }) => {
  const badge = getManifestStatusBadge(status);
  const Icon = badge.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${badge.cls}`}>
      {Icon && <Icon size={10} />} {status || 'Pending'}
    </span>
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

export const areTaskCardValuesEqual = (left, right) => {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => areTaskCardValuesEqual(value, right[index]));
  }
  const leftPrototype = Object.getPrototypeOf(left);
  const rightPrototype = Object.getPrototypeOf(right);
  if ((leftPrototype !== Object.prototype && leftPrototype !== null)
    || (rightPrototype !== Object.prototype && rightPrototype !== null)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key)
      && areTaskCardValuesEqual(left[key], right[key]));
};

const actionShapeCache = new Map();

export const getTaskCardActionShape = (actions = {}) => {
  const entries = Object.keys(actions).sort().map((key) => [
    key,
    typeof actions[key] === 'function' ? 'function' : JSON.stringify(actions[key]),
  ]);
  const signature = JSON.stringify(entries);
  if (!actionShapeCache.has(signature)) actionShapeCache.set(signature, signature);
  return actionShapeCache.get(signature);
};

export const createTaskCardActionsBridge = (shape, getCurrentProps) => {
  let entries = [];
  try { entries = JSON.parse(shape); } catch { return {}; }
  return Object.fromEntries(entries.map(([key, type]) => [
    key,
    type === 'function'
      ? (...args) => getCurrentProps()?.actions?.[key]?.(...args)
      : getCurrentProps()?.actions?.[key],
  ]));
};

export const getTaskCardMobileActionAccess = ({ task, role, workflowReadOnly = false } = {}) => {
  const hasAssignedDriver = Boolean(
    task?.driverId
    || task?.driverEmail
    || task?.driverName
  );
  const capabilities = getTripActionCapabilities({ role, trip: task, hasAssignedDriver });
  const canMutateDriverWorkflow = !workflowReadOnly
    && capabilities.isDriver
    && capabilities.canOpenWorkflow
    && !capabilities.isTerminal;

  return {
    ...capabilities,
    canOpenProgress: capabilities.canOpenWorkflow,
    canReportException: canMutateDriverWorkflow && capabilities.canReportWorkflowException,
    canRequestTransfer: canMutateDriverWorkflow && capabilities.canRequestTransfer,
    canSelectForRoutePlan: canMutateDriverWorkflow,
  };
};

const TaskCard = ({ task, expandedId, onToggle, isSelected, onSelect, actions, role, workflowReadOnly = false }) => {
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);
  const isExpanded = expandedId === task.id;
  const isAnotherExpanded = expandedId !== null && expandedId !== undefined && expandedId !== task.id;
  const [copiedId, setCopiedId] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen || !isMobile) return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobile, menuOpen]);

  const timeUrgency = getTimeUrgency(task);
  const isTerminal = isTripActionTerminal(task);
  const dropoffAddress = task.dropoff?.address || task.dropoff || '';
  const dropoffSiteName = (task.dropoff?.site || task.dropoffSite || '').trim();
  const pickupAddress = task.pickup?.address || task.pickup || '';
  const pickupSiteName = (task.pickup?.site || task.pickupSite || '').trim();

  useEffect(() => {
    if (!isExpanded) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isExpanded]);

  const handleCopy = (text, id) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(''), 2000);
  };

  if (isMobile) {
    const mobileTrip = {
      ...task,
      pickup: pickupAddress,
      dropoff: dropoffAddress,
      pickupCity: task.pickupCity || task.pickup?.city || '',
      dropoffCity: task.dropoffCity || task.dropoff?.city || '',
    };
    const mobileAccess = getTaskCardMobileActionAccess({ task: mobileTrip, role, workflowReadOnly });
    const canOpenProgress = mobileAccess.canOpenProgress && typeof onToggle === 'function';
    const parsedLegs = Number.parseInt(String(task.legs || '1'), 10);
    const legs = Number.isFinite(parsedLegs) && parsedLegs > 0 ? parsedLegs : 1;
    const menuActions = [
      actions?.onContacts && mobileAccess.canCommunicate && { label: 'Contacts', icon: <PhoneForwarded size={17} />, onSelect: () => actions.onContacts(task) },
      actions?.onNoShow && mobileAccess.canReportException && { label: 'No Show', icon: <AlertCircle size={17} />, tone: 'text-orange-700 bg-orange-50', onSelect: () => actions.onNoShow(task) },
      actions?.onCancel && mobileAccess.canReportException && { label: 'Cancel Trip', icon: <XCircle size={17} />, tone: 'text-rose-700 bg-rose-50', onSelect: () => actions.onCancel(task) },
      actions?.onReroute && mobileAccess.canReportException && { label: 'Reroute', icon: <RefreshCw size={17} />, tone: 'text-purple-700 bg-purple-50', onSelect: () => actions.onReroute(task) },
      actions?.onTransfer && mobileAccess.canRequestTransfer && { label: actions.transferLabel || 'Transfer', icon: <Forward size={17} />, tone: 'text-amber-700 bg-amber-50', onSelect: () => actions.onTransfer(task) },
      onSelect && mobileAccess.canSelectForRoutePlan && { label: isSelected ? 'Remove from route plan' : 'Select for route plan', icon: isSelected ? <CheckSquare size={17} /> : <Square size={17} />, onSelect: () => onSelect(task.id) },
      canOpenProgress && { label: isTerminal ? 'Review trip progress' : 'Open trip progress', icon: <Navigation size={17} />, tone: 'text-blue-700 bg-blue-50', onSelect: () => onToggle(task.id) },
    ].filter(Boolean);
    const iconActions = [
      actions?.onCall && mobileAccess.canCommunicate && { id: 'call', label: 'Call passenger', icon: PhoneCall, onClick: () => actions.onCall(task) },
      actions?.onSms && mobileAccess.canCommunicate && { id: 'message', label: 'Message passenger', icon: MessageCircle, onClick: () => actions.onSms(task) },
    ].filter(Boolean);

    return (
      <div className={`relative mb-1.5 rounded-xl transition-all [&_button]:!min-h-0 max-md:[&_button]:!min-h-0 ${isSelected ? 'ring-2 ring-blue-300' : ''}`}>
        <ManifestTripCard
          trip={mobileTrip}
          countdown={getTripCountdown(mobileTrip)}
          legs={legs}
          legsLabel={`${legs} ${legs === 1 ? 'Leg' : 'Legs'}`}
          onLegsClick={actions?.onShowLegs ? () => actions.onShowLegs(task) : undefined}
          mileage={task.details?.distance || null}
          driverName={task.driverName || 'You'}
          selected={isSelected}
          onSelect={onSelect ? () => onSelect(task.id) : undefined}
          selectSlot={onSelect ? (
            <button
              type="button"
              role="checkbox"
              aria-checked={!!isSelected}
              aria-label={`${isSelected ? 'Deselect' : 'Select'} trip for ${task.patient || task.patientName || 'trip'}`}
              onClick={(e) => { e.stopPropagation(); onSelect(task.id); }}
              className="w-[18px] h-[18px] rounded border border-slate-300 flex items-center justify-center cursor-pointer transition-colors bg-white shrink-0"
            >
              {isSelected && (
                <div className="w-full h-full bg-blue-600 border-blue-600 flex items-center justify-center rounded-[2px]">
                  <Check size={11} className="text-white" strokeWidth={3} />
                </div>
              )}
            </button>
          ) : null}
          onCardClick={canOpenProgress ? () => onToggle(task.id) : undefined}
          primaryAction={canOpenProgress ? { label: 'Drive', onClick: () => onToggle(task.id) } : null}
          iconActions={iconActions}
          moreIcon={MoreVertical}
          onMore={actions?.onOptions ? () => actions.onOptions(task) : (menuActions.length > 0 ? () => setMenuOpen(true) : null)}
          moreLabel={`More actions for ${task.patient || task.patientName || 'trip'}`}
          onTimeEdit={actions?.onTimeEdit || actions?.onScheduleEdit}
          hideCountdown={isMobile}
          mutedAddress={isMobile}
        />
        {menuOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={`Trip actions for ${task.patient || task.patientName || 'trip'}`}>
            <button type="button" className="absolute inset-0 bg-slate-950/45" onClick={() => setMenuOpen(false)} aria-label="Close trip actions" />
            <div ref={menuRef} className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white px-4 pt-2 shadow-2xl" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))' }}>
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300" />
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="min-w-0 truncate text-sm font-semibold text-slate-900">{task.patient || task.patientName || 'Trip'}</h3>
                <button autoFocus type="button" onClick={() => setMenuOpen(false)} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600" aria-label="Close trip actions"><X size={17} /></button>
              </div>
              <div className="space-y-1">
                {menuActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => { setMenuOpen(false); action.onSelect(); }}
                    className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-4 text-left text-sm font-semibold ${action.tone || 'bg-slate-50 text-slate-700'}`}
                  >
                    {action.icon} {action.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={isExpanded ? undefined : { contentVisibility: 'auto', containIntrinsicSize: '220px' }}
      className={`agape-card-cv relative bg-white rounded-xl mb-2
        ${isExpanded ? 'shadow-lg ring-2 ring-blue-500/10' : 'shadow-sm border border-slate-200/60 hover:shadow-md hover:border-slate-200'}
        ${isAnotherExpanded ? 'opacity-35 scale-[0.98] pointer-events-none' : ''}
        ${!isExpanded && timeUrgency.type === 'critical' ? 'border-rose-300 shadow-rose-100/50 bg-rose-50/50' : ''}
        ${!isExpanded && timeUrgency.type === 'warning' ? 'border-orange-300/60' : ''}
      `}
    >
      {/* Collapsed Header */}
      <div
        className={`agape-press-target relative cursor-pointer select-none transition-colors ${isExpanded ? 'shrink-0' : ''} ${
          !isExpanded && timeUrgency.type === 'critical' ? 'bg-rose-50/80 hover:bg-rose-50' :
          !isExpanded && timeUrgency.type === 'warning' ? 'bg-orange-50/20 hover:bg-orange-50/40' :
          'hover:bg-slate-50/50'
        }`}
        onClick={() => onToggle(task.id)}
      >
        {timeUrgency.type !== 'normal' && (
          <div className={`absolute left-0 top-6 w-1.5 h-12 rounded-r-full ${
            timeUrgency.type === 'critical' ? 'bg-rose-500' : 'bg-orange-400'
          }`} />
        )}

        <div className="px-2.5 py-2.5 sm:p-4">
          <div className="flex justify-between items-center mb-1">
            <div className="flex items-center gap-2 min-w-0 pr-2">
              {onSelect && (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={!!isSelected}
                  onClick={(e) => { e.stopPropagation(); onSelect(task.id); }}
                  className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg cursor-pointer"
                  aria-label={`${isSelected ? 'Deselect' : 'Select'} trip for ${task.patient || task.patientName || 'trip'}`}
                >
                  <div
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                      isSelected ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
                  </div>
                </button>
              )}
              <div
                className={`-ml-1 flex items-center gap-1.5 rounded-xl px-1 py-0.5 ${actions?.onScheduleEdit ? 'hover:bg-white/70' : ''}`}
              >
                <Clock size={timeUrgency.type === 'critical' ? 16 : 14} className={`shrink-0 ${
                  timeUrgency.type === 'critical' ? 'text-rose-600' :
                  timeUrgency.type === 'warning' ? 'text-orange-500' :
                  isExpanded ? 'text-blue-600' : 'text-slate-400'
                }`} strokeWidth={timeUrgency.type === 'normal' ? 2.5 : 3} />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); (actions?.onTimeEdit || actions?.onScheduleEdit)?.(task); }}
                  className={`text-[17px] font-black tracking-tight whitespace-nowrap hover:underline cursor-pointer ${
                    timeUrgency.type === 'critical' ? 'text-rose-600' :
                    timeUrgency.type === 'warning' ? 'text-orange-500' :
                    'text-slate-900'
                  }`}
                  title="Update schedule"
                >
                  {task.time || 'TBD'}
                </button>
                {actions?.onScheduleEdit && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); actions.onScheduleEdit(task); }}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white hover:text-blue-600"
                    title="Update time, Will Call, IN/OUT, or urgent deadline"
                    aria-label={`Edit schedule for ${task.patient || task.patientName || 'trip'}`}
                  >
                    <Edit2 size={15} />
                  </button>
                )}
              </div>
              {timeUrgency.type !== 'normal' && (
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap ${
                  timeUrgency.type === 'critical' ? 'bg-rose-50 text-rose-600' :
                  'bg-orange-50 text-orange-600'
                }`}>
                  {timeUrgency.label || (timeUrgency.isPastDue ? 'Past due' : `${timeUrgency.diff}m away`)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {task.legs && (
                <button onClick={(e) => { e.stopPropagation(); actions?.onShowLegs?.(task); }}
                  className={`border px-2 py-0.5 rounded-lg text-[9px] font-bold tracking-wider cursor-pointer transition-colors ${
                    isExpanded ? 'border-indigo-100 text-indigo-600 bg-indigo-50' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}>
                  {task.legs}
                </button>
              )}
              {/* Status always visible — the card must answer state at a glance */}
              <StatusBadge status={task.status} />
              {actions?.onOptions ? (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); actions.onOptions(task); }}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
                  aria-label={`Options for ${task.patient || task.patientName || 'trip'}`}
                  title="More options"
                >
                  <MoreVertical size={16} strokeWidth={2} />
                </button>
              ) : !isExpanded && !isTerminal && actions && (actions.onNoShow || actions.onCancel || actions.onReroute || actions.onTransfer) && (
                <div className="relative" ref={menuRef}>
                  <button onClick={(e) => { e.stopPropagation(); setMenuOpen(prev => !prev); }} className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
                    <MoreVertical size={16} strokeWidth={2} />
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200/60 rounded-xl shadow-lg py-1 min-w-[150px] overflow-hidden">
                      {actions?.onNoShow && (
                        <button onClick={(e) => { e.stopPropagation(); actions.onNoShow(task); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors text-left">
                          <AlertCircle size={14} /> No Show
                        </button>
                      )}
                      {actions?.onCancel && (
                        <button onClick={(e) => { e.stopPropagation(); actions.onCancel(task); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors text-left">
                          <XCircle size={14} /> Cancel Trip
                        </button>
                      )}
                      {actions?.onReroute && (
                        <button onClick={(e) => { e.stopPropagation(); actions.onReroute(task); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50 transition-colors text-left">
                          <RefreshCw size={14} /> Rerouted
                        </button>
                      )}
                      {actions?.onTransfer && (
                        <button onClick={(e) => { e.stopPropagation(); actions.onTransfer(task); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 transition-colors text-left">
                          <Forward size={14} /> {actions.transferLabel || 'Transfer'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                      )}
                    </div>
                </div>

          <div className="flex justify-between items-center mb-3">
            <h3 className="text-[15px] font-semibold text-slate-800 truncate min-w-0 flex items-center gap-1.5">
              <span>{task.patient || task.patientName}</span>
              {(task.bookingId || task.id) && (
                <span className="shrink-0 px-1.5 py-0.5 rounded bg-slate-100 text-[11px] font-mono font-semibold text-slate-600 border border-slate-200">
                  #{task.bookingId || task.id}
                </span>
              )}
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
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-emerald-100/70 bg-emerald-50/60 p-1.5 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 leading-none">Pickup</p>
                <p className="mt-1 truncate text-[13px] font-semibold leading-tight text-slate-600" title={pickupAddress}>{pickupAddress || '—'}</p>
              </div>
              <div className="rounded-lg border border-rose-100/70 bg-rose-50/60 p-1.5 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-rose-700 leading-none">Dropoff</p>
                  {task.details?.distance && (
                    <span className="rounded border border-slate-200/70 bg-white/90 px-1.5 py-px text-[11px] font-bold tabular-nums text-slate-700 shadow-sm">{task.details.distance}</span>
                  )}
                </div>
                <p className="mt-1 truncate text-[13px] font-semibold leading-tight text-slate-600" title={dropoffAddress}>{dropoffAddress || '—'}</p>
              </div>
            </div>
          )}

          {/* Drive — opens the trip work page (current progress: start trip,
              navigate, arrived, odometer, complete). Tapping the card does the
              same; this button makes the workflow entry explicit. */}
          {!isExpanded && !isTerminal && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggle(task.id); }}
              className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-xs font-bold text-white shadow-sm active:scale-[0.99] transition-transform hover:bg-blue-700"
              aria-label={`${task.activeTrip ? 'Continue' : 'Drive'} trip for ${task.patient || task.patientName || 'client'}`}
            >
              <Navigation size={13} /> {task.activeTrip ? 'Continue' : 'Drive'}
            </button>
          )}
        </div>
      </div>

      {/* Expanded Content - Full Screen Overlay */}
      {isExpanded && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-slate-900/30 z-40 transition-opacity duration-200" onClick={() => onToggle(task.id)} />
          {/* Modal Card */}
          <div className="fixed z-50 bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()} style={{ top: 'calc(env(safe-area-inset-top) + 8px)', left: '2%', right: '2%', bottom: 'calc(env(safe-area-inset-bottom) + 86px)' }}>
            {/* Header Bar */}
            <div className="shrink-0 bg-white border-b border-slate-100 flex items-center justify-between px-4 py-3" style={{ fontSize: '112%' }}>
              <div className="flex items-center gap-3 min-w-0">
                <Clock size={16} className={`shrink-0 ${timeUrgency.type === 'critical' ? 'text-rose-600' : timeUrgency.type === 'warning' ? 'text-orange-500' : 'text-blue-600'}`} strokeWidth={2.5} />
                <span className={`font-black tracking-tight ${timeUrgency.type === 'critical' ? 'text-rose-600' : timeUrgency.type === 'warning' ? 'text-orange-500' : 'text-slate-900'}`}>
                  {task.time || 'TBD'}
                </span>
                <span className="font-semibold text-slate-800 truncate">{task.patient || task.patientName}</span>
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
                  <span className="text-[0.75em] font-mono font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg border border-blue-200/60 shrink-0">
                    Trip: {task.bookingId}
                  </span>
                )}
                {(task.details?.passengerType) && (
                  <div className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded-lg text-[0.75em] font-semibold border border-blue-200/60">
                    <User size={12} /> {task.details.passengerType.split(',')[0]}
                  </div>
                )}
                {(task.details?.passengerType || '').includes('ESC') && (
                  <div className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg text-[0.75em] font-semibold border border-indigo-200/60">
                    <Users size={12} /> Escort
                  </div>
                )}
                {task.details?.mobility && task.details.mobility !== 'WLK' && (
                  <div className="flex items-center gap-1 bg-orange-50 text-orange-700 px-2 py-1 rounded-lg text-[0.75em] font-semibold border border-orange-200/60">
                    <Accessibility size={12} /> {task.details.mobility}
                  </div>
                )}
                {task.tags?.map((tag, i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={(e) => { e.stopPropagation(); actions?.onScheduleEdit?.(task); }}
                    className="flex items-center gap-1 bg-slate-50 text-slate-600 px-2 py-1 rounded-lg text-[0.75em] font-medium border border-slate-200/60 hover:bg-slate-100 cursor-pointer"
                  >
                    {tag}
                  </button>
                ))}
              </div>

              {/* Pickup / Dropoff */}
              <div className="relative pl-5 space-y-3 mb-4 before:content-[''] before:absolute before:left-[7px] before:top-3 before:bottom-3 before:w-[1.5px] before:border-l-[1.5px] before:border-dashed before:border-slate-300">
                {/* Pickup */}
                <div className="relative">
                  <div className="absolute -left-5 top-1.5 w-3 h-3 rounded-full border-2 border-emerald-500 bg-white" />
                  <div className="flex items-center gap-1.5 text-emerald-600 text-[0.6875em] font-extrabold uppercase tracking-widest mb-1">
                    <Navigation size={12} /> Pickup
                  </div>
                    <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-3">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                          {pickupSiteName && pickupSiteName !== pickupAddress && (
                            <h4 className="text-slate-900 font-semibold text-[0.875em] flex items-center gap-1.5 mb-1 leading-tight">
                              {getSiteIcon(pickupSiteName)} {pickupSiteName}
                            </h4>
                          )}
                          <p className="text-slate-600 text-[0.75em] leading-tight">{pickupAddress}</p>
                          {(task.pickupCity || task.pickup?.city) && (
                            <p className="text-slate-400 text-[0.6875em] font-medium leading-tight mt-0.5">{task.pickupCity || task.pickup?.city}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1 items-center">
                          <button onClick={(e) => { e.stopPropagation(); handleCopy(pickupAddress, 'pickup'); }}
                            className="bg-white border border-slate-200/80 text-slate-600 p-1.5 rounded-lg hover:bg-slate-50 transition-colors">
                            {copiedId === 'pickup' ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                          </button>
                          {actions?.onNavigatePickup && (
                            <button onClick={(e) => { e.stopPropagation(); actions.onNavigatePickup(task); }}
                              className="bg-blue-50 border border-blue-100 text-blue-700 p-1.5 rounded-lg hover:bg-blue-100 transition-colors">
                              <Navigation size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                      {(actions?.onCall || actions?.onSms) && (
                        <div className="flex items-center gap-2 mt-2">
                          {actions?.onCall && (
                            <button onClick={(e) => { e.stopPropagation(); actions.onCall(task); }}
                              className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100 hover:border-blue-300 transition-all text-[0.75em] font-semibold flex items-center gap-1.5">
                              <PhoneCall size={12} /> Call
                            </button>
                          )}
                          {actions?.onSms && (
                            <button onClick={(e) => { e.stopPropagation(); actions.onSms(task); }}
                              className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-100 hover:border-indigo-300 transition-all text-[0.75em] font-semibold flex items-center gap-1.5">
                              <MessageCircle size={12} /> SMS
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                </div>

                {/* Dropoff */}
                <div className="relative">
                  <div className="absolute -left-5 top-1.5 w-3 h-3 rounded-full border-2 border-rose-500 bg-white" />
                  <div className="flex items-center gap-1.5 text-rose-600 text-[0.6875em] font-extrabold uppercase tracking-widest mb-1">
                    <MapPin size={12} /> Dropoff
                  </div>
                    <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-3">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                          {dropoffSiteName && dropoffSiteName !== dropoffAddress && (
                            <h4 className="text-slate-900 font-semibold text-[0.875em] flex items-center gap-1.5 mb-1 leading-tight">
                              {getSiteIcon(dropoffSiteName)} {dropoffSiteName}
                            </h4>
                          )}
                          <p className="text-slate-600 text-[0.75em] leading-tight">{dropoffAddress}</p>
                          {(task.dropoffCity || task.dropoff?.city) && (
                            <p className="text-slate-400 text-[0.6875em] font-medium leading-tight mt-0.5">{task.dropoffCity || task.dropoff?.city}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1 items-center">
                          <button onClick={(e) => { e.stopPropagation(); handleCopy(dropoffAddress, 'dropoff'); }}
                            className="bg-white border border-slate-200/80 text-slate-600 p-1.5 rounded-lg hover:bg-slate-50 transition-colors">
                            {copiedId === 'dropoff' ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                          </button>
                          {actions?.onNavigateDropoff && (
                            <button onClick={(e) => { e.stopPropagation(); actions.onNavigateDropoff(task); }}
                              className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-1.5 rounded-lg hover:bg-emerald-100 transition-colors">
                              <Navigation size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                      {(actions?.onCall || actions?.onSms) && (
                        <div className="flex items-center gap-2 mt-2">
                          {actions?.onCall && (
                            <button onClick={(e) => { e.stopPropagation(); actions.onCall(task); }}
                              className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg hover:bg-emerald-100 hover:border-emerald-300 transition-all text-[0.75em] font-semibold flex items-center gap-1.5">
                              <PhoneCall size={12} /> Call
                            </button>
                          )}
                          {actions?.onSms && (
                            <button onClick={(e) => { e.stopPropagation(); actions.onSms(task); }}
                              className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-100 hover:border-indigo-300 transition-all text-[0.75em] font-semibold flex items-center gap-1.5">
                              <MessageCircle size={12} /> SMS
                            </button>
                          )}
                        </div>
                      )}
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
                           className="flex-[4] h-11 bg-blue-600 text-white font-semibold text-[0.875em] rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                          {actions.primaryLabel || 'Start'} <Navigation size={14} />
                        </button>
                        {actions?.onSkipNav && (
                          <button onClick={(e) => { e.stopPropagation(); actions.onSkipNav(task); }}
                           className="flex-1 h-11 bg-blue-600 text-white font-semibold text-[0.875em] rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-1">
                             <MapPin size={14} /> I'm here
                          </button>
                        )}
                      </div>
                    )}
                    <div className="flex gap-2">
                      {actions?.onNoShow && (
                         <button onClick={(e) => { e.stopPropagation(); actions.onNoShow(task); }}
                           className="flex-1 h-10 flex items-center justify-center gap-1 bg-rose-50 text-rose-600 font-semibold rounded-xl hover:bg-rose-100 transition-all text-[0.75em] border border-rose-200/60">
                          <AlertCircle size={12} /> No Show
                        </button>
                      )}
                      {actions?.onCancel && (
                         <button onClick={(e) => { e.stopPropagation(); actions.onCancel(task); }}
                           className="flex-1 h-10 flex items-center justify-center gap-1 bg-white text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-all text-[0.75em] border border-slate-200">
                          <XCircle size={12} /> Cancel
                        </button>
                      )}
                      {actions?.onReroute && (
                         <button onClick={(e) => { e.stopPropagation(); actions.onReroute(task); }}
                           className="flex-1 h-10 flex items-center justify-center gap-1 bg-purple-50 text-purple-700 font-semibold rounded-xl hover:bg-purple-100 transition-all text-[0.75em] border border-purple-200/60">
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
                  <span className="px-2 py-1 bg-slate-50 text-slate-600 rounded-lg text-[0.625em] font-semibold flex items-center gap-1 border border-slate-200/60">
                    <Ruler size={10} /> {task.details.distance}
                  </span>
                )}
                {actions?.onContacts && (
                  <button onClick={(e) => { e.stopPropagation(); actions.onContacts(task); }}
                    className="px-2 py-1 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors text-[0.625em] font-semibold flex items-center gap-1 border border-slate-200/60">
                    <PhoneForwarded size={10} /> Contacts
                  </button>
                )}
                {actions?.onRevert && !isTerminal && (
                  <button onClick={(e) => { e.stopPropagation(); actions.onRevert(task); }}
                    className="px-2 py-1 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors text-[0.625em] font-semibold flex items-center gap-1 border border-slate-200/60">
                    <RotateCcw size={10} /> Back
                  </button>
                )}
                {actions?.onEditTrip && !isTerminal && (
                  <button onClick={(e) => { e.stopPropagation(); actions.onEditTrip(task); }}
                    className="px-2 py-1 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors text-[0.625em] font-semibold flex items-center gap-1 border border-slate-200/60">
                    <Edit2 size={10} /> Edit
                  </button>
                )}
                {actions?.onTransfer && !isTerminal && (
                  <button onClick={(e) => { e.stopPropagation(); actions.onTransfer(task); }}
                    className="px-2 py-1 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors text-[0.625em] font-semibold flex items-center gap-1 border border-amber-200/60">
                    <Forward size={10} /> {actions.transferLabel || 'Transfer'}
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

export const areTaskCardPropsEqual = (previous, next) => {
  if (previous.expandedId === previous.task?.id) return false;
  return previous.expandedId === next.expandedId
    && previous.isSelected === next.isSelected
    && previous.onToggle === next.onToggle
    && previous.onSelect === next.onSelect
    && previous.actions === next.actions
    && previous.role === next.role
    && previous.workflowReadOnly === next.workflowReadOnly
    && previous.timeEpochMinute === next.timeEpochMinute
    && areTaskCardValuesEqual(previous.task, next.task);
};

export default memo(TaskCard, areTaskCardPropsEqual);
