import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { timeToMinutes, tripCalendarDateKey, calendarDateKeyDaysAgo, localCalendarYmd, isTripDateToday } from '../utils/tripDate';
import { buildDriverServiceDateBuckets } from '../utils/portalSelectors';
import { latestWorkflowTimestamp, minuteEpoch, normalizeCompletionClocks } from '../utils/tripCompletionTimes';
import { auth, db, doc, setDoc, collection, serverTimestamp, query, where, EmailAuthProvider, reauthenticateWithCredential, saveOdometerReading, saveTripWorkflowUpdate, onSnapshot, functions, httpsCallable } from '../config/firebase';
import { optimizeRoute as aiOptimizeRoute } from '../config/ai';
import { getDistanceMiles, getTravelDuration, geocodeAddress } from '../config/maps';
import { showLocalNotification } from '../config/notifications';
import { playNotificationSound } from '../utils/notificationSound';
import { useChat } from '../hooks/useChat';
const DriverToolsPage = lazy(() => import('./DriverToolsPage'));
const ChatPage = lazy(() => import('./chat/ChatPage').then(m => ({ default: m.ChatPage })));
const OfflineIndicator = lazy(() => import('./pwa/OfflineIndicator'));
import { getDriverActiveRoutePlan, ROUTE_ASSIGNMENT_STATUS } from '../utils/routePlans';
import { useDriverLocationStream } from '../hooks/useDriverLocationStream';
const TaskCard = lazy(() => import('./TaskCard'));
import {
  Truck, MapPin, Phone, MessageCircle, PenLine, CheckCircle2, XCircle,
  AlertCircle, Navigation, Gauge, Clock, User, ChevronRight, Play, Check,
  ChevronLeft, ChevronDown, RotateCcw, Undo2, Lock, RefreshCw, Forward,
  Home, Settings, LogOut,
  ArrowRight, Search,
  Repeat, Zap, X, Route, Plus,
  CheckSquare, Map, BarChart3, Sun, Moon, Calendar,
  Download, FileText, AlertTriangle, Info,
  Copy, PhoneForwarded, Shield, Headphones, Building, Edit2, MoreHorizontal, Ruler, Crosshair, Wrench
} from 'lucide-react';
import { openNavigation, makeCall, sendSMS, showCallActionSheet } from '../utils/nativeActions';
import { tripMatchesSearch } from '../utils/search';
import {
  TIME_TRACKING_STATES,
  POLICY_MODES,
  calculateAnchor,
  calculateReturnToWorkFromPickup,
  estimateTravelTimeMinutes,
  validateArrival,
  classifyGap,
  generatePendingClockOut,
  buildTimeEvents,
} from '../utils/timeTracking';
import { impact, selection } from '../utils/haptics';
import { isNativeShell } from '../utils/platform';

import { buildContactList, getPrimaryContact, getContactWarning, formatPhoneDisplay, cleanPhone, getContactRoleIcon, getContactRoleActions } from '../utils/smartContacts';
import { normalizeEmail } from '../utils/accessControl';
import { annotateInOutPairs, isInOutTrip, stackInOutPairs, IN_OUT_WAIT_MINUTES } from '../utils/inOutTrips';
import { SkeletonTripCard } from './ui/Skeleton';
import { getDriverLiveStatus } from '../constants/statuses';
import ErrorBoundary from './ErrorBoundary';
import PlacesAutocompleteInput from './PlacesAutocompleteInput';
import { resolveDriverVehicle, resolveTripVehicle } from '../utils/vehiclePersistence';
import { getVehicleMaintenanceStatus } from '../utils/fleetMaintenance';
import { deriveVehicleOdometerState, evaluateOdometerEntry } from '../utils/vehicleOdometer';
import { compareTripsByCompletionAscending, getTripCompletionSortValue } from '../utils/tripChronology';
import { getDriverTelemetryBreadcrumbs } from '../utils/driverTelemetry';
import { safeDateMillis, toSafeIso, toValidDate } from '../utils/safeDate';
import { queueSyncOperation } from '../utils/localDB';
import { normalizeTenantId } from '../utils/tenantScope';

const RouteSequencerApp = lazy(() => import('./RouteSequencer'));
const LazyTimeTrackingAdmin = lazy(() => import('./TimeTrackingAdmin'));
const LazyFallback = () => <div className="flex items-center justify-center p-12"><div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" /></div>;

const isWillCall = (trip) => {
  if (trip?.urgentTrip) return false;
  if (isInOutTrip(trip)) return false;
  const t = (trip && typeof trip === 'object') ? trip.time : trip;
  if (t === undefined || t === null) return true;
  const s = String(t).toUpperCase().trim();
  return s === '' || s === 'WILL CALL' || s === 'WC';
};

const to12hr = (time) => {
  if (!time || time === 'Will Call' || time === 'WC') return time || 'Will Call';
  const m = String(time).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (m && m[3]) return time;
  const parts = String(time).match(/(\d{1,2}):(\d{2})/);
  if (!parts) return time;
  let h = parseInt(parts[1], 10);
  const min = parts[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${min} ${ampm}`;
};

const formatTimeInput = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (!isNaN(d.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const m = String(v).match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : v;
};

const mergeDriverEtaMeasurements = (previous, measurements) => {
  if (!measurements.length) return previous;
  const next = { ...previous };
  measurements.forEach(([tripId, minutes]) => { next[tripId] = minutes; });
  return next;
};

const getCompletionPickupBoundary = (trip) => latestWorkflowTimestamp(
  trip?.arrivalTime,
  trip?.pickupArrival,
  trip?.pickupArrivalTime,
  trip?.arrivedPickupAt,
);

// Shared live feedback for every odometer entry window: precise errors,
// typo warnings, and the explicit verification acknowledgment required
// before an unusual reading may be saved.
const OdometerGuardFeedback = ({ evaluation, ack, onAckChange, compact = false }) => {
  if (!evaluation || evaluation.status === 'empty' || evaluation.status === 'ok') return null;
  if (compact) {
    return (
      <div className="mt-2 space-y-1.5">
        {evaluation.errors.map((error, index) => (
          <p key={`odo-error-${index}`} className="text-xs font-semibold text-rose-600 text-center">{error}</p>
        ))}
        {evaluation.warnings.map((warning, index) => (
          <p key={`odo-warning-${index}`} className="text-xs font-semibold text-amber-600 text-center">{warning}</p>
        ))}
        {evaluation.status === 'confirm' && (
          <button type="button" onClick={() => onAckChange(!ack)} aria-pressed={ack} className={`w-full flex items-center gap-2 p-2 rounded-xl border transition cursor-pointer text-left ${ack ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
            <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition ${ack ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
              {ack && <Check size={10} className="text-white" />}
            </span>
            <span className="text-xs text-slate-600 font-medium">I read this number directly from the vehicle dashboard and verified every digit.</span>
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="mt-2 space-y-2">
      {evaluation.errors.map((error, index) => (
        <p key={`odo-error-${index}`} className="text-sm text-rose-700 font-semibold text-center bg-rose-50 rounded-xl px-4 py-3 border border-rose-200">{error}</p>
      ))}
      {evaluation.warnings.map((warning, index) => (
        <p key={`odo-warning-${index}`} className="text-sm text-amber-700 font-semibold text-center bg-amber-50 rounded-xl px-4 py-3 border border-amber-200">{warning}</p>
      ))}
      {evaluation.status === 'confirm' && (
        <button type="button" onClick={() => onAckChange(!ack)} aria-pressed={ack} className={`w-full flex items-center gap-3 p-3 rounded-xl border transition cursor-pointer text-left ${ack ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
          <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition ${ack ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
            {ack && <Check size={12} className="text-white" />}
          </span>
          <span className="text-sm text-slate-600 font-medium">I read this number directly from the vehicle dashboard and verified every digit.</span>
        </button>
      )}
    </div>
  );
};

const OdometerBaselineLine = ({ vehicleName, miles }) => (
  <p className="text-xs text-slate-500 mt-2">
    {vehicleName ? <span className="font-semibold text-slate-700">{vehicleName}</span> : null}
    {miles > 0
      ? <> · Last verified: <strong className="text-slate-700">{Math.round(miles).toLocaleString()} mi</strong></>
      : ' · No verified reading yet'}
  </p>
);

// Mobile soft keyboards only appear for focus that happens close to the
// user's tap. autoFocus alone is unreliable inside async React commits, so
// every trip-window opener calls this right after mounting its window.
const focusTripWindowInput = () => {
  setTimeout(() => {
    const el = document.querySelector('.trip-window-panel input[autofocus]');
    if (el) {
      try { el.focus({ preventScroll: true }); } catch { el.focus(); }
    }
  }, 80);
};

const calculateBoundaryTravel = async (origin, destination) => {
  if (!origin || !destination) return { minutes: 0, source: 'NO_ROUTE_EVIDENCE', confidence: 'missing' };
  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    try {
      const route = await getTravelDuration(origin, destination);
      if (route?.durationSeconds >= 0) {
        return {
          minutes: route.durationSeconds / 60,
          source: 'GOOGLE_ROUTE_DURATION',
          confidence: 'route_verified',
          distanceMiles: route.distanceMiles ?? null,
        };
      }
    } catch (error) {
      console.warn('Boundary route lookup failed; using GPS estimate:', error);
    }
  }
  const hasCoordinates = [origin?.lat, origin?.lng, destination?.lat, destination?.lng]
    .every((value) => Number.isFinite(Number(value)));
  if (!hasCoordinates) return { minutes: 0, source: 'NO_ROUTE_EVIDENCE', confidence: 'missing' };
  return {
    minutes: estimateTravelTimeMinutes(origin.lat, origin.lng, destination.lat, destination.lng),
    source: 'OFFLINE_GPS_ESTIMATE',
    confidence: 'route_estimate',
    distanceMiles: null,
  };
};

const timeInputOrBlank = (value) => {
  const formatted = formatTimeInput(value);
  return /^\d{2}:\d{2}$/.test(formatted) ? formatted : '';
};

const to12hrFromTimeInput = (value) => {
  if (!value) return '';
  const match = String(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value;
  return to12hr(`${match[1].padStart(2, '0')}:${match[2]}`);
};

const getUrgentDeadlineMs = (trip) => {
  if (!trip?.urgentDeadlineAt) return 0;
  const ms = new Date(trip.urgentDeadlineAt).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

const getUrgentCountdownText = (trip) => {
  const deadlineMs = getUrgentDeadlineMs(trip);
  if (!deadlineMs) return '';
  const diffMinutes = Math.ceil((deadlineMs - Date.now()) / 60000);
  const abs = Math.abs(diffMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const text = h > 0 ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
  return diffMinutes < 0 ? `${text} late` : `${text} left`;
};

const getTripCardTimeLabel = (trip) => {
  if (trip?.urgentTrip) {
    const deadline = trip.urgentDeadlineTime || timeInputOrBlank(trip.urgentDeadlineAt);
    return deadline ? `Due ${to12hrFromTimeInput(deadline)}` : 'URGENT';
  }
  if (isInOutTrip(trip) && !timeInputOrBlank(trip?.time)) return 'IN/OUT';
  return to12hr(trip?.time);
};

const formatDuration = (minutes) => {
  if (!minutes || minutes < 0) return '--';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
};

const buildFallbackDriverProfile = (email = '') => ({
  id: '',
  email,
  name: String(email || 'Driver').replace(/@auth\.agapecare\.local$/i, '').split('@')[0] || 'Driver',
  phone: '',
  status: 'Available',
  vehicle: '',
  currentZone: '',
  odometer: 0,
  nextOilChange: 5000,
  clockedIn: false,
});

const WORKFLOW_TERMINAL_STATUSES = new Set(['Completed', 'Cancelled', 'No Show', 'Rerouted', 'Transferred']);
const normalizeWorkflowStatus = (status) => String(status || '').trim().toLowerCase();
const DRIVER_HISTORY_LOOKBACK_DAYS = 14;
const getTripHistoryDateKey = (trip) => {
  const dateKey = tripCalendarDateKey(trip?.date);
  const completedKey = tripCalendarDateKey(trip?.completedAt);
  if (!dateKey) return completedKey;
  if (!completedKey) return dateKey;
  return dateKey > completedKey ? dateKey : completedKey;
};
const addDaysToDateKey = (dateKey, days) => {
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const formatHistoryDayLabel = (dateKey) => {
  if (!dateKey) return 'Date not set';
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};
const formatHistoryCompactDayLabel = (dateKey) => {
  if (!dateKey) return '--';
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};
const HISTORY_STATUS_META = {
  completed: { label: 'Completed', Icon: CheckCircle2, bg: 'bg-emerald-100 text-emerald-700', iconBg: 'bg-emerald-100 text-emerald-700', border: 'border-l-emerald-400' },
  'no show': { label: 'No Show', Icon: AlertTriangle, bg: 'bg-amber-100 text-amber-700', iconBg: 'bg-amber-100 text-amber-700', border: 'border-l-amber-400' },
  cancelled: { label: 'Cancelled', Icon: XCircle, bg: 'bg-rose-100 text-rose-700', iconBg: 'bg-rose-100 text-rose-700', border: 'border-l-rose-400' },
  rerouted: { label: 'Rerouted', Icon: Repeat, bg: 'bg-purple-100 text-purple-700', iconBg: 'bg-purple-100 text-purple-700', border: 'border-l-purple-400' },
};
const getHistoryStatusMeta = (status) => HISTORY_STATUS_META[normalizeWorkflowStatus(status)] || { label: status || 'Unknown', Icon: AlertTriangle, bg: 'bg-slate-100 text-slate-700', iconBg: 'bg-slate-100 text-slate-700', border: 'border-l-slate-400' };
const formatTripDetailClock = (value) => {
  if (!value) return '--';
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    const d = toValidDate(value);
    if (!d) return '--';
    return Number.isNaN(d.getTime()) ? '--' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    const d = new Date(value.seconds * 1000);
    return Number.isNaN(d.getTime()) ? '--' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '--' : `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }
  const s = String(value).trim();
  const d = new Date(s);
  if (!Number.isNaN(d.getTime()) && /[T/,-]/.test(s)) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const ampm = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const meridiem = ampm[3].toUpperCase();
    if (meridiem === 'PM' && h < 12) h += 12;
    if (meridiem === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${ampm[2]}`;
  }
  const hourOnly = s.match(/^(\d{1,2})\s*(AM|PM)$/i);
  if (hourOnly) {
    let h = parseInt(hourOnly[1], 10);
    const meridiem = hourOnly[2].toUpperCase();
    if (meridiem === 'PM' && h < 12) h += 12;
    if (meridiem === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:00`;
  }
  const hhmm = s.match(/^(\d{1,2}):(\d{2})/);
  if (hhmm) return `${String(hhmm[1]).padStart(2, '0')}:${hhmm[2]}`;
  return '--';
};
const formatTripDetailOdometer = (value) => {
  if (value === undefined || value === null || value === '') return '--';
  const s = String(value).trim();
  if (!s || /^\d{1,2}:\d{2}/.test(s)) return '--';
  const cleaned = s.replace(/,/g, '').replace(/\bmi(?:les)?\b/gi, '').trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return '--';
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? `${n.toLocaleString()} mi` : '--';
};
const formatTripDistance = (value) => {
  if (value === undefined || value === null || value === '') return '--';
  const s = String(value);
  return /\bmi\b/i.test(s) ? s : `${s} mi`;
};
const formatTripDetailValue = (value) => {
  if (value === undefined || value === null || value === '') return '--';
  if (typeof value === 'object') {
    return String(value.address || value.name || value.label || '--');
  }
  return String(value);
};
const getFirstTripValue = (trip, keys) => {
  for (const key of keys) {
    const value = trip?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
};
const getFirstTripClock = (trip, keys) => {
  for (const key of keys) {
    const value = trip?.[key];
    if (value === undefined || value === null || value === '') continue;
    const clock = formatTripDetailClock(value);
    if (clock !== '--') return clock;
  }
  return '--';
};
const getFirstTripOdometer = (trip, keys) => {
  for (const key of keys) {
    const value = trip?.[key];
    if (value === undefined || value === null || value === '') continue;
    const odometer = formatTripDetailOdometer(value);
    if (odometer !== '--') return odometer;
  }
  return '--';
};
const getHistoryFinishedSortMs = getTripCompletionSortValue;

const isoToTimeInput = (iso) => {
  if (!iso) return '';
  const raw = String(iso).trim();
  const ampm = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const meridiem = ampm[3].toUpperCase();
    if (meridiem === 'PM' && h < 12) h += 12;
    if (meridiem === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${ampm[2]}`;
  }
  const hhmm = raw.match(/^(\d{1,2}):(\d{2})/);
  if (hhmm) return `${hhmm[1].padStart(2, '0')}:${hhmm[2]}`;
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return ''; }
};

const timeToIsoForTripDate = (timeStr, tripDate) => {
  if (!timeStr) return '';
  const parts = String(timeStr).match(/(\d{1,2}):(\d{2})/);
  if (!parts) return '';
  const base = tripDate ? new Date(`${tripDate}T12:00:00`) : new Date();
  const d = Number.isNaN(base.getTime()) ? new Date() : base;
  d.setHours(parseInt(parts[1], 10), parseInt(parts[2], 10), 0, 0);
  return d.toISOString();
};

const parseOdometerInput = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const cleaned = String(value).replace(/,/g, '').trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const HistoryTripDetailTable = ({ trip, driver }) => {
  if (!trip) return null;
  const pickupClock = getFirstTripClock(trip, ['departedPickupTime', 'arrivalTime', 'pickupArrival', 'pickupArrivalTime', 'actualPickupTime', 'startTime']);
  const dropoffClock = getFirstTripClock(trip, ['arrivalDropoffTime', 'dropoffArrival', 'dropoffArrivalTime', 'actualDropoffTime', 'dropoffTime']);
  const pickupOdometer = getFirstTripOdometer(trip, ['pickupOdometer', 'startOdometer', 'startMileage', 'pickupMileage']);
  const dropoffOdometer = getFirstTripOdometer(trip, ['dropoffOdometer', 'endOdometer', 'endMileage', 'dropoffMileage']);
  const vehicle = resolveTripVehicle(trip, driver) || 'PENDING ASSIGNMENT';
  const rows = [
    { label: 'TRIP ID', value: formatTripDetailValue(trip.bookingId || trip.id), tone: 'blue' },
    { label: 'DATE', value: formatTripDetailValue(getTripHistoryDateKey(trip) || trip.date) },
    { label: 'DRIVER', value: formatTripDetailValue(driver?.name || trip.completedDriverName || trip.driverName || trip.driverId) },
    { label: 'VEHICLE', value: formatTripDetailValue(vehicle) },
    { label: 'PICKUP ARRIVAL', value: pickupClock, tone: 'green' },
    { label: 'DROPOFF ARRIVAL', value: dropoffClock, tone: 'red' },
    { label: 'START ODOMETER', value: pickupOdometer, tone: 'green' },
    { label: 'END ODOMETER', value: dropoffOdometer, tone: 'red' },
    { label: 'DISTANCE', value: formatTripDistance(trip.distance) },
    { label: 'PICKUP ADDRESS', value: formatTripDetailValue(getFirstTripValue(trip, ['pickup', 'pickupAddress'])), tone: 'green' },
    { label: 'DROPOFF ADDRESS', value: formatTripDetailValue(getFirstTripValue(trip, ['dropoff', 'dropoffAddress'])), tone: 'red' },
    { label: 'SIGNATURE', value: trip.paperSignatureConfirmed || trip.signature || trip.signatureUrl ? 'Yes' : 'No' },
  ];
  return (
    <div className="overflow-hidden border-t border-slate-200 bg-white">
      <table className="driver-history-detail-table w-full table-fixed text-left">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="align-top border-b border-slate-150 last:border-b-0">
              <td role="rowheader" className="driver-history-detail-label w-[36%] bg-slate-100/90 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">{row.label}</td>
              <td className={`px-3 py-1.5 text-xs font-semibold break-words ${
                row.tone === 'green' ? 'text-emerald-600' : row.tone === 'red' ? 'text-rose-600' : row.tone === 'blue' ? 'text-blue-600' : 'text-slate-950'
              }`}>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
const isWorkflowTerminalTrip = (trip) => {
  if (!trip) return false;
  const status = normalizeWorkflowStatus(trip.status);
  if (status === 'completed' && trip.completedAt) return true;
  return [...WORKFLOW_TERMINAL_STATUSES].some((terminal) => normalizeWorkflowStatus(terminal) === status);
};

const getWorkflowStepIndex = (trip) => {
  if (!trip) return -1;
  if (isWorkflowTerminalTrip(trip)) return 6;
  if (trip.arrivalDropoffTime || trip.status === 'At Dropoff' || trip.status === 'Arrived') return 5;
  if (trip.status === 'Navigating Dropoff') return 4;
  if (trip.departedPickupTime || trip.paperSignatureConfirmed || trip.unableToSign || trip.status === 'In Transit') return 3;
  if (trip.pickupOdometer || trip.arrivalTime || trip.status === 'At Pickup') return 2;
  if (trip.status === 'Navigating Pickup') return 1;
  if (trip.startedAt || trip.status === 'In Progress' || trip.status === 'In Mission' || trip.status === 'En Route') return 0;
  return -1;
};

const getWorkflowSteps = (trip) => {
  const idx = getTripWorkStepIndex(trip);
  return [
    { key: 'scheduled', label: 'Scheduled', phase: 'pickup', done: idx >= 0 },
    { key: 'en-route', label: 'En Route', phase: 'pickup', done: idx >= 1 },
    { key: 'at-pickup', label: 'At Pickup', phase: 'pickup', done: idx >= 2 },
    { key: 'in-transit', label: 'In Transit', phase: 'dropoff', done: idx >= 3 },
    { key: 'complete', label: 'Complete', phase: 'dropoff', done: idx >= 4 },
  ];
};

const getCurrentWorkflowStep = (trip) => getWorkflowSteps(trip).findIndex(s => !s.done);

const formatClockTime = (iso) => {
  if (!iso) return '';
  const d = toValidDate(iso);
  if (!d) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

const TRIP_WORK_STEPS = ['Scheduled', 'En Route', 'At Pickup', 'In Transit', 'Complete'];

const getTripWorkStepIndex = (trip) => {
  if (!trip) return 0;
  const status = normalizeWorkflowStatus(trip.status);
  if (status === 'completed') return 4;
  if (status === 'in transit' || status === 'navigating dropoff' || status === 'at dropoff' || status === 'arrived') return 3;
  if (status === 'at pickup' || trip.pickupOdometer || trip.arrivalTime || trip.startTime) return 2;
  if (status === 'in progress' || status === 'in mission' || status === 'en route' || status === 'navigating pickup' || trip.startedAt) return 1;
  return 0;
};

const getTripWorkStatusClass = (status) => {
  const normalized = normalizeWorkflowStatus(status);
  if (normalized === 'assigned' || normalized === 'unassigned') return 'bg-blue-100 text-blue-700 border-blue-200';
  if (normalized === 'completed') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (normalized === 'cancelled' || normalized === 'no show') return 'bg-rose-100 text-rose-700 border-rose-200';
  if (normalized === 'rerouted') return 'bg-purple-100 text-purple-700 border-purple-200';
  if (normalized.includes('dropoff') || normalized === 'in transit' || normalized === 'arrived') return 'bg-orange-100 text-orange-700 border-orange-200';
  if (normalized.includes('pickup') || normalized === 'in progress' || normalized === 'en route') return 'bg-cyan-100 text-cyan-700 border-cyan-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

const WORKFLOW_PROGRESS_FIELDS = [
  'startedAt',
  'pickupOdometer',
  'arrivalTime',
  'startTime',
  'departedPickupTime',
  'paperSignatureConfirmed',
  'unableToSign',
  'arrivalDropoffTime',
  'dropoffOdometer',
  'completedAt',
  'completedVehicle',
];

const WORKFLOW_FIELD_MIN_STEP = {
  startedAt: 0,
  pickupOdometer: 2,
  arrivalTime: 2,
  startTime: 2,
  departedPickupTime: 3,
  paperSignatureConfirmed: 3,
  unableToSign: 3,
  arrivalDropoffTime: 5,
  dropoffOdometer: 6,
  completedAt: 6,
  completedVehicle: 6,
};

const getRegressionFieldsForStep = (targetStepIndex) => Object.fromEntries(
  Object.entries(WORKFLOW_FIELD_MIN_STEP)
    .filter(([, minStep]) => minStep > targetStepIndex)
    .map(([field]) => [field, null])
);

const getTripWorkStepBackTarget = (trip) => {
  const stepIndex = getTripWorkStepIndex(trip);
  if (stepIndex <= 0) return null;
  if (stepIndex === 1) {
    return {
      label: 'Scheduled',
      status: 'Assigned',
      fields: getRegressionFieldsForStep(-1),
    };
  }
  if (stepIndex === 2) {
    return {
      label: 'En Route',
      status: 'Navigating Pickup',
      fields: getRegressionFieldsForStep(1),
    };
  }
  if (stepIndex === 3) {
    return {
      label: 'At Pickup',
      status: 'At Pickup',
      fields: getRegressionFieldsForStep(2),
    };
  }
  return {
    label: 'In Transit',
    status: 'In Transit',
    fields: getRegressionFieldsForStep(3),
  };
};

const hasWorkflowValue = (value) => value !== undefined && value !== null && value !== '';

const readWorkflowProgress = (storageKey) => {
  try {
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

const getWorkflowExtraFields = (progress = {}) => {
  const extraFields = {};
  WORKFLOW_PROGRESS_FIELDS.forEach((field) => {
    if (hasWorkflowValue(progress[field])) extraFields[field] = progress[field];
  });
  return extraFields;
};

const applyWorkflowProgress = (trip, progress) => {
  if (!trip || !progress) return trip;
  const merged = { ...trip };
  WORKFLOW_PROGRESS_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(progress, field) && progress[field] === null) {
      delete merged[field];
    } else if (hasWorkflowValue(progress[field]) && !hasWorkflowValue(merged[field])) {
      merged[field] = progress[field];
    }
  });

  if (hasWorkflowValue(progress.status)) {
    const currentIndex = getWorkflowStepIndex(merged);
    const progressTrip = { ...merged, ...getWorkflowExtraFields(progress), status: progress.status };
    const progressIndex = getWorkflowStepIndex(progressTrip);
    if (progress.workflowRegression || progressIndex >= currentIndex) {
      merged.status = progress.status;
    }
  }

  return merged;
};

const DriverPage = ({ currentUser, role, tenantId, drivers = [], trips = [], tripsLoading = false, vehicles = [], setVehicles, driverTelemetry = [], timeTrackingDeclarations = [], activeMission, onUpdateMission, onUpdateTrip, onDriverStatusUpdate, onUpdateClockEvents, onUpdateHourlyRate, onCompleteTrip, onOpenSettings, onLogout, appSettings = {}, phoneNumbers: phoneNumbersProp = {}, onUpdateDriverLocation, onUpdateAppSettings, allDrivers = [], dispatchers = [], driverAssignments = [], assignmentUnreadCount = 0, onAcknowledgeAssignment, onAcceptAssignment, onAddTrip, showAddTripModal, setShowAddTripModal, onAddAuditLog, requestAuthAction, isEmbedded = false, defaultTripId = null, initialShowDetailsId = null, onEmbeddedClose = null }) => {
  const { unreadCount } = useChat({ alerts: true });
  const [phoneNumbersFallback, setPhoneNumbersFallback] = useState(null);

  useEffect(() => {
    if (phoneNumbersProp?.dispatcher && phoneNumbersProp?.routing) return;
    const unsub = onSnapshot(doc(db, 'systemConfig', 'phoneNumbers'), (snap) => {
      if (snap.exists()) {
        setPhoneNumbersFallback(snap.data());
      }
    }, () => {});
    return () => unsub();
  }, [phoneNumbersProp?.dispatcher, phoneNumbersProp?.routing]);

  const phoneNumbers = phoneNumbersProp?.dispatcher || phoneNumbersProp?.routing ? phoneNumbersProp : (phoneNumbersFallback || phoneNumbersProp);
  const me = useMemo(
    () => {
      const rawMe = drivers.find(d => (d.email || '').toLowerCase() === (currentUser || '').toLowerCase() || String(d.id || '').toLowerCase() === String(currentUser || '').toLowerCase()) ||
        (allDrivers || []).find(d => (d.email || '').toLowerCase() === (currentUser || '').toLowerCase() || String(d.id || '').toLowerCase() === String(currentUser || '').toLowerCase()) ||
        buildFallbackDriverProfile(currentUser || '');
      const vehicle = resolveDriverVehicle(rawMe, currentUser);
      return { ...rawMe, vehicle };
    },
    [drivers, allDrivers, currentUser]
  );
  const assignedVehicleRecord = useMemo(() => vehicles.find((vehicle) => (
    (me?.vehicleId && vehicle.id === me.vehicleId)
    || String(vehicle.name || '').trim().toLowerCase() === String(me?.vehicle || '').trim().toLowerCase()
  )), [me?.vehicle, me?.vehicleId, vehicles]);
  const vehicleMaintenance = useMemo(() => assignedVehicleRecord
    ? getVehicleMaintenanceStatus(assignedVehicleRecord, trips, allDrivers?.length ? allDrivers : drivers, appSettings.maintenancePolicy)
    : null, [assignedVehicleRecord, trips, allDrivers, drivers, appSettings.maintenancePolicy]);
  // Global per-vehicle odometer: resolved from the Firestore-synced vehicle
  // record plus every trip reading for this vehicle (any driver), so a shared
  // van or a fresh device never presents a stale per-device number.
  const vehicleOdometerState = useMemo(() => deriveVehicleOdometerState({
    vehicle: assignedVehicleRecord || {},
    trips,
    drivers: allDrivers?.length ? allDrivers : drivers,
  }), [assignedVehicleRecord, trips, allDrivers, drivers]);
  const currentVehicleOdometer = vehicleOdometerState.miles || 0;

  const [maintenanceResetting, setMaintenanceResetting] = useState('');

  const resetVehicleMaintenanceCycle = useCallback((type) => {
    if (!assignedVehicleRecord?.id || !vehicleMaintenance || maintenanceResetting) return;
    const serviceName = type === 'oil' ? 'oil mileage cycle' : 'filter service cycle';
    const execute = async () => {
      setMaintenanceResetting(type);
      try {
        const recordMaintenance = httpsCallable(functions, 'recordDriverVehicleMaintenance');
        const payload = { vehicleId: assignedVehicleRecord.id, type, serviceDateKey: localCalendarYmd() };
        // Attach verifiable mileage evidence: the resolved reading plus the
        // exact trip it came from, so the server can confirm both instead of
        // requiring a manually maintained vehicle.odometer field.
        if (currentVehicleOdometer > 0 && vehicleOdometerState.sourceTripId) {
          payload.odometer = Math.round(currentVehicleOdometer);
          payload.sourceTripId = vehicleOdometerState.sourceTripId;
        }
        const response = await recordMaintenance(payload);
        if (!response.data?.success) throw new Error('The server did not confirm the maintenance record.');
        onAddAuditLog?.('Driver Vehicle Service Recorded', `${me?.name || currentUser} reset the ${serviceName} for ${assignedVehicleRecord.name} at ${Number(response.data.odometer).toLocaleString()} miles.`, 'emerald', { entity: 'vehicle', id: assignedVehicleRecord.id, maintenanceType: type, odometer: response.data.odometer, source: 'driver-settings' });
        setShowToast({ type: 'success', message: `${type === 'oil' ? 'Oil mileage' : 'Filter'} service cycle saved successfully.` });
      } catch (error) {
        const code = String(error?.code || '').replace(/^functions\//, '');
        const detail = String(error?.message || '').trim() || 'The service record could not be saved. No vehicle data was changed.';
        console.error('[maintenance-reset]', code, detail);
        setShowToast({ type: 'error', message: code && !detail.includes(code) ? `${detail} (${code})` : detail });
      } finally {
        setMaintenanceResetting('');
      }
    };
    if (requestAuthAction) requestAuthAction(`Reset ${serviceName} for ${assignedVehicleRecord.name}`, execute);
  }, [assignedVehicleRecord, currentUser, currentVehicleOdometer, maintenanceResetting, me?.name, onAddAuditLog, requestAuthAction, vehicleMaintenance, vehicleOdometerState]);
  // Time-tracking reconciliation runs early in this component. Resolve the
  // policy beside the authoritative driver profile so every hook sees an
  // initialized value (and production minification cannot expose a TDZ crash).
  const timeTrackingPolicyMode = me?.timeTrackingPolicy || POLICY_MODES.PAY_FROM_HOME;
  const normalizedCurrentUserEmail = useMemo(
    () => (currentUser || me?.email || '').trim().toLowerCase(),
    [currentUser, me?.email]
  );
  const driverIdentityIds = useMemo(() => {
    const knownProfiles = [...(drivers || []), ...(allDrivers || [])];
    return new Set(
      knownProfiles
        .filter((driver) => (
          (driver?.email || '').trim().toLowerCase() === normalizedCurrentUserEmail ||
          String(driver?.id || '').trim().toLowerCase() === normalizedCurrentUserEmail
        ))
        .map((driver) => driver.id)
        .concat(me?.id ? [me.id] : [])
        .filter(Boolean)
    );
  }, [drivers, allDrivers, me?.id, normalizedCurrentUserEmail]);
  const tripBelongsToCurrentDriver = useCallback((trip) => {
    if (!trip) return false;
    if (trip.driverId && driverIdentityIds.has(trip.driverId)) return true;
    const resolvedDriverEmail = (
      trip.driverEmail ||
      drivers.find((driver) => driver.id === trip.driverId)?.email ||
      (allDrivers || []).find((driver) => driver.id === trip.driverId)?.email ||
      ''
    ).trim().toLowerCase();
    return !!normalizedCurrentUserEmail && resolvedDriverEmail === normalizedCurrentUserEmail;
  }, [driverIdentityIds, normalizedCurrentUserEmail, drivers, allDrivers]);
  const rawDriverScopedTrips = useMemo(
    () => {
      if (!Array.isArray(trips)) return [];
      const filtered = trips.filter(tripBelongsToCurrentDriver);
      if (defaultTripId && !filtered.some(t => t.id === defaultTripId)) {
        const defaultTrip = trips.find(t => t.id === defaultTripId);
        if (defaultTrip) filtered.push(defaultTrip);
      }
      return filtered;
    },
    [trips, tripBelongsToCurrentDriver, defaultTripId]
  );
  const userKey = (currentUser || 'anon').replace(/[^a-zA-Z0-9@._-]/g, '_');
  const workflowStorageKey = `agape_drvWorkflow_${userKey}`;
  const [workflowProgressState, setWorkflowProgressState] = useState(() => ({
    storageKey: workflowStorageKey,
    data: readWorkflowProgress(workflowStorageKey),
  }));
  const workflowProgress = workflowProgressState.data;
  const setWorkflowProgressData = useCallback((updater) => {
    setWorkflowProgressState((prev) => {
      const baseData = prev.storageKey === workflowStorageKey ? prev.data : readWorkflowProgress(workflowStorageKey);
      const nextData = typeof updater === 'function' ? updater(baseData) : updater;
      return { storageKey: workflowStorageKey, data: nextData || {} };
    });
  }, [workflowStorageKey]);
  const driverScopedTrips = useMemo(
    () => annotateInOutPairs(rawDriverScopedTrips.map((trip) => applyWorkflowProgress(trip, workflowProgress[trip.id]))),
    [rawDriverScopedTrips, workflowProgress]
  );

  useEffect(() => {
    if (workflowProgressState.storageKey !== workflowStorageKey) {
      setWorkflowProgressState({
        storageKey: workflowStorageKey,
        data: readWorkflowProgress(workflowStorageKey),
      });
    }
  }, [workflowProgressState.storageKey, workflowStorageKey]);

  useEffect(() => {
    if (workflowProgressState.storageKey !== workflowStorageKey) return;
    try {
      localStorage.setItem(workflowStorageKey, JSON.stringify(workflowProgress));
    } catch (e) { console.warn('[workflow persist]', e); }
  }, [workflowProgressState.storageKey, workflowStorageKey, workflowProgress]);

  const [activeNav, setActiveNav] = useState(() => {
    if (defaultTripId) return 'active-trip';
    // An admin/dispatcher embedding DriverPage is opening a trip workflow, not
    // restoring that driver's personal portal. Never leak a driver's saved
    // Settings/Tools/History tab into the operations Trips surface.
    if (isEmbedded) return 'trips';
    const savedNav = localStorage.getItem(`agape_drvNav_${userKey}`) || 'trips';
    return ['trips', 'tools', 'history', 'settings', 'active-trip', 'chat'].includes(savedNav) ? savedNav : 'trips';
  });
  const [isChatThreadOpen, setIsChatThreadOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState(() => {
    const savedFilter = localStorage.getItem(`agape_drvHistFilter_${userKey}`);
    // History is a completed-work view. Do not reopen the broad legacy "all"
    // selection on every login; drivers can still choose it for the current session.
    return savedFilter && savedFilter !== 'all' ? savedFilter : 'completed';
  });
  // Search is intentionally session-only: a stale persisted term silently hid
  // trips after relogin and looked like missing history.
  const [historySearch, setHistorySearch] = useState('');
  const [historyDate, setHistoryDate] = useState(() => localCalendarYmd());

  useEffect(() => {
    if (!isEmbedded) localStorage.setItem(`agape_drvNav_${userKey}`, activeNav);
    localStorage.setItem(`agape_drvHistFilter_${userKey}`, historyFilter);
    localStorage.removeItem(`agape_drvHistSearch_${userKey}`);
  }, [activeNav, historyFilter, userKey, isEmbedded]);

  useEffect(() => {
    if (!isEmbedded) return;
    setActiveNav(defaultTripId ? 'active-trip' : 'trips');
  }, [isEmbedded, defaultTripId, userKey]);


  const [selectedTrips, setSelectedTrips] = useState([]);
  const [routePlanStops, setRoutePlanStops] = useState(null);
  const [aiOptimizing, setAiOptimizing] = useState(false);
  const [aiSequence, setAiSequence] = useState(null);
  const [locStreamDebug, setLocStreamDebug] = useState(null);
  const [adminDriverFilter, setAdminDriverFilter] = useState('all');
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [guidedMode, setGuidedMode] = useState(false);
  const [guidedStepIndex, setGuidedStepIndex] = useState(0);
  const [guidedSteps, setGuidedSteps] = useState([]);
  const guidedLastAdvance = useRef(-1);
  const [aiRideShare, setAiRideShare] = useState([]);
  const [showOdometerPrompt, setShowOdometerPrompt] = useState(null);
  const [odometerValue, setOdometerValue] = useState('');
  const [lastOdometer, setLastOdometer] = useState(() => {
    try { return Number(localStorage.getItem(`agape_drvOdo_${userKey}`)) || 0; } catch { return 0; }
  });
  useEffect(() => {
    if (lastOdometer > 0) {
      try { localStorage.setItem(`agape_drvOdo_${userKey}`, String(lastOdometer)); } catch (e) { console.warn('[odo persist]', e); }
    }
  }, [lastOdometer, userKey]);
  const [showArrivalConfirm, setShowArrivalConfirm] = useState(null);
  const [arrivalOdometer, setArrivalOdometer] = useState('');
  const [signatureConfirmed, setSignatureConfirmed] = useState(false);
  const [showSignatureConfirm, setShowSignatureConfirm] = useState(null);
  const [routeStopOdometerPrompt, setRouteStopOdometerPrompt] = useState(null);
  const [routeStopOdometerValue, setRouteStopOdometerValue] = useState('');
  const [routeStopSignaturePrompt, setRouteStopSignaturePrompt] = useState(null);
  const [routeStopSignatureConfirmed, setRouteStopSignatureConfirmed] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(null);
  const [completeOdometer, setCompleteOdometer] = useState('');
  const [completeError, setCompleteError] = useState('');
  const [completeTimeNotice, setCompleteTimeNotice] = useState('');
  const [completeAck, setCompleteAck] = useState(false);
  const [odometerError, setOdometerError] = useState('');
  const [odometerAck, setOdometerAck] = useState(false);
  const [departedTime, setDepartedTime] = useState('');
  const [arrivalDropoffTime, setArrivalDropoffTime] = useState('');

  // Strict odometer gate shared by every trip window that records a reading.
  // The baseline is the global per-vehicle value; `lastOdometer` is only a
  // fallback for drivers without an assigned vehicle record.
  const runOdometerGuard = useCallback(({ raw, pickupOdometer = null } = {}) => evaluateOdometerEntry({
    raw,
    baselineMiles: currentVehicleOdometer || lastOdometer,
    pickupOdometer,
  }), [currentVehicleOdometer, lastOdometer]);
  const resetOdometerPromptState = useCallback(() => {
    setOdometerError('');
    setOdometerAck(false);
  }, [setOdometerAck, setOdometerError]);
  const [scheduleEditorTrip, setScheduleEditorTrip] = useState(null);
  const [scheduleEditDraft, setScheduleEditDraft] = useState(null);
  const [scheduleEditError, setScheduleEditError] = useState('');
  const [activeWorkTripId, setActiveWorkTripIdRaw] = useState(() => {
    if (defaultTripId) return defaultTripId;
    try {
      return localStorage.getItem(`agape_drvActiveTrip_${userKey}`) || null;
    } catch {
      return null;
    }
  });

  const setActiveWorkTripId = useCallback((val) => {
    setActiveWorkTripIdRaw(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      try {
        if (next) {
          localStorage.setItem(`agape_drvActiveTrip_${userKey}`, next);
        } else {
          localStorage.removeItem(`agape_drvActiveTrip_${userKey}`);
        }
      } catch (err) {
        console.error('Failed to save activeWorkTripId to localStorage:', err);
      }
      return next;
    });
  }, [userKey]);
  const [workNotesOpen, setWorkNotesOpen] = useState(false);
  const [showTripDetails, setShowTripDetails] = useState(() => {
    if (initialShowDetailsId) {
      return trips.find(t => t.id === initialShowDetailsId) || null;
    }
    return null;
  });
  const [showMoreOptions, setShowMoreOptions] = useState(null);
  const [quickSmsMenuTrip, setQuickSmsMenuTrip] = useState(null);
  const [historyExpandedId, setHistoryExpandedId] = useState(null);
  const [showToast, setShowToast] = useState(null);
  const toastTimeoutRef = useRef(null);
  useEffect(() => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    if (!showToast || showToast.action || showToast.type === 'error') return;
    toastTimeoutRef.current = setTimeout(() => setShowToast(null), 1000);
    return () => { if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current); };
  }, [showToast]);
  const [expandedTripId, setExpandedTripIdRaw] = useState(null);
  const setExpandedTripId = useCallback((val) => {
    setExpandedTripIdRaw(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      return next;
    });
  }, []);
  const [selectedLegsForAction, setSelectedLegsForAction] = useState(new Set());
  const [isGpsTracking, setIsGpsTracking] = useState(false);
  const [gpsNoticeDismissed, setGpsNoticeDismissed] = useState(false);

  // One-shot probe: if location works now, restart the stream cleanly;
  // otherwise tell the driver exactly what to fix instead of failing silently.
  const retryGpsStream = () => {
    if (!navigator.geolocation) return;
    impact('medium');
    navigator.geolocation.getCurrentPosition(
      () => window.location.reload(),
      () => setShowToast({ type: 'warning', message: 'Location still unavailable. Allow Location access for Agape Care in your device Settings.' }),
      { timeout: 8000, enableHighAccuracy: true }
    );
  };
  const [showSequencerModal, setShowSequencerModal] = useState(false);
  const [sequencerTripFilter, setSequencerTripFilter] = useState(null);
  const [routePlanSequencerStops, setRoutePlanSequencerStops] = useState(null);
  const [routePlanSequencerSequence, setRoutePlanSequencerSequence] = useState(null);
  const [routePlanSequencerOrigin, setRoutePlanSequencerOrigin] = useState(null);
  const [sequencerKey, setSequencerKey] = useState(0);
  const [driverPosition, setDriverPosition] = useState(null);
  const [tomorrowExpanded, setTomorrowExpanded] = useState(false);
  const [legsDetailPatient, setLegsDetailPatient] = useState(null);
  const [etas, setEtas] = useState({});
  const [backgroundLocation, setBackgroundLocation] = useState(false);
  const [conflicts, setConflicts] = useState([]);
  const [touchStart, setTouchStart] = useState(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [undoableAction, setUndoableAction] = useState(null);
  const undoTimeoutRef = useRef(null);
  const [passwordPrompt, setPasswordPrompt] = useState(null);
  const [passwordValue, setPasswordValue] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordVerifying, setPasswordVerifying] = useState(false);
  const [transferPrompt, setTransferPrompt] = useState(null);
  const [transferTargetDriverId, setTransferTargetDriverId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [showContactSelector, setShowContactSelector] = useState(null);
  const [restorePrompt, setRestorePrompt] = useState(null);
  const [cancelPrompt, setCancelPrompt] = useState(null);
  const [showLegsModal, setShowLegsModal] = useState(null);
  const [editingTripId, setEditingTripId] = useState(null);
  const [editingTripData, setEditingTripData] = useState(null);
  const [inlineEditSaving, setInlineEditSaving] = useState(false);
  const [inlineEditError, setInlineEditError] = useState('');
  const [historySortKeyOverrides, setHistorySortKeyOverrides] = useState({});
  const [activeSortKeyOverrides, setActiveSortKeyOverrides] = useState({});
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editFields, setEditFields] = useState({});

  useEffect(() => {
    if (!editingTripId && Object.keys(activeSortKeyOverrides).length > 0) {
      const timer = setTimeout(() => setActiveSortKeyOverrides({}), 1500);
      return () => clearTimeout(timer);
    }
  }, [editingTripId]);

  useEffect(() => {
    if (!editingTripId && Object.keys(historySortKeyOverrides).length > 0) {
      const timer = setTimeout(() => setHistorySortKeyOverrides({}), 1500);
      return () => clearTimeout(timer);
    }
  }, [editingTripId]);

  const [skipConfirmTripId, setSkipConfirmTripId] = useState(null);
  const [routeTemplates, setRouteTemplates] = useState([]);
  const [assignedSequence, setAssignedSequence] = useState(null);
  const [showAssignedRouteDetails, setShowAssignedRouteDetails] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [showTTAdmin, setShowTTAdmin] = useState(false);
  const displayLoginId = useMemo(
    () => String(me?.email || currentUser || '').replace(/@auth\.agapecare\.local$/i, ''),
    [me?.email, currentUser]
  );
  const tripsScrollRef = useRef(null);
  const workflowSyncRef = useRef({});
  const pullStartY = useRef(null);
  // Mutex against rapid double-taps firing an async trip action twice
  // (duplicate arrivals, duplicate completions, duplicate odometer syncs).
  const tripActionInFlightRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const routePlanningUserKeyRef = useRef(userKey);
  useEffect(() => {
    if (routePlanningUserKeyRef.current === userKey) return;
    routePlanningUserKeyRef.current = userKey;
    setSelectedTrips([]);
    setRoutePlanStops(null);
    setAiSequence(null);
    setAiSuggestions([]);
    setAiRideShare([]);
    setGuidedMode(false);
    setGuidedStepIndex(0);
    setGuidedSteps([]);
    setSequencerTripFilter(null);
    setRoutePlanSequencerStops(null);
    setRoutePlanSequencerSequence(null);
    setRoutePlanSequencerOrigin(null);
    setRouteTemplates([]);
    setAssignedSequence(null);
    setShowAssignedRouteDetails(false);
    setActiveWorkTripId(defaultTripId || null);
    setExpandedTripId(defaultTripId || null);
  }, [defaultTripId, setActiveWorkTripId, setExpandedTripId, userKey]);

  const handlePullTouchStart = useCallback((e) => {
    pullStartY.current = e.touches[0].clientY;
  }, []);

  const handlePullTouchMove = useCallback((e) => {
    if (pullStartY.current === null || isRefreshing) return;
    const delta = e.touches[0].clientY - pullStartY.current;
    if (delta > 0) {
      setPullDistance(Math.min(delta * 0.25, 120));
    }
  }, [isRefreshing]);

  const handlePullTouchEnd = useCallback(() => {
    if (pullDistance > 100 && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(0);
      setTimeout(() => { window.location.reload(); }, 300);
    } else {
      setPullDistance(0);
    }
    pullStartY.current = null;
  }, [pullDistance, isRefreshing]);

  const advanceWorkflow = useCallback((trip, status, extraFields = {}, options = {}) => {
    if (!trip?.id || !status) return;
    const workflowUpdatedAt = new Date().toISOString();
    setWorkflowProgressData((prev) => {
      const previousProgress = prev[trip.id] || {};
      const currentTrip = applyWorkflowProgress(trip, previousProgress);
      const incomingTrip = { ...currentTrip, status, ...extraFields };
      const currentIndex = getWorkflowStepIndex(currentTrip);
      const incomingIndex = getWorkflowStepIndex(incomingTrip);

      if (!options.allowRegression && incomingIndex < currentIndex) {
        return prev;
      }

      const nextProgress = {
        ...previousProgress,
        tripId: trip.id,
        status,
        ...extraFields,
        workflowRegression: !!options.allowRegression,
        workflowUpdatedAt,
      };

      if (options.allowRegression) {
        Object.entries(WORKFLOW_FIELD_MIN_STEP).forEach(([field, minStep]) => {
          if (minStep > incomingIndex) nextProgress[field] = null;
        });
      }

      return { ...prev, [trip.id]: nextProgress };
    });
    const allFields = { status, ...extraFields, workflowUpdatedAt };
    onUpdateTrip?.(trip.id, status, allFields);
    saveTripWorkflowUpdate(trip.id, allFields).catch((err) => {
      console.error('[DriverPage] Failed to persist workflow update:', err);
    });
    if (status === 'In Progress' && me?.id) {
      setDoc(doc(db, 'driverProfiles', me.id), { activeTripId: trip.id, userId: auth.currentUser?.uid || '' }, { merge: true }).catch((err) => {
        console.error('[DriverPage] Failed to persist activeTripId:', err);
      });
    }
  }, [onUpdateTrip, setWorkflowProgressData, me?.id]);

  const clearActiveTrip = useCallback(() => {
    if (me?.id) {
      setDoc(doc(db, 'driverProfiles', me.id), { activeTripId: null, userId: auth.currentUser?.uid || '' }, { merge: true }).catch((err) => {
        console.error('[DriverPage] Failed to clear activeTripId:', err);
      });
      setActiveWorkTripId(null);
      setActiveNav('trips');
      setWorkNotesOpen(false);
    }
  }, [me?.id]);

  useEffect(() => {
    Object.entries(workflowProgress).forEach(([tripId, progress]) => {
      if (!progress?.status || progress.workflowRegression) return;
      const rawTrip = rawDriverScopedTrips.find((trip) => trip.id === tripId);
      if (!rawTrip) return;
      const mergedTrip = applyWorkflowProgress(rawTrip, progress);
      const rawIndex = getWorkflowStepIndex(rawTrip);
      const mergedIndex = getWorkflowStepIndex(mergedTrip);
      const shouldSync = mergedIndex > rawIndex || rawTrip.status !== mergedTrip.status;
      if (!shouldSync) return;
      const signature = JSON.stringify({ status: mergedTrip.status, ...getWorkflowExtraFields(progress) });
      if (workflowSyncRef.current[tripId] === signature) return;
      workflowSyncRef.current[tripId] = signature;
      onUpdateTrip?.(tripId, mergedTrip.status, getWorkflowExtraFields(progress));
      saveTripWorkflowUpdate(tripId, {
        status: mergedTrip.status,
        ...getWorkflowExtraFields(progress),
        workflowUpdatedAt: progress.workflowUpdatedAt || new Date().toISOString(),
      }).catch((err) => {
        console.error('[DriverPage] Failed to replay workflow progress:', err);
      });
    });
  }, [rawDriverScopedTrips, workflowProgress, onUpdateTrip]);

  useEffect(() => {
    if (!me?.id) return;
    return onSnapshot(doc(db, 'routeData', 'sequences'), (snap) => {
      if (snap.exists()) {
        setRouteTemplates(snap.data().templates || []);
      } else {
        setRouteTemplates([]);
      }
    }, (err) => {
      console.error('[DriverPage] Route sequence listener failed:', err);
    });
  }, [me?.id]);

  // Re-compute assignedSequence whenever templates, me, or trips change
  useEffect(() => {
    setAssignedSequence(getDriverActiveRoutePlan(routeTemplates, me, driverScopedTrips));
  }, [routeTemplates, me, driverScopedTrips]);

  useEffect(() => {
    if (!assignedSequence) {
      setShowAssignedRouteDetails(false);
    }
  }, [assignedSequence?.id]);

  // Clear expandedTripId if the trip no longer exists
  useEffect(() => {
    if (expandedTripId && trips.length > 0 && !trips.some(t => t.id === expandedTripId)) {
      setExpandedTripId(null);
    }
  }, [trips, expandedTripId, setExpandedTripId]);

  const meRef = useRef(me);
  const queueRef = useRef([]);
  const etasRef = useRef({});
  const positionRef = useRef(null);
  const activeTripsRef = useRef([]);
  const addressCoordsCache = useRef({});
  const geofenceAlerted = useRef(new Set());
  const boundaryReconciliationRef = useRef(new Set());
  meRef.current = me;
  positionRef.current = driverPosition;

  const geofenceProximityNotified = useRef(new Set());

  // Imported broker trips often contain valid street addresses without latitude/
  // longitude fields. Reconcile the day's home boundaries from those addresses
  // so an already-completed day is corrected without asking the driver to redo a
  // trip. The persisted route evidence keeps payroll deterministic on refresh.
  useEffect(() => {
    const homeLocation = Number.isFinite(Number(me?.homeLat)) && Number.isFinite(Number(me?.homeLng))
      ? { lat: Number(me.homeLat), lng: Number(me.homeLng) }
      : null;
    if (!homeLocation || timeTrackingPolicyMode !== POLICY_MODES.PAY_FROM_HOME) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    const todayTrips = driverScopedTrips.filter((trip) => isTripDateToday(trip.date));
    const pickupBoundaryTrips = todayTrips.filter((trip) => getCompletionPickupBoundary(trip));
    const workTrips = pickupBoundaryTrips.length > 0
      ? pickupBoundaryTrips
      : todayTrips.filter((trip) => trip.startTime || trip.startedAt || trip.arrivalDropoffTime || trip.completedAt);
    if (workTrips.length === 0) return;
    const timestampMs = (trip, fields) => fields.reduce((found, field) => {
      if (Number.isFinite(found)) return found;
      const value = new Date(trip?.[field] || '').getTime();
      return Number.isFinite(value) ? value : found;
    }, NaN);
    const firstTrip = [...workTrips].sort((a, b) => (
      timestampMs(a, ['arrivalTime', 'pickupArrival', 'pickupArrivalTime', 'arrivedPickupAt', 'startTime', 'startedAt'])
      - timestampMs(b, ['arrivalTime', 'pickupArrival', 'pickupArrivalTime', 'arrivedPickupAt', 'startTime', 'startedAt'])
    ))[0];
    const completedTrips = workTrips.filter((trip) => normalizeWorkflowStatus(trip.status) === 'completed');
    const allTerminal = todayTrips.length > 0 && todayTrips.every(isWorkflowTerminalTrip);
    const dropoffBoundaryTrips = completedTrips.filter((trip) => trip.arrivalDropoffTime || trip.arrivedDropoffAt);
    const lastTripCandidates = dropoffBoundaryTrips.length > 0 ? dropoffBoundaryTrips : completedTrips;
    const lastTrip = allTerminal
      ? [...lastTripCandidates].sort((a, b) => (
          timestampMs(b, ['arrivalDropoffTime', 'arrivedDropoffAt', 'completedAt'])
          - timestampMs(a, ['arrivalDropoffTime', 'arrivedDropoffAt', 'completedAt'])
        ))[0]
      : null;

    const reconcile = async () => {
      if (firstTrip && !Number.isFinite(Number(firstTrip.homeToPickupTravelMinutes))) {
        const key = `first:${firstTrip.id}`;
        if (!boundaryReconciliationRef.current.has(key)) {
          boundaryReconciliationRef.current.add(key);
          try {
            const destination = getTripPickupLocation(firstTrip) || firstTrip.pickup;
            const travel = await calculateBoundaryTravel(homeLocation, destination);
            if (travel.minutes > 0) {
              advanceWorkflow(firstTrip, firstTrip.status, {
                homeToPickupTravelMinutes: travel.minutes,
                homeToPickupCalculatedAt: new Date().toISOString(),
                homeToPickupCalculationSource: travel.source,
                homeToPickupConfidence: travel.confidence,
                homeToPickupDistanceMiles: travel.distanceMiles ?? null,
                homeLocationSnapshot: homeLocation,
                pickupLocationSnapshot: getTripPickupLocation(firstTrip) || null,
              });
            } else {
              boundaryReconciliationRef.current.delete(key);
            }
          } catch (error) {
            boundaryReconciliationRef.current.delete(key);
            console.warn('First-trip home boundary reconciliation failed:', error);
          }
        }
      }

      if (lastTrip && !Number.isFinite(Number(lastTrip.dropoffToHomeTravelMinutes))) {
        const key = `last:${lastTrip.id}`;
        if (!boundaryReconciliationRef.current.has(key)) {
          boundaryReconciliationRef.current.add(key);
          try {
            const origin = getTripDropoffLocation(lastTrip) || lastTrip.dropoff;
            const travel = await calculateBoundaryTravel(origin, homeLocation);
            const dropoffTime = lastTrip.arrivalDropoffTime || lastTrip.completedAt;
            if (travel.minutes > 0 && dropoffTime) {
              advanceWorkflow(lastTrip, lastTrip.status, {
                dropoffToHomeTravelMinutes: travel.minutes,
                dropoffToHomeCalculatedAt: new Date().toISOString(),
                dropoffToHomeCalculationSource: travel.source,
                dropoffToHomeConfidence: travel.confidence,
                dropoffToHomeDistanceMiles: travel.distanceMiles ?? null,
                estimatedHomeArrivalTime: new Date(new Date(dropoffTime).getTime() + travel.minutes * 60000).toISOString(),
                homeLocationSnapshot: homeLocation,
                dropoffLocationSnapshot: getTripDropoffLocation(lastTrip) || null,
                timeTrackingBoundaryPolicy: POLICY_MODES.PAY_FROM_HOME,
              });
            } else {
              boundaryReconciliationRef.current.delete(key);
            }
          } catch (error) {
            boundaryReconciliationRef.current.delete(key);
            console.warn('Final-trip home boundary reconciliation failed:', error);
          }
        }
      }
    };
    reconcile();
  }, [advanceWorkflow, driverScopedTrips, me?.homeLat, me?.homeLng, timeTrackingPolicyMode]);

  // Geocode addresses for active trips and cache results
  const preloadAddressCoords = useCallback(async (trip) => {
    const addressesToGeocode = [];
    if (trip.pickup && !addressCoordsCache.current[trip.pickup]) addressesToGeocode.push({ addr: trip.pickup, type: 'pickup' });
    if (trip.dropoff && !addressCoordsCache.current[trip.dropoff]) addressesToGeocode.push({ addr: trip.dropoff, type: 'dropoff' });
    for (const { addr, type } of addressesToGeocode) {
      try {
        const coords = await geocodeAddress(addr);
        if (coords?.lat && coords?.lng) {
          addressCoordsCache.current[addr] = { lat: coords.lat, lng: coords.lng, type };
        }
      } catch (e) { console.warn('[geocode]', e); }
    }
  }, []);

  // Preload address coords when entering navigation
  const preloadGeofence = useCallback((trip) => {
    if (!trip) return;
    preloadAddressCoords(trip);
  }, [preloadAddressCoords]);

  // Smart contact system: build contact list per trip with type detection
  const tripContacts = useMemo(() => {
    const map = {};
    driverScopedTrips.forEach(t => {
      map[t.id] = buildContactList(t, trips, phoneNumbers);
    });
    return map;
  }, [driverScopedTrips, trips, phoneNumbers]);

  const getPrimaryContactForTrip = (trip) => getPrimaryContact(trip, trips, phoneNumbers);

  const getContactsForTrip = (trip) => tripContacts[trip?.id] || [];

  // Count legs per patient for today/tomorrow
  const patientLegs = useMemo(() => {
    const counts = {};
    driverScopedTrips.forEach(t => {
      if (!isTripDateToday(t.date)) return;
      const key = (t.patient || '').trim().toLowerCase();
      if (!key) return;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [driverScopedTrips]);

  // Count ACTIVE legs per patient for today/tomorrow (for no-show/cancel decision)
  const patientActiveLegs = useMemo(() => {
    const counts = {};
    driverScopedTrips.forEach(t => {
      if (!isTripDateToday(t.date)) return;
      if (isWorkflowTerminalTrip(t)) return;
      const key = (t.patient || '').trim().toLowerCase();
      if (!key) return;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [driverScopedTrips]);

  const updateAssignedRouteRecord = useCallback(async (updates, auditTitle, auditMessage) => {
    if (!assignedSequence?.id || routeTemplates.length === 0) return;
    const nextTemplates = routeTemplates.map((template) => (
      template.id === assignedSequence.id ? { ...template, ...updates } : template
    ));
    setAssignedSequence((prev) => (prev?.id === assignedSequence.id ? { ...prev, ...updates } : prev));
    await setDoc(doc(db, 'routeData', 'sequences'), { templates: nextTemplates }, { merge: true });
    if (auditTitle && auditMessage && onAddAuditLog) {
      onAddAuditLog(auditTitle, auditMessage, 'indigo');
    }
  }, [assignedSequence?.id, routeTemplates, currentUser, onAddAuditLog]);

  const startAssignedRoute = useCallback(async () => {
    if (!assignedSequence) return;
    const orderedTripIds = [...new Set((assignedSequence.sequence || []).map((step) => step.clientId))];
    const steps = (assignedSequence.sequence || []).map((step) => ({ tripId: step.clientId, type: step.type }));
    setAiSequence(orderedTripIds);
    setGuidedSteps(steps);
    setGuidedStepIndex(0);
    guidedLastAdvance.current = -1;
    setGuidedMode(true);
    setShowAssignedRouteDetails(true);
    await updateAssignedRouteRecord({
      assignmentStatus: ROUTE_ASSIGNMENT_STATUS.IN_PROGRESS,
      driverAcknowledgedAt: assignedSequence.driverAcknowledgedAt || new Date().toISOString(),
      startedAt: new Date().toISOString(),
    }, 'Route Started', `${currentUser} started route "${assignedSequence.name || 'Assigned Route'}".`);
  }, [assignedSequence, currentUser, updateAssignedRouteRecord]);

  const getUrgency = (trip) => {
    if (!trip || !trip.time || isWorkflowTerminalTrip(trip)) return 0;
    const now = new Date();
    const today = localCalendarYmd();
    if (tripCalendarDateKey(trip.date) !== today) return 0;
    const tripMin = timeToMinutes(trip.time);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const diff = tripMin - nowMin;
    if (diff < 0) return 2;
    if (diff <= 30) return 1;
    return 0;
  };

  const notifiedTripsRef = useRef(new Set());

  const setUndoable = (trip, previousStatus, newStatus) => {
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setUndoableAction({ trip, previousStatus, newStatus });
    undoTimeoutRef.current = setTimeout(() => setUndoableAction(null), 10000);
  };

  const handleUndo = () => {
    if (!undoableAction) return;
    if (!window.confirm(`Are you sure you want to restore ${undoableAction.trip?.patient || 'this trip'} to "${undoableAction.previousStatus}"?`)) return;
    advanceWorkflow(undoableAction.trip, undoableAction.previousStatus, {}, { allowRegression: true });
    setUndoableAction(null);
    if (undoTimeoutRef.current) { clearTimeout(undoTimeoutRef.current); undoTimeoutRef.current = null; }
  };

  const revertTripStatus = (trip) => {
    const stepBackTarget = getTripWorkStepBackTarget(trip);
    if (!stepBackTarget) return;
    advanceWorkflow(trip, stepBackTarget.status, stepBackTarget.fields, { allowRegression: true });
  };

  const restoreHistoryTrip = (trip) => {
    const patientKey = (trip.patient || '').trim().toLowerCase();
    const relatedLegs = driverScopedTrips.filter(t => isTripDateToday(t.date) && (t.patient || '').trim().toLowerCase() === patientKey && isWorkflowTerminalTrip(t));
    if (relatedLegs.length > 1) {
      setRestorePrompt({ trip, legs: relatedLegs });
    } else {
      setPasswordPrompt({ type: 'restore', trip });
    }
  };

  // The global vehicle reading is authoritative; the per-driver completed-trip
  // scan below is only a fallback for drivers without an assigned vehicle.
  useEffect(() => {
    if (currentVehicleOdometer > 0) {
      setLastOdometer(currentVehicleOdometer);
      return;
    }
    if (!me?.id) return;
    const completed = driverScopedTrips
      .filter(t => isWorkflowTerminalTrip(t) && t.dropoffOdometer)
      .sort((a, b) => (safeDateMillis(b.completedAt, 0) || 0) - (safeDateMillis(a.completedAt, 0) || 0));
    if (completed.length > 0) setLastOdometer(completed[0].dropoffOdometer);
  }, [driverScopedTrips, me?.id, currentVehicleOdometer]);

  // Keeps trip action windows (odometer, signature, completion, password)
  // visually stable when the on-screen keyboard opens. On resizing viewports
  // (Android) the browser itself keeps the centered window above the
  // keyboard and this lift computes to zero. On non-resizing viewports
  // (iOS) it measures how much of the open window is covered and lifts it by
  // exactly that amount (--agape-kb-shift). A ResizeObserver on the open
  // window plus focus listeners keep the lift self-correcting, and the
  // trip-window-open class stops the background page from panning.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return undefined;
    const visualViewport = window.visualViewport;
    let frame = 0;
    let settleTimer = 0;
    let observedPanel = null;
    let fullHeight = window.innerHeight;
    let lastShiftWritten = null;
    const syncWindowShift = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        const panel = document.querySelector('.trip-window-panel');
        document.documentElement.classList.toggle('trip-window-open', !!panel);
        if (resizeObserver && panel !== observedPanel) {
          if (observedPanel) resizeObserver.unobserve(observedPanel);
          if (panel) resizeObserver.observe(panel);
          observedPanel = panel;
        }
        fullHeight = Math.max(fullHeight, window.innerHeight);
        const visibleBottom = Math.min(window.innerHeight, visualViewport.offsetTop + visualViewport.height);
        const keyboardOpen = fullHeight - visibleBottom > 120;
        document.documentElement.classList.toggle('trip-window-kb-open', keyboardOpen);
        // When the browser itself shrinks the layout viewport (Android
        // resizes-content), flex-end docking already puts the window above
        // the keyboard — any extra transform lift would move the painted
        // window away from its touch targets, so keep the transform at zero.
        // The measured lift is only for viewports that do NOT resize (iOS).
        const contentResized = fullHeight - window.innerHeight > 120;
        let shift = 0;
        if (panel && keyboardOpen && !contentResized) {
          const rect = panel.getBoundingClientRect();
          shift = Math.max(0, Math.ceil(rect.bottom - visibleBottom + 30));
        }
        if (shift !== lastShiftWritten) {
          lastShiftWritten = shift;
          document.documentElement.style.setProperty('--agape-kb-shift', `${shift}px`);
        }
      });
    };
    const scheduleSettlePass = () => {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = window.setTimeout(syncWindowShift, 220);
    };
    // Rotation changes the portrait/landscape baseline; without this reset
    // the stale taller baseline keeps the keyboard heuristic stuck ON.
    const resetBaseline = () => { fullHeight = window.innerHeight; syncWindowShift(); };
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncWindowShift) : null;
    syncWindowShift();
    visualViewport.addEventListener('resize', syncWindowShift);
    visualViewport.addEventListener('scroll', syncWindowShift);
    window.addEventListener('resize', syncWindowShift);
    window.addEventListener('orientationchange', resetBaseline);
    if (window.screen && window.screen.orientation && window.screen.orientation.addEventListener) {
      window.screen.orientation.addEventListener('change', resetBaseline);
    }
    document.addEventListener('focusin', scheduleSettlePass, true);
    document.addEventListener('focusout', scheduleSettlePass, true);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (settleTimer) clearTimeout(settleTimer);
      if (resizeObserver) resizeObserver.disconnect();
      visualViewport.removeEventListener('resize', syncWindowShift);
      visualViewport.removeEventListener('scroll', syncWindowShift);
      window.removeEventListener('resize', syncWindowShift);
      window.removeEventListener('orientationchange', resetBaseline);
      if (window.screen && window.screen.orientation && window.screen.orientation.removeEventListener) {
        window.screen.orientation.removeEventListener('change', resetBaseline);
      }
      document.removeEventListener('focusin', scheduleSettlePass, true);
      document.removeEventListener('focusout', scheduleSettlePass, true);
      document.documentElement.classList.remove('trip-window-open');
      document.documentElement.classList.remove('trip-window-kb-open');
      document.documentElement.style.setProperty('--agape-kb-shift', '0px');
    };
  }, []);

  // GPS is mandatory — always active on mount
  // Clean up undo timeout on unmount
  useEffect(() => {
    return () => { if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current); };
  }, []);

  // ── HARDWARE/GESTURE BACK CLOSES TRIP WINDOWS (native behavior) ──
  // When any trip window opens we push one history entry; Android back then
  // closes the window instead of leaving the app. Closing a window through
  // its own buttons pops the sentinel so back never needs a double press.
  const anyTripWindowOpen = Boolean(
    showOdometerPrompt
    || showArrivalConfirm
    || showSignatureConfirm
    || routeStopOdometerPrompt
    || routeStopSignaturePrompt
    || showCompleteModal
    || scheduleEditorTrip
    || showContactSelector
    || quickSmsMenuTrip
    || showMoreOptions
    || transferPrompt
    || passwordPrompt
  );
  const tripWindowBackSentinelRef = useRef(false);
  useEffect(() => {
    const closeAllTripWindows = () => {
      setShowOdometerPrompt(null);
      setShowArrivalConfirm(null);
      setShowSignatureConfirm(null);
      setRouteStopOdometerPrompt(null);
      setRouteStopSignaturePrompt(null);
      setShowCompleteModal(null);
      setScheduleEditorTrip(null);
      setShowContactSelector(null);
      setQuickSmsMenuTrip(null);
      setShowMoreOptions(null);
      setTransferPrompt(null);
      setPasswordPrompt(null);
      setPasswordValue('');
      setPasswordError('');
    };
    if (anyTripWindowOpen && !tripWindowBackSentinelRef.current) {
      try { window.history.pushState({ agapeTripWindow: true }, ''); tripWindowBackSentinelRef.current = true; } catch { /* history unavailable */ }
    }
    const handlePop = () => {
      if (tripWindowBackSentinelRef.current) {
        tripWindowBackSentinelRef.current = false;
        closeAllTripWindows();
      }
    };
    window.addEventListener('popstate', handlePop);
    return () => {
      window.removeEventListener('popstate', handlePop);
      // Window closed via UI: consume the sentinel entry so Back won't skip.
      if (tripWindowBackSentinelRef.current && typeof window.history.state?.agapeTripWindow === 'boolean') {
        tripWindowBackSentinelRef.current = false;
        try { window.history.back(); } catch { /* noop */ }
      }
    };
  }, [anyTripWindowOpen]);

  const getTodayStr = () => localCalendarYmd();

  const filteredDriverScopedTrips = useMemo(() => {
    if (role !== 'admin' && role !== 'dispatcher') return driverScopedTrips;
    if (adminDriverFilter === 'all') return driverScopedTrips;
    return driverScopedTrips.filter(t => t.driverId === adminDriverFilter);
  }, [driverScopedTrips, role, adminDriverFilter]);

  const myTrips = useMemo(() => filteredDriverScopedTrips
    .filter(t => isTripDateToday(t.date) || !isWorkflowTerminalTrip(t))
    .sort((a, b) => {
      const aKey = activeSortKeyOverrides[a.id];
      const bKey = activeSortKeyOverrides[b.id];
      if (aKey !== undefined || bKey !== undefined) {
        if (aKey !== undefined && bKey !== undefined) return String(aKey).localeCompare(String(bKey));
        return aKey !== undefined ? -1 : 1;
      }
      const today = localCalendarYmd();
      const aToday = tripCalendarDateKey(a.date) === today ? 0 : 1;
      const bToday = tripCalendarDateKey(b.date) === today ? 0 : 1;
      if (aToday !== bToday) return aToday - bToday;
      return timeToMinutes(a.time) - timeToMinutes(b.time);
    }), [filteredDriverScopedTrips, activeSortKeyOverrides]);

  const historyWindowEnd = localCalendarYmd();
  const historyWindowStart = calendarDateKeyDaysAgo(DRIVER_HISTORY_LOOKBACK_DAYS - 1);
  const allHistory = useMemo(() => filteredDriverScopedTrips
    .filter(isWorkflowTerminalTrip)
    .sort((a, b) => {
      const dateCompare = String(getTripHistoryDateKey(a) || '').localeCompare(String(getTripHistoryDateKey(b) || ''));
      if (dateCompare !== 0) return dateCompare;
      return timeToMinutes(a.time) - timeToMinutes(b.time);
    }), [filteredDriverScopedTrips]);
  const historyWindowTrips = useMemo(() => allHistory.filter((trip) => {
    const dateKey = getTripHistoryDateKey(trip);
    return Boolean(dateKey) && dateKey >= historyWindowStart && dateKey <= historyWindowEnd;
  }), [allHistory, historyWindowStart, historyWindowEnd]);
  const selectedHistoryDate = historyDate < historyWindowStart
    ? historyWindowStart
    : historyDate > historyWindowEnd
      ? historyWindowEnd
      : historyDate;
  const selectedHistoryDayTrips = useMemo(() => historyWindowTrips.filter((trip) => getTripHistoryDateKey(trip) === selectedHistoryDate), [historyWindowTrips, selectedHistoryDate]);
  const historyStatusCounts = useMemo(() => ({
    all: selectedHistoryDayTrips.length,
    completed: selectedHistoryDayTrips.filter(t => normalizeWorkflowStatus(t.status) === 'completed').length,
    noshow: selectedHistoryDayTrips.filter(t => normalizeWorkflowStatus(t.status) === 'no show').length,
    cancelled: selectedHistoryDayTrips.filter(t => normalizeWorkflowStatus(t.status) === 'cancelled').length,
    rerouted: selectedHistoryDayTrips.filter(t => normalizeWorkflowStatus(t.status) === 'rerouted').length,
  }), [selectedHistoryDayTrips]);
  useEffect(() => {
    if (historyDate !== selectedHistoryDate) setHistoryDate(selectedHistoryDate);
  }, [historyDate, selectedHistoryDate]);
  const goToHistoryDay = (days) => {
    setHistoryExpandedId(null);
    const next = addDaysToDateKey(selectedHistoryDate, days);
    if (next < historyWindowStart) setHistoryDate(historyWindowStart);
    else if (next > historyWindowEnd) setHistoryDate(historyWindowEnd);
    else setHistoryDate(next);
  };

  const activeTrips = useMemo(() => myTrips.filter(t => !isWorkflowTerminalTrip(t)), [myTrips]);
  activeTripsRef.current = activeTrips;
  const activeWorkTrip = activeWorkTripId
    ? driverScopedTrips.find((trip) => trip.id === activeWorkTripId) || null
    : null;
  useEffect(() => {
    if (activeWorkTripId && trips.length > 0 && !driverScopedTrips.some((trip) => trip.id === activeWorkTripId)) {
      setActiveWorkTripId(null);
      setActiveNav('trips');
      setWorkNotesOpen(false);
    }
  }, [activeWorkTripId, driverScopedTrips, trips]);
  const activeLocationTrip = activeTrips.find((trip) => [
    'In Mission',
    'En Route',
    'In Progress',
    'Navigating Pickup',
    'At Pickup',
    'In Transit',
    'Navigating Dropoff',
    'At Dropoff',
    'Arrived',
    'Arrived PU',
    'Arrived DO',
  ].includes(trip.status)) || activeTrips[0] || null;

  const orderedTrips = useMemo(() => stackInOutPairs([...activeTrips].sort((a, b) => {
    const aKey = activeSortKeyOverrides[a.id];
    const bKey = activeSortKeyOverrides[b.id];
    if (aKey !== undefined || bKey !== undefined) {
      if (aKey !== undefined && bKey !== undefined) return String(aKey).localeCompare(String(bKey));
      return aKey !== undefined ? -1 : 1;
    }

    // 1. If guided mode is active, the absolute top priority is the current step's trip
    if (guidedMode && guidedSteps && guidedSteps[guidedStepIndex]) {
      if (a.id === guidedSteps[guidedStepIndex].tripId && b.id !== guidedSteps[guidedStepIndex].tripId) return -1;
      if (b.id === guidedSteps[guidedStepIndex].tripId && a.id !== guidedSteps[guidedStepIndex].tripId) return 1;
    }

    // 2. Trips that are currently in progress should be pushed to the top
    const inProgressStatuses = [
      'In Mission',
      'En Route',
      'In Progress',
      'Navigating Pickup',
      'At Pickup',
      'In Transit',
      'Navigating Dropoff',
      'At Dropoff',
      'Arrived',
      'Arrived PU',
      'Arrived DO',
    ];
    const aInProgress = inProgressStatuses.includes(a.status);
    const bInProgress = inProgressStatuses.includes(b.status);
    if (aInProgress && !bInProgress) return -1;
    if (bInProgress && !aInProgress) return 1;

    // 2b. In/Out B leg whose A leg is completed should jump to top (next to do)
    const aIsInOutB = isInOutTrip(a) && String(a.inOutLeg || '').toUpperCase() === 'B';
    const bIsInOutB = isInOutTrip(b) && String(b.inOutLeg || '').toUpperCase() === 'B';
    if (aIsInOutB || bIsInOutB) {
      const findPairedALegCompleted = (legB) => {
        if (!legB.inOutPairTripId) return false;
        const pairTrip = driverScopedTrips.find(t => t.id === legB.inOutPairTripId);
        return pairTrip && isWorkflowTerminalTrip(pairTrip);
      };
      const aPairCompleted = aIsInOutB && findPairedALegCompleted(a);
      const bPairCompleted = bIsInOutB && findPairedALegCompleted(b);
      if (aPairCompleted && !bPairCompleted) return -1;
      if (bPairCompleted && !aPairCompleted) return 1;
    }

    // 3. Urgent trips with deadlines stay above ordinary scheduled work.
    if (!!a.urgentTrip !== !!b.urgentTrip) return a.urgentTrip ? -1 : 1;
    if (a.urgentTrip && b.urgentTrip) {
      const deadlineDiff = (getUrgentDeadlineMs(a) || Number.MAX_SAFE_INTEGER) - (getUrgentDeadlineMs(b) || Number.MAX_SAFE_INTEGER);
      if (deadlineDiff !== 0) return deadlineDiff;
    }

    // 4. Fall back to AI sequence if it exists
    if (aiSequence && aiSequence.length > 0) {
      const aiA = aiSequence.indexOf(a.id);
      const aiB = aiSequence.indexOf(b.id);
      if (aiA !== -1 || aiB !== -1) {
        if (aiA === -1) return 1;
        if (aiB === -1) return -1;
        return aiA - aiB;
      }
    }

    // 5. Will Call / no-time trips always go to the bottom
    const aWC = isWillCall(a);
    const bWC = isWillCall(b);
    if (aWC !== bWC) return aWC ? 1 : -1;

    // 6. Otherwise fall back to urgency and then time.
    const urgencyDiff = getUrgency(b) - getUrgency(a);
    if (urgencyDiff !== 0) return urgencyDiff;
    return timeToMinutes(a.time) - timeToMinutes(b.time);
  })), [activeTrips, guidedMode, guidedSteps, guidedStepIndex, driverScopedTrips, aiSequence, activeSortKeyOverrides]);

  const todayKey = localCalendarYmd();
  const serviceDateBuckets = useMemo(() => buildDriverServiceDateBuckets(orderedTrips, todayKey), [orderedTrips, todayKey]);
  const todayTrips = serviceDateBuckets.todayTrips;
  const tomorrowTrips = serviceDateBuckets.tomorrowTrips;

  // Notify urgent trips (once per trip)
  useEffect(() => {
    const urgent = orderedTrips.filter(t => getUrgency(t) > 0 && !notifiedTripsRef.current.has(t.id));
    urgent.forEach(t => {
      notifiedTripsRef.current.add(t.id);
      const level = getUrgency(t) === 2 ? 'Overdue' : 'Due Soon';
      playNotificationSound();
      showLocalNotification(`🚨 ${level}: ${t.patient}`, `${t.time} — ${t.pickup} → ${t.dropoff}`);
    });
  }, [trips, orderedTrips]);

  const timedTrips = useMemo(() => orderedTrips.filter(t => !isWillCall(t)), [orderedTrips]);
  const willCallTrips = useMemo(() => orderedTrips.filter(t => isWillCall(t)), [orderedTrips]);
  const transferTargetDrivers = useMemo(() => (
    (allDrivers || drivers || [])
      .filter((driver) => driver?.id && driver.id !== me?.id)
      .filter((driver) => String(driver.status || '').toLowerCase() !== 'inactive')
  ), [allDrivers, drivers, me?.id]);
  const incomingTransferTrips = useMemo(() => (
    driverScopedTrips.filter((trip) => (
      trip.transferRequest?.status === 'pending'
      && (
        trip.transferRequest?.toDriverId === me?.id
        || normalizeEmail(trip.transferRequest?.toDriverEmail) === normalizeEmail(me?.email || currentUser)
      )
    ))
  ), [driverScopedTrips, me?.id, me?.email, currentUser]);
  const assignedRoutePlanStops = useMemo(() => {
    if (!assignedSequence?.sequence?.length) return [];
    const realTripIds = new Set((driverScopedTrips || []).map((trip) => trip.id));
    return (assignedSequence.sequence || [])
      .map((stop, index) => ({ ...stop, sequenceIndex: index + 1 }))
      .filter((stop) => (
        stop?.source === 'route-plan'
        || (stop?.address && stop?.clientId && !realTripIds.has(stop.clientId))
      ));
  }, [assignedSequence, driverScopedTrips]);
  const getRoutePlanStopPhone = useCallback((stop) => {
    if (!stop) return '';
    const directPhone = stop.phone || stop.patientPhone || stop.pickupPhone || stop.dropoffPhone;
    if (directPhone) return directPhone;
    const stopType = String(stop.type || '').toUpperCase() === 'DO' ? 'DO' : 'PU';
    const bookingId = String(stop.bookingId || '').trim().toLowerCase();
    const address = String(stop.address || '').trim().toLowerCase();
    const name = String(stop.name || '').trim().toLowerCase();
    const matchedTrip = (driverScopedTrips || []).find((trip) => {
      const tripBooking = String(trip.bookingId || trip.tripNumber || trip.id || '').trim().toLowerCase();
      const tripName = String(trip.patient || trip.patientName || '').trim().toLowerCase();
      const pickup = String(trip.pickup || '').trim().toLowerCase();
      const dropoff = String(trip.dropoff || '').trim().toLowerCase();
      return (bookingId && tripBooking === bookingId)
        || (name && tripName === name && ((stopType === 'PU' && pickup === address) || (stopType === 'DO' && dropoff === address)))
        || (address && (pickup === address || dropoff === address));
    });
    if (!matchedTrip) return '';
    return stopType === 'DO'
      ? (matchedTrip.dropoffPhone || matchedTrip.patientPhone || matchedTrip.patientMobile || matchedTrip.pickupPhone || '')
      : (matchedTrip.pickupPhone || matchedTrip.patientPhone || matchedTrip.patientMobile || matchedTrip.dropoffPhone || '');
  }, [driverScopedTrips]);
  const getRoutePlanStopKey = useCallback((stop) => (
    `${stop?.clientId || stop?.id || 'stop'}:${String(stop?.type || 'PU').toUpperCase()}:${stop?.stepNumber || stop?.sequenceIndex || 0}`
  ), []);
  const routePlanWorkflow = assignedSequence?.driverWorkflow || {};
  const getRoutePlanStopWorkflow = useCallback((stop) => (
    routePlanWorkflow[getRoutePlanStopKey(stop)] || {}
  ), [getRoutePlanStopKey, routePlanWorkflow]);
  const isRoutePlanStopCompleted = useCallback((stop) => {
    const workflow = getRoutePlanStopWorkflow(stop);
    return ['Completed', 'No Show', 'Cancelled', 'Rerouted'].includes(workflow.status) || !!workflow.completedAt;
  }, [getRoutePlanStopWorkflow]);
  const currentRoutePlanStopIndex = assignedRoutePlanStops.findIndex((stop) => !isRoutePlanStopCompleted(stop));
  const currentRoutePlanStop = currentRoutePlanStopIndex >= 0 ? assignedRoutePlanStops[currentRoutePlanStopIndex] : null;
  const hasGuidedRenderableTrips = guidedMode
    && Array.isArray(guidedSteps)
    && guidedSteps.some((step) => driverScopedTrips.some((trip) => trip.id === step.tripId));
  const hasRoutePlanGuidedStops = guidedMode && assignedRoutePlanStops.length > 0 && !hasGuidedRenderableTrips;
  const incomingTransferRoutes = useMemo(() => (
    (routeTemplates || [])
      .filter((route) => route.transferRequest?.status === 'pending')
      .filter((route) => (
        route.transferRequest?.toDriverId === me?.id
        || normalizeEmail(route.transferRequest?.toDriverEmail) === normalizeEmail(me?.email || currentUser)
      ))
  ), [routeTemplates, me?.id, me?.email, currentUser]);

  const isClockedIn = me?.clockedIn || false;
  const TT = TIME_TRACKING_STATES;
  const [ttState, setTtState] = useState(TT.OFF_SHIFT);
  const ttStateRef = useRef(TT.OFF_SHIFT);
  const [ttBillableMin, setTtBillableMin] = useState(0);
  const [ttBreakMin, setTtBreakMin] = useState(0);
  const ttBreakStartRef = useRef(null);
  const ttClockInTimeRef = useRef(null);
  const ttLastTripEventRef = useRef(null);
  const ttEventsLogRef = useRef([]);
  const ttTickRef = useRef(null);
  const ttAccumulatedBreakMsRef = useRef(0);
  const clockOutOfferedRef = useRef(false);
  const [editHomeAddress, setEditHomeAddress] = useState(me?.homeAddress || '');
  const [selectedWorkDate, setSelectedWorkDate] = useState(localCalendarYmd());
  const [timeCorrectionRequests, setTimeCorrectionRequests] = useState([]);
  const [correctionDraft, setCorrectionDraft] = useState(null);
  const [correctionSaving, setCorrectionSaving] = useState(false);
  const [correctionError, setCorrectionError] = useState('');

  const driverId = me?.id || (() => {
    const normalizedEmail = String(currentUser || '').trim().toLowerCase();
    const seed = normalizedEmail.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase() || 'USER';
    return `DRV-${seed}`;
  })();
  const immutableTimeDeclarations = useMemo(() => {
    const keys = new Set([driverId, me?.driverId, me?.uid, me?.email, currentUser].filter(Boolean).map((value) => String(value).trim().toLowerCase()));
    return (timeTrackingDeclarations || []).filter((event) => [event?.driverId, event?.driverEmail, event?.email, event?.userId]
      .filter(Boolean).map((value) => String(value).trim().toLowerCase()).some((value) => keys.has(value)));
  }, [currentUser, driverId, me?.driverId, me?.email, me?.uid, timeTrackingDeclarations]);

  useEffect(() => {
    const driverEmail = auth.currentUser?.email || me?.email || currentUser;
    if (!driverEmail) return undefined;
    const source = query(collection(db, 'timeTrackingCorrectionRequests'), where('driverEmail', '==', driverEmail));
    return onSnapshot(source, (snapshot) => {
      setTimeCorrectionRequests(snapshot.docs
        .map((itemDoc) => ({ id: itemDoc.id, ...itemDoc.data() }))
        .sort((a, b) => (safeDateMillis(b.createdAt ?? b.clientCreatedAt, 0) || 0) - (safeDateMillis(a.createdAt ?? a.clientCreatedAt, 0) || 0)));
    }, (error) => console.error('Time correction request listener failed:', error));
  }, [currentUser, me?.email]);

  const getTripPickupLocation = useCallback((trip) => {
    const lat = Number(trip?.pickupLat ?? trip?.pickupLatitude);
    const lng = Number(trip?.pickupLng ?? trip?.pickupLongitude);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }, []);

  const getTripDropoffLocation = useCallback((trip) => {
    const lat = Number(trip?.dropoffLat ?? trip?.dropoffLatitude);
    const lng = Number(trip?.dropoffLng ?? trip?.dropoffLongitude);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }, []);

  const getDriverClockLocation = useCallback(() => (
    driverPosition?.lat && driverPosition?.lng
      ? { lat: driverPosition.lat, lng: driverPosition.lng }
      : null
  ), [driverPosition?.lat, driverPosition?.lng]);

  const clockHistory = useMemo(() => {
    const events = [...(me?.clockEvents || []), ...immutableTimeDeclarations];
    const today = new Date();
    const days = [];
    let weeklyMilliseconds = 0;
    const weekStart = new Date(today);
    weekStart.setHours(0, 0, 0, 0);
    const currentDay = weekStart.getDay();
    weekStart.setDate(weekStart.getDate() + (currentDay === 0 ? -6 : 1 - currentDay));
    const buildDay = (d) => {
      const dateKey = localCalendarYmd(d);
      const telemetryBreadcrumbs = getDriverTelemetryBreadcrumbs(driverTelemetry, me, dateKey);
      const model = buildTimeEvents(driverScopedTrips, me, events, timeTrackingPolicyMode, {
        date: dateKey,
        now: new Date(),
        breadcrumbs: telemetryBreadcrumbs,
        automaticShift: true,
      });
      const firstSession = model.sessions[0];
      const lastSession = model.sessions[model.sessions.length - 1];
      const billableMs = model.billableMilliseconds || 0;
      const breakMs = model.sessions.reduce((sum, session) => sum + (session.breakMilliseconds || 0), 0);
      const hasEvidence = model.events.length > 0;
      const historicalOpenShift = dateKey < localCalendarYmd() && model.sessions.some((session) => session.isOpen);
      const hours = hasEvidence ? billableMs / 3600000 : null;
      const needsCorrection = historicalOpenShift || model.anomalies.length > 0 || model.reviewRequiredGaps?.length > 0;
      const personalIntervals = [];
      let openPersonalInterval = null;
      [...model.events]
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        .forEach((event) => {
          if (event.type === 'BREAK_START' && !openPersonalInterval) {
            openPersonalInterval = event;
          } else if (event.type === 'BREAK_END' && openPersonalInterval) {
            const startMs = new Date(openPersonalInterval.timestamp).getTime();
            const endMs = new Date(event.timestamp).getTime();
            personalIntervals.push({
              start: openPersonalInterval.timestamp,
              end: event.timestamp,
              minutes: Math.max(0, Math.round((endMs - startMs) / 60000)),
              reason: openPersonalInterval.reason || 'PERSONAL_UNAVAILABLE',
              endReason: event.reason || 'RETURNED_TO_WORK',
              confidence: event.confidence || openPersonalInterval.confidence || 'recorded',
              tripId: event.tripId || null,
            });
            openPersonalInterval = null;
          }
        });
      if (openPersonalInterval) {
        const startMs = new Date(openPersonalInterval.timestamp).getTime();
        const endMs = dateKey === localCalendarYmd() ? Date.now() : startMs;
        personalIntervals.push({
          start: openPersonalInterval.timestamp,
          end: null,
          minutes: Math.max(0, Math.round((endMs - startMs) / 60000)),
          reason: openPersonalInterval.reason || 'PERSONAL_UNAVAILABLE',
          endReason: 'ACTIVE',
          confidence: 'open',
          tripId: null,
        });
      }
      const isFuture = dateKey > localCalendarYmd();
      const status = needsCorrection
        ? 'Review required'
        : dateKey === localCalendarYmd() && model.sessions.some((session) => session.isOpen)
          ? 'Active'
          : hasEvidence && model.approvalEligible
            ? 'Completed'
            : isFuture && model.trips.length > 0 ? 'Scheduled' : 'No activity';
      return {
        dateKey,
        hasEvents: hasEvidence,
        tripCount: model.trips.length,
        clockIn: firstSession?.clockInTime || null,
        clockOut: lastSession?.clockOutTime || null,
        hours,
        breakMin: Math.round(breakMs / 60000),
        personalIntervals,
        anomalies: model.anomalies,
        reviewRequiredGaps: model.reviewRequiredGaps || [],
        reconciliation: model.reconciliation,
        approvalEligible: model.approvalEligible,
        needsCorrection,
        status,
      };
    };
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const day = buildDay(d);
      days.push(day);
      if (d >= weekStart && day.hours != null) weeklyMilliseconds += day.hours * 3600000;
    }
    const weekDays = Array.from({ length: 7 }, (_, index) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + index);
      return buildDay(d);
    });
    const weeklyTotal = weeklyMilliseconds / 3600000;
    const weeklyOvertime = weeklyTotal > 40 ? weeklyTotal - 40 : 0;
    return { days, weekDays, weeklyTotal, weeklyOvertime };
  }, [driverScopedTrips, driverTelemetry, immutableTimeDeclarations, me, timeTrackingPolicyMode]);

  // Cleanup timekeeping interval on unmount.
  useEffect(() => {
    return () => {
      if (ttTickRef.current) clearInterval(ttTickRef.current);
    };
  }, []);

  // ─── TIME TRACKING: sync clock-in/out with TT state ───
  useEffect(() => {
    if (isClockedIn && ttStateRef.current === TT.OFF_SHIFT) {
      const now = new Date();
      const clockedInAt = me?.clockedInAt;
      const clockInTime = toValidDate(clockedInAt) || now;
      const elapsedMs = Math.max(0, now - clockInTime);
      const savedBreakMs = Number(me?.totalBreakMilliseconds)
        || Math.max(0, Number(me?.totalBreakMinutes || 0) * 60000);
      const isOnBreak = me?.timeTrackingState === 'ON_BREAK' || me?.lastBreakStart;
      const breakStart = me?.lastBreakStart;
      let additionalBreakMs = 0;
      if (isOnBreak && breakStart) {
        additionalBreakMs = Math.max(0, now - new Date(breakStart));
      }
      const totalBreakMs = savedBreakMs + additionalBreakMs;
      const billableMs = Math.max(0, elapsedMs - totalBreakMs);
      setTtState(isOnBreak ? TT.ON_BREAK : TT.ON_SHIFT_ACTIVE);
      ttStateRef.current = isOnBreak ? TT.ON_BREAK : TT.ON_SHIFT_ACTIVE;
      const safeClockInIso = toSafeIso(clockInTime, now.toISOString());
      ttClockInTimeRef.current = safeClockInIso;
      ttEventsLogRef.current = [{ type: toValidDate(clockedInAt) ? 'AUTO_CLOCK_IN' : 'CLOCK_IN', timestamp: safeClockInIso, location: driverPosition ? { lat: driverPosition.lat, lng: driverPosition.lng } : null }];
      ttAccumulatedBreakMsRef.current = savedBreakMs;
      setTtBillableMin(Math.floor(billableMs / 60000));
      setTtBreakMin(Math.floor(totalBreakMs / 60000));
      ttBreakStartRef.current = isOnBreak ? breakStart : null;
      ttLastTripEventRef.current = null;
    } else if (!isClockedIn && ttStateRef.current !== TT.OFF_SHIFT) {
      if (ttTickRef.current) { clearInterval(ttTickRef.current); ttTickRef.current = null; }
      const now = new Date().toISOString();
      const lastEvent = ttEventsLogRef.current[ttEventsLogRef.current.length - 1];
      if (lastEvent?.type !== 'CLOCK_OUT') {
        ttEventsLogRef.current.push({ type: 'CLOCK_OUT', timestamp: now, location: driverPosition ? { lat: driverPosition.lat, lng: driverPosition.lng } : null });
      }
      setTtState(TT.OFF_SHIFT);
      ttStateRef.current = TT.OFF_SHIFT;
      ttClockInTimeRef.current = null;
      ttAccumulatedBreakMsRef.current = 0;
      setTtBillableMin(0);
      setTtBreakMin(0);
    }
  }, [isClockedIn, driverPosition?.lat, driverPosition?.lng, me?.clockedInAt, me?.lastBreakStart, me?.timeTrackingState, me?.totalBreakMilliseconds, me?.totalBreakMinutes]);

  // ─── TIME TRACKING: tick billable minutes every 60s while ON_SHIFT_ACTIVE ───
  useEffect(() => {
    if (ttStateRef.current !== TT.OFF_SHIFT && ttClockInTimeRef.current) {
      if (ttTickRef.current) clearInterval(ttTickRef.current);
      const recalculate = () => {
        const nowMs = Date.now();
        const clockInMs = new Date(ttClockInTimeRef.current).getTime();
        const activeBreakMs = ttStateRef.current === TT.ON_BREAK && ttBreakStartRef.current
          ? Math.max(0, nowMs - new Date(ttBreakStartRef.current).getTime())
          : 0;
        const totalBreakMs = ttAccumulatedBreakMsRef.current + activeBreakMs;
        setTtBreakMin(Math.floor(totalBreakMs / 60000));
        setTtBillableMin(Math.floor(Math.max(0, nowMs - clockInMs - totalBreakMs) / 60000));
      };
      recalculate();
      ttTickRef.current = setInterval(recalculate, 15000);
    }
    return () => { if (ttTickRef.current) { clearInterval(ttTickRef.current); ttTickRef.current = null; } };
  }, [ttState]);

  const recordImmutableTimeDeclaration = useCallback(async (type, timestamp, location, reason) => {
    const driverEmail = auth.currentUser?.email || me?.email || currentUser || '';
    const declarationId = `decl_${driverId || auth.currentUser?.uid || 'driver'}_${type}_${String(timestamp).replace(/[^0-9A-Za-z]/g, '')}`;
    const declaration = {
      type,
      timestamp,
      driverId,
      driverEmail,
      userId: auth.currentUser?.uid || '',
      location: location || null,
      lat: location?.lat ?? null,
      lng: location?.lng ?? null,
      reason,
      source: 'driver_personal_declaration',
      createdAtLocal: new Date().toISOString(),
    };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await queueSyncOperation({
        type: 'setDoc',
        collection: 'timeTrackingDeclarations',
        docId: declarationId,
        data: declaration,
        tenantId: normalizeTenantId(tenantId),
        userId: auth.currentUser?.uid || '',
      });
      return;
    }
    await setDoc(doc(db, 'timeTrackingDeclarations', declarationId), {
      ...declaration,
      createdAt: serverTimestamp(),
    }, { merge: true });
  }, [currentUser, driverId, me?.email, tenantId]);

  const submitTimeCorrectionRequest = useCallback(async () => {
    const reason = String(correctionDraft?.reason || '').trim();
    if (reason.length < 3) {
      setShowToast({ type: 'error', message: 'Explain the correction so it can be reviewed.' });
      return;
    }
    const selectedDay = clockHistory.weekDays.find((day) => day.dateKey === selectedWorkDate)
      || clockHistory.days.find((day) => day.dateKey === selectedWorkDate);
    const driverEmail = auth.currentUser?.email || me?.email || currentUser || '';
    if (!auth.currentUser?.uid || !driverEmail) {
      setCorrectionError('Your secure session is not available. Sign in again, then submit the note.');
      return;
    }
    try {
      setCorrectionSaving(true);
      setCorrectionError('');
      const requestId = `tcr_${auth.currentUser.uid}_${selectedWorkDate}_${Date.now()}`.replace(/[^A-Za-z0-9_-]/g, '_');
      await setDoc(doc(db, 'timeTrackingCorrectionRequests', requestId), {
        driverId,
        driverEmail,
        userId: auth.currentUser?.uid || '',
        driverName: me?.name || '',
        date: selectedWorkDate,
        requestType: correctionDraft?.requestType || 'INCORRECT_TIME',
        proposedTime: correctionDraft?.requestType === 'SHIFT_NOTE' ? null : (correctionDraft?.proposedTime || null),
        reason,
        status: 'pending',
        originalSnapshot: {
          clockIn: selectedDay?.clockIn || null,
          clockOut: selectedDay?.clockOut || null,
          hours: selectedDay?.hours ?? null,
          status: selectedDay?.status || 'No activity',
          tripCount: selectedDay?.tripCount || 0,
        },
        source: 'driver_same_view_request',
        clientCreatedAt: new Date().toISOString(),
        createdAt: serverTimestamp(),
      });
      setCorrectionDraft(null);
      setCorrectionError('');
      setShowToast({
        type: 'success',
        message: typeof navigator !== 'undefined' && navigator.onLine === false
          ? 'Note saved securely on this device. It will sync automatically when service returns.'
          : 'Note recorded for review. The original evidence remains preserved.',
      });
    } catch (error) {
      console.error('Time correction request failed:', error);
      const message = error?.code === 'permission-denied'
        ? 'This account is not authorized to submit a note. Sign out and sign back in to refresh access.'
        : 'The note could not be saved. It remains in the editor so you can retry.';
      setCorrectionError(message);
      setShowToast({ type: 'error', message });
    } finally {
      setCorrectionSaving(false);
    }
  }, [clockHistory.days, clockHistory.weekDays, correctionDraft, currentUser, driverId, me?.email, me?.name, selectedWorkDate]);

  // Resume can be immediate or back-calculated from verified pickup arrival.
  const ttResume = useCallback(async (resumeContext = {}) => {
    if (ttStateRef.current !== TT.ON_BREAK) return;
    const now = toSafeIso(resumeContext.timestamp, new Date().toISOString());
    const resumeLocation = resumeContext.location || getDriverClockLocation();
    const reason = resumeContext.reason || 'RETURNED_TO_WORK';
    if (me?.personalUnavailability?.active) {
      try {
        await recordImmutableTimeDeclaration('BREAK_END', now, resumeLocation, reason);
      } catch (error) {
        console.error('Failed to preserve personal-time return:', error);
        setShowToast({ type: 'error', message: 'Return could not be securely recorded. Check the connection and try again.' });
        return;
      }
    }
    if (ttBreakStartRef.current) {
      const breakMs = new Date(now) - new Date(ttBreakStartRef.current);
      ttAccumulatedBreakMsRef.current += Math.max(0, breakMs);
      setTtBreakMin(Math.floor(ttAccumulatedBreakMsRef.current / 60000));
    }
    ttEventsLogRef.current.push({
      type: 'BREAK_END',
      timestamp: now,
      breakDurationMilliseconds: ttBreakStartRef.current ? Math.max(0, new Date(now) - new Date(ttBreakStartRef.current)) : 0,
      reason,
      tripId: resumeContext.tripId || null,
      travelMinutes: resumeContext.travelMinutes ?? null,
      calculationSource: resumeContext.calculationSource || null,
      confidence: resumeContext.confidence || null,
      pickupArrivalTime: resumeContext.pickupArrivalTime || null,
    });
    ttBreakStartRef.current = null;
    setTtState(TT.ON_SHIFT_ACTIVE);
    ttStateRef.current = TT.ON_SHIFT_ACTIVE;
    onDriverStatusUpdate?.(driverId, true, {
      clockTimestamp: now,
      clockEventType: 'break_end',
      clockEventSource: me?.personalUnavailability?.active ? 'driver_personal_declaration' : 'legacy_break_recovery',
      timeTrackingState: TT.ON_SHIFT_ACTIVE,
      personalUnavailability: null,
      statusAuditTitle: me?.personalUnavailability?.active ? 'Driver Returned From Personal Time' : 'Driver Break Ended',
      statusAuditMessage: `${me?.name || driverId} returned to automatic work tracking.`,
      breakReturnTripId: resumeContext.tripId || null,
      breakReturnTravelMinutes: resumeContext.travelMinutes ?? null,
      breakReturnCalculationSource: resumeContext.calculationSource || null,
      breakReturnConfidence: resumeContext.confidence || null,
      breakReturnPickupArrivalTime: resumeContext.pickupArrivalTime || null,
      ...(resumeLocation ? { clockLocation: resumeLocation } : {}),
    });
    setShowToast({
      type: 'success',
      message: resumeContext.travelMinutes > 0
        ? `Back on shift — ${Math.round(resumeContext.travelMinutes)} min return travel calculated from verified pickup arrival.`
        : 'Break ended — back on shift.',
    });
  }, [driverId, getDriverClockLocation, me?.name, me?.personalUnavailability?.active, onDriverStatusUpdate, recordImmutableTimeDeclaration]);

  const resumeBreakFromPickup = useCallback(async (trip, pickupLocation, pickupArrivalTime, driverLocation) => {
    if (ttStateRef.current !== TT.ON_BREAK) return null;
    const breakStartTime = ttBreakStartRef.current || me?.lastBreakStart || me?.personalUnavailability?.startedAt;
    const lastBreakEvent = [...ttEventsLogRef.current].reverse().find((event) => event.type === 'BREAK_START');
    const breakLocation = me?.personalUnavailability?.location || lastBreakEvent?.location || null;
    let routedTravelMinutes = null;
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      try {
        const route = breakLocation && pickupLocation
          ? await getTravelDuration(breakLocation, pickupLocation)
          : null;
        if (route?.durationSeconds >= 0) routedTravelMinutes = route.durationSeconds / 60;
      } catch (error) {
        console.warn('Return-to-work route lookup failed; using deterministic offline estimate:', error);
      }
    }
    const calculation = calculateReturnToWorkFromPickup({
      breakStartTime,
      pickupArrivalTime,
      breakLocation,
      pickupLocation,
      routedTravelMinutes,
    });
    if (!calculation) return null;
    await ttResume({
      timestamp: calculation.returnTimeIso,
      location: breakLocation || driverLocation || pickupLocation,
      reason: 'VERIFIED_PICKUP_RETURN_TRAVEL',
      tripId: trip?.id || null,
      travelMinutes: calculation.travelMinutes,
      calculationSource: calculation.source,
      confidence: calculation.confidence,
      pickupArrivalTime: calculation.pickupArrivalTime,
    });
    return calculation;
  }, [me?.lastBreakStart, me?.personalUnavailability?.location, me?.personalUnavailability?.startedAt, ttResume]);

  const isPersonalTime = Boolean(me?.personalUnavailability?.active) && ttState === TT.ON_BREAK;
  const hasTripInProgress = activeTrips.some((trip) => getWorkflowStepIndex(trip) >= 0);
  const togglePersonalTime = useCallback(async () => {
    if (!isClockedIn) {
      setShowToast({ type: 'warning', message: 'Automatic tracking begins with verified trip activity.' });
      return;
    }
    if (isPersonalTime) {
      ttResume();
      return;
    }
    if (hasTripInProgress) {
      setShowToast({ type: 'error', message: 'Personal time cannot begin while a trip is in progress.' });
      return;
    }
    const timestamp = new Date().toISOString();
    const location = getDriverClockLocation();
    try {
      await recordImmutableTimeDeclaration('BREAK_START', timestamp, location, 'PERSONAL_UNAVAILABLE');
    } catch (error) {
      console.error('Failed to preserve personal-time declaration:', error);
      setShowToast({ type: 'error', message: 'Personal time could not be securely recorded. Check the connection and try again.' });
      return;
    }
    ttBreakStartRef.current = timestamp;
    setTtState(TT.ON_BREAK);
    ttStateRef.current = TT.ON_BREAK;
    onDriverStatusUpdate?.(driverId, true, {
      clockTimestamp: timestamp,
      clockEventType: 'break_start',
      clockEventSource: 'driver_personal_declaration',
      timeTrackingState: TT.ON_BREAK,
      personalUnavailability: {
        active: true,
        startedAt: timestamp,
        location: location || null,
        source: 'driver_one_tap',
      },
      statusAuditTitle: 'Driver Declared Personal Time',
      statusAuditMessage: `${me?.name || driverId} declared personal unavailability; timestamp and location were captured automatically.`,
      ...(location ? { clockLocation: location } : {}),
    });
    setShowToast({ type: 'info', message: 'Personal time started. The timestamp and location were recorded automatically.' });
  }, [driverId, getDriverClockLocation, hasTripInProgress, isClockedIn, isPersonalTime, me?.name, onDriverStatusUpdate, recordImmutableTimeDeclaration, ttResume]);

  const ttLogTripEvent = useCallback((eventType, tripId, location) => {
    const now = new Date().toISOString();
    const prev = ttLastTripEventRef.current;
    if (prev) {
      const gap = classifyGap(prev.timestamp, now, prev.location, location);
      ttEventsLogRef.current.push({ ...gap.auditRecord, eventType: 'GAP_CLASSIFIED', sessionId: 'live' });
    }
    const evt = { type: 'TRIP_EVENT', eventType, timestamp: now, tripId, location: location || null };
    ttEventsLogRef.current.push(evt);
    ttLastTripEventRef.current = evt;
  }, []);

  const handleStreamLocationUpdate = useCallback(async (driverId, latitude, longitude, telemetry = {}) => {
    if (!driverId) return;
    await onUpdateDriverLocation?.(driverId, latitude, longitude, telemetry);
  }, [onUpdateDriverLocation]);

  const driverLocStream = useDriverLocationStream({
    enabled: Boolean(me?.id),
    driver: me,
    role,
    currentTrip: activeLocationTrip,
    onLocationUpdate: handleStreamLocationUpdate,
    onPositionChange: setDriverPosition,
    onTrackingChange: setIsGpsTracking,
    onPermissionChange: setBackgroundLocation,
  });

  // Auto-re-optimize when trips or GPS changes
  useEffect(() => {
    if (selectedTrips.length >= 2 && driverPosition) {
      const timer = setTimeout(() => {
        runAiOptimization(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [trips, driverPosition?.lat, driverPosition?.lng, selectedTrips]);

  // The home geofence is the authoritative automatic end of a home-to-home shift.
  const geofencePromptedRef = useRef(false);
  useEffect(() => {
    if (!isClockedIn || !driverPosition?.lat || !me?.homeLat || !me?.homeLng) return;
    if (geofencePromptedRef.current) return;
    const activeTripCount = activeTrips.length;
    if (activeTripCount > 0) {
      geofencePromptedRef.current = false;
      return;
    }
    const R = 3958.8;
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(me.homeLat - driverPosition.lat);
    const dLng = toRad(me.homeLng - driverPosition.lng);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(driverPosition.lat))*Math.cos(toRad(me.homeLat))*Math.sin(dLng/2)**2;
    const distMiles = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (distMiles <= 0.12) { // ~200 meters
      geofencePromptedRef.current = true;
      const timestamp = driverPosition.capturedAt || new Date().toISOString();
      onDriverStatusUpdate?.(driverId, false, {
        clockTimestamp: timestamp,
      clockEventType: 'auto_out',
      clockEventSource: 'home_geofence',
      timeTrackingState: TT.OFF_SHIFT,
      timeTrackingAnchor: 'HOME_GPS',
      pendingClockOut: null,
        clockLocation: { lat: driverPosition.lat, lng: driverPosition.lng },
      });
      setShowToast({ type: 'success', message: 'Shift ended automatically at home.' });
    }
  }, [isClockedIn, driverPosition?.lat, driverPosition?.lng, driverPosition?.capturedAt, me?.homeLat, me?.homeLng, activeTrips.length, driverId, onDriverStatusUpdate]);

  // ─── DISPATCHER ADDED TRIP DURING BREAK (Section 13) ───
  const prevTripsCountRef = useRef(activeTrips.length);
  useEffect(() => {
    const prevCount = prevTripsCountRef.current;
    prevTripsCountRef.current = activeTrips.length;
    if (activeTrips.length > prevCount && ttStateRef.current === TT.ON_BREAK) {
      clockOutOfferedRef.current = false;
      setShowToast({ type: 'info', message: 'New trip assigned. Personal time will end automatically from verified pickup travel.' });
    }
  }, [activeTrips.length]);

  const pendingCancelInFlightRef = useRef(false);
  useEffect(() => {
    if (!me?.pendingClockOut || activeTrips.length === 0 || pendingCancelInFlightRef.current) return;
    pendingCancelInFlightRef.current = true;
    onDriverStatusUpdate?.(driverId, true, {
      pendingClockOut: null,
      pendingClockOutCanceledAt: new Date().toISOString(),
      pendingClockOutCancelReason: 'ACTIVE_WORK_FOUND',
      statusAuditTitle: 'Pending Clock-Out Reconciled',
      statusAuditMessage: `${me?.name || driverId} has active assigned work; the pending shift close was removed automatically.`,
    });
    const timer = setTimeout(() => { pendingCancelInFlightRef.current = false; }, 3000);
    return () => clearTimeout(timer);
  }, [activeTrips.length, driverId, me?.name, me?.pendingClockOut, onDriverStatusUpdate]);

  // Detect ride-sharing opportunities — deduplicated, max 3
  useEffect(() => {
    if (activeTrips.length < 2) { setAiRideShare([]); return; }
    const seen = new Set();
    const nearby = [];
    for (let i = 0; i < activeTrips.length && nearby.length < 3; i++) {
      for (let j = i + 1; j < activeTrips.length && nearby.length < 3; j++) {
        const a = activeTrips[i];
        const b = activeTrips[j];
        if (a.patient === b.patient) continue;
        const key = [a.patient, b.patient].sort().join('|');
        if (seen.has(key)) continue;
        const sameArea = a.pickup?.toLowerCase().includes(b.pickup?.toLowerCase().slice(0, 10)) ||
                         b.pickup?.toLowerCase().includes(a.pickup?.toLowerCase().slice(0, 10)) ||
                         a.dropoff?.toLowerCase().includes(b.dropoff?.toLowerCase().slice(0, 10));
        if (sameArea) {
          seen.add(key);
          nearby.push({ tripA: a, tripB: b });
        }
      }
    }
    setAiRideShare(nearby);
  }, [activeTrips]);

  // Detect time conflicts — deduplicated summary, max 5
  useEffect(() => {
    const flagged = new Set();
    const detected = [];
    for (let i = 0; i < activeTrips.length; i++) {
      for (let j = i + 1; j < activeTrips.length; j++) {
        const a = activeTrips[i];
        const b = activeTrips[j];
        if (!a.time || !b.time || a.time === 'Will Call' || b.time === 'Will Call') continue;
        const tA = timeToMinutes(a.time);
        const tB = timeToMinutes(b.time);
        if (tA === 1440 || tB === 1440) continue;
        if (Math.abs(tA - tB) < 30) {
          const key = [a.patient, b.patient].sort().join('|');
          if (!flagged.has(key)) {
            flagged.add(key);
            detected.push({ aName: a.patient, bName: b.patient, timeA: a.time, timeB: b.time });
            if (detected.length >= 5) break;
          }
        }
      }
      if (detected.length >= 5) break;
    }
    setConflicts(detected);
  }, [activeTrips]);

  // Calculate ETAs using Google Maps Distance Matrix
  const calculateEta = useCallback(async (trip, position) => {
    if (!position || !trip?.pickup) return null;
    try {
      const distMiles = await getDistanceMiles(
        { lat: position.lat, lng: position.lng },
        trip.pickupLat ? { lat: trip.pickupLat, lng: trip.pickupLng } : trip.pickup
      );
      if (distMiles !== null) {
        return [trip.id, (distMiles / 30) * 60];
      }
    } catch (e) { console.warn('[ETA calc]', e); }
    return null;
  }, []);

  // Batch update ETAs (limit to first 3 trips, 30s interval to avoid rate limits)
  useEffect(() => {
    if (!(activeNav !== 'tools' && activeNav !== 'settings') || activeTrips.length === 0) return undefined;
    const refreshEtas = async () => {
      const pos = positionRef.current;
      if (!pos?.lat || !pos?.lng) return;
      const measurements = (await Promise.all(
        activeTripsRef.current.slice(0, 3).map((trip) => calculateEta(trip, pos)),
      )).filter(Boolean);
      if (!measurements.length) return;
      measurements.forEach(([tripId, minutes]) => { etasRef.current[tripId] = minutes; });
      setEtas((previous) => mergeDriverEtaMeasurements(previous, measurements));
    };
    const timer = setInterval(() => void refreshEtas(), 30000);
    void refreshEtas();
    return () => clearInterval(timer);
  }, [activeNav, activeTrips.length, calculateEta]);

  // Geofence proximity detection — check every 15s if near pickup/dropoff
  useEffect(() => {
    if (activeNav === 'settings' || activeTrips.length === 0) return undefined;
    const timer = setInterval(() => {
      const pos = positionRef.current;
      if (!pos?.lat || !pos?.lng) return;
      activeTripsRef.current.forEach(trip => {
        const tripKey = trip.id;
        const alreadyNotified = geofenceAlerted.current.has(tripKey);
        const pickupCoords = trip.pickup ? addressCoordsCache.current[trip.pickup] : null;
        const dropoffCoords = trip.dropoff ? addressCoordsCache.current[trip.dropoff] : null;

        if (pickupCoords && !alreadyNotified && (trip.status === 'Navigating Pickup' || trip.status === 'In Progress')) {
          const dist = Math.sqrt(Math.pow(pos.lat - pickupCoords.lat, 2) + Math.pow(pos.lng - pickupCoords.lng, 2)) * 69;
          if (dist <= 0.1 && !geofenceProximityNotified.current.has(`${tripKey}_pu`)) {
            geofenceProximityNotified.current.add(`${tripKey}_pu`);
            setTimeout(() => geofenceProximityNotified.current.delete(`${tripKey}_pu`), 30000);
            setShowToast({ message: `Near pickup: ${trip.patient}. Tap to arrive.`, action: 'arrive-pickup', trip });
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
            toastTimeoutRef.current = setTimeout(() => setShowToast(null), 8000);
          }
        }

        if (dropoffCoords && !alreadyNotified && (trip.status === 'Navigating Dropoff' || trip.status === 'In Transit')) {
          const dist = Math.sqrt(Math.pow(pos.lat - dropoffCoords.lat, 2) + Math.pow(pos.lng - dropoffCoords.lng, 2)) * 69;
          if (dist <= 0.1 && !geofenceProximityNotified.current.has(`${tripKey}_do`)) {
            geofenceProximityNotified.current.add(`${tripKey}_do`);
            setTimeout(() => geofenceProximityNotified.current.delete(`${tripKey}_do`), 30000);
            setShowToast({ message: `Near dropoff: ${trip.patient}. Tap to arrive.`, action: 'arrive-dropoff', trip });
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
            toastTimeoutRef.current = setTimeout(() => setShowToast(null), 8000);
          }
        }
      });
    }, 15000);
    return () => clearInterval(timer);
  }, [activeNav, activeTrips.length]);

  const filteredHistory = useMemo(() => selectedHistoryDayTrips.filter(t => {
    const matchFilter = historyFilter === 'all' ? true :
      historyFilter === 'completed' ? normalizeWorkflowStatus(t.status) === 'completed' :
      historyFilter === 'noshow' ? normalizeWorkflowStatus(t.status) === 'no show' :
      historyFilter === 'cancelled' ? normalizeWorkflowStatus(t.status) === 'cancelled' :
      normalizeWorkflowStatus(t.status) === 'rerouted';
    if (!matchFilter) return false;
    return tripMatchesSearch(t, historySearch);
  }), [selectedHistoryDayTrips, historyFilter, historySearch]);

  const sortedFilteredHistory = useMemo(
    () => [...filteredHistory].sort((a, b) => compareTripsByCompletionAscending(a, b, historySortKeyOverrides)),
    [filteredHistory, historySortKeyOverrides],
  );

  const toggleTripSelect = (tripId) => {
    setSelectedTrips(prev =>
      prev.includes(tripId) ? prev.filter(id => id !== tripId) : [...prev, tripId]
    );
  }

  const runAiOptimization = async (silent = false) => {
    if (selectedTrips.length < 2 && !silent) {
      if (selectedTrips.length === 1) {
        setAiOptimizing(true);
        setAiSuggestions([`Analyzing selected trip...`, `Select 2+ trips for route optimization.`]);
        setAiOptimizing(false);
      }
      return;
    }
    const tripsToOptimize = selectedTrips.length >= 2
      ? activeTrips.filter(t => selectedTrips.includes(t.id))
      : activeTrips;
    if (tripsToOptimize.length < 2) return;
    if (!silent) setAiOptimizing(true);
    try {
      const loc = driverPosition ? `${driverPosition.lat},${driverPosition.lng}` : me?.currentZone || '';
      const result = await aiOptimizeRoute(tripsToOptimize, loc);
      if (result && Array.isArray(result)) {
        setAiSequence(result);
        if (!silent) {
          const orderedNames = result.map(id => tripsToOptimize.find(t => t.id === id)?.patient || id).join(' → ');
          setAiSuggestions([`AI-optimized sequence: ${orderedNames}`, `Estimated time savings based on proximity and schedule.`]);
        }
      }
    } catch (e) { console.warn('[AI optimize]', e); }
    if (!silent) setAiOptimizing(false);
  };

  const selectAllTrips = () => {
    const allIds = activeTrips.map(t => t.id);
    setSelectedTrips(prev => prev.length === allIds.length ? [] : allIds);
  };

  // Auto-advance guided mode when current trip reaches terminal status
  useEffect(() => {
    if (!guidedMode || !guidedSteps || guidedSteps.length === 0 || guidedStepIndex >= guidedSteps.length) return;
    const currentStep = guidedSteps[guidedStepIndex];
    const trip = driverScopedTrips.find(t => t.id === currentStep.tripId);
    if (!trip) return;

    let stepCompleted = false;
    if (currentStep.type === 'PU') {
      if (getWorkflowStepIndex(trip) >= 3 || isWorkflowTerminalTrip(trip)) {
        stepCompleted = true;
      }
    } else {
      if (isWorkflowTerminalTrip(trip)) {
        stepCompleted = true;
      }
    }

    if (stepCompleted) {
      if (guidedLastAdvance.current === guidedStepIndex) return;
      guidedLastAdvance.current = guidedStepIndex;
      const nextIndex = guidedStepIndex + 1;
      if (nextIndex >= guidedSteps.length) {
        if (assignedSequence?.id) {
          void updateAssignedRouteRecord({
            assignmentStatus: ROUTE_ASSIGNMENT_STATUS.COMPLETED,
            completedAt: new Date().toISOString(),
          }, 'Route Completed', `${currentUser} completed route "${assignedSequence.name || 'Assigned Route'}".`);
        }
        setGuidedMode(false);
        setGuidedSteps([]);
        setAiSequence(null);
        setAiSuggestions([]);
        setSelectedTrips([]);
        setGuidedStepIndex(0);
        guidedLastAdvance.current = -1;
      } else {
        const nextStep = guidedSteps[nextIndex];
        setGuidedStepIndex(nextIndex);
      }
    }
  }, [driverScopedTrips, guidedMode, guidedStepIndex, guidedSteps, assignedSequence?.id, assignedSequence?.name, currentUser, updateAssignedRouteRecord]);


  const suggestNavApp = (address) => {
    return navApp;
  };

  const openInNavApp = async (address, app) => {
    const origin = driverPosition ? `${driverPosition.lat},${driverPosition.lng}` : '';
    const preferredApp = app || navApp;
    await openNavigation(address, preferredApp, origin);
  };

  const buildRoutePlanWorkflow = useCallback((stop, updates = {}) => {
    const key = getRoutePlanStopKey(stop);
    const nowIso = new Date().toISOString();
    const existingWorkflow = assignedSequence?.driverWorkflow || {};
    return {
      key,
      workflow: {
        ...existingWorkflow,
        [key]: {
          ...(existingWorkflow[key] || {}),
          routeId: assignedSequence?.id || '',
          stopKey: key,
          stopName: stop?.name || `Stop ${stop?.sequenceIndex || ''}`.trim(),
          stopType: String(stop?.type || 'PU').toUpperCase() === 'DO' ? 'DO' : 'PU',
          address: stop?.address || '',
          bookingId: stop?.bookingId || '',
          phone: stop?.phone || stop?.patientPhone || stop?.pickupPhone || stop?.dropoffPhone || '',
          sequenceIndex: stop?.sequenceIndex || 0,
          ...updates,
          updatedAt: nowIso,
        },
      },
    };
  }, [assignedSequence?.driverWorkflow, assignedSequence?.id, getRoutePlanStopKey]);

  const saveRoutePlanStopWorkflow = useCallback(async (stop, updates = {}, auditTitle = null, auditMessage = null) => {
    if (!stop || !assignedSequence?.id) return null;
    const { workflow } = buildRoutePlanWorkflow(stop, updates);
    await updateAssignedRouteRecord({
      driverWorkflow: workflow,
      assignmentStatus: ROUTE_ASSIGNMENT_STATUS.IN_PROGRESS,
    }, auditTitle, auditMessage);
    return workflow;
  }, [assignedSequence?.id, buildRoutePlanWorkflow, updateAssignedRouteRecord]);

  const handleStartRoutePlanStop = useCallback((stop) => {
    if (!stop) return;
    impact('heavy');
    void saveRoutePlanStopWorkflow(stop, {
      status: 'Started',
      startedAt: new Date().toISOString(),
    }, 'Route Stop Started', `${currentUser} started stop ${stop.sequenceIndex}: ${stop.name || stop.address || 'Route stop'}.`);
  }, [currentUser, saveRoutePlanStopWorkflow]);

  const handleNavigateRoutePlanStop = useCallback((stop) => {
    if (!stop?.address) return;
    impact('heavy');
    void saveRoutePlanStopWorkflow(stop, {
      status: 'Navigating',
      navigatingAt: new Date().toISOString(),
    }, 'Route Stop Navigation', `${currentUser} started navigation to stop ${stop.sequenceIndex}.`);
    openInNavApp(stop.address, suggestNavApp(stop.address));
  }, [currentUser, openInNavApp, saveRoutePlanStopWorkflow, suggestNavApp]);

  const handleArriveRoutePlanStop = useCallback((stop) => {
    if (!stop) return;
    impact('heavy');
    setRouteStopOdometerValue(currentVehicleOdometer > 0 ? String(currentVehicleOdometer) : '');
    resetOdometerPromptState();
    setRouteStopOdometerPrompt(stop);
    focusTripWindowInput();
  }, [currentVehicleOdometer, resetOdometerPromptState]);

  const submitRouteStopOdometer = useCallback(() => {
    if (!routeStopOdometerPrompt || !routeStopOdometerValue) return;
    const evaluation = runOdometerGuard({ raw: routeStopOdometerValue });
    if (evaluation.status === 'empty' || evaluation.status === 'invalid' || evaluation.status === 'blocked') {
      setOdometerError(evaluation.errors[0] || 'Enter the current odometer reading.');
      return;
    }
    if (evaluation.status === 'confirm' && !odometerAck) {
      setOdometerError('Review the warning and confirm the reading before saving.');
      return;
    }
    const odo = evaluation.value;
    setOdometerError('');
    const nowIso = new Date().toISOString();
    void saveRoutePlanStopWorkflow(routeStopOdometerPrompt, {
      status: 'Arrived',
      odometer: odo,
      arrivedAt: nowIso,
      arrivalTime: nowIso,
    }, 'Route Stop Arrived', `${currentUser} arrived at stop ${routeStopOdometerPrompt.sequenceIndex}.`);
    setLastOdometer(odo);
    setRouteStopOdometerPrompt(null);
    setRouteStopOdometerValue('');
  }, [currentUser, odometerAck, routeStopOdometerPrompt, routeStopOdometerValue, runOdometerGuard, saveRoutePlanStopWorkflow]);

  const handleRoutePlanStopSignature = useCallback((stop) => {
    if (!stop) return;
    impact('medium');
    setRouteStopSignatureConfirmed(false);
    setRouteStopSignaturePrompt(stop);
  }, []);

  const confirmRoutePlanStopSignature = useCallback(() => {
    if (!routeStopSignaturePrompt || !routeStopSignatureConfirmed) return;
    void saveRoutePlanStopWorkflow(routeStopSignaturePrompt, {
      status: 'Signed',
      paperSignatureConfirmed: true,
      signatureConfirmedAt: new Date().toISOString(),
    }, 'Route Stop Signed', `${currentUser} confirmed signature for stop ${routeStopSignaturePrompt.sequenceIndex}.`);
    setRouteStopSignaturePrompt(null);
    setRouteStopSignatureConfirmed(false);
  }, [currentUser, routeStopSignatureConfirmed, routeStopSignaturePrompt, saveRoutePlanStopWorkflow]);

  const completeRoutePlanStop = useCallback((stop) => {
    if (!stop || !assignedSequence?.id) return;
    const currentWorkflow = getRoutePlanStopWorkflow(stop);
    if (!currentWorkflow.arrivedAt) {
      handleArriveRoutePlanStop(stop);
      return;
    }
    if (!currentWorkflow.paperSignatureConfirmed) {
      handleRoutePlanStopSignature(stop);
      return;
    }
    impact('heavy');
    const completedAt = new Date().toISOString();
    const { workflow } = buildRoutePlanWorkflow(stop, {
      status: 'Completed',
      completedAt,
      completedBy: currentUser,
      completedVehicle: me?.vehicle || '',
    });
    const allStopsCompleted = assignedRoutePlanStops.every((candidate) => {
      const key = getRoutePlanStopKey(candidate);
      return key === getRoutePlanStopKey(stop) || workflow[key]?.completedAt || workflow[key]?.status === 'Completed';
    });
    void updateAssignedRouteRecord({
      driverWorkflow: workflow,
      assignmentStatus: allStopsCompleted ? ROUTE_ASSIGNMENT_STATUS.COMPLETED : ROUTE_ASSIGNMENT_STATUS.IN_PROGRESS,
      ...(allStopsCompleted ? { completedAt } : {}),
    }, allStopsCompleted ? 'Route Completed' : 'Route Stop Completed', allStopsCompleted
      ? `${currentUser} completed route "${assignedSequence.name || 'Assigned Route'}".`
      : `${currentUser} completed stop ${stop.sequenceIndex}: ${stop.name || stop.address || 'Route stop'}.`);
    if (allStopsCompleted) {
      setGuidedMode(false);
      setGuidedSteps([]);
      setGuidedStepIndex(0);
      guidedLastAdvance.current = -1;
    }
  }, [assignedRoutePlanStops, assignedSequence?.id, assignedSequence?.name, buildRoutePlanWorkflow, currentUser, getRoutePlanStopKey, getRoutePlanStopWorkflow, handleArriveRoutePlanStop, handleRoutePlanStopSignature, me?.vehicle, updateAssignedRouteRecord]);

  const markRoutePlanStopException = useCallback((stop, status, reason = '') => {
    if (!stop || !assignedSequence?.id) return;
    impact('heavy');
    const completedAt = new Date().toISOString();
    const { workflow } = buildRoutePlanWorkflow(stop, {
      status,
      exceptionStatus: status,
      exceptionReason: reason || undefined,
      cancellationReason: reason || undefined,
      exceptionAt: completedAt,
      completedAt,
      completedBy: currentUser,
      completedVehicle: me?.vehicle || '',
    });
    const allStopsTerminal = assignedRoutePlanStops.every((candidate) => {
      const key = getRoutePlanStopKey(candidate);
      const candidateWorkflow = workflow[key] || {};
      return ['Completed', 'No Show', 'Cancelled', 'Rerouted'].includes(candidateWorkflow.status) || !!candidateWorkflow.completedAt;
    });
    void updateAssignedRouteRecord({
      driverWorkflow: workflow,
      assignmentStatus: allStopsTerminal ? ROUTE_ASSIGNMENT_STATUS.COMPLETED : ROUTE_ASSIGNMENT_STATUS.IN_PROGRESS,
      ...(allStopsTerminal ? { completedAt } : {}),
    }, `Route Stop ${status}`, `${currentUser} marked stop ${stop.sequenceIndex}: ${stop.name || stop.address || 'Route stop'} as ${status}${reason ? ` (${reason})` : ''}.`);
    if (allStopsTerminal) {
      setGuidedMode(false);
      setGuidedSteps([]);
      setGuidedStepIndex(0);
      guidedLastAdvance.current = -1;
    }
  }, [assignedRoutePlanStops, assignedSequence?.id, buildRoutePlanWorkflow, currentUser, getRoutePlanStopKey, me?.vehicle, updateAssignedRouteRecord]);

  const undoRoutePlanStopProgress = useCallback((stop) => {
    if (!stop || !assignedSequence?.id) return;
    const key = getRoutePlanStopKey(stop);
    const existingWorkflow = assignedSequence?.driverWorkflow || {};
    const current = existingWorkflow[key] || {};
    if (!Object.keys(current).length) return;
    const nextStopWorkflow = { ...current };
    if (nextStopWorkflow.completedAt || nextStopWorkflow.status === 'Completed') {
      delete nextStopWorkflow.completedAt;
      delete nextStopWorkflow.completedBy;
      delete nextStopWorkflow.completedVehicle;
      nextStopWorkflow.status = nextStopWorkflow.paperSignatureConfirmed ? 'Signed' : nextStopWorkflow.arrivedAt ? 'Arrived' : nextStopWorkflow.navigatingAt ? 'Navigating' : 'Started';
    } else if (nextStopWorkflow.paperSignatureConfirmed || nextStopWorkflow.signatureConfirmedAt) {
      delete nextStopWorkflow.paperSignatureConfirmed;
      delete nextStopWorkflow.signatureConfirmedAt;
      nextStopWorkflow.status = nextStopWorkflow.arrivedAt ? 'Arrived' : nextStopWorkflow.navigatingAt ? 'Navigating' : 'Started';
    } else if (nextStopWorkflow.arrivedAt || nextStopWorkflow.odometer) {
      delete nextStopWorkflow.arrivedAt;
      delete nextStopWorkflow.arrivalTime;
      delete nextStopWorkflow.odometer;
      nextStopWorkflow.status = nextStopWorkflow.navigatingAt ? 'Navigating' : 'Started';
    } else if (nextStopWorkflow.navigatingAt) {
      delete nextStopWorkflow.navigatingAt;
      nextStopWorkflow.status = 'Started';
    } else if (nextStopWorkflow.startedAt || nextStopWorkflow.status === 'Started') {
      delete nextStopWorkflow.startedAt;
      delete nextStopWorkflow.status;
    }
    nextStopWorkflow.updatedAt = new Date().toISOString();
    const nextWorkflow = {
      ...existingWorkflow,
      [key]: nextStopWorkflow,
    };
    void updateAssignedRouteRecord({
      driverWorkflow: nextWorkflow,
      assignmentStatus: ROUTE_ASSIGNMENT_STATUS.IN_PROGRESS,
      completedAt: null,
    }, 'Route Stop Undo', `${currentUser} stepped back stop ${stop.sequenceIndex}: ${stop.name || stop.address || 'Route stop'}.`);
  }, [assignedSequence?.driverWorkflow, assignedSequence?.id, currentUser, getRoutePlanStopKey, updateAssignedRouteRecord]);

  const handleNavigateToPickup = (trip) => {
    impact('heavy');
    advanceWorkflow(trip, 'Navigating Pickup', {});
    preloadGeofence(trip);
    openInNavApp(trip.pickup, navApp);
  };

  const handleNavigateToDropoff = (trip) => {
    impact('heavy');
    preloadGeofence(trip);
    advanceWorkflow(trip, 'Navigating Dropoff', {});
    openInNavApp(trip.dropoff, navApp);
  };

  const handleStartTrip = (trip) => {
    openInNavApp(trip.pickup, suggestNavApp(trip.pickup));
  };

  const handleCall = async (phone, name) => {
    if (isNativeShell()) {
      await showCallActionSheet(phone, name);
    } else {
      await makeCall(phone, name);
    }
  };

  const handleSmartCall = (trip) => {
    const primary = getPrimaryContactForTrip(trip);
    if (!primary) return;
    handleCall(primary.phone, `${primary.label}: ${primary.name}`);
  };

  // Single messaging entry point: every "SMS" button opens the Quick SMS
  // menu (Write Manually + 7 templates). No second SMS button exists.
  const handleSmartSMS = (trip) => {
    setQuickSmsMenuTrip(trip);
  };

  const openContactSelector = (trip) => {
    setShowContactSelector(trip);
  };

  const handleSMS = async (phone, name) => {
    await sendSMS(phone, name);
  }

  const openTransferPrompt = (type, item) => {
    setTransferPrompt({ type, item });
    setTransferTargetDriverId('');
    setTransferReason('');
  };

  const submitTransferRequest = async () => {
    if (!transferPrompt || !transferTargetDriverId) return;
    const targetDriver = transferTargetDrivers.find((driver) => driver.id === transferTargetDriverId);
    if (!targetDriver) return;
    const nowIso = new Date().toISOString();
    const isAdminOrDisp = role === 'admin' || role === 'dispatcher';

    if (isAdminOrDisp) {
      if (transferPrompt.type === 'trip') {
        const trip = transferPrompt.item;
        onUpdateTrip?.(trip.id, 'Assigned', {
          driverId: targetDriver.id,
          driverEmail: targetDriver.email || '',
          driverName: targetDriver.name || targetDriver.email || 'Driver',
          transferStatus: 'direct_reassign',
          workflowUpdatedAt: nowIso,
        });
        onAddAuditLog?.('Trip Reassigned', `${currentUser} reassigned trip for ${trip.patient || trip.id} to ${targetDriver.name}.`, 'emerald');
        setShowToast({ type: 'success', message: `Trip successfully reassigned to ${targetDriver.name}.` });
      } else if (transferPrompt.type === 'route' && assignedSequence?.id) {
        await updateAssignedRouteRecord({
          driverId: targetDriver.id,
          driverEmail: targetDriver.email || '',
          driverName: targetDriver.name || targetDriver.email || 'Driver',
          assignmentStatus: ROUTE_ASSIGNMENT_STATUS.ASSIGNED,
          transferStatus: 'direct_reassign',
          assignedAt: nowIso,
        }, 'Route Reassigned', `${currentUser} reassigned route to ${targetDriver.name}.`);
        setShowToast({ type: 'success', message: `Route successfully reassigned to ${targetDriver.name}.` });
      }
      setTransferPrompt(null);
      setTransferTargetDriverId('');
      setTransferReason('');
      return;
    }

    const request = {
      id: `transfer-${Date.now()}`,
      status: 'pending',
      type: transferPrompt.type,
      fromDriverId: me?.id || '',
      fromDriverEmail: me?.email || currentUser || '',
      fromDriverName: me?.name || currentUser || 'Driver',
      toDriverId: targetDriver.id,
      toDriverEmail: targetDriver.email || '',
      toDriverName: targetDriver.name || targetDriver.email || 'Driver',
      reason: transferReason || 'Emergency transfer request',
      requestedAt: nowIso,
      requestedBy: currentUser || '',
    };
    if (transferPrompt.type === 'trip') {
      const trip = transferPrompt.item;
      advanceWorkflow(trip, 'Transferred', {
        transferRequest: request,
        transferStatus: 'pending',
      });
      onAddAuditLog?.('Trip Transfer Requested', `${request.fromDriverName} requested transfer of ${trip.patient || trip.id} to ${request.toDriverName}.`, 'amber');
    } else if (transferPrompt.type === 'route' && assignedSequence?.id) {
      await updateAssignedRouteRecord({
        transferRequest: request,
        transferStatus: 'pending',
      }, 'Route Transfer Requested', `${request.fromDriverName} requested transfer of route "${assignedSequence.name || 'Assigned Route'}" to ${request.toDriverName}.`);
    }
    setTransferPrompt(null);
    setTransferTargetDriverId('');
    setTransferReason('');
    setShowToast({ type: 'success', message: `Transfer request sent to ${request.toDriverName}.` });
  };

  const applyTripTransferDecision = (trip, accepted) => {
    const req = trip?.transferRequest;
    if (!trip?.id || !req) return;
    const nowIso = new Date().toISOString();
    if (accepted) {
      onUpdateTrip?.(trip.id, 'Assigned', {
        driverId: me?.id || req.toDriverId || '',
        driverEmail: me?.email || req.toDriverEmail || '',
        driverName: me?.name || req.toDriverName || '',
        transferStatus: 'accepted',
        transferRequest: { ...req, status: 'accepted', decidedAt: nowIso, decidedBy: currentUser || '' },
      });
      onAddAuditLog?.('Trip Transfer Accepted', `${me?.name || currentUser} accepted transfer of ${trip.patient || trip.id}.`, 'emerald');
    } else {
      onUpdateTrip?.(trip.id, trip.status, {
        transferStatus: 'declined',
        transferRequest: { ...req, status: 'declined', decidedAt: nowIso, decidedBy: currentUser || '' },
      });
      onAddAuditLog?.('Trip Transfer Declined', `${me?.name || currentUser} declined transfer of ${trip.patient || trip.id}.`, 'rose');
    }
  };

  const applyRouteTransferDecision = async (route, accepted) => {
    const req = route?.transferRequest;
    if (!route?.id || !req) return;
    const nowIso = new Date().toISOString();
    const nextTemplates = routeTemplates.map((template) => {
      if (template.id !== route.id) return template;
      if (!accepted) {
        return {
          ...template,
          transferStatus: 'declined',
          transferRequest: { ...req, status: 'declined', decidedAt: nowIso, decidedBy: currentUser || '' },
        };
      }
      return {
        ...template,
        assignedDriver: me?.id || req.toDriverId || template.assignedDriver,
        transferStatus: 'accepted',
        transferRequest: { ...req, status: 'accepted', decidedAt: nowIso, decidedBy: currentUser || '' },
        assignedAt: nowIso,
        assignedBy: req.fromDriverEmail || req.fromDriverName || currentUser || '',
        assignedByRole: 'driver-transfer',
        assignmentStatus: ROUTE_ASSIGNMENT_STATUS.ASSIGNED,
        driverAcknowledgedAt: null,
      };
    });
    await setDoc(doc(db, 'routeData', 'sequences'), { templates: nextTemplates }, { merge: true });
    if (accepted && Array.isArray(route.validTripIds)) {
      route.validTripIds.forEach((tripId) => {
        const trip = trips.find((item) => item.id === tripId);
        if (trip) {
          onUpdateTrip?.(trip.id, 'Assigned', {
            driverId: me?.id || req.toDriverId || '',
            driverEmail: me?.email || req.toDriverEmail || '',
            driverName: me?.name || req.toDriverName || '',
          });
        }
      });
    }
    onAddAuditLog?.(accepted ? 'Route Transfer Accepted' : 'Route Transfer Declined', `${me?.name || currentUser} ${accepted ? 'accepted' : 'declined'} transfer of route "${route.name || 'Assigned Route'}".`, accepted ? 'emerald' : 'rose');
  };

  const handleArrivePickup = (trip) => {
    const autoOdo = currentVehicleOdometer > 0
      ? String(currentVehicleOdometer)
      : (lastOdometer > 0 ? String(lastOdometer) : '');
    setOdometerValue(autoOdo);
    resetOdometerPromptState();
    setShowOdometerPrompt(trip);
    focusTripWindowInput();
  };

  const submitOdometer = async () => {
    if (!showOdometerPrompt || !odometerValue) return;
    if (tripActionInFlightRef.current) return;
    const evaluation = runOdometerGuard({ raw: odometerValue });
    if (evaluation.status === 'empty' || evaluation.status === 'invalid' || evaluation.status === 'blocked') {
      setOdometerError(evaluation.errors[0] || 'Enter the current odometer reading.');
      return;
    }
    if (evaluation.status === 'confirm' && !odometerAck) {
      setOdometerError('Review the warning and confirm the reading before continuing.');
      return;
    }
    tripActionInFlightRef.current = true;
    try {
    const odo = evaluation.value;
    setOdometerError('');
    // Record pickup arrival + departure timestamps using canonical fields
    const nowIso = new Date().toISOString();
    const pickupLocation = getTripPickupLocation(showOdometerPrompt);
    const driverLocation = getDriverClockLocation();
    if (pickupLocation && driverLocation) {
      const arrivalCheck = validateArrival(driverLocation.lat, driverLocation.lng, pickupLocation.lat, pickupLocation.lng);
      if (!arrivalCheck.valid) {
        setShowToast({ type: 'warning', message: `You are ${arrivalCheck.distanceFeet}ft from pickup. Move closer before confirming arrival.` });
        return;
      }
    }

    await resumeBreakFromPickup(showOdometerPrompt, pickupLocation, nowIso, driverLocation);

    let autoStartedShift = false;
    let homeTravel = null;
    let homeLocation = null;
    if (!isClockedIn && ttStateRef.current === TT.OFF_SHIFT) {
      homeLocation = Number.isFinite(Number(me?.homeLat)) && Number.isFinite(Number(me?.homeLng))
        ? { lat: Number(me.homeLat), lng: Number(me.homeLng) }
        : null;
      const pickupDestination = pickupLocation || driverLocation || showOdometerPrompt.pickup;
      homeTravel = timeTrackingPolicyMode === POLICY_MODES.PAY_FROM_HOME && homeLocation
        ? await calculateBoundaryTravel(homeLocation, pickupDestination)
        : null;
      const anchor = calculateAnchor({
        policyMode: timeTrackingPolicyMode,
        driver: me,
        lastWorkLocation: ttLastTripEventRef.current?.location || null,
        pickupLocation: pickupLocation || driverLocation,
        pickupTime: new Date(nowIso),
      });
      const travelMin = Math.max(0, homeTravel?.minutes ?? anchor.travelMinutes ?? 0);
      const autoClockInTime = homeTravel?.minutes > 0
        ? new Date(new Date(nowIso).getTime() - travelMin * 60000).toISOString()
        : (anchor.clockInTime ? anchor.clockInTime.toISOString() : nowIso);
      const anchorType = homeTravel?.minutes > 0 ? 'HOME_ROUTE' : anchor.anchorType;
      onDriverStatusUpdate?.(driverId, true, {
        clockTimestamp: autoClockInTime,
        clockEventType: 'auto_in',
        timeTrackingState: TT.ON_SHIFT_ACTIVE,
        timeTrackingPolicy: timeTrackingPolicyMode,
        timeTrackingAnchor: anchorType,
        timeTrackingTravelMinutes: travelMin,
        timeTrackingCalculationSource: homeTravel?.source || 'LEGACY_ANCHOR',
        timeTrackingConfidence: homeTravel?.confidence || (anchorType === 'HOME' ? 'route_estimate' : 'trip_verified'),
        ...(anchor.anchorLocation || driverLocation ? { clockLocation: anchor.anchorLocation || driverLocation } : {}),
      });
      setTtState(TT.ON_SHIFT_ACTIVE);
      ttStateRef.current = TT.ON_SHIFT_ACTIVE;
      ttClockInTimeRef.current = autoClockInTime;
      ttEventsLogRef.current = [{
        type: 'AUTO_CLOCK_IN',
        timestamp: autoClockInTime,
        location: anchor.anchorLocation || driverLocation || pickupLocation,
        anchorType,
        travelMinutes: travelMin,
        policyMode: timeTrackingPolicyMode,
      }];
      setTtBillableMin(0);
      setTtBreakMin(0);
      ttBreakStartRef.current = null;
      autoStartedShift = true;
      setShowToast({ type: 'success', message: `Auto clocked in - ${travelMin} min travel included.` });
    }
    advanceWorkflow(showOdometerPrompt, 'At Pickup', {
      pickupOdometer: odo,
      arrivalTime: nowIso,
      startTime: nowIso,
      ...(homeTravel?.minutes > 0 ? {
        homeToPickupTravelMinutes: homeTravel.minutes,
        homeToPickupCalculatedAt: nowIso,
        homeToPickupCalculationSource: homeTravel.source,
        homeToPickupConfidence: homeTravel.confidence,
        homeToPickupDistanceMiles: homeTravel.distanceMiles ?? null,
        homeLocationSnapshot: homeLocation,
        pickupLocationSnapshot: pickupLocation || driverLocation || null,
      } : {}),
    });
    if (autoStartedShift || ttStateRef.current === TT.ON_SHIFT_ACTIVE || ttStateRef.current === TT.ON_BREAK) {
      ttLogTripEvent('TRIP_ARRIVED_PICKUP', showOdometerPrompt.id, driverLocation || pickupLocation);
    }
    setLastOdometer(odo);
    setShowOdometerPrompt(null);
    setOdometerValue('');
    } finally {
      tripActionInFlightRef.current = false;
    }
  };

  const handleArriveDropoff = (trip) => {
    setUndoable(trip, trip.status, 'At Dropoff');
    advanceWorkflow(trip, 'At Dropoff', {
      arrivalDropoffTime: new Date().toISOString(),
    });
    if (ttStateRef.current === TT.ON_SHIFT_ACTIVE || ttStateRef.current === TT.ON_BREAK) {
      ttLogTripEvent('TRIP_ARRIVED_DROPOFF', trip.id, driverPosition ? { lat: driverPosition.lat, lng: driverPosition.lng } : null);
    }
    openCompleteModal(trip);
  };

  const handleSkipNav = (trip) => {
    impact('medium');
    if (trip.status === 'In Progress') {
      handleArrivePickup(trip);
    } else if (trip.status === 'In Transit') {
      handleArriveDropoff(trip);
    }
  };

  const confirmArrival = async () => {
    if (!showArrivalConfirm) return;
    if (tripActionInFlightRef.current) return;
    const arrivalEvaluation = runOdometerGuard({ raw: arrivalOdometer });
    if (arrivalEvaluation.status === 'empty' || arrivalEvaluation.status === 'invalid' || arrivalEvaluation.status === 'blocked') {
      setShowToast({ type: 'warning', message: arrivalEvaluation.errors[0] || 'Enter the current odometer reading before confirming arrival.' });
      return;
    }
    if (arrivalEvaluation.status === 'confirm' && !odometerAck) {
      setShowToast({ type: 'warning', message: 'Review the odometer warning and confirm the reading first.' });
      return;
    }
    tripActionInFlightRef.current = true;
    try {
    const odo = arrivalEvaluation.value;
    setUndoable(showArrivalConfirm, showArrivalConfirm.status, 'At Pickup');
    const nowIso = new Date().toISOString();
    const pickupLocation = getTripPickupLocation(showArrivalConfirm);
    const driverLocation = getDriverClockLocation();
    if (pickupLocation && driverLocation) {
      const arrivalCheck = validateArrival(driverLocation.lat, driverLocation.lng, pickupLocation.lat, pickupLocation.lng);
      if (!arrivalCheck.valid) {
        setShowToast({ type: 'warning', message: `You are ${arrivalCheck.distanceFeet}ft from pickup. Move closer before confirming arrival.` });
        return;
      }
    }
    await resumeBreakFromPickup(showArrivalConfirm, pickupLocation, nowIso, driverLocation);
    let autoStartedShift = false;
    let homeTravel = null;
    let homeLocation = null;
    if (!isClockedIn && ttStateRef.current === TT.OFF_SHIFT) {
      homeLocation = Number.isFinite(Number(me?.homeLat)) && Number.isFinite(Number(me?.homeLng))
        ? { lat: Number(me.homeLat), lng: Number(me.homeLng) }
        : null;
      const pickupDestination = pickupLocation || driverLocation || showArrivalConfirm.pickup;
      homeTravel = timeTrackingPolicyMode === POLICY_MODES.PAY_FROM_HOME && homeLocation
        ? await calculateBoundaryTravel(homeLocation, pickupDestination)
        : null;
      const anchor = calculateAnchor({
        policyMode: timeTrackingPolicyMode,
        driver: me,
        lastWorkLocation: ttLastTripEventRef.current?.location || null,
        pickupLocation: pickupLocation || driverLocation,
        pickupTime: new Date(nowIso),
      });
      const travelMin = Math.max(0, homeTravel?.minutes ?? anchor.travelMinutes ?? 0);
      const autoClockInTime = homeTravel?.minutes > 0
        ? new Date(new Date(nowIso).getTime() - travelMin * 60000).toISOString()
        : (anchor.clockInTime ? anchor.clockInTime.toISOString() : nowIso);
      const anchorType = homeTravel?.minutes > 0 ? 'HOME_ROUTE' : anchor.anchorType;
      onDriverStatusUpdate?.(driverId, true, {
        clockTimestamp: autoClockInTime,
        clockEventType: 'auto_in',
        timeTrackingState: TT.ON_SHIFT_ACTIVE,
        timeTrackingPolicy: timeTrackingPolicyMode,
        timeTrackingAnchor: anchorType,
        timeTrackingTravelMinutes: travelMin,
        timeTrackingCalculationSource: homeTravel?.source || 'LEGACY_ANCHOR',
        timeTrackingConfidence: homeTravel?.confidence || (anchorType === 'HOME' ? 'route_estimate' : 'trip_verified'),
        ...(anchor.anchorLocation || driverLocation ? { clockLocation: anchor.anchorLocation || driverLocation } : {}),
      });
      setTtState(TT.ON_SHIFT_ACTIVE);
      ttStateRef.current = TT.ON_SHIFT_ACTIVE;
      ttClockInTimeRef.current = autoClockInTime;
      ttEventsLogRef.current = [{
        type: 'AUTO_CLOCK_IN',
        timestamp: autoClockInTime,
        location: anchor.anchorLocation || driverLocation || pickupLocation,
        anchorType,
        travelMinutes: travelMin,
        policyMode: timeTrackingPolicyMode,
      }];
      setTtBillableMin(0);
      setTtBreakMin(0);
      ttBreakStartRef.current = null;
      autoStartedShift = true;
      setShowToast({ type: 'success', message: `Auto clocked in - ${travelMin} min travel included.` });
    }
    advanceWorkflow(showArrivalConfirm, 'At Pickup', {
      pickupOdometer: odo,
      arrivalTime: nowIso,
      startTime: nowIso,
      ...(homeTravel?.minutes > 0 ? {
        homeToPickupTravelMinutes: homeTravel.minutes,
        homeToPickupCalculatedAt: nowIso,
        homeToPickupCalculationSource: homeTravel.source,
        homeToPickupConfidence: homeTravel.confidence,
        homeToPickupDistanceMiles: homeTravel.distanceMiles ?? null,
        homeLocationSnapshot: homeLocation,
        pickupLocationSnapshot: pickupLocation || driverLocation || null,
      } : {}),
    });
    if (autoStartedShift || ttStateRef.current === TT.ON_SHIFT_ACTIVE || ttStateRef.current === TT.ON_BREAK) {
      ttLogTripEvent('TRIP_ARRIVED_PICKUP', showArrivalConfirm.id, driverLocation || pickupLocation);
    }
    setLastOdometer(odo);
    setShowArrivalConfirm(null);
    setArrivalOdometer('');
    } finally {
      tripActionInFlightRef.current = false;
    }
  };

  const confirmSignatureAndBegin = () => {
    if (!showSignatureConfirm || !signatureConfirmed) return;
    setUndoable(showSignatureConfirm, showSignatureConfirm.status, 'In Transit');
    advanceWorkflow(showSignatureConfirm, 'In Transit', {
      departedPickupTime: new Date().toISOString(),
      paperSignatureConfirmed: true,
    });
    if (ttStateRef.current === TT.ON_SHIFT_ACTIVE || ttStateRef.current === TT.ON_BREAK) {
      ttLogTripEvent('TRIP_DEPARTED_PICKUP', showSignatureConfirm.id, driverPosition ? { lat: driverPosition.lat, lng: driverPosition.lng } : null);
    }
    setShowSignatureConfirm(null);
    setSignatureConfirmed(false);
  };

  const handleNoShow = (trip) => {
    const patientKey = (trip.patient || '').trim().toLowerCase();
    const activeLegs = driverScopedTrips.filter(t =>
      isTripDateToday(t.date) &&
      (t.patient || '').trim().toLowerCase() === patientKey &&
      !isWorkflowTerminalTrip(t)
    );
    if (activeLegs.length > 1) {
      setCancelPrompt({ type: 'noshow', trip, legs: activeLegs });
    } else {
      setPasswordPrompt({ type: 'noshow', trip, selectedLegIds: [trip.id] });
    }
  };

  const handleCancel = (trip) => {
    const patientKey = (trip.patient || '').trim().toLowerCase();
    const activeLegs = driverScopedTrips.filter(t =>
      isTripDateToday(t.date) &&
      (t.patient || '').trim().toLowerCase() === patientKey &&
      !isWorkflowTerminalTrip(t)
    );
    if (activeLegs.length > 1) {
      setCancelPrompt({ type: 'cancel', trip, legs: activeLegs });
    } else {
      setPasswordPrompt({ type: 'cancel', trip, selectedLegIds: [trip.id] });
    }
  };

  const handleReroute = (trip) => {
    const patientKey = (trip.patient || '').trim().toLowerCase();
    const activeLegs = driverScopedTrips.filter(t =>
      isTripDateToday(t.date) &&
      (t.patient || '').trim().toLowerCase() === patientKey &&
      !isWorkflowTerminalTrip(t)
    );
    if (activeLegs.length > 1) {
      setCancelPrompt({ type: 'reroute', trip, legs: activeLegs });
    } else {
      setPasswordPrompt({ type: 'reroute', trip, selectedLegIds: [trip.id] });
    }
  };

  const handleShowLegs = (task) => {
    const patientKey = (task.patient || task.patientName || '').trim().toLowerCase();
    const allLegs = driverScopedTrips
      .filter(t => isTripDateToday(t.date) && (t.patient || '').trim().toLowerCase() === patientKey)
      .map(t => ({
        id: t.id,
        bookingId: t.bookingId,
        time: to12hr(t.time),
        patient: t.patient,
        status: t.status,
        pickup: t.pickup,
        dropoff: t.dropoff,
        pickupSite: t.pickupSite,
        dropoffSite: t.dropoffSite,
        distance: t.distance,
        wheelchair: t.wheelchair || t.mobility,
        pickupPhone: t.pickupPhone,
        dropoffPhone: t.dropoffPhone,
      }));
    setShowLegsModal(allLegs);
  };

  const handleStartInlineEdit = (trip) => {
    const original = trips.find(t => t.id === trip.id) || trip;
    setHistoryExpandedId(original.id);
    setEditingTripId(original.id);
    setInlineEditError('');
    setEditingTripData({
      patient: original.patient || '',
      bookingId: original.bookingId || '',
      date: original.date || '',
      time: original.time || '',
      type: original.type || '',
      status: original.status || 'Assigned',
      pickup: getFirstTripValue(original, ['pickup', 'pickupAddress']) || '',
      dropoff: getFirstTripValue(original, ['dropoff', 'dropoffAddress']) || '',
      pickupPhone: original.pickupPhone || '',
      dropoffPhone: original.dropoffPhone || '',
      hospitalPhone: original.hospitalPhone || '',
      distance: original.distance || '',
      _pickupTime: isoToTimeInput(original.arrivalTime || original.startTime || original.pickupArrival || original.departedPickupTime),
      _pickupOdometer: original.pickupOdometer || '',
      _dropoffTime: isoToTimeInput(original.arrivalDropoffTime || original.dropoffArrival || original.dropoffTime),
      _dropoffOdometer: original.dropoffOdometer || '',
      _clientSigned: original.paperSignatureConfirmed || false,
      _password: '',
      notes: original.notes || '',
    });
    const frozenKey = getHistoryFinishedSortMs(original);
    setHistorySortKeyOverrides(prev => {
      const next = {};
      next[original.id] = frozenKey;
      return next;
    });
    setActiveSortKeyOverrides(prev => {
      const next = {};
      next[original.id] = original.time || '';
      return next;
    });
  };

  const handleCancelInlineEdit = () => {
    setEditingTripId(null);
    setEditingTripData(null);
    setHistorySortKeyOverrides({});
    setActiveSortKeyOverrides({});
    setInlineEditError('');
  };

  const handleSaveInlineEdit = async () => {
    if (!editingTripId || !editingTripData || inlineEditSaving) return;
    const d = editingTripData;
    const serviceDate = d.date;
    const pickupIso = timeToIsoForTripDate(d._pickupTime, serviceDate);
    const dropoffIso = timeToIsoForTripDate(d._dropoffTime, serviceDate);
    const original = trips.find(t => t.id === editingTripId) || {};
    const cleanData = {
      patient: d.patient || '',
      bookingId: d.bookingId || '',
      date: serviceDate || '',
      time: d.time || '',
      type: d.type || '',
      status: d.status || original.status || 'Assigned',
      pickup: d.pickup || '',
      dropoff: d.dropoff || '',
      pickupPhone: d.pickupPhone || '',
      dropoffPhone: d.dropoffPhone || '',
      hospitalPhone: d.hospitalPhone || '',
      distance: d.distance || '',
      arrivalTime: pickupIso || original.arrivalTime || null,
      startTime: pickupIso || original.startTime || null,
      pickupOdometer: parseOdometerInput(d._pickupOdometer),
      departedPickupTime: pickupIso || original.departedPickupTime || null,
      arrivalDropoffTime: dropoffIso || original.arrivalDropoffTime || null,
      dropoffOdometer: parseOdometerInput(d._dropoffOdometer),
      paperSignatureConfirmed: d._clientSigned,
      notes: d.notes || '',
    };
    const isAdminOrDispatcher = role === 'admin' || role === 'dispatcher';
    setInlineEditError('');
    setInlineEditSaving(true);
    try {
      if (!isAdminOrDispatcher) {
        if (!d._password) throw new Error('Enter your password to save this trip.');
        if (!auth.currentUser?.email) throw new Error('Your sign-in session is unavailable. Sign in again.');
        const credential = EmailAuthProvider.credential(auth.currentUser.email, d._password);
        await reauthenticateWithCredential(auth.currentUser, credential);
      }
      advanceWorkflow(original, cleanData.status || original.status, cleanData);
      setShowTripDetails(prev => (prev?.id === original.id ? { ...prev, ...cleanData } : prev));
      setEditingTripId(null);
      setEditingTripData(null);
      setHistorySortKeyOverrides(prev => ({ ...prev, [original.id]: getHistoryFinishedSortMs({ ...original, ...cleanData }) }));
    } catch (error) {
      setInlineEditError(error?.message || 'Trip was not saved.');
    } finally {
      setInlineEditSaving(false);
    }
  };

  const openScheduleEditor = (trip) => {
    const original = trips.find(t => t.id === trip.id) || driverScopedTrips.find(t => t.id === trip.id) || trip;
    const deadlineBase = original?.urgentDeadlineAt && !Number.isNaN(new Date(original.urgentDeadlineAt).getTime())
      ? new Date(original.urgentDeadlineAt)
      : new Date(Date.now() + 3 * 60 * 60000);
    const mode = original?.urgentTrip
      ? 'urgent'
      : isInOutTrip(original)
        ? 'inout'
        : isWillCall(original)
          ? 'willcall'
          : 'time';
    setScheduleEditorTrip(original);
    setScheduleEditDraft({
      mode,
      time: timeInputOrBlank(original?.time),
      deadlineDate: original?.urgentDeadlineDate || `${deadlineBase.getFullYear()}-${String(deadlineBase.getMonth() + 1).padStart(2, '0')}-${String(deadlineBase.getDate()).padStart(2, '0')}`,
      deadlineTime: original?.urgentDeadlineTime || `${String(deadlineBase.getHours()).padStart(2, '0')}:${String(deadlineBase.getMinutes()).padStart(2, '0')}`,
      requiredWithinHours: original?.urgentRequiredWithinHours || 3,
    });
    setScheduleEditError('');
  };

  const closeScheduleEditor = () => {
    setScheduleEditorTrip(null);
    setScheduleEditDraft(null);
    setScheduleEditError('');
  };

  const updateScheduleDraft = (field, value) => {
    setScheduleEditDraft(prev => ({ ...(prev || {}), [field]: value }));
    setScheduleEditError('');
  };

  const applyWithinHoursToDeadline = () => {
    const hours = Number(scheduleEditDraft?.requiredWithinHours || 0);
    if (!Number.isFinite(hours) || hours <= 0) return;
    const d = new Date(Date.now() + hours * 60 * 60000);
    setScheduleEditDraft(prev => ({
      ...(prev || {}),
      deadlineDate: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      deadlineTime: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    }));
    setScheduleEditError('');
  };

  const saveScheduleEdit = () => {
    if (!scheduleEditorTrip || !scheduleEditDraft) return;
    const mode = scheduleEditDraft.mode;
    const basePayload = {
      status: scheduleEditorTrip.status || 'Assigned',
      urgentTrip: false,
      urgentDeadlineAt: null,
      urgentDeadlineDate: null,
      urgentDeadlineTime: null,
      urgentRequiredWithinHours: null,
      priority: scheduleEditorTrip.priority === 'urgent' ? 'normal' : scheduleEditorTrip.priority || 'normal',
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
      if (!scheduleEditDraft.time) {
        setScheduleEditError('Choose a time before saving.');
        return;
      }
      payload.time = scheduleEditDraft.time;
    } else if (mode === 'willcall') {
      payload.time = 'Will Call';
      payload.tripKind = 'WILL_CALL';
    } else if (mode === 'inout') {
      payload.time = scheduleEditDraft.time || '';
      payload.tripKind = 'IN_OUT';
      payload.inOutTrip = true;
      payload.inOutStayWithClient = true;
      payload.inOutWaitMinutes = IN_OUT_WAIT_MINUTES;
    } else if (mode === 'urgent') {
      if (!scheduleEditDraft.deadlineDate || !scheduleEditDraft.deadlineTime) {
        setScheduleEditError('Choose an urgent deadline date and time.');
        return;
      }
      const deadline = new Date(`${scheduleEditDraft.deadlineDate}T${scheduleEditDraft.deadlineTime}`);
      if (Number.isNaN(deadline.getTime())) {
        setScheduleEditError('Use a valid urgent deadline.');
        return;
      }
      payload.time = scheduleEditDraft.time || scheduleEditorTrip.time || '';
      payload.tripKind = 'URGENT';
      payload.priority = 'urgent';
      payload.urgentTrip = true;
      payload.urgentDeadlineAt = deadline.toISOString();
      payload.urgentDeadlineDate = scheduleEditDraft.deadlineDate;
      payload.urgentDeadlineTime = scheduleEditDraft.deadlineTime;
      payload.urgentRequiredWithinHours = Number(scheduleEditDraft.requiredWithinHours || 0) || null;
    }

    setPasswordPrompt({ type: 'edittrip', trip: scheduleEditorTrip, editedData: payload });
    closeScheduleEditor();
  };

  const verifyPasswordAndProceed = async () => {
    if (!passwordPrompt) return;
    const isAdminOrDisp = role === 'admin' || role === 'dispatcher';
    if (!isAdminOrDisp && !passwordValue) return;
    if (!auth.currentUser) { setPasswordError('Not authenticated. Please sign in again.'); return; }
    setPasswordVerifying(true);
    setPasswordError('');
    try {
      if (!isAdminOrDisp) {
        const credential = EmailAuthProvider.credential(auth.currentUser.email, passwordValue);
        await reauthenticateWithCredential(auth.currentUser, credential);
      }
      const { type, trip, selectedLegIds, reason, assignedSequence: dismissSequence, editedData } = passwordPrompt;
      if (type === 'route_stop_exception') {
        markRoutePlanStopException(passwordPrompt.stop, passwordPrompt.status, reason);
      } else if (type === 'accept_transfer_trip') {
        applyTripTransferDecision(trip, true);
      } else if (type === 'decline_transfer_trip') {
        applyTripTransferDecision(trip, false);
      } else if (type === 'accept_transfer_route') {
        await applyRouteTransferDecision(passwordPrompt.route, true);
      } else if (type === 'decline_transfer_route') {
        await applyRouteTransferDecision(passwordPrompt.route, false);
      } else if (type === 'transfer_send') {
        await submitTransferRequest();
      } else if (type === 'dismiss_route' && dismissSequence) {
        await updateAssignedRouteRecord({
          assignmentStatus: ROUTE_ASSIGNMENT_STATUS.DISMISSED,
          dismissedAt: new Date().toISOString(),
        }, 'Route Dismissed', `${currentUser} dismissed route "${dismissSequence.name || 'Assigned Route'}".`);
      } else if (type === 'edittrip') {
        if (editedData) {
          advanceWorkflow(trip, editedData.status || trip.status, editedData);
          setShowTripDetails(prev => (prev?.id === trip.id ? { ...prev, ...editedData } : prev));
          if (onAddAuditLog) {
            onAddAuditLog('Trip Updated', `${currentUser} updated trip details for ${trip.patient}.`, 'blue');
          }
        }
      } else if (type === 'edittripcomplete') {
        if (editedData) {
          const odo = parseInt(editedData.dropoffOdometer, 10) || 0;
          advanceWorkflow(trip, 'Completed', { ...editedData, completedVehicle: me?.vehicle || '' });
          setShowTripDetails(prev => (prev?.id === trip.id ? { ...prev, ...editedData, status: 'Completed', completedVehicle: me?.vehicle || '' } : prev));
          if (onAddAuditLog) {
            onAddAuditLog('Trip Completed via Edit', `${currentUser} completed trip for ${trip.patient} (odo: ${odo.toLocaleString()} mi).`, 'emerald');
          }
          setLastOdometer(odo);
          if (navigator.onLine) { saveOdometerReading(trip.id, odo).catch(() => {}); }
          setExpandedTripId(null);
          setSelectedTrips(prev => prev.filter(id => id !== trip.id));
        }
      } else if (type === 'restore') {
        const legsToRestore = selectedLegIds && selectedLegIds.length > 0
          ? trips.filter(t => selectedLegIds.includes(t.id))
          : [trip];
        legsToRestore.forEach(leg => {
          const prevStatus = leg.status === 'Completed' ? 'Arrived' : 'Assigned';
          advanceWorkflow(leg, prevStatus, {}, { allowRegression: true });
        });
      } else {
        const newStatus = type === 'noshow' ? 'No Show' : type === 'reroute' ? 'Rerouted' : 'Cancelled';
        const legsToUpdate = selectedLegIds && selectedLegIds.length > 0
          ? trips.filter(t => selectedLegIds.includes(t.id))
          : [trip];
        legsToUpdate.forEach(leg => {
          setUndoable(leg, leg.status, newStatus);
          advanceWorkflow(leg, newStatus, {
            completedAt: new Date().toISOString(),
            cancellationReason: reason || undefined,
            cancelledBy: me?.email || '',
            cancelledAt: new Date().toISOString(),
          });
        });
        setExpandedTripId(null);
      }
      setPasswordPrompt(null);
      setPasswordValue('');
      setPasswordError('');
      setRestorePrompt(null);
      setSelectedLegsForAction(new Set());
    } catch {
      setPasswordError('Incorrect password. Try again.');
    }
    setPasswordVerifying(false);
  };

  const openCompleteModal = (trip) => {
    setShowCompleteModal(trip);
    const odometerSeed = trip.dropoffOdometer
      || (currentVehicleOdometer > 0
        ? currentVehicleOdometer
        : (lastOdometer > 0 ? lastOdometer : trip.pickupOdometer))
      || '';
    setCompleteOdometer(odometerSeed ? String(odometerSeed) : '');
    setCompleteError('');
    setCompleteTimeNotice('');
    setCompleteAck(false);
    const nowLocal = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const defaultTime = `${pad(nowLocal.getHours())}:${pad(nowLocal.getMinutes())}`;
    const pickupArrivalClock = formatTimeInput(getCompletionPickupBoundary(trip));
    const storedDepartureClock = formatTimeInput(trip.departedPickupTime);
    const normalizedClocks = normalizeCompletionClocks({
      pickupArrival: pickupArrivalClock,
      pickupDeparture: storedDepartureClock,
      dropoffArrival: formatTimeInput(trip.arrivalDropoffTime),
      now: defaultTime,
    });
    if (storedDepartureClock && normalizedClocks.pickupDeparture !== storedDepartureClock) {
      setCompleteTimeNotice(`Pickup departure was aligned to the recorded pickup arrival (${to12hrFromTimeInput(pickupArrivalClock)}).`);
    }
    setDepartedTime(normalizedClocks.pickupDeparture);
    setArrivalDropoffTime(normalizedClocks.dropoffArrival);
    focusTripWindowInput();
  };

  const updateCompletionDeparture = (value) => {
    const pickupArrivalClock = formatTimeInput(getCompletionPickupBoundary(showCompleteModal));
    const normalized = normalizeCompletionClocks({
      pickupArrival: pickupArrivalClock,
      pickupDeparture: value,
      dropoffArrival: arrivalDropoffTime,
      now: value,
    });
    setDepartedTime(normalized.pickupDeparture);
    setArrivalDropoffTime(normalized.dropoffArrival);
    setCompleteError('');
    setCompleteTimeNotice(normalized.pickupDeparture !== value
      ? `Pickup departure cannot precede pickup arrival. It was adjusted to ${to12hrFromTimeInput(normalized.pickupDeparture)}.`
      : '');
  };

  const updateCompletionDropoffArrival = (value) => {
    const normalized = normalizeCompletionClocks({
      pickupArrival: formatTimeInput(getCompletionPickupBoundary(showCompleteModal)),
      pickupDeparture: departedTime,
      dropoffArrival: value,
      now: value,
    });
    setArrivalDropoffTime(normalized.dropoffArrival);
    setCompleteError('');
    setCompleteTimeNotice(normalized.dropoffArrival !== value
      ? `Dropoff arrival cannot precede pickup departure. It was adjusted to ${to12hrFromTimeInput(normalized.dropoffArrival)}.`
      : '');
  };

  const submitComplete = async () => {
    if (!showCompleteModal) return;
    const evaluation = runOdometerGuard({
      raw: completeOdometer,
      pickupOdometer: showCompleteModal.pickupOdometer ?? null,
    });
    if (evaluation.status === 'empty') {
      setCompleteError('Enter the final odometer reading before completing this trip.');
      return;
    }
    if (evaluation.status === 'invalid' || evaluation.status === 'blocked') {
      setCompleteError(evaluation.errors.join(' '));
      return;
    }
    if (evaluation.status === 'confirm' && !completeAck) {
      setCompleteError('Review the warning and confirm the reading is correct before completing.');
      return;
    }
    const odo = evaluation.value;
    setCompleteError('');
    const now = new Date().toISOString();
    const serviceDate = tripCalendarDateKey(showCompleteModal.date) || localCalendarYmd();
    const departedPickupIso = timeToIsoForTripDate(departedTime, serviceDate) || now;
    const dropoffArrivalIso = timeToIsoForTripDate(arrivalDropoffTime, serviceDate)
      || showCompleteModal.arrivalDropoffTime
      || now;
    const pickupArrivalIso = getCompletionPickupBoundary(showCompleteModal);
    // The form intentionally captures minute precision. Compare the stored
    // workflow timestamps at that same precision so 10:35 is not rejected
    // merely because the arrival event contains seconds (for example 10:35:38).
    const pickupArrivalMs = pickupArrivalIso ? minuteEpoch(pickupArrivalIso) : NaN;
    const pickupDepartureMs = minuteEpoch(departedPickupIso);
    const dropoffArrivalMs = minuteEpoch(dropoffArrivalIso);
    if (Number.isFinite(pickupArrivalMs) && pickupDepartureMs < pickupArrivalMs) {
      setCompleteError(`Pickup departure cannot be before pickup arrival (${formatTimeInput(pickupArrivalIso)}).`);
      return;
    }
    if (dropoffArrivalMs < pickupDepartureMs) {
      setCompleteError(`Dropoff arrival cannot be before pickup departure (${formatTimeInput(departedPickupIso)}).`);
      return;
    }
    const remaining = driverScopedTrips.filter(t =>
      isTripDateToday(t.date) && !isWorkflowTerminalTrip(t) && t.id !== showCompleteModal.id
    );
    const isFinalTrip = remaining.length === 0;
    const homeLocation = Number.isFinite(Number(me?.homeLat)) && Number.isFinite(Number(me?.homeLng))
      ? { lat: Number(me.homeLat), lng: Number(me.homeLng) }
      : null;
    const dropoffLocation = getTripDropoffLocation(showCompleteModal) || getDriverClockLocation();
    const dropoffOrigin = dropoffLocation || showCompleteModal.dropoff;
    const homeTravel = isFinalTrip && timeTrackingPolicyMode === POLICY_MODES.PAY_FROM_HOME && homeLocation
      ? await calculateBoundaryTravel(dropoffOrigin, homeLocation)
      : null;
    const estimatedHomeArrivalTime = homeTravel?.minutes > 0
      ? new Date(new Date(dropoffArrivalIso).getTime() + homeTravel.minutes * 60000).toISOString()
      : null;
    setUndoable(showCompleteModal, showCompleteModal.status, 'Completed');
    advanceWorkflow(showCompleteModal, 'Completed', {
      dropoffOdometer: odo,
      completedAt: now,
      departedPickupTime: departedPickupIso,
      arrivalDropoffTime: dropoffArrivalIso,
      completedVehicle: me?.vehicle || '',
      ...(homeTravel?.minutes > 0 ? {
        dropoffToHomeTravelMinutes: homeTravel.minutes,
        dropoffToHomeCalculatedAt: now,
        dropoffToHomeCalculationSource: homeTravel.source,
        dropoffToHomeConfidence: homeTravel.confidence,
        dropoffToHomeDistanceMiles: homeTravel.distanceMiles ?? null,
        estimatedHomeArrivalTime,
        homeLocationSnapshot: homeLocation,
        dropoffLocationSnapshot: dropoffLocation || null,
        timeTrackingBoundaryPolicy: POLICY_MODES.PAY_FROM_HOME,
      } : {}),
    });
    if (ttStateRef.current === TT.ON_SHIFT_ACTIVE || ttStateRef.current === TT.ON_BREAK) {
      ttLogTripEvent('TRIP_COMPLETED', showCompleteModal.id, getTripDropoffLocation(showCompleteModal) || getDriverClockLocation());
    }
    setLastOdometer(odo);
    setShowCompleteModal(null);
    setCompleteOdometer('');
    setCompleteError('');
    setCompleteTimeNotice('');
    setCompleteAck(false);

    // Save odometer to Firestore directly
    if (navigator.onLine) {
      saveOdometerReading(showCompleteModal.id, odo).catch(() => {});
    }

    // Reset trip selection and expanded state after completion
    setSelectedTrips(prev => prev.filter(id => id !== showCompleteModal.id));
    setExpandedTripId(null);
    setActiveWorkTripId(null);
    if (isEmbedded && onEmbeddedClose) { onEmbeddedClose(); } else { setActiveNav('trips'); }
    setWorkNotesOpen(false);

    // End timekeeping automatically. Home-to-home shifts close at the verified
    // home geofence; first-pickup shifts close at the final completed trip.
    if ((isClockedIn || ttStateRef.current !== TT.OFF_SHIFT) && !clockOutOfferedRef.current) {
      if (remaining.length === 0) {
        clockOutOfferedRef.current = true;
        if (timeTrackingPolicyMode === POLICY_MODES.PAY_FROM_HOME && me?.homeLat && me?.homeLng) {
          onDriverStatusUpdate?.(driverId, true, {
            pendingClockOut: {
              status: 'PENDING_HOME_ARRIVAL',
              createdAt: dropoffArrivalIso,
              estimatedAt: estimatedHomeArrivalTime,
              travelMinutes: homeTravel?.minutes || 0,
              calculationSource: homeTravel?.source || 'NO_ROUTE_EVIDENCE',
              confidence: homeTravel?.confidence || 'missing',
              lastTripId: showCompleteModal.id,
              policyMode: timeTrackingPolicyMode,
            },
            statusAuditTitle: 'Pending Clock-Out Created',
            statusAuditMessage: `${me?.name || driverId} completed the final assigned trip; the shift will close automatically at the verified home geofence unless new work is assigned.`,
          });
          setShowToast({
            type: 'info',
            message: homeTravel?.minutes > 0
              ? `Final trip complete. ${Math.round(homeTravel.minutes)} min home travel is being counted; GPS arrival at home will verify the end time.`
              : 'Final trip complete. Timekeeping remains active until GPS verifies arrival home.',
          });
        } else {
          const clockLocation = getTripDropoffLocation(showCompleteModal) || getDriverClockLocation();
          onDriverStatusUpdate?.(driverId, false, {
            clockTimestamp: dropoffArrivalIso,
            clockEventType: 'auto_out',
            clockEventSource: 'final_trip_completion',
            timeTrackingState: TT.OFF_SHIFT,
            timeTrackingAnchor: 'FINAL_TRIP',
            pendingClockOut: null,
            ...(clockLocation ? { clockLocation } : {}),
          });
          setShowToast({ type: 'success', message: 'Final trip complete. Shift ended automatically.' });
        }
      }
    }
  };

  // Swipe-to-complete gesture handler
  const handleTouchStart = (e, trip) => {
    setTouchStart({ x: e.touches[0].clientX, trip });
  };

  const handleTouchEnd = (e) => {
    if (!touchStart) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    if (dx < -80 && touchStart.trip.status === 'Arrived') {
      openCompleteModal(touchStart.trip);
    }
    setTouchStart(null);
  };

  const exportDailyLog = () => {
    const rows = [['Date', 'Patient', 'Booking ID', 'Time', 'Pickup', 'Dropoff', 'Status', 'Pickup Odo', 'Dropoff Odo', 'Distance', 'Completed At']];
    sortedFilteredHistory.forEach(t => {
      rows.push([getTripHistoryDateKey(t) || '', t.patient, t.bookingId || '', t.time, t.pickup, t.dropoff, t.status, t.pickupOdometer || '', t.dropoffOdometer || '', t.distance ? `${t.distance} mi` : '', t.completedAt ? new Date(t.completedAt).toLocaleString() : '']);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `driver-history-${historyWindowStart}-to-${historyWindowEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openTripWorkPage = (tripId) => {
    setExpandedTripId(null);
    setWorkNotesOpen(false);
    setActiveWorkTripId(tripId);
    setActiveNav('active-trip');
    requestAnimationFrame(() => tripsScrollRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' }));
  };

  const getPrimaryTripAction = (trip) => {
    if (!trip) return null;
    const s = normalizeWorkflowStatus(trip.status);
    if (s === 'assigned' || s === 'unassigned') {
      return { label: 'Start Trip', icon: <Play size={16} />, gradient: 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-blue-600/25', onClick: () => { impact('heavy'); advanceWorkflow(trip, 'In Progress', { startedAt: new Date().toISOString() }); openTripWorkPage(trip.id); } };
    }
    if (s === 'in progress' || s === 'in mission' || s === 'en route') {
      return { label: 'Navigate to Pickup', icon: <Navigation size={16} />, gradient: 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-emerald-500/25', onClick: () => handleNavigateToPickup(trip) };
    }
    if (s === 'navigating pickup') {
      return { label: 'Arrive at Pickup', icon: <MapPin size={16} />, gradient: 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-emerald-500/25', onClick: () => { impact('heavy'); handleArrivePickup(trip); } };
    }
    if (s === 'at pickup') {
      return { label: 'Begin Transport', icon: <Play size={16} />, gradient: 'bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 shadow-emerald-500/25', onClick: () => { impact('heavy'); setSignatureConfirmed(false); setShowSignatureConfirm(trip); } };
    }
    if (s === 'in transit') {
      return { label: 'Navigate to Dropoff', icon: <Navigation size={16} />, gradient: 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-orange-500/25', onClick: () => handleNavigateToDropoff(trip) };
    }
    if (s === 'navigating dropoff') {
      return { label: 'Arrive at Dropoff', icon: <MapPin size={16} />, gradient: 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 shadow-amber-500/25', onClick: () => { impact('heavy'); handleArriveDropoff(trip); } };
    }
    if (s === 'at dropoff' || s === 'arrived') {
      if (showCompleteModal && showCompleteModal.id === trip.id) return null;
      return { label: 'Complete Trip', icon: <Check size={16} />, gradient: 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-emerald-600/25', onClick: () => { impact('heavy'); openCompleteModal(trip); } };
    }
    return null;
  };

  const sendSMSWithBody = async (phone, body) => {
    if (!phone || !body) return;
    await impact('medium');
    const cleaned = (phone || '').replace(/[^0-9+]/g, '');
    if (!cleaned) return;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile || isNativeShell()) {
      const encoded = encodeURIComponent(body);
      const url = /Android/i.test(navigator.userAgent) ? `sms:${cleaned}?body=${encoded}` : `sms:${cleaned}&body=${encoded}`;
      window.location.href = url;
    } else {
      try { await navigator.clipboard.writeText(body); } catch (e) { console.warn('[clipboard]', e); }
      setShowToast({ message: 'Message copied to clipboard' });
    }
  };

  // ── QUICK SMS TEMPLATES ────────────────────────────────────────────────
  // Exact wording per fleet messaging standard. [Client Name] is filled
  // automatically; the company introduction is inserted only for the first
  // message to a client (tracked per device in localStorage).
  const buildQuickSmsText = (template, patientName, isFirstContact) => {
    const firstName = String(patientName || '').trim().split(/\s+/)[0] || 'there';
    return `Hi ${firstName},${isFirstContact ? ' this is Agape Care Medical Transportation.' : ''} ${template.body}`;
  };

  const smsContactStorageKey = (phone) => `agape_sms_contact_${String(phone || '').replace(/[^0-9+]/g, '')}`;
  const hasMessagedClientBefore = (phone) => {
    try { return !!window.localStorage.getItem(smsContactStorageKey(phone)); } catch { return false; }
  };
  const markClientAsMessaged = (phone) => {
    try { window.localStorage.setItem(smsContactStorageKey(phone), new Date().toISOString()); } catch { /* storage unavailable */ }
  };

  const renderTripWorkPage = (trip) => {
    const pickupAddress = typeof trip.pickup === 'object' ? trip.pickup?.address || '' : trip.pickup || '';
    const dropoffAddress = typeof trip.dropoff === 'object' ? trip.dropoff?.address || '' : trip.dropoff || '';
    const scheduledTime = getTripCardTimeLabel(trip) || 'Will Call';
    const primary = getPrimaryTripAction(trip);
    const workStepIndex = getTripWorkStepIndex(trip);
    const stepBackTarget = getTripWorkStepBackTarget(trip);
    const contacts = getContactsForTrip(trip);
    const primaryContact = contacts.find(c => c.isPrimary) || contacts[0];
    const workTripIsInOut = isInOutTrip(trip);
    const notes = [
      trip.urgentTrip && trip.urgentDeadlineAt ? `URGENT: deadline ${trip.urgentDeadlineTime ? to12hrFromTimeInput(trip.urgentDeadlineTime) : ''}, ${getUrgentCountdownText(trip)}.` : '',
      workTripIsInOut ? `IN/OUT ${trip.inOutLeg ? `${trip.inOutLeg} leg` : 'trip'}: stay with the client about ${trip.inOutWaitMinutes || IN_OUT_WAIT_MINUTES} minutes between A and B legs.` : '',
      trip.notes || trip.driverNotes || trip.specialInstructions || trip.instructions || '',
    ].filter(Boolean).join(' ');
    const copyText = (text, label) => {
      if (!text) return;
      navigator.clipboard?.writeText(text);
      setShowToast({ message: `${label} copied` });
    };
    const bottomAction = primary || {
      label: isWorkflowTerminalTrip(trip) ? String(trip.status || 'Completed') : 'No Action Required',
      icon: isWorkflowTerminalTrip(trip) ? <Check size={16} /> : <Info size={16} />,
      gradient: isWorkflowTerminalTrip(trip) ? 'bg-emerald-600' : 'bg-slate-500',
      onClick: () => {},
    };
    const handleStepBack = () => {
      if (!stepBackTarget) return;
      impact('medium');
      advanceWorkflow(trip, stepBackTarget.status, stepBackTarget.fields, { allowRegression: true });
      setShowToast({ message: `Back to ${stepBackTarget.label}` });
    };

    return (
      <><div className="min-h-full bg-[var(--bg-app)] pb-32">
        <div className="sticky top-0 z-30 bg-white border-b-2 border-amber-400 driver-active-trip-header">
          <div className="px-3 py-2.5 flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => { if (isEmbedded && onEmbeddedClose) { onEmbeddedClose(); } else { setActiveNav('trips'); setWorkNotesOpen(false); } }}
              className="w-8 h-11 rounded-xl bg-white border border-slate-100 shadow-sm flex items-center justify-center text-slate-700 active:scale-95 cursor-pointer"
              aria-label="Back to trips"
            >
              <ChevronLeft size={22} strokeWidth={2.2} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-semibold text-slate-950 leading-tight truncate">{trip.patient || 'Trip'}</h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-rose-600">
                <Clock size={16} /> {scheduledTime}
              </p>
            </div>
            <span className="shrink-0 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-100">
              Trip: {trip.bookingId || trip.id || '--'}
            </span>

          </div>
        </div>

        <div className="px-3 pt-3 space-y-3">
          <div className="rounded-xl overflow-hidden shadow-lg bg-white border border-slate-200">
            <div className="relative px-4 py-2.5">
              <div className="absolute right-4 top-4 flex gap-1 opacity-10">
                <span className="w-2 h-2 rounded-full bg-white" />
                <span className="w-2 h-2 rounded-full bg-white" />
                <span className="w-2 h-2 rounded-full bg-white" />
              </div>
              <div className="flex items-start justify-between gap-3">
                <div>
                   <p className="text-xs font-medium uppercase tracking-normal text-blue-600">Scheduled Time</p>
                  <p className="mt-1 text-lg font-semibold tracking-tight leading-none text-slate-900">{scheduledTime}</p>
                </div>
                <span className={`shrink-0 max-w-[40%] truncate rounded-lg border px-2 py-1 text-xs font-medium uppercase tracking-wide text-center shadow-sm ${getTripWorkStatusClass(trip.status)}`}>
                  {trip.status || 'Assigned'}
                </span>
              </div>

              <div className="mt-2.5 grid grid-cols-[18px_1fr] gap-x-4">
                <div className="row-span-2 flex flex-col items-center pt-1.5">
                  <span className="w-3.5 h-3.5 rounded-full bg-blue-300 shadow-lg shadow-blue-200/30" />
                    <span className="w-0.5 flex-1 min-h-[56px] my-0.5 rounded-full bg-slate-200" />
                  <span className="w-3.5 h-3.5 rounded-full bg-emerald-300 shadow-lg shadow-emerald-300/30" />
                </div>

                <div className="pb-3">
                  <p className="text-xs font-medium uppercase tracking-normal text-blue-600">From</p>
                  <p className="mt-0.5 text-xs font-medium leading-snug text-slate-800 break-words">{pickupAddress || '--'}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <button type="button" onClick={() => copyText(pickupAddress, 'Pickup address')} className="h-7 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-600 hover:text-slate-800 flex items-center gap-1 cursor-pointer">
                      <Copy size={14} /> Copy
                    </button>
                    <span className="text-xs font-medium text-slate-400">{trip.distance ? `${trip.distance} mi` : ''}</span>
                    <button type="button" onClick={() => openInNavApp(pickupAddress, suggestNavApp(pickupAddress))} className="h-7 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                      <Navigation size={16} strokeWidth={2.5} /> Navigate
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-normal text-emerald-600">To</p>
                  <p className="mt-0.5 text-xs font-medium leading-snug text-slate-800 break-words">{dropoffAddress || '--'}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <button type="button" onClick={() => copyText(dropoffAddress, 'Dropoff address')} className="h-7 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-600 hover:text-slate-800 flex items-center gap-1 cursor-pointer">
                      <Copy size={14} /> Copy
                    </button>
                    <span className="text-xs font-medium text-slate-400" />
                    <button type="button" onClick={() => openInNavApp(dropoffAddress, suggestNavApp(dropoffAddress))} className="h-7 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                      <Navigation size={16} strokeWidth={2.5} /> Navigate
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-3.5 grid grid-cols-4 gap-2">
                <button type="button" onClick={() => handleSmartCall(trip)} disabled={!primaryContact} className="h-7 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-medium flex items-center justify-center gap-1 cursor-pointer">
                  <Phone size={16} /> Call
                </button>
                <button type="button" onClick={() => handleSmartSMS(trip)} disabled={!primaryContact} className="h-7 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-medium flex items-center justify-center gap-1 cursor-pointer">
                  <MessageCircle size={16} /> SMS
                </button>
                <button type="button" onClick={() => openContactSelector(trip)} className="h-7 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium flex items-center justify-center gap-1 cursor-pointer">
                  <PhoneForwarded size={16} /> Contacts
                </button>
                <button type="button" onClick={() => setShowMoreOptions(trip)} className="h-7 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-medium flex items-center justify-center gap-1 cursor-pointer">
                  <MoreHorizontal size={16} /> More
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-white border border-slate-200 shadow-sm px-4 py-2">
            <div className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 items-start">
                {TRIP_WORK_STEPS.map((label, idx) => {
                  const isDone = idx < workStepIndex;
                  const isActive = idx === workStepIndex;
                  return (
                    <div key={label} className="flex-1 min-w-0">
                      <div className="flex items-center">
                         <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 font-medium text-xs shadow-sm ${
                          isActive ? 'bg-slate-600 text-white border-slate-300' : isDone ? 'bg-emerald-500 text-white border-emerald-300' : 'bg-slate-50 text-slate-500 border-slate-200'
                        }`}>
                          {idx + 1}
                        </div>
                        {idx < TRIP_WORK_STEPS.length - 1 && (
                          <div className={`h-1 flex-1 rounded-full mx-1.5 ${idx < workStepIndex ? 'bg-slate-700' : 'bg-slate-200'}`} />
                        )}
                      </div>
                      <p className={`mt-1 text-center text-xs font-medium leading-tight ${isActive ? 'text-slate-800' : isDone ? 'text-slate-700' : 'text-slate-500'}`}>{label}</p>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={handleStepBack}
                disabled={!stepBackTarget}
                className="mt-0 flex h-7 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 shadow-sm transition-all hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-slate-200 disabled:hover:bg-slate-50 disabled:hover:text-slate-700"
                title={stepBackTarget ? `Back to ${stepBackTarget.label}` : 'Already at Scheduled'}
                aria-label={stepBackTarget ? `Back to ${stepBackTarget.label}` : 'Already at Scheduled'}
              >
                <Undo2 size={16} strokeWidth={2.5} />
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
            <div className="px-4 pt-3 pb-1.5 flex items-center gap-2 text-amber-600">
              <AlertCircle size={15} />
              <span className="text-xs font-medium uppercase tracking-normal">
                Driver Notes
              </span>
            </div>
            <div className="px-4 pb-3.5 text-xs font-medium text-amber-900 leading-relaxed">
              {notes || <span className="italic text-amber-700">No driver notes for this trip.</span>}
            </div>
          </div>
        </div>

        <div className="fixed left-3 right-3 z-40 rounded-xl border border-blue-100 bg-blue-50/95 p-2.5 shadow-lg backdrop-blur-xl" style={{ bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}>
          <div className="mb-2 flex items-center gap-1">
            {getWorkflowSteps(trip).map((step, idx) => {
              const currentStep = getCurrentWorkflowStep(trip);
              const isComplete = currentStep === -1;
              return <div key={step.key} className={`h-1 flex-1 rounded-full ${isComplete || idx < currentStep ? 'bg-emerald-400' : idx === currentStep ? 'bg-blue-500' : 'bg-slate-200'}`} />;
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={bottomAction.onClick}
              disabled={!primary}
              className={`${(trip.status === 'In Progress' || trip.status === 'In Transit') ? 'flex-[3]' : 'flex-1'} h-10 ${bottomAction.gradient} text-white rounded-xl font-semibold text-xs uppercase tracking-normal transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-70 cursor-pointer`}
            >
              {bottomAction.icon} {bottomAction.label}
            </button>
            {(trip.status === 'In Progress' || trip.status === 'In Transit') && (
              skipConfirmTripId === `work-${trip.id}` ? (
                <button
                  type="button"
                  onClick={() => { setSkipConfirmTripId(null); handleSkipNav(trip); }}
                  className="flex-[2] h-10 bg-blue-600 border-2 border-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all text-xs font-medium uppercase tracking-normal cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                >
                  <MapPin size={16} /> {trip.status === 'In Progress' ? 'Here?' : 'At dropoff?'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { impact('medium'); setSkipConfirmTripId(`work-${trip.id}`); }}
                  className="flex-[2] h-10 bg-white border-2 border-slate-300 text-slate-600 rounded-xl hover:bg-slate-100 hover:border-slate-400 transition-all text-xs font-medium uppercase tracking-normal cursor-pointer flex items-center justify-center gap-1"
                >
                  <Forward size={16} /> Skip Nav
                </button>
              )
            )}
          </div>
        </div>
      </div>
    {showMoreOptions?.id === trip.id && (() => {
      const onClose = () => { setShowMoreOptions(null); };
      const moreActions = [
        { label: 'Cancel', icon: <XCircle size={16} />, color: 'text-rose-600 bg-rose-50 hover:bg-rose-100', onClick: () => { onClose(); handleCancel(trip); } },
        { label: 'No Show', icon: <AlertCircle size={16} />, color: 'text-orange-600 bg-orange-50 hover:bg-orange-100', onClick: () => { onClose(); handleNoShow(trip); } },
        { label: 'Reroute', icon: <Route size={16} />, color: 'text-purple-600 bg-purple-50 hover:bg-purple-100', onClick: () => { onClose(); handleReroute(trip); } },
        { label: (role === 'admin' || role === 'dispatcher') ? 'Reassign Driver' : 'Transfer', icon: <ArrowRight size={16} />, color: 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100', onClick: () => { onClose(); openTransferPrompt('trip', trip); } },
        { label: 'Trip Details', icon: <FileText size={16} />, color: 'text-slate-600 bg-slate-50 hover:bg-slate-100', onClick: () => { onClose(); setShowTripDetails(trip); } },
      ];
      return (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-3xl rounded-b-none w-full max-w-lg pb-6 px-4 pt-2 animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center mb-3">
              <span className="w-10 h-1 rounded-full bg-slate-300" />
            </div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900">{trip.patient || 'Trip'}</h3>
              <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-1">
              {moreActions.map((action, idx) => (
                <button key={idx} type="button" onClick={action.onClick} disabled={action.disabled} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${action.color} transition-all text-sm font-medium cursor-pointer disabled:opacity-50`}>
                  {action.icon} {action.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    })()}
    </>
    );
  };

  const navItems = useMemo(() => {
    return [
      { id: 'trips', label: 'Trips', icon: Home },
      { id: 'tools', label: 'Tools', icon: Zap },
      { id: 'chat', label: unreadCount ? `Chat (${unreadCount > 99 ? '99+' : unreadCount})` : 'Chat', icon: MessageCircle, badge: unreadCount },
      { id: 'history', label: 'History', icon: Clock },
      { id: 'settings', label: 'Settings', icon: Settings },
    ];
  }, [unreadCount]);

  const navApp = appSettings.navigationApp || 'google';

  if (!me) {
    return (
      <div className="flex-1 bg-[var(--bg-app)] flex items-center justify-center p-8">
        <div className="text-center">
          <div className="w-20 h-20 bg-white rounded-[2rem] shadow-lg flex items-center justify-center mx-auto mb-6">
            <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Loading profile...</h2>
          <p className="text-slate-500 text-xs font-semibold mt-1">Connecting to your driver account</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full overflow-hidden flex flex-col bg-[var(--bg-app)] text-slate-900 relative"
      onTouchStart={handlePullTouchStart}
      onTouchMove={handlePullTouchMove}
      onTouchEnd={handlePullTouchEnd}
    >
      {(pullDistance > 0 || isRefreshing) && (
        <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-center transition-all" style={{ height: isRefreshing ? 40 : pullDistance }}>
          <div className={`w-6 h-6 border-2 border-slate-300 border-t-blue-600 rounded-full ${isRefreshing ? 'animate-spin' : ''}`} style={!isRefreshing ? { transform: `rotate(${pullDistance * 3}deg)` } : {}} />
        </div>
      )}
      {activeWorkTrip && activeNav !== 'active-trip' && (
        <button
          type="button"
          onClick={() => {
            selection();
            setActiveWorkTripId(activeWorkTrip.id);
            setActiveNav('active-trip');
          }}
          aria-label={`Resume active trip for ${activeWorkTrip.patient || 'passenger'}`}
          className="mx-3 mt-2 flex min-h-12 shrink-0 items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3 text-left shadow-sm transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><Truck size={17} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-blue-600">Active transport</span>
            <span className="block truncate text-sm font-semibold text-slate-900">Resume active trip for {activeWorkTrip.patient || 'passenger'}</span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-blue-600" />
        </button>
      )}
      {(activeNav === 'trips' || (activeNav === 'active-trip' && !activeWorkTrip)) && expandedTripId && !activeWorkTrip && (
        <div
          className="fixed inset-0 bg-slate-900/10 z-40 transition-opacity duration-300"
          onClick={() => setExpandedTripId(null)}
        />
      )}
      {!(activeNav === 'active-trip' && activeWorkTrip) && (
        <div
          className="driver-page-header shrink-0 z-30 border-b border-slate-200/70 bg-[var(--bg-app)]/95 backdrop-blur-md"
        >
          <div className="px-3 py-2.5 flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
              <img src="/agape.png" alt="Agape Care" className="w-7 h-7 object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <p className="truncate text-[15px] font-semibold text-slate-950 leading-none tracking-tight">Agape Care</p>
                <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-blue-700">Driver</span>
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-1.5">
                <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-500">{me?.name || currentUser}</p>
                <Suspense fallback={null}><OfflineIndicator compact /></Suspense>
                <span className={`inline-flex min-h-5 shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${isGpsTracking ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                  <Crosshair size={10} aria-hidden="true" /> {isGpsTracking ? 'GPS active' : 'GPS paused'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowDebugPanel(prev => !prev)}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Open GPS diagnostics"
                >
                  <MoreHorizontal size={12} />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {(role === 'admin' || role === 'dispatcher') && (
                <button
                  type="button"
                  onClick={() => {
                    if (onEmbeddedClose) onEmbeddedClose();
                  }}
                  className="h-8 px-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white border border-rose-700 flex items-center gap-1 text-[11px] font-bold active:bg-rose-700 transition-colors shrink-0"
                  aria-label="Exit Portfolio"
                >
                  <X size={13} />
                  <span>EXIT</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!phoneNumbers?.dispatcher) { alert('No dispatcher number saved. Add it in Settings.'); return; }
                  handleCall(phoneNumbers.dispatcher, 'Dispatcher');
                }}
                title="Call Dispatcher"
                className="h-8 px-2.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 text-[11px] font-semibold active:bg-blue-100 transition-colors"
                aria-label="Call Dispatcher"
              >
                <Phone size={13} />
                <span className="hidden sm:inline">DISP</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!phoneNumbers?.routing) { alert('No routing number saved. Add it in Settings.'); return; }
                  handleCall(phoneNumbers.routing, 'Routing');
                }}
                title="Call Routing"
                className="h-8 px-2.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1 text-[11px] font-semibold active:bg-indigo-100 transition-colors"
                aria-label="Call Routing"
              >
                <Phone size={13} />
                <span className="hidden sm:inline">ROUT</span>
              </button>
            </div>
          </div>
          {(role === 'admin' || role === 'dispatcher') && (
            <div className="px-3 pb-3">
              <select
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm outline-none"
                value={adminDriverFilter}
                onChange={(e) => setAdminDriverFilter(e.target.value)}
              >
                <option value="all">All Drivers ({driverScopedTrips.length} trips)</option>
                {allDrivers.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({driverScopedTrips.filter(t => t.driverId === d.id).length})</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* ===== GPS STATUS RECOVERY ===== */}
      {driverLocStream?.error && !isGpsTracking && !gpsNoticeDismissed && (
        <div className="px-3 pt-2">
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            <AlertCircle size={14} className="shrink-0" />
            <span className="min-w-0 flex-1">Location unavailable — arrival distance checks are disabled.</span>
            <button type="button" onClick={retryGpsStream} className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-bold shrink-0 active:bg-amber-700 cursor-pointer">Retry</button>
            <button type="button" onClick={() => setGpsNoticeDismissed(true)} className="p-1 -m-1 text-amber-500 shrink-0 cursor-pointer" aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ===== TIME TRACKING CONTROLS (MOVED TO SETTINGS) ===== */}

      {/* ===== ACTIVE TRIP WORK PAGE ===== */}
      {activeNav === 'active-trip' && activeWorkTrip && (
        <div
          ref={tripsScrollRef}
          className="flex-1 overflow-y-auto bg-[var(--bg-app)]"
          style={{ overflowAnchor: 'none', scrollBehavior: 'smooth' }}
        >
          {renderTripWorkPage(activeWorkTrip)}
        </div>
      )}

      {/* ===== TRIPS PAGE (also fallback when active-trip has no trip) ===== */}
      {(activeNav === 'trips' || (activeNav === 'active-trip' && !activeWorkTrip)) && (
        <div
          ref={tripsScrollRef}
          className="flex-1 overflow-y-auto pb-28 px-3 pt-2 space-y-2 bg-[var(--bg-app)]"
          style={{ overflowAnchor: 'none', scrollBehavior: 'smooth' }}
        >
            <>


          {(incomingTransferTrips.length > 0 || incomingTransferRoutes.length > 0) && (() => {
            return (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 shadow-sm space-y-2">
              <div className="flex items-center gap-2">
                <Forward size={15} className="text-amber-700" />
                <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-900">Incoming Transfer Request</h3>
              </div>
              {incomingTransferTrips.map((trip) => (
                <div key={`incoming-${trip.id}`} className="rounded-xl bg-white border border-amber-100 p-3">
                  <p className="text-sm font-semibold text-slate-900">{trip.patient || 'Trip'} · {to12hr(trip.time)}</p>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">From {trip.transferRequest?.fromDriverName || 'Driver'}: {trip.transferRequest?.reason || 'Emergency transfer'}</p>
                  <div className="flex gap-2 mt-3">
                    <button type="button" onClick={() => setPasswordPrompt({ type: 'accept_transfer_trip', trip })} className="flex-1 h-7 rounded-xl text-xs font-medium bg-emerald-600 text-white">Accept</button>
                    <button type="button" onClick={() => setPasswordPrompt({ type: 'decline_transfer_trip', trip })} className="flex-1 h-7 rounded-xl text-xs font-medium bg-white border border-rose-200 text-rose-700">Decline</button>
                  </div>
                </div>
              ))}
              {incomingTransferRoutes.map((route) => (
                <div key={`incoming-route-${route.id}`} className="rounded-xl bg-white border border-amber-100 p-3">
                  <p className="text-sm font-semibold text-slate-900">{route.name || 'Route Plan'} · {(route.sequence || []).length} stops</p>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">From {route.transferRequest?.fromDriverName || 'Driver'}: {route.transferRequest?.reason || 'Emergency transfer'}</p>
                  <div className="flex gap-2 mt-3">
                    <button type="button" onClick={() => setPasswordPrompt({ type: 'accept_transfer_route', route, trip: {} })} className="flex-1 h-7 rounded-xl text-xs font-medium bg-emerald-600 text-white">Accept</button>
                    <button type="button" onClick={() => setPasswordPrompt({ type: 'decline_transfer_route', route, trip: {} })} className="flex-1 h-7 rounded-xl text-xs font-medium bg-white border border-rose-200 text-rose-700">Decline</button>
                  </div>
                </div>
              ))}
            </div>
            );
          })()}

          {/* Dispatcher Assigned Sequence Banner */}
          {assignedSequence && !guidedMode && (
            <div className="bg-gradient-to-r from-purple-50 to-violet-100 border-2 border-purple-300 rounded-xl p-3 shadow-md animate-slide-in-top">
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shrink-0 shadow-sm">
                      <Route size={18} className="text-white" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-purple-900">Assigned Route Plan</h4>
                      <p className="text-xs font-semibold text-purple-700">
                        {(assignedSequence.assignedByRole === 'dispatcher' || assignedSequence.assignedByRole === 'admin')
                          ? `Dispatcher assigned a route plan (${assignedSequence.sequence.length} stops)`
                          : `Your saved route plan (${assignedSequence.sequence.length} stops)`}
                      </p>
                      {(() => {
                        const firstStop = assignedSequence.sequence?.[0];
                        const firstTrip = firstStop ? trips.find(trip => trip.id === firstStop.clientId) : null;
                        const firstTime = firstTrip?.time || firstStop?.time;
                        if (!firstTime) return null;
                          return (
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <Clock size={12} className="text-purple-500" />
                              <span className="text-xs font-semibold text-purple-800">{to12hr(firstTime)}</span>
                              {firstStop?.type === 'PU' && <span className="text-xs font-medium text-purple-600">Pickup</span>}
                            </div>
                          );
                        })()}
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium uppercase tracking-wide bg-purple-200 text-purple-800 border border-purple-300 shrink-0">
                    {assignedSequence.statusLabel || 'Assigned Today'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {assignedSequence.statusKey === ROUTE_ASSIGNMENT_STATUS.ASSIGNED && (
                    <button
                      onClick={async () => {
                        await updateAssignedRouteRecord({
                          assignmentStatus: ROUTE_ASSIGNMENT_STATUS.ACCEPTED,
                          driverAcknowledgedAt: new Date().toISOString(),
                        }, 'Route Accepted', `${currentUser} accepted route "${assignedSequence.name || 'Assigned Route'}".`);
                      }}
                      className="px-3 py-2 bg-white text-purple-700 text-xs font-medium rounded-lg border-2 border-purple-300 shadow-sm hover:bg-purple-50 active:scale-95 transition-all"
                    >
                      Accept
                    </button>
                  )}
                  <button
                    onClick={() => { void startAssignedRoute(); }}
                    className="px-4 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-xs font-medium rounded-lg shadow-md hover:from-blue-600 hover:to-purple-700 active:scale-95 transition-all"
                  >
                    {assignedSequence.statusKey === ROUTE_ASSIGNMENT_STATUS.ACCEPTED ? 'Start Route' : 'Start Guided'}
                  </button>
                  <button
                    onClick={() => setShowAssignedRouteDetails(prev => !prev)}
                    className="px-3 py-2 bg-white text-slate-700 text-xs font-medium rounded-lg border border-slate-200 shadow-sm"
                  >
                    {showAssignedRouteDetails ? 'Hide Details' : 'Open Details'}
                  </button>
                  <button
                    onClick={() => openTransferPrompt('route', assignedSequence)}
                    className="px-3 py-2 bg-amber-50 text-amber-700 text-xs font-medium rounded-lg border border-amber-200 shadow-sm"
                  >
                    Transfer
                  </button>
                  <button
                    onClick={() => setPasswordPrompt({ type: 'dismiss_route', assignedSequence, trip: {} })}
                    className="px-3 py-2 bg-white text-rose-700 text-xs font-medium rounded-lg border border-rose-200 shadow-sm"
                  >
                    Dismiss
                  </button>
                </div>

                {showAssignedRouteDetails && (
                  <div className="bg-white/80 rounded-lg p-3 max-h-48 overflow-y-auto space-y-2 border border-purple-200">
                    {assignedSequence.sequence.map((s, idx) => {
                      const t = trips.find(trip => trip.id === s.clientId);
                      const stopName = t?.patient || s.name || `Stop ${idx + 1}`;
                      const stopTime = t?.time || s.time || '';
                      const stopAddress = t ? (s.type === 'PU' ? t.pickup : t.dropoff) : s.address;
                      return (
                        <div key={idx} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-100 shadow-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-medium shrink-0">{idx + 1}</span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-xs font-medium text-slate-800 truncate">{stopName}</span>
                                <span className="text-xs font-medium text-slate-500 shrink-0">({s.type === 'PU' ? 'Pickup' : 'Dropoff'})</span>
                              </div>
                              {stopAddress && <p className="text-xs font-medium text-slate-500 truncate">{stopAddress}</p>}
                            </div>
                          </div>
                          {stopTime && <span className="text-sm font-semibold text-purple-700 shrink-0 ml-2">{to12hr(stopTime)}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Guided Mode Progress Header */}
          {guidedMode && guidedSteps && guidedSteps.length > 0 && guidedStepIndex < guidedSteps.length && (() => {
            const currentStep = guidedSteps[guidedStepIndex];
            const currentTrip = driverScopedTrips.find(t => t.id === currentStep.tripId);
            const nextStep = guidedStepIndex + 1 < guidedSteps.length ? guidedSteps[guidedStepIndex + 1] : null;
            const nextTrip = nextStep ? driverScopedTrips.find(t => t.id === nextStep.tripId) : null;
            const headerRouteStop = hasRoutePlanGuidedStops ? currentRoutePlanStop : null;
            const headerRouteWorkflow = headerRouteStop ? getRoutePlanStopWorkflow(headerRouteStop) : null;
            const headerStepIndex = hasRoutePlanGuidedStops ? Math.max(currentRoutePlanStopIndex, 0) : guidedStepIndex;
            const headerStepTotal = hasRoutePlanGuidedStops ? assignedRoutePlanStops.length : guidedSteps.length;
            const pct = Math.round((headerStepIndex / Math.max(headerStepTotal, 1)) * 100);
            return (
               <div className="bg-blue-600 rounded-xl p-3 shadow-md shadow-blue-200/40 sticky top-0" style={{ zIndex: 10 }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-white/20 rounded-lg flex items-center justify-center text-xs font-semibold text-white">{headerStepIndex + 1}</span>
                    <span className="text-xs font-semibold text-white/80 uppercase tracking-wide">of {headerStepTotal}</span>
                  </div>
                  <button onClick={() => { setGuidedMode(false); }} className="text-xs text-white/70 font-medium uppercase hover:text-white/90">Exit</button>
                </div>
                <div className="h-1 bg-white/20 rounded-full overflow-hidden mb-1.5">
                  <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-white truncate flex-1 min-w-0 flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-white/20 text-xs font-medium uppercase tracking-wide">{(headerRouteStop?.type || currentStep.type) === 'PU' ? 'Pickup' : 'Dropoff'}</span>
                    <span className="truncate">{headerRouteStop?.name || currentTrip?.patient || 'Route stop'}</span>
                    <span className="text-white/70 font-medium ml-1 text-xs shrink-0">· {headerRouteWorkflow?.status || (currentTrip ? (['Assigned','Unassigned'].includes(currentTrip.status) ? 'Not started' : currentTrip.status) : 'In route')}</span>
                  </p>
                  {hasRoutePlanGuidedStops && currentRoutePlanStopIndex + 1 < assignedRoutePlanStops.length ? (
                    <span className="text-xs text-white/70 font-medium ml-2 shrink-0 uppercase tracking-wide">
                      Next: {assignedRoutePlanStops[currentRoutePlanStopIndex + 1]?.type || 'PU'} {assignedRoutePlanStops[currentRoutePlanStopIndex + 1]?.name || 'Stop'}
                    </span>
                  ) : nextStep && nextTrip && (
                    <span className="text-xs text-white/70 font-medium ml-2 shrink-0 uppercase tracking-wide">
                      Next: {nextStep.type === 'PU' ? 'PU' : 'DO'} {nextTrip.patient}
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Conflict Warning */}
          {conflicts.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-rose-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-rose-800">{conflicts.length} time conflict{conflicts.length > 1 ? 's' : ''}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {conflicts.map((c, i) => (
                      <span key={i} className="text-xs text-rose-700 bg-white/60 rounded-lg px-2 py-0.5">{c.aName} · {c.bName}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Ride Share Suggestions */}
          {aiRideShare.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
              <div className="flex items-start gap-2">
                <Repeat size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-emerald-800">Ride-share possible</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {aiRideShare.map((r, i) => (
                      <span key={i} className="text-xs text-emerald-700 bg-white/60 rounded-lg px-2 py-0.5">{r.tripA.patient} + {r.tripB.patient}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Manifest Header */}
          <div className="flex items-center justify-end px-1 pt-1">
            <div className="flex items-center gap-1.5">
              {onAddTrip && (
                <button
                  onClick={() => setShowAddTripModal && setShowAddTripModal(true)}
                  className="h-7 w-[100px] text-xs text-white font-medium flex items-center justify-center gap-1.5 active:scale-95 bg-gradient-to-r from-blue-600 to-blue-500 rounded-lg shadow-sm"
                >
                  <Plus size={9} /> Add Trip
                </button>
              )}
              {selectedTrips.length > 0 && (
                <>
                <button
                  onClick={() => {
                    const stops = orderedTrips
                      .filter(t => selectedTrips.includes(t.id))
                      .flatMap(t => [
                        {
                          address: t.pickup,
                          clientName: t.patient,
                          time: t.time,
                          stopType: 'PU',
                          tripId: t.id,
                          bookingId: t.bookingId || t.tripNumber || '',
                          serviceType: t.serviceType || t.type || t.req || '',
                          phone: t.pickupPhone || t.patientPhone || t.patientMobile || '',
                          source: 'driver-trip',
                        },
                        {
                          address: t.dropoff,
                          clientName: t.patient,
                          time: t.doTime || t.dropoffTime || t.time,
                          stopType: 'DO',
                          tripId: t.id,
                          bookingId: t.bookingId || t.tripNumber || '',
                          serviceType: t.serviceType || t.type || t.req || '',
                          phone: t.dropoffPhone || t.patientPhone || t.patientMobile || '',
                          source: 'driver-trip',
                        },
                      ])
                      .filter(s => s.address);
                    if (stops.length === 0) {
                      setShowToast({ type: 'error', message: 'Select trips with pickup or dropoff addresses first.' });
                      return;
                    }
                    setRoutePlanStops(stops);
                    setActiveNav('tools');
                    setShowToast({ type: 'success', message: `${stops.length} addresses added to Route Plan.` });
                  }}
                  className="h-7 w-[105px] text-xs text-white font-medium flex items-center justify-center gap-1.5 active:scale-95 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-lg shadow-sm"
                >
                  <Route size={9} /> Add to Plan
                </button>
                <button
                  onClick={() => {
                    setSequencerTripFilter(selectedTrips);
                    setShowSequencerModal(true);
                  }}
                  className="h-7 w-[100px] text-xs text-white font-medium flex items-center justify-center gap-1.5 active:scale-95 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg shadow-sm"
                >
                  <Route size={9} /> Plan
                </button>
                </>
              )}
              {activeTrips.length > 0 && (
                <button onClick={exportDailyLog} className="h-7 w-[100px] text-xs text-white font-medium flex items-center justify-center gap-1.5 active:scale-95 bg-gradient-to-r from-slate-600 to-slate-700 rounded-lg shadow-sm">
                  <Download size={16} /> Export
                </button>
              )}
              <span className="text-xs text-white/70 font-medium ml-0.5">{todayTrips.length} trip{todayTrips.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Trip Cards */}
          {tripsLoading && orderedTrips.length === 0 && assignedRoutePlanStops.length === 0 ? (
            <div className="space-y-2 mt-2 px-1">
              <SkeletonTripCard />
              <SkeletonTripCard />
              <SkeletonTripCard />
            </div>
          ) : orderedTrips.length === 0 && assignedRoutePlanStops.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm p-10 text-center mt-2">
              <div className="w-20 h-20 bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-[2rem] flex items-center justify-center mx-auto mb-5 shadow-inner">
                <CheckCircle2 size={36} className="text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">All Clear</h3>
              <p className="text-slate-500 text-xs font-semibold mt-1.5 max-w-[200px] mx-auto leading-relaxed">No trips assigned. Your manifest is up to date.</p>
            </div>
          ) : hasRoutePlanGuidedStops ? (
            <div className="space-y-2 pb-6 relative px-2 mt-2">
              <div className="absolute left-[33px] top-6 bottom-6 w-[2px] bg-slate-200 rounded-full" />
              {assignedRoutePlanStops.map((stop, index) => {
                const stopType = String(stop.type || '').toUpperCase() === 'DO' ? 'DO' : 'PU';
                const workflow = getRoutePlanStopWorkflow(stop);
                const isCompleted = isRoutePlanStopCompleted(stop);
                const isCurrent = currentRoutePlanStop && getRoutePlanStopKey(currentRoutePlanStop) === getRoutePlanStopKey(stop);
                const isUpcoming = !isCompleted && !isCurrent;
                const address = stop.address || '';
                const stopPhone = getRoutePlanStopPhone(stop);
                const stopTripId = stop.bookingId || stop.tripNumber || stop.clientId || stop.id || '';
                const typeColor = stopType === 'DO' ? 'orange' : 'blue';

                if (isCompleted) {
                  const doneLabel = workflow.status || 'Completed';
                  const doneClass = doneLabel === 'No Show' ? 'text-orange-700'
                    : doneLabel === 'Cancelled' ? 'text-rose-700'
                    : doneLabel === 'Rerouted' ? 'text-purple-700'
                    : 'text-emerald-700';
                  return (
                    <div key={`${getRoutePlanStopKey(stop)}-done`} className="relative pl-12 pr-2">
                      <div className="absolute left-[25px] top-1/2 -translate-y-1/2 w-[18px] h-[18px] rounded-full bg-emerald-500 border-2 border-[var(--bg-app)] flex items-center justify-center z-10">
                        <Check size={10} className="text-white font-semibold" />
                      </div>
                      <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl px-3 py-2 opacity-80 flex items-center gap-2">
                        <span className={`text-xs font-semibold ${doneClass}`}>{doneLabel}</span>
                        <span className="text-sm font-semibold text-slate-600 truncate">{stop.name || `Stop ${index + 1}`}</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); undoRoutePlanStopProgress(stop); }}
                           className="ml-auto h-7 px-2.5 rounded-lg border border-amber-200 bg-white text-xs font-medium text-amber-700 flex items-center gap-1.5 hover:bg-amber-50 transition-all"
                          aria-label="Undo stop"
                        >
                          <RotateCcw size={16} /> Undo
                        </button>
                      </div>
                    </div>
                  );
                }

                if (isUpcoming) {
                  return (
                    <div key={`${getRoutePlanStopKey(stop)}-upcoming`} className="relative pl-12 pr-2 opacity-55">
                      <div className="absolute left-[23px] top-1/2 -translate-y-1/2 w-[22px] h-[22px] rounded-full bg-slate-200 border-2 border-[var(--bg-app)] flex items-center justify-center z-10">
                        <span className="text-xs font-medium text-slate-500">{index + 1}</span>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-1.5 h-4 rounded-full ${stopType === 'DO' ? 'bg-orange-400' : 'bg-blue-400'}`} />
                            <span className="text-sm font-semibold text-slate-900 truncate">{stop.name || `Stop ${index + 1}`}</span>
                          </div>
                          <p className="text-xs font-medium text-slate-500 truncate mt-0.5">{address || 'Address pending'}</p>
                        </div>
                        <span className={`text-xs font-medium ${stopType === 'DO' ? 'text-orange-600' : 'text-blue-600'}`}>{stopType}</span>
                      </div>
                    </div>
                  );
                }

                const doneKeys = [
                  !!workflow.startedAt,
                  !!workflow.navigatingAt,
                  !!workflow.arrivedAt,
                  !!workflow.paperSignatureConfirmed,
                  !!workflow.completedAt,
                ];
                const canUndoRouteStop = doneKeys.some(Boolean);
                const activeStepIndex = doneKeys.findIndex((done) => !done);
                const displayStep = activeStepIndex === -1 ? doneKeys.length : activeStepIndex + 1;
                const routePct = Math.round((index / Math.max(assignedRoutePlanStops.length, 1)) * 100);
                const nextAction = (() => {
                  if (!workflow.startedAt) return { label: 'Start Stop', icon: <Play size={16} />, className: 'bg-blue-600 hover:bg-blue-700', onClick: () => handleStartRoutePlanStop(stop) };
                  if (!workflow.navigatingAt) return { label: `Navigate to ${stopType}`, icon: <Navigation size={16} />, className: 'bg-blue-600 hover:bg-blue-700', onClick: () => handleNavigateRoutePlanStop(stop) };
                  if (!workflow.arrivedAt) return { label: `Arrive at ${stopType}`, icon: <MapPin size={16} />, className: typeColor === 'orange' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700', onClick: () => handleArriveRoutePlanStop(stop) };
                  if (!workflow.paperSignatureConfirmed) return { label: 'Confirm Signature', icon: <CheckSquare size={16} />, className: 'bg-emerald-600 hover:bg-emerald-700', onClick: () => handleRoutePlanStopSignature(stop) };
                   return { label: 'Complete Stop', icon: <Check size={16} />, className: 'bg-emerald-600 hover:bg-emerald-700', onClick: () => completeRoutePlanStop(stop) };
                })();

                return (
                  <div key={`${getRoutePlanStopKey(stop)}-current`} className="relative pl-12 pr-2 my-4">
                    <div className="absolute left-[20px] top-4 w-7 h-7 rounded-full bg-blue-600 border-4 border-[var(--bg-app)] flex items-center justify-center z-10 shadow-md shadow-indigo-300/50">
                      <span className="text-xs font-semibold text-white">{index + 1}</span>
                    </div>
                    <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-200">
                      <div className="bg-blue-600 px-4 py-3 text-white">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="px-2 py-0.5 rounded-lg bg-white/15 text-xs font-medium tracking-wide uppercase">{stopType === 'DO' ? 'Dropoff' : 'Pickup'}</span>
                            <span className="text-sm font-semibold truncate">{stop.name || `Stop ${index + 1}`}</span>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className="block text-xs font-medium text-white/80">#{stopTripId || `STOP ${index + 1}`}</span>
                            <span className="block text-xs font-medium text-white/70">STOP {index + 1}/{assignedRoutePlanStops.length}</span>
                          </div>
                        </div>
                        <div className="h-1 bg-white/20 rounded-full overflow-hidden">
                          <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${routePct}%` }} />
                        </div>
                      </div>
                      <div className="p-4">
                        <p className={`text-xs font-medium uppercase tracking-wide mb-1 ${stopType === 'DO' ? 'text-orange-600' : 'text-blue-600'}`}>
                          {stopType === 'DO' ? 'Dropoff Address' : 'Pickup Address'}
                        </p>
                        <p className="text-base font-semibold leading-tight text-slate-900">{address || 'Address pending'}</p>
                        {stopPhone && (
                          <div className="mt-3 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleCall(stopPhone, stop.name || `Stop ${index + 1}`); }}
                              className="h-8 flex-1 rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700 text-xs font-medium flex items-center justify-center gap-2 hover:bg-emerald-100 transition-all"
                              title="Call client"
                              aria-label="Call client"
                            >
                              <Phone size={16} /> Call
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleSMS(stopPhone, stop.name || `Stop ${index + 1}`); }}
                              className="h-8 flex-1 rounded-xl border border-blue-100 bg-blue-50 text-blue-700 text-xs font-medium flex items-center justify-center gap-2 hover:bg-blue-100 transition-all"
                              title="SMS client"
                              aria-label="SMS client"
                            >
                              <MessageCircle size={16} /> SMS
                            </button>
                          </div>
                        )}

                        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <div className="flex items-center gap-1 mb-3">
                            {doneKeys.map((done, stepIdx) => (
                              <div key={stepIdx} className={`h-1.5 flex-1 rounded-full transition-all ${done ? 'bg-emerald-400' : stepIdx === activeStepIndex ? 'bg-blue-500' : 'bg-slate-200'}`} />
                            ))}
                          </div>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-medium uppercase tracking-wide text-slate-600">Required Step</span>
                            <span className="text-xs font-medium text-slate-600">Step {displayStep} of 5</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-xs font-medium text-slate-600 mb-3">
                            <div className="rounded-xl bg-white px-3 py-2 border border-slate-200">Started: {workflow.startedAt ? new Date(workflow.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Pending'}</div>
                            <div className="rounded-xl bg-white px-3 py-2 border border-slate-200">Arrived: {workflow.arrivedAt ? new Date(workflow.arrivedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Pending'}</div>
                            <div className="rounded-xl bg-white px-3 py-2 border border-slate-200">Odometer: {workflow.odometer ? `${Number(workflow.odometer).toLocaleString()} mi` : 'Pending'}</div>
                            <div className="rounded-xl bg-white px-3 py-2 border border-slate-200">Signature: {workflow.paperSignatureConfirmed ? 'Confirmed' : 'Pending'}</div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); if (!nextAction.disabled) nextAction.onClick(); }}
                            disabled={nextAction.disabled}
                            className={`w-full h-7 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-sm ${nextAction.disabled ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : nextAction.className}`}
                          >
                            {nextAction.icon} {nextAction.label}
                          </button>
                          {address && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleNavigateRoutePlanStop(stop); }}
                              className="mt-2 w-full h-7 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-slate-50 transition-all"
                            >
                              <Navigation size={16} /> Open Navigation
                            </button>
                          )}
                          {canUndoRouteStop && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); undoRoutePlanStopProgress(stop); }}
                              className="mt-2 w-full h-7 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-amber-100 transition-all"
                            >
                              <RotateCcw size={16} /> Undo Last Step
                            </button>
                          )}
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setPasswordPrompt({ type: 'route_stop_exception', stop, status: 'No Show', trip: { patient: stop.name || `Stop ${stop.sequenceIndex}` } }); }}
                              className="h-7 rounded-xl border border-orange-200 bg-white text-orange-700 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-orange-50 transition-all"
                              title="No Show"
                              aria-label="Mark as No Show"
                            >
                              <AlertCircle size={16} /> No Show
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setPasswordPrompt({ type: 'route_stop_exception', stop, status: 'Cancelled', trip: { patient: stop.name || `Stop ${stop.sequenceIndex}` } }); }}
                              className="h-7 rounded-xl border border-rose-200 bg-white text-rose-700 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-rose-50 transition-all"
                              title="Cancel stop"
                              aria-label="Cancel stop"
                            >
                              <XCircle size={16} /> Cancel
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setPasswordPrompt({ type: 'route_stop_exception', stop, status: 'Rerouted', trip: { patient: stop.name || `Stop ${stop.sequenceIndex}` } }); }}
                              className="h-7 rounded-xl border border-purple-200 bg-white text-purple-700 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-purple-50 transition-all"
                              title="Rerouted"
                              aria-label="Mark as Rerouted"
                            >
                              <RefreshCw size={16} /> Reroute
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : hasGuidedRenderableTrips ? (
            <div className="space-y-2 pb-6 relative px-2 mt-2">
              <div className="absolute left-[33px] top-6 bottom-6 w-[2px] bg-slate-200 rounded-full" />
              {guidedSteps.map((step, index) => {
                const trip = driverScopedTrips.find(t => t.id === step.tripId);
                if (!trip) return null;

                const isCompleted = index < guidedStepIndex;
                const isUpcoming = index > guidedStepIndex;

                if (isCompleted) {
                  return (
                    <div key={`${step.tripId}-${step.type}-${index}`} className="relative pl-12 pr-2">
                      <div className="absolute left-[25px] top-1/2 -translate-y-1/2 w-[18px] h-[18px] rounded-full bg-emerald-500 border-2 border-[var(--bg-app)] flex items-center justify-center z-10">
                        <Check size={10} className="text-white font-semibold" />
                      </div>
                      <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl px-3 py-2 opacity-60 flex items-center gap-2">
                         <span className="text-xs font-semibold text-emerald-700">{step.type === 'PU' ? 'Picked Up' : 'Dropped Off'}</span>
                         <span className="text-sm font-semibold text-slate-600 truncate">{trip.patient}</span>
                      </div>
                    </div>
                  );
                }

                if (isUpcoming) {
                  return (
                    <div key={`${step.tripId}-${step.type}-${index}`} className="relative pl-12 pr-2 opacity-50">
                      <div className="absolute left-[23px] top-1/2 -translate-y-1/2 w-[22px] h-[22px] rounded-full bg-slate-200 border-2 border-[var(--bg-app)] flex items-center justify-center z-10">
                        <span className="text-xs font-medium text-slate-500">{index + 1}</span>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 flex items-center justify-between">
                         <div className="flex items-center gap-2 min-w-0">
                           <div className={`w-1.5 h-4 rounded-full ${step.type === 'PU' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                           <span className="text-sm font-semibold text-slate-900 truncate">{trip.patient}</span>
                         </div>
                         <span className={`text-xs font-medium ${step.type === 'PU' ? 'text-emerald-600' : 'text-rose-600'} opacity-70`}>{to12hr(trip.time)}</span>
                      </div>
                    </div>
                  );
                }

                // isCurrent
                const workflowSteps = getWorkflowSteps(trip);
                const currentStepIdx = getCurrentWorkflowStep(trip);
                const isDropoffPhase = workflowSteps[currentStepIdx]?.phase === 'dropoff';
                const activeBarColor = isDropoffPhase ? 'bg-orange-400' : 'bg-blue-400';
                const doneBarColor = 'bg-emerald-400';

                const borderColor = isDropoffPhase ? 'border-orange-200' : 'border-blue-200';
                const bgColor = isDropoffPhase ? 'bg-orange-50' : 'bg-blue-50';
                const labelColor = isDropoffPhase ? 'text-orange-700' : 'text-blue-700';
                const totalGuidedSteps = workflowSteps.length;

                const renderPrimaryBtn = (label, icon, gradient, onClick) => (
                  <div className={`rounded-xl border ${borderColor} ${bgColor} p-3`}>
                    <div className="flex items-center gap-0.5 mb-2">
                      {workflowSteps.map((ws, idx) => (
                        <div key={ws.key} className={`h-1 flex-1 rounded-full transition-all duration-500 ${idx < currentStepIdx ? doneBarColor : idx === currentStepIdx ? `${activeBarColor} animate-pulse` : 'bg-slate-200'}`} />
                      ))}
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-semibold uppercase tracking-wide ${labelColor}`}>
                        {isDropoffPhase ? 'Dropoff Phase' : 'Pickup Phase'}
                      </span>
                      <span className="text-xs font-medium text-slate-500">
                        Step {Math.min(currentStepIdx + 1, totalGuidedSteps)} of {totalGuidedSteps}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} className={`flex-1 h-9 ${gradient} text-sm text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm`}>
                        {icon} {label}
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); impact('medium'); handleNoShow(trip); }} className="h-7 px-4 bg-white border border-orange-200 text-orange-700 rounded-xl hover:bg-orange-50 transition-all text-xs font-medium shrink-0 cursor-pointer">No Show</button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); impact('medium'); handleCancel(trip); }} className="h-7 px-4 bg-white border border-rose-200 text-rose-700 rounded-xl hover:bg-rose-50 transition-all text-xs font-medium shrink-0 cursor-pointer">Cancel</button>
                    </div>
                  </div>
                );

                return (
                  <div key={`${step.tripId}-${step.type}-${index}`} className="relative pl-12 pr-2 my-4">
                    <div className="absolute left-[20px] top-4 w-7 h-7 rounded-full bg-indigo-500 border-4 border-[var(--bg-app)] flex items-center justify-center z-10 shadow-md shadow-indigo-300/50">
                      <span className="text-xs font-semibold text-white">{index + 1}</span>
                    </div>
                    <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-200">
                       <div className={`px-3 py-2 border-b flex items-center justify-between ${step.type === 'PU' ? 'bg-emerald-50/50 border-emerald-100' : 'bg-rose-50/50 border-rose-100'}`}>
                          <div className="flex items-center gap-2">
                            <span className={`px-2.5 py-1 rounded-md text-xs font-medium tracking-wide uppercase text-white ${step.type === 'PU' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                              {step.type === 'PU' ? 'Pickup' : 'Dropoff'}
                            </span>
                            <span className="text-sm font-semibold text-slate-900">{trip.patient}</span>
                          </div>
                          <span className={`text-sm font-semibold ${step.type === 'PU' ? 'text-emerald-600' : 'text-rose-600'}`}>{to12hr(trip.time)}</span>
                        </div>

                        <div className="px-3 py-3">
                          <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${step.type === 'PU' ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {step.type === 'PU' ? 'Pickup Address' : 'Dropoff Address'}
                          </p>
                          <p className={`text-base font-semibold leading-tight ${step.type === 'PU' ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {step.type === 'PU' ? trip.pickup : trip.dropoff}
                          </p>

                          {(() => {
                            const pc = getPrimaryContactForTrip(trip);
                            if (!pc) return null;
                            const ps = getContactRoleIcon(pc.role);
                            return (
                              <div className="flex items-center gap-2 mt-2 mb-1">
                                <div className={`flex items-center gap-1.5 ${ps.color} text-xs font-medium`}>
                                  <Phone size={16} /> {pc.label}
                                </div>
                                <span className="text-sm font-semibold text-slate-900">{formatPhoneDisplay(pc.phone)}</span>
                                <button type="button" onClick={() => { try { navigator.clipboard?.writeText(pc.phone); } catch(e) {} }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-600 transition-colors" title="Copy number" aria-label="Copy phone number">
                                  <Copy size={16} />
                                </button>
                              </div>
                            );
                          })()}

                          <div className="flex items-center gap-2 mt-3 mb-4">
                            <button type="button" onClick={(e) => { e.stopPropagation(); openInNavApp(step.type === 'PU' ? trip.pickup : trip.dropoff, suggestNavApp(step.type === 'PU' ? trip.pickup : trip.dropoff)); }} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium py-1.5 rounded-xl flex items-center justify-center gap-2 transition-all" aria-label="Navigate"><Navigation size={16}/> Navigate</button>
                           <button type="button" onClick={(e) => { e.stopPropagation(); handleSmartCall(trip); }} className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center transition-all hover:bg-emerald-100" aria-label="Call"><Phone size={16}/></button>
                           <button type="button" onClick={(e) => { e.stopPropagation(); handleSmartSMS(trip); }} className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center transition-all hover:bg-blue-100" aria-label="Send SMS"><MessageCircle size={16}/></button>
                          </div>

                          {(() => {
                            const s = normalizeWorkflowStatus(trip.status);

                            if (step.type === 'PU') {
                              if (s === 'assigned' || s === 'unassigned') {
                                return renderPrimaryBtn('Start Trip', <Play size={16} />, 'bg-blue-600 hover:bg-blue-700', () => { impact('heavy'); advanceWorkflow(trip, 'In Progress', { startedAt: new Date().toISOString() }); openTripWorkPage(trip.id); });
                              }
                              if (s === 'in progress' || s === 'in mission' || s === 'en route') {
                                return renderPrimaryBtn('Navigate to Pickup', <Navigation size={16} />, 'bg-blue-600 hover:bg-blue-700', () => handleNavigateToPickup(trip));
                              }
                              if (s === 'navigating pickup') {
                                return renderPrimaryBtn('Arrive at Pickup', <MapPin size={16} />, 'bg-blue-600 hover:bg-blue-700', () => { impact('heavy'); handleArrivePickup(trip); });
                              }
                              if (s === 'at pickup') {
                                return renderPrimaryBtn('Begin Transport', <Play size={16} />, 'bg-emerald-600 hover:bg-emerald-700', () => { impact('heavy'); setSignatureConfirmed(false); setShowSignatureConfirm(trip); });
                              }
                            } else {
                              if (s === 'in transit') {
                                return renderPrimaryBtn('Navigate to Dropoff', <Navigation size={16} />, 'bg-orange-600 hover:bg-orange-700', () => handleNavigateToDropoff(trip));
                              }
                              if (s === 'navigating dropoff') {
                                return renderPrimaryBtn('Arrive at Dropoff', <MapPin size={16} />, 'bg-orange-600 hover:bg-orange-700', () => { impact('heavy'); handleArriveDropoff(trip); });
                              }
                              if (s === 'at dropoff' || s === 'arrived') {
                                return <div className="text-center text-xs text-slate-500 italic bg-slate-50 rounded-xl py-2.5">Complete the trip using the odometer prompt.</div>;
                              }
                            }
                            return <div className="text-center text-xs text-slate-500 italic bg-slate-50 rounded-xl py-2.5">No action required for this step.</div>;
                          })()}
                       </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="agape-stagger space-y-1 pb-2">
              {todayTrips.map((trip, idx) => {
                const showWcHeader = isWillCall(trip) && (idx === 0 || !isWillCall(todayTrips[idx - 1])) && willCallTrips.length > 0;
                const tripIsInOut = isInOutTrip(trip);
                const showInOutHeader = tripIsInOut && (idx === 0 || !isInOutTrip(todayTrips[idx - 1]));
                const urgentCountdown = getUrgentCountdownText(trip);
                const isSelected = selectedTrips.includes(trip.id);
                const isSequenced = assignedSequence?.sequence?.some(s => s.clientId === trip.id);
                const legsCount = patientLegs[(trip.patient || '').trim().toLowerCase()];
                const isTerminal = isWorkflowTerminalTrip(trip);
                const isActiveTrip = trip.id === me?.activeTripId;

                const workflowSteps = getWorkflowSteps(trip);
                const currentStepIdx = getCurrentWorkflowStep(trip);
                const totalSteps = workflowSteps.length;
                const isDropoffPhase = workflowSteps[currentStepIdx]?.phase === 'dropoff';
                const activeBarColor = isDropoffPhase ? 'bg-orange-500' : 'bg-blue-500';
                const doneBarColor = 'bg-emerald-400';

                const getPrimaryAction = () => {
                  const s = normalizeWorkflowStatus(trip.status);
                  if (s === 'assigned' || s === 'unassigned') return { label: 'Start Trip', icon: <Play size={16} />, gradient: 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-blue-600/25', phase: 'pickup', onClick: () => { impact('heavy'); advanceWorkflow(trip, 'In Progress', { startedAt: new Date().toISOString() }); openTripWorkPage(trip.id); } };
                  if (s === 'in progress' || s === 'in mission' || s === 'en route') return { label: 'Navigate to Pickup', icon: <Navigation size={16} />, gradient: 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-emerald-500/25', phase: 'pickup', onClick: () => { handleNavigateToPickup(trip); openTripWorkPage(trip.id); } };
                  if (s === 'navigating pickup') return { label: 'Arrive at Pickup', icon: <MapPin size={16} />, gradient: 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-emerald-500/25', phase: 'pickup', onClick: () => { impact('heavy'); handleArrivePickup(trip); openTripWorkPage(trip.id); } };
                  if (s === 'at pickup') return { label: 'Begin Transport', icon: <Play size={16} />, gradient: 'bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 shadow-emerald-500/25', phase: 'pickup', onClick: () => { impact('heavy'); setSignatureConfirmed(false); setShowSignatureConfirm(trip); openTripWorkPage(trip.id); } };
                  if (s === 'in transit') return { label: 'Navigate to Dropoff', icon: <Navigation size={16} />, gradient: 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-orange-500/25', phase: 'dropoff', onClick: () => { handleNavigateToDropoff(trip); openTripWorkPage(trip.id); } };
                  if (s === 'navigating dropoff') return { label: 'Arrive at Dropoff', icon: <MapPin size={16} />, gradient: 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 shadow-amber-500/25', phase: 'dropoff', onClick: () => { impact('heavy'); handleArriveDropoff(trip); openTripWorkPage(trip.id); } };
                  if (s === 'at dropoff' || s === 'arrived') {
                    if (showCompleteModal && showCompleteModal.id === trip.id) return null;
                    return { label: 'Complete Trip', icon: <Check size={16} />, gradient: 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-emerald-600/25', phase: 'dropoff', onClick: () => { impact('heavy'); openCompleteModal(trip); openTripWorkPage(trip.id); } };
                  }
                  return null;
                };
                const primary = getPrimaryAction();
                const workflowPhase = primary?.phase;

                return (
                  <React.Fragment key={trip.id}>
                    {showInOutHeader && (
                      <div className="flex items-center gap-2 px-1 pt-4 pb-2">
                        <div className="h-px flex-1 bg-emerald-200" />
                        <span className="text-xs font-medium text-emerald-700 uppercase tracking-wide">IN/OUT — Stay with client about {IN_OUT_WAIT_MINUTES} min</span>
                        <div className="h-px flex-1 bg-emerald-200" />
                      </div>
                    )}
                    {showWcHeader && (
                      <div className="flex items-center gap-2 px-1 pt-4 pb-2">
                        <div className="h-px flex-1 bg-slate-200" />
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Will Call / No Time</span>
                        <div className="h-px flex-1 bg-slate-200" />
                      </div>
                    )}
                    <Suspense fallback={<div className="h-32 bg-slate-50 rounded-xl animate-pulse" />}>
                    <TaskCard
                    task={{
                      id: trip.id,
                      time: getTripCardTimeLabel(trip),
                      patient: trip.patient,
                      patientName: trip.patient,
                      status: trip.status,
                      bookingId: trip.bookingId,
                      notes: trip.notes,
                      urgentTrip: !!trip.urgentTrip,
                      urgentDeadlineAt: trip.urgentDeadlineAt,
                      urgentDeadlineTime: trip.urgentDeadlineTime,
                      legs: legsCount > 1 ? `${legsCount} LEGS` : '1 LEG',
                      patientPhone: trip.patientPhone,
                      patientMobile: trip.patientMobile,
                      pickupPhone: trip.pickupPhone,
                      dropoffPhone: trip.dropoffPhone,
                      guardianPhone: trip.guardianPhone,
                      escortPhone: trip.escortPhone,
                      emergencyContact: trip.emergencyContact,
                      details: {
                        distance: trip.distance ? `${trip.distance} mi` : null,
                        passengerType: '',
                        mobility: trip.wheelchair || trip.mobility,
                      },
                      tags: [
                        trip.urgentTrip ? 'URGENT' : null,
                        trip.urgentTrip && trip.urgentDeadlineTime ? `DEADLINE ${to12hrFromTimeInput(trip.urgentDeadlineTime)}` : null,
                        trip.urgentTrip && urgentCountdown ? urgentCountdown.toUpperCase() : null,
                        tripIsInOut ? 'IN/OUT' : null,
                        tripIsInOut && trip.inOutLeg ? `${trip.inOutLeg} LEG` : null,
                        tripIsInOut ? `STAY ${trip.inOutWaitMinutes || IN_OUT_WAIT_MINUTES} MIN` : null,
                        isSequenced ? 'Route Plan' : null,
                      ].filter(Boolean),
                      pickup: { address: trip.pickup, phone: trip.pickupPhone },
                      dropoff: { address: trip.dropoff, phone: trip.dropoffPhone, time: null },
                      workflowPhase,
                      activeTrip: isActiveTrip,
                    }}
                    expandedId={null}
                    onToggle={(id) => openTripWorkPage(id)}
                    isSelected={isSelected}
                    onSelect={toggleTripSelect}
                    actions={{
                      onNavigatePickup: (t) => openInNavApp(t.pickup?.address || t.pickup, suggestNavApp(t.pickup?.address || t.pickup)),
                      onNavigateDropoff: (t) => openInNavApp(t.dropoff?.address || t.dropoff, suggestNavApp(t.dropoff?.address || t.dropoff)),
                      onCall: (t) => handleSmartCall(t),
                      onSms: (t) => handleSmartSMS(t),
                      onContacts: (t) => openContactSelector(t),
                      onRevert: revertTripStatus,
                      onShowLegs: handleShowLegs,
                      onEditTrip: handleStartInlineEdit,
                      onScheduleEdit: () => openScheduleEditor(trip),
                      onClearActiveTrip: clearActiveTrip,
                      onNoShow: handleNoShow,
                      onCancel: handleCancel,
                      onReroute: handleReroute,
                      onTransfer: () => openTransferPrompt('trip', trip),
                      renderWorkflow: !isTerminal && primary ? () => {
                        const borderColor = isDropoffPhase ? 'border-orange-200' : 'border-blue-200';
                        const bgColor = isDropoffPhase ? 'bg-orange-50' : 'bg-blue-50';
                        const labelColor = isDropoffPhase ? 'text-orange-700' : 'text-blue-700';
                        const cardStepBackTarget = getTripWorkStepBackTarget(trip);
                        const canUndo = !!cardStepBackTarget;
                        return (
                          <div className={`rounded-xl border ${borderColor} ${bgColor} p-3 w-full`}>
                            <div className="flex items-center gap-0.5 mb-2">
                              {workflowSteps.map((step, idx) => (
                                <div key={step.key} className={`h-1 flex-1 rounded-full transition-all duration-500 ${idx < currentStepIdx ? doneBarColor : idx === currentStepIdx ? `${activeBarColor} animate-pulse` : 'bg-slate-200'}`} />
                              ))}
                              {canUndo && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (cardStepBackTarget && window.confirm(`Go back to "${cardStepBackTarget.label}"?`)) {
                                      impact('medium');
                                      advanceWorkflow(trip, cardStepBackTarget.status, cardStepBackTarget.fields, { allowRegression: true });
                                    }
                                  }}
                                  className="ml-2 w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-300 text-slate-500 hover:text-orange-600 hover:border-orange-300 hover:bg-orange-50 transition-all cursor-pointer shrink-0"
                                  title="Undo last step"
                                  aria-label="Undo last workflow step"
                                >
<RotateCcw size={16} />                                       
                                </button>
                              )}
                            </div>
                            <div className="flex items-center justify-between mb-2">
                              <span className={`text-xs font-semibold uppercase tracking-wide ${labelColor}`}>
                                {isDropoffPhase ? 'Dropoff Phase' : 'Pickup Phase'}
                              </span>
                              <span className="text-xs font-medium text-slate-500">
                                Step {Math.min(currentStepIdx + 1, totalSteps)} of {totalSteps}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                              <button type="button" onClick={(e) => { e.stopPropagation(); primary.onClick(); }} className={`flex-[4] h-8 ${primary.gradient} text-sm md:text-base text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm`}>
                                {primary.icon} {primary.label}
                              </button>
                              {(trip.status === 'In Progress' || trip.status === 'In Transit') && (
                                skipConfirmTripId === trip.id ? (
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setSkipConfirmTripId(null); handleSkipNav(trip); }} className="flex-1 h-8 bg-emerald-500 border-2 border-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-all text-xs font-medium cursor-pointer flex items-center justify-center gap-1 shadow-sm">
                                     <MapPin size={16} /> {trip.status === 'In Progress' ? 'Arrived to pick up?' : 'Arrived to drop off?'}
                                  </button>
                                ) : (
                                  <button type="button" onClick={(e) => { e.stopPropagation(); impact('medium'); setSkipConfirmTripId(trip.id); }} className="flex-1 h-8 bg-white border-2 border-slate-300 text-slate-600 rounded-xl hover:bg-slate-100 hover:border-slate-400 transition-all text-xs font-medium cursor-pointer flex items-center justify-center gap-1">
                                     <Forward size={16} /> Skip
                                  </button>
                                )
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={(e) => { e.stopPropagation(); impact('medium'); handleNoShow(trip); }} className="flex-1 h-7 bg-white border border-orange-200 text-orange-700 rounded-xl hover:bg-orange-50 transition-all text-xs font-medium cursor-pointer flex items-center justify-center gap-1.5">
                                <AlertCircle size={16} /> No Show
                              </button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); impact('medium'); handleCancel(trip); }} className="flex-1 h-7 bg-white border border-rose-200 text-rose-700 rounded-xl hover:bg-rose-50 transition-all text-xs font-medium cursor-pointer flex items-center justify-center gap-1.5">
                                <XCircle size={16} /> Cancel
                              </button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); impact('medium'); handleReroute(trip); }} className="flex-1 h-7 bg-white border border-purple-200 text-purple-700 rounded-xl hover:bg-purple-50 transition-all text-xs font-medium cursor-pointer flex items-center justify-center gap-1.5">
                                <RefreshCw size={16} /> Rerouted
                              </button>
                            </div>
                          </div>
                        );
                      } : null,
                    }}
/>
                    </Suspense>
                  </React.Fragment>
              );
              })}
            </div>
          )}

          {tomorrowTrips.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setTomorrowExpanded(prev => !prev)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl active:scale-[0.99] cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Calendar size={15} className="text-slate-400" />
                  <span className="text-sm font-semibold text-slate-700">Tomorrow</span>
                  <span className="text-xs text-slate-400 font-medium">{tomorrowTrips.length} trip{tomorrowTrips.length !== 1 ? 's' : ''}</span>
                </div>
                <ChevronDown
                  size={16}
                  className={`text-slate-400 transition-transform duration-200 ${tomorrowExpanded ? 'rotate-180' : ''}`}
                />
              </button>
              {tomorrowExpanded && (
                <div className="agape-stagger space-y-1 mt-1 pb-2">
                  {tomorrowTrips.map((trip, idx) => {
                    const tripIsInOut = isInOutTrip(trip);
                    const showInOutHeader = tripIsInOut && (idx === 0 || !isInOutTrip(tomorrowTrips[idx - 1]));
                    const urgentCountdown = getUrgentCountdownText(trip);
                    const isSelected = selectedTrips.includes(trip.id);
                    const isSequenced = assignedSequence?.sequence?.some(s => s.clientId === trip.id);
                    const legsCount = patientLegs[(trip.patient || '').trim().toLowerCase()];
                    const isTerminal = isWorkflowTerminalTrip(trip);
                    const isActiveTrip = trip.id === me?.activeTripId;

                    const workflowSteps = getWorkflowSteps(trip);
                    const currentStepIdx = getCurrentWorkflowStep(trip);
                    const totalSteps = workflowSteps.length;
                    const isDropoffPhase = workflowSteps[currentStepIdx]?.phase === 'dropoff';
                    const activeBarColor = isDropoffPhase ? 'bg-orange-500' : 'bg-blue-500';
                    const doneBarColor = 'bg-emerald-400';

                    const getPrimaryAction = () => {
                      const s = normalizeWorkflowStatus(trip.status);
                      if (s === 'assigned' || s === 'unassigned') return { label: 'Start Trip', icon: <Clock size={16} />, gradient: 'bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 shadow-purple-500/25', phase: 'pickup', badge: 'TOMORROW', onClick: () => { impact('heavy'); advanceWorkflow(trip, 'In Progress', { startedAt: new Date().toISOString() }); openTripWorkPage(trip.id); } };
                      if (s === 'in progress' || s === 'in mission' || s === 'en route') return { label: 'Navigate to Pickup', icon: <Navigation size={16} />, gradient: 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-emerald-500/25', phase: 'pickup', onClick: () => { handleNavigateToPickup(trip); openTripWorkPage(trip.id); } };
                      if (s === 'navigating pickup') return { label: 'Arrive at Pickup', icon: <MapPin size={16} />, gradient: 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-emerald-500/25', phase: 'pickup', onClick: () => { impact('heavy'); handleArrivePickup(trip); openTripWorkPage(trip.id); } };
                      if (s === 'at pickup') return { label: 'Begin Transport', icon: <Play size={16} />, gradient: 'bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 shadow-emerald-500/25', phase: 'pickup', onClick: () => { impact('heavy'); setSignatureConfirmed(false); setShowSignatureConfirm(trip); openTripWorkPage(trip.id); } };
                      if (s === 'in transit') return { label: 'Navigate to Dropoff', icon: <Navigation size={16} />, gradient: 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-orange-500/25', phase: 'dropoff', onClick: () => { handleNavigateToDropoff(trip); openTripWorkPage(trip.id); } };
                      if (s === 'navigating dropoff') return { label: 'Arrive at Dropoff', icon: <MapPin size={16} />, gradient: 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 shadow-amber-500/25', phase: 'dropoff', onClick: () => { impact('heavy'); handleArriveDropoff(trip); openTripWorkPage(trip.id); } };
                      if (s === 'at dropoff' || s === 'arrived') {
                        if (showCompleteModal && showCompleteModal.id === trip.id) return null;
                        return { label: 'Complete Trip', icon: <Check size={16} />, gradient: 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-emerald-600/25', phase: 'dropoff', onClick: () => { impact('heavy'); openCompleteModal(trip); openTripWorkPage(trip.id); } };
                      }
                      return null;
                    };
                    const primary = getPrimaryAction();
                    const workflowPhase = primary?.phase || 'pickup';

                    return (
                      <React.Fragment key={trip.id}>
                        {showInOutHeader && (
                          <div className="flex items-center gap-2 px-1 py-1.5 mt-1">
                            <div className="h-px flex-1 bg-blue-200" />
                            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">IN / OUT</span>
                            <div className="h-px flex-1 bg-blue-200" />
                          </div>
                        )}
                        <Suspense fallback={<div className="h-20 bg-slate-100 rounded-xl animate-pulse" />}>
                          <TaskCard
                            task={{
                              id: trip.id,
                              time: getTripCardTimeLabel(trip),
                              patient: trip.patient,
                              patientName: trip.patient,
                              status: trip.status,
                              bookingId: trip.bookingId,
                              notes: trip.notes,
                              urgentTrip: !!trip.urgentTrip,
                              urgentDeadlineAt: trip.urgentDeadlineAt,
                              urgentDeadlineTime: trip.urgentDeadlineTime,
                              legs: legsCount > 1 ? `${legsCount} LEGS` : '1 LEG',
                              patientPhone: trip.patientPhone,
                              patientMobile: trip.patientMobile,
                              pickupPhone: trip.pickupPhone,
                              dropoffPhone: trip.dropoffPhone,
                              guardianPhone: trip.guardianPhone,
                              escortPhone: trip.escortPhone,
                              emergencyContact: trip.emergencyContact,
                              details: {
                                distance: trip.distance ? `${trip.distance} mi` : null,
                                passengerType: '',
                                mobility: trip.wheelchair || trip.mobility,
                              },
                              tags: [
                                trip.urgentTrip ? 'URGENT' : null,
                                trip.urgentTrip && trip.urgentDeadlineTime ? `DEADLINE ${to12hrFromTimeInput(trip.urgentDeadlineTime)}` : null,
                                trip.urgentTrip && urgentCountdown ? urgentCountdown.toUpperCase() : null,
                                tripIsInOut ? 'IN/OUT' : null,
                                tripIsInOut && trip.inOutLeg ? `${trip.inOutLeg} LEG` : null,
                                tripIsInOut ? `STAY ${trip.inOutWaitMinutes || IN_OUT_WAIT_MINUTES} MIN` : null,
                                isSequenced ? 'Route Plan' : null,
                              ].filter(Boolean),
                              pickup: { address: trip.pickup, phone: trip.pickupPhone },
                              dropoff: { address: trip.dropoff, phone: trip.dropoffPhone, time: null },
                              workflowPhase,
                              activeTrip: isActiveTrip,
                            }}
                            expandedId={null}
                            onToggle={(id) => openTripWorkPage(id)}
                            isSelected={isSelected}
                            onSelect={toggleTripSelect}
                            actions={{
                              onNavigatePickup: (t) => openInNavApp(t.pickup?.address || t.pickup, suggestNavApp(t.pickup?.address || t.pickup)),
                              onNavigateDropoff: (t) => openInNavApp(t.dropoff?.address || t.dropoff, suggestNavApp(t.dropoff?.address || t.dropoff)),
                              onCall: (t) => handleSmartCall(t),
                              onSms: (t) => handleSmartSMS(t),
                              onContacts: (t) => openContactSelector(t),
                              onRevert: revertTripStatus,
                              onShowLegs: handleShowLegs,
                              onEditTrip: handleStartInlineEdit,
                              onScheduleEdit: () => openScheduleEditor(trip),
                              onClearActiveTrip: clearActiveTrip,
                              onNoShow: handleNoShow,
                              onCancel: handleCancel,
                              onReroute: handleReroute,
                              onTransfer: () => openTransferPrompt('trip', trip),
                              renderWorkflow: !isTerminal && primary ? () => {
                                const borderColor = isDropoffPhase ? 'border-orange-200' : 'border-blue-200';
                                const bgColor = isDropoffPhase ? 'bg-orange-50' : 'bg-blue-50';
                                const labelColor = isDropoffPhase ? 'text-orange-700' : 'text-blue-700';
                                const cardStepBackTarget = getTripWorkStepBackTarget(trip);
                                const canUndo = !!cardStepBackTarget;
                                return (
                                  <div className={`rounded-xl border ${borderColor} ${bgColor} p-3 w-full`}>
                                    <div className="flex items-center gap-0.5 mb-2">
                                      {workflowSteps.map((step, idx) => (
                                        <div key={step.key} className={`h-1 flex-1 rounded-full transition-all duration-500 ${idx < currentStepIdx ? doneBarColor : idx === currentStepIdx ? activeBarColor : 'bg-slate-200'}`} />
                                      ))}
                                      {canUndo && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (cardStepBackTarget && window.confirm(`Go back to "${cardStepBackTarget.label}"?`)) {
                                              impact('medium');
                                              advanceWorkflow(trip, cardStepBackTarget.status, cardStepBackTarget.fields, { allowRegression: true });
                                            }
                                          }}
                                          className="ml-2 w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-300 text-slate-500 hover:text-orange-600 hover:border-orange-300 hover:bg-orange-50 transition-all cursor-pointer shrink-0"
                                          title="Undo last step"
                                          aria-label="Undo last workflow step"
                                        >
                                          <RotateCcw size={16} />
                                        </button>
                                      )}
                                    </div>
                                    <div className="flex items-center justify-between mb-2">
                                      <span className={`text-xs font-semibold uppercase tracking-wide ${labelColor}`}>
                                        {isDropoffPhase ? 'Dropoff Phase' : 'Pickup Phase'}
                                      </span>
                                      <span className="text-xs font-medium text-slate-500">
                                        Step {Math.min(currentStepIdx + 1, totalSteps)} of {totalSteps}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <button type="button" onClick={(e) => { e.stopPropagation(); primary.onClick(); }} className={`flex-[4] h-8 ${primary.gradient} text-sm md:text-base text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm`}>
                                        {primary.icon} {primary.label}
                                        {primary.badge && <span className="ml-1 px-1.5 py-0.5 text-[9px] font-bold uppercase bg-white/20 rounded-md">{primary.badge}</span>}
                                      </button>
                                      {(() => {
                                        const cardStepBackTarget = getTripWorkStepBackTarget(trip);
                                        return cardStepBackTarget ? (
                                          <button type="button" onClick={(e) => { e.stopPropagation(); if (window.confirm(`Go back to "${cardStepBackTarget.label}"?`)) { impact('medium'); advanceWorkflow(trip, cardStepBackTarget.status, cardStepBackTarget.fields, { allowRegression: true }); } }} className="h-8 px-3 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-orange-600 hover:border-orange-300 transition-all cursor-pointer flex items-center gap-1 text-xs font-medium shadow-sm">
                                            <RotateCcw size={13} /> Back
                                          </button>
                                        ) : null;
                                      })()}
                                    </div>
                                  </div>
                                );
                              } : null,
                            }}
                          />
                        </Suspense>
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          )}

            </>
        </div>
      )}

      {/* ===== SCHEDULE / TYPE EDITOR ===== */}
      {scheduleEditorTrip && scheduleEditDraft && (
        <div className="trip-window-overlay bg-black/40" style={{ zIndex: 120 }}>
          <div className="trip-window-panel">
            <button type="button" onClick={closeScheduleEditor} className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center active:scale-90 cursor-pointer shrink-0 z-10"><X size={16} className="text-slate-500" /></button>
            <div className="trip-window-body p-5 space-y-4">
              <div className="text-center mb-4">
                <h3 className="text-lg font-bold text-slate-900">Update Trip Time</h3>
                <p className="text-sm text-slate-500 mt-0.5">{scheduleEditorTrip.patient} #{scheduleEditorTrip.bookingId || scheduleEditorTrip.id}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'time', label: 'Set Time', hint: 'Exact pickup time' },
                  { id: 'willcall', label: 'Will Call', hint: 'No fixed time' },
                  { id: 'inout', label: 'IN/OUT', hint: `Stay ${IN_OUT_WAIT_MINUTES} min` },
                  { id: 'urgent', label: 'Urgent', hint: 'Deadline countdown' },
                ].map((mode) => {
                  const active = scheduleEditDraft.mode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => updateScheduleDraft('mode', mode.id)}
                      className={`rounded-xl border px-3 py-2.5 text-left transition-all cursor-pointer ${active ? 'border-blue-500 bg-blue-50 text-blue-800 shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide">{mode.label}</p>
                      <p className="text-[10px] font-semibold opacity-70 mt-0.5">{mode.hint}</p>
                    </button>
                  );
                })}
              </div>

              {(scheduleEditDraft.mode === 'time' || scheduleEditDraft.mode === 'inout' || scheduleEditDraft.mode === 'urgent') && (
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Pickup Time</label>
                  <input
                    type="time"
                    value={scheduleEditDraft.time || ''}
                    onChange={(e) => updateScheduleDraft('time', e.target.value)}
                    className="mt-1 w-full h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:bg-white"
                  />
                  {scheduleEditDraft.mode === 'inout' && (
                    <p className="mt-2 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-700">
                      IN/OUT keeps the related B leg stacked under A leg and tells the driver to stay with the client about {IN_OUT_WAIT_MINUTES} minutes.
                    </p>
                  )}
                </div>
              )}

              {scheduleEditDraft.mode === 'willcall' && (
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">This trip will show as Will Call.</p>
                  <p className="text-xs font-semibold text-slate-500 mt-1">It will stay separate from timed trips and can be changed back later.</p>
                </div>
              )}

              {scheduleEditDraft.mode === 'urgent' && (
                <div className="rounded-xl border border-rose-100 bg-rose-50 p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wide text-rose-600">Deadline Date</label>
                      <input
                        type="date"
                        value={scheduleEditDraft.deadlineDate || ''}
                        onChange={(e) => updateScheduleDraft('deadlineDate', e.target.value)}
                        className="mt-1 w-full h-10 rounded-xl border border-rose-100 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-rose-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wide text-rose-600">Deadline Time</label>
                      <input
                        type="time"
                        value={scheduleEditDraft.deadlineTime || ''}
                        onChange={(e) => updateScheduleDraft('deadlineTime', e.target.value)}
                        className="mt-1 w-full h-10 rounded-xl border border-rose-100 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-rose-400"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wide text-rose-600">Required Within Hours</label>
                      <input
                        type="number"
                        min="1"
                        step="0.5"
                        value={scheduleEditDraft.requiredWithinHours || ''}
                        onChange={(e) => updateScheduleDraft('requiredWithinHours', e.target.value)}
                        className="mt-1 w-full h-10 rounded-xl border border-rose-100 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-rose-400"
                        placeholder="3"
                      />
                    </div>
                    <button type="button" onClick={applyWithinHoursToDeadline} className="h-8 px-4 rounded-xl bg-rose-600 text-white text-xs font-semibold cursor-pointer">Apply</button>
                  </div>
                  {(() => {
                    const deadline = scheduleEditDraft.deadlineDate && scheduleEditDraft.deadlineTime
                      ? new Date(`${scheduleEditDraft.deadlineDate}T${scheduleEditDraft.deadlineTime}`)
                      : null;
                    if (!deadline || Number.isNaN(deadline.getTime())) return null;
                    const diff = Math.ceil((deadline.getTime() - Date.now()) / 60000);
                    const h = Math.floor(Math.abs(diff) / 60);
                    const m = Math.abs(diff) % 60;
                    const text = `${h ? `${h}h ` : ''}${m}m`;
                    return (
                      <p className="rounded-xl bg-white border border-rose-100 px-3 py-2 text-xs font-semibold text-rose-700">
                        Countdown: {diff < 0 ? `${text} late` : `${text} left`} - deadline {to12hrFromTimeInput(scheduleEditDraft.deadlineTime)}
                      </p>
                    );
                  })()}
                </div>
              )}

              {scheduleEditError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{scheduleEditError}</p>
              )}

              <p className="text-xs font-semibold text-slate-500">
                Saving requires the driver password and syncs live with Firebase, admin, and dispatch.
              </p>
            </div>

            <div className="trip-window-footer px-4 pb-4">
              <button type="button" onClick={closeScheduleEditor} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-all cursor-pointer">Cancel</button>
              <button type="button" onClick={saveScheduleEdit} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all cursor-pointer">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== ODOMETER PROMPT MODAL ===== */}
      {showOdometerPrompt && (() => {
        const arrivalEvaluation = runOdometerGuard({ raw: odometerValue });
        return (
          <div className="trip-window-overlay bg-black/40" style={{ zIndex: 120 }}>
            <div className="trip-window-panel">
              <div className="trip-window-body p-4">
                <div className="text-center mb-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-1.5">
                    <MapPin size={18} className="text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Arrived at Pickup</h3>
                  <p className="text-sm text-slate-500 mt-0.5">{showOdometerPrompt.patient} — {to12hr(showOdometerPrompt.time)}</p>
                  <div className="flex justify-center">
                    <OdometerBaselineLine vehicleName={assignedVehicleRecord?.name || me?.vehicle || ''} miles={currentVehicleOdometer || lastOdometer} />
                  </div>
                </div>
                <label className="block text-micro font-semibold uppercase tracking-wide text-slate-500 mb-1">Current Odometer (mi)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  autoFocus
                  value={odometerValue}
                  onChange={(e) => { setOdometerValue(e.target.value); setOdometerError(''); }}
                  placeholder='Enter full odometer reading'
                  className={`w-full p-2.5 bg-white border rounded-xl font-semibold text-sm text-center outline-none ${odometerError ? 'border-rose-300 focus:border-rose-500' : 'border-slate-200 focus:border-blue-500'}`}
                />
                <OdometerGuardFeedback compact evaluation={arrivalEvaluation} ack={odometerAck} onAckChange={setOdometerAck} />
                {odometerError && (
                  <p className="mt-2 text-center text-xs font-semibold text-rose-600">{odometerError}</p>
                )}
              </div>
              <div className="trip-window-footer px-4 pb-4">
                <button type="button" onClick={() => setShowOdometerPrompt(null)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-all cursor-pointer">Cancel</button>
                <button
                  type="button"
                  onClick={submitOdometer}
                  disabled={!odometerValue || arrivalEvaluation.status === 'invalid' || arrivalEvaluation.status === 'blocked' || (arrivalEvaluation.status === 'confirm' && !odometerAck)}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition-all disabled:opacity-40 cursor-pointer"
                >
                  Confirm Arrival
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== ROUTE STOP ODOMETER PROMPT ===== */}
      {routeStopOdometerPrompt && (() => {
        const stopEvaluation = runOdometerGuard({ raw: routeStopOdometerValue });
        return (
          <div className="trip-window-overlay bg-black/40" style={{ zIndex: 120 }}>
            <div className="trip-window-panel">
              <div className="trip-window-body p-4">
                <div className="text-center mb-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-1.5">
                    <Gauge size={18} className="text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Arrived at Stop</h3>
                  <p className="text-sm text-slate-500 mt-0.5">{routeStopOdometerPrompt.name || `Stop ${routeStopOdometerPrompt.sequenceIndex}`}</p>
                  <div className="flex justify-center">
                    <OdometerBaselineLine vehicleName={assignedVehicleRecord?.name || me?.vehicle || ''} miles={currentVehicleOdometer || lastOdometer} />
                  </div>
                </div>
                <label className="block text-micro font-semibold uppercase tracking-wide text-slate-500 mb-1">Odometer at Arrival</label>
                <input
                  type="number"
                  inputMode="numeric"
                  autoFocus
                  value={routeStopOdometerValue}
                  onChange={(e) => { setRouteStopOdometerValue(e.target.value); setOdometerError(''); }}
                  placeholder="Enter odometer reading"
                  className={`w-full p-2.5 bg-white border rounded-xl font-semibold text-sm text-center outline-none ${odometerError ? 'border-rose-300 focus:border-rose-500' : 'border-slate-200 focus:border-blue-500'}`}
                />
                <OdometerGuardFeedback compact evaluation={stopEvaluation} ack={odometerAck} onAckChange={setOdometerAck} />
                {odometerError && (
                  <p className="mt-2 text-center text-xs font-semibold text-rose-600">{odometerError}</p>
                )}
              </div>
              <div className="trip-window-footer px-4 pb-4">
                <button type="button" onClick={() => setRouteStopOdometerPrompt(null)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-all cursor-pointer">Cancel</button>
                <button
                  type="button"
                  onClick={submitRouteStopOdometer}
                  disabled={!routeStopOdometerValue || stopEvaluation.status === 'invalid' || stopEvaluation.status === 'blocked' || (stopEvaluation.status === 'confirm' && !odometerAck)}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all disabled:opacity-40 cursor-pointer"
                >
                  Save Arrival
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== ROUTE STOP SIGNATURE PROMPT ===== */}
      {routeStopSignaturePrompt && (
        <div className="trip-window-overlay bg-black/40" style={{ zIndex: 120 }}>
          <div className="trip-window-panel trip-window-panel-signature">
            <div className="trip-window-body p-5 flex flex-col justify-center">
              <div className="text-center">
                <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-1.5">
                  <Check size={18} className="text-emerald-600" />
                </div>
                <p className="text-micro font-semibold uppercase tracking-wider text-slate-400">Confirm Signature</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1 leading-tight break-words">{routeStopSignaturePrompt.name || `Stop ${routeStopSignaturePrompt.sequenceIndex}`}</h3>
                {routeStopSignaturePrompt.bookingId && (
                  <span className="inline-block mt-2 px-3 py-1 bg-slate-100 rounded-full text-xs font-semibold text-slate-600">Trip #{routeStopSignaturePrompt.bookingId}</span>
                )}
              </div>
              <button type="button" onClick={() => setRouteStopSignatureConfirmed(!routeStopSignatureConfirmed)} className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl border transition cursor-pointer text-left mt-4 ${routeStopSignatureConfirmed ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition ${routeStopSignatureConfirmed ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                  {routeStopSignatureConfirmed && <Check size={10} className="text-white" />}
                </span>
                <span className="text-sm text-slate-600 font-medium">Client signature obtained</span>
              </button>
            </div>
            <div className="trip-window-footer px-4 pb-4">
              <button type="button" onClick={() => { setRouteStopSignaturePrompt(null); setRouteStopSignatureConfirmed(false); }} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-all cursor-pointer">Back</button>
              <button type="button" onClick={confirmRoutePlanStopSignature} disabled={!routeStopSignatureConfirmed} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition-all disabled:opacity-40 cursor-pointer">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== ARRIVAL CONFIRM MODAL ===== */}
      {showArrivalConfirm && (
        <div className="trip-window-overlay bg-black/40" style={{ zIndex: 120 }}>
          <div className="trip-window-panel">
            <div className="trip-window-body p-4">
              <div className="text-center mb-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-1.5">
                  <MapPin size={18} className="text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Arrived at Pickup</h3>
                <p className="text-sm text-slate-500 mt-0.5">{showArrivalConfirm.patient}</p>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                <div>
                  <label className="block text-micro font-semibold uppercase tracking-wide text-slate-500 mb-1">Odometer at Arrival (mi)</label>
                  <input type="number" inputMode="numeric" value={arrivalOdometer} onChange={e => setArrivalOdometer(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-semibold text-sm text-center focus:border-blue-500 outline-none"
                  />
                </div>
                {showArrivalConfirm.bookingId && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500 font-semibold uppercase">Booking</span>
                    <span className="text-sm font-semibold text-slate-900">{showArrivalConfirm.bookingId}</span>
                  </div>
                )}
                {showArrivalConfirm.pickupPhone && (() => {
                  const contact = getContactsForTrip(showArrivalConfirm).find(c => cleanPhone(c.phone) === cleanPhone(showArrivalConfirm.pickupPhone));
                  const label = contact ? contact.label : 'Contact';
                  return (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500 font-semibold uppercase">{label}</span>
                      <button type="button" onClick={() => handleCall(showArrivalConfirm.pickupPhone, `${label}: ${showArrivalConfirm.patient}`)} className="text-sm font-medium text-blue-600 flex items-center gap-1 hover:underline cursor-pointer">
                        <Phone size={14} /> {formatPhoneDisplay(showArrivalConfirm.pickupPhone)}
                      </button>
                    </div>
                  );
                })()}
                {showArrivalConfirm.notes && (
                  <div className="pt-2 border-t border-slate-200">
                    <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Notes</p>
                    <p className="text-sm text-slate-700">{showArrivalConfirm.notes}</p>
                  </div>
                )}
              </div>
              <p className="mt-2 text-center text-xs font-semibold text-slate-500">Confirm arrival details before proceeding.</p>
            </div>
            <div className="trip-window-footer px-4 pb-4">
              <button type="button" onClick={() => setShowArrivalConfirm(null)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-all cursor-pointer">Back</button>
              <button type="button" onClick={confirmArrival} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition-all cursor-pointer">Confirm Arrival</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== SIGNATURE CONFIRM MODAL (Before Heading to Dropoff) ===== */}
      {showSignatureConfirm && (
        <div className="trip-window-overlay bg-black/40" style={{ zIndex: 120 }}>
          <div className="trip-window-panel trip-window-panel-signature">
            <div className="trip-window-body p-5 flex flex-col justify-center">
              <div className="text-center">
                <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-1.5">
                  <Check size={18} className="text-emerald-600" />
                </div>
                <p className="text-micro font-semibold uppercase tracking-wider text-slate-400">Begin Transport</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1 leading-tight break-words">{showSignatureConfirm.patient || 'Client'}</h3>
                {showSignatureConfirm.bookingId && (
                  <span className="inline-block mt-2 px-3 py-1 bg-slate-100 rounded-full text-xs font-semibold text-slate-600">Trip #{showSignatureConfirm.bookingId}</span>
                )}
              </div>
              <p className="text-center text-xs font-semibold text-slate-500 mt-4">Obtain the client signature before heading to dropoff.</p>
              <button type="button" onClick={() => setSignatureConfirmed(!signatureConfirmed)} className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl border transition cursor-pointer text-left mt-2 ${signatureConfirmed ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition ${signatureConfirmed ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                  {signatureConfirmed && <Check size={10} className="text-white" />}
                </span>
                <span className="text-sm text-slate-600 font-medium">Client signature obtained</span>
              </button>
            </div>
            <div className="trip-window-footer px-4 pb-4">
              <button type="button" onClick={() => { setShowSignatureConfirm(null); setSignatureConfirmed(false); }} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-all cursor-pointer">Back</button>
              <button type="button" onClick={confirmSignatureAndBegin} disabled={!signatureConfirmed} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition-all disabled:opacity-40 cursor-pointer">Confirm & Begin</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== COMPLETE TRIP MODAL ===== */}
      {showCompleteModal && (() => {
        const completionEvaluation = runOdometerGuard({
          raw: completeOdometer,
          pickupOdometer: showCompleteModal.pickupOdometer ?? null,
        });
        const completionBlocked = completionEvaluation.status === 'invalid' || completionEvaluation.status === 'blocked'
          || (completionEvaluation.status === 'confirm' && !completeAck);
        return (
          <div className="trip-window-overlay bg-black/40" style={{ zIndex: 120 }}>
            <div className="trip-window-panel">
              <div className="trip-window-body p-4">
                <div className="text-center mb-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-1.5">
                    <Check size={18} className="text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Complete Trip</h3>
                  <p className="text-sm text-slate-500 mt-0.5">{showCompleteModal.patient}{showCompleteModal.bookingId ? ` - ${showCompleteModal.bookingId}` : ''}</p>
                </div>

                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Pickup Details</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <label className="block text-micro font-semibold uppercase tracking-wide text-slate-500 mb-1">Departed Pickup Time</label>
                    <input type="time" value={departedTime} min={formatTimeInput(getCompletionPickupBoundary(showCompleteModal))} onChange={(e) => updateCompletionDeparture(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-semibold text-sm text-center focus:border-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-micro font-semibold uppercase tracking-wide text-slate-500 mb-1">Pickup Odometer</label>
                    <input type="text" readOnly value={showCompleteModal.pickupOdometer ? `${showCompleteModal.pickupOdometer.toLocaleString()} mi` : '—'} title="Verified at pickup arrival"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-sm text-center text-slate-600 cursor-default outline-none" />
                  </div>
                </div>

                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Dropoff Details</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-micro font-semibold uppercase tracking-wide text-slate-500 mb-1">Arrival Dropoff Time</label>
                    <input type="time" value={arrivalDropoffTime} min={departedTime} onChange={(e) => updateCompletionDropoffArrival(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-semibold text-sm text-center focus:border-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-micro font-semibold uppercase tracking-wide text-rose-600 mb-1">Final Odometer (mi)</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      autoFocus
                      value={completeOdometer}
                      onChange={(e) => { setCompleteOdometer(e.target.value); setCompleteError(''); }}
                      placeholder="Final reading"
                      className={`w-full p-2.5 bg-white border rounded-xl font-semibold text-sm text-center outline-none ${completionBlocked && completeOdometer ? 'border-rose-300 focus:border-rose-500' : 'border-slate-200 focus:border-blue-500'}`}
                    />
                  </div>
                </div>

                {completionEvaluation.status === 'ok' && completionEvaluation.distance !== null && (
                  <p className="text-center text-sm font-semibold text-blue-600 mt-2.5">Distance: {completionEvaluation.distance.toLocaleString()} mi</p>
                )}
                <OdometerGuardFeedback compact evaluation={completionEvaluation} ack={completeAck} onAckChange={setCompleteAck} />
                {completeError && (
                  <p className="mt-2 text-center text-xs font-semibold text-rose-600">{completeError}</p>
                )}
                {!completeError && completeTimeNotice && (
                  <p className="mt-2 text-center text-xs font-semibold text-blue-600">{completeTimeNotice}</p>
                )}
              </div>

              <div className="trip-window-footer px-4 pb-4">
                <button type="button" onClick={() => { setShowCompleteModal(null); setCompleteError(''); setCompleteTimeNotice(''); setCompleteAck(false); }} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-all cursor-pointer">Cancel</button>
                <button type="button" onClick={submitComplete} disabled={!completeOdometer || completionBlocked} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition-all disabled:opacity-40 cursor-pointer">Complete Trip</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== TRIP RECEIPT ===== */}
      {/* ===== FULL-SCREEN TRIP DETAILS ===== */}
      {showTripDetails && (
        <div className="fixed inset-0 bg-white flex flex-col animate-slide-up" style={{ zIndex: 130 }}>
          <div className="px-4 py-3 bg-white border-b border-slate-100 flex items-center justify-between shrink-0">
            <div className="flex-1">
              <h2 className="font-semibold text-sm text-slate-900 leading-tight">{showTripDetails.patient}</h2>
              <p className="text-xs text-slate-500">{showTripDetails.bookingId || '—'}</p>
            </div>
             <div className="flex items-center gap-2">
              {!isEditingDetails && (
                <button
                  type="button"
                  onClick={() => { handleStartInlineEdit(showTripDetails); setHistoryExpandedId(showTripDetails.id); setShowTripDetails(null); }}
                  className="h-9 px-3 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95 cursor-pointer"
                >
                  <Edit2 size={16} /> Edit
                </button>
              )}
              <button type="button" onClick={() => { setShowTripDetails(null); setIsEditingDetails(false); }} className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center active:scale-90 cursor-pointer"><X size={18} /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {isEditingDetails ? (
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-slate-900 border-b pb-2 mb-3">Edit Trip Details</h3>
                <div>
                  <label className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider">Patient Name</label>
                  <input type="text" value={editFields.patient} onChange={e => setEditFields(p => ({ ...p, patient: e.target.value }))} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-semibold focus:border-blue-500 focus:outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider">Booking ID</label>
                    <input type="text" value={editFields.bookingId} onChange={e => setEditFields(p => ({ ...p, bookingId: e.target.value }))} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-semibold focus:border-blue-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider">Trip Type</label>
                    <input type="text" value={editFields.type} onChange={e => setEditFields(p => ({ ...p, type: e.target.value }))} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-semibold focus:border-blue-500 focus:outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider">Date</label>
                    <input type="date" value={editFields.date} onChange={e => setEditFields(p => ({ ...p, date: e.target.value }))} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-semibold focus:border-blue-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider">Scheduled Time</label>
                    <input type="text" value={editFields.time} onChange={e => setEditFields(p => ({ ...p, time: e.target.value }))} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-semibold focus:border-blue-500 focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider">Pickup Address</label>
                  <textarea value={editFields.pickup} onChange={e => setEditFields(p => ({ ...p, pickup: e.target.value }))} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold focus:border-blue-500 focus:outline-none" rows="2" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider">Dropoff Address</label>
                  <textarea value={editFields.dropoff} onChange={e => setEditFields(p => ({ ...p, dropoff: e.target.value }))} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold focus:border-blue-500 focus:outline-none" rows="2" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider">Pickup Phone</label>
                    <input type="text" value={editFields.pickupPhone} onChange={e => setEditFields(p => ({ ...p, pickupPhone: e.target.value }))} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold focus:border-blue-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider">Dropoff Phone</label>
                    <input type="text" value={editFields.dropoffPhone} onChange={e => setEditFields(p => ({ ...p, dropoffPhone: e.target.value }))} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold focus:border-blue-500 focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider">Dispatcher Notes</label>
                  <textarea value={editFields.notes} onChange={e => setEditFields(p => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold focus:border-blue-500 focus:outline-none" rows="2" />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingDetails(false)}
                    className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold active:scale-95 transition-all bg-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = {
                        ...editFields,
                        workflowUpdatedAt: new Date().toISOString(),
                      };
                      onUpdateTrip?.(showTripDetails.id, showTripDetails.status || 'Assigned', updated);
                      saveTripWorkflowUpdate(showTripDetails.id, updated).catch(err => console.error(err));
                      onAddAuditLog?.('Trip Details Edited', `${currentUser} updated trip data for ${editFields.patient}.`, 'blue');
                      setShowTripDetails(prev => ({ ...prev, ...editFields }));
                      setIsEditingDetails(false);
                      setShowToast({ message: 'Trip updated successfully' });
                    }}
                    className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-semibold active:scale-95 transition-all shadow-sm"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            ) : (
              <>
                {(() => {
                  const statusMeta = getHistoryStatusMeta(showTripDetails.status);
                  return (
                    <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                       <div className="bg-blue-600 px-4 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-lg bg-white text-slate-700 flex items-center justify-center shadow-sm shrink-0">
                              <User size={18} />
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-sm font-semibold text-white uppercase tracking-wide truncate">{showTripDetails.patient || 'Trip'}</h3>
                              <p className="text-xs font-semibold text-white/90 truncate">#{showTripDetails.bookingId || showTripDetails.id}</p>
                            </div>
                          </div>
                          <span className={`shrink-0 rounded-lg px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${statusMeta.bg}`}>
                            {statusMeta.label}
                          </span>
                        </div>
                      </div>
                      <HistoryTripDetailTable trip={showTripDetails} driver={me} />
                    </div>
                  );
                })()}

                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => openInNavApp(showTripDetails.pickup, suggestNavApp(showTripDetails.pickup))} className="h-7 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"><Navigation size={16} /> Pickup</button>
                  <button type="button" onClick={() => openInNavApp(showTripDetails.dropoff, suggestNavApp(showTripDetails.dropoff))} className="h-7 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"><Navigation size={16} /> Dropoff</button>
                  <button type="button" onClick={() => openContactSelector(showTripDetails)} className="h-7 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"><PhoneForwarded size={16} /> Contacts</button>
                </div>

                {/* Smart Contacts Section */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm p-4 space-y-3">
                  <h3 className="text-micro font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2"><PhoneForwarded size={16} /> Contacts</h3>
                  {(() => {
                    const contacts = getContactsForTrip(showTripDetails);
                    const warning = getContactWarning(showTripDetails, trips);
                    return (
                      <>
                        {warning.show && (
                          <div className={`rounded-xl px-3 py-2 flex items-center gap-2 ${warning.severity === 'error' ? 'bg-rose-50 border border-rose-200' : warning.severity === 'warning' ? 'bg-amber-50 border border-amber-200' : 'bg-blue-50 border border-blue-200'}`}>
                            <AlertTriangle size={12} className={`shrink-0 ${warning.severity === 'error' ? 'text-rose-600' : warning.severity === 'warning' ? 'text-amber-600' : 'text-blue-600'}`} />
                            <p className={`text-xs font-medium ${warning.severity === 'error' ? 'text-rose-700' : warning.severity === 'warning' ? 'text-amber-700' : 'text-blue-700'}`}>{warning.message}</p>
                          </div>
                        )}
                        {/* Primary Contact Quick Action */}
                        {contacts.length > 0 && (
                          <button type="button"
                            onClick={() => { const p = getPrimaryContactForTrip(showTripDetails); if (p) handleCall(p.phone, `${p.label}: ${p.name}`); }}
                            className="w-full h-7 bg-emerald-600 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 cursor-pointer shadow-sm">
                            <Phone size={16} /> Call {contacts.find(c => c.isPrimary)?.label || 'Primary Contact'} — {formatPhoneDisplay(contacts.find(c => c.isPrimary)?.phone || contacts[0]?.phone)}
                          </button>
                        )}
                        <div className="space-y-2">
                          {contacts.map((contact, idx) => {
                            const roleStyle = getContactRoleIcon(contact.role);
                            const roleActions = getContactRoleActions(contact.role);
                            const Icon = roleStyle.icon;
                            const iconMap = { User, Shield, PhoneForwarded, AlertTriangle, Building, MapPin, Headphones, Route };
                            const IconComponent = iconMap[Icon] || User;
                            return (
                              <div key={idx} className={`flex items-center justify-between p-3 rounded-xl border ${roleStyle.border} ${roleStyle.bg}`}>
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${roleStyle.text} ${roleStyle.iconBg}`}>
                                    <IconComponent size={16} />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs font-semibold text-slate-800 truncate">{contact.name}</span>
                                      {contact.isPrimary && <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">PRIMARY</span>}
                                    </div>
                                    <p className="text-xs text-slate-500">{contact.label} · {formatPhoneDisplay(contact.phone)}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                  <button type="button" onClick={() => handleCall(contact.phone, `${contact.label}: ${contact.name}`)} className="w-8 h-8 rounded-lg bg-white text-emerald-600 flex items-center justify-center active:scale-90 shadow-sm cursor-pointer" title={roleActions.callLabel}><Phone size={16} /></button>
                                  {roleActions.smsLabel && (
                                    <button type="button" onClick={() => handleSMS(contact.phone, contact.name)} className="w-8 h-8 rounded-lg bg-white text-blue-600 flex items-center justify-center active:scale-90 shadow-sm cursor-pointer" title={roleActions.smsLabel}><MessageCircle size={16} /></button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                  {showTripDetails.notes && (
                    <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                      <p className="text-xs text-amber-600 uppercase font-medium mb-1">Notes</p>
                      <p className="text-xs text-amber-800">{showTripDetails.notes}</p>
                    </div>
                  )}
                </div>

                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm p-4 space-y-3">
                  <h3 className="text-micro font-semibold uppercase tracking-wide text-slate-500">Actions</h3>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => openInNavApp(showTripDetails.pickup, 'google')} className="flex-1 h-7 bg-slate-100 rounded-xl text-xs font-medium text-slate-700 flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"><Map size={16} /> Google Maps</button>
                    <button type="button" onClick={() => openInNavApp(showTripDetails.pickup, 'waze')} className="flex-1 h-7 bg-slate-100 rounded-xl text-xs font-medium text-slate-700 flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"><Navigation size={16} /> Waze</button>
                    <button type="button" onClick={() => openInNavApp(showTripDetails.pickup, 'apple')} className="flex-1 h-7 bg-slate-100 rounded-xl text-xs font-medium text-slate-700 flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"><Map size={16} /> Apple</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}



      {/* ===== TOOLS PAGE ===== */}
      {activeNav === 'tools' && (
        <Suspense fallback={<div className="h-full flex items-center justify-center"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}>
        <DriverToolsPage
          trips={trips}
          activeTrips={activeTrips}
          aiSequence={aiSequence}
          aiSuggestions={aiSuggestions}
          aiRideShare={aiRideShare}
          conflicts={conflicts}
          aiOptimizing={aiOptimizing}
          guidedMode={guidedMode}
          guidedStepIndex={guidedStepIndex}
          guidedSteps={guidedSteps}
          driverPosition={driverPosition}
          appSettings={appSettings}
          currentUser={currentUser}
          role={role}
          onSetGuidedMode={setGuidedMode}
          onSetGuidedStepIndex={setGuidedStepIndex}
          onSetAiSequence={setAiSequence}
          onSetAiSuggestions={setAiSuggestions}
          onRunAiOptimization={runAiOptimization}
          onSelectAllTrips={selectAllTrips}
          selectedTrips={selectedTrips}
          onSetSelectedTrips={setSelectedTrips}
          etas={etas}
          onOpenInNav={(addr) => { impact('medium'); openInNavApp(addr, suggestNavApp(addr)); }}
          onOpenSequencer={() => setShowSequencerModal(true)}
          requestAuthAction={requestAuthAction}
          routePlanStops={routePlanStops}
          onSetRoutePlanStops={setRoutePlanStops}
          onSendToSequencer={(stopData, origin) => {
            if (!Array.isArray(stopData) || stopData.length === 0) {
              if (stopData?.clients?.length) {
                setSequencerTripFilter(null);
                setRoutePlanSequencerStops(stopData.clients);
                setRoutePlanSequencerSequence(stopData.sequence || null);
                setRoutePlanSequencerOrigin(origin || null);
                setSequencerKey(k => k + 1);
                setShowSequencerModal(true);
                setShowToast({ type: 'success', message: `${stopData.clients.length} route stop${stopData.clients.length !== 1 ? 's' : ''} loaded in Route Plan.` });
                return;
              }
              setSequencerTripFilter(null);
              setRoutePlanSequencerStops(null);
              setRoutePlanSequencerSequence(null);
              setRoutePlanSequencerOrigin(null);
              setSequencerKey(k => k + 1);
              setShowSequencerModal(true);
              return;
            }
            const stamp = Date.now();
            const items = stopData
              .filter(s => s?.address)
              .map((s, index) => {
                const stopType = s.stopType === 'DO' ? 'DO' : 'PU';
                const id = `route-plan-${stamp}-${index}`;
                return {
                  id,
                  name: s.clientName || `Stop ${String.fromCharCode(65 + index)}`,
                  address: s.address,
                  pu: stopType === 'PU' ? s.address : '',
                  do: stopType === 'DO' ? s.address : '',
                  time: s.time || '',
                  serviceType: s.serviceType || '',
                  bookingId: s.bookingId || '',
                  phone: s.phone || s.patientPhone || s.pickupPhone || s.dropoffPhone || '',
                  routePlanTripId: s.tripId || null,
                };
              });
            const sequence = items.map((item, index) => ({
              clientId: item.id,
              type: item.do ? 'DO' : 'PU',
              leg: 'A',
              stepNumber: index + 1,
            }));
            setSequencerTripFilter(null);
            setRoutePlanSequencerStops(items);
            setRoutePlanSequencerSequence(sequence);
            setRoutePlanSequencerOrigin(origin || null);
            setSequencerKey(k => k + 1);
            setShowSequencerModal(true);
            setShowToast({ type: 'success', message: `${items.length} route stop${items.length !== 1 ? 's' : ''} loaded in Route Plan.` });
          }}
        />
        </Suspense>
      )}

      {/* ===== HISTORY PAGE ===== */}
      {activeNav === 'history' && (
        <div className="agape-mobile-page agape-mobile-history flex-1 overflow-y-auto">
          <div className="agape-mobile-toolbar">
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto no-scrollbar whitespace-nowrap">

              <button
                type="button"
                onClick={() => goToHistoryDay(-1)}
                disabled={selectedHistoryDate <= historyWindowStart}
                className="agape-mobile-icon-btn disabled:opacity-30"
                aria-label="Previous history day"
              >
                <ChevronLeft size={15} />
              </button>

              <div className="agape-mobile-date-pill" title={formatHistoryDayLabel(selectedHistoryDate)}>
                <span>{formatHistoryCompactDayLabel(selectedHistoryDate)}</span>
                <span>({selectedHistoryDayTrips.length})</span>
              </div>

              <button
                type="button"
                onClick={() => goToHistoryDay(1)}
                disabled={selectedHistoryDate >= historyWindowEnd}
                className="agape-mobile-icon-btn disabled:opacity-30"
                aria-label="Next history day"
              >
                <ChevronRight size={15} />
              </button>

              {[
                { id: 'all', label: 'All outcomes', Icon: Clock },
                { id: 'completed', label: 'Completed', Icon: CheckCircle2 },
                { id: 'cancelled', label: 'Cancelled', Icon: XCircle },
                { id: 'noshow', label: 'No Show', Icon: AlertTriangle },
                { id: 'rerouted', label: 'Rerouted', Icon: Repeat },
              ].map(f => {
                const FilterIcon = f.Icon;
                const active = historyFilter === f.id;
                const activeClass = f.id === 'rerouted'
                  ? 'bg-purple-600 text-white border-purple-600'
                  : f.id === 'cancelled'
                    ? 'bg-rose-600 text-white border-rose-600'
                    : f.id === 'noshow'
                      ? 'bg-amber-500 text-white border-amber-500'
                      : f.id === 'completed'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-blue-600 text-white border-blue-600';
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => { setHistoryFilter(f.id); setHistoryExpandedId(null); }}
                    className={`agape-mobile-icon-btn relative ${active ? `${activeClass} agape-mobile-icon-active` : ''}`}
                    title={`${f.label} (${historyStatusCounts[f.id] || 0})`}
                    aria-label={`${f.label} filter, ${historyStatusCounts[f.id] || 0} trips`}
                  >
                    <FilterIcon size={13} />
                  </button>
                );
              })}

              {filteredHistory.length > 0 && (
                <button
                  type="button"
                  onClick={exportDailyLog}
                  className="agape-mobile-icon-btn agape-mobile-icon-btn-primary"
                  title="Export"
                  aria-label="Export history"
                >
                  <Download size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="agape-mobile-search-section">
            <div className="agape-mobile-search">
              <Search size={16} className="text-slate-400 shrink-0" />
            <input type="text" placeholder="Search by patient, booking ID, address..." value={historySearch} onChange={(e) => { setHistorySearch(e.target.value); setHistoryExpandedId(null); }}
              className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-slate-700 outline-none placeholder:text-slate-400" />
            {historySearch && <button onClick={() => { setHistorySearch(''); setHistoryExpandedId(null); }} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>}
            </div>
          </div>

          <div className="px-4 pt-1 pb-0.5">
            <p className="text-[10px] font-semibold text-slate-400" data-testid="history-sync-line">
              {driverScopedTrips.length} trips synced · {historyWindowTrips.length} in history window ({formatHistoryCompactDayLabel(historyWindowStart)}–{formatHistoryCompactDayLabel(historyWindowEnd)})
            </p>
          </div>

          <div className="agape-mobile-list">
            {filteredHistory.length === 0 ? (
              <div className="agape-empty-card">
                <div className="w-16 h-16 bg-gradient-to-br from-slate-50 to-slate-100 rounded-[2rem] flex items-center justify-center mx-auto mb-4 shadow-inner">
                  <Clock size={28} className="text-slate-300" />
                </div>
                <h3 className="text-base font-semibold text-slate-900">{historySearch ? 'No matching trips' : 'No history'}</h3>
                <p className="text-slate-500 text-xs font-semibold mt-1">{historySearch ? 'Try a different search term.' : `No completed, cancelled, no-show, or rerouted trips found for ${formatHistoryDayLabel(selectedHistoryDate)}.`}</p>
              </div>
            ) : (
              sortedFilteredHistory.map(trip => {
                const statusMeta = getHistoryStatusMeta(trip.status);
                const StatusIcon = statusMeta.Icon;
                const normalizedHistoryStatus = normalizeWorkflowStatus(trip.status);
                const historyTone = normalizedHistoryStatus === 'completed'
                  ? 'success'
                  : normalizedHistoryStatus === 'cancelled'
                    ? 'danger'
                    : normalizedHistoryStatus === 'no show'
                      ? 'warning'
                      : normalizedHistoryStatus === 'rerouted'
                        ? 'info'
                        : 'pending';
                const isEditing = editingTripId === trip.id;
                const isExpanded = historyExpandedId === trip.id || isEditing;
                if (isExpanded) {
                  const ie = isEditing ? editingTripData : null;
                  const inputCls = "w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-xs focus:border-blue-500 focus:bg-white outline-none transition-all";
                  return (
                    <div key={trip.id} className="space-y-3">
                      <div className={`agape-trip-list-card agape-trip-${historyTone}`}>
                        <div
                          className="agape-trip-card-summary border-b border-slate-100"
                          role={!isEditing ? 'button' : undefined}
                          tabIndex={!isEditing ? 0 : undefined}
                          aria-expanded={isExpanded}
                          onClick={() => {
                            if (!isEditing) setHistoryExpandedId(null);
                          }}
                          onKeyDown={(event) => {
                            if (!isEditing && (event.key === 'Enter' || event.key === ' ')) {
                              event.preventDefault();
                              setHistoryExpandedId(null);
                            }
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <h3 className="agape-trip-title">{isEditing ? ie.patient : trip.patient || 'Trip'}</h3>
                            <p className="agape-trip-id">#{isEditing ? ie.bookingId : trip.bookingId || trip.id}</p>
                          </div>
                          <div className="agape-trip-right">
                            <div className="flex flex-col items-end">
                              <span className="text-[12px] text-slate-500 font-medium">Driver: {me?.name || '-'}</span>
                            </div>
                            <span className={`agape-trip-status-dot agape-trip-status-${historyTone}`} title={statusMeta.label} aria-label={statusMeta.label}>
                              <StatusIcon size={15} />
                            </span>
                            {!isEditing && <ChevronDown size={17} className="text-slate-400" />}
                          </div>
                        </div>
                        {isEditing ? (
                          <div className="p-3 space-y-2.5">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5 block">Patient</label>
                                <input value={ie.patient} onChange={(e) => setEditingTripData(p => ({ ...p, patient: e.target.value }))} className={inputCls} />
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5 block">Booking ID</label>
                                <input value={ie.bookingId} onChange={(e) => setEditingTripData(p => ({ ...p, bookingId: e.target.value }))} className={inputCls} />
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5 block">Date</label>
                                <input type="date" value={ie.date} onChange={(e) => setEditingTripData(p => ({ ...p, date: e.target.value }))} className={inputCls} />
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5 block">Time</label>
                                <input value={ie.time} onChange={(e) => setEditingTripData(p => ({ ...p, time: e.target.value }))} className={inputCls} placeholder="8:30 AM" />
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5 block">Service Type</label>
                                <input value={ie.type} onChange={(e) => setEditingTripData(p => ({ ...p, type: e.target.value }))} className={inputCls} />
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5 block">Status</label>
                                <select value={ie.status} onChange={(e) => setEditingTripData(p => ({ ...p, status: e.target.value }))} className={inputCls}>
                                  {['Assigned', 'Navigating Pickup', 'At Pickup', 'In Transit', 'At Dropoff', 'Completed', 'No Show', 'Cancelled', 'Rerouted'].map(s => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 bg-blue-50 border border-blue-100 rounded-xl p-2.5">
                              <div>
                                <label className="text-[10px] font-semibold text-blue-700 uppercase tracking-widest mb-0.5 block flex items-center gap-1"><Clock size={10} /> Pickup Time</label>
                                <input type="time" value={ie._pickupTime} onChange={(e) => setEditingTripData(p => ({ ...p, _pickupTime: e.target.value }))} className={inputCls} />
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold text-blue-700 uppercase tracking-widest mb-0.5 block flex items-center gap-1"><Ruler size={10} /> Pickup Odo</label>
                                <input type="number" min="0" step="1" placeholder="42500" value={ie._pickupOdometer} onChange={(e) => setEditingTripData(p => ({ ...p, _pickupOdometer: e.target.value }))} className={inputCls} />
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold text-blue-700 uppercase tracking-widest mb-0.5 block flex items-center gap-1"><Clock size={10} /> Dropoff Time</label>
                                <input type="time" value={ie._dropoffTime} onChange={(e) => setEditingTripData(p => ({ ...p, _dropoffTime: e.target.value }))} className={inputCls} />
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold text-blue-700 uppercase tracking-widest mb-0.5 block flex items-center gap-1"><Ruler size={10} /> Dropoff Odo</label>
                                <input type="number" min="0" step="1" placeholder="42750" value={ie._dropoffOdometer} onChange={(e) => setEditingTripData(p => ({ ...p, _dropoffOdometer: e.target.value }))} className={inputCls} />
                              </div>
                              <div className="col-span-2">
                                <label className="text-[10px] font-semibold text-blue-700 uppercase tracking-widest mb-0.5 block">Pickup Address</label>
                                <PlacesAutocompleteInput
                                  value={ie.pickup}
                                  onChange={(val) => setEditingTripData(p => ({ ...p, pickup: val }))}
                                  placeholder="Pickup address"
                                  className={inputCls}
                                />
                              </div>
                              <div className="col-span-2">
                                <label className="text-[10px] font-semibold text-blue-700 uppercase tracking-widest mb-0.5 block">Dropoff Address</label>
                                <PlacesAutocompleteInput
                                  value={ie.dropoff}
                                  onChange={(val) => setEditingTripData(p => ({ ...p, dropoff: val }))}
                                  placeholder="Dropoff address"
                                  className={inputCls}
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5 block">Pickup Phone</label>
                                <input value={ie.pickupPhone} onChange={(e) => setEditingTripData(p => ({ ...p, pickupPhone: e.target.value }))} className={inputCls} />
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5 block">Dropoff Phone</label>
                                <input value={ie.dropoffPhone} onChange={(e) => setEditingTripData(p => ({ ...p, dropoffPhone: e.target.value }))} className={inputCls} />
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold text-rose-400 uppercase tracking-widest mb-0.5 block">Hospital Phone</label>
                                <input value={ie.hospitalPhone || ''} onChange={(e) => setEditingTripData(p => ({ ...p, hospitalPhone: e.target.value }))} className={inputCls} />
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5 block">Distance</label>
                                <input value={ie.distance} onChange={(e) => setEditingTripData(p => ({ ...p, distance: e.target.value }))} className={inputCls} />
                              </div>
                            </div>
                            <div className="bg-white border border-slate-200 rounded-xl px-3 py-2">
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <div onClick={() => setEditingTripData(p => ({ ...p, _clientSigned: !p._clientSigned }))} className={`w-4 h-4 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${ie._clientSigned ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 bg-white'}`}>
                                  {ie._clientSigned && <CheckCircle2 size={10} />}
                                </div>
                                <span className="text-xs font-semibold text-slate-900">Client Signed</span>
                              </label>
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5 block">Notes</label>
                              <textarea value={ie.notes} onChange={(e) => setEditingTripData(p => ({ ...p, notes: e.target.value }))} className={inputCls} rows="2" placeholder="Update notes..." />
                            </div>
                            {role !== 'admin' && role !== 'dispatcher' && (
                              <div>
                                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5 block">Password confirmation</label>
                                <input type="password" value={ie._password || ''} onChange={(e) => setEditingTripData(p => ({ ...p, _password: e.target.value }))} className={inputCls} autoComplete="current-password" placeholder="Required to save" />
                              </div>
                            )}
                            {inlineEditError && <p className="rounded-lg bg-rose-50 px-2.5 py-2 text-xs font-semibold text-rose-700">{inlineEditError}</p>}
                          </div>
                        ) : (
                          <HistoryTripDetailTable trip={trip} driver={me} />
                        )}
                      </div>
                      <div className={`grid gap-2 ${isEditing ? 'grid-cols-2' : 'grid-cols-2'}`}>
                        {isEditing ? (
                          <>
                            <button type="button" onClick={handleSaveInlineEdit} disabled={inlineEditSaving} className="h-8 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs shadow-sm disabled:opacity-50"><CheckCircle2 size={14} /> {inlineEditSaving ? 'Saving…' : 'Save'}</button>
                            <button type="button" onClick={handleCancelInlineEdit} disabled={inlineEditSaving} className="h-8 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs shadow-sm disabled:opacity-50"><X size={14} /> Cancel</button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => handleStartInlineEdit(trip)} className="h-7 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs shadow-sm"><Edit2 size={16} /> Edit</button>
                            <button type="button" onClick={() => restoreHistoryTrip(trip)} className="h-7 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs shadow-sm"><RotateCcw size={14} /> Restore</button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={trip.id} className={`agape-trip-list-card agape-trip-${historyTone}`}>
                    <div
                      onClick={() => setHistoryExpandedId(trip.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setHistoryExpandedId(trip.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-expanded={false}
                      className="agape-trip-card-summary"
                    >
                      <div className="min-w-0 flex-1">
                        <h3 className="agape-trip-title">{trip.patient || 'Trip'}</h3>
                        <p className="agape-trip-id">#{trip.bookingId || trip.id}</p>
                      </div>
                      <div className="agape-trip-right">
                        <div className="flex flex-col items-end">
                          <span className={`text-[15px] font-semibold ${historyTone === 'danger' ? 'text-rose-600' : historyTone === 'success' ? 'text-emerald-600' : 'text-blue-600'}`}>{to12hr(trip.time)}</span>
                          <span className="text-[12px] text-slate-500 mt-0.5 font-medium">Driver: {me?.name || '-'}</span>
                        </div>
                        <span
                          className={`agape-trip-status-dot agape-trip-status-${historyTone}`}
                          title={statusMeta.label}
                          aria-label={statusMeta.label}
                        >
                          <StatusIcon size={15} />
                        </span>
                        {isExpanded ? <ChevronDown size={17} className="text-slate-400" /> : <ChevronRight size={17} className="text-slate-400" />}
                      </div>
                    </div>

                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ===== SETTINGS PAGE ===== */}
      {activeNav === 'settings' && (
        <div className="driver-settings-workspace flex-1 overflow-y-auto bg-slate-50 px-3 pb-28 pt-3 sm:px-4 sm:pt-4">
          <div className="space-y-3">
            <section className="relative overflow-hidden rounded-xl bg-slate-950 px-4 py-4 text-white shadow-[0_16px_40px_rgba(15,23,42,0.16)]" aria-labelledby="driver-settings-title">
              <div className="absolute -right-8 -top-12 h-36 w-36 rounded-full bg-blue-500/20" aria-hidden="true" />
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-300">Personal workspace</p>
                  <h1 id="driver-settings-title" className="mt-1 text-xl font-semibold tracking-tight text-white">Driver settings</h1>
                  <p className="mt-1 text-xs font-medium text-slate-300">Account, workday, vehicle and app preferences.</p>
                </div>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-blue-200"><Settings size={20} /></div>
              </div>
            </section>

            {/* Profile Card */}
            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="absolute inset-y-0 left-0 w-1 bg-blue-600" aria-hidden="true" />
              <div className="relative px-5 py-5">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl bg-blue-600 flex items-center justify-center text-2xl font-semibold text-white shadow-sm">
                    {String(me?.name || '?').charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-semibold text-slate-950 truncate">{me?.name}</h2>
                    <p className="text-sm text-slate-500 truncate">{displayLoginId}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{me?.vehicle || 'No vehicle'} • {me?.currentZone || '—'}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-1 pt-1"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Workday & vehicle</p></div>

            {/* Automatic, trip-authoritative timekeeping. Drivers cannot create payroll punches. */}
            <div className={`rounded-xl border p-4 shadow-sm ${isPersonalTime ? 'bg-blue-50 border-blue-200' : isClockedIn ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isClockedIn ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                  <Clock size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-bold ${isClockedIn ? 'text-emerald-900' : 'text-slate-800'}`}>Automatic timekeeping</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {isPersonalTime
                      ? `Personal time · ${ttBreakMin}m recorded automatically`
                      : isClockedIn
                      ? `Active · ${Math.floor(ttBillableMin / 60)}h ${ttBillableMin % 60}m`
                      : 'Starts with the first verified trip event'}
                  </p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${isClockedIn ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {isPersonalTime ? 'Personal' : isClockedIn ? 'Tracking' : 'Standby'}
                </span>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                Trip timestamps and GPS home arrival control payroll automatically. Corrections require an administrator and remain in the audit log.
              </p>
              {role === 'driver' && isClockedIn && (
                <button type="button" onClick={togglePersonalTime} disabled={!isPersonalTime && hasTripInProgress} className={`mt-3 w-full rounded-xl px-4 py-2.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 ${isPersonalTime ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'border border-blue-200 bg-white text-blue-700 hover:bg-blue-50'}`}>
                  {isPersonalTime ? 'Return to automatic work tracking' : hasTripInProgress ? 'Personal time unavailable during active trip' : 'Start personal time'}
                </button>
              )}
            </div>

            {/* Vehicle & maintenance details live in Settings so notices never obstruct trip work. */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-start gap-3 border-b border-slate-100 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Truck size={19} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-slate-900">Assigned vehicle</p>
                  <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{assignedVehicleRecord?.name || me?.vehicle || 'No vehicle assigned'}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${vehicleMaintenance?.attention ? (['overdue', 'due'].includes(vehicleMaintenance.status) ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700') : 'bg-emerald-100 text-emerald-700'}`}>
                  {vehicleMaintenance ? vehicleMaintenance.status.replace('_', ' ') : 'unavailable'}
                </span>
              </div>

              {assignedVehicleRecord && vehicleMaintenance ? (
                <div className="space-y-4 p-4">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      ['Odometer', `${vehicleMaintenance.odometer.toLocaleString()} mi`],
                      ['Plate', assignedVehicleRecord.plate || 'Not recorded'],
                      ['Make / model', [assignedVehicleRecord.make, assignedVehicleRecord.model].filter(Boolean).join(' ') || 'Not recorded'],
                      ['Year / color', [assignedVehicleRecord.year, assignedVehicleRecord.color].filter(Boolean).join(' · ') || 'Not recorded'],
                      ['VIN', assignedVehicleRecord.vin || 'Not recorded'],
                      ['Driver status', getDriverLiveStatus(me).label],
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0 rounded-xl bg-slate-50 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                        <p className="mt-1 break-words font-bold text-slate-800">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className={`rounded-xl border p-3 ${['overdue', 'due'].includes(vehicleMaintenance.oil.status) ? 'border-rose-200 bg-rose-50' : vehicleMaintenance.oil.status === 'due_soon' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-extrabold text-slate-900">Oil mileage cycle</p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-600">{vehicleMaintenance.oil.milesRemaining.toLocaleString()} miles remaining · due at {vehicleMaintenance.oil.nextServiceOdometer.toLocaleString()} mi</p>
                        <p className="mt-0.5 text-[10px] text-slate-500">Interval {vehicleMaintenance.oil.intervalMiles.toLocaleString()} mi · last reset {vehicleMaintenance.oil.lastServiceOdometer?.toLocaleString() || 'not recorded'} mi</p>
                      </div>
                      <span className="rounded-lg bg-white/80 px-2 py-1 text-[10px] font-extrabold uppercase text-slate-700">{vehicleMaintenance.oil.status.replace('_', ' ')}</span>
                    </div>
                    <button type="button" disabled={Boolean(maintenanceResetting)} onClick={() => resetVehicleMaintenanceCycle('oil')} className="mt-3 w-full rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50">
                      {maintenanceResetting === 'oil' ? 'Saving service record…' : 'Password required · Reset oil cycle'}
                    </button>
                  </div>

                  <div className={`rounded-xl border p-3 ${['overdue', 'due'].includes(vehicleMaintenance.filter.status) ? 'border-rose-200 bg-rose-50' : ['due_soon', 'setup_required'].includes(vehicleMaintenance.filter.status) ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-extrabold text-slate-900">Annual filter cycle</p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-600">{vehicleMaintenance.filter.nextServiceDate ? `Due ${vehicleMaintenance.filter.nextServiceDate} · ${vehicleMaintenance.filter.daysRemaining} days remaining` : 'A verified service date is required'}</p>
                        <p className="mt-0.5 text-[10px] text-slate-500">Interval {vehicleMaintenance.filter.intervalMonths} months · last reset {vehicleMaintenance.filter.lastServiceDate || 'not recorded'}</p>
                      </div>
                      <span className="rounded-lg bg-white/80 px-2 py-1 text-[10px] font-extrabold uppercase text-slate-700">{vehicleMaintenance.filter.status.replace('_', ' ')}</span>
                    </div>
                    <button type="button" disabled={Boolean(maintenanceResetting)} onClick={() => resetVehicleMaintenanceCycle('filter')} className="mt-3 w-full rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50">
                      {maintenanceResetting === 'filter' ? 'Saving service record…' : 'Password required · Reset filter cycle'}
                    </button>
                  </div>

                  <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-[11px] font-semibold leading-relaxed text-blue-800">
                    <Lock size={14} className="mt-0.5 shrink-0" />
                    Reset records confirm completed maintenance at the current odometer. They never erase or zero the vehicle mileage, and every reset is stored in the audit history.
                  </div>
                </div>
              ) : (
                <div className="p-4 text-xs font-semibold text-slate-500">Ask dispatch to assign a fleet vehicle before recording maintenance.</div>
              )}
            </div>

            {/* Home Location — admin/dispatcher can edit, driver can view only */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3 text-slate-800 font-semibold"><MapPin size={16} /> Home Location</div>
              {me?.homeAddress ? (
                <p className="text-xs text-slate-500 font-semibold mb-2">{me.homeAddress}</p>
              ) : (
                <p className="text-xs text-slate-500 font-semibold mb-2">{(role === 'admin' || role === 'dispatcher') ? 'Enter home address for commute time estimates.' : 'Home address set by admin.'}</p>
              )}
              {(role === 'admin' || role === 'dispatcher') ? (
              <div className="space-y-2">
                <PlacesAutocompleteInput
                  value={editHomeAddress}
                  onChange={setEditHomeAddress}
                  placeholder="123 Main St, City, State"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:border-blue-500 outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!editHomeAddress.trim()) {
                        setShowToast({ type: 'info', message: 'Enter an address first.' });
                        return;
                      }
                      const coords = await geocodeAddress(editHomeAddress.trim());
                      if (coords) {
                        onDriverStatusUpdate?.(driverId, isClockedIn, {
                          homeLat: coords.lat,
                          homeLng: coords.lng,
                          homeAddress: coords.formattedAddress,
                        });
                        setShowToast({ type: 'success', message: `Home set: ${coords.formattedAddress}` });
                      } else {
                        onDriverStatusUpdate?.(driverId, isClockedIn, {
                          homeAddress: editHomeAddress.trim(),
                        });
                        setShowToast({ type: 'info', message: 'Could not geocode. Address saved as text.' });
                      }
                    }}
                    className="flex-1 h-9 rounded-xl bg-blue-600 text-white text-xs font-semibold active:scale-95"
                  >
                    Save Address
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (driverPosition?.lat && driverPosition?.lng) {
                        const label = `${driverPosition.lat.toFixed(6)}, ${driverPosition.lng.toFixed(6)}`;
                        onDriverStatusUpdate?.(driverId, isClockedIn, {
                          homeLat: driverPosition.lat,
                          homeLng: driverPosition.lng,
                          homeAddress: label,
                        });
                        setEditHomeAddress(label);
                        setShowToast({ type: 'success', message: 'Home set to current GPS position.' });
                      } else {
                        setShowToast({ type: 'info', message: 'GPS position not available yet.' });
                      }
                    }}
                    className="h-9 px-3 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold active:scale-95 flex items-center gap-1"
                    title="Use current GPS location"
                  >
                    <MapPin size={16} /> GPS
                  </button>
                </div>
              </div>
              ) : (
                <p className="text-xs text-slate-400 italic">Only admin or dispatcher can edit home address.</p>
              )}
            </div>

            {/* Unified evidence-backed weekly timecard */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-slate-800 font-semibold"><Clock size={16} /> Work Time</div>
                {clockHistory.days.some(d => d.hasEvents) && (
                  <button
                    type="button"
                    onClick={() => {
                      const rows = [['Date', 'Recorded Start', 'Recorded End', 'Recorded Hours', 'Personal Minutes', 'Approval Status', 'Issues', 'In Location', 'Out Location']];
                      clockHistory.days.filter(d => d.hasEvents).forEach(d => {
                        rows.push([
                          d.dateKey,
                          d.clockIn ? formatClockTime(d.clockIn) : '',
                          d.clockOut ? formatClockTime(d.clockOut) : '',
                          d.hours != null ? d.hours.toFixed(2) : '',
                          d.breakMin || 0,
                          d.needsCorrection ? 'Needs correction' : 'Verified',
                          (d.anomalies || []).map((issue) => issue.message).join('; '),
                          d.inLocation || '',
                          d.outLocation || '',
                        ]);
                      });
                      rows.push(['', '', '', '', '', '', '', '', '']);
                      rows.push(['Current Week Recorded Total', '', '', clockHistory.weeklyTotal.toFixed(2), '', '', '', '', '']);
                      if (clockHistory.weeklyOvertime > 0) rows.push(['Current Week Overtime', '', '', clockHistory.weeklyOvertime.toFixed(2), '', '', '', '', '']);
                      const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
                      const blob = new Blob([csv], { type: 'text/csv' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url; a.download = `clock-history-${new Date().toISOString().slice(0, 10)}.csv`;
                      a.click(); URL.revokeObjectURL(url);
                    }}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1.5"
                  >
                    <Download size={16} /> CSV
                  </button>
                )}
              </div>
              <div className="grid grid-cols-7 gap-1.5" aria-label="Current work week">
                {clockHistory.weekDays.map((day) => {
                  const selected = day.dateKey === selectedWorkDate;
                  const date = new Date(`${day.dateKey}T12:00:00`);
                  const tone = day.status === 'Completed' ? 'bg-emerald-500' : day.status === 'Active' ? 'bg-blue-500' : day.status === 'Review required' ? 'bg-amber-500' : day.status === 'Scheduled' ? 'bg-indigo-400' : 'bg-slate-300';
                  return (
                    <button key={day.dateKey} type="button" onClick={() => { setSelectedWorkDate(day.dateKey); setCorrectionDraft(null); }} className={`min-w-0 rounded-xl border px-1 py-2 text-center transition ${selected ? 'border-blue-600 bg-blue-600 text-white shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-300'}`}>
                      <span className="block text-[9px] font-bold uppercase">{date.toLocaleDateString([], { weekday: 'short' })}</span>
                      <span className="mt-0.5 block text-xs font-bold">{date.getDate()}</span>
                      <span className={`mx-auto mt-1 block h-1.5 w-1.5 rounded-full ${selected ? 'bg-white' : tone}`} />
                    </button>
                  );
                })}
              </div>
              {(() => {
                const selectedDay = clockHistory.weekDays.find((day) => day.dateKey === selectedWorkDate)
                  || clockHistory.days.find((day) => day.dateKey === selectedWorkDate);
                if (!selectedDay) return null;
                const selectedRequests = timeCorrectionRequests.filter((request) => request.date === selectedWorkDate);
                const statusClass = selectedDay.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' : selectedDay.status === 'Active' ? 'bg-blue-100 text-blue-800' : selectedDay.status === 'Review required' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700';
                return (
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900">{new Date(`${selectedDay.dateKey}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${statusClass}`}>{selectedDay.status}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 rounded-xl border border-slate-200 bg-white p-3 text-center">
                      <div><p className="text-[9px] font-bold uppercase text-slate-400">Verified start</p><p className="mt-1 text-xs font-bold text-slate-800">{selectedDay.clockIn ? formatClockTime(selectedDay.clockIn) : '—'}</p></div>
                      <div className="border-x border-slate-100"><p className="text-[9px] font-bold uppercase text-slate-400">Verified end</p><p className="mt-1 text-xs font-bold text-slate-800">{selectedDay.clockOut ? formatClockTime(selectedDay.clockOut) : '—'}</p></div>
                      <div><p className="text-[9px] font-bold uppercase text-slate-400">Recorded time</p><p className="mt-1 text-xs font-bold text-blue-700">{selectedDay.hours != null ? `${selectedDay.hours.toFixed(2)}h` : '—'}</p></div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold text-slate-600">
                      <span>{selectedDay.tripCount} trip{selectedDay.tripCount === 1 ? '' : 's'}</span>
                      <span>·</span><span>{selectedDay.breakMin || 0} min recorded personal time</span>
                      <span>·</span><span>{selectedDay.reconciliation?.estimatedBoundaryCount || 0} estimated boundaries</span>
                    </div>
                    {selectedDay.personalIntervals?.length > 0 && (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Personal-time evidence</p>
                          <span className="text-[10px] font-semibold text-slate-500">{selectedDay.personalIntervals.length} interval{selectedDay.personalIntervals.length === 1 ? '' : 's'}</span>
                        </div>
                        <div className="mt-2 space-y-2">
                          {selectedDay.personalIntervals.map((interval, index) => {
                            const inferredReturn = interval.endReason === 'INFERRED_FROM_VERIFIED_PICKUP_RETURN_TRAVEL'
                              || interval.endReason === 'VERIFIED_PICKUP_RETURN_TRAVEL';
                            return (
                              <div key={`${interval.start}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2">
                                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-800">
                                  <span>{formatClockTime(interval.start)} → {interval.end ? formatClockTime(interval.end) : 'In progress'}</span>
                                  <span>{interval.minutes} min</span>
                                </div>
                                <p className="mt-1 text-[10px] leading-4 text-slate-500">
                                  {interval.end
                                    ? inferredReturn
                                      ? `Return calculated from verified pickup${interval.tripId ? ` · Trip ${interval.tripId}` : ''}`
                                      : 'Start and return were recorded directly'
                                    : 'Active now; return will be recorded from the next verified work event'}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                        <p className="mt-2 text-[10px] leading-4 text-slate-500">Recorded or evidence-calculated personal intervals are shown separately. Unclear gaps stay included until an authorized review is completed.</p>
                      </div>
                    )}
                    {selectedDay.needsCorrection && (
                      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        Review required: recorded time remains included while the evidence issue is checked. No automatic reduction is made.
                      </div>
                    )}
                    {selectedRequests.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {selectedRequests.map((request) => (
                          <div key={request.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-800">{{ SHIFT_NOTE: 'Evidence note', MISSING_START: 'Start-time correction', MISSING_END: 'End-time correction', INCORRECT_TIME: 'Time review request' }[request.requestType] || 'Time review request'}</p>
                              <p className="mt-1 whitespace-pre-wrap text-[10px] leading-4 text-slate-600">{request.reason}</p>
                              {request.proposedTime && <p className="mt-1 text-[10px] font-semibold text-blue-700">Proposed time: {request.proposedTime}</p>}
                              {request.reviewerNote && <p className="mt-1 rounded-md bg-slate-50 px-2 py-1 text-[10px] leading-4 text-slate-600">Reviewer: {request.reviewerNote}</p>}
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${request.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' : request.status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{request.status === 'resolved' ? 'Reviewed' : request.status === 'rejected' ? 'Not approved' : 'Review open'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {role === 'driver' && !correctionDraft && (
                      <button type="button" onClick={() => { setCorrectionError(''); setCorrectionDraft({ requestType: selectedDay.needsCorrection ? 'INCORRECT_TIME' : 'SHIFT_NOTE', proposedTime: '', reason: '' }); }} className="mt-3 w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-xs font-bold text-blue-700 hover:bg-blue-50">
                        Add evidence note or correction request
                      </button>
                    )}
                    {role === 'driver' && correctionDraft && (
                      <div className="mt-3 space-y-2 rounded-xl border border-blue-200 bg-white p-3">
                        <div className="grid grid-cols-2 gap-2">
                          <select value={correctionDraft.requestType} onChange={(event) => setCorrectionDraft({ ...correctionDraft, requestType: event.target.value })} className="rounded-lg border border-slate-300 px-2 py-2 text-xs outline-none focus:border-blue-500">
                            <option value="SHIFT_NOTE">Add information only</option><option value="INCORRECT_TIME">Other time issue</option><option value="MISSING_START">Correct start time</option><option value="MISSING_END">Correct end time</option>
                          </select>
                          {correctionDraft.requestType !== 'SHIFT_NOTE' && <input type="time" value={correctionDraft.proposedTime} onChange={(event) => setCorrectionDraft({ ...correctionDraft, proposedTime: event.target.value })} className="rounded-lg border border-slate-300 px-2 py-2 text-xs outline-none focus:border-blue-500" aria-label="Proposed corrected time" />}
                        </div>
                        <textarea rows="3" value={correctionDraft.reason} onChange={(event) => { setCorrectionError(''); setCorrectionDraft({ ...correctionDraft, reason: event.target.value }); }} placeholder="Describe what happened and any evidence the reviewer should check. The original record stays preserved." className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-500" />
                        {correctionError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-semibold leading-4 text-rose-700">{correctionError}</p>}
                        <p className="text-[10px] leading-4 text-slate-500">Submitting does not change recorded time automatically. An admin or dispatcher reviews it against trip and GPS evidence.</p>
                        <div className="flex gap-2"><button type="button" onClick={() => { setCorrectionDraft(null); setCorrectionError(''); }} className="flex-1 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">Cancel</button><button type="button" disabled={correctionSaving || correctionDraft.reason.trim().length < 3} onClick={submitTimeCorrectionRequest} className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:bg-slate-300">{correctionSaving ? 'Saving…' : correctionDraft.requestType === 'SHIFT_NOTE' ? 'Save evidence note' : 'Send for review'}</button></div>
                      </div>
                    )}
                  </div>
                );
              })()}
              {false && <>
              <p className="mb-2 mt-4 text-[10px] font-bold uppercase tracking-wide text-slate-400">Recent verified records</p>
              {clockHistory.days.length === 0 || clockHistory.days.every(d => !d.hasEvents) ? (
                <p className="text-xs text-slate-500 text-center py-4">No clock in/out history yet.</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {clockHistory.days.filter(d => d.hasEvents).map(day => {
                      const todayKey = localCalendarYmd();
                      const isToday = day.dateKey === todayKey;
                      return (
                        <div key={day.dateKey} className={`rounded-2xl border p-3.5 ${day.needsCorrection ? 'bg-amber-50 border-amber-200' : isToday ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100'}`}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={`text-sm font-semibold ${isToday ? 'text-emerald-700' : 'text-slate-800'}`}>
                              {formatHistoryCompactDayLabel(day.dateKey)}
                              {isToday && <span className="ml-1.5 text-[10px] font-semibold uppercase bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded-full">Today</span>}
                              {day.needsCorrection && <span className="ml-1.5 text-[10px] font-bold uppercase bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded-full">Needs correction</span>}
                            </span>
                            {day.hours != null ? (
                              <span className={`text-sm font-semibold ${day.hours >= 8 ? 'text-emerald-600' : day.hours >= 4 ? 'text-amber-600' : 'text-slate-600'}`}>
                                {day.hours.toFixed(2)}h
                              </span>
                            ) : (
                              <span className="text-xs font-semibold text-amber-700">Awaiting evidence review</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            {day.clockIn && (
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                <span className="text-slate-600 font-medium">In</span>
                                <span className="font-semibold text-slate-800">{formatClockTime(day.clockIn)}</span>
                              </div>
                            )}
                            {day.clockIn && day.clockOut && <div className="text-slate-300">→</div>}
                            {day.clockOut && (
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-rose-500" />
                                <span className="text-slate-600 font-medium">Out</span>
                                <span className="font-semibold text-slate-800">{formatClockTime(day.clockOut)}</span>
                              </div>
                            )}
                            {!day.clockIn && !day.clockOut && (
                              <span className="text-slate-400 text-xs">No activity</span>
                            )}
                          </div>
                          {day.breakMin > 0 && <p className="mt-2 text-xs font-medium text-amber-700">Paused {day.breakMin} minutes</p>}
                          {day.needsCorrection && day.anomalies?.length > 0 && <p className="mt-2 rounded-lg bg-white/70 px-2.5 py-2 text-xs text-amber-800">{day.anomalies.map((issue) => issue.message).join(' ')}</p>}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-600">Current Week Verified</span>
                    <span className={`text-sm font-semibold ${clockHistory.weeklyOvertime > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                      {clockHistory.weeklyTotal.toFixed(2)}h
                      {clockHistory.weeklyOvertime > 0 && (
                        <span className="ml-2 text-xs text-rose-500">({clockHistory.weeklyOvertime.toFixed(2)}h OT)</span>
                      )}
                    </span>
                  </div>
                </>
              )}
              </>}
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <div><p className="text-xs font-semibold text-slate-600">Current week recorded</p><p className="text-[10px] text-slate-400">Payroll approval remains evidence-controlled</p></div>
                <span className={`text-sm font-bold ${clockHistory.weeklyOvertime > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{clockHistory.weeklyTotal.toFixed(2)}h{clockHistory.weeklyOvertime > 0 && <span className="ml-1 text-[10px]">({clockHistory.weeklyOvertime.toFixed(2)}h OT)</span>}</span>
              </div>
            </div>

            <div className="px-1 pt-2"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">App preferences</p></div>

            {/* Navigation and appearance share one settings surface to avoid duplicated preference cards. */}
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="driver-display-settings-title">
              <div className="flex items-center gap-3 border-b border-slate-100 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Navigation size={18} /></div>
                <div>
                  <h2 id="driver-display-settings-title" className="text-sm font-semibold text-slate-950">Navigation & display</h2>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">Choose how routes open and how the app feels.</p>
                </div>
              </div>
              <div className="border-b border-slate-100 p-4">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Preferred navigation</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'google', label: 'Google' },
                    { value: 'waze', label: 'Waze' },
                    { value: 'apple', label: 'Apple' },
                  ].map((option) => {
                    const active = appSettings?.navigationApp === option.value;
                    return (
                      <button key={option.value} type="button" aria-pressed={active}
                        onClick={() => onUpdateAppSettings?.({ navigationApp: option.value })}
                        className={`min-h-11 rounded-xl border px-2 text-xs font-semibold transition ${active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'light', label: 'Light', icon: Sun },
                    { value: 'dark', label: 'Dark', icon: Moon },
                  ].map((option) => {
                    const Icon = option.icon;
                    const active = appSettings?.theme === option.value;
                    return (
                      <button key={option.value} type="button" aria-pressed={active}
                        onClick={() => onUpdateAppSettings?.({ theme: option.value })}
                        className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border text-xs font-semibold transition ${active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      >
                        <Icon size={15} /> {option.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Text size</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'sm', label: 'Compact' },
                    { value: 'md', label: 'Standard' },
                    { value: 'lg', label: 'Large' },
                  ].map((option) => {
                    const active = appSettings?.fontScale === option.value;
                    return (
                      <button key={option.value} type="button" aria-pressed={active}
                        onClick={() => onUpdateAppSettings?.({ fontScale: option.value })}
                        className={`min-h-11 rounded-xl border px-2 text-xs font-semibold transition ${active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <div className="px-1 pt-2"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Account & access</p></div>

            {/* Time Tracking Admin (admin/dispatcher only) */}
            {(role === 'admin' || role === 'dispatcher') && (
              <button onClick={() => setShowTTAdmin(true)} className="w-full flex items-center justify-between px-4 py-3.5 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:bg-blue-50/50 transition-all">
                <div className="flex items-center gap-3">
                  <BarChart3 size={17} className="text-blue-500" />
                  <span className="font-medium text-sm text-slate-700">Time Tracking Audit</span>
                </div>
                <ChevronRight size={15} className="text-slate-300" />
              </button>
            )}

            {/* Sign Out */}
              <button onClick={() => onLogout?.()} className="flex min-h-14 w-full items-center justify-between overflow-hidden rounded-xl border border-rose-200 bg-white px-4 py-3.5 shadow-sm hover:bg-rose-50">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600"><LogOut size={17} /></div>
                <div className="text-left"><span className="block text-sm font-semibold text-rose-700">Sign out</span><span className="mt-0.5 block text-[10px] font-medium text-slate-500">End this secure session</span></div>
              </div>
              <ChevronRight size={15} className="text-slate-300" />
            </button>
          </div>
        </div>
      )}

      {/* ===== CHAT PAGE ===== */}
      {activeNav === 'chat' && (
        <div className="flex-1 overflow-hidden flex flex-col bg-white min-h-0 relative">
          <ErrorBoundary>
            <Suspense fallback={<div className="flex items-center justify-center h-32"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}>
              <ChatPage onThreadActive={setIsChatThreadOpen} />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}

      {/* ===== TIME TRACKING ADMIN ===== */}
      {showTTAdmin && (
        <div className="fixed inset-0 bg-white z-[200] overflow-y-auto">
          <Suspense fallback={<div className="h-full flex items-center justify-center"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}>
            <LazyTimeTrackingAdmin
              onBack={() => setShowTTAdmin(false)}
              drivers={[...allDrivers, ...(dispatchers || [])]}
              trips={driverScopedTrips}
              driverTelemetry={driverTelemetry}
              timeTrackingDeclarations={timeTrackingDeclarations}
              clockEvents={me?.clockEvents || []}
              timeData={{ policyMode: timeTrackingPolicyMode }}
              onUpdateClockEvents={onUpdateClockEvents}
              onUpdateHourlyRate={onUpdateHourlyRate}
            />
          </Suspense>
        </div>
      )}

      {/* ===== CANCEL / NO-SHOW LEG SELECTION MODAL ===== */}
      {cancelPrompt && !passwordPrompt && (() => {
        const allSelected = selectedLegsForAction.size === cancelPrompt.legs.length;
        const toggleLeg = (id) => {
          setSelectedLegsForAction(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          });
        };
        const toggleAll = () => {
          setSelectedLegsForAction(prev => prev.size === cancelPrompt.legs.length ? new Set() : new Set(cancelPrompt.legs.map(l => l.id)));
        };
        const actionLabel = cancelPrompt.type === 'noshow' ? 'No Show' : cancelPrompt.type === 'reroute' ? 'Reroute' : 'Cancel';
        const gradientFrom = cancelPrompt.type === 'noshow' ? 'from-orange-500 to-amber-600' : cancelPrompt.type === 'reroute' ? 'from-purple-600 to-purple-500' : 'from-rose-600 to-rose-500';
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-6" style={{ zIndex: 140 }} onClick={() => { setCancelPrompt(null); setSelectedLegsForAction(new Set()); }}>
            <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl relative overflow-hidden pointer-events-auto" style={{ zIndex: 10 }} onClick={e => e.stopPropagation()}>
               <div className={`px-5 py-4 bg-blue-600 text-white flex items-center justify-between`}>
                <div>
                  <h3 className="text-base font-semibold">{actionLabel} Trip Legs</h3>
                  <p className="text-xs text-white/70 mt-0.5">{cancelPrompt.trip.patient} — {cancelPrompt.legs.length} leg{cancelPrompt.legs.length !== 1 ? 's' : ''}</p>
                </div>
                <button type="button" onClick={() => { setCancelPrompt(null); setSelectedLegsForAction(new Set()); }} className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center active:scale-90 cursor-pointer"><X size={16} /></button>
              </div>
              <div className="p-4 space-y-2 max-h-56 overflow-y-auto">
                <button type="button" onClick={toggleAll} className={`w-full flex items-center gap-3 p-3 rounded-xl border transition active:scale-95 cursor-pointer ${allSelected ? 'border-rose-200 bg-rose-50' : 'border-slate-100 hover:bg-slate-50'}`}>
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition ${allSelected ? 'bg-rose-500 border-rose-500' : 'border-slate-300'}`}>
                    {allSelected && <Check size={12} className="text-white" />}
                  </div>
                  <span className="text-sm     font-semibold text-slate-900">Select All ({cancelPrompt.legs.length})</span>
                </button>
                {cancelPrompt.legs.map((leg, idx) => {
                  const isSelected = selectedLegsForAction.has(leg.id);
                  return (
                    <button type="button" key={leg.id} onClick={() => toggleLeg(leg.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition active:scale-95 cursor-pointer ${isSelected ? 'border-rose-200 bg-rose-50' : 'border-slate-100 hover:bg-slate-50'}`}>
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition ${isSelected ? 'bg-rose-500 border-rose-500' : 'border-slate-300'}`}>
                        {isSelected && <Check size={12} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-2">
                          <span className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-medium ${cancelPrompt.type === 'noshow' ? 'bg-amber-100 text-amber-600' : cancelPrompt.type === 'reroute' ? 'bg-purple-100 text-purple-600' : 'bg-rose-100 text-rose-600'}`}>L{idx + 1}</span>
                          <span className="text-sm     font-semibold text-slate-900 truncate">{leg.patient}</span>
                          {leg.bookingId && <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-md text-xs font-semibold shrink-0">{leg.bookingId}</span>}
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded shrink-0 ${leg.status === 'Completed' ? 'bg-emerald-50 text-emerald-600' : leg.status === 'Cancelled' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>{leg.status}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-micro text-slate-500 mt-0.5">
                          <span className="truncate">{leg.pickup}</span>
                          <span className="shrink-0">→</span>
                          <span className="truncate">{leg.dropoff}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="px-4 pb-4">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedLegsForAction.size === 0) return;
                    setCancelPrompt(null);
                    setPasswordPrompt({ type: cancelPrompt.type, trip: cancelPrompt.trip, selectedLegIds: [...selectedLegsForAction], reason: '' });
                    setSelectedLegsForAction(new Set());
                  }}
                  disabled={selectedLegsForAction.size === 0}
                  className={`w-full py-3 text-white rounded-xl font-semibold text-sm transition disabled:opacity-40 cursor-pointer ${cancelPrompt.type === 'noshow' ? 'bg-orange-600 hover:bg-orange-700' : cancelPrompt.type === 'reroute' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                  {selectedLegsForAction.size === 0 ? 'Select at least one leg' : `${actionLabel} ${selectedLegsForAction.size} Leg${selectedLegsForAction.size > 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== RESTORE LEG SELECTION MODAL ===== */}
      {restorePrompt && !passwordPrompt && (() => {
        const allSelected = selectedLegsForAction.size === restorePrompt.legs.length;
        const toggleLeg = (id) => {
          setSelectedLegsForAction(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          });
        };
        const toggleAll = () => {
          setSelectedLegsForAction(prev => prev.size === restorePrompt.legs.length ? new Set() : new Set(restorePrompt.legs.map(l => l.id)));
        };
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-6" style={{ zIndex: 140 }} onClick={() => { setRestorePrompt(null); setSelectedLegsForAction(new Set()); }}>
            <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl relative overflow-hidden pointer-events-auto" style={{ zIndex: 10 }} onClick={e => e.stopPropagation()}>
               <div className="px-5 py-4 bg-blue-600 text-white flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold">Restore Trip Legs</h3>
                  <p className="text-xs text-white/70 mt-0.5">{restorePrompt.trip.patient} — {restorePrompt.legs.length} leg{restorePrompt.legs.length !== 1 ? 's' : ''}</p>
                </div>
                <button type="button" onClick={() => { setRestorePrompt(null); setSelectedLegsForAction(new Set()); }} className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center active:scale-90 cursor-pointer"><X size={16} /></button>
              </div>
              <div className="p-4 space-y-2 max-h-56 overflow-y-auto">
                <button type="button" onClick={toggleAll} className={`w-full flex items-center gap-3 p-3 rounded-xl border transition active:scale-95 cursor-pointer ${allSelected ? 'border-blue-200 bg-blue-50' : 'border-slate-100 hover:bg-slate-50'}`}>
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition ${allSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                    {allSelected && <Check size={12} className="text-white" />}
                  </div>
                  <span className="text-sm     font-semibold text-slate-900">Select All ({restorePrompt.legs.length})</span>
                </button>
                {restorePrompt.legs.map((leg, idx) => {
                  const isSelected = selectedLegsForAction.has(leg.id);
                  return (
                    <button type="button" key={leg.id} onClick={() => toggleLeg(leg.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition active:scale-95 cursor-pointer ${isSelected ? 'border-blue-200 bg-blue-50' : 'border-slate-100 hover:bg-slate-50'}`}>
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                        {isSelected && <Check size={12} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-md bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium">L{idx + 1}</span>
                          <span className="text-sm     font-semibold text-slate-900 truncate">{leg.patient}</span>
                          {leg.bookingId && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md text-xs font-semibold shrink-0">{leg.bookingId}</span>}
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded shrink-0 ${leg.status === 'Completed' ? 'bg-emerald-50 text-emerald-600' : leg.status === 'Cancelled' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>{leg.status}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-micro text-slate-500 mt-0.5">
                          <span className="truncate">{leg.pickup}</span>
                          <span className="shrink-0">→</span>
                          <span className="truncate">{leg.dropoff}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="px-4 pb-4">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedLegsForAction.size === 0) return;
                    setRestorePrompt(null);
                    setPasswordPrompt({ type: 'restore', trip: restorePrompt.trip, selectedLegIds: [...selectedLegsForAction] });
                  }}
                  disabled={selectedLegsForAction.size === 0}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition disabled:opacity-40 cursor-pointer">
                  {selectedLegsForAction.size === 0 ? 'Select at least one leg' : `Restore ${selectedLegsForAction.size} Leg${selectedLegsForAction.size > 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== EMERGENCY TRANSFER MODAL ===== */}
      {transferPrompt && (
        <div className="trip-window-overlay bg-black/40" style={{ zIndex: 175 }} onClick={(e) => e.stopPropagation()}>
          <div className="trip-window-panel" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setTransferPrompt(null)} className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center active:scale-90 cursor-pointer shrink-0 z-10"><X size={16} className="text-slate-500" /></button>
            <div className="trip-window-body p-4">
              <div className="text-center mb-3">
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-1.5">
                  <Forward size={18} className="text-orange-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Emergency Transfer</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  Send this {transferPrompt.type === 'route' ? 'route plan' : 'trip'} to another driver for acceptance.
                </p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-micro font-semibold uppercase tracking-wide text-slate-500 mb-1">Send To Driver</label>
                  <select value={transferTargetDriverId} onChange={(e) => setTransferTargetDriverId(e.target.value)} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-semibold text-sm text-center focus:border-amber-500 outline-none">
                    <option value="">Select driver</option>
                    {transferTargetDrivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>{driver.name || driver.email || driver.id}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-micro font-semibold uppercase tracking-wide text-slate-500 mb-1">Reason</label>
                  <select value={transferReason} onChange={(e) => setTransferReason(e.target.value)} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-semibold text-sm text-center focus:border-amber-500 outline-none">
                    <option value="">Select reason</option>
                    <option value="Traffic delay">Traffic delay</option>
                    <option value="Vehicle issue">Vehicle issue</option>
                    <option value="Emergency">Emergency</option>
                    <option value="Running late">Running late</option>
                    <option value="Other driver closer">Other driver closer</option>
                  </select>
                </div>
                <p className="text-xs font-semibold text-amber-700 text-center">Password confirmation required by both drivers.</p>
              </div>
            </div>
            <div className="trip-window-footer px-4 pb-4">
              <button type="button" onClick={() => setTransferPrompt(null)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-all cursor-pointer">Cancel</button>
              <button type="button" onClick={() => setPasswordPrompt({ type: 'transfer_send' })} disabled={!transferTargetDriverId} className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold transition-all disabled:opacity-40 cursor-pointer">Send</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== PASSWORD CONFIRM MODAL ===== */}
      {passwordPrompt && (
        <div className="trip-window-overlay bg-black/40" style={{ zIndex: 180 }} onClick={(e) => { e.stopPropagation(); }}>
          <div className="trip-window-panel" style={{ zIndex: 10 }} onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => { setPasswordPrompt(null); setPasswordValue(''); setPasswordError(''); }} className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center active:scale-90 cursor-pointer shrink-0 z-10"><X size={16} className="text-slate-500" /></button>
            <div className="trip-window-body p-4">
              {/* Header with step indicator */}
              <div className="flex items-center gap-0.5 mb-2">
                <div className="h-1 flex-1 rounded-full bg-emerald-400" />
                <div className={`h-1 flex-1 rounded-full ${passwordPrompt.type === 'restore' || passwordPrompt.type === 'edittrip' || passwordPrompt.type === 'edittripcomplete' || String(passwordPrompt.type || '').includes('transfer') ? 'bg-blue-400' : 'bg-rose-400'}`} />
              </div>
              <p className="text-micro font-semibold uppercase tracking-wide text-slate-400 text-center">Step 2 of 2</p>
              <div className="text-center mt-1.5">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-1.5 ${passwordPrompt.type === 'restore' || passwordPrompt.type === 'edittrip' || passwordPrompt.type === 'edittripcomplete' || String(passwordPrompt.type || '').includes('transfer') ? 'bg-blue-100' : 'bg-rose-100'}`}>
                  <Lock size={18} className={passwordPrompt.type === 'restore' || passwordPrompt.type === 'edittrip' || passwordPrompt.type === 'edittripcomplete' || String(passwordPrompt.type || '').includes('transfer') ? 'text-blue-600' : 'text-rose-600'} />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Confirm {passwordPrompt.type === 'route_stop_exception' ? passwordPrompt.status : passwordPrompt.type === 'noshow' ? 'No Show' : passwordPrompt.type === 'reroute' ? 'Reroute' : passwordPrompt.type === 'restore' ? 'Restore' : passwordPrompt.type === 'edittrip' || passwordPrompt.type === 'edittripcomplete' ? 'Edit' : passwordPrompt.type === 'transfer_send' ? 'Transfer' : passwordPrompt.type === 'accept_transfer_trip' || passwordPrompt.type === 'accept_transfer_route' ? 'Accept Transfer' : passwordPrompt.type === 'decline_transfer_trip' || passwordPrompt.type === 'decline_transfer_route' ? 'Decline Transfer' : 'Cancel'}</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  {(role === 'admin' || role === 'dispatcher') 
                    ? `Confirm administrative action for ${passwordPrompt.selectedLegIds && passwordPrompt.selectedLegIds.length > 1 ? `${passwordPrompt.selectedLegIds.length} legs` : passwordPrompt.trip?.patient || 'this trip'}.`
                    : (passwordPrompt.type === 'restore' ? 'Enter your password to restore selected trips' : passwordPrompt.type === 'edittrip' || passwordPrompt.type === 'edittripcomplete' ? 'Enter your password to save your trip changes' : String(passwordPrompt.type || '').includes('transfer') ? 'Enter your password to confirm this transfer decision.' : passwordPrompt.type === 'route_stop_exception' ? `Enter your password to mark ${passwordPrompt.trip?.patient || 'this route stop'} as ${passwordPrompt.status}.` : `Enter your password to mark ${passwordPrompt.selectedLegIds && passwordPrompt.selectedLegIds.length > 1 ? `${passwordPrompt.selectedLegIds.length} legs` : passwordPrompt.trip?.patient} as ${passwordPrompt.type === 'noshow' ? 'No Show' : passwordPrompt.type === 'reroute' ? 'Rerouted' : 'Cancelled'}`)}
                </p>
                {passwordPrompt.selectedLegIds && passwordPrompt.selectedLegIds.length > 1 && (
                  <p className="text-xs text-rose-500 font-semibold mt-1">{passwordPrompt.selectedLegIds.length} leg{passwordPrompt.selectedLegIds.length !== 1 ? 's' : ''} will be affected</p>
                )}
              </div>
              <div className="space-y-3 mt-3">
                {passwordPrompt.type !== 'restore' && passwordPrompt.type !== 'edittrip' && passwordPrompt.type !== 'edittripcomplete' && !String(passwordPrompt.type || '').includes('transfer') && (
                  <div>
                    <label className="block text-micro font-semibold uppercase tracking-wide text-slate-500 mb-1">Reason</label>
                    <select value={passwordPrompt.reason || ''} onChange={(e) => setPasswordPrompt(prev => ({ ...prev, reason: e.target.value }))}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-medium text-sm text-center focus:border-rose-500 outline-none">
                      <option value="">Select reason (optional)</option>
                      <option value="Client Cancelled">Client Cancelled</option>
                      <option value="Facility Cancelled">Facility Cancelled</option>
                      <option value="No Answer">No Answer</option>
                      <option value="No Show">No Show</option>
                      <option value="Transportation Issue">Transportation Issue</option>
                      <option value="Weather">Weather</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                )}
                {!(role === 'admin' || role === 'dispatcher') ? (
                  <div>
                    <label className="block text-micro font-semibold uppercase tracking-wide text-slate-500 mb-1">Password</label>
                    <input
                      type="password"
                      value={passwordValue}
                      onChange={(e) => setPasswordValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && verifyPasswordAndProceed()}
                      placeholder="Enter password"
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-semibold text-sm text-center focus:border-rose-500 outline-none"
                      autoFocus
                    />
                    {passwordError && <p className="text-xs text-rose-600 font-semibold mt-1 text-center">{passwordError}</p>}
                  </div>
                ) : (
                  <p className="text-xs text-blue-700 font-semibold text-center">Administrative access: password input bypassed.</p>
                )}
              </div>
            </div>
            <div className="trip-window-footer px-4 pb-4">
              <button type="button" onClick={() => { setPasswordPrompt(null); setPasswordValue(''); setPasswordError(''); }} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-all cursor-pointer">
                Back
              </button>
              <button type="button" onClick={verifyPasswordAndProceed} disabled={(!(role === 'admin' || role === 'dispatcher') && !passwordValue) || passwordVerifying} className={`flex-1 py-3 text-white rounded-xl font-semibold disabled:opacity-40 transition-all cursor-pointer ${passwordPrompt.type === 'restore' || String(passwordPrompt.type || '').includes('transfer') ? 'bg-blue-600 hover:bg-blue-700' : passwordPrompt.type === 'reroute' ? 'bg-purple-600 hover:bg-purple-700' : passwordPrompt.type === 'edittrip' || passwordPrompt.type === 'edittripcomplete' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                {passwordVerifying ? 'Confirming...' : passwordPrompt.type === 'route_stop_exception' ? `Confirm ${passwordPrompt.status}` : passwordPrompt.type === 'noshow' ? 'Confirm No Show' : passwordPrompt.type === 'reroute' ? 'Confirm Reroute' : passwordPrompt.type === 'restore' ? 'Confirm Restore' : passwordPrompt.type === 'edittrip' || passwordPrompt.type === 'edittripcomplete' ? 'Confirm & Save' : passwordPrompt.type === 'transfer_send' ? 'Confirm Transfer' : passwordPrompt.type === 'accept_transfer_trip' || passwordPrompt.type === 'accept_transfer_route' ? 'Confirm Accept' : passwordPrompt.type === 'decline_transfer_trip' || passwordPrompt.type === 'decline_transfer_route' ? 'Confirm Decline' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== QUICK SMS MENU ===== */}
      {quickSmsMenuTrip && (() => {
        const smsTrip = quickSmsMenuTrip;
        const smsPrimary = getPrimaryContactForTrip(smsTrip);
        const smsFirstName = String(smsTrip.patient || '').trim().split(/\s+/)[0] || 'there';
        const smsFirstContact = smsPrimary ? !hasMessagedClientBefore(smsPrimary.phone) : false;
        const smsTripKey = tripCalendarDateKey(smsTrip.date);
        const todayKey = localCalendarYmd();
        const tomorrowKey = localCalendarYmd(new Date(Date.now() + 86400000));
        const suggestedId = smsTripKey && smsTripKey === todayKey ? 'today' : smsTripKey === tomorrowKey ? 'tomorrow' : null;
        const quickSmsTemplates = [
          { id: 'tomorrow', label: 'Tomorrow Trip', body: "just checking if we're still on for your trip tomorrow." },
          { id: 'today', label: 'Today Trip', body: "just checking if we're still on for your trip today." },
          { id: 'soon', label: 'On My Way Soon', body: "I'll be on my way shortly. Please confirm that we're still on." },
          { id: 'way', label: 'On My Way', body: "I'm on my way." },
          { id: 'ready', label: 'Pickup / Ready Time', body: "do you know what time you'll be done and ready for pickup?" },
          { id: 'checkin', label: 'Checking In', body: 'just checking in regarding your trip. Please let me know if everything is still good for today.' },
          { id: 'arrived', label: "I've Arrived", body: "I've arrived. Please let me know when you're ready." },
        ];
        const closeQuickSms = () => setQuickSmsMenuTrip(null);
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={closeQuickSms}>
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative bg-white rounded-3xl rounded-b-none w-full max-w-lg pb-6 px-4 pt-2 animate-slide-up max-h-[85dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex justify-center mb-3">
                <span className="w-10 h-1 rounded-full bg-slate-300" />
              </div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-base font-bold text-slate-900">SMS</h3>
                <button type="button" onClick={closeQuickSms} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 cursor-pointer">
                  <X size={16} />
                </button>
              </div>
              <p className="text-xs font-semibold text-slate-500 mb-3">
                To: {smsPrimary ? `${smsPrimary.label}: ${smsPrimary.name}` : 'No primary contact'}
              </p>
              {!smsPrimary ? (
                <p className="text-sm font-medium text-rose-600 py-4 text-center">This trip has no contact number.</p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => { closeQuickSms(); sendSMS(smsPrimary.phone, smsPrimary.name); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-all text-sm font-semibold cursor-pointer mb-3"
                  >
                    <PenLine size={16} /> Write Manually
                  </button>
                  <div className="space-y-1">
                    {quickSmsTemplates.map((tpl) => {
                      const preview = buildQuickSmsText(tpl, smsTrip.patient, smsFirstContact);
                      const suggested = suggestedId === tpl.id;
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => {
                            markClientAsMessaged(smsPrimary.phone);
                            closeQuickSms();
                            sendSMSWithBody(smsPrimary.phone, preview);
                          }}
                          className="w-full flex items-start gap-3 px-4 py-2.5 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-100 hover:border-blue-200 transition-all text-left cursor-pointer"
                        >
                          <MessageCircle size={16} className="text-blue-600 shrink-0 mt-0.5" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">{tpl.label}</span>
                              {suggested && (
                                <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-[10px] font-bold uppercase tracking-wide text-amber-700">Suggested</span>
                              )}
                            </span>
                            <span className="block text-xs font-medium text-slate-500 mt-0.5 break-words">{preview}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] font-medium text-slate-400 mt-3 text-center">Your message opens in the SMS app so you can review it before sending.</p>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* ===== SMART CONTACT SELECTOR ===== */}
      {showContactSelector && (() => {
        const contacts = getContactsForTrip(showContactSelector);
        const warning = getContactWarning(showContactSelector, trips);
        const iconMap = { User, Shield, PhoneForwarded, AlertTriangle, Building, MapPin, Headphones, Route };
        return (
          <div className="fixed inset-0 bg-black/40 flex items-end justify-center" style={{ zIndex: 170 }} onClick={() => setShowContactSelector(null)}>
            <div className="bg-white w-full max-w-md rounded-t-3xl shadow-2xl relative overflow-hidden animate-slide-up pointer-events-auto" style={{ zIndex: 10 }} onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="px-5 py-4 bg-blue-600 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold">Contact for Trip</h3>
                    <p className="text-xs text-white/70 mt-0.5">{showContactSelector.patient} · {to12hr(showContactSelector.time)}</p>
                  </div>
                  <button type="button" onClick={() => setShowContactSelector(null)} className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center active:scale-90 cursor-pointer"><X size={16} /></button>
                </div>
              </div>

              {/* Warning */}
              {warning.show && (
                <div className={`mx-4 mt-3 rounded-xl px-3 py-2 flex items-center gap-2 ${warning.severity === 'error' ? 'bg-rose-50 border border-rose-200' : warning.severity === 'warning' ? 'bg-amber-50 border border-amber-200' : 'bg-blue-50 border border-blue-200'}`}>
                  <AlertTriangle size={12} className={`shrink-0 ${warning.severity === 'error' ? 'text-rose-600' : warning.severity === 'warning' ? 'text-amber-600' : 'text-blue-600'}`} />
                  <p className={`text-xs font-medium ${warning.severity === 'error' ? 'text-rose-700' : warning.severity === 'warning' ? 'text-amber-700' : 'text-blue-700'}`}>{warning.message}</p>
                </div>
              )}

              {/* Primary Quick Call */}
              {contacts.length > 0 && (() => {
                const primary = contacts.find(c => c.isPrimary) || contacts[0];
                const ps = getContactRoleIcon(primary.role);
                const IconComp = iconMap[ps.icon] || User;
                return (
                  <div className="px-4 pt-3">
                    <button
                      type="button"
                      onClick={() => { handleCall(primary.phone, `${primary.label}: ${primary.name}`); setShowContactSelector(null); }}
                      className={`w-full h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2.5 active:scale-95 cursor-pointer shadow-sm ${ps.bg} ${ps.color} border ${ps.border}`}>
                      <IconComp size={18} /> Call {primary.label} — {formatPhoneDisplay(primary.phone)}
                    </button>
                  </div>
                );
              })()}

              {/* Contact List */}
              <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
                {contacts.map((contact, idx) => {
                  const roleStyle = getContactRoleIcon(contact.role);
                  const actions = getContactRoleActions(contact.role);
                  const Icon = iconMap[roleStyle.icon] || User;
                  return (
                    <div key={idx} className={`bg-white rounded-xl border-2 shadow-sm ${contact.isPrimary ? 'ring-2 ' + roleStyle.ring : 'border-slate-200'} p-3`}>
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${roleStyle.bg}`}>
                          <Icon size={18} className={roleStyle.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm     font-semibold text-slate-900 truncate">{contact.name}</span>
                            {contact.isPrimary && <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">PRIMARY</span>}
                          </div>
                          <p className="text-xs text-slate-500">{contact.label} · {formatPhoneDisplay(contact.phone)}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-13">
                        <button
                          type="button"
                          onClick={() => { handleCall(contact.phone, `${contact.label}: ${contact.name}`); setShowContactSelector(null); }}
                          className="flex-1 h-9 bg-emerald-600 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer">
                          <Phone size={16} /> {actions.callLabel}
                        </button>
                        {actions.smsLabel && (
                          <button
                            type="button"
                            onClick={() => { handleSMS(contact.phone, contact.name); setShowContactSelector(null); }}
                            className="flex-1 h-7 bg-blue-600 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer">
                            <MessageCircle size={16} /> {actions.smsLabel}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Quick Actions Footer */}
              <div className="px-4 pb-4 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { handleSmartCall(showContactSelector); setShowContactSelector(null); }}
                  className="w-full h-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer">
                  <Phone size={16} /> Quick Call Primary Contact
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== BOTTOM NAVIGATION ===== */}
      {!isEmbedded && !isChatThreadOpen && (
        <nav className="bottom-nav md:hidden">
          <div className="relative flex h-full items-center justify-between gap-1 px-3">
              {(() => {
                const activeIndex = navItems.findIndex((item) => item.id === activeNav);
                return (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-1.5 rounded-full bg-blue-50"
                    style={{
                      left: '0.75rem',
                      width: `calc((100% - 1.5rem) / ${Math.max(1, navItems.length)})`,
                      transform: `translateX(${Math.max(0, activeIndex) * 100}%)`,
                      transition: 'transform var(--dur-base) var(--ease-out-expo)',
                    }}
                  />
                );
              })()}
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActiveTab = activeNav === item.id;
                return (
                  <button key={item.id} onClick={() => {
                    if (item.id === 'active-trip') {
                      selection();
                      setActiveWorkTripId(activeWorkTripId);
                      setActiveNav('active-trip');
                      return;
                    }
                    selection();
                    setActiveNav(item.id);
                  }}
                    aria-current={isActiveTab ? 'page' : undefined}
                    className={`relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1.5 py-1 touch-manipulation transition-colors duration-200 min-h-[56px] ${
                      isActiveTab ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'
                    }`}>
                    <div className="relative">
                      <Icon key={`${item.id}-${isActiveTab}`} size={24} strokeWidth={isActiveTab ? 1.8 : 1.3}
                        className={`transition-colors duration-200 ${isActiveTab ? 'anim-pop text-blue-600' : 'text-slate-400'}`}
                      />
                      {item.badge > 0 && (
                        <span key={item.badge} className="messenger-nav-badge absolute -right-2.5 -top-2 badge-messenger badge-pop badge-pulse">
                          {item.badge > 99 ? '99+' : item.badge}
                        </span>
                      )}
                    </div>
                    {item.sublabel ? (
                      <div className="flex flex-col items-center leading-none">
                        <span className={`max-w-full truncate text-[10px] font-normal tracking-wide ${isActiveTab ? 'text-blue-600' : 'text-slate-400'}`}>
                          {item.label}
                        </span>
                        <span className={`max-w-full truncate text-[9px] font-normal tracking-wide ${isActiveTab ? 'text-blue-600' : 'text-slate-400'}`}>
                          {item.sublabel}
                        </span>
                      </div>
                    ) : (
                      <span className={`max-w-full truncate text-[11px] font-semibold tracking-wide transition-colors leading-none ${isActiveTab ? 'text-blue-600' : 'text-slate-400'}`}>
                        {item.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
        </nav>
      )}

      {/* ===== ROUTE SEQUENCER MODAL ===== */}
      {showSequencerModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => { setShowSequencerModal(false); setSequencerTripFilter(null); setRoutePlanSequencerStops(null); setRoutePlanSequencerSequence(null); setRoutePlanSequencerOrigin(null); }}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="bg-white w-full max-w-7xl max-h-[92vh] min-h-[400px] rounded-3xl shadow-2xl relative z-10 border border-slate-200 animate-in fade-in zoom-in-95 duration-200 flex flex-col overflow-hidden pointer-events-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between flex-shrink-0">
              <h2 className="text-sm     font-semibold text-slate-900 flex items-center gap-2">
                <Route size={16} className="text-indigo-700" /> Route Plan
              </h2>
              <button onClick={() => { setShowSequencerModal(false); setSequencerTripFilter(null); setRoutePlanSequencerStops(null); setRoutePlanSequencerSequence(null); setRoutePlanSequencerOrigin(null); }} className="p-1.5 rounded-xl hover:bg-slate-50 transition-colors"><X size={16} className="text-slate-500" /></button>
            </div>
            <div className="flex-1 overflow-hidden">
              <Suspense fallback={<LazyFallback />}>
                <ErrorBoundary>
                  <RouteSequencerApp key={sequencerKey}
                    trips={sequencerTripFilter ? trips.filter(t => sequencerTripFilter.includes(t.id)) : trips}
                    drivers={drivers}
                    currentUser={currentUser}
                    role={role}
                    initialStops={routePlanSequencerStops}
                    initialSequence={routePlanSequencerSequence}
                    initialOrigin={routePlanSequencerOrigin}
                    onRouteSaved={({ route, saveMode, validTripIds }) => {
                      if (!onAddAuditLog) return;
                      onAddAuditLog(
                        saveMode === 'recurring' ? 'Route Created' : 'Route Saved',
                        saveMode === 'recurring'
                          ? `${currentUser} saved recurring route "${route.name}" with ${route.sequence?.length || 0} stops.`
                          : `${currentUser} saved today's route "${route.name}" with ${validTripIds.length} synced trips.`,
                        saveMode === 'recurring' ? 'indigo' : 'amber'
                      );
                    }}
                    onApplyRoute={({ route, tripIds }) => {
                      (tripIds || []).forEach((tripId) => {
                        const trip = trips.find(t => t.id === tripId);
                        if (trip) advanceWorkflow(trip, 'Assigned', { driverId: me?.id || '', driverEmail: me?.email || '', driverName: me?.name || '' });
                      });
                      if (onAddAuditLog) {
                        onAddAuditLog('Route Applied', `${currentUser} applied route "${route.name}" to ${tripIds?.length || 0} trips.`, 'emerald');
                      }
                      setShowSequencerModal(false);
                      setRoutePlanSequencerStops(null);
                      setRoutePlanSequencerSequence(null);
                    }}
                  />
                </ErrorBoundary>
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {/* Legs Detail Modal */}
      {legsDetailPatient && (() => {
        const patientName = legsDetailPatient;
        const legs = orderedTrips.filter(t => (t.patient || '').trim().toLowerCase() === patientName.trim().toLowerCase());
        return (
          <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 130 }} onClick={() => setLegsDetailPatient(null)}>
            <div className="absolute inset-0 bg-black/40" />
            <div className="bg-white w-full max-w-lg rounded-3xl p-5 relative shadow-2xl max-h-[85vh] overflow-y-auto pointer-events-auto" style={{ zIndex: 10 }} onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg     font-semibold text-slate-900">{patientName}</h3>
                <button type="button" onClick={() => setLegsDetailPatient(null)} className="p-1.5 bg-slate-100 rounded-xl text-slate-500 hover:bg-slate-200 cursor-pointer"><X size={16} /></button>
              </div>
              <p className="text-slate-500 text-xs font-semibold mb-4">{legs.length} leg{legs.length !== 1 ? 's' : ''}</p>
              <div className="space-y-2">
                {legs.map((leg, idx) => (
                  <div key={leg.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-micro font-semibold uppercase tracking-wide text-slate-500">Leg {idx + 1}</span>
                      <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${leg.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : leg.status === 'In Transit' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>{leg.status}</span>
                    </div>
                    <p className="text-slate-500 text-xs font-semibold mb-1">Booking: {leg.bookingId || '—'}</p>
                    <div className="space-y-1.5">
                      <div className="flex items-start gap-2">
                        <div className="w-3 h-3 rounded-full bg-emerald-500 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-600">Pickup</p>
                          <p className="text-sm text-slate-500 truncate">{leg.pickup}</p>
                          <p className="text-xs text-slate-500">{leg.time ? to12hr(leg.time) : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-3 h-3 rounded-full bg-rose-500 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-600">Dropoff</p>
                          <p className="text-sm text-slate-500 truncate">{leg.dropoff}</p>
                        </div>
                      </div>
                    </div>
                    {leg.notes && <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">{leg.notes}</p>}
                    {leg.pickupPhone && (() => {
                      const contact = getContactsForTrip(leg).find(c => cleanPhone(c.phone) === cleanPhone(leg.pickupPhone));
                      const label = contact ? contact.label : 'Contact';
                      return (
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="text-micro font-semibold uppercase tracking-wide text-slate-500">{label}</span>
                          <button type="button" onClick={() => handleCall(leg.pickupPhone, `${label}: ${leg.patient}`)} className="text-xs text-blue-600 font-medium flex items-center gap-1 hover:underline cursor-pointer">
                            <Phone size={16} /> {formatPhoneDisplay(leg.pickupPhone)}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== LEGS DETAILS MODAL ===== */}
      {showLegsModal && (() => {
        const statusColor = (s) => {
          if (s === 'Completed' || s === 'Arrived') return 'bg-emerald-100 text-emerald-700';
          if (s === 'Cancelled' || s === 'No Show') return 'bg-rose-100 text-rose-700';
          if (s === 'In Transit') return 'bg-blue-100 text-blue-700';
          return 'bg-slate-100 text-slate-700';
        };
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4" style={{ zIndex: 140 }} onClick={() => setShowLegsModal(null)}>
            <div className="bg-white rounded-3xl w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between rounded-t-3xl z-10">
                <div>
                  <h3 className="text-base     font-semibold text-slate-900">{showLegsModal[0]?.patient || 'Trip Legs'}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{showLegsModal.length} leg{showLegsModal.length !== 1 ? 's' : ''} today</p>
                </div>
                <button type="button" onClick={() => setShowLegsModal(null)} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-all cursor-pointer shrink-0">
                  <X size={16} />
                </button>
              </div>
              <div className="p-4 space-y-2">
                {showLegsModal.map((leg) => (
                  <div key={leg.id} className="border border-slate-100 rounded-xl p-3 hover:border-slate-200 transition-colors">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-600 font-mono">#{leg.bookingId || leg.id}</span>
                        {leg.wheelchair && leg.wheelchair !== 'WLK' && (
                          <span className="text-xs font-semibold bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded">{leg.wheelchair}</span>
                        )}
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${statusColor(leg.status)}`}>{leg.status}</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-start gap-2 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-1 bg-blue-500"></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-900 font-semibold leading-tight">{leg.pickupSite || 'Pickup'}</p>
                          <p className="text-slate-500 truncate leading-tight">{leg.pickup}</p>
                          {leg.pickupPhone && <p className="text-slate-500 text-xs font-mono mt-0.5">{leg.pickupPhone}</p>}
                        </div>
                      </div>
                      <div className="flex items-start gap-2 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-1 bg-emerald-500"></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-900 font-semibold leading-tight">{leg.dropoffSite || 'Dropoff'}</p>
                          <p className="text-slate-500 truncate leading-tight">{leg.dropoff}</p>
                          {leg.dropoffPhone && <p className="text-slate-500 text-xs font-mono mt-0.5">{leg.dropoffPhone}</p>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500">
                      {leg.time && <span>{leg.time}</span>}
                      {leg.distance && <><span>•</span><span>{leg.distance} mi</span></>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== GEOFENCE TOAST ===== */}
      {showToast && (
        <div className="fixed bottom-6 left-4 right-4 z-50 animate-slide-up" style={{bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))'}}>
          <div className="bg-white text-slate-900 rounded-xl p-4 shadow-2xl flex items-center gap-3 border border-slate-200">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
              <MapPin size={20} className="text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{showToast.message}</p>
            </div>
            {showToast.action === 'arrive-pickup' && (
              <button type="button" onClick={() => { setShowToast(null); if (showToast.trip) handleArrivePickup(showToast.trip); }} className="px-4 py-2 bg-blue-500 rounded-xl text-xs font-semibold hover:bg-blue-400 transition-all shrink-0 cursor-pointer">
                Arrive
              </button>
            )}
            {showToast.action === 'arrive-dropoff' && (
              <button type="button" onClick={() => { setShowToast(null); if (showToast.trip) handleArriveDropoff(showToast.trip); }} className="px-4 py-2 bg-orange-500 rounded-xl text-xs font-semibold hover:bg-orange-400 transition-all shrink-0 cursor-pointer">
                Arrive
              </button>
            )}
            <button type="button" onClick={() => setShowToast(null)} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 cursor-pointer">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ===== DEBUG OVERLAY ===== */}
      {showDebugPanel && (
        <div className="fixed bottom-32 left-2 z-[60] min-w-[200px] max-w-[220px] rounded-lg border border-slate-300 bg-slate-950/90 p-2.5 text-xs font-mono text-white shadow-xl backdrop-blur">
          <div className="space-y-1">
            <div className="flex items-center justify-between border-b border-white/10 pb-1 mb-1">
              <span className="font-semibold text-xs uppercase tracking-wider text-slate-500">GPS Debug</span>
              <button type="button" onClick={() => setShowDebugPanel(false)} className="text-white/50 hover:text-white"><X size={10} /></button>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
              <span className="text-slate-500">Status</span>
              <span className={isGpsTracking ? 'text-emerald-400' : 'text-rose-400'}>{isGpsTracking ? 'Tracking' : 'Idle'}</span>
              <span className="text-slate-500">Lat</span>
              <span className="text-blue-300 truncate">{driverPosition?.lat?.toFixed(5) || '—'}</span>
              <span className="text-slate-500">Lng</span>
              <span className="text-blue-300 truncate">{driverPosition?.lng?.toFixed(5) || '—'}</span>
              <span className="text-slate-500">Age</span>
              <span className="text-yellow-300">{driverPosition?.capturedAt ? `${Math.round((Date.now() - new Date(driverPosition.capturedAt).getTime()) / 1000)}s ago` : '—'}</span>
              <span className="text-slate-500">Interval</span>
              <span className="text-white">{driverLocStream?.intervalMs || '—'}ms</span>
              <span className="text-slate-500">Err</span>
              <span className={`truncate ${driverLocStream?.error ? 'text-rose-400' : 'text-slate-500'}`}>{driverLocStream?.error || 'none'}</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default DriverPage;
