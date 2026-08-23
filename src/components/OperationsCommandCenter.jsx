import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  FileText, Users, AlertCircle, Clock, CheckCircle2, XCircle,
  Truck, Activity,
  BrainCircuit, Phone, MessageSquare,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, AlertTriangle, MapPin,
  Square, CheckSquare, X, ArrowRight, ArrowUp, ArrowDown, TrendingUp, TrendingDown,
  Trash2, Archive, UploadCloud, Plus, Edit2, Route, Search, PanelRight, Loader2, Filter, RotateCcw,
  User, Car, Map as MapIcon, Navigation, UserPlus, Flag, MoreVertical
} from 'lucide-react';
import { db, doc, getDocFromServer } from '../config/firebase';
import { tripCalendarDateKey, localCalendarYmd } from '../utils/tripDate';
import SendSmsModal from './SendSmsModal';
import SmsConversationModal from './SmsConversationModal';
import { getOperationalRoutes } from '../utils/routePlans';
import { isInOutTrip } from '../utils/inOutTrips';
import CommandIntelligencePanel from './CommandIntelligencePanel';
import { aiPrioritizeTrips } from '../config/ai';
import { getDriverLiveStatus } from '../constants/statuses';
import PlacesAutocompleteInput from './PlacesAutocompleteInput';
import { tripMatchesSearch } from '../utils/search';
import { toValidDate } from '../utils/safeDate';
import { scopeOperationsTripsByDate } from '../utils/portalSelectors';


const TERMINAL_STATUSES = ['Completed', 'Cancelled', 'No Show', 'Rerouted'];
const TIME_SORT_BOTTOM_STATUSES = ['Cancelled', 'No Show', 'Rerouted'];
const ACTIVE_PROGRESS_STATUSES = ['In Mission', 'En Route', 'At Pickup', 'At Dropoff', 'Assigned', 'In Progress', 'Navigating Pickup', 'Navigating Dropoff', 'In Transit', 'Arrived'];
const MANIFEST_VIEW_OPTIONS = [
  { value: 'board', label: 'Board' },
  { value: 'card', label: 'Card' },
  { value: 'table', label: 'Table' },
];
const SORT_OPTIONS = [
  { value: 'time', label: 'Sort Time' },
  { value: 'urgency', label: 'Sort Priority' },
  { value: 'patient', label: 'Sort Client' },
  { value: 'pickup', label: 'Sort Pickup' },
  { value: 'dropoff', label: 'Sort Dropoff' },
  { value: 'assignment', label: 'Sort Assignment' },
  { value: 'tripId', label: 'Sort Trip ID' },
  { value: 'status', label: 'Sort Status' },
  { value: 'reply', label: 'Sort Reply' },
  { value: 'vehicle', label: 'Sort Vehicle' },
  { value: 'distance', label: 'Sort Distance' },
  { value: 'trips', label: 'Sort Trip Count' },
  { value: 'ai', label: 'AI Smart Sort' },
];
const MANIFEST_GROUP_OPTIONS = [
  { value: 'driver', label: 'Group Driver' },
  { value: 'status', label: 'Group Status' },
  { value: 'service', label: 'Group Service' },
  { value: 'urgency', label: 'Group Priority' },
];
const DENSITY_OPTIONS = [
  { value: 'minimal', label: '1 Line' },
];

const MANIFEST_TABLE_COLUMNS = [
  { label: 'Trip #', sortKey: 'tripId' },
  { label: 'Schedule', sortKey: 'time' },
  { label: 'Client Ledger', sortKey: 'patient' },
  { label: 'Pickup', sortKey: 'pickup' },
  { label: 'Dropoff', sortKey: 'dropoff' },
  { label: 'Assignment', sortKey: 'assignment' },
  { label: 'Status', sortKey: 'status' },
  { label: 'Reply', sortKey: 'reply' },
  { label: 'Actions' },
];

