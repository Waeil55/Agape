import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  FileText, Users, AlertCircle, Clock, CheckCircle2, XCircle,
  Truck,
  BrainCircuit, Phone, MessageSquare,
  ChevronDown, ChevronUp, AlertTriangle, MapPin,
  Square, CheckSquare, X, ArrowRight, TrendingUp, TrendingDown,
  Trash2, Archive, UploadCloud, Plus, Edit2, Route, Search, PanelRight, Loader2
} from 'lucide-react';
import { db, doc, onSnapshot } from '../config/firebase';
import { tripCalendarDateKey, localCalendarYmd } from '../utils/tripDate';
import SendSmsModal from './SendSmsModal';
import SmsConversationModal from './SmsConversationModal';
import { getOperationalRoutes } from '../utils/routePlans';
import EditTripModal from './EditTripModal';
import CommandIntelligencePanel from './CommandIntelligencePanel';
import { aiPrioritizeTrips } from '../config/ai';


const TERMINAL_STATUSES = ['Completed', 'Cancelled', 'No Show'];
const TIME_SORT_BOTTOM_STATUSES = ['Cancelled', 'No Show', 'Rerouted'];
const ACTIVE_PROGRESS_STATUSES = ['In Mission', 'En Route', 'At Pickup', 'At Dropoff', 'Assigned', 'In Progress', 'Navigating Pickup', 'Navigating Dropoff', 'In Transit', 'Arrived'];
const MANIFEST_VIEW_OPTIONS = [
  { value: 'board', label: 'Board' },
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
  { value: 'sparse', label: '2 Lines' },
  { value: 'dense', label: '3 Lines' },
  { value: 'compact', label: '4 Lines' },
  { value: 'comfortable', label: '5 Lines' },
  { value: 'detailed', label: '6 Lines' },
  { value: 'executive', label: 'Full' },
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
        cardText: 'text-[10px]',
        cardTitle: 'text-sm',
        cardTime: 'text-xs',
        sectionGrid: 'lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]',
        tableHead: 'px-2 py-1.5',
        tableCell: 'px-2 py-1.5',
        tableRowMinHeight: 'min-h-[32px]',
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
        cardText: 'text-[11px]',
        cardTitle: 'text-sm',
        cardTime: 'text-[13px]',
        sectionGrid: 'lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]',
        tableHead: 'px-2.5 py-1.5',
        tableCell: 'px-2.5 py-2',
        tableRowMinHeight: 'min-h-[48px]',
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
        cardText: 'text-[11px]',
        cardTitle: 'text-sm',
        cardTime: 'text-[13px]',
        sectionGrid: 'lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]',
        tableHead: 'px-3 py-2',
        tableCell: 'px-3 py-2',
        tableRowMinHeight: 'min-h-[60px]',
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
        tableHead: 'px-3 py-2.5',
        tableCell: 'px-3 py-2.5',
        tableRowMinHeight: 'min-h-[72px]',
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
        tableHead: 'px-4 py-3',
        tableCell: 'px-4 py-3.5',
        tableRowMinHeight: 'min-h-[104px]',
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
        tableHead: 'px-5 py-3.5',
        tableCell: 'px-5 py-4',
        tableRowMinHeight: 'min-h-[132px]',
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
        tableHead: 'px-4 py-3',
        tableCell: 'px-4 py-3',
        tableRowMinHeight: 'min-h-[88px]',
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
  onOpenLiveMap, showRightPanel, onTogglePanel, isOnline,
  phoneNumbers
}) => {
  const [filterStatus, setFilterStatus] = useState(() => localStorage.getItem('agape_opsFilterStatus') || 'all');
  const [filterUrgency, setFilterUrgency] = useState(() => localStorage.getItem('agape_opsFilterUrgency') || 'all');
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
  const [manifestDensity, setManifestDensity] = useState(() => localStorage.getItem('agape_opsManifestDensity') || 'comfortable');
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [smsConversationTrip, setSmsConversationTrip] = useState(null);
  const openSmsForTrip = (trip) => { setSelectedTasks([trip.id]); setShowSmsModal(true); };
  const [showOnlyAttention, setShowOnlyAttention] = useState(() => localStorage.getItem('agape_opsShowOnlyAttention') === 'true');
  const [routeTemplates, setRouteTemplates] = useState([]);
  const [showIntelligence, setShowIntelligence] = useState(() => localStorage.getItem('agape_opsShowIntelligence') !== 'false');
  const [expandedTripIds, setExpandedTripIds] = useState([]);
  const [lastIntelRefresh, setLastIntelRefresh] = useState(() => new Date().toISOString());
  const [aiSortOrder, setAiSortOrder] = useState(null);
  const [aiSortLoading, setAiSortLoading] = useState(false);
  const [editTrip, setEditTrip] = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => localCalendarYmd());
  const todayTrips = trips.filter(t => { const dk = tripCalendarDateKey(t.date); return dk === undefined || dk === selectedDate; });
  const unassignedTrips = todayTrips.filter(t => t.status === 'Unassigned');
  const inProgressTrips = todayTrips.filter(t => ACTIVE_PROGRESS_STATUSES.includes(t.status));
  const completedToday = todayTrips.filter(t => t.status === 'Completed');
  const lateTrips = todayTrips.filter(t => isTripLate(t.time) && !TERMINAL_STATUSES.includes(t.status));
  const willCallTrips = todayTrips.filter(t => t.time === 'Will Call');
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
  const availableDrivers = drivers.filter(d => d.status === 'Available');
  const busyDrivers = drivers.filter(d => d.status !== 'Available');
  const driverOptions = useMemo(
    () => [...drivers].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [drivers]
  );
  const fleetDrivers = useMemo(() => {
    const sorted = [...drivers].sort((a, b) => {
      const aTrips = inProgressTrips.filter((trip) => trip.driverId === a.id).length;
      const bTrips = inProgressTrips.filter((trip) => trip.driverId === b.id).length;
      if (bTrips !== aTrips) return bTrips - aTrips;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    if (driverFilter !== 'all' && driverFilter !== 'unassigned') {
      return sorted.filter((driver) => driver.id === driverFilter);
    }
    return sorted;
  }, [driverFilter, drivers, inProgressTrips]);
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

  const searchedTrips = searchQuery
    ? todayTrips.filter(t =>
        t.patient.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.bookingId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.pickup || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.dropoff || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : todayTrips;

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
    const originalOrder = new Map(result.map((trip, index) => [trip.id, index]));
    const driverNameForTrip = (trip) => {
      const driver = drivers.find((entry) => entry.id === trip.driverId);
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
      if (sortBy === 'ai' && aiSortOrder) {
        const ia = aiSortOrder.indexOf(a.id);
        const ib = aiSortOrder.indexOf(b.id);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      }
      return (originalOrder.get(a.id) || 0) - (originalOrder.get(b.id) || 0);
    });
    return result;
  }, [searchedTrips, filterStatus, filterUrgency, driverFilter, serviceFilter, sortBy, sortDirection, timeSortBottomInactive, operationsTab, aiSortOrder, drivers]);

  useEffect(() => {
    setManifestLimit(150);
  }, [searchQuery, operationsTab, filterStatus, filterUrgency, driverFilter, serviceFilter, sortBy, sortDirection, timeSortBottomInactive, showOnlyAttention]);

  useEffect(() => {
    setFleetLimit(60);
  }, [driverFilter, operationsTab]);

  const getDriverTrips = (driverId) => {
    return inProgressTrips.filter(t => t.driverId === driverId);
  };

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'routeData', 'sequences'), (snap) => {
      if (snap.exists()) {
        const templates = snap.data().templates || [];
        setRouteTemplates(getOperationalRoutes(templates));
      } else {
        setRouteTemplates([]);
      }
    });
    return () => unsub();
  }, []);

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

  const renderExpandedTripDetails = (trip, options = {}) => {
    const { compact = false, embeddedInTable = false } = options;
    const driver = drivers.find((entry) => entry.id === trip.driverId);
    const routeAssignments = routeTripMap[trip.id] || [];
    const bookingReference = getBookingReference(trip);
    const clientIdentifier = getClientIdentifier(trip);
    const clientPhone = formatPhoneDisplay(trip.patientPhone || trip.pickupPhone);
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
      ['Hospital phone', dropoffPhone],
      ['Hospital alt', hasDisplayValue(trip.hospitalPhone) && formatPhoneDisplay(trip.hospitalPhone) !== dropoffPhone ? formatPhoneDisplay(trip.hospitalPhone) : ''],
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
      <div className={`${embeddedInTable ? 'rounded-3xl border border-slate-100/50 bg-slate-50/80 p-4 shadow-sm' : 'mt-2 rounded-3xl border border-slate-100/50 bg-slate-50/80 p-4 shadow-sm'} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700">
              {to12hr(trip.time)}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getStatusPillClass(trip.status)}`}>
              {trip.status}
            </span>
            {bookingReference && (
              <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                {bookingReference}
              </span>
            )}
            {clientIdentifier && (
              <span className="rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                {clientIdentifier}
              </span>
            )}
            {serviceLabel && (
              <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                {serviceLabel}
              </span>
            )}
            {passengerTypes && (
              <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                {passengerTypes}
              </span>
            )}
            {spaceTypes && spaceTypes !== passengerTypes && (
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600">
                {spaceTypes}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => toggleTripExpanded(trip.id)}
            className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
          >
            Collapse
          </button>
        </div>

        <div className={`grid gap-3 ${compact ? 'xl:grid-cols-[1.1fr_1.1fr_0.9fr]' : 'xl:grid-cols-[1.15fr_1.15fr_0.95fr]'}`}>
          <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">Pickup</p>
            <div className="mt-2 space-y-2">
              {pickupItems.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 text-[10px] font-medium text-slate-600">
                  <span className="font-bold uppercase tracking-wide text-blue-700">{label}</span>
                  <span className="break-words text-slate-900">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Dropoff</p>
            <div className="mt-2 space-y-2">
              {dropoffItems.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 text-[10px] font-medium text-slate-600">
                  <span className="font-bold uppercase tracking-wide text-emerald-700">{label}</span>
                  <span className="break-words text-slate-900">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Manifest Summary</p>
            <div className="mt-2 space-y-2">
              {manifestSummaryItems.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 text-[10px] font-medium text-slate-600">
                  <span className="font-bold uppercase tracking-wide text-slate-500">{label}</span>
                  <span className="break-words text-slate-900">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {(routeAssignments.length > 0 || noteItems.length > 0 || mobility.length > 0 || mobilityAids) && (
          <div className="grid gap-3 xl:grid-cols-[0.95fr_1.25fr]">
            <div className="rounded-2xl border border-blue-100 bg-white p-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">Route & Transport</p>
              {routeAssignments.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {routeAssignments.map((route, index) => (
                    <span
                      key={`${route.templateId || route.routeName}-${index}`}
                      className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700"
                    >
                      <Route size={10} /> {route.routeName}{route.time ? ` @ ${route.time}` : ''}{route.statusLabel ? ` - ${route.statusLabel}` : ''}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-[10px] font-medium text-slate-500">Not assigned to a saved route plan.</p>
              )}
              {(mobility.length > 0 || mobilityAids) && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {mobilityAids && (
                    <span className="rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      {mobilityAids}
                    </span>
                  )}
                  {mobility.map((tag) => (
                    <span key={tag} className="rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-amber-100 bg-white p-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Comments, Message & Notes</p>
              <div className="mt-2 space-y-2">
                {noteItems.length > 0 ? noteItems.map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-amber-100 bg-amber-50 p-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">{label}</p>
                    <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-700 break-words">{value}</p>
                  </div>
                )) : (
                  <p className="text-[10px] font-medium text-slate-500">No trip notes recorded.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {extraUploadedFields.length > 0 && (
          <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Additional Uploaded Fields</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {extraUploadedFields.map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-1 text-[11px] font-medium break-words text-slate-800">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const manifestFeedTrips = useMemo(() => {
    if (!showOnlyAttention) return filteredTrips;
    return filteredTrips.filter((trip) => {
      const urgency = getTripUrgencyLevel(trip);
      return trip.status === 'Unassigned' || urgency === 'late' || urgency === 'soon';
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
        return { key: trip.status || 'No status', label: trip.status || 'No status', order: trip.status === 'Unassigned' ? 0 : trip.status === 'Assigned' ? 1 : ACTIVE_PROGRESS_STATUSES.includes(trip.status) ? 2 : 3 };
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
    <div className="flex items-center justify-between gap-3 px-2 py-1.5 border-b border-slate-200 bg-white shrink-0 overflow-x-auto no-scrollbar sticky top-0 z-20 shadow-sm">
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="flex items-center gap-0.5 shrink-0 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
          {['manifest', 'willcall', 'fleet'].map(tab => (
            <button
              key={tab}
              onClick={() => setOperationsTab(tab)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all duration-200 ${
                operationsTab === tab
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 border border-transparent'
              }`}
            >
              {tab === 'manifest' ? 'Manifest' : tab === 'willcall' ? 'Will Call' : 'Fleet'}
            </button>
          ))}
        </div>

        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-2 py-1 text-[10px] card-premiumtext-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 hover:bg-slate-50 cursor-pointer">
          <option value="all">All</option>
          <option value="Unassigned">Unassigned</option>
          <option value="Assigned">Assigned</option>
          <option value="in-progress">In Progress</option>
          <option value="In Mission">In Mission</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
          <option value="No Show">No Show</option>
          <option value="Rerouted">Rerouted</option>
        </select>

        <div className="flex items-center gap-1">
          <select value={sortBy} onChange={(e) => handleSortSelect(e.target.value)} className="px-2 py-1 text-[10px] card-premiumtext-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 hover:bg-slate-50 cursor-pointer">
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          {sortBy !== 'ai' && (
            <button
              type="button"
              onClick={() => setSortDirection((prev) => prev === 'asc' ? 'desc' : 'asc')}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
              title="Toggle sort direction"
            >
              {sortDirection === 'asc' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {sortDirection === 'asc' ? 'Asc' : 'Desc'}
            </button>
          )}
          {sortBy === 'time' && (
            <button
              type="button"
              onClick={() => setTimeSortBottomInactive((prev) => !prev)}
              className={`inline-flex items-center gap-1 rounded-xl border px-2 py-1 text-[10px] font-bold transition-colors ${
                timeSortBottomInactive
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
              title="Keep Cancelled, No Show, and Rerouted trips at the bottom while sorting by schedule"
            >
              {timeSortBottomInactive ? <CheckCircle2 size={11} /> : <Square size={11} />}
              Closed bottom
            </button>
          )}
          {sortBy === 'ai' && aiSortLoading && <Loader2 size={11} className="text-blue-600 animate-spin shrink-0" />}
        </div>
        <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} className="px-2 py-1 text-[10px] card-premiumtext-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 hover:bg-slate-50 cursor-pointer">
          <option value="all">Drivers</option>
          <option value="unassigned">No Driver</option>
          {driverOptions.map((driver) => (
            <option key={driver.id} value={driver.id}>{driver.name}</option>
          ))}
        </select>

      </div>

      <div className="flex items-center gap-1 shrink-0 ml-auto">
        <button
          type="button"
          onClick={() => setShowAddTripModal(true)}
          className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700 transition hover:bg-blue-100"
        >
          <Plus size={11} /> Trip
        </button>
        <button
          type="button"
          onClick={() => setShowUploadModal(true)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          <UploadCloud size={11} /> Upload
        </button>
        <button
          type="button"
          onClick={() => onOpenSequencer?.()}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          <Route size={11} /> Routes
        </button>
        <button
          type="button"
          onClick={() => onOpenLiveMap?.()}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          <MapPin size={11} /> Map
        </button>

        <div className="hidden lg:flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1">
          <Search size={11} className="text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search"
            className="w-28 bg-transparent text-[10px] font-medium text-slate-700 placeholder:text-slate-400 outline-none"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} className="text-slate-400 transition hover:text-slate-600" title="Clear search">
              <X size={11} />
            </button>
          )}
        </div>
        <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
          className="px-2 py-1 text-[10px] bg-white border border-slate-200 rounded-md text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 hover:bg-slate-50 cursor-pointer" />

        {operationsTab === 'manifest' && (
          <>
            <select value={manifestView} onChange={(e) => setManifestView(e.target.value)} className="px-2 py-1 text-[10px] bg-white border border-slate-200 rounded-md text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 hover:bg-slate-50 cursor-pointer">
              {MANIFEST_VIEW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {manifestView === 'board' && (
              <select value={manifestGroupBy} onChange={(e) => setManifestGroupBy(e.target.value)} className="px-2 py-1 text-[10px] bg-white border border-slate-200 rounded-md text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 hover:bg-slate-50 cursor-pointer">
                {MANIFEST_GROUP_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => setShowOnlyAttention((prev) => !prev)}
              className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors ${
                showOnlyAttention
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Attention Only
            </button>
          </>
        )}

        <select value={manifestDensity} onChange={(e) => setManifestDensity(e.target.value)} className="px-2 py-1 text-[10px] bg-white border border-slate-200 rounded-md text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 hover:bg-slate-50 cursor-pointer">
          {DENSITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>

        {selectedTasks.length > 0 && (
          <>
            <button onClick={() => setBulkAssignModal(true)} className="flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md text-[10px] font-semibold transition-colors shrink-0 border border-emerald-200">
              <Users size={11} /> Assign {selectedTasks.length}
            </button>
            <button onClick={() => requestBulkDelete(selectedTasks, () => setSelectedTasks([]))} className="flex items-center gap-1 px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-md text-[10px] font-semibold transition-colors shrink-0 border border-rose-200">
              <Archive size={11} /> Archive {selectedTasks.length}
            </button>
            {hasPermission(role, 'canSendSms') && (
            <button onClick={() => setShowSmsModal(true)} className="flex items-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md text-[10px] font-semibold transition-colors shrink-0 border border-blue-200">
              <MessageSquare size={11} /> SMS {selectedTasks.length}
            </button>
            )}
          </>
        )}

        <button
          onClick={() => setShowIntelligence(prev => !prev)}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all shrink-0 border ${
            showIntelligence
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
          title={showIntelligence ? 'Hide Enterprise Intelligence' : 'Show Enterprise Intelligence'}
        >
          <BrainCircuit size={11} /> Intel
        </button>

        <button
          type="button"
          onClick={onTogglePanel}
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold transition ${
            showRightPanel
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          <PanelRight size={11} /> Panel
        </button>
      </div>
    </div>
  );

  const renderManifestCard = (trip) => {
    const isExpanded = isTripExpanded(trip.id);
    const isSelected = selectedTasks.includes(trip.id);
    const urgency = getTripUrgencyLevel(trip);
    const isLate = urgency === 'late';
    const driver = drivers.find((entry) => entry.id === trip.driverId);
    const routeAssignments = routeTripMap[trip.id] || [];
    const bookingReference = getBookingReference(trip);
    const clientIdentifier = getClientIdentifier(trip);
    const clientPhone = formatPhoneDisplay(trip.patientPhone || trip.pickupPhone);
    const pickupPhone = formatPhoneDisplay(trip.pickupPhone);
    const dropoffPhone = formatPhoneDisplay(trip.dropoffPhone);
    const pickupFacilityName = getPickupFacilityName(trip);
    const dropoffFacilityName = getDropoffFacilityName(trip);
    const serviceLabel = trip.type || trip.serviceType;
    const clientSummary = [bookingReference, clientIdentifier && `ID ${clientIdentifier}`, serviceLabel].filter(Boolean).join(' | ');
    const visibleRouteAssignments = routeAssignments.slice(0, densityProfile.routeChipLimit);

    const cardClasses = `rounded-2xl border bg-white transition-all duration-150 ${densityProfile.cardPadding} shadow-sm ${
      isSelected
        ? 'border-blue-300 ring-1 ring-blue-500/20'
        : isExpanded
          ? 'border-blue-300 ring-1 ring-blue-500/15 shadow-md'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
    }`;

    if (densityProfile.lineCount === 1) {
      return (
        <div key={trip.id} className={cardClasses}>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedTasks((prev) => prev.includes(trip.id) ? prev.filter((id) => id !== trip.id) : [...prev, trip.id]); }} className={`shrink-0 rounded p-0.5 transition-all duration-150 ${isSelected ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`} title={isSelected ? 'Deselect trip' : 'Select trip'}>
              {isSelected ? <CheckSquare size={12} /> : <Square size={12} />}
            </button>
            <span className={`shrink-0 font-mono font-bold text-[10px] ${isLate ? 'text-rose-600' : urgency === 'soon' ? 'text-amber-600' : 'text-emerald-600'}`}>{to12hr(trip.time)}</span>
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${getStatusPillClass(trip.status)}`}>{trip.status}</span>
            <button onClick={(e) => { e.stopPropagation(); setSmsConversationTrip(trip); }} className="shrink-0 rounded p-0.5 hover:bg-slate-100 transition-colors" title="View messages">
              {trip.clientConfirmation === 'confirmed' ? <CheckCircle2 size={10} className="text-emerald-500" />
              : trip.clientConfirmation === 'not_coming' ? <XCircle size={10} className="text-rose-500" />
              : <MessageSquare size={10} className="text-slate-300 hover:text-slate-500" />}
            </button>
            <span className="truncate text-[11px] font-black text-slate-900">{trip.patient || 'Unnamed Client'}</span>
            {routeAssignments.length > 0 && (
              <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700">
                <Route size={9} /> {routeAssignments[0].routeName}
              </span>
            )}
            <span className="hidden md:inline truncate text-[10px] text-slate-500 font-medium">{trip.pickup || ''}</span>
            <span className="hidden md:inline text-[10px] text-slate-300">to</span>
            <span className="hidden md:inline truncate text-[10px] text-slate-500 font-medium">{trip.dropoff || ''}</span>
            {clientPhone && <span className="shrink-0 text-[9px] font-semibold text-emerald-700">{clientPhone}</span>}
            {driver && <span className="hidden lg:inline truncate text-[10px] text-slate-500">{driver.name}</span>}
            <div className="ml-auto flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => toggleTripExpanded(trip.id)}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title={isExpanded ? 'Collapse trip details' : 'Expand trip details'}
              >
                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {!driver && (
                <>
                  <button onClick={() => triggerSmartAssign(trip)} className="rounded p-0.5 text-indigo-600 hover:bg-indigo-100" title="AI assign"><BrainCircuit size={12} /></button>
                  <button onClick={() => setManualAssignTrip(trip)} className="rounded p-0.5 text-blue-600 hover:bg-blue-100" title="Assign driver"><Users size={12} /></button>
                </>
              )}
              <button onClick={() => setEditTrip(trip)} className="rounded p-0.5 text-slate-400 hover:bg-blue-100 hover:text-blue-600" title="Edit trip"><Edit2 size={12} /></button>
              {hasPermission(role, 'canDeleteTrip') && (
                <button onClick={() => requestDeleteTrip(trip.id)} className="rounded p-0.5 text-slate-400 hover:bg-rose-100 hover:text-rose-600" title="Archive trip"><Archive size={12} /></button>
              )}
            </div>
          </div>
          {isExpanded && renderExpandedTripDetails(trip, { compact: true })}
        </div>
      );
    }

    if (densityProfile.lineCount === 2) {
      return (
        <div key={trip.id} className={cardClasses}>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedTasks((prev) => prev.includes(trip.id) ? prev.filter((id) => id !== trip.id) : [...prev, trip.id]); }} className={`shrink-0 rounded p-0.5 transition-all duration-150 ${isSelected ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`} title={isSelected ? 'Deselect trip' : 'Select trip'}>
              {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
            </button>
            <span className={`shrink-0 font-mono font-bold text-xs ${isLate ? 'text-rose-600' : urgency === 'soon' ? 'text-amber-600' : 'text-emerald-600'}`}>{to12hr(trip.time)}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${getStatusPillClass(trip.status)}`}>{trip.status}</span>
            <button onClick={(e) => { e.stopPropagation(); setSmsConversationTrip(trip); }} className="shrink-0 rounded p-0.5 hover:bg-slate-100 transition-colors" title="View messages">
              {trip.clientConfirmation === 'confirmed' ? <CheckCircle2 size={11} className="text-emerald-500" />
              : trip.clientConfirmation === 'not_coming' ? <XCircle size={11} className="text-rose-500" />
              : <MessageSquare size={11} className="text-slate-300 hover:text-slate-500" />}
            </button>
            {(trip.type || trip.serviceType) && (
              <span className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{trip.type || trip.serviceType}</span>
            )}
            <span className="truncate text-sm font-black text-slate-900">{trip.patient || 'Unnamed Client'}</span>
            {routeAssignments.length > 0 && (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                <Route size={10} /> {routeAssignments[0].routeName}{routeAssignments.length > 1 ? ` +${routeAssignments.length - 1}` : ''}
              </span>
            )}
            {clientPhone && <span className="shrink-0 text-[10px] font-semibold text-emerald-700">{clientPhone}</span>}
            <div className="ml-auto flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => toggleTripExpanded(trip.id)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title={isExpanded ? 'Collapse trip details' : 'Expand trip details'}
              >
                {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              {!driver && (
                <>
                  <button onClick={() => triggerSmartAssign(trip)} className="rounded-lg p-1 text-indigo-600 hover:bg-indigo-100" title="AI assign"><BrainCircuit size={13} /></button>
                  <button onClick={() => setManualAssignTrip(trip)} className="rounded-lg p-1 text-blue-600 hover:bg-blue-100" title="Assign driver"><Users size={13} /></button>
                </>
              )}
              <button onClick={() => setEditTrip(trip)} className="rounded-lg p-1 text-slate-400 hover:bg-blue-100 hover:text-blue-600" title="Edit trip"><Edit2 size={13} /></button>
              {hasPermission(role, 'canDeleteTrip') && (
                <button onClick={() => requestDeleteTrip(trip.id)} className="rounded-lg p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600" title="Archive trip"><Archive size={13} /></button>
              )}
            </div>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <div className="flex min-w-0 items-center gap-1.5 text-[10px]">
              <span className="font-medium text-emerald-700">P:</span>
              <span className="truncate text-slate-700">{trip.pickup || 'Missing pickup address'}</span>
            </div>
            <span className="text-slate-300">to</span>
            <div className="flex min-w-0 items-center gap-1.5 text-[10px]">
              <span className="font-medium text-rose-700">D:</span>
              <span className="truncate text-slate-700">{trip.dropoff || 'Missing dropoff address'}</span>
            </div>
            {driver && (
              <span className="text-[10px] text-slate-500">{driver.name}</span>
            )}
            {clientPhone && (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => makeCall(trip.patientPhone || trip.pickupPhone, trip.patient)} className="inline-flex items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700 hover:bg-emerald-100"><Phone size={10} /> Call</button>
                <button onClick={() => openSmsForTrip(trip)} className="inline-flex items-center gap-0.5 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[9px] font-bold text-blue-700 hover:bg-blue-100"><MessageSquare size={10} /> Text</button>
                {dropoffPhone && <button onClick={() => makeCall(trip.dropoffPhone, trip.dropoff)} className="inline-flex items-center gap-0.5 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[9px] font-bold text-rose-700 hover:bg-rose-100"><Phone size={10} /> Hosp</button>}
              </div>
            )}
          </div>
          {isExpanded && renderExpandedTripDetails(trip, { compact: true })}
        </div>
      );
    }

    return (
      <div key={trip.id} className={cardClasses}>
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedTasks((prev) => prev.includes(trip.id) ? prev.filter((id) => id !== trip.id) : [...prev, trip.id]);
            }}
            className={`mt-0.5 rounded p-0.5 transition-all duration-150 ${isSelected ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
            title={isSelected ? 'Deselect trip' : 'Select trip'}
          >
            {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`font-mono font-bold ${densityProfile.cardTime} ${isLate ? 'text-rose-600' : urgency === 'soon' ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {to12hr(trip.time)}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getStatusPillClass(trip.status)}`}>
                    {trip.status}
                  </span>
                  <button onClick={(e) => { e.stopPropagation(); setSmsConversationTrip(trip); }} className="shrink-0 rounded p-0.5 hover:bg-slate-100 transition-colors" title="View messages">
                    {trip.clientConfirmation === 'confirmed' ? <CheckCircle2 size={11} className="text-emerald-500" />
                    : trip.clientConfirmation === 'not_coming' ? <XCircle size={11} className="text-rose-500" />
                    : <MessageSquare size={11} className="text-slate-300 hover:text-slate-500" />}
                  </button>
                  {(trip.type || trip.serviceType) && (
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {trip.type || trip.serviceType}
                    </span>
                  )}
                  {bookingReference && (
                    <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                      {bookingReference}
                    </span>
                  )}
                  {clientIdentifier && (
                    <span className="rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                      {clientIdentifier}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <p className={`truncate font-black text-slate-900 ${densityProfile.cardTitle}`}>{trip.patient || 'Unnamed Client'}</p>
                  {routeAssignments.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                      <Route size={10} /> {routeAssignments[0].routeName}{routeAssignments.length > 1 ? ` +${routeAssignments.length - 1}` : ''}
                    </span>
                  )}
                </div>
                {clientSummary && (
                  <div className="mt-1 text-[10px] font-semibold text-slate-500" style={getClampStyle(densityProfile.lineCount)}>
                    {clientSummary}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => toggleTripExpanded(trip.id)}
                  className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  title={isExpanded ? 'Collapse trip details' : 'Expand trip details'}
                >
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {!driver && (
                  <>
                    <button onClick={() => triggerSmartAssign(trip)} className="rounded-lg p-1.5 text-indigo-600 transition-colors hover:bg-indigo-100" title="AI assign">
                      <BrainCircuit size={14} />
                    </button>
                    <button onClick={() => setManualAssignTrip(trip)} className="rounded-lg p-1.5 text-blue-600 transition-colors hover:bg-blue-100" title="Assign driver">
                      <Users size={14} />
                    </button>
                  </>
                )}
                <button onClick={() => setEditTrip(trip)} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-blue-100 hover:text-blue-600" title="Edit trip">
                  <Edit2 size={14} />
                </button>
                {hasPermission(role, 'canDeleteTrip') && (
                  <button onClick={() => requestDeleteTrip(trip.id)} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-rose-100 hover:text-rose-600" title="Archive trip">
                    <Archive size={14} />
                  </button>
                )}
              </div>
            </div>

            <div className={`grid ${isReportDensity ? 'mt-2 gap-2' : 'mt-3 gap-3'} ${densityProfile.sectionGrid}`}>
              <div className={`${isReportDensity ? 'space-y-1.5' : 'space-y-2'} min-w-0`}>
                <div className={`border border-blue-100 bg-blue-50/70 ${isReportDensity ? 'rounded-lg px-2.5 py-1.5' : 'rounded-xl px-3 py-2'}`}>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-blue-700">Pickup</div>
                  {densityProfile.showFacilityNames && pickupFacilityName && (
                    <div className={`${isReportDensity ? 'mt-0.5' : 'mt-1'} text-[10px] font-semibold uppercase tracking-wide text-blue-800`}>
                      {pickupFacilityName}
                    </div>
                  )}
                  <div className={`${isReportDensity ? 'mt-0.5 text-[11px]' : 'mt-0.5 text-xs'} font-semibold leading-snug text-slate-800 break-words`} style={getClampStyle(densityProfile.lineCount)}>{trip.pickup || 'Missing pickup address'}</div>
                  {clientPhone && <div className={`${isReportDensity ? 'mt-0.5' : 'mt-1'} text-[10px] font-medium text-blue-700`}>Client {clientPhone}</div>}
                  {densityProfile.showSecondaryPhones && pickupPhone && pickupPhone !== clientPhone && <div className={`${isReportDensity ? 'mt-0.5' : 'mt-1'} text-[10px] font-medium text-blue-700`}>Pickup desk {pickupPhone}</div>}
                </div>
                <div className={`border border-emerald-100 bg-emerald-50/70 ${isReportDensity ? 'rounded-lg px-2.5 py-1.5' : 'rounded-xl px-3 py-2'}`}>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Dropoff</div>
                  {densityProfile.showFacilityNames && dropoffFacilityName && (
                    <div className={`${isReportDensity ? 'mt-0.5' : 'mt-1'} text-[10px] font-semibold uppercase tracking-wide text-emerald-800`}>
                      {dropoffFacilityName}
                    </div>
                  )}
                  <div className={`${isReportDensity ? 'mt-0.5 text-[11px]' : 'mt-0.5 text-xs'} font-semibold leading-snug text-slate-800 break-words`} style={getClampStyle(densityProfile.lineCount)}>{trip.dropoff || 'Missing dropoff address'}</div>
                  {densityProfile.showSecondaryPhones && dropoffPhone && <div className={`${isReportDensity ? 'mt-0.5' : 'mt-1'} text-[10px] font-medium text-emerald-700`}>Hospital {dropoffPhone}</div>}
                </div>
              </div>

              <div className={`${isReportDensity ? 'space-y-1.5' : 'space-y-2'} min-w-0`}>
                <div className={`border border-slate-200 ${isReportDensity ? 'rounded-lg px-2.5 py-1.5' : 'rounded-xl px-3 py-2'} ${densityProfile.showExecutiveAccent ? 'bg-slate-900 text-white' : 'bg-slate-50'}`}>
                  <div className={`text-[10px] font-bold uppercase tracking-wide ${densityProfile.showExecutiveAccent ? 'text-slate-300' : 'text-slate-500'}`}>Assignment</div>
                  {driver ? (
                    <div className={isReportDensity ? 'mt-0.5' : 'mt-1'}>
                      <div className={`text-xs font-semibold ${densityProfile.showExecutiveAccent ? 'text-white' : 'text-slate-900'}`}>{driver.name}</div>
                      {densityProfile.showAssignmentMeta && densityProfile.lineCount >= 3 && (
                        <div className={`text-[10px] font-medium leading-snug ${densityProfile.showExecutiveAccent ? 'text-slate-300' : 'text-slate-500'}`}>{driver.vehicle || driver.status || 'Driver active'}</div>
                      )}
                    </div>
                  ) : (
                    <div className={`${isReportDensity ? 'mt-0.5' : 'mt-1'} text-xs font-semibold text-rose-600`}>Awaiting dispatch assignment</div>
                  )}
                </div>

                {densityProfile.showClientDetailBlock && (trip.notes || bookingReference || clientIdentifier || clientPhone || pickupPhone || dropoffPhone || routeAssignments.length > 0) && (
                  <div className={`border border-slate-200 bg-white ${isReportDensity ? 'rounded-lg px-2.5 py-1.5' : 'rounded-xl px-3 py-2'}`}>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Client Detail</div>
                    <div className={`${isReportDensity ? 'mt-0.5 text-[10px]' : 'mt-1 text-[11px]'} grid gap-1 font-medium leading-snug text-slate-600`}>
                      {bookingReference && <div>Trip: <span className="font-bold text-slate-900">{bookingReference}</span></div>}
                      {clientIdentifier && <div>Client ID: <span className="font-bold text-slate-900">{clientIdentifier}</span></div>}
                      {clientPhone && <div>Client phone: <span className="font-bold text-slate-900">{clientPhone}</span></div>}
                      {densityProfile.showSecondaryPhones && pickupPhone && pickupPhone !== clientPhone && <div>Pickup phone: <span className="font-bold text-slate-900">{pickupPhone}</span></div>}
                      {densityProfile.showSecondaryPhones && dropoffPhone && <div>Hospital phone: <span className="font-bold text-slate-900">{dropoffPhone}</span></div>}
                    </div>
                    {densityProfile.showNotesPreview && trip.notes && (
                      <div className={`${isReportDensity ? 'mt-0.5 text-[10px]' : 'mt-1 text-[11px]'} font-medium leading-snug text-amber-700`} style={getClampStyle(densityProfile.noteLines)}>
                        Notes: {trip.notes}
                      </div>
                    )}
                    {routeAssignments.length > 0 && (
                      <div className={`${isReportDensity ? 'mt-0.5' : 'mt-1'} flex flex-wrap gap-1`}>
                        {visibleRouteAssignments.map((route, index) => (
                          <span key={`${route.templateId || route.routeName}-${index}`} className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                            {route.routeName}{route.time ? ` @ ${route.time}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {(clientPhone || dropoffPhone) && (
              <div className={`${isReportDensity ? 'mt-2 gap-1.5' : 'mt-3 gap-2'} flex flex-wrap`} onClick={(e) => e.stopPropagation()}>
                {clientPhone && (
                  <>
                    <button onClick={() => makeCall(trip.patientPhone || trip.pickupPhone, trip.patient)} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700 hover:bg-blue-100">
                      <Phone size={11} /> Client
                    </button>
                    <button onClick={() => openSmsForTrip(trip)} className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700 hover:bg-blue-100">
                      <MessageSquare size={11} /> Text
                    </button>
                  </>
                )}
                {dropoffPhone && (
                  <button onClick={() => makeCall(trip.dropoffPhone, trip.dropoff)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100">
                    <Phone size={11} /> Hospital
                  </button>
                )}
              </div>
            )}
            {isExpanded && renderExpandedTripDetails(trip)}
          </div>
        </div>
      </div>
    );
  };

  const renderManifestBoard = () => (
    <div className="flex-1 overflow-y-auto px-3 pb-3">
      {manifestFeedTrips.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="max-w-sm rounded-3xl border border-slate-100/50 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
              <FileText size={28} />
            </div>
            <p className="text-base font-black text-slate-900">Dispatch board is clear</p>
            <p className="mt-1.5 text-sm">Try another view, reset the filters, or upload more trips.</p>
          </div>
        </div>
      ) : (
        <>
          <div className={`grid gap-3 ${manifestGroupBy === 'driver' ? '2xl:grid-cols-2' : 'xl:grid-cols-2'}`}>
            {manifestGroupedSections.map((section) => (
              <section key={section.key} className="rounded-3xl border border-slate-100/50 bg-white shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 bg-slate-50/70">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-slate-900">{section.label}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        {section.trips.length} trip{section.trips.length !== 1 ? 's' : ''}
                      </span>
                      {section.lateCount > 0 && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                          {section.lateCount} late
                        </span>
                      )}
                      {section.unassignedCount > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          {section.unassignedCount} open
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {manifestGroupBy}
                  </div>
                </div>
                <div className="space-y-3 p-3">
                  {section.trips.map((trip) => renderManifestCard(trip))}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between rounded-3xl border border-slate-100/50 bg-white px-4 py-3 text-[11px] font-medium text-slate-500 shadow-sm">
            <span>Showing {visibleTrips.length} of {manifestFeedTrips.length} manifest trips</span>
            {manifestFeedTrips.length > visibleTrips.length && (
              <button
                type="button"
                onClick={() => setManifestLimit((prev) => prev + 150)}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-100"
              >
                Load 150 More
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );

  // ==================== TRIP TABLE ====================
  const renderTripTable = () => (
    <div className="flex-1 overflow-y-auto px-3 pb-3">
      {manifestFeedTrips.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="bg-white border border-slate-100/50 rounded-3xl p-8 text-center max-w-xs shadow-sm">
            <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
              <FileText size={28} />
            </div>
            <p className="text-base font-black text-slate-900">No trips found</p>
            <p className="text-sm mt-1.5">Try adjusting your filters or upload new trip data</p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-100/50 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-slate-900">Dispatch Ledger</p>
                <p className="text-[11px] font-medium text-slate-500">
                  Structured manifest view with richer client detail, routing context, and driver assignment controls.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600">{densityProfile.label} view</span>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">{visibleTrips.length} visible</span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-xs">
              <colgroup>
                <col className="w-8" />
                <col className="w-[6%]" />
                <col className="w-[7%]" />
                <col className="w-[19%]" />
                <col className="w-[15%]" />
                <col className="w-[15%]" />
                <col className="w-[11%]" />
                <col className="w-[8%]" />
                <col className="w-[5%]" />
                <col className="w-[11%]" />
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
                    <th key={label} className={`${densityProfile.tableHead} text-left text-[10px] font-bold uppercase tracking-widest text-slate-200 align-middle`}>
                      {sortKey ? (
                        <button
                          type="button"
                          onClick={() => handleColumnSort(sortKey)}
                          className={`group inline-flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left font-black uppercase tracking-widest transition-colors ${
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
                  const isSelected = selectedTasks.includes(trip.id);
                  const urgency = getTripUrgencyLevel(trip);
                  const isLate = urgency === 'late';
                  const driver = drivers.find((entry) => entry.id === trip.driverId);
                  const routeAssignments = routeTripMap[trip.id] || [];
                  const bookingReference = getBookingReference(trip);
                  const clientIdentifier = getClientIdentifier(trip);
                  const clientPhone = formatPhoneDisplay(trip.patientPhone || trip.pickupPhone);
                  const pickupPhone = formatPhoneDisplay(trip.pickupPhone);
                  const dropoffPhone = formatPhoneDisplay(trip.dropoffPhone);
                  const pickupFacilityName = getPickupFacilityName(trip);
                  const dropoffFacilityName = getDropoffFacilityName(trip);
                  const serviceLabel = trip.type || trip.serviceType;
                  const clientSummary = [bookingReference, clientIdentifier && `ID ${clientIdentifier}`, serviceLabel].filter(Boolean).join(' | ');
                  const contactSummary = [
                    clientPhone && `Client ${clientPhone}`,
                    densityProfile.showSecondaryPhones && pickupPhone && pickupPhone !== clientPhone && `Pickup ${pickupPhone}`,
                    densityProfile.showSecondaryPhones && dropoffPhone && `Hospital ${dropoffPhone}`,
                  ].filter(Boolean).join(' | ');
                  const visibleRouteAssignments = routeAssignments.slice(0, densityProfile.routeChipLimit);
                  const rowBg = isSelected
                    ? 'bg-blue-50'
                    : index % 2 === 0
                      ? 'bg-white'
                      : 'bg-slate-50/55';
                  return (
                    <React.Fragment key={trip.id}>
                    <tr
                      className={`${rowBg} transition-colors hover:bg-blue-50/50`}
                    >
                      <td className={`${densityProfile.tableCell} align-top`}>
                        <div className={`flex ${densityProfile.tableRowMinHeight} items-start pt-1`}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTasks((prev) => prev.includes(trip.id) ? prev.filter((id) => id !== trip.id) : [...prev, trip.id]);
                            }}
                            className={`rounded p-0.5 transition-all duration-150 ${isSelected ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                          >
                            {isSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                          </button>
                        </div>
                      </td>
                      <td className={`${densityProfile.tableCell} align-top`}>
                        <div className={`flex ${densityProfile.tableRowMinHeight} items-center`}>
                          <span className="text-[10px] font-mono font-bold text-slate-500">{trip.bookingId || trip.id || 'No booking'}</span>
                        </div>
                      </td>
                      <td className={`${densityProfile.tableCell} align-top`}>
                        <div className={`flex ${densityProfile.tableRowMinHeight} flex-col ${densityProfile.lineCount >= 3 ? 'justify-between' : 'justify-center'}`}>
                          <div className={`font-mono font-black ${isLate ? 'text-rose-600' : urgency === 'soon' ? 'text-amber-600' : 'text-emerald-600'} ${manifestDensity === 'executive' ? 'text-lg' : manifestDensity === 'dense' ? 'text-[13px]' : densityProfile.lineCount <= 2 ? 'text-[13px]' : 'text-base'}`}>
                            {to12hr(trip.time)}
                          </div>
                          {densityProfile.lineCount >= 2 && densityProfile.showStatusMeta && (
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              {urgency === 'late' ? 'Late risk' : urgency === 'soon' ? 'Starts soon' : 'On schedule'}
                            </div>
                          )}
                          {densityProfile.lineCount >= 3 && densityProfile.showStatusMeta && routeAssignments.length > 0 && (
                            <div className="text-[10px] font-semibold text-blue-700">
                              {routeAssignments.length} routed stop{routeAssignments.length !== 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className={`${densityProfile.tableCell} align-top`}>
                        <div className={`flex ${densityProfile.tableRowMinHeight} flex-col ${densityProfile.lineCount >= 3 ? 'justify-between' : 'justify-center'} ${densityProfile.lineCount >= 3 ? (isLeanDensity ? 'gap-1.5' : 'gap-2') : 'gap-0.5'}`}>
                          <div className={`font-bold leading-snug text-slate-900 ${manifestDensity === 'executive' ? 'text-[11px]' : densityProfile.lineCount <= 2 ? 'text-[10px]' : 'text-[11px]'}`}>
                            {trip.patient || 'Unnamed Client'}
                          </div>
                          {densityProfile.lineCount <= 2 ? (
                            densityProfile.lineCount === 2 && clientSummary && (
                              <div className="text-[10px] font-semibold text-slate-500 truncate">{clientSummary}</div>
                            )
                          ) : (
                            <div className={`${isLeanDensity ? 'mt-0.5' : 'mt-1'} flex flex-wrap gap-1`}>
                              {bookingReference && (
                                <span className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                                  {bookingReference}
                                </span>
                              )}
                              {clientIdentifier && (
                                <span className="inline-flex items-center rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                                  {clientIdentifier}
                                </span>
                              )}
                              {(trip.type || trip.serviceType) && (
                                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                  {trip.type || trip.serviceType}
                                </span>
                              )}
                            </div>
                          )}
                          {densityProfile.lineCount >= 3 && (
                            <div className={isLeanDensity ? 'space-y-0.5' : 'space-y-1'}>
                              {clientPhone && (
                                <div className="text-[10px] font-semibold text-emerald-700">Client {clientPhone}</div>
                              )}
                              {densityProfile.showSecondaryPhones && pickupPhone && pickupPhone !== clientPhone && (
                                <div className="text-[10px] font-semibold text-emerald-700">Pickup desk {pickupPhone}</div>
                              )}
                              {densityProfile.showSecondaryPhones && dropoffPhone && (
                                <div className="text-[10px] font-semibold text-rose-700">Hospital {dropoffPhone}</div>
                              )}
                              {densityProfile.showNotesPreview && trip.notes && (
                                <div className="text-[10px] font-medium leading-relaxed text-amber-700" style={getClampStyle(densityProfile.noteLines)}>
                                  Notes: {trip.notes}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className={`${densityProfile.tableCell} align-top`}>
                        {densityProfile.lineCount === 1 ? (
                          <div className={`flex ${densityProfile.tableRowMinHeight} items-center text-[10px] font-semibold text-slate-700 truncate`}>
                            {trip.pickup || 'No pickup address'}
                          </div>
                        ) : (
                          <div className={`flex ${densityProfile.tableRowMinHeight} flex-col justify-between min-w-0 ${isLeanDensity ? 'border border-blue-100 bg-blue-50/70 rounded-lg px-2 py-1' : 'border border-blue-100 bg-blue-50/70 rounded-2xl px-3 py-2'}`}>
                            {densityProfile.lineCount >= 3 && <div className="text-[10px] font-bold uppercase tracking-wide text-blue-700 truncate">Pickup</div>}
                            {densityProfile.lineCount >= 3 && densityProfile.showFacilityNames && pickupFacilityName && (
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-800 truncate">{pickupFacilityName}</div>
                            )}
                            <div className={`${densityProfile.lineCount >= 3 ? (isLeanDensity ? 'mt-0.5 text-[10px]' : 'mt-1 text-[11px]') : 'text-[10px]'} font-semibold leading-snug text-slate-800 truncate`} style={getClampStyle(densityProfile.lineCount)}>
                              {trip.pickup || 'Missing pickup address'}
                            </div>
                            {densityProfile.lineCount >= 3 && clientPhone && (
                              <div className={`${isLeanDensity ? 'mt-0.5' : 'mt-1'} text-[10px] font-medium text-blue-700`}>{clientPhone}</div>
                            )}
                            {densityProfile.lineCount >= 3 && densityProfile.showSecondaryPhones && pickupPhone && pickupPhone !== clientPhone && (
                              <div className={`${isLeanDensity ? 'mt-0.5' : 'mt-1'} text-[10px] font-medium text-blue-700`}>Desk {pickupPhone}</div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className={`${densityProfile.tableCell} align-top`}>
                        {densityProfile.lineCount === 1 ? (
                          <div className={`flex ${densityProfile.tableRowMinHeight} items-center text-[10px] font-semibold text-slate-700 truncate`}>
                            {trip.dropoff || 'No dropoff address'}
                          </div>
                        ) : (
                          <div className={`flex ${densityProfile.tableRowMinHeight} flex-col justify-between min-w-0 ${isLeanDensity ? 'border border-emerald-100 bg-emerald-50/70 rounded-lg px-2 py-1' : 'border border-emerald-100 bg-emerald-50/70 rounded-2xl px-3 py-2'}`}>
                            {densityProfile.lineCount >= 3 && <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 truncate">Dropoff</div>}
                            {densityProfile.lineCount >= 3 && densityProfile.showFacilityNames && dropoffFacilityName && (
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800 truncate">{dropoffFacilityName}</div>
                            )}
                            <div className={`${densityProfile.lineCount >= 3 ? (isLeanDensity ? 'mt-0.5 text-[10px]' : 'mt-1 text-[11px]') : 'text-[10px]'} font-semibold leading-snug text-slate-800 truncate`} style={getClampStyle(densityProfile.lineCount)}>
                              {trip.dropoff || 'Missing dropoff address'}
                            </div>
                            {densityProfile.lineCount >= 3 && densityProfile.showSecondaryPhones && dropoffPhone && (
                              <div className={`${isLeanDensity ? 'mt-0.5' : 'mt-1'} text-[10px] font-medium text-emerald-700`}>Hospital {dropoffPhone}</div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className={`${densityProfile.tableCell} align-top`}>
                        {densityProfile.lineCount === 1 ? (
                          <div className={`flex ${densityProfile.tableRowMinHeight} items-center text-[10px] font-semibold truncate`}>
                            {driver ? (
                              <span className="text-slate-800">{driver.name}</span>
                            ) : (
                              <span className="text-rose-600">No route</span>
                            )}
                          </div>
                        ) : densityProfile.lineCount === 2 ? (
                          <div className={`flex ${densityProfile.tableRowMinHeight} flex-col justify-center ${isLeanDensity ? 'border border-slate-200 bg-slate-50 rounded-lg px-2 py-1' : 'rounded-2xl px-3 py-2'} ${densityProfile.showExecutiveAccent ? 'bg-slate-900 text-white' : 'bg-slate-50'}`}>
                            {driver ? (
                              <div className="text-[11px] font-bold text-slate-900 truncate">{driver.name}</div>
                            ) : (
                              <div className="text-[11px] font-bold text-rose-600 truncate">Awaiting assignment</div>
                            )}
                            {routeAssignments.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700">
                                  {routeAssignments[0].routeName}{routeAssignments.length > 1 ? ` +${routeAssignments.length - 1}` : ''}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className={`flex ${densityProfile.tableRowMinHeight} flex-col justify-between border border-slate-200 ${isLeanDensity ? 'rounded-lg px-2.5 py-1.5' : 'rounded-2xl px-3 py-2'} ${densityProfile.showExecutiveAccent ? 'bg-slate-900 text-white' : 'bg-slate-50'}`}>
                            <div>
                              <div className={`text-[10px] font-bold uppercase tracking-wide ${densityProfile.showExecutiveAccent ? 'text-slate-300' : 'text-slate-500'}`}>Driver</div>
                              {driver ? (
                                <>
                                  <div className={`${isLeanDensity ? 'mt-0.5' : 'mt-1'} text-[11px] font-bold ${densityProfile.showExecutiveAccent ? 'text-white' : 'text-slate-900'}`}>{driver.name}</div>
                                  {densityProfile.showAssignmentMeta && densityProfile.lineCount >= 3 && (
                                    <div className={`${isLeanDensity ? 'mt-0.5' : 'mt-1'} text-[10px] font-medium leading-snug ${densityProfile.showExecutiveAccent ? 'text-slate-300' : 'text-slate-500'}`}>{driver.vehicle || driver.status || 'Driver active'}</div>
                                  )}
                                </>
                              ) : (
                                <div className={`${isLeanDensity ? 'mt-0.5' : 'mt-1'} text-[11px] font-bold text-rose-600`}>Awaiting assignment</div>
                              )}
                            </div>
                            {routeAssignments.length > 0 && (
                              <div className={`${isLeanDensity ? 'mt-1' : 'mt-2'} flex flex-wrap gap-1`}>
                                {visibleRouteAssignments.map((route, routeIndex) => (
                                  <span key={`${route.templateId || route.routeName}-${routeIndex}`} className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                    {route.routeName}{route.time ? ` @ ${route.time}` : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className={`${densityProfile.tableCell} align-top`}>
                        {densityProfile.lineCount === 1 ? (
                          <div className={`flex ${densityProfile.tableRowMinHeight} items-center`}>
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold ${getStatusPillClass(trip.status)}`}>
                              {trip.status}
                            </span>
                          </div>
                        ) : (
                          <div className={`flex ${densityProfile.tableRowMinHeight} flex-col justify-between`}>
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${getStatusPillClass(trip.status)}`}>
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
                              <div className={`${densityProfile.lineCount >= 3 ? (isLeanDensity ? 'mt-1' : 'mt-2') : 'mt-0.5'} text-[10px] font-semibold text-slate-500 truncate`}>
                                {bookingReference
                                  ? `${bookingReference}`
                                  : clientIdentifier
                                    ? `ID ${clientIdentifier}`
                                    : 'No reference'}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className={`${densityProfile.tableCell} align-top`}>
                        <div className={`flex ${densityProfile.tableRowMinHeight} items-center justify-center`}>
                          <button onClick={(e) => { e.stopPropagation(); setSmsConversationTrip(trip); }} className="rounded-lg p-1 hover:bg-slate-100 transition-colors" title="View messages">
                            {trip.clientConfirmation === 'confirmed' ? (
                              <CheckCircle2 size={14} className="text-emerald-500" />
                            ) : trip.clientConfirmation === 'not_coming' ? (
                              <XCircle size={14} className="text-rose-500" />
                            ) : (
                              <MessageSquare size={14} className="text-slate-300 hover:text-slate-500" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className={`${densityProfile.tableCell} align-top`}>
                        <div className={`flex ${densityProfile.tableRowMinHeight} items-center gap-1`} onClick={(e) => e.stopPropagation()}>
                          {clientPhone && (
                            <button onClick={() => makeCall(trip.patientPhone || trip.pickupPhone, trip.patient)}
                              className="rounded-lg p-1 text-emerald-600 hover:bg-emerald-100"
                              title="Call client">
                              <Phone size={12} />
                            </button>
                          )}
                          {clientPhone && (
                            <button onClick={() => openSmsForTrip(trip)} className="rounded-lg p-1 text-blue-600 hover:bg-blue-100" title="Text client"><MessageSquare size={12} /></button>
                          )}
                          <>
                            <button onClick={() => triggerSmartAssign(trip)} className="rounded-lg p-1 text-indigo-600 hover:bg-indigo-100" title="AI assign"><BrainCircuit size={12} /></button>
                            <button onClick={() => setManualAssignTrip(trip)} className="rounded-lg p-1 text-blue-600 hover:bg-blue-100" title="Assign driver"><Users size={12} /></button>
                          </>
                          <button onClick={() => setEditTrip(trip)} className="rounded-lg p-1 text-slate-500 hover:bg-blue-100 hover:text-blue-600" title="Edit trip"><Edit2 size={12} /></button>
                          {hasPermission(role, 'canDeleteTrip') && (
                            <button onClick={() => requestDeleteTrip(trip.id)} className="rounded-lg p-1 text-slate-500 hover:bg-rose-100 hover:text-rose-600" title="Archive trip"><Archive size={12} /></button>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleTripExpanded(trip.id)}
                            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                            title={isExpanded ? 'Collapse trip details' : 'Expand trip details'}
                          >
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
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

          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2 text-micro text-slate-400">
            <div className="flex items-center gap-3">
              <span>Showing {visibleTrips.length} of {manifestFeedTrips.length} trip{manifestFeedTrips.length !== 1 ? 's' : ''}</span>
              {manifestFeedTrips.length > visibleTrips.length && (
                <button
                  type="button"
                  onClick={() => setManifestLimit((prev) => prev + 150)}
                  className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
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
    <div className="flex-1 overflow-y-auto p-3">
      <div className="mb-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-3xl border border-slate-100/50 bg-white px-4 py-3 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Drivers</div>
          <div className="mt-1 text-2xl font-black text-slate-900">{fleetDrivers.length}</div>
        </div>
        <div className="rounded-3xl border border-emerald-100 bg-emerald-50 px-4 py-3 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Available</div>
          <div className="mt-1 text-2xl font-black text-emerald-800">{availableDrivers.length}</div>
        </div>
        <div className="rounded-3xl border border-amber-100 bg-amber-50 px-4 py-3 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Busy</div>
          <div className="mt-1 text-2xl font-black text-amber-800">{busyDrivers.length}</div>
        </div>
        <div className="rounded-3xl border border-blue-100 bg-blue-50 px-4 py-3 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wide text-blue-700">Active Trips</div>
          <div className="mt-1 text-2xl font-black text-blue-800">{inProgressTrips.length}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {fleetDrivers.slice(0, fleetLimit).map(d => {
          const driverTrips = getDriverTrips(d.id);
          const isExpanded = expandedDriver === d.id;
          const isMaintenanceDue = d.nextOilChange - d.odometer < 200;
          return (
            <div key={d.id} className={`card-premium transition-all duration-300 ${
              d.status === 'Available' ? 'border-emerald-200' : ''
            } ${isMaintenanceDue ? 'border-rose-200' : ''}`}>
              {/* Driver header */}
              <div className="p-4 cursor-pointer select-none" onClick={() => setExpandedDriver(isExpanded ? null : d.id)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm bg-gradient-to-br ${
                      d.status === 'Available'
                        ? 'from-emerald-500 to-teal-600 shadow-emerald-500/20'
                        : 'from-amber-500 to-orange-600 shadow-amber-500/20'
                    } text-white shadow-lg`}>
                      {String(d?.name || '?').charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{d.name || 'Unnamed driver'}</p>
                      <p className="text-micro text-slate-400">{d.vehicle || 'No vehicle'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      {d.status === 'Available' ? (
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                        </span>
                      ) : (
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      )}
                      <span className="text-micro text-slate-400">{d.status}</span>
                    </div>
                    <div className="p-1 rounded hover:bg-slate-100 transition-colors">
                      {isExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2.5 text-micro text-slate-400">
                  <span className="flex items-center gap-1"><MapPin size={10} /> {d.currentZone}</span>
                  <span className="opacity-50">|</span>
                  <span>{d.odometer?.toLocaleString()} mi</span>
                  {isMaintenanceDue && (
                    <span className="text-rose-600 font-semibold flex items-center gap-1">
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
                      <p className="text-micro font-bold uppercase tracking-wider text-slate-400 px-1">Active Trips ({driverTrips.length})</p>
                      {driverTrips.map(t => {
                        const isTripCardExpanded = isTripExpanded(t.id);
                        const bookingReference = getBookingReference(t);
                        const clientIdentifier = getClientIdentifier(t);
                        const clientPhone = formatPhoneDisplay(t.patientPhone || t.pickupPhone);
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
                                <div className="mt-0.5 text-[10px] font-semibold text-slate-500" style={getClampStyle(densityProfile.lineCount)}>
                                  {[bookingReference, clientIdentifier && `ID ${clientIdentifier}`, (t.type || t.serviceType)].filter(Boolean).join(' | ')}
                                </div>
                              ) : (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {bookingReference && (
                                  <span className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                                    {bookingReference}
                                  </span>
                                )}
                                {clientIdentifier && (
                                  <span className="inline-flex items-center rounded-full border border-violet-100 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                                    {clientIdentifier}
                                  </span>
                                )}
                                {(t.type || t.serviceType) && (
                                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                                    {t.type || t.serviceType}
                                  </span>
                                )}
                              </div>
                              )}
                            </div>
                            <span className="text-micro font-mono text-emerald-600 font-semibold">{to12hr(t.time)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1.5 text-micro">
                            <span className="truncate text-blue-600" style={getClampStyle(1)}>{t.pickup}</span>
                            <ArrowRight size={8} className="shrink-0 text-slate-400 opacity-50" />
                            <span className="truncate text-emerald-600" style={getClampStyle(1)}>{t.dropoff}</span>
                          </div>
                          {(clientPhone || pickupPhone || dropoffPhone || routeAssignments.length > 0 || t.notes) && (
                            <div className="mt-1.5 space-y-1">
                              <div className="flex flex-wrap gap-1">
                              {clientPhone && (
                                <span className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                                  Client {clientPhone}
                                </span>
                              )}
                              {densityProfile.showSecondaryPhones && pickupPhone && pickupPhone !== clientPhone && (
                                <span className="inline-flex items-center rounded-full border border-cyan-100 bg-cyan-50 px-1.5 py-0.5 text-[10px] font-medium text-cyan-700">
                                  Pickup desk {pickupPhone}
                                </span>
                              )}
                              {densityProfile.showSecondaryPhones && dropoffPhone && (
                                <span className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                                  Hospital {dropoffPhone}
                                </span>
                              )}
                              {visibleRouteAssignments.map((route, routeIndex) => (
                                <span key={`${route.templateId || route.routeName}-${routeIndex}`} className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                                  <Route size={10} /> {route.routeName}{route.time ? ` @ ${route.time}` : ''}
                                </span>
                              ))}
                              </div>
                              {densityProfile.showNotesPreview && t.notes && <div className="text-[10px] font-medium leading-relaxed text-amber-700" style={getClampStyle(densityProfile.noteLines)}>Notes: {t.notes}</div>}
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
                    <div className="p-4 text-center text-xs text-slate-400">No active trips</div>
                  )}
                  {d.phone && (
                    <div className="px-3 pb-3 flex gap-2">
                      <button onClick={() => makeCall(d.phone, d.name)} className="flex-1 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-medium transition-all duration-200 flex items-center justify-center gap-1.5 hover:bg-emerald-100">
                        <Phone size={12} /> Call
                      </button>
                      <button onClick={() => sendSMS(d.phone, d.name)} className="flex-1 py-2 bg-blue-50 border border-blue-100 text-blue-700 rounded-xl text-xs font-medium transition-all duration-200 flex items-center justify-center gap-1.5 hover:bg-blue-100">
                        <MessageSquare size={12} /> SMS
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
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Load 30 More Drivers
          </button>
        </div>
      )}
    </div>
  );

  // ==================== WILL CALL VIEW ====================
  const renderWillCall = () => (
    <div className="flex-1 overflow-y-auto p-3">
      {willCallTrips.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="card-premium p-8 text-center max-w-xs shadow-sm">
            <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
              <Phone size={28} />
            </div>
            <p className="text-base font-black text-slate-900">No will call trips</p>
            <p className="text-sm mt-1.5">All pending trips are assigned</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {willCallTrips.map(t => {
            const isTripCardExpanded = isTripExpanded(t.id);
            const bookingReference = getBookingReference(t);
            const clientIdentifier = getClientIdentifier(t);
            const clientPhone = formatPhoneDisplay(t.patientPhone || t.pickupPhone);
            const pickupPhone = formatPhoneDisplay(t.pickupPhone);
            const dropoffPhone = formatPhoneDisplay(t.dropoffPhone);
            const routeAssignments = routeTripMap[t.id] || [];
            const visibleRouteAssignments = routeAssignments.slice(0, densityProfile.routeChipLimit);
            return (
            <div key={t.id} className="group card-premium hover:shadow-xl transition-all duration-300 flex flex-col">
              {/* Top Status Indicator */}
              <div className="h-1.5 w-full bg-blue-500" />
              <div className={`${isLeanDensity ? 'p-3 sm:p-3.5' : 'p-4 sm:p-5'} cursor-pointer`} onClick={() => openTripDetails(t)}>
                <div className={`flex items-start justify-between gap-3 ${isLeanDensity ? 'mb-2.5' : 'mb-4'}`}>
                  <div className="flex-1 min-w-0">
                    {densityProfile.lineCount <= 2 ? (
                      <div className="text-[10px] font-semibold text-slate-500" style={getClampStyle(densityProfile.lineCount)}>
                        {['Will Call', bookingReference, clientIdentifier && `ID ${clientIdentifier}`, (t.type || t.serviceType)].filter(Boolean).join(' | ')}
                      </div>
                    ) : (
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="px-2 py-0.5 rounded-md text-micro font-bold uppercase tracking-wider bg-slate-100 text-slate-700">Will Call</span>
                      {bookingReference && (
                        <span className="px-2 py-0.5 rounded-md text-micro font-bold bg-blue-50 text-blue-700 border border-blue-100">{bookingReference}</span>
                      )}
                      {clientIdentifier && (
                        <span className="px-2 py-0.5 rounded-md text-micro font-bold bg-violet-50 text-violet-700 border border-violet-100">{clientIdentifier}</span>
                      )}
                      {(t.type || t.serviceType) && (
                        <span className="px-2 py-0.5 rounded-md text-micro font-bold bg-slate-100 text-slate-600 border border-slate-200">{t.type || t.serviceType}</span>
                      )}
                    </div>
                    )}
                    <h3 className={`text-slate-900 font-black ${isLeanDensity ? 'text-base' : 'text-lg'} truncate leading-tight`}>{t.patient}</h3>
                    {(clientPhone || pickupPhone || dropoffPhone || routeAssignments.length > 0) && (
                      <div className={`${isLeanDensity ? 'mt-1' : 'mt-2'} flex flex-wrap gap-1`}>
                        {clientPhone && (
                          <span className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                            Client {clientPhone}
                          </span>
                        )}
                        {densityProfile.showSecondaryPhones && pickupPhone && pickupPhone !== clientPhone && (
                          <span className="inline-flex items-center rounded-full border border-cyan-100 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-700">
                            Pickup desk {pickupPhone}
                          </span>
                        )}
                        {densityProfile.showSecondaryPhones && dropoffPhone && (
                          <span className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                            Hospital {dropoffPhone}
                          </span>
                        )}
                        {visibleRouteAssignments.map((route, routeIndex) => (
                          <span key={`${route.templateId || route.routeName}-${routeIndex}`} className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                            <Route size={10} /> {route.routeName}{route.time ? ` @ ${route.time}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setEditTrip(t)} className="p-1.5 rounded hover:bg-blue-100 text-slate-400 hover:text-blue-600 transition-colors" title="Edit"><Edit2 size={14} /></button>
                    {hasPermission(role, 'canDeleteTrip') && (
                      <button onClick={() => requestDeleteTrip(t.id)} className="p-1.5 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition-colors" title="Archive Trip"><Archive size={14} /></button>
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
                      <p className="text-micro font-bold uppercase tracking-wider text-slate-500 mb-0.5">Pickup</p>
                      <p className="text-blue-600 font-bold text-sm" style={getClampStyle(densityProfile.lineCount)}>{t.pickup}</p>
                      {densityProfile.showFacilityNames && getPickupFacilityName(t) && <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700">{getPickupFacilityName(t)}</p>}
                    </div>
                  </div>
                  <div className={`bg-white rounded-xl border border-slate-200 ${isLeanDensity ? 'p-2' : 'p-2.5'} shadow-sm flex items-start gap-3`}>
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <MapPin size={16} className="text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <p className="text-micro font-bold uppercase tracking-wider text-slate-500 mb-0.5">Dropoff</p>
                      <p className="text-emerald-600 font-bold text-sm" style={getClampStyle(densityProfile.lineCount)}>{t.dropoff}</p>
                      {densityProfile.showFacilityNames && getDropoffFacilityName(t) && <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">{getDropoffFacilityName(t)}</p>}
                    </div>
                  </div>
                </div>
                {densityProfile.showNotesPreview && t.notes && (
                  <div className={`${isLeanDensity ? 'mt-2' : 'mt-3'} rounded-xl border border-amber-200 bg-amber-50 p-2.5`}>
                    <p className="text-micro font-bold uppercase tracking-wider text-amber-700">Notes</p>
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
      {operationsTab === 'manifest' && (manifestView === 'board' ? renderManifestBoard() : renderTripTable())}
      {operationsTab === 'willcall' && renderWillCall()}
      {operationsTab === 'fleet' && renderFleetMatrix()}

      {/* Modals */}
      {editTrip && (
        <EditTripModal
          trip={editTrip}
          onClose={() => setEditTrip(null)}
          onUpdate={updateTrip}
          drivers={drivers}
        />
      )}
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