const timeToMinutes = (t) => {
  if (!t) return 1440;
  const cleanTime = String(t).toUpperCase().trim();
  if (cleanTime === 'WILL CALL' || cleanTime === 'WC') return 1440;
  const m = cleanTime.match(/(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?/);
  if (!m) return 1440;
  let h = parseInt(m[1], 10);
  let min = parseInt(m[2] || '0', 10);
  const p = m[3];
  if (p === 'PM' && h < 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  return h * 60 + min;
};

const isTripLate = (tripTime) => {
  if (!tripTime || tripTime === 'Will Call') return false;
  const now = new Date();
  const timeVal = timeToMinutes(tripTime);
  const scheduled = new Date();
  scheduled.setHours(Math.floor(timeVal / 60), timeVal % 60, 0, 0);
  return now > scheduled;
};

const to12hr = (time) => {
  if (!time || time === 'Will Call') return 'WC';
  if (typeof time === 'string' && (time.includes('T') || /^\d{4}-/.test(time))) {
    const d = new Date(time);
    if (!isNaN(d.getTime())) {
      let h = d.getHours();
      const min = String(d.getMinutes()).padStart(2, '0');
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return `${h}:${min} ${ampm}`;
    }
  }
  const m = time.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);
  if (!m) return time;
  let h = parseInt(m[1]);
  const min = m[2] || '00';
  const p = m[3]?.toUpperCase();
  const ampm = p || (h >= 12 ? 'PM' : 'AM');
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
};

const formatPhoneDisplay = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 ${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return '';
};

const formatActivityTimestamp = (value) => {
  const date = toValidDate(value);
  if (date) {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(date);
  }
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
};

const SYNTHETIC_REFERENCE_PATTERNS = [
  /^BK-\d+-\d+$/i,
  /^TRP-\d+$/i,
  /^TRIP-\d{10,}-\d+$/i,
];

const isSyntheticReference = (value) => {
  const cleanValue = String(value || '').trim();
  if (!cleanValue) return false;
  return SYNTHETIC_REFERENCE_PATTERNS.some((pattern) => pattern.test(cleanValue));
};

const getBookingReference = (trip) => {
  const bookingId = String(trip?.bookingId || '').trim();
  return bookingId && !isSyntheticReference(bookingId) ? bookingId : '';
};

const getClientIdentifier = (trip) => {
  const candidates = [
    trip?.clientId,
    trip?.memberId,
    trip?.patientId,
    trip?.passengerId,
    trip?.customerId,
    trip?.medicaidId,
    trip?.riderId,
  ];
  const found = candidates.find((value) => String(value || '').trim());
  return String(found || '').trim();
};

const getNormalizedStatus = (status) => String(status || '').trim();
const shouldPinToTimeSortBottom = (trip) => {
  const status = getNormalizedStatus(trip?.status).toLowerCase();
  return TIME_SORT_BOTTOM_STATUSES.some((entry) => status === entry.toLowerCase() || status.includes(entry.toLowerCase()));
};
const getPickupFacilityName = (trip) => String(trip?.pickupSiteName || trip?.pickupFacility || trip?.pickupName || '').trim();
const getDropoffFacilityName = (trip) => String(trip?.dropoffSiteName || trip?.dropoffFacility || trip?.dropoffName || '').trim();
const hasDisplayValue = (value) => value !== undefined && value !== null && String(value).trim() !== '';
const formatManifestValue = (value) => {
  if (!hasDisplayValue(value)) return '';
  if (typeof value === 'number' && Number.isFinite(value) && value > 100000000000) {
    return new Date(value).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  }
  const stringValue = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    const date = new Date(`${stringValue}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    }
  }
  return stringValue;
};

const getTripUrgencyLevel = (trip) => {
  if (isTripLate(trip?.time) && !TERMINAL_STATUSES.includes(trip?.status)) return 'late';
  const mins = timeToMinutes(trip?.time);
  const now = new Date();
  const scheduled = new Date();
  scheduled.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  const diff = scheduled - now;
  if (diff < 30 * 60 * 1000 && diff > 0) return 'soon';
  return 'normal';
};

const getStatusPillClass = (status) => {
  if (status === 'Unassigned') return 'bg-rose-100 text-rose-700';
  if (status === 'Assigned') return 'bg-blue-100 text-blue-700';
  if (ACTIVE_PROGRESS_STATUSES.includes(status)) return 'bg-amber-100 text-amber-700';
  if (status === 'Completed') return 'bg-emerald-100 text-emerald-700';
  if (status === 'Cancelled') return 'bg-rose-100 text-rose-700';
  if (status === 'No Show') return 'bg-amber-100 text-amber-700';
  if (status === 'Rerouted') return 'bg-purple-100 text-purple-700';
  return 'bg-slate-100 text-slate-700';
};

const getClampStyle = (lines = 1) => {
  if (lines <= 1) {
    return {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    };
  }
  return {
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: lines,
  };
};

const getManifestDensityProfile = (density) => {
  switch (density) {
    case 'minimal':
      return {
        label: '1 Line',
        lineCount: 1,
        cardPadding: 'p-1.5',
        cardText: 'text-xs',
        cardTitle: 'text-sm',
        cardTime: 'text-xs',
        sectionGrid: 'lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]',
        tableHead: 'px-3 py-1',
        tableCell: 'px-3 py-1',
        tableRowMinHeight: 'min-h-[24px]',
        showPhones: true,
        showNotes: true,
        showRoutes: true,
        showAssignmentMeta: true,
        showExecutiveAccent: false,
        showFacilityNames: false,
        showSecondaryPhones: false,
        showNotesPreview: false,
        showClientDetailBlock: false,
        showStatusMeta: false,
        routeChipLimit: 1,
        noteLines: 1,
      };
    case 'sparse':
      return {
        label: '2 Lines',
        lineCount: 2,
        cardPadding: 'p-2',
        cardText: 'text-xs',
        cardTitle: 'text-sm',
        cardTime: 'text-xs',
        sectionGrid: 'lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]',
        tableHead: 'px-3 py-1',
        tableCell: 'px-3 py-1',
        tableRowMinHeight: 'min-h-[32px]',
        showPhones: true,
        showNotes: true,
        showRoutes: true,
        showAssignmentMeta: true,
        showExecutiveAccent: false,
        showFacilityNames: true,
        showSecondaryPhones: false,
        showNotesPreview: false,
        showClientDetailBlock: false,
        showStatusMeta: true,
        routeChipLimit: 1,
        noteLines: 1,
      };
    case 'dense':
      return {
        label: '3 Lines',
        lineCount: 3,
        cardPadding: 'p-2',
        cardText: 'text-xs',
        cardTitle: 'text-sm',
        cardTime: 'text-xs',
        sectionGrid: 'lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]',
        tableHead: 'px-3 py-1',
        tableCell: 'px-3 py-1',
        tableRowMinHeight: 'min-h-[36px]',
        showPhones: true,
        showNotes: true,
        showRoutes: true,
        showAssignmentMeta: true,
        showExecutiveAccent: false,
        showFacilityNames: true,
        showSecondaryPhones: true,
        showNotesPreview: true,
        showClientDetailBlock: true,
        showStatusMeta: true,
        routeChipLimit: 1,
        noteLines: 1,
      };
    case 'compact':
      return {
        label: '4 Lines',
        lineCount: 4,
        cardPadding: 'p-3',
        cardText: 'text-xs',
        cardTitle: 'text-sm',
        cardTime: 'text-sm',
        sectionGrid: 'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]',
        tableHead: 'px-3 py-1',
        tableCell: 'px-3 py-1',
        tableRowMinHeight: 'min-h-[40px]',
        showPhones: true,
        showNotes: true,
        showRoutes: true,
        showAssignmentMeta: true,
        showExecutiveAccent: false,
        showFacilityNames: true,
        showSecondaryPhones: true,
        showNotesPreview: true,
        showClientDetailBlock: true,
        showStatusMeta: true,
        routeChipLimit: 2,
        noteLines: 2,
      };
    case 'detailed':
      return {
        label: '6 Lines',
        lineCount: 6,
        cardPadding: 'p-4',
        cardText: 'text-sm',
        cardTitle: 'text-sm',
        cardTime: 'text-sm',
        sectionGrid: 'lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]',
        tableHead: 'px-3 py-1',
        tableCell: 'px-3 py-1',
        tableRowMinHeight: 'min-h-[44px]',
        showPhones: true,
        showNotes: true,
        showRoutes: true,
        showAssignmentMeta: true,
        showExecutiveAccent: true,
        showFacilityNames: true,
        showSecondaryPhones: true,
        showNotesPreview: true,
        showClientDetailBlock: true,
        showStatusMeta: true,
        routeChipLimit: 3,
        noteLines: 3,
      };
    case 'executive':
      return {
        label: 'Full',
        lineCount: 8,
        cardPadding: 'p-5',
        cardText: 'text-sm',
        cardTitle: 'text-sm',
        cardTime: 'text-base',
        sectionGrid: 'lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]',
        tableHead: 'px-3 py-1',
        tableCell: 'px-3 py-1',
        tableRowMinHeight: 'min-h-[48px]',
        showPhones: true,
        showNotes: true,
        showRoutes: true,
        showAssignmentMeta: true,
        showExecutiveAccent: true,
        showFacilityNames: true,
        showSecondaryPhones: true,
        showNotesPreview: true,
        showClientDetailBlock: true,
        showStatusMeta: true,
        routeChipLimit: 4,
        noteLines: 5,
      };
    case 'comfortable':
    default:
      return {
        label: '5 Lines',
        lineCount: 5,
        cardPadding: 'p-4',
        cardText: 'text-xs',
        cardTitle: 'text-sm',
        cardTime: 'text-sm',
        sectionGrid: 'lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]',
        tableHead: 'px-3 py-1',
        tableCell: 'px-3 py-1',
        tableRowMinHeight: 'min-h-[40px]',
        showPhones: true,
        showNotes: true,
        showRoutes: true,
        showAssignmentMeta: true,
        showExecutiveAccent: false,
        showFacilityNames: true,
        showSecondaryPhones: true,
        showNotesPreview: true,
        showClientDetailBlock: true,
        showStatusMeta: true,
        routeChipLimit: 2,
        noteLines: 2,
      };
  }
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const formatControlBarTime = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
};

const OperationsCommandCenter = ({
  role, currentUser, trips, drivers, dispatchers,
  selectedTasks, setSelectedTasks, searchQuery, setSearchQuery,
  operationsTab, setOperationsTab,
  smartAssignTrip, setSmartAssignTrip, manualAssignTrip, setManualAssignTrip,
  smartAssignResult, setSmartAssignResult, aiAnalyzing, setAiAnalyzing,
  addToast, addAuditLog, persistState, hasPermission, requestAuthAction,
  triggerSmartAssign, triggerFleetOptimization, assignTripToDriver,
  bulkAssignTrips, setBulkAssignModal, requestDeleteTrip, requestBulkDelete, updateTrip,
  makeCall, sendSMS, setTripDetails, setShowAddTripModal, setShowUploadModal, onOpenSequencer,
  onOpenLiveMap, showRightPanel, onTogglePanel,
  phoneNumbers,
  logs = []
}) => {
  const [filterStatus, setFilterStatus] = useState(() => localStorage.getItem('agape_opsFilterStatus') || 'all');
  const [filterUrgency, setFilterUrgency] = useState(() => localStorage.getItem('agape_opsFilterUrgency') || 'all');
  const [filterInOut, setFilterInOut] = useState(() => localStorage.getItem('agape_opsFilterInOut') || 'all');
  const [sortBy, setSortBy] = useState(() => localStorage.getItem('agape_opsSortBy') || 'time');
  const [sortDirection, setSortDirection] = useState(() => localStorage.getItem('agape_opsSortDirection') || 'asc');
  const [timeSortBottomInactive, setTimeSortBottomInactive] = useState(() => localStorage.getItem('agape_opsTimeSortBottomInactive') !== 'false');
  const [driverFilter, setDriverFilter] = useState(() => localStorage.getItem('agape_opsDriverFilter') || 'all');
  const [serviceFilter, setServiceFilter] = useState(() => localStorage.getItem('agape_opsServiceFilter') || 'all');
  const [manifestLimit, setManifestLimit] = useState(() => Number(localStorage.getItem('agape_opsManifestLimit') || 150));
  const [fleetLimit, setFleetLimit] = useState(() => Number(localStorage.getItem('agape_opsFleetLimit') || 60));
  const [expandedDriver, setExpandedDriver] = useState(() => localStorage.getItem('agape_opsExpandedDriver') || null);
  const [manifestView, setManifestView] = useState(() => localStorage.getItem('agape_opsManifestView') || 'board');
  const [manifestGroupBy, setManifestGroupBy] = useState(() => localStorage.getItem('agape_opsManifestGroupBy') || 'driver');
  const [manifestDensity, setManifestDensity] = useState(() => 'minimal');
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [smsConversationTrip, setSmsConversationTrip] = useState(null);
  const openSmsForTrip = (trip) => { setSelectedTasks([trip.id]); setShowSmsModal(true); };
  const [showOnlyAttention, setShowOnlyAttention] = useState(() => localStorage.getItem('agape_opsShowOnlyAttention') === 'true');
  const [routeTemplates, setRouteTemplates] = useState([]);
  const [showIntelligence, setShowIntelligence] = useState(() => localStorage.getItem('agape_opsShowIntelligence') !== 'false');
  const [expandedTripIds, setExpandedTripIds] = useState([]);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [lastIntelRefresh, setLastIntelRefresh] = useState(() => new Date().toISOString());
  const [aiSortOrder, setAiSortOrder] = useState(null);
  const [aiSortLoading, setAiSortLoading] = useState(false);
  const [editingTripId, setEditingTripId] = useState(null);
  const [editingTripData, setEditingTripData] = useState(null);
  const [inlineEditSaving, setInlineEditSaving] = useState(false);
  const [inlineEditError, setInlineEditError] = useState('');
  const [sortKeyOverrides, setSortKeyOverrides] = useState({});
  const [activeTripRow, setActiveTripRow] = useState(null);
  const [actionsMenuTripId, setActionsMenuTripId] = useState(null);
  const actionsMenuRef = useRef(null);
  const [boardActionsMenuTripId, setBoardActionsMenuTripId] = useState(null);
  const boardActionsMenuRef = useRef(null);

  useEffect(() => {
    if (!editingTripId && Object.keys(sortKeyOverrides).length > 0) {
      const timer = setTimeout(() => setSortKeyOverrides({}), 1500);
      return () => clearTimeout(timer);
    }
  }, [editingTripId]);

  const FACILITY_KEYWORDS_OPS = [
    'center', 'centre', 'clinic', 'hospital', 'care', 'treatment',
    'medical', 'health', 'therapy', 'academy', 'school', 'facility',
    'llc', 'inc', 'llp', 'corp', 'ltd', 'pharmacy', 'pharm',
    'dialysis', 'rehab', 'rehabilitation', 'mental health',
    'behavioral', 'paediatric', 'pediatric', 'dental', 'lab',
    'imaging', 'radiology', 'urgent care', 'er ', 'emergency',
    'surgery', 'surgical', 'ortho', 'cardio', 'neuro',
  ];
  const isFacility = (name) => {
    const lower = (name || '').toLowerCase().trim();
    if (!lower) return false;
    return FACILITY_KEYWORDS_OPS.some(kw => lower.includes(kw));
  };
  const getClientPhone = (trip) => {
    if (trip.patientPhone) return trip.patientPhone;
    const puPhone = trip.pickupPhone || '';
    const doPhone = trip.dropoffPhone || '';
    if (!puPhone && !doPhone) return '';
    const hp = (trip.hospitalPhone || '').replace(/[^0-9]/g, '');
    const puClean = puPhone.replace(/[^0-9]/g, '');
    const doClean = doPhone.replace(/[^0-9]/g, '');
    if (hp && puClean && puClean === hp && doPhone && doClean !== hp) return doPhone;
    if (hp && doClean && doClean === hp && puPhone && puClean !== hp) return puPhone;
    const puIsFacility = isFacility(trip.pickupSiteName || '') || isFacility(trip.pickup || '');
    const doIsFacility = isFacility(trip.dropoffSiteName || '') || isFacility(trip.dropoff || '');
    if (puIsFacility && !doIsFacility) return doPhone;
    if (doIsFacility && !puIsFacility) return puPhone;
    return puPhone || doPhone;
  };

  const [selectedDate, setSelectedDate] = useState(() => localCalendarYmd());
  const shiftDate = (days) => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setSelectedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  };
  const isToday = selectedDate === localCalendarYmd();
  const formatDateLabel = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };
  const todayTrips = useMemo(
    () => scopeOperationsTripsByDate(trips, selectedDate).scopedTrips,
    [trips, selectedDate],
  );
  const unassignedTrips = useMemo(() => todayTrips.filter(t => t.status === 'Unassigned'), [todayTrips]);
  const inProgressTrips = useMemo(() => todayTrips.filter(t => ACTIVE_PROGRESS_STATUSES.includes(t.status)), [todayTrips]);
  const completedToday = useMemo(() => todayTrips.filter(t => t.status === 'Completed'), [todayTrips]);
  const lateTrips = useMemo(() => todayTrips.filter(t => isTripLate(t.time) && !TERMINAL_STATUSES.includes(t.status)), [todayTrips]);
  const willCallTrips = useMemo(() => todayTrips.filter(t => t.time === 'Will Call'), [todayTrips]);
  useEffect(() => {
    if (sortBy !== 'ai') { setAiSortOrder(null); return; }
    const filtered = inProgressTrips.filter(t => !TERMINAL_STATUSES.includes(t.status)).slice(0, 100);
    if (filtered.length === 0) return;
    let cancelled = false;
    setAiSortLoading(true);
    aiPrioritizeTrips(filtered).then(order => { if (!cancelled) { setAiSortOrder(order); setAiSortLoading(false); } }).catch(() => { if (!cancelled) setAiSortLoading(false); });
    return () => { cancelled = true; };
  }, [sortBy, inProgressTrips.length]);
  const densityProfile = useMemo(() => getManifestDensityProfile(manifestDensity), [manifestDensity]);
  const isLeanDensity = densityProfile.lineCount <= 3;
  const isReportDensity = densityProfile.lineCount === 1;

  useEffect(() => {
    localStorage.setItem('agape_opsFilterStatus', filterStatus);
    localStorage.setItem('agape_opsFilterUrgency', filterUrgency);
    localStorage.setItem('agape_opsSortBy', sortBy);
    localStorage.setItem('agape_opsSortDirection', sortDirection);
    localStorage.setItem('agape_opsTimeSortBottomInactive', String(timeSortBottomInactive));
    localStorage.setItem('agape_opsDriverFilter', driverFilter);
    localStorage.setItem('agape_opsServiceFilter', serviceFilter);
    localStorage.setItem('agape_opsManifestLimit', String(manifestLimit));
    localStorage.setItem('agape_opsFleetLimit', String(fleetLimit));
    localStorage.setItem('agape_opsManifestView', manifestView);
    localStorage.setItem('agape_opsManifestGroupBy', manifestGroupBy);
    localStorage.setItem('agape_opsManifestDensity', manifestDensity);
    localStorage.setItem('agape_opsShowOnlyAttention', String(showOnlyAttention));
    localStorage.setItem('agape_opsShowIntelligence', String(showIntelligence));
    if (expandedDriver) {
      localStorage.setItem('agape_opsExpandedDriver', expandedDriver);
    } else {
      localStorage.removeItem('agape_opsExpandedDriver');
    }
  }, [filterStatus, filterUrgency, sortBy, sortDirection, timeSortBottomInactive, driverFilter, serviceFilter, manifestLimit, fleetLimit, expandedDriver, showIntelligence, manifestView, manifestGroupBy, manifestDensity, showOnlyAttention]);
  const driverById = useMemo(() => new Map(drivers.map((driver) => [driver.id, driver])), [drivers]);
  const { activeTripCountByDriver, activeTripsByDriver } = useMemo(() => {
    const activeTripCountByDriver = new Map();
    const activeTripsByDriver = new Map();
    inProgressTrips.forEach((trip) => {
      if (!trip.driverId) return;
      activeTripCountByDriver.set(trip.driverId, (activeTripCountByDriver.get(trip.driverId) || 0) + 1);
      const assigned = activeTripsByDriver.get(trip.driverId) || [];
      assigned.push(trip);
      activeTripsByDriver.set(trip.driverId, assigned);
    });
    return { activeTripCountByDriver, activeTripsByDriver };
  }, [inProgressTrips]);
  const availableDrivers = useMemo(() => drivers.filter(d => d.status === 'Available'), [drivers]);
  const busyDrivers = useMemo(() => drivers.filter(d => d.status !== 'Available'), [drivers]);
  const driverOptions = useMemo(
    () => [...drivers].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [drivers]
  );
  const fleetDrivers = useMemo(() => {
    const sorted = [...drivers].sort((a, b) => {
      const aTrips = activeTripCountByDriver.get(a.id) || 0;
      const bTrips = activeTripCountByDriver.get(b.id) || 0;
      if (bTrips !== aTrips) return bTrips - aTrips;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    if (driverFilter !== 'all' && driverFilter !== 'unassigned') {
      return sorted.filter((driver) => driver.id === driverFilter);
    }
    return sorted;
  }, [activeTripCountByDriver, driverFilter, drivers]);
  const serviceOptions = useMemo(
    () => [...new Set(todayTrips.map((trip) => trip.type || trip.serviceType).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b))),
    [todayTrips]
  );
  const handleSortSelect = useCallback((nextSortBy) => {
    setSortBy(nextSortBy);
    setSortDirection('asc');
  }, []);
  const handleColumnSort = useCallback((nextSortBy) => {
    if (!nextSortBy) return;
    setSortBy((currentSortBy) => {
      if (currentSortBy === nextSortBy) {
        setSortDirection((currentDirection) => currentDirection === 'asc' ? 'desc' : 'asc');
        return currentSortBy;
      }
      setSortDirection('asc');
      return nextSortBy;
    });
  }, []);

  const searchedTrips = useMemo(() => searchQuery
    ? todayTrips.filter(t => tripMatchesSearch(t, searchQuery, [
        driverById.get(t.driverId)?.phone,
      ]))
    : todayTrips, [driverById, searchQuery, todayTrips]);

  const routeTripMap = useMemo(() => {
    const map = {};
    routeTemplates.forEach(template => {
      (template.sequence || []).forEach(stop => {
        if (!stop?.clientId) return;
      map[stop.clientId] = map[stop.clientId] || [];
      map[stop.clientId].push({
        routeName: template.name || 'Route Sequence',
        assignedDriver: template.assignedDriver || null,
        type: stop.type,
        templateId: template.id,
        time: stop.time || '',
        statusLabel: template.statusLabel || 'Assigned Today',
      });
      });
    });
    return map;
  }, [routeTemplates]);

  const filteredTrips = useMemo(() => {
    let baseTrips = operationsTab === 'willcall' ? searchedTrips.filter(t => t.time === 'Will Call') : searchedTrips.filter(t => t.time !== 'Will Call');

    let result = [...baseTrips];

    if (filterStatus === 'in-progress') {
      result = result.filter(t => ACTIVE_PROGRESS_STATUSES.includes(t.status));
    } else if (filterStatus !== 'all') {
      result = result.filter(t => t.status === filterStatus);
    }

    if (filterUrgency === 'late') result = result.filter(t => isTripLate(t.time) && !TERMINAL_STATUSES.includes(t.status));
    if (filterUrgency === 'upcoming') result = result.filter(t => {
      const mins = timeToMinutes(t.time);
      const now = new Date();
      const scheduled = new Date();
      scheduled.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
      return scheduled > now && (scheduled - now) < 60 * 60 * 1000;
    });
    if (driverFilter === 'unassigned') {
      result = result.filter(t => !t.driverId);
    } else if (driverFilter !== 'all') {
      result = result.filter(t => t.driverId === driverFilter);
    }
    if (serviceFilter !== 'all') {
      result = result.filter(t => (t.type || t.serviceType || '') === serviceFilter);
    }
    if (filterInOut === 'inout') {
      result = result.filter(t => isInOutTrip(t));
    } else if (filterInOut === 'not-inout') {
      result = result.filter(t => !isInOutTrip(t));
    }
    const originalOrder = new Map(result.map((trip, index) => [trip.id, index]));
    const driverNameForTrip = (trip) => {
      const driver = driverById.get(trip.driverId);
      return String(driver?.name || trip.driverName || (trip.driverId ? 'Assigned Driver' : 'Awaiting assignment')).toLowerCase();
    };
    const compareText = (left, right) => String(left || '').localeCompare(String(right || ''), undefined, { numeric: true, sensitivity: 'base' });
    const compareTripId = (a, b) => compareText(a.bookingId || a.id || '', b.bookingId || b.id || '');
    const compareTimeThenClient = (a, b) => {
      const timeDiff = timeToMinutes(a.time) - timeToMinutes(b.time);
      if (timeDiff !== 0) return timeDiff;
      const patientDiff = compareText(a.patient, b.patient);
      if (patientDiff !== 0) return patientDiff;
      return compareTripId(a, b);
    };
    const getSortValue = (trip) => {
      if (sortBy === 'patient') return `${trip.patient || ''} ${getClientIdentifier(trip) || ''} ${getBookingReference(trip) || ''}`;
      if (sortBy === 'pickup') return `${trip.pickup || ''} ${getPickupFacilityName(trip) || ''}`;
      if (sortBy === 'dropoff') return `${trip.dropoff || ''} ${getDropoffFacilityName(trip) || ''}`;
      if (sortBy === 'assignment') return driverNameForTrip(trip);
      if (sortBy === 'status') return `${trip.status || ''}`;
      if (sortBy === 'tripId') return `${trip.bookingId || trip.id || ''}`;
      return '';
    };
    result.sort((a, b) => {
      const aKey = sortKeyOverrides[a.id];
      const bKey = sortKeyOverrides[b.id];
      if (aKey !== undefined || bKey !== undefined) {
        if (aKey !== undefined && bKey !== undefined) return String(aKey).localeCompare(String(bKey));
        return aKey !== undefined ? -1 : 1;
      }
      if (sortBy === 'time' && timeSortBottomInactive) {
        const inactiveDiff = Number(shouldPinToTimeSortBottom(a)) - Number(shouldPinToTimeSortBottom(b));
        if (inactiveDiff !== 0) return inactiveDiff;
      }
      if (sortBy === 'urgency') {
        const urgencyScore = (trip) => {
          const urgency = getTripUrgencyLevel(trip);
          if (urgency === 'late') return 0;
          if (urgency === 'soon') return 1;
          if (trip.status === 'Unassigned') return 2;
          return 3;
        };
        const urgencyDiff = urgencyScore(a) - urgencyScore(b);
        if (urgencyDiff !== 0) return urgencyDiff;
        return timeToMinutes(a.time) - timeToMinutes(b.time);
      }
      if (sortBy === 'time') {
        const diff = compareTimeThenClient(a, b);
        if (diff !== 0) return sortDirection === 'desc' ? -diff : diff;
      }
      if (['patient', 'pickup', 'dropoff', 'assignment', 'status', 'tripId'].includes(sortBy)) {
        const diff = compareText(getSortValue(a), getSortValue(b));
        if (diff !== 0) return sortDirection === 'desc' ? -diff : diff;
        return compareTimeThenClient(a, b);
      }
      if (sortBy === 'reply') {
        const order = { confirmed: 0, not_coming: 2 };
        const sa = a.clientConfirmation ? (order[a.clientConfirmation] ?? 1) : 1;
        const sb = b.clientConfirmation ? (order[b.clientConfirmation] ?? 1) : 1;
        const diff = sa - sb;
        if (diff !== 0) return sortDirection === 'desc' ? -diff : diff;
        return compareTimeThenClient(a, b);
      }
      if (sortBy === 'vehicle') {
        const aVehicle = String(driverById.get(a.driverId)?.vehicle || a.driverName || '').toLowerCase();
        const bVehicle = String(driverById.get(b.driverId)?.vehicle || b.driverName || '').toLowerCase();
        const diff = compareText(aVehicle, bVehicle);
        if (diff !== 0) return sortDirection === 'desc' ? -diff : diff;
        return compareTimeThenClient(a, b);
      }
      if (sortBy === 'distance') {
        const aDist = Number(a.directDistance) || 0;
        const bDist = Number(b.directDistance) || 0;
        const diff = aDist - bDist;
        if (diff !== 0) return sortDirection === 'desc' ? -diff : diff;
        return compareTimeThenClient(a, b);
      }
      if (sortBy === 'trips') {
        const aTrips = (routeTripMap[a.id] || []).length;
        const bTrips = (routeTripMap[b.id] || []).length;
        const diff = aTrips - bTrips;
        if (diff !== 0) return sortDirection === 'desc' ? -diff : diff;
        return compareTimeThenClient(a, b);
      }
      if (sortBy === 'ai' && aiSortOrder) {
        const ia = aiSortOrder.indexOf(a.id);
        const ib = aiSortOrder.indexOf(b.id);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      }
      return (originalOrder.get(a.id) || 0) - (originalOrder.get(b.id) || 0);
    });
    return result;
  }, [searchedTrips, filterStatus, filterUrgency, driverFilter, serviceFilter, sortBy, sortDirection, timeSortBottomInactive, operationsTab, aiSortOrder, driverById, routeTripMap, sortKeyOverrides]);

  useEffect(() => {
    setManifestLimit(150);
  }, [searchQuery, operationsTab, filterStatus, filterUrgency, driverFilter, serviceFilter, sortBy, sortDirection, timeSortBottomInactive, showOnlyAttention]);

  useEffect(() => {
    setFleetLimit(60);
  }, [driverFilter, operationsTab]);

  const getDriverTrips = (driverId) => {
    return activeTripsByDriver.get(driverId) || [];
  };

  useEffect(() => {
    let cancelled = false;
    const refreshRoutes = async () => {
      try {
        const snap = await getDocFromServer(doc(db, 'routeData', 'sequences'));
        if (cancelled) return;
      if (snap.exists()) {
        const templates = snap.data().templates || [];
        setRouteTemplates(getOperationalRoutes(templates));
      } else {
        setRouteTemplates([]);
      }
      } catch (err) {
        if (!cancelled) console.error('Route sequence refresh failed:', err);
      }
    };
    refreshRoutes();
    const timer = setInterval(refreshRoutes, 15000);
    window.addEventListener('online', refreshRoutes);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('online', refreshRoutes);
    };
  }, []);

  useEffect(() => {
    if (!actionsMenuTripId) return;
    const handleClickOutside = (e) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target)) {
        setActionsMenuTripId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [actionsMenuTripId]);

  useEffect(() => {
    if (!boardActionsMenuTripId) return;
    const handleClickOutside = (e) => {
      if (boardActionsMenuRef.current && !boardActionsMenuRef.current.contains(e.target)) {
        setBoardActionsMenuTripId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [boardActionsMenuTripId]);

  const openTripDetails = (trip) => {
    setTripDetails(null);
    setExpandedTripIds((prev) => (
      prev.includes(trip.id)
        ? prev.filter((id) => id !== trip.id)
        : [...prev, trip.id]
    ));
  };

  const isTripExpanded = useCallback((tripId) => expandedTripIds.includes(tripId), [expandedTripIds]);

  const toggleTripExpanded = useCallback((tripId) => {
    setExpandedTripIds((prev) => (
      prev.includes(tripId)
        ? prev.filter((id) => id !== tripId)
        : [...prev, tripId]
    ));
  }, []);

  const getTripDriver = useCallback((trip) => (
    drivers.find((driver) => (
      driver.id === trip?.driverId ||
      driver.email === trip?.driverEmail ||
      (trip?.driverName && driver.name === trip.driverName)
    ))
  ), [drivers]);

  const applyTripStatusWithAudit = useCallback((trip, status, extraFields = {}, auditTitle = 'Trip Updated') => {
    if (!trip?.id || !updateTrip) return;
    const nowIso = new Date().toISOString();
    const driver = getTripDriver(trip);
    const updates = {
      status,
      workflowUpdatedAt: nowIso,
      updatedBy: currentUser,
      ...extraFields,
    };
    if (driver) {
      updates.driverId = trip.driverId || driver.id;
      updates.driverName = trip.driverName || driver.name;
      updates.driverEmail = trip.driverEmail || driver.email || null;
    }
    updateTrip(trip.id, updates);
    const diffs = Object.entries(updates)
      .filter(([field, value]) => String(trip?.[field] ?? '') !== String(value ?? ''))
      .map(([field, value]) => ({ field, before: trip?.[field], after: value }));
    addAuditLog?.(
      auditTitle,
      `${currentUser || 'Dispatcher'} updated ${trip.patient || trip.id} to ${status}.`,
      status === 'Completed' ? 'emerald' : status === 'Cancelled' || status === 'No Show' ? 'rose' : 'blue',
      {
        entity: 'trip',
        id: trip.id,
        diffs,
        summary: diffs.map((diff) => `${diff.field}: ${diff.before ?? '--'} -> ${diff.after ?? '--'}`).join('; '),
      }
    );
    addToast?.(auditTitle, `${trip.patient || 'Trip'} is now ${status}.`, status === 'Cancelled' || status === 'No Show' ? 'warning' : 'success');
  }, [addAuditLog, addToast, currentUser, getTripDriver, updateTrip]);

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

  const startInlineEdit = useCallback((trip) => {
    const original = trips.find(t => t.id === trip.id) || trip;
    setEditingTripId(original.id);
    setEditingTripData({
      patient: original.patient || '',
      bookingId: original.bookingId || '',
      date: original.date || '',
      time: original.time || '',
      type: original.type || '',
      status: original.status || 'Assigned',
      driverId: original.driverId || '',
      pickup: original.pickup || original.pickupAddress || '',
      dropoff: original.dropoff || original.dropoffAddress || '',
      pickupPhone: original.pickupPhone || '',
      dropoffPhone: original.dropoffPhone || '',
      distance: original.distance || '',
      _pickupTime: isoToTimeInput(original.arrivalTime || original.startTime || original.pickupArrival || original.departedPickupTime),
      _pickupOdometer: original.pickupOdometer || '',
      _dropoffTime: isoToTimeInput(original.arrivalDropoffTime || original.dropoffArrival || original.dropoffTime),
      _dropoffOdometer: original.dropoffOdometer || '',
      notes: original.notes || '',
    });
    setInlineEditError('');
    setSortKeyOverrides(prev => {
      const next = {};
      next[original.id] = original.time || '';
      return next;
    });
  }, [trips]);

  const cancelInlineEdit = useCallback(() => {
    setEditingTripId(null);
    setEditingTripData(null);
    setSortKeyOverrides({});
    setInlineEditError('');
  }, []);

  const saveInlineEdit = useCallback(async () => {
    if (!editingTripId || !editingTripData || inlineEditSaving) return;
    const d = editingTripData;
    const serviceDate = d.date;
    const pickupIso = timeToIsoForTripDate(d._pickupTime, serviceDate);
    const dropoffIso = timeToIsoForTripDate(d._dropoffTime, serviceDate);
    const original = trips.find(t => t.id === editingTripId) || {};
    const payload = {
      patient: d.patient || '',
      bookingId: d.bookingId || '',
      date: serviceDate || '',
      time: d.time || '',
      type: d.type || '',
      status: d.status || original.status || 'Assigned',
      driverId: d.driverId || '',
      pickup: d.pickup || '',
      dropoff: d.dropoff || '',
      pickupPhone: d.pickupPhone || '',
      dropoffPhone: d.dropoffPhone || '',
      distance: d.distance || '',
      arrivalTime: pickupIso || original.arrivalTime || null,
      startTime: pickupIso || original.startTime || null,
      pickupOdometer: parseOdometerInput(d._pickupOdometer),
      departedPickupTime: pickupIso || original.departedPickupTime || null,
      arrivalDropoffTime: dropoffIso || original.arrivalDropoffTime || null,
      dropoffOdometer: parseOdometerInput(d._dropoffOdometer),
      notes: d.notes || '',
    };
    setInlineEditSaving(true);
    setInlineEditError('');
    try {
      const saved = await Promise.resolve(updateTrip?.(editingTripId, payload));
      if (saved === false) throw new Error('The trip update was rejected.');
      setEditingTripId(null);
      setEditingTripData(null);
      setSortKeyOverrides(prev => ({ ...prev, [editingTripId]: d.time || prev[editingTripId] || '' }));
      addToast?.('Trip Updated', `${d.patient || editingTripId} saved.`, 'success');
    } catch (error) {
      setInlineEditError(error?.message || 'Trip was not saved.');
      addToast?.('Trip Not Saved', error?.message || 'The update failed.', 'danger');
    } finally {
      setInlineEditSaving(false);
    }
  }, [editingTripId, editingTripData, trips, updateTrip, addToast, inlineEditSaving]);

  const markTripException = useCallback((trip, status) => {
    const run = () => applyTripStatusWithAudit(trip, status, {
      exceptionAt: new Date().toISOString(),
      exceptionBy: currentUser,
      exceptionSource: role,
    }, `Marked ${status}`);
    if (requestAuthAction && ['Cancelled', 'No Show', 'Rerouted'].includes(status)) {
      requestAuthAction(`Mark ${trip.patient || 'trip'} as ${status}`, run);
      return;
    }
    run();
  }, [applyTripStatusWithAudit, currentUser, requestAuthAction, role]);

  const applyDriverWorkStep = useCallback((trip, step) => {
    const driver = getTripDriver(trip);
    if (!driver) {
      setManualAssignTrip(trip);
      return;
    }
    const nowIso = new Date().toISOString();
    const base = {
      driverId: trip.driverId || driver.id,
      driverName: trip.driverName || driver.name,
      driverEmail: trip.driverEmail || driver.email || null,
      driverWorkUpdatedBy: currentUser,
      driverWorkUpdatedByRole: role,
    };
    const stepConfig = {
      start: {
        status: 'Navigating Pickup',
        title: 'Driver Work Started',
        fields: { ...base, startedAt: trip.startedAt || nowIso },
      },
      pickup: {
        status: 'At Pickup',
        title: 'Pickup Reached',
        fields: { ...base, arrivalTime: trip.arrivalTime || nowIso },
      },
      transport: {
        status: 'In Transit',
        title: 'Transport Started',
        fields: { ...base, departedPickupTime: trip.departedPickupTime || nowIso },
      },
      dropoff: {
        status: 'At Dropoff',
        title: 'Dropoff Reached',
        fields: { ...base, arrivalDropoffTime: trip.arrivalDropoffTime || nowIso },
      },
      complete: {
        status: 'Completed',
        title: 'Trip Completed',
        fields: {
          ...base,
          completedAt: trip.completedAt || nowIso,
          completedBy: currentUser,
          completedVehicle: trip.completedVehicle || driver.vehicle || '',
          dispatcherCompletionOverride: true,
        },
      },
    };
    const config = stepConfig[step];
    if (!config) return;
    const run = () => applyTripStatusWithAudit(trip, config.status, config.fields, config.title);
    if (step === 'complete' && requestAuthAction) {
      requestAuthAction(`Complete driver work for ${trip.patient || 'trip'}`, run);
      return;
    }
    run();
  }, [applyTripStatusWithAudit, currentUser, getTripDriver, requestAuthAction, role, setManualAssignTrip]);

  const renderExpandedTripDetails = (trip, options = {}) => {
    const { compact = false, embeddedInTable = false } = options;
    const driver = drivers.find((entry) => entry.id === trip.driverId);
    const routeAssignments = routeTripMap[trip.id] || [];
    const bookingReference = getBookingReference(trip);
    const clientIdentifier = getClientIdentifier(trip);
    const clientPhone = formatPhoneDisplay(getClientPhone(trip));
    const pickupPhone = formatPhoneDisplay(trip.pickupPhone);
    const dropoffPhone = formatPhoneDisplay(trip.dropoffPhone);
    const pickupFacilityName = getPickupFacilityName(trip);
    const dropoffFacilityName = getDropoffFacilityName(trip);
    const serviceLabel = trip.type || trip.serviceType || trip.tripType || '';
    const insurer = String(trip.insurance || trip.insuranceProvider || trip.payor || '').trim();
    const medicaidId = String(trip.medicaidId || trip.memberId || '').trim();
    const weight = String(trip.weight || trip.passengerWeight || '').trim();
    const rawRow = trip?._originalRow || {};
    const getRawValue = (...keys) => {
      for (const key of keys) {
        if (hasDisplayValue(rawRow[key])) return rawRow[key];
      }
      return '';
    };
    const requestedPickup = formatManifestValue(getRawValue('Requested Time Pickup')) || trip.time || '';
    const requestedDropoff = formatManifestValue(getRawValue('Requested Time Dropoff')) || trip.dropoffTime || '';
    const requestedLateDropoff = formatManifestValue(getRawValue('Requested Late Dropoff'));
    const pickupComments = formatManifestValue(getRawValue('Pickup Comments'));
    const dropoffComments = formatManifestValue(getRawValue('Dropoff Comments'));
    const generalComments = formatManifestValue(getRawValue('Comments'));
    const manifestMessage = formatManifestValue(getRawValue('Message'));
    const pickupCity = formatManifestValue(getRawValue('City (Orig)'));
    const dropoffCity = formatManifestValue(getRawValue('City (Dest)'));
    const passengerTypes = formatManifestValue(getRawValue('Passenger Types'));
    const spaceTypes = formatManifestValue(getRawValue('Space Types')) || serviceLabel;
    const mobilityAids = formatManifestValue(getRawValue('Mobility Aids'));
    const sharedWith = formatManifestValue(getRawValue('Shared With'));
    const purpose = formatManifestValue(trip.purpose || getRawValue('Purpose'));
    const directDistance = formatManifestValue(trip.directDistance || getRawValue('Direct Distance'));
    const hasNote = hasDisplayValue(getRawValue('Has Note'))
      ? (String(getRawValue('Has Note')).trim() === '1' ? 'Yes' : String(getRawValue('Has Note')).trim() === '0' ? 'No' : formatManifestValue(getRawValue('Has Note')))
      : '';
    const uploadDate = formatManifestValue(getRawValue('Date')) || formatManifestValue(trip.date);
    const mobility = [
      trip.wheelchair && 'Wheelchair',
      trip.bariatric && 'Bariatric',
      trip.oxygen && 'Oxygen',
      trip.stretcher && 'Stretcher',
      trip.behavioral && 'Behavioral',
      trip.escort && 'Escort',
      trip.roundTrip && 'Round Trip',
      trip.returnRide && 'Return Ride',
    ].filter(Boolean);
    const manifestSummaryItems = [
      ['Client', trip.patient || 'Unnamed Client'],
      ['Booking ID', bookingReference],
      ['Client ID', clientIdentifier],
      ['Date', uploadDate],
      ['Requested pickup', requestedPickup],
      ['Requested dropoff', requestedDropoff],
      ['Late dropoff', requestedLateDropoff],
      ['Purpose', purpose],
      ['Passenger types', passengerTypes],
      ['Space types', spaceTypes],
      ['Mobility aids', mobilityAids],
      ['Distance', directDistance],
      ['Insurance', insurer],
      ['Medicaid ID', !clientIdentifier ? medicaidId : ''],
      ['Weight', weight],
      ['Driver', driver?.name || trip.driverName || 'Awaiting assignment'],
      ['Vehicle', driver?.vehicle || trip.completedVehicle || ''],
      ['Shared with', sharedWith],
      ['Has note', hasNote],
    ].filter(([, value]) => hasDisplayValue(value));
    const pickupItems = [
      ['Site', pickupFacilityName],
      ['Address', trip.pickup || 'Missing pickup address'],
      ['City', pickupCity],
      ['Client phone', clientPhone],
      ['Pickup phone', pickupPhone && pickupPhone !== clientPhone ? pickupPhone : ''],
      ['Pickup comments', pickupComments],
    ].filter(([, value]) => hasDisplayValue(value));
    const dropoffItems = [
      ['Site', dropoffFacilityName],
      ['Address', trip.dropoff || 'Missing dropoff address'],
      ['City', dropoffCity],
      ['Hospital phone', trip.hospitalPhone || dropoffPhone],
      ['Dropoff phone', trip.hospitalPhone && dropoffPhone && formatPhoneDisplay(trip.hospitalPhone) !== dropoffPhone ? dropoffPhone : ''],
      ['Dropoff comments', dropoffComments],
    ].filter(([, value]) => hasDisplayValue(value));
    const noteItems = [
      ['Manifest comments', generalComments],
      ['Message', manifestMessage],
      ['System notes', trip.notes || trip.specialInstructions || trip.comment || ''],
    ].filter(([, value]) => hasDisplayValue(value));
    const surfacedRawKeys = new Set([
      'Booking Id',
      'Client Name',
      'Requested Time Pickup',
      'Phone Pickup',
      'Pickup Comments',
      'Requested Time Dropoff',
      'Dropoff Comments',
      'Phone Dropoff',
      'Requested Late Dropoff',
      'Site Name(orig)',
      'Origin',
      'City (Orig)',
      'Site Name(dest)',
      'Destination',
      'City (Dest)',
      'Comments',
      'Direct Distance',
      'Passenger Types',
      'Space Types',
      'Mobility Aids',
      'Message',
      'Has Note',
      'Date',
      'Purpose',
      'Shared With',
      'Unnamed: 1',
    ]);
    const extraUploadedFields = Object.entries(rawRow)
      .filter(([key, value]) => !surfacedRawKeys.has(key) && !String(key || '').startsWith('Unnamed:') && hasDisplayValue(value))
      .map(([key, value]) => [key, formatManifestValue(value)]);

    return (
      <div className="w-full border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-sm space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-sm text-slate-700">{to12hr(trip.time)}</span>
            <span className={`rounded-full px-2 py-0.5 text-sm ${getStatusPillClass(trip.status)}`}>{trip.status}</span>
            {bookingReference && <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-sm text-blue-700">{bookingReference}</span>}
            {clientIdentifier && <span className="rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-sm text-violet-700">{clientIdentifier}</span>}
            {spaceTypes && <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-sm text-slate-600">{spaceTypes}</span>}
            {driver && <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-sm text-emerald-700">{driver.name || driver.driverName}</span>}
            {directDistance && <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-sm text-slate-600">{directDistance}</span>}
            {routeAssignments.map((route, i) => <span key={i} className="rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-sm text-indigo-700">{route.routeName}</span>)}
          </div>
          <button type="button" onClick={() => toggleTripExpanded(trip.id)} className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-slate-500 hover:bg-slate-100 text-xs">Collapse</button>
        </div>

        <div className="grid grid-cols-3 gap-x-6 text-sm leading-relaxed">
          <div className="min-w-0">
            <span className="font-semibold text-blue-600">Pickup: </span>
            <span className="text-slate-800 truncate">{trip.pickup || '—'}</span>
            {clientPhone && <><br /><span className="text-slate-500">Phone: </span><span className="text-slate-700">{clientPhone}</span></>}
            {(trip.arrivalTime || trip.pickupTime) && <><br /><span className="text-slate-500">PU time: </span><span className="text-slate-700">{to12hr(trip.arrivalTime || trip.pickupTime)}</span></>}
            {trip.pickupOdometer && <><br /><span className="text-slate-500">PU odo: </span><span className="text-slate-700">{trip.pickupOdometer}</span></>}
          </div>
          <div className="min-w-0">
            <span className="font-semibold text-emerald-600">Dropoff: </span>
            <span className="text-slate-800 truncate">{trip.dropoff || '—'}</span>
            {(trip.hospitalPhone || dropoffPhone) && <><br /><span className="text-slate-500">Hospital: </span><span className="text-slate-700">{formatPhoneDisplay(trip.hospitalPhone || dropoffPhone)}</span></>}
            {(trip.arrivalDropoffTime || trip.completedAt) && <><br /><span className="text-slate-500">DO time: </span><span className="text-slate-700">{to12hr(trip.arrivalDropoffTime || trip.completedAt)}</span></>}
            {(trip.dropoffOdometer || trip.endOdometer) && <><br /><span className="text-slate-500">DO odo: </span><span className="text-slate-700">{trip.dropoffOdometer || trip.endOdometer}</span></>}
          </div>
          <div className="min-w-0 space-y-0.5">
            {trip.patient && <div><span className="text-slate-500">Client: </span><span className="text-slate-800 font-medium">{trip.patient}</span></div>}
            {requestedPickup && <div><span className="text-slate-500">Req pickup: </span><span className="text-slate-700">{requestedPickup}</span></div>}
            {requestedDropoff && <div><span className="text-slate-500">Req dropoff: </span><span className="text-slate-700">{requestedDropoff}</span></div>}
            {mobility.length > 0 && <div><span className="text-slate-500">Mobility: </span><span className="text-slate-700">{mobility.join(', ')}</span></div>}
          </div>
        </div>

        {(generalComments || manifestMessage || trip.notes || trip.specialInstructions || trip.comment) && (
          <div className="text-sm truncate max-w-full">
            <span className="font-semibold text-amber-600">Notes: </span>
            <span className="text-slate-600">{generalComments || manifestMessage || trip.notes || trip.specialInstructions || trip.comment}</span>
          </div>
        )}
      </div>
    );
  };

  const manifestFeedTrips = useMemo(() => {
    if (!showOnlyAttention) return filteredTrips;
    return filteredTrips.filter((trip) => {
      const urgency = getTripUrgencyLevel(trip);
      return trip.status === 'Unassigned' || trip.status === 'Cancelled' || trip.status === 'No Show' || trip.status === 'Rerouted' || urgency === 'late' || urgency === 'soon';
    });
  }, [filteredTrips, showOnlyAttention]);

  const visibleTrips = useMemo(() => manifestFeedTrips.slice(0, manifestLimit), [manifestFeedTrips, manifestLimit]);
  const intelligenceScore = useMemo(() => {
    const lateCount = visibleTrips.filter((trip) => getTripUrgencyLevel(trip) === 'late').length;
    const unassignedCount = visibleTrips.filter((trip) => trip.status === 'Unassigned').length;
    const availableCount = drivers.filter((driver) => driver.status === 'Available').length;
    const routeCount = routeTemplates.filter((route) => (route.sequence || []).length > 0).length;
    return clamp(
      100 - lateCount * 14 - unassignedCount * 7 - Math.max(0, unassignedCount - availableCount) * 10 + Math.min(routeCount * 2, 8) - Math.min(visibleTrips.length, 40) * 0.1,
      35,
      99
    );
  }, [drivers, routeTemplates, visibleTrips]);
  const intelligenceTone = intelligenceScore >= 85 ? 'emerald' : intelligenceScore >= 65 ? 'amber' : 'rose';
  const intelligenceLabel = intelligenceScore >= 85 ? 'Stable' : intelligenceScore >= 65 ? 'Watch' : 'Critical';

  const manifestGroupedSections = useMemo(() => {
    const sections = new Map();
    const buildGroup = (trip) => {
      if (manifestGroupBy === 'status') {
        return { key: trip.status || 'Unknown', label: trip.status || 'Unknown', order: trip.status === 'Unassigned' ? 0 : trip.status === 'Assigned' ? 1 : ACTIVE_PROGRESS_STATUSES.includes(trip.status) ? 2 : 3 };
      }
      if (manifestGroupBy === 'service') {
        const label = trip.type || trip.serviceType || 'Unclassified';
        return { key: label, label, order: 1 };
      }
      if (manifestGroupBy === 'urgency') {
        const urgency = getTripUrgencyLevel(trip);
        if (urgency === 'late') return { key: 'late', label: 'Late / At Risk', order: 0 };
        if (urgency === 'soon') return { key: 'soon', label: 'Starts Soon', order: 1 };
        return { key: 'normal', label: 'Stable Queue', order: 2 };
      }
      const driver = drivers.find((entry) => entry.id === trip.driverId);
      if (!driver) return { key: 'unassigned', label: 'Unassigned Pool', order: 0 };
      return { key: driver.id, label: driver.name || 'Assigned Driver', order: 1, meta: driver };
    };

    visibleTrips.forEach((trip) => {
      const group = buildGroup(trip);
      if (!sections.has(group.key)) {
        sections.set(group.key, {
          ...group,
          trips: [],
          lateCount: 0,
          unassignedCount: 0,
        });
      }
      const section = sections.get(group.key);
      section.trips.push(trip);
      if (getTripUrgencyLevel(trip) === 'late') section.lateCount += 1;
      if (!trip.driverId) section.unassignedCount += 1;
    });

    return [...sections.values()]
      .map((section) => ({
        ...section,
        trips: section.trips.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time)),
      }))
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return String(a.label || '').localeCompare(String(b.label || ''));
      });
  }, [drivers, manifestGroupBy, visibleTrips]);

  // ==================== CONTROL BAR (DEDUPED COMMAND STRIP) ====================

  const renderControlBar = () => (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-200 bg-white shrink-0 sticky top-0 z-20 shadow-sm overflow-x-auto">
      {/* Main Tabs */}
      <div className="flex items-center gap-0.5 shrink-0 bg-slate-100 p-0.5 rounded-lg">
        {['manifest', 'willcall', 'fleet'].map(tab => (
          <button
            key={tab}
            onClick={() => setOperationsTab(tab)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all whitespace-nowrap ${
              operationsTab === tab
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 hover:bg-white'
            }`}
          >
            {tab === 'manifest' ? 'Manifest' : tab === 'willcall' ? 'Will Call' : 'Fleet'}
          </button>
        ))}
      </div>

      <div className="w-px h-4 bg-slate-200 shrink-0"></div>

      {/* Date Nav */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button onClick={() => shiftDate(-1)} className="min-h-[28px] min-w-[28px] rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 flex items-center justify-center transition-colors">
          <ChevronLeft size={14} />
        </button>
        <button onClick={() => setSelectedDate(localCalendarYmd())} className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${isToday ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
          {formatDateLabel(selectedDate)}
          {isToday && <span className="ml-1 text-[9px] opacity-80">Today</span>}
        </button>
        <button onClick={() => shiftDate(1)} className="min-h-[28px] min-w-[28px] rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 flex items-center justify-center transition-colors">
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="w-px h-4 bg-slate-200 shrink-0"></div>

      {/* Quick Actions */}
      <button onClick={() => setShowAddTripModal(true)} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 px-2 py-1 text-[11px] font-semibold text-white transition-colors whitespace-nowrap shrink-0">
        <Plus size={13} /> Trip
      </button>
      <button onClick={() => setShowUploadModal(true)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0">
        <UploadCloud size={13} /> Upload
      </button>
      <button onClick={() => onOpenSequencer?.()} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0">
        <Route size={13} /> Routes
      </button>
      <button onClick={() => onOpenLiveMap?.()} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0">
        <MapPin size={13} /> Map
      </button>

      <div className="w-px h-4 bg-slate-200 shrink-0"></div>

      {/* Search */}
      <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 shrink-0 min-w-[120px]">
        <Search size={11} className="text-slate-400" />
        <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." className="w-full bg-transparent text-[11px] font-medium text-slate-700 placeholder:text-slate-400 outline-none" />
      </div>

      <div className="w-px h-4 bg-slate-200 shrink-0"></div>

      {/* Sort */}
      {[
        { id: 'time', label: 'Time' },
        { id: 'assignment', label: 'Driver' },
        { id: 'status', label: 'Status' },
        { id: 'patient', label: 'Client' },
        { id: 'urgency', label: 'Urgency' }
      ].map(option => (
        <button
          key={option.id}
          onClick={() => {
            if (sortBy === option.id) {
              setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
            } else {
              handleSortSelect(option.id);
            }
          }}
          className={`flex items-center gap-0.5 px-1.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
            sortBy === option.id 
              ? 'bg-blue-100 text-blue-700' 
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
          }`}
        >
          {option.label}
          {sortBy === option.id && (sortDirection === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
        </button>
      ))}

      <div className="w-px h-4 bg-slate-200 shrink-0"></div>

      {/* Filters */}
      <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-1.5 py-1 text-[11px] font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 hover:bg-white cursor-pointer shrink-0">
        <option value="all">All Status</option>
        <option value="Unassigned">Unassigned</option>
        <option value="Assigned">Assigned</option>
        <option value="in-progress">In Progress</option>
        <option value="Completed">Completed</option>
      </select>

      <select value={filterInOut} onChange={(e) => { setFilterInOut(e.target.value); localStorage.setItem('agape_opsFilterInOut', e.target.value); }} className="px-1.5 py-1 text-[11px] font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 hover:bg-white cursor-pointer shrink-0">
        <option value="all">All Trips</option>
        <option value="inout">IN/OUT Only</option>
        <option value="not-inout">Non IN/OUT</option>
      </select>

      <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} className="px-1.5 py-1 text-[11px] font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 hover:bg-white cursor-pointer shrink-0 max-w-[130px]">
        <option value="all">All Drivers</option>
        <option value="unassigned">Unassigned</option>
        {driverOptions.map((driver) => (
          <option key={driver.id} value={driver.id}>{driver.name}</option>
        ))}
      </select>

      <div className="w-px h-4 bg-slate-200 shrink-0"></div>

      {/* View + AI */}
      <div className="flex items-center gap-0.5 shrink-0">
        {MANIFEST_VIEW_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setManifestView(option.value)}
            className={`rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors whitespace-nowrap ${
              manifestView === option.value
                ? 'bg-slate-900 text-white'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            {option.value === 'card' ? 'Cards' : option.value === 'table' ? 'Ledger' : option.label}
          </button>
        ))}
      </div>

      <button
        onClick={() => setShowIntelligence(prev => !prev)}
        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition-all whitespace-nowrap shrink-0 ${
          showIntelligence
            ? 'bg-purple-600 text-white shadow-sm'
            : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
        }`}
      >
        <BrainCircuit size={12} /> AI
      </button>
    </div>
  );

  const renderInlineTripCard = (trip) => {
    const draft = editingTripData;
    if (editingTripId !== trip.id || !draft) return null;
    const fieldClass = 'w-full rounded-lg border border-blue-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
    return (
      <div key={trip.id} className="rounded-xl border-2 border-blue-300 bg-blue-50/40 p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Editing this trip</p><p className="text-xs text-slate-500">Changes stay in this card until saved.</p></div>
          <div className="flex gap-2">
            <button type="button" onClick={cancelInlineEdit} disabled={inlineEditSaving} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50">Cancel</button>
            <button type="button" onClick={saveInlineEdit} disabled={inlineEditSaving} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{inlineEditSaving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <input value={draft.patient} onChange={event => setEditingTripData(current => ({ ...current, patient: event.target.value }))} className={fieldClass} placeholder="Passenger" aria-label="Passenger" />
          <input value={draft.bookingId} onChange={event => setEditingTripData(current => ({ ...current, bookingId: event.target.value }))} className={fieldClass} placeholder="Booking ID" aria-label="Booking ID" />
          <input type="date" value={draft.date} onChange={event => setEditingTripData(current => ({ ...current, date: event.target.value }))} className={fieldClass} aria-label="Service date" />
          <input type="time" value={isoToTimeInput(draft.time)} onChange={event => setEditingTripData(current => ({ ...current, time: event.target.value }))} className={fieldClass} aria-label="Scheduled time" />
          <input value={draft.type} onChange={event => setEditingTripData(current => ({ ...current, type: event.target.value }))} className={fieldClass} placeholder="Service type" aria-label="Service type" />
          <select value={draft.status} onChange={event => setEditingTripData(current => ({ ...current, status: event.target.value }))} className={fieldClass} aria-label="Status">{['Assigned', 'Navigating Pickup', 'At Pickup', 'In Transit', 'At Dropoff', 'Completed', 'No Show', 'Cancelled', 'Rerouted'].map(status => <option key={status} value={status}>{status}</option>)}</select>
          <select value={draft.driverId || ''} onChange={event => setEditingTripData(current => ({ ...current, driverId: event.target.value }))} className={fieldClass} aria-label="Driver"><option value="">Unassigned</option>{driverOptions.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select>
          <input type="number" min="0" step="0.1" value={draft.distance} onChange={event => setEditingTripData(current => ({ ...current, distance: event.target.value }))} className={fieldClass} placeholder="Distance" aria-label="Distance" />
          <textarea value={draft.pickup} onChange={event => setEditingTripData(current => ({ ...current, pickup: event.target.value }))} className={`${fieldClass} col-span-2`} rows="2" placeholder="Pickup address" aria-label="Pickup address" />
          <textarea value={draft.dropoff} onChange={event => setEditingTripData(current => ({ ...current, dropoff: event.target.value }))} className={`${fieldClass} col-span-2`} rows="2" placeholder="Dropoff address" aria-label="Dropoff address" />
          <input type="time" value={draft._pickupTime} onChange={event => setEditingTripData(current => ({ ...current, _pickupTime: event.target.value }))} className={fieldClass} aria-label="Pickup arrival" />
          <input type="number" min="0" value={draft._pickupOdometer} onChange={event => setEditingTripData(current => ({ ...current, _pickupOdometer: event.target.value }))} className={fieldClass} placeholder="Start odometer" aria-label="Start odometer" />
          <input type="time" value={draft._dropoffTime} onChange={event => setEditingTripData(current => ({ ...current, _dropoffTime: event.target.value }))} className={fieldClass} aria-label="Dropoff arrival" />
          <input type="number" min="0" value={draft._dropoffOdometer} onChange={event => setEditingTripData(current => ({ ...current, _dropoffOdometer: event.target.value }))} className={fieldClass} placeholder="End odometer" aria-label="End odometer" />
          <input value={draft.pickupPhone} onChange={event => setEditingTripData(current => ({ ...current, pickupPhone: event.target.value }))} className={fieldClass} placeholder="Pickup phone" aria-label="Pickup phone" />
          <input value={draft.dropoffPhone} onChange={event => setEditingTripData(current => ({ ...current, dropoffPhone: event.target.value }))} className={fieldClass} placeholder="Dropoff phone" aria-label="Dropoff phone" />
          <textarea value={draft.notes} onChange={event => setEditingTripData(current => ({ ...current, notes: event.target.value }))} className={`${fieldClass} col-span-2`} rows="2" placeholder="Notes" aria-label="Notes" />
        </div>
        {inlineEditError && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{inlineEditError}</p>}
      </div>
    );
  };

  const renderManifestCard = (trip) => {
    const isExpanded = isTripExpanded(trip.id);
    const isSelected = selectedTasks.includes(trip.id);
    const urgency = getTripUrgencyLevel(trip);
    const isLate = urgency === 'late';
    const driver = drivers.find((entry) => entry.id === trip.driverId);
    
    // Formatting logic
    const timeDisplay = to12hr(trip.time);
    const urgencyDisplay = isLate ? 'LATE' : urgency === 'soon' ? 'SOON' : null;
    const passengerName = trip.patient || 'Unnamed Client';
    const distanceTop = trip.estMiles ? `${trip.estMiles} mi` : (trip.distance ? `${trip.distance} mi` : '');
    const legsCount = trip.type || trip.serviceType || 'TRIP';
    const pickupAddress = trip.pickup || 'Missing pickup address';
    const dropoffAddress = trip.dropoff || 'Missing dropoff address';
    const driverName = driver ? driver.name : 'Unassigned';
    const driverCar = driver ? (driver.vehicle || 'Active') : 'N/A';
    const etaDisplay = trip.eta || 'Pending';
    const routeMileage = trip.estMiles ? `${trip.estMiles} mi` : (trip.distance ? `${trip.distance} mi` : 'N/A');

    if (editingTripId === trip.id) return renderInlineTripCard(trip);

    return (
      <div key={trip.id} className={`rounded-xl shadow-sm border p-3 transition-all duration-200 hover:shadow-md ${
        isLate ? 'bg-rose-50 border-rose-200 hover:border-rose-300' : 'bg-white border-slate-200 hover:border-slate-300'
      }`}>
        {/* Top Row */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <button 
              type="button" 
              onClick={(e) => { e.stopPropagation(); setSelectedTasks((prev) => prev.includes(trip.id) ? prev.filter((id) => id !== trip.id) : [...prev, trip.id]); }}
              className={`shrink-0 transition-colors ${isSelected ? 'text-blue-600' : 'text-slate-500 hover:text-slate-600'}`}
            >
              {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
            </button>
            <div className="flex items-center gap-1 shrink-0">
              <Clock size={14} className={isLate ? 'text-rose-500' : 'text-orange-500'} />
              <span className={`font-semibold text-sm ${isLate ? 'text-rose-600' : 'text-orange-600'}`}>{timeDisplay}</span>
              {urgencyDisplay && (
                <span className={`text-xs px-1.5 py-0.5 rounded ${isLate ? 'bg-rose-100 text-rose-700' : 'bg-orange-100 text-orange-700'}`}>
                  {urgencyDisplay}
                </span>
              )}
            </div>
            <span className="text-slate-300 mx-0.5 shrink-0">•</span>
            <span className="font-semibold text-slate-800 text-sm truncate max-w-[100px] md:max-w-none">
              {passengerName}
            </span>
          </div>
          
          <div className="flex items-center gap-1 shrink-0 ml-1">
            {distanceTop && <span className="hidden md:inline text-xs text-slate-500 font-medium">{distanceTop}</span>}
            <span className="border border-slate-200 text-slate-600 text-xs px-1.5 py-0.5 rounded uppercase bg-slate-50">
              {legsCount}
            </span>
            {isInOutTrip(trip) && (
              <span className="border border-emerald-200 text-emerald-700 text-xs px-1.5 py-0.5 rounded bg-emerald-50 font-bold">
                {trip.inOutLeg || 'I/O'}
              </span>
            )}
          </div>
        </div>

        {/* Addresses & Expand Button */}
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span className="text-slate-600 text-xs md:text-sm leading-tight truncate font-medium">{pickupAddress}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-slate-600 text-xs md:text-sm leading-tight truncate font-medium">{dropoffAddress}</span>
            </div>
          </div>

          <button 
            onClick={() => toggleTripExpanded(trip.id)}
            className="ml-2 p-1 text-slate-500 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors shrink-0"
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {/* Compact Info Line */}
        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1 truncate">
            <User size={12} />
            {driver ? driverName : <span className="text-rose-500 italic">Unassigned</span>}
          </span>
          <span className="hidden md:flex items-center gap-1 truncate">
            <Car size={12} /> {driverCar}
          </span>
          <span className="hidden md:flex items-center gap-1 truncate">
            <Navigation size={12} /> ETA: {etaDisplay}
          </span>
        </div>

        {/* Expanded Actions Panel */}
        {isExpanded && (
          <div className="mt-2 border-t border-slate-100 pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Driver Workflow Row */}
            {driver && (
              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-1">Flow</span>
                {[
                  { id: 'start', label: 'Start', icon: Navigation, color: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-100' },
                  { id: 'pickup', label: 'Pickup', icon: MapPin, color: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-100' },
                  { id: 'transport', label: 'Transport', icon: Truck, color: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-100' },
                  { id: 'dropoff', label: 'Dropoff', icon: Flag, color: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-100' },
                  { id: 'complete', label: 'Complete', icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-100' },
                ].map(({ id, label, icon: Icon, color }) => (
                  <button
                    key={id}
                    type="button"
                    disabled={TERMINAL_STATUSES.includes(trip.status) && id !== 'complete'}
                    onClick={() => applyDriverWorkStep(trip, id)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${color}`}
                  >
                    <Icon size={12} /> {label}
                  </button>
                ))}
              </div>
            )}

            {/* Single Actions Dropdown */}
            <div className="relative" ref={boardActionsMenuTripId === trip.id ? boardActionsMenuRef : undefined}>
              <button
                type="button"
                onClick={() => setBoardActionsMenuTripId(boardActionsMenuTripId === trip.id ? null : trip.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <MoreVertical size={13} /> Actions
              </button>
              {boardActionsMenuTripId === trip.id && (
                <div className="absolute left-0 top-full mt-1 z-50 w-52 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  {/* Assign */}
                  <button onClick={() => { setBoardActionsMenuTripId(null); setManualAssignTrip(trip); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700">
                    <UserPlus size={13} className="text-blue-500" /> {driver ? 'Reassign Driver' : 'Assign Driver'}
                  </button>
                  <button onClick={() => { setBoardActionsMenuTripId(null); triggerSmartAssign(trip); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700">
                    <BrainCircuit size={13} className="text-indigo-500" /> AI Auto Assign
                  </button>
                  <div className="my-1 border-t border-slate-100" />
                  {/* Trip Actions */}
                  <button onClick={() => { setBoardActionsMenuTripId(null); startInlineEdit(trip); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-800">
                    <Edit2 size={13} className="text-slate-500" /> Edit Trip
                  </button>
                  <button onClick={() => { setBoardActionsMenuTripId(null); makeCall(getClientPhone(trip), trip.patient); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-700">
                    <Phone size={13} className="text-emerald-500" /> Call Client
                  </button>
                  <button onClick={() => { setBoardActionsMenuTripId(null); openSmsForTrip(trip); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700">
                    <MessageSquare size={13} className="text-blue-500" /> SMS Client
                  </button>
                  <div className="my-1 border-t border-slate-100" />
                  {/* IN/OUT Toggle */}
                  <button onClick={() => {
                    setBoardActionsMenuTripId(null);
                    const nowInOut = !isInOutTrip(trip);
                    updateTrip?.(trip.id, { inOutTrip: nowInOut, inOut: nowInOut, tripKind: nowInOut ? 'IN_OUT' : '', inOutStayWithClient: nowInOut, inOutWaitMinutes: nowInOut ? 5 : null, inOutLeg: nowInOut ? (trip.inOutLeg || 'A') : null });
                  }} className={`flex w-full items-center gap-2 px-3 py-2 text-xs ${isInOutTrip(trip) ? 'text-emerald-700 hover:bg-emerald-50' : 'text-slate-700 hover:bg-emerald-50 hover:text-emerald-700'}`}>
                    <RotateCcw size={13} className="text-emerald-500" /> {isInOutTrip(trip) ? 'Remove IN/OUT' : 'Mark IN/OUT'}
                  </button>
                  {/* Exceptions */}
                  {hasPermission(role, 'canDeleteTrip') && (
                    <>
                      <div className="my-1 border-t border-slate-100" />
                      <button onClick={() => { setBoardActionsMenuTripId(null); markTripException(trip, 'Rerouted'); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-amber-50 hover:text-amber-700">
                        <MapPin size={13} className="text-amber-500" /> Reroute
                      </button>
                      <button onClick={() => { setBoardActionsMenuTripId(null); markTripException(trip, 'No Show'); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-800">
                        <AlertCircle size={13} className="text-slate-500" /> No Show
                      </button>
                      <button onClick={() => { setBoardActionsMenuTripId(null); markTripException(trip, 'Cancelled'); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-rose-50 hover:text-rose-700">
                        <XCircle size={13} className="text-rose-500" /> Cancel Trip
                      </button>
                      <button onClick={() => { setBoardActionsMenuTripId(null); requestDeleteTrip(trip.id); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-800">
                        <Archive size={13} className="text-slate-500" /> Archive
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {/* Render detailed metadata block inside expanded state as well */}
        {isExpanded && (
           <div className="mt-3 pt-3 border-t border-slate-100 animate-in fade-in">
             {renderExpandedTripDetails(trip, { compact: false })}
           </div>
        )}
      </div>
    );
  };

  const renderManifestBoard = () => (
    <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_360px] gap-4 px-3 pb-3 h-full overflow-hidden">
      {/* Board View (Left Column) */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1">
        {manifestFeedTrips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <div className="max-w-sm rounded-xl border border-slate-100/50 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                <FileText size={28} />
              </div>
              <p className="text-base text-slate-900">Dispatch board is clear</p>
              <p className="mt-1.5 text-sm">Try another view, reset the filters, or upload more trips.</p>
            </div>
          </div>
        ) : (
          <>
            <div className={`grid gap-3 ${manifestGroupBy === 'driver' ? '2xl:grid-cols-2' : 'xl:grid-cols-2'}`}>
              {manifestGroupedSections.map((section) => (
                <section key={section.key} className="rounded-xl border border-slate-100/50 bg-white shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 bg-slate-50/70">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-900">{section.label}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-sm text-slate-600">
                          {section.trips.length} trip{section.trips.length !== 1 ? 's' : ''}
                        </span>
                        {section.lateCount > 0 && (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-sm text-rose-700 font-medium">
                            {section.lateCount} late
                          </span>
                        )}
                        {section.unassignedCount > 0 && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-sm text-amber-700 font-medium">
                            {section.unassignedCount} open
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                      {manifestGroupBy}
                    </div>
                  </div>
                  <div className="space-y-3 p-3">
                    {section.trips.map((trip) => renderManifestCard(trip))}
                  </div>
                </section>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-100/50 bg-white px-4 py-3 text-sm font-medium text-slate-500 shadow-sm">
              <span>Showing {visibleTrips.length} of {manifestFeedTrips.length} manifest trips</span>
              {manifestFeedTrips.length > visibleTrips.length && (
                <button
                  type="button"
                  onClick={() => setManifestLimit((prev) => prev + 150)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
                >
                  Load 150 More
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="hidden lg:flex flex-col min-h-0 bg-slate-50 border border-slate-200/60 rounded-xl p-4 shadow-inner">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200">
          <Activity size={18} className="text-blue-600" />
          <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">Drivers Activity</h3>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain space-y-2.5 pr-0.5">
          {(!logs || logs.length === 0) ? (
            <div className="text-center py-10 text-xs text-slate-400">No recent driver activity logs</div>
          ) : (
            logs.slice(0, 30).map((log, i) => (
              <div key={`${typeof log.id === 'string' || typeof log.id === 'number' ? log.id : formatActivityTimestamp(log.timestamp)}-${i}`} className="p-3 bg-white border border-slate-200/75 rounded-xl shadow-sm hover:shadow-md transition-all duration-200">
                <div className="flex items-start gap-2.5">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ring-1 ring-slate-200 ${
                    log.c === 'rose' ? 'bg-rose-500 ring-rose-500/20' :
                    log.c === 'amber' ? 'bg-amber-500 ring-amber-500/20' :
                    log.c === 'emerald' ? 'bg-emerald-500 ring-emerald-500/20' :
                    log.c === 'blue' ? 'bg-blue-500 ring-blue-500/20' :
                    'bg-slate-500 ring-slate-500/20'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-slate-800 leading-snug">{log.t}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">{log.d}</p>
                    {formatActivityTimestamp(log.timestamp) && <p className="text-[10px] text-slate-400 mt-1 font-medium">{formatActivityTimestamp(log.timestamp)}</p>}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  // ==================== DISPATCH CARDS ====================
  const renderDispatchCards = () => {
    const CARD_SORT_OPTIONS = [
      { value: 'time', label: 'Time' },
      { value: 'assignment', label: 'Driver' },
      { value: 'vehicle', label: 'Car' },
      { value: 'distance', label: 'Distance' },
      { value: 'trips', label: 'Trips' },
      { value: 'status', label: 'Availability' },
    ];
    const getMinutesUntil = (tripTime) => {
      if (!tripTime || tripTime === 'Will Call') return null;
      const mins = timeToMinutes(tripTime);
      const now = new Date();
      const scheduled = new Date();
      scheduled.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
      const diffMs = scheduled - now;
      if (diffMs < 0) return null;
      return Math.round(diffMs / 60000);
    };
    return (
      <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
        {manifestFeedTrips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <div className="max-w-sm rounded-xl border border-slate-100/50 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                <FileText size={28} />
              </div>
              <p className="text-base text-slate-900">No trips to dispatch</p>
              <p className="mt-1.5 text-sm">Try adjusting your filters or upload new trip data.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Sort Toolbar */}
            <div className="mb-3 rounded-xl border border-slate-100/50 bg-white px-3 py-2 shadow-sm">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <div className="flex items-center gap-1.5 shrink-0 pr-2 border-r border-slate-200">
                  {CARD_SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        if (sortBy === opt.value) {
                          setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
                        } else {
                          setSortBy(opt.value);
                          setSortDirection('asc');
                        }
                      }}
                      className={`shrink-0 px-3 py-1.5 rounded-xl text-xs transition-all ${
                        sortBy === opt.value
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
                  className="shrink-0 px-3 py-1.5 rounded-xl text-xs bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 flex items-center gap-1"
                >
                  {sortDirection === 'asc' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {sortDirection === 'asc' ? 'Asc' : 'Desc'}
                </button>
              </div>
            </div>

            {/* Trip Cards */}
            <div className="space-y-3">
              {visibleTrips.map((trip) => {
                const isExpanded = isTripExpanded(trip.id);
                const isSelected = selectedTasks.includes(trip.id);
                const driver = drivers.find((d) => d.id === trip.driverId);
                const urgency = getTripUrgencyLevel(trip);
                const isLate = urgency === 'late';
                const minsUntil = getMinutesUntil(trip.time);
                const routeLegs = routeTripMap[trip.id] || [];
                const distance = trip.directDistance || '—';

                if (editingTripId === trip.id) return renderInlineTripCard(trip);

                return (
                  <div
                    key={trip.id}
                    className={`rounded-xl border shadow-sm overflow-hidden transition-all duration-150 ${
                      isSelected
                        ? 'border-blue-300 ring-2 ring-blue-500/20 bg-white'
                        : isLate
                          ? 'bg-rose-50 border-rose-200 hover:border-rose-300 hover:shadow-md'
                          : isExpanded
                            ? 'border-blue-300 ring-1 ring-blue-500/15 shadow-md bg-white'
                            : 'border-slate-100/50 hover:shadow-md bg-white'
                    }`}
                  >
                    {/* Header: Time + Urgency + Passenger + Distance */}
                    <div className="px-4 pt-4 pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTasks((prev) =>
                                prev.includes(trip.id)
                                  ? prev.filter((id) => id !== trip.id)
                                  : [...prev, trip.id]
                              );
                            }}
                            className={`rounded p-0.5 shrink-0 transition-all duration-150 ${
                              isSelected ? 'text-blue-600' : 'text-slate-500 hover:text-slate-600'
                            }`}
                          >
                            {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                          </button>
                          <div className="flex items-center gap-2 min-w-0">
                            <Clock size={14} className="text-orange-500 shrink-0" />
                            <span className={`font-semibold text-lg shrink-0 ${isLate ? 'text-rose-600' : urgency === 'soon' ? 'text-amber-500' : 'text-orange-600'}`}>
                              {to12hr(trip.time)}
                            </span>
                            {minsUntil !== null && (
                              <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md shrink-0">
                                in {minsUntil} min
                              </span>
                            )}
                          </div>
                          <span className="text-slate-300 mx-0.5 shrink-0 hidden sm:inline">•</span>
                          <span className="font-semibold text-slate-900 truncate text-sm">
                            {trip.patient || 'Unnamed Client'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="text-xs text-slate-500">{distance !== '—' ? `${distance} mi` : '—'}</span>
                          {routeLegs.length > 0 && (
                            <span className="border border-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-md">
                              {routeLegs.length} LEG{routeLegs.length !== 1 ? 'S' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Addresses */}
                    <div className="px-4 pb-2 space-y-2">
                      <div className="flex items-start gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 mt-1.5 shadow-sm" />
                        <span className="text-sm font-medium text-slate-700 leading-relaxed">
                          {trip.pickup || 'Missing pickup'}
                        </span>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0 mt-1.5 shadow-sm" />
                        <span className="text-sm font-medium text-slate-700 leading-relaxed">
                          {trip.dropoff || 'Missing dropoff'}
                        </span>
                      </div>
                    </div>

                    {/* Driver Info Row — Always Visible */}
                    <div className="border-t border-slate-100 px-4 py-2.5 bg-slate-50/50">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="flex items-center gap-1.5">
                          <User size={12} className="text-slate-500 shrink-0" />
                          <span className="text-xs text-slate-700 truncate">
                            {driver?.name || trip.driverName || <span className="text-red-500 italic">Unassigned</span>}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Car size={12} className="text-slate-500 shrink-0" />
                          <span className="text-xs text-slate-700 truncate">
                            {driver?.vehicle || '—'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {driver ? (
                            <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${getDriverLiveStatus(driver).color}`}>
                              {getDriverLiveStatus(driver).label}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500">—</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapIcon size={12} className="text-slate-500 shrink-0" />
                          <span className="text-xs text-slate-700 truncate">
                            {distance !== '—' ? `${distance} mi` : '—'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Expandable Actions */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-white p-3 space-y-2">
                        {/* Driver Workflow Row */}
                        {driver && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-1">Flow</span>
                            {[
                              { id: 'start', label: 'Start', icon: Navigation, color: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-100' },
                              { id: 'pickup', label: 'Pickup', icon: MapPin, color: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-100' },
                              { id: 'transport', label: 'Transport', icon: Truck, color: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-100' },
                              { id: 'dropoff', label: 'Dropoff', icon: Flag, color: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-100' },
                              { id: 'complete', label: 'Complete', icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-100' },
                            ].map(({ id, label, icon: Icon, color }) => (
                              <button
                                key={id}
                                type="button"
                                disabled={TERMINAL_STATUSES.includes(trip.status) && id !== 'complete'}
                                onClick={() => applyDriverWorkStep(trip, id)}
                                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${color}`}
                              >
                                <Icon size={12} /> {label}
                              </button>
                            ))}
                          </div>
                        )}
                        {/* Actions Dropdown */}
                        <div className="relative" ref={actionsMenuTripId === trip.id ? actionsMenuRef : undefined}>
                          <button
                            type="button"
                            onClick={() => setActionsMenuTripId(actionsMenuTripId === trip.id ? null : trip.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                          >
                            <MoreVertical size={13} /> Actions
                          </button>
                          {actionsMenuTripId === trip.id && (
                            <div className="absolute left-0 top-full mt-1 z-50 w-52 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                              <button onClick={() => { setActionsMenuTripId(null); setManualAssignTrip(trip); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700">
                                <UserPlus size={13} className="text-blue-500" /> {driver ? 'Reassign Driver' : 'Assign Driver'}
                              </button>
                              <button onClick={() => { setActionsMenuTripId(null); triggerSmartAssign(trip); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700">
                                <BrainCircuit size={13} className="text-indigo-500" /> AI Auto Assign
                              </button>
                              <div className="my-1 border-t border-slate-100" />
                              <button onClick={() => { setActionsMenuTripId(null); startInlineEdit(trip); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-800">
                                <Edit2 size={13} className="text-slate-500" /> Edit Trip
                              </button>
                              <button onClick={() => { setActionsMenuTripId(null); makeCall(getClientPhone(trip), trip.patient); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-700">
                                <Phone size={13} className="text-emerald-500" /> Call Client
                              </button>
                              <button onClick={() => { setActionsMenuTripId(null); openSmsForTrip(trip); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700">
                                <MessageSquare size={13} className="text-blue-500" /> SMS Client
                              </button>
                              <div className="my-1 border-t border-slate-100" />
                              <button onClick={() => {
                                setActionsMenuTripId(null);
                                const nowInOut = !isInOutTrip(trip);
                                updateTrip?.(trip.id, { inOutTrip: nowInOut, inOut: nowInOut, tripKind: nowInOut ? 'IN_OUT' : '', inOutStayWithClient: nowInOut, inOutWaitMinutes: nowInOut ? 5 : null, inOutLeg: nowInOut ? (trip.inOutLeg || 'A') : null });
                              }} className={`flex w-full items-center gap-2 px-3 py-2 text-xs ${isInOutTrip(trip) ? 'text-emerald-700 hover:bg-emerald-50' : 'text-slate-700 hover:bg-emerald-50 hover:text-emerald-700'}`}>
                                <RotateCcw size={13} className="text-emerald-500" /> {isInOutTrip(trip) ? 'Remove IN/OUT' : 'Mark IN/OUT'}
                              </button>
                              {hasPermission(role, 'canDeleteTrip') && (
                                <>
                                  <div className="my-1 border-t border-slate-100" />
                                  <button onClick={() => { setActionsMenuTripId(null); markTripException(trip, 'Rerouted'); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-amber-50 hover:text-amber-700">
                                    <MapPin size={13} className="text-amber-500" /> Reroute
                                  </button>
                                  <button onClick={() => { setActionsMenuTripId(null); markTripException(trip, 'No Show'); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-800">
                                    <AlertCircle size={13} className="text-slate-500" /> No Show
                                  </button>
                                  <button onClick={() => { setActionsMenuTripId(null); markTripException(trip, 'Cancelled'); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-rose-50 hover:text-rose-700">
                                    <XCircle size={13} className="text-rose-500" /> Cancel Trip
                                  </button>
                                  <button onClick={() => { setActionsMenuTripId(null); requestDeleteTrip(trip.id); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-800">
                                    <Archive size={13} className="text-slate-500" /> Archive
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Expand/Collapse Toggle */}
                    <button
                      onClick={() => toggleTripExpanded(trip.id)}
                      className="w-full border-t border-slate-100 py-2.5 flex items-center justify-center text-xs text-slate-500 hover:bg-slate-50 transition-colors"
                    >
                      {isExpanded ? 'Hide Actions' : 'Show Actions'}
                      {isExpanded ? (
                        <ChevronUp size={14} className="ml-1.5" />
                      ) : (
                        <ChevronDown size={14} className="ml-1.5" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-100/50 bg-white px-4 py-3 text-xs font-medium text-slate-500 shadow-sm">
              <span>
                Showing {visibleTrips.length} of {manifestFeedTrips.length} trip
                {manifestFeedTrips.length !== 1 ? 's' : ''}
              </span>
              {manifestFeedTrips.length > visibleTrips.length && (
                <button
                  type="button"
                  onClick={() => setManifestLimit((prev) => prev + 150)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
                >
                  Load 150 More
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  // ==================== TRIP TABLE ====================
  const renderTripTable = () => (
    <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
      {manifestFeedTrips.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <div className="bg-white border border-slate-100/50 rounded-xl p-8 text-center max-w-xs shadow-sm">
            <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
              <FileText size={28} />
            </div>
            <p className="text-base text-slate-900">No trips found</p>
            <p className="text-sm mt-1.5">Try adjusting your filters or upload new trip data</p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-100/50 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-900">Dispatch Ledger</p>
                <p className="text-xs font-medium text-slate-500">
                  Structured manifest view with richer client detail, routing context, and driver assignment controls.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700">{visibleTrips.length} visible</span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-xs">
              <colgroup>
                <col className="w-8" />
                <col className="w-[7%]" />
                <col className="w-[8%]" />
                <col className="w-[18%]" />
                <col className="w-[17%]" />
                <col className="w-[17%]" />
                <col className="w-[12%]" />
                <col className="w-[7%]" />
                <col className="w-[4%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 border-b border-blue-900/20 text-slate-100">
                <tr>
                  <th className={`${densityProfile.tableHead} text-left align-middle`}>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedTasks.length === visibleTrips.length) {
                          setSelectedTasks([]);
                        } else {
                          setSelectedTasks(visibleTrips.map((trip) => trip.id));
                        }
                      }}
                      className={`rounded p-0.5 transition-all duration-150 ${selectedTasks.length === visibleTrips.length && visibleTrips.length > 0 ? 'text-blue-300' : 'text-slate-300 hover:text-white'}`}
                    >
                      {selectedTasks.length === visibleTrips.length && visibleTrips.length > 0 ? <CheckSquare size={15} /> : <Square size={15} />}
                    </button>
                  </th>
                  {MANIFEST_TABLE_COLUMNS.map(({ label, sortKey }) => (
                    <th key={label} className={`${densityProfile.tableHead} text-left text-xs uppercase tracking-widest text-slate-200 align-middle`}>
                      {sortKey ? (
                        <button
                          type="button"
                          onClick={() => handleColumnSort(sortKey)}
                          className={`group inline-flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left uppercase tracking-widest transition-colors ${
                            sortBy === sortKey ? 'bg-white/12 text-white' : 'text-blue-50/90 hover:bg-white/10 hover:text-white'
                          }`}
                          title={`Sort by ${label}`}
                        >
                          <span className="truncate">{label}</span>
                          {sortBy === sortKey ? (
                            sortDirection === 'asc' ? <TrendingUp size={11} className="shrink-0" /> : <TrendingDown size={11} className="shrink-0" />
                          ) : (
                            <ChevronDown size={10} className="shrink-0 opacity-45 group-hover:opacity-90" />
                          )}
                        </button>
                      ) : (
                        <span className="inline-flex px-1.5 py-1 text-blue-50/90">{label}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {visibleTrips.map((trip, index) => {
                  const isExpanded = isTripExpanded(trip.id);
                  const isEditing = editingTripId === trip.id;
                  const ie = isEditing ? editingTripData : null;
                  const inlineCellClass = 'w-full rounded-md border border-blue-400 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100';
                  const isSelected = selectedTasks.includes(trip.id);
                  const urgency = getTripUrgencyLevel(trip);
                  const isLate = urgency === 'late';
                  const driver = drivers.find((entry) => entry.id === trip.driverId);
                  const routeAssignments = routeTripMap[trip.id] || [];
                  const bookingReference = getBookingReference(trip);
                  const clientIdentifier = getClientIdentifier(trip);
                  const clientPhone = formatPhoneDisplay(getClientPhone(trip));
                  const pickupPhone = formatPhoneDisplay(trip.pickupPhone);
                  const dropoffPhone = formatPhoneDisplay(trip.dropoffPhone);
                  const hospitalPhone = formatPhoneDisplay(trip.hospitalPhone || trip.dropoffPhone);
                  const pickupFacilityName = getPickupFacilityName(trip);
                  const dropoffFacilityName = getDropoffFacilityName(trip);
                  const serviceLabel = trip.type || trip.serviceType;
                  const clientSummary = [bookingReference, clientIdentifier && `ID ${clientIdentifier}`, serviceLabel].filter(Boolean).join(' • ');
                  const contactSummary = [
                    clientPhone && `Client ${clientPhone}`,
                    densityProfile.showSecondaryPhones && pickupPhone && pickupPhone !== clientPhone && `Pickup ${pickupPhone}`,
                    densityProfile.showSecondaryPhones && hospitalPhone && `Hospital ${hospitalPhone}`,
                  ].filter(Boolean).join(' • ');
                  const visibleRouteAssignments = routeAssignments.slice(0, densityProfile.routeChipLimit);
                  const rowBg = isSelected
                    ? 'bg-blue-50'
                    : isLate
                      ? 'bg-rose-50'
                      : index % 2 === 0
                        ? 'bg-white'
                        : 'bg-slate-50/55';
                  return (
                    <React.Fragment key={trip.id}>
                    <tr
                      className={`${activeTripRow === trip.id ? 'bg-blue-100' : rowBg} transition-colors hover:bg-blue-50/70 cursor-pointer`}
                      onClick={() => setActiveTripRow(trip.id)}
                    >
                      <td className={`${densityProfile.tableCell} align-top`}>
                        <div className={`flex ${densityProfile.tableRowMinHeight} items-start pt-1`}>
                          {isEditing ? (
                            <div className="flex gap-1">
                              <button type="button" onClick={(event) => { event.stopPropagation(); saveInlineEdit(); }} disabled={inlineEditSaving} className="rounded bg-emerald-100 p-1.5 text-emerald-700 disabled:opacity-50" title="Save row"><CheckCircle2 size={15} /></button>
                              <button type="button" onClick={(event) => { event.stopPropagation(); cancelInlineEdit(); }} disabled={inlineEditSaving} className="rounded bg-rose-50 p-1.5 text-rose-600 disabled:opacity-50" title="Cancel"><X size={15} /></button>
                            </div>
                          ) : <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTasks((prev) => prev.includes(trip.id) ? prev.filter((id) => id !== trip.id) : [...prev, trip.id]);
                            }}
                            className={`rounded p-0.5 transition-all duration-150 ${isSelected ? 'text-blue-600' : 'text-slate-500 hover:text-slate-600'}`}
                          >
                            {isSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                          </button>}
                        </div>
                      </td>
                      <td className={`${densityProfile.tableCell} align-top`}>
                        <div className={`flex ${densityProfile.tableRowMinHeight} items-center`}>
                          {isEditing ? <input value={ie.bookingId} onChange={event => setEditingTripData(current => ({ ...current, bookingId: event.target.value }))} className={inlineCellClass} aria-label="Booking ID" /> : <span className="text-xs font-mono text-slate-500">{trip.bookingId || trip.id || '—'}</span>}
                        </div>
                      </td>
                      <td className={`${densityProfile.tableCell} align-top`}>
                        {isEditing ? <input type="time" value={isoToTimeInput(ie.time)} onChange={event => setEditingTripData(current => ({ ...current, time: event.target.value }))} className={inlineCellClass} aria-label="Scheduled time" /> : (
                        <div className={`flex ${densityProfile.tableRowMinHeight} flex-col ${densityProfile.lineCount >= 3 ? 'justify-between' : 'justify-center'}`}>
                          <div className="flex items-center gap-1.5">
                            <div className={`font-mono ${isLate ? 'text-rose-600' : urgency === 'soon' ? 'text-amber-600' : 'text-emerald-600'} ${manifestDensity === 'executive' ? 'text-lg' : manifestDensity === 'dense' ? 'text-xs' : densityProfile.lineCount <= 2 ? 'text-xs' : 'text-base'}`}>
                              {to12hr(trip.time)}
                            </div>
                            {isInOutTrip(trip) && (
                              <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200 leading-none">
                                {trip.inOutLeg || 'I/O'}
                              </span>
                            )}
                          </div>
                          {densityProfile.lineCount >= 2 && densityProfile.showStatusMeta && (
                            <div className="text-xs uppercase tracking-wide text-slate-500">
                              {urgency === 'late' ? 'Late risk' : urgency === 'soon' ? 'Starts soon' : 'On schedule'}
                            </div>
                          )}
                          {densityProfile.lineCount >= 3 && densityProfile.showStatusMeta && routeAssignments.length > 0 && (
                            <div className="text-xs text-indigo-700">
                              {routeAssignments.length} routed stop{routeAssignments.length !== 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                        )}
                      </td>
                      <td className={`${densityProfile.tableCell} align-top`}>
                        {isEditing ? (
                          <div className="space-y-1.5">
                            <input value={ie.patient} onChange={event => setEditingTripData(current => ({ ...current, patient: event.target.value }))} className={inlineCellClass} aria-label="Passenger" />
                            <input value={ie.type} onChange={event => setEditingTripData(current => ({ ...current, type: event.target.value }))} className={inlineCellClass} aria-label="Service type" placeholder="Service type" />
                            <input type="date" value={ie.date} onChange={event => setEditingTripData(current => ({ ...current, date: event.target.value }))} className={inlineCellClass} aria-label="Service date" />
                            <input value={ie.pickupPhone} onChange={event => setEditingTripData(current => ({ ...current, pickupPhone: event.target.value }))} className={inlineCellClass} aria-label="Pickup phone" placeholder="Pickup phone" />
                            <input value={ie.dropoffPhone} onChange={event => setEditingTripData(current => ({ ...current, dropoffPhone: event.target.value }))} className={inlineCellClass} aria-label="Dropoff phone" placeholder="Dropoff phone" />
                            <textarea value={ie.notes} onChange={event => setEditingTripData(current => ({ ...current, notes: event.target.value }))} className={inlineCellClass} rows="2" aria-label="Notes" placeholder="Notes" />
                          </div>
                        ) : (
                        <div className={`flex ${densityProfile.tableRowMinHeight} flex-col justify-center gap-0.5`}>
                          <div className="leading-snug text-slate-900 text-xs">
                            {trip.patient || 'Unnamed Client'}
                          </div>
                          {densityProfile.lineCount <= 2 ? (
                            densityProfile.lineCount === 2 && clientSummary && (
                              <div className="text-[10px] text-slate-400 truncate">{clientSummary}</div>
                            )
                          ) : (
                            <div className={`${isLeanDensity ? 'mt-0.5' : 'mt-1'} flex flex-wrap gap-1`}>
                              {bookingReference && (
                                <span className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                                  {bookingReference}
                                </span>
                              )}
                              {clientIdentifier && (
                                <span className="inline-flex items-center rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-xs text-violet-700">
                                  {clientIdentifier}
                                </span>
                              )}
                              {(trip.type || trip.serviceType) && (
                                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                                  {trip.type || trip.serviceType}
                                </span>
                              )}
                            </div>
                          )}
                          {densityProfile.lineCount >= 3 && (
                            <div className={isLeanDensity ? 'space-y-0.5' : 'space-y-1'}>
                              {clientPhone && (
                                <div className="text-xs text-emerald-700">Client {clientPhone}</div>
                              )}
                              {densityProfile.showSecondaryPhones && pickupPhone && pickupPhone !== clientPhone && (
                                <div className="text-xs text-emerald-700">Pickup desk {pickupPhone}</div>
                              )}
                              {densityProfile.showSecondaryPhones && hospitalPhone && (
                                <div className="text-xs text-rose-700">Hospital {hospitalPhone}</div>
                              )}
                              {densityProfile.showNotesPreview && trip.notes && (
                                <div className="text-xs font-medium leading-relaxed text-amber-700" style={getClampStyle(densityProfile.noteLines)}>
                                  Notes: {trip.notes}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        )}
                      </td>
                      <td className={`${densityProfile.tableCell} align-top`}>
                        {isEditing ? <div className="space-y-1.5"><textarea value={ie.pickup} onChange={event => setEditingTripData(current => ({ ...current, pickup: event.target.value }))} className={inlineCellClass} rows="3" aria-label="Pickup address" /><input type="time" value={ie._pickupTime} onChange={event => setEditingTripData(current => ({ ...current, _pickupTime: event.target.value }))} className={inlineCellClass} aria-label="Pickup arrival" /><input type="number" min="0" value={ie._pickupOdometer} onChange={event => setEditingTripData(current => ({ ...current, _pickupOdometer: event.target.value }))} className={inlineCellClass} aria-label="Pickup odometer" placeholder="Start odometer" /></div> : densityProfile.lineCount === 1 ? (
                          <div className={`flex ${densityProfile.tableRowMinHeight} items-center text-xs text-slate-700 truncate`}>
                            {trip.pickup || '—'}
                          </div>
                        ) : (
                          <div className={`flex ${densityProfile.tableRowMinHeight} flex-col justify-between min-w-0 ${isLeanDensity ? 'border border-blue-100 bg-blue-50/70 rounded-lg px-2 py-1' : 'border border-blue-100 bg-blue-50/70 rounded-xl px-3 py-2'}`}>
                            {densityProfile.lineCount >= 3 && <div className="text-xs uppercase tracking-wide text-blue-700 truncate">Pickup</div>}
                            {densityProfile.lineCount >= 3 && densityProfile.showFacilityNames && pickupFacilityName && (
                              <div className="text-xs uppercase tracking-wide text-blue-800 truncate">{pickupFacilityName}</div>
                            )}
                            <div className={`${densityProfile.lineCount >= 3 ? (isLeanDensity ? 'mt-0.5 text-xs' : 'mt-1 text-xs') : 'text-xs'} leading-snug text-slate-800 truncate`} style={getClampStyle(densityProfile.lineCount)}>
                              {trip.pickup || 'Missing pickup address'}
                            </div>
                            {densityProfile.lineCount >= 3 && clientPhone && (
                              <div className={`${isLeanDensity ? 'mt-0.5' : 'mt-1'} text-xs font-medium text-blue-700`}>{clientPhone}</div>
                            )}
                            {densityProfile.lineCount >= 3 && densityProfile.showSecondaryPhones && pickupPhone && pickupPhone !== clientPhone && (
                              <div className={`${isLeanDensity ? 'mt-0.5' : 'mt-1'} text-xs font-medium text-blue-700`}>Desk {pickupPhone}</div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className={`${densityProfile.tableCell} align-top`}>
                        {isEditing ? <div className="space-y-1.5"><textarea value={ie.dropoff} onChange={event => setEditingTripData(current => ({ ...current, dropoff: event.target.value }))} className={inlineCellClass} rows="3" aria-label="Dropoff address" /><input type="time" value={ie._dropoffTime} onChange={event => setEditingTripData(current => ({ ...current, _dropoffTime: event.target.value }))} className={inlineCellClass} aria-label="Dropoff arrival" /><input type="number" min="0" value={ie._dropoffOdometer} onChange={event => setEditingTripData(current => ({ ...current, _dropoffOdometer: event.target.value }))} className={inlineCellClass} aria-label="Dropoff odometer" placeholder="End odometer" /></div> : densityProfile.lineCount === 1 ? (
                          <div className={`flex ${densityProfile.tableRowMinHeight} items-center text-xs text-slate-700 truncate`}>
                            {trip.dropoff || '—'}
                          </div>
                        ) : (
                          <div className={`flex ${densityProfile.tableRowMinHeight} flex-col justify-between min-w-0 ${isLeanDensity ? 'border border-emerald-100 bg-emerald-50/70 rounded-lg px-2 py-1' : 'border border-emerald-100 bg-emerald-50/70 rounded-xl px-3 py-2'}`}>
                            {densityProfile.lineCount >= 3 && <div className="text-xs uppercase tracking-wide text-emerald-700 truncate">Dropoff</div>}
                            {densityProfile.lineCount >= 3 && densityProfile.showFacilityNames && dropoffFacilityName && (
                              <div className="text-xs uppercase tracking-wide text-emerald-800 truncate">{dropoffFacilityName}</div>
                            )}
                            <div className={`${densityProfile.lineCount >= 3 ? (isLeanDensity ? 'mt-0.5 text-xs' : 'mt-1 text-xs') : 'text-xs'} leading-snug text-slate-800 truncate`} style={getClampStyle(densityProfile.lineCount)}>
                              {trip.dropoff || 'Missing dropoff address'}
                            </div>
                            {densityProfile.lineCount >= 3 && densityProfile.showSecondaryPhones && dropoffPhone && (
                              <div className={`${isLeanDensity ? 'mt-0.5' : 'mt-1'} text-xs font-medium text-emerald-700`}>Hospital {dropoffPhone}</div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className={`${densityProfile.tableCell} align-top`}>
                        {isEditing ? (
                          <select value={ie.driverId || ''} onChange={event => setEditingTripData(current => ({ ...current, driverId: event.target.value }))} className={inlineCellClass} aria-label="Driver">
                            <option value="">Unassigned</option>
                            {drivers.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                          </select>
                        ) : densityProfile.lineCount === 1 ? (
                          <div className={`flex ${densityProfile.tableRowMinHeight} items-center text-xs truncate`}>
                            {driver ? (
                              <span className="text-slate-800">{driver.name}</span>
                            ) : (
                              <span className="text-rose-600">—</span>
                            )}
                          </div>
                        ) : densityProfile.lineCount === 2 ? (
                          <div className={`flex ${densityProfile.tableRowMinHeight} flex-col justify-center ${isLeanDensity ? 'border border-slate-200 bg-slate-50 rounded-lg px-2 py-1' : 'rounded-xl px-3 py-2'} ${densityProfile.showExecutiveAccent ? 'bg-slate-900 text-white' : 'bg-slate-50'}`}>
                            {driver ? (
                              <div className="text-xs text-slate-900 truncate">{driver.name}</div>
                            ) : (
                              <div className="text-xs text-rose-600 truncate">Awaiting assignment</div>
                            )}
                            {routeAssignments.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700">
                                  {routeAssignments[0].routeName}{routeAssignments.length > 1 ? ` +${routeAssignments.length - 1}` : ''}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className={`flex ${densityProfile.tableRowMinHeight} flex-col justify-between border border-slate-200 ${isLeanDensity ? 'rounded-lg px-2.5 py-1.5' : 'rounded-xl px-3 py-2'} ${densityProfile.showExecutiveAccent ? 'bg-slate-900 text-white' : 'bg-slate-50'}`}>
                            <div>
                              <div className={`text-xs uppercase tracking-wide ${densityProfile.showExecutiveAccent ? 'text-slate-300' : 'text-slate-500'}`}>Driver</div>
                              {driver ? (
                                <>
                                  <div className={`${isLeanDensity ? 'mt-0.5' : 'mt-1'} text-xs ${densityProfile.showExecutiveAccent ? 'text-white' : 'text-slate-900'}`}>{driver.name}</div>
                                  {densityProfile.showAssignmentMeta && densityProfile.lineCount >= 3 && (
                                    <div className={`${isLeanDensity ? 'mt-0.5' : 'mt-1'} text-xs font-medium leading-snug ${densityProfile.showExecutiveAccent ? 'text-slate-300' : 'text-slate-500'}`}>{driver.vehicle || driver.status || 'Driver active'}</div>
                                  )}
                                  {densityProfile.lineCount >= 4 && driver.homeAddress && (
                                    <div className={`${isLeanDensity ? 'mt-0.5' : 'mt-1'} text-xs font-medium truncate text-slate-500`}>
                                      <MapPin size={9} className="inline mr-0.5" />{driver.homeAddress}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className={`${isLeanDensity ? 'mt-0.5' : 'mt-1'} text-xs text-rose-600`}>Awaiting assignment</div>
                              )}
                            </div>
                            {routeAssignments.length > 0 && (
                              <div className={`${isLeanDensity ? 'mt-1' : 'mt-2'} flex flex-wrap gap-1`}>
                                {visibleRouteAssignments.map((route, routeIndex) => (
                                  <span key={`${route.templateId || route.routeName}-${routeIndex}`} className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">
                                    {route.routeName}{route.time ? ` @ ${route.time}` : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className={`${densityProfile.tableCell} align-top`}>
                        {isEditing ? (
                          <div className="space-y-1.5">
                            <select value={ie.status} onChange={event => setEditingTripData(current => ({ ...current, status: event.target.value }))} className={inlineCellClass} aria-label="Status">
                              {['Unassigned', 'Assigned', 'Navigating Pickup', 'At Pickup', 'In Transit', 'At Dropoff', 'Completed', 'No Show', 'Cancelled', 'Rerouted'].map(status => <option key={status} value={status}>{status}</option>)}
                            </select>
                            <input type="number" min="0" step="0.1" value={ie.distance} onChange={event => setEditingTripData(current => ({ ...current, distance: event.target.value }))} className={inlineCellClass} aria-label="Distance" placeholder="Distance" />
                            {inlineEditError && <p className="text-[10px] font-semibold text-rose-700">{inlineEditError}</p>}
                          </div>
                        ) : densityProfile.lineCount === 1 ? (
                          <div className={`flex ${densityProfile.tableRowMinHeight} items-center`}>
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${getStatusPillClass(trip.status)}`}>
                              {trip.status}
                            </span>
                          </div>
                        ) : (
                          <div className={`flex ${densityProfile.tableRowMinHeight} flex-col justify-between`}>
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs ${getStatusPillClass(trip.status)}`}>
                              {trip.status}
                            </span>
                            {densityProfile.lineCount >= 3 && densityProfile.showStatusMeta && ACTIVE_PROGRESS_STATUSES.includes(trip.status) && (
                              <div className={`${isLeanDensity ? 'mt-1' : 'mt-2'} flex items-center gap-1`}>
                                {(() => {
                                  const rawStatus = trip.status === 'In Mission' ? 'En Route' : trip.status === 'Navigating Pickup' ? 'En Route' : trip.status === 'Navigating Dropoff' ? 'In Transit' : trip.status === 'Arrived' ? 'At Dropoff' : trip.status;
                                  const stepIdx = ['Assigned','En Route','At Pickup','In Transit','At Dropoff','Completed'].indexOf(rawStatus);
                                  return ['Assigned','En Route','At Pickup','In Transit','At Dropoff','Completed'].map((step, stepIndex) => (
                                    <div key={stepIndex} className={`h-1.5 w-1.5 rounded-full ${stepIndex <= stepIdx ? 'bg-amber-500' : 'bg-slate-200'}`} />
                                  ));
                                })()}
                              </div>
                            )}
                            {densityProfile.lineCount >= 2 && (
                              <div className={`${densityProfile.lineCount >= 3 ? (isLeanDensity ? 'mt-1' : 'mt-2') : 'mt-0.5'} text-xs text-slate-500 truncate`}>
                                {bookingReference
                                  ? `${bookingReference}`
                                  : clientIdentifier
                                    ? `ID ${clientIdentifier}`
                                    : '—'}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className={`${densityProfile.tableCell} align-top`}>
                        <div className={`flex ${densityProfile.tableRowMinHeight} items-center justify-center`}>
                          <button onClick={(e) => { e.stopPropagation(); setSmsConversationTrip(trip); }} className="min-h-[40px] rounded-lg p-2 hover:bg-slate-100 transition-colors" title="View messages">
                            {trip.clientConfirmation === 'confirmed' ? (
                              <CheckCircle2 size={16} className="text-emerald-500" />
                            ) : trip.clientConfirmation === 'not_coming' ? (
                              <XCircle size={16} className="text-rose-500" />
                            ) : (
                              <MessageSquare size={16} className="text-slate-300 hover:text-slate-500" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className={`${densityProfile.tableCell} align-top`}>
                        <div className={`flex ${densityProfile.tableRowMinHeight} items-center gap-0.5`} onClick={(e) => e.stopPropagation()}>
                          {!isEditing && (
                            <button type="button" onClick={() => startInlineEdit(trip)} className="h-7 w-7 flex items-center justify-center rounded-lg text-blue-600 hover:bg-blue-100 transition-colors" title="Edit this row">
                              <Edit2 size={14} />
                            </button>
                          )}
                          <button onClick={() => setManualAssignTrip(trip)} className="h-7 w-7 flex items-center justify-center rounded-lg text-blue-600 hover:bg-blue-100 transition-colors" title="Assign / Reassign driver">
                            <Users size={14} />
                          </button>
                          <div className="relative" ref={actionsMenuTripId === trip.id ? actionsMenuRef : undefined}>
                            <button
                              type="button"
                              onClick={() => setActionsMenuTripId(actionsMenuTripId === trip.id ? null : trip.id)}
                              className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                              title="More actions"
                            >
                              <MoreVertical size={14} />
                            </button>
                            {actionsMenuTripId === trip.id && (
                              <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                                <button onClick={() => { setActionsMenuTripId(null); triggerSmartAssign(trip); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700">
                                  <BrainCircuit size={13} className="text-indigo-500" /> AI Assign
                                </button>
                                <button onClick={() => { setActionsMenuTripId(null); makeCall(getClientPhone(trip), trip.patient); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-700">
                                  <Phone size={13} className="text-emerald-500" /> Call Client
                                </button>
                                <button onClick={() => { setActionsMenuTripId(null); openSmsForTrip(trip); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700">
                                  <MessageSquare size={13} className="text-blue-500" /> SMS Client
                                </button>
                                <div className="my-1 border-t border-slate-100" />
                                {hasPermission(role, 'canDeleteTrip') && (
                                  <>
                                    <button onClick={() => { setActionsMenuTripId(null); markTripException(trip, 'Rerouted'); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-amber-50 hover:text-amber-700">
                                      <MapPin size={13} className="text-amber-500" /> Reroute
                                    </button>
                                    <button onClick={() => { setActionsMenuTripId(null); markTripException(trip, 'No Show'); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-800">
                                      <AlertCircle size={13} className="text-slate-500" /> No Show
                                    </button>
                                    <button onClick={() => { setActionsMenuTripId(null); markTripException(trip, 'Cancelled'); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-rose-50 hover:text-rose-700">
                                      <XCircle size={13} className="text-rose-500" /> Cancel
                                    </button>
                                    <button onClick={() => { setActionsMenuTripId(null); requestDeleteTrip(trip.id); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-800">
                                      <Archive size={13} className="text-slate-500" /> Archive
                                    </button>
                                  </>
                                )}
                                <div className="my-1 border-t border-slate-100" />
                                <button onClick={() => {
                                  setActionsMenuTripId(null);
                                  const nowInOut = !isInOutTrip(trip);
                                  updateTrip?.(trip.id, {
                                    inOutTrip: nowInOut,
                                    inOut: nowInOut,
                                    tripKind: nowInOut ? 'IN_OUT' : '',
                                    inOutStayWithClient: nowInOut,
                                    inOutWaitMinutes: nowInOut ? 5 : null,
                                    inOutLeg: nowInOut ? (trip.inOutLeg || 'A') : null,
                                  });
                                }} className={`flex w-full items-center gap-2 px-3 py-2 text-xs ${isInOutTrip(trip) ? 'text-emerald-700 hover:bg-emerald-50' : 'text-slate-700 hover:bg-emerald-50 hover:text-emerald-700'}`}>
                                  <RotateCcw size={13} className={isInOutTrip(trip) ? 'text-emerald-500' : 'text-slate-500'} /> {isInOutTrip(trip) ? 'Remove IN/OUT' : 'Mark IN/OUT'}
                                </button>
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleTripExpanded(trip.id)}
                            className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                            title={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className={`${rowBg} border-t border-slate-100`}>
                        <td colSpan={10} className="px-3 pb-3">
                          {renderExpandedTripDetails(trip, { compact: densityProfile.lineCount <= 2, embeddedInTable: true })}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">
            <div className="flex items-center gap-3">
              <span>Showing {visibleTrips.length} of {manifestFeedTrips.length} trip{manifestFeedTrips.length !== 1 ? 's' : ''}</span>
              {manifestFeedTrips.length > visibleTrips.length && (
                <button
                  type="button"
                  onClick={() => setManifestLimit((prev) => prev + 150)}
                  className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >
                  Load 150 More
                </button>
              )}
            </div>
            <span>{selectedTasks.length} selected</span>
          </div>
        </div>
      )}
    </div>
  );

  // ==================== Fleet Matrix ====================
  const renderFleetMatrix = () => (
    <div className="flex-1 overflow-y-auto overscroll-contain p-3">
      <div className="mb-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-100/50 bg-white px-4 py-3 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Drivers</div>
          <div className="mt-1 text-2xl text-slate-900">{fleetDrivers.length}</div>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-emerald-700">Available</div>
          <div className="mt-1 text-2xl text-emerald-800">{availableDrivers.length}</div>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-amber-700">Busy</div>
          <div className="mt-1 text-2xl text-amber-800">{busyDrivers.length}</div>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-blue-700">Active Trips</div>
          <div className="mt-1 text-2xl text-blue-800">{inProgressTrips.length}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {fleetDrivers.slice(0, fleetLimit).map(d => {
          const driverTrips = getDriverTrips(d.id);
          const isExpanded = expandedDriver === d.id;
          const isMaintenanceDue = d.nextOilChange != null && d.odometer != null && (d.nextOilChange - d.odometer < 200);
          return (
            <div key={d.id} className={`bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm transition-all duration-300 ${
              d.status === 'Available' ? 'border-emerald-200' : ''
            } ${isMaintenanceDue ? 'border-rose-200' : ''}`}>
              {/* Driver header */}
              <div className="p-4 cursor-pointer select-none" onClick={() => setExpandedDriver(isExpanded ? null : d.id)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm bg-gradient-to-br ${
                      d.status === 'Available'
                        ? 'from-emerald-500 to-teal-600 shadow-emerald-500/20'
                        : 'from-amber-500 to-orange-600 shadow-amber-500/20'
                    } text-white shadow-lg`}>
                      {String(d?.name || '?').charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm text-slate-900">{d.name || 'Unknown Driver'}</p>
                      <p className="text-xs text-slate-500">{d.vehicle}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded text-xs ${getDriverLiveStatus(d).color}`}>
                        {getDriverLiveStatus(d).label}
                      </span>
                    </div>
                    <div className="p-1 rounded hover:bg-slate-100 transition-colors">
                      {isExpanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2.5 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><MapPin size={10} /> {d.currentZone}</span>
                  <span className="opacity-50">|</span>
                  <span>{d.odometer?.toLocaleString()} mi</span>
                  {isMaintenanceDue && (
                    <span className="text-rose-600 flex items-center gap-1">
                      <AlertTriangle size={10} /> Service Due
                    </span>
                  )}
                </div>
              </div>

              {/* Expanded: assigned trips */}
              {isExpanded && (
                <div className="animate-scale-in bg-slate-50 border-t border-slate-100">
                  {driverTrips.length > 0 ? (
                    <div className="p-3 space-y-1.5">
                      <p className="text-xs uppercase tracking-wide text-slate-500 px-1">Active Trips ({driverTrips.length})</p>
                      {driverTrips.map(t => {
                        const isTripCardExpanded = isTripExpanded(t.id);
                        const bookingReference = getBookingReference(t);
                        const clientIdentifier = getClientIdentifier(t);
                        const clientPhone = formatPhoneDisplay(getClientPhone(t));
                        const pickupPhone = formatPhoneDisplay(t.pickupPhone);
                        const dropoffPhone = formatPhoneDisplay(t.dropoffPhone);
                        const routeAssignments = routeTripMap[t.id] || [];
                        const visibleRouteAssignments = routeAssignments.slice(0, densityProfile.routeChipLimit);
                        return (
                        <div key={t.id} className={`${isLeanDensity ? 'p-2.5' : 'p-3'} rounded-xl bg-white border border-slate-200 transition-all duration-150`}>
                          <div className="cursor-pointer hover:bg-slate-50 rounded-lg transition-colors" onClick={() => openTripDetails(t)}>
                          <div className="flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-slate-900 truncate">{t.patient}</p>
                              {densityProfile.lineCount <= 2 ? (
                                <div className="mt-0.5 text-xs text-slate-500" style={getClampStyle(densityProfile.lineCount)}>
                                  {[bookingReference, clientIdentifier && `ID ${clientIdentifier}`, (t.type || t.serviceType)].filter(Boolean).join(' • ')}
                                </div>
                              ) : (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {bookingReference && (
                                  <span className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
                                    {bookingReference}
                                  </span>
                                )}
                                {clientIdentifier && (
                                  <span className="inline-flex items-center rounded-full border border-violet-100 bg-violet-50 px-1.5 py-0.5 text-xs text-violet-700">
                                    {clientIdentifier}
                                  </span>
                                )}
                                {(t.type || t.serviceType) && (
                                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                                    {t.type || t.serviceType}
                                  </span>
                                )}
                              </div>
                              )}
                            </div>
                            <span className="text-xs font-mono text-emerald-600 font-semibold">{to12hr(t.time)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                            <span className="truncate text-blue-600" style={getClampStyle(1)}>{t.pickup}</span>
                            <ArrowRight size={8} className="shrink-0 text-slate-500 opacity-50" />
                            <span className="truncate text-emerald-600" style={getClampStyle(1)}>{t.dropoff}</span>
                          </div>
                          {(clientPhone || pickupPhone || dropoffPhone || routeAssignments.length > 0 || t.notes) && (
                            <div className="mt-1.5 space-y-1">
                              <div className="flex flex-wrap gap-1">
                              {clientPhone && (
                                <span className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                                  Client {clientPhone}
                                </span>
                              )}
                              {densityProfile.showSecondaryPhones && pickupPhone && pickupPhone !== clientPhone && (
                                <span className="inline-flex items-center rounded-full border border-cyan-100 bg-cyan-50 px-1.5 py-0.5 text-xs font-medium text-cyan-700">
                                  Pickup desk {pickupPhone}
                                </span>
                              )}
                              {densityProfile.showSecondaryPhones && dropoffPhone && (
                                <span className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
                                  Hospital {dropoffPhone}
                                </span>
                              )}
                              {visibleRouteAssignments.map((route, routeIndex) => (
                                <span key={`${route.templateId || route.routeName}-${routeIndex}`} className="inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700">
                                  <Route size={10} /> {route.routeName}{route.time ? ` @ ${route.time}` : ''}
                                </span>
                              ))}
                              </div>
                              {densityProfile.showNotesPreview && t.notes && <div className="text-xs font-medium leading-relaxed text-amber-700" style={getClampStyle(densityProfile.noteLines)}>Notes: {t.notes}</div>}
                            </div>
                          )}
                          </div>
                          {isTripCardExpanded && (
                            <div className="mt-2">
                              {renderExpandedTripDetails(t, { compact: densityProfile.lineCount <= 2, embeddedInTable: true })}
                            </div>
                          )}
                        </div>
                      )})}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-xs text-slate-500">No active trips</div>
                  )}
                  {d.phone && (
                    <div className="px-3 pb-3 flex gap-2">
                      <button onClick={() => makeCall(d.phone, d.name)} className="flex-1 min-h-[40px] py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-medium transition-all duration-200 flex items-center justify-center gap-1.5 hover:bg-emerald-100">
                        <Phone size={16} /> Call
                      </button>
                      <button onClick={() => sendSMS(d.phone, d.name)} className="flex-1 min-h-[40px] py-2 bg-blue-50 border border-blue-100 text-blue-700 rounded-xl text-xs font-medium transition-all duration-200 flex items-center justify-center gap-1.5 hover:bg-blue-100">
                        <MessageSquare size={16} /> SMS
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {fleetDrivers.length > fleetLimit && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setFleetLimit((prev) => prev + 30)}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-700 hover:bg-slate-50"
          >
            Load 30 More Drivers
          </button>
        </div>
      )}
    </div>
  );

  // ==================== WILL CALL VIEW ====================
  const renderWillCall = () => (
    <div className="flex-1 overflow-y-auto overscroll-contain p-3">
      {willCallTrips.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-xs shadow-sm">
            <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
              <Phone size={28} />
            </div>
            <p className="text-base text-slate-900">No will call trips</p>
            <p className="text-sm mt-1.5">All pending trips are assigned</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {willCallTrips.map(t => {
            const isTripCardExpanded = isTripExpanded(t.id);
            const bookingReference = getBookingReference(t);
            const clientIdentifier = getClientIdentifier(t);
            const clientPhone = formatPhoneDisplay(getClientPhone(t));
            const pickupPhone = formatPhoneDisplay(t.pickupPhone);
            const dropoffPhone = formatPhoneDisplay(t.dropoffPhone);
            const routeAssignments = routeTripMap[t.id] || [];
            const visibleRouteAssignments = routeAssignments.slice(0, densityProfile.routeChipLimit);
            return (
            <div key={t.id} className="group bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col">
              {/* Top Status Indicator */}
              <div className="h-1.5 w-full bg-blue-500" />
              <div className={`${isLeanDensity ? 'p-3 sm:p-3.5' : 'p-4 sm:p-5'} cursor-pointer`} onClick={() => openTripDetails(t)}>
                <div className={`flex items-start justify-between gap-3 ${isLeanDensity ? 'mb-2.5' : 'mb-4'}`}>
                  <div className="flex-1 min-w-0">
                    {densityProfile.lineCount <= 2 ? (
                      <div className="text-xs text-slate-500" style={getClampStyle(densityProfile.lineCount)}>
                        {['Will Call', bookingReference, clientIdentifier && `ID ${clientIdentifier}`, (t.type || t.serviceType)].filter(Boolean).join(' • ')}
                      </div>
                    ) : (
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="px-2 py-0.5 rounded-md text-xs uppercase tracking-wide bg-slate-100 text-slate-700">Will Call</span>
                      {bookingReference && (
                        <span className="px-2 py-0.5 rounded-md text-xs bg-blue-50 text-blue-700 border border-blue-100">{bookingReference}</span>
                      )}
                      {clientIdentifier && (
                        <span className="px-2 py-0.5 rounded-md text-xs bg-violet-50 text-violet-700 border border-violet-100">{clientIdentifier}</span>
                      )}
                      {(t.type || t.serviceType) && (
                        <span className="px-2 py-0.5 rounded-md text-xs bg-slate-100 text-slate-600 border border-slate-200">{t.type || t.serviceType}</span>
                      )}
                    </div>
                    )}
                    <h3 className={`text-slate-900 ${isLeanDensity ? 'text-base' : 'text-lg'} truncate leading-tight`}>{t.patient}</h3>
                    {(clientPhone || pickupPhone || dropoffPhone || routeAssignments.length > 0) && (
                      <div className={`${isLeanDensity ? 'mt-1' : 'mt-2'} flex flex-wrap gap-1`}>
                        {clientPhone && (
                          <span className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                            Client {clientPhone}
                          </span>
                        )}
                        {densityProfile.showSecondaryPhones && pickupPhone && pickupPhone !== clientPhone && (
                          <span className="inline-flex items-center rounded-full border border-cyan-100 bg-cyan-50 px-2 py-0.5 text-xs text-cyan-700">
                            Pickup desk {pickupPhone}
                          </span>
                        )}
                        {densityProfile.showSecondaryPhones && dropoffPhone && (
                          <span className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                            Hospital {dropoffPhone}
                          </span>
                        )}
                        {visibleRouteAssignments.map((route, routeIndex) => (
                          <span key={`${route.templateId || route.routeName}-${routeIndex}`} className="inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                            <Route size={10} /> {route.routeName}{route.time ? ` @ ${route.time}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => startInlineEdit(t)} className="min-h-[40px] p-2 rounded hover:bg-blue-100 text-slate-500 hover:text-blue-600 transition-colors" title="Edit"><Edit2 size={16} /></button>
                    {hasPermission(role, 'canDeleteTrip') && (
                      <button onClick={() => requestDeleteTrip(t.id)} className="min-h-[40px] p-2 rounded hover:bg-rose-100 text-slate-500 hover:text-rose-600 transition-colors" title="Archive Trip"><Archive size={16} /></button>
                    )}
                  </div>
                </div>
                {/* Addresses - Inner Information Cards Style */}
                <div className={isLeanDensity ? 'space-y-1.5' : 'space-y-2'}>
                  <div className={`bg-white rounded-xl border border-slate-200 ${isLeanDensity ? 'p-2' : 'p-2.5'} shadow-sm flex items-start gap-3`}>
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <MapPin size={16} className="text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <p className="text-xs uppercase tracking-wide text-slate-500 mb-0.5">Pickup</p>
                      <p className="text-blue-600 text-sm" style={getClampStyle(densityProfile.lineCount)}>{t.pickup}</p>
                      {densityProfile.showFacilityNames && getPickupFacilityName(t) && <p className="mt-1 text-xs uppercase tracking-wide text-blue-700">{getPickupFacilityName(t)}</p>}
                    </div>
                  </div>
                  <div className={`bg-white rounded-xl border border-slate-200 ${isLeanDensity ? 'p-2' : 'p-2.5'} shadow-sm flex items-start gap-3`}>
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <MapPin size={16} className="text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <p className="text-xs uppercase tracking-wide text-slate-500 mb-0.5">Dropoff</p>
                      <p className="text-emerald-600 text-sm" style={getClampStyle(densityProfile.lineCount)}>{t.dropoff}</p>
                      {densityProfile.showFacilityNames && getDropoffFacilityName(t) && <p className="mt-1 text-xs uppercase tracking-wide text-emerald-700">{getDropoffFacilityName(t)}</p>}
                    </div>
                  </div>
                </div>
                {densityProfile.showNotesPreview && t.notes && (
                  <div className={`${isLeanDensity ? 'mt-2' : 'mt-3'} rounded-xl border border-amber-200 bg-amber-50 p-2.5`}>
                    <p className="text-xs uppercase tracking-wide text-amber-700">Notes</p>
                    <p className="mt-1 text-xs font-medium leading-relaxed text-amber-800" style={getClampStyle(densityProfile.noteLines)}>{t.notes}</p>
                  </div>
                )}
              </div>
              {isTripCardExpanded && (
                <div className="border-t border-slate-200 bg-slate-50 p-3">
                  {renderExpandedTripDetails(t, { compact: densityProfile.lineCount <= 2 })}
                </div>
              )}
            </div>
          )})}
        </div>
      )}
    </div>
  );

  // ==================== MAIN RENDER ====================
  return (
    <div className="flex flex-col min-h-full">
      {/* Unified Control Bar */}
      {renderControlBar()}

      {showIntelligence && (
        <CommandIntelligencePanel
          trips={trips}
          drivers={drivers}
          dispatchers={dispatchers}
          routeTemplates={routeTemplates}
          onFocusLate={() => { setOperationsTab('manifest'); setFilterStatus('all'); setFilterUrgency('late'); }}
          onFocusUpcoming={() => { setOperationsTab('manifest'); setFilterStatus('all'); setFilterUrgency('upcoming'); }}
          onFocusUnassigned={() => { setOperationsTab('manifest'); setFilterStatus('Unassigned'); setFilterUrgency('all'); }}
          onFocusFleet={() => { setOperationsTab('fleet'); setFilterStatus('all'); setFilterUrgency('all'); }}
          onFocusRoutes={() => { if (onOpenSequencer) onOpenSequencer(); else setOperationsTab('manifest'); }}
          onOptimize={triggerFleetOptimization}
        />
      )}

      {/* Content */}
      {operationsTab === 'manifest' && (manifestView === 'card' ? renderDispatchCards() : manifestView === 'board' ? renderManifestBoard() : renderTripTable())}
      {operationsTab === 'willcall' && renderWillCall()}
      {operationsTab === 'fleet' && renderFleetMatrix()}

      {showSmsModal && (
        <SendSmsModal
          trips={trips.filter(t => selectedTasks.includes(t.id))}
          onClose={() => { setShowSmsModal(false); setSelectedTasks([]); }}
        />
      )}
      {smsConversationTrip && (
        <SmsConversationModal
          trip={smsConversationTrip}
          onClose={() => setSmsConversationTrip(null)}
        />
      )}
    </div>
  );
};

export default OperationsCommandCenter;
