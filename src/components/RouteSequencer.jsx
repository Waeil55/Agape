import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Clock,
  MapPin,
  Users,
  Save,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  X,
  CheckCircle2,
  Settings2,
  CarFront,
  Filter,
  Ban,
  CalendarDays,
  Plus,
  GripVertical,
  Route,
  Info,
  RefreshCw,
  Zap,
  Navigation,
  ChevronRight,
  Search,
  Flag,
  MoreHorizontal,
  UserX,
  XCircle,
  CalendarX,
  Shield
} from 'lucide-react';
import { db, doc, setDoc, onSnapshot } from '../config/firebase';
import { timeToMinutes } from '../utils/tripDate';
import {
  ROUTE_ASSIGNMENT_STATUS,
  getEndOfDayIso,
  getLocalDateKey,
  isTerminalTripStatus,
  normalizeRouteRecord,
} from '../utils/routePlans';

const getTripUrgency = (timeStr, status) => {
  if (!timeStr || ['Completed', 'Cancelled', 'No Show'].includes(status)) return 0;
  const now = new Date();
  const tripMin = timeToMinutes(timeStr);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const diff = tripMin - nowMin;
  if (diff < 0) return 2; // overdue
  if (diff <= 30) return 1; // soon
  return 0; // normal
};

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_FILTERS = ['All', ...DAYS_OF_WEEK];
const VEHICLE_CAPACITY = 4;

const DAY_MAP = {
  0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat'
};

// Convert a trip's date string to a day abbreviation
const tripDayAbbr = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  return DAY_MAP[d.getDay()];
};

// Convert trips array to client-pool format
const tripsToClients = (trips, selectedDay) => {
  return (trips || [])
    .filter(t => {
      if (!t || !t.patient) return false;
      if (isTerminalTripStatus(t.status)) return false;
      // Filter: match selected day OR all trips if no date
      const tripDay = tripDayAbbr(t.date);
      if (tripDay && selectedDay && selectedDay !== 'All' && tripDay !== selectedDay) return false;
      return true;
    })
    .map(t => ({
      id: t.id,
      name: t.patient || 'Unknown',
      req: t.serviceType || t.type || t.req || 'AMB',
      pu: t.pickup || '',
      do: t.dropoff || '',
      puTime: t.time || '--:-- AM',
      doTime: t.doTime || '--:-- AM',
      miles: parseFloat(t.distance) || 0,
      days: [tripDayAbbr(t.date) || selectedDay],
      todayStatus: 'active',
      isTemp: false,
      tripStatus: t.status || 'Unassigned',
      driverName: t.driverName || '',
      bookingId: t.bookingId || '',
      patientPhone: t.patientPhone || '',
      pickupPhone: t.pickupPhone || '',
      dropoffPhone: t.dropoffPhone || '',
      notes: t.notes || '',
      date: t.date || '',
      urgency: getTripUrgency(t.time, t.status),
    }))
    .sort((a, b) => {
      if (b.urgency !== a.urgency) return b.urgency - a.urgency;
      return timeToMinutes(a.puTime) - timeToMinutes(b.puTime);
    });
};

const SEQUENCES_DOC = 'routeData/sequences';
const TERMINAL_TRIP_LABELS = new Set(['Completed', 'Cancelled', 'No Show']);

const buildImportedRouteClients = (initialStops, initialTripById, currentDay) => {
  if (!initialStops || initialStops.length === 0) return [];
  return initialStops.map((s, i) => ({
    id: s.id,
    name: initialTripById.get(s.id)?.patient || s.name || `Stop ${String.fromCharCode(65 + i)}`,
    req: initialTripById.get(s.id)?.serviceType || s.serviceType || 'AMB',
    pu: s.pu || initialTripById.get(s.id)?.pickup || s.address || '',
    do: s.do || initialTripById.get(s.id)?.dropoff || s.address || '',
    puTime: s.puTime || s.time || initialTripById.get(s.id)?.time || '--:-- AM',
    doTime: s.doTime || s.time || initialTripById.get(s.id)?.doTime || '--:-- AM',
    miles: parseFloat(initialTripById.get(s.id)?.distance) || 0,
    days: [tripDayAbbr(initialTripById.get(s.id)?.date) || currentDay],
    todayStatus: 'active',
    isRoutePlanImport: !initialTripById.has(s.id),
    isTemp: false,
    tripStatus: initialTripById.get(s.id)?.status || 'Unassigned',
    driverName: initialTripById.get(s.id)?.driverName || '',
    bookingId: initialTripById.get(s.id)?.bookingId || s.bookingId || '',
    patientPhone: initialTripById.get(s.id)?.patientPhone || s.patientPhone || s.phone || '',
    pickupPhone: initialTripById.get(s.id)?.pickupPhone || s.pickupPhone || s.phone || '',
    dropoffPhone: initialTripById.get(s.id)?.dropoffPhone || s.dropoffPhone || s.phone || '',
    notes: initialTripById.get(s.id)?.notes || '',
    date: initialTripById.get(s.id)?.date || '',
  }));
};

const buildImportedRouteSequence = (initialStops, initialSequence) => {
  const stamp = Date.now();
  if (initialSequence && initialSequence.length > 0) {
    return initialSequence.map((step, index) => ({
      clientId: step.clientId,
      type: step.type === 'DO' ? 'DO' : 'PU',
      id: `${step.clientId}-${step.type || 'PU'}-${stamp}-${index}`,
      leg: step.leg || 'A',
    }));
  }
  if (!initialStops || initialStops.length === 0) return [];
  return initialStops.flatMap((s, i) => [
    { clientId: s.id, type: 'PU', id: `${s.id}-PU-${stamp}-${i}`, leg: 'A' },
    { clientId: s.id, type: 'DO', id: `${s.id}-DO-${stamp}-${i}`, leg: 'A' },
  ]);
};

export default function RouteSequencerApp({ trips = [], drivers = [], currentUser, role, me, advanceWorkflow, onApplyRoute, onRouteSaved, initialStops = null, initialSequence = null, initialOrigin = null }) {
  const today = new Date();
  const todayAbbr = DAY_MAP[today.getDay()];
  const initialTripById = useMemo(() => new Map((trips || []).map((trip) => [trip.id, trip])), [trips]);
  const [currentDay, setCurrentDay] = useState(() => role === 'driver' ? 'All' : (localStorage.getItem('agape_seqCurrentDay') || todayAbbr));
  const [mobileView, setMobileView] = useState(() => initialStops ? 'sequence' : 'pool');
  const [sequence, setSequence] = useState(() => buildImportedRouteSequence(initialStops, initialSequence));
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveType, setSaveType] = useState(() => role === 'driver' ? 'today' : 'recurring');
  const [templateName, setTemplateName] = useState('');
  const [templateDays, setTemplateDays] = useState([todayAbbr]);
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [reassigningId, setReassigningId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMode, setSaveSuccessMode] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const saveSuccess = Boolean(saveSuccessMode);
  const [skippedIds, setSkippedIds] = useState(new Set());
  const [filterStatus, setFilterStatus] = useState(() => localStorage.getItem('agape_seqFilterStatus') || 'all');
  const [poolSearch, setPoolSearch] = useState('');

  useEffect(() => {
    localStorage.setItem('agape_seqCurrentDay', currentDay);
    localStorage.setItem('agape_seqFilterStatus', filterStatus);
  }, [currentDay, filterStatus]);
  const [showFilter, setShowFilter] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState('');
  const [activeLeg, setActiveLeg] = useState('A');
  const [stopMenuId, setStopMenuId] = useState(null);
  const [stopOverrides, setStopOverrides] = useState({});

  // Temp trip states
  const initialTempForm = { name: '', pu: '', do: '', puTime: '', doTime: '', req: 'AMB', miles: '' };
  const [showAddTempModal, setShowAddTempModal] = useState(false);
  const [tempTripForm, setTempTripForm] = useState(initialTempForm);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [tempClients, setTempClients] = useState(() => buildImportedRouteClients(initialStops, initialTripById, currentDay));

  useEffect(() => {
    if (!initialStops || initialStops.length === 0) return;
    const importedClients = buildImportedRouteClients(initialStops, initialTripById, currentDay);
    const importedSequence = buildImportedRouteSequence(initialStops, initialSequence);
    const importedArr = Array.isArray(importedClients) ? importedClients : [];
    const importedIds = new Set(importedArr.map((client) => client.id));
    setTempClients((prev) => [
      ...(Array.isArray(prev) ? prev : []).filter((client) => client && !importedIds.has(client.id)),
      ...importedArr,
    ]);
    setSequence(importedSequence);
    setSkippedIds((prev) => new Set([...(prev ? prev : [])].filter((clientId) => !importedIds.has(clientId))));
    setMobileView('sequence');
  }, [initialStops, initialSequence, initialTripById, currentDay]);

  // Drag & Drop
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState(null);

  // Load saved sequences from Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, SEQUENCES_DOC), (snap) => {
      if (snap.exists()) {
        setSavedTemplates(snap.data().templates || []);
      }
    });
    return () => unsub();
  }, []);

  const allLiveClients = useMemo(() => {
    const realClients = tripsToClients(trips, 'All');
    const tempArr = Array.isArray(tempClients) ? tempClients : [];
    const tempIds = new Set(tempArr.map(tc => tc.id));
    return [...tempArr, ...realClients.filter(rc => !tempIds.has(rc.id))];
  }, [trips, tempClients]);

  // Build client pool from real trips
  const allClients = useMemo(() => {
    const realClients = tripsToClients(trips, currentDay);
    const tempArr = Array.isArray(tempClients) ? tempClients : [];
    const tempIds = new Set(tempArr.map(tc => tc.id));
    const filteredReals = realClients.filter(rc => !tempIds.has(rc.id));
    return currentDay === 'All'
      ? [...tempArr, ...filteredReals]
      : [...tempArr.filter(tc => tc.days.includes(currentDay)), ...filteredReals];
  }, [trips, currentDay, tempClients]);

  const tripById = useMemo(() => new Map((trips || []).map((trip) => [trip.id, trip])), [trips]);
  const clientById = useMemo(() => {
    try {
      if (!Array.isArray(allClients)) {
        console.error('[RouteSequencer] clientById: allClients is not an array', { allClients, tempClients: tempClients?.length, trips: trips?.length });
        return new Map();
      }
      return new Map(allClients.map((client) => [client.id, client]));
    } catch (e) {
      console.error('[RouteSequencer] clientById crashed:', e.message, { allClients, tempClients: tempClients?.length });
      return new Map();
    }
  }, [allClients]);
  const currentDriver = useMemo(() => {
    if (role !== 'driver') return null;
    const normalizedUser = String(currentUser || '').trim().toLowerCase();
    const normalizedLogin = normalizedUser.replace(/@auth\.agapecare\.local$/i, '');
    return drivers.find((driver) => {
      const email = String(driver.email || '').trim().toLowerCase();
      const login = email.replace(/@auth\.agapecare\.local$/i, '');
      return email === normalizedUser
        || login === normalizedLogin
        || String(driver.id || '').trim().toLowerCase() === normalizedLogin
        || String(driver.name || '').trim().toLowerCase() === normalizedLogin;
    }) || drivers[0] || null;
  }, [drivers, currentUser, role]);

  const dayCounts = useMemo(() => {
    const counts = { All: allLiveClients.length };
    DAYS_OF_WEEK.forEach((day) => { counts[day] = 0; });
    allLiveClients.forEach((client) => {
      const day = client.days?.[0];
      if (day && counts[day] !== undefined) counts[day] += 1;
    });
    return counts;
  }, [allLiveClients]);

  const availableToday = useMemo(() => {
    let pool = allClients.filter(c => !skippedIds.has(c.id));
    if (filterStatus === 'unassigned') pool = pool.filter(c => !c.driverName && c.tripStatus === 'Unassigned');
    if (filterStatus === 'assigned') pool = pool.filter(c => c.driverName || c.tripStatus !== 'Unassigned');
    if (poolSearch.trim()) {
      const q = poolSearch.trim().toLowerCase();
      pool = pool.filter(c =>
        String(c.name || '').toLowerCase().includes(q) ||
        String(c.bookingId || '').toLowerCase().includes(q) ||
        String(c.pu || '').toLowerCase().includes(q) ||
        String(c.do || '').toLowerCase().includes(q)
      );
    }
    return pool;
  }, [allClients, skippedIds, filterStatus, poolSearch]);

  const skippedToday = useMemo(() => {
    return allClients.filter(c => skippedIds.has(c.id));
  }, [allClients, skippedIds]);

  useEffect(() => {
    if (role === 'driver' && currentDriver?.id) {
      setSelectedDriver(currentDriver.id);
    }
  }, [role, currentDriver?.id]);

  useEffect(() => {
    if (role === 'driver' && !localStorage.getItem('agape_seqCurrentDay')) {
      setCurrentDay('All');
    }
  }, [role]);

  useEffect(() => {
    if (currentDay === 'All') return;
    if ((dayCounts[currentDay] || 0) > 0) return;
    const fallbackDay = DAYS_OF_WEEK.find((day) => dayCounts[day] > 0);
    if (fallbackDay) {
      setCurrentDay(role === 'driver' ? 'All' : fallbackDay);
    } else if (allLiveClients.length > 0) {
      setCurrentDay('All');
    }
  }, [currentDay, dayCounts, role, allLiveClients.length]);

  useEffect(() => {
    setSequence((prev) => prev.filter((stop) => {
      const client = clientById.get(stop.clientId);
      if (client?.isTemp) return true;
      return Boolean(client);
    }));
  }, [clientById]);

  useEffect(() => {
    setSkippedIds((prev) => {
      const next = new Set([...prev].filter((clientId) => {
        const client = clientById.get(clientId);
        if (client?.isTemp) return true;
        return Boolean(client);
      }));
      return next.size === prev.size ? prev : next;
    });
  }, [clientById]);

  const isStopInSequence = (clientId, type) =>
    sequence.some(stop => stop.clientId === clientId && stop.type === type);

  // Route metrics
  const routeMetrics = useMemo(() => {
    let totalMiles = 0;
    sequence.forEach(stop => {
      if (stop.type === 'PU') {
        const client = allClients.find(c => c.id === stop.clientId);
        if (client) totalMiles += client.miles;
      }
    });
    return {
      miles: totalMiles.toFixed(2),
      stops: sequence.length,
      estTime: sequence.length > 0 ? `${(sequence.length * 12) + Math.round(totalMiles * 2)} min` : '0 min'
    };
  }, [sequence, allClients]);

  const legAStops = useMemo(() => sequence.filter(s => (s.leg || 'A') === 'A'), [sequence]);
  const legBStops = useMemo(() => sequence.filter(s => s.leg === 'B'), [sequence]);
  const legCompletion = useMemo(() => {
    const check = (stops) => {
      if (stops.length === 0) return null;
      let done = 0;
      stops.forEach(s => {
        const t = tripById.get(s.clientId);
        if (t && isTerminalTripStatus(t.status)) done++;
      });
      if (done === 0) return 'pending';
      if (done === stops.length) return 'complete';
      return 'partial';
    };
    return { A: check(legAStops), B: check(legBStops) };
  }, [sequence, legAStops, legBStops, tripById]);
  const getStopKey = useCallback((stop) => `${stop.clientId}-${stop.type}`, []);
  const getStopOverride = useCallback((stop) => {
    const key = getStopKey(stop);
    return stopOverrides[key] || null;
  }, [stopOverrides, getStopKey]);

  const effectiveTodayDriverId = role === 'driver' ? (currentDriver?.id || '') : selectedDriver;
  const effectiveTodayDriver = useMemo(
    () => drivers.find((driver) => driver.id === effectiveTodayDriverId) || null,
    [drivers, effectiveTodayDriverId]
  );

  // Actions
  const toggleClientSkip = (clientId) => {
    setSkippedIds(prev => {
      const next = new Set(prev);
      if (next.has(clientId)) {
        next.delete(clientId);
      } else {
        next.add(clientId);
        setSequence(seq => seq.filter(stop => stop.clientId !== clientId));
      }
      return next;
    });
  };

  const addStopToSequence = (clientId, type, leg) => {
    if (isStopInSequence(clientId, type)) return;
    const targetLeg = leg || activeLeg;
    const newStop = { clientId, type, id: `${clientId}-${type}-${Date.now()}`, leg: targetLeg };

    if (type === 'DO' && !isStopInSequence(clientId, 'PU')) {
      const pickupStop = { clientId, type: 'PU', id: `${clientId}-PU-${Date.now()}-${Math.random()}`, leg: targetLeg };
      setSequence(prev => [...prev, pickupStop, newStop]);
      if (mobileView === 'pool') setMobileView('sequence');
      return;
    }

    if (type === 'PU' && isStopInSequence(clientId, 'DO')) {
      setSequence(prev => {
        const next = [...prev];
        const doIndex = next.findIndex(s => s.clientId === clientId && s.type === 'DO');
        if (doIndex === -1) return [...next, newStop];
        next.splice(doIndex, 0, newStop);
        return next;
      });
      if (mobileView === 'pool') setMobileView('sequence');
      return;
    }

    setSequence(prev => [...prev, newStop]);
    if (mobileView === 'pool') setMobileView('sequence');
  };

  const removeStopFromSequence = (stopId) => {
    setSequence(prev => prev.filter(s => s.id !== stopId));
  };

  const addAllPickups = () => {
    const toAdd = availableToday
      .filter(c => !isStopInSequence(c.id, 'PU'))
      .map(c => ({ clientId: c.id, type: 'PU', id: `${c.id}-PU-${Date.now()}-${Math.random()}`, leg: activeLeg }));
    setSequence(prev => [...prev, ...toAdd]);
  };

  const clearSequence = () => { setSequence([]); setStopOverrides({}); setStopMenuId(null); };

  // Stop override actions
  const handleNoShowToday = useCallback((stop) => {
    const key = getStopKey(stop);
    setStopOverrides(prev => ({ ...prev, [key]: { type: 'no-show', scope: 'today', label: 'No Show', color: 'amber' } }));
    setStopMenuId(null);
    const trip = tripById.get(stop.clientId);
    if (trip && advanceWorkflow) {
      advanceWorkflow(trip, 'No Show', { completedAt: new Date().toISOString(), completedBy: currentUser });
    }
  }, [getStopKey, tripById, advanceWorkflow, currentUser]);

  const handleCancelToday = useCallback((stop) => {
    const key = getStopKey(stop);
    setStopOverrides(prev => ({ ...prev, [key]: { type: 'cancelled', scope: 'today', label: 'Cancelled Today', color: 'rose' } }));
    setStopMenuId(null);
    const trip = tripById.get(stop.clientId);
    if (trip && advanceWorkflow) {
      advanceWorkflow(trip, 'Cancelled', { completedAt: new Date().toISOString(), completedBy: currentUser, cancellationReason: 'Cancelled from Route Sequencer' });
    }
  }, [getStopKey, tripById, advanceWorkflow, currentUser]);

  const handleCancelPermanent = useCallback((stop) => {
    const key = getStopKey(stop);
    setStopOverrides(prev => ({ ...prev, [key]: { type: 'cancelled', scope: 'permanent', label: 'Cancelled', color: 'red' } }));
    setSequence(prev => prev.filter(s => s.clientId !== stop.clientId || s.type !== stop.type));
    setStopMenuId(null);
    const trip = tripById.get(stop.clientId);
    if (trip && advanceWorkflow) {
      advanceWorkflow(trip, 'Cancelled', { completedAt: new Date().toISOString(), completedBy: currentUser, cancellationReason: 'Cancelled permanently from Route Sequencer' });
    }
  }, [getStopKey, tripById, advanceWorkflow, currentUser]);

  const handleRemoveWeek = useCallback((stop) => {
    const key = getStopKey(stop);
    setStopOverrides(prev => ({ ...prev, [key]: { type: 'removed', scope: 'week', label: 'Removed from Week', color: 'slate' } }));
    setSequence(prev => prev.filter(s => s.clientId !== stop.clientId || s.type !== stop.type));
    setStopMenuId(null);
  }, [getStopKey]);

  const handleClearOverride = useCallback((stop) => {
    const key = getStopKey(stop);
    setStopOverrides(prev => { const n = { ...prev }; delete n[key]; return n; });
    setStopMenuId(null);
  }, [getStopKey]);

  const handleMoveToOtherLeg = useCallback((stop) => {
    setSequence(prev => prev.map(s =>
      s.id === stop.id ? { ...s, leg: s.leg === 'B' ? 'A' : 'B' } : s
    ));
    setStopMenuId(null);
  }, []);

  const handleSortLeg = useCallback((leg) => {
    setSequence(prev => {
      const legStops = prev.filter(s => (s.leg || 'A') === leg);
      const otherStops = prev.filter(s => (s.leg || 'A') !== leg);
      legStops.sort((a, b) => {
        const aClient = clientById.get(a.clientId);
        const bClient = clientById.get(b.clientId);
        const aTime = a.type === 'PU' ? (aClient?.puTime || '') : (aClient?.doTime || '');
        const bTime = b.type === 'PU' ? (bClient?.puTime || '') : (bClient?.doTime || '');
        return timeToMinutes(aTime) - timeToMinutes(bTime);
      });
      return [...otherStops, ...legStops];
    });
  }, [clientById]);

  const handleMarkCompleted = useCallback((stop) => {
    const key = getStopKey(stop);
    setStopOverrides(prev => ({ ...prev, [key]: { type: 'completed', scope: 'today', label: 'Completed', color: 'emerald' } }));
    setStopMenuId(null);
    const trip = tripById.get(stop.clientId);
    if (trip && advanceWorkflow) {
      advanceWorkflow(trip, 'Completed', {
        completedAt: new Date().toISOString(),
        completedBy: currentUser,
      });
    }
  }, [getStopKey, tripById, advanceWorkflow, currentUser]);

  const moveStopInLeg = useCallback((stopId, direction) => {
    setSequence(prev => {
      const stop = prev.find(s => s.id === stopId);
      if (!stop) return prev;
      const leg = stop.leg || 'A';
      const legIndices = [];
      prev.forEach((s, i) => { if ((s.leg || 'A') === leg) legIndices.push(i); });
      const currentLegPos = legIndices.findIndex(i => prev[i].id === stopId);
      if (currentLegPos === -1) return prev;
      if (direction === 'up' && currentLegPos === 0) return prev;
      if (direction === 'down' && currentLegPos === legIndices.length - 1) return prev;
      const targetLegPos = direction === 'up' ? currentLegPos - 1 : currentLegPos + 1;
      const targetGlobalIdx = legIndices[targetLegPos];
      const currentGlobalIdx = legIndices[currentLegPos];
      const newSeq = [...prev];
      [newSeq[currentGlobalIdx], newSeq[targetGlobalIdx]] = [newSeq[targetGlobalIdx], newSeq[currentGlobalIdx]];
      return newSeq;
    });
  }, []);
  // End stop override actions

  // Add temp trip
  const handleAddTempTrip = (force = false) => {
    if (!tempTripForm.name.trim()) return;
    const isDuplicate = availableToday.some(
      c => c.name.toLowerCase() === tempTripForm.name.toLowerCase().trim()
    );
    if (isDuplicate && !force) {
      setShowDuplicateWarning(true);
      return;
    }
    const newClient = {
      id: `temp-${Date.now()}`,
      name: tempTripForm.name.trim(),
      req: tempTripForm.req || 'AMB',
      pu: tempTripForm.pu,
      do: tempTripForm.do,
      puTime: tempTripForm.puTime || '--:-- AM',
      doTime: tempTripForm.doTime || '--:-- AM',
      miles: parseFloat(tempTripForm.miles) || 0,
      days: [currentDay],
      todayStatus: 'active',
      isTemp: true,
      tripStatus: 'Unassigned',
      driverName: '',
    };
    setTempClients(prev => [newClient, ...prev]);
    setShowAddTempModal(false);
    setShowDuplicateWarning(false);
    setTempTripForm(initialTempForm);
  };

  // Drag & Drop
  const handleDragStart = (e, index) => {
    dragItem.current = index;
    setDraggedIndex(index);
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.style.opacity = '0.4';
  };
  const handleDragEnter = (_e, index) => {
    dragOverItem.current = index;
  };
  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = '1';
    if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
      const _seq = [...sequence];
      const dragged = _seq.splice(dragItem.current, 1)[0];
      _seq.splice(dragOverItem.current, 0, dragged);
      setSequence(_seq);
    }
    dragItem.current = null;
    dragOverItem.current = null;
    setDraggedIndex(null);
    setIsDragging(false);
  };

  // Validation engine
  const sequenceValidation = useMemo(() => {
    let currentPassengers = 0;
    const errors = [];
    const recurringErrors = [];
    const todayErrors = [];
    const warnings = [];
    const pickedUp = new Set();
    const capacityLog = [];
    const seenStops = new Set();
    const pickupCountByTrip = new Map();
    const dropoffCountByTrip = new Map();
    const uniqueTripIds = [];
    const uniqueTripIdSet = new Set();
    const tempStops = [];

    sequence.forEach((stop, index) => {
      const client = clientById.get(stop.clientId);
      const trip = tripById.get(stop.clientId);
      const stopKey = `${stop.clientId}:${stop.type}`;

      if (seenStops.has(stopKey)) {
        errors.push(`Duplicate stop in sequence for ${client?.name || stop.clientId} (${stop.type}) at step ${index + 1}.`);
      }
      seenStops.add(stopKey);

      if (!client) {
        errors.push(`Stale stop at step ${index + 1}. Reload trips before saving this route.`);
        capacityLog.push(currentPassengers);
        return;
      }

      const isRoutePlanImport = Boolean(client.isRoutePlanImport);

      if (!isRoutePlanImport && !uniqueTripIdSet.has(stop.clientId)) {
        uniqueTripIdSet.add(stop.clientId);
        uniqueTripIds.push(stop.clientId);
      }

      if (client.isTemp && !isRoutePlanImport) {
        tempStops.push(client.name || stop.clientId);
      }

      if (trip && isTerminalTripStatus(trip.status)) {
        errors.push(`Trip already ${String(trip.status).toLowerCase()} and cannot be routed: ${client.name || stop.clientId}.`);
      }

      if (stop.type === 'PU') {
        if (!isRoutePlanImport) {
          currentPassengers++;
          pickedUp.add(stop.clientId);
          pickupCountByTrip.set(stop.clientId, (pickupCountByTrip.get(stop.clientId) || 0) + 1);
        }
      } else if (stop.type === 'DO') {
        if (!isRoutePlanImport && !pickedUp.has(stop.clientId)) {
          errors.push(`Logic Error: Cannot drop off ${client?.name || 'client'} before picking them up.`);
        } else if (!isRoutePlanImport) {
          currentPassengers = Math.max(0, currentPassengers - 1);
        }
        if (!isRoutePlanImport) {
          dropoffCountByTrip.set(stop.clientId, (dropoffCountByTrip.get(stop.clientId) || 0) + 1);
        }
      }
      if (currentPassengers > VEHICLE_CAPACITY) {
        errors.push(`Capacity Exceeded at step ${index + 1}: ${currentPassengers}/${VEHICLE_CAPACITY} seats.`);
      }
      capacityLog.push(currentPassengers);
    });

    uniqueTripIds.forEach((tripId) => {
      const client = clientById.get(tripId);
      if (!pickupCountByTrip.get(tripId)) {
        errors.push(`Missing pickup stop for ${client?.name || tripId}.`);
      }
      if (!dropoffCountByTrip.get(tripId)) {
        errors.push(`Missing dropoff stop for ${client?.name || tripId}.`);
      }
    });

    if (tempStops.length > 0) {
      recurringErrors.push(`Temporary stops cannot be saved into recurring templates: ${tempStops.join(', ')}.`);
      warnings.push(`Temporary stops will not sync to trip assignment or reporting until they exist as real trips.`);
    }

    if (role === 'driver' && !currentDriver?.id) {
      todayErrors.push('This user is not linked to a driver profile yet, so a route cannot be assigned to the driver workspace.');
    }

    if (!effectiveTodayDriverId) {
      warnings.push('No driver selected for today. The route will save for today but it will not assign trips or appear in a driver banner.');
    }

    const affectedTrips = uniqueTripIds
      .map((tripId) => tripById.get(tripId))
      .filter(Boolean)
      .filter((trip) => !TERMINAL_TRIP_LABELS.has(trip.status));

    return {
      capacityLog,
      errors: [...new Set(errors)],
      recurringErrors: [...new Set(recurringErrors)],
      todayErrors: [...new Set(todayErrors)],
      warnings: [...new Set(warnings)],
      uniqueTripIds,
      affectedTrips,
      validTripIds: affectedTrips.map((trip) => trip.id),
      pickupCount: sequence.filter((stop) => stop.type === 'PU').length,
      dropoffCount: sequence.filter((stop) => stop.type === 'DO').length,
      uniquePatientCount: uniqueTripIds.length,
    };
  }, [sequence, clientById, tripById, role, currentDriver?.id, effectiveTodayDriverId]);

  // Save to Firestore
  const handleSave = async (saveMode = saveType) => {
    if (sequence.length === 0) return;
    setSaveError('');
    setSaveNotice('');
    if (saveMode === 'recurring' && templateDays.length === 0) {
      setSaveError('Select at least one day before saving a recurring template.');
      return;
    }
    const blockingErrors = [
      ...sequenceValidation.errors,
      ...(saveMode === 'recurring' ? sequenceValidation.recurringErrors : sequenceValidation.todayErrors),
    ];
    if (blockingErrors.length > 0) {
      setSaveError(blockingErrors.join(' '));
      return;
    }
    setIsSaving(true);
    try {
      const now = new Date();
      const nowIso = now.toISOString();
      const todayKey = getLocalDateKey(now);
      const template = {
        id: `tpl-${Date.now()}`,
        name: templateName.trim() || `Route ${now.toLocaleDateString()}`,
        days: saveMode === 'recurring' ? templateDays : [currentDay],
        type: saveMode,
        sequence: sequence.map((stop, index) => {
          const client = clientById.get(stop.clientId);
          return {
            clientId: stop.clientId,
            type: stop.type,
            leg: stop.leg || 'A',
            stepNumber: index + 1,
            name: client?.name || '',
            address: stop.type === 'PU' ? (client?.pu || '') : (client?.do || ''),
            time: stop.type === 'PU' ? (client?.puTime || '') : (client?.doTime || ''),
            bookingId: client?.bookingId || '',
            phone: client?.patientPhone || (stop.type === 'PU' ? client?.pickupPhone : client?.dropoffPhone) || client?.pickupPhone || client?.dropoffPhone || '',
            source: client?.isRoutePlanImport ? 'route-plan' : client?.isTemp ? 'temp' : 'trip',
          };
        }),
        metrics: {
          ...routeMetrics,
          patients: sequenceValidation.uniquePatientCount,
          pickups: sequenceValidation.pickupCount,
          dropoffs: sequenceValidation.dropoffCount,
          affectedTrips: sequenceValidation.validTripIds.length,
        },
        createdAt: nowIso,
        createdBy: currentUser || role || 'dispatcher',
        assignedDriver: effectiveTodayDriverId || null,
        assignmentDate: saveMode === 'today' ? todayKey : null,
        assignmentStatus: saveMode === 'today' ? ROUTE_ASSIGNMENT_STATUS.ASSIGNED : null,
        assignedBy: currentUser || role || 'dispatcher',
        assignedByRole: role || 'dispatcher',
        assignedAt: saveMode === 'today' ? nowIso : null,
        expiresAt: saveMode === 'today' ? getEndOfDayIso(now) : null,
        driverAcknowledgedAt: null,
        dismissedAt: null,
        startedAt: null,
        completedAt: null,
        validTripIds: sequenceValidation.validTripIds,
        ...(Object.keys(stopOverrides).length > 0 ? { stopOverrides } : {}),
        ...(saveMode === 'recurring' ? { dayOverrides: {} } : {}),
      };

      const allTemplates = [...savedTemplates, template];
      await setDoc(doc(db, SEQUENCES_DOC), { templates: allTemplates }, { merge: true });

      try {
        if (onRouteSaved) {
          onRouteSaved({
            route: template,
            saveMode,
            driverId: effectiveTodayDriverId || null,
            validTripIds: sequenceValidation.validTripIds,
            affectedTrips: sequenceValidation.affectedTrips,
          });
        }
      } catch (callbackError) {
        console.error('Route saved but post-save callback failed:', callbackError);
        setSaveNotice('Route saved, but one of the follow-up updates needs attention.');
      }

      if (saveMode === 'today' && effectiveTodayDriverId && sequenceValidation.validTripIds.length > 0 && onApplyRoute) {
        try {
          onApplyRoute({
            route: template,
            saveMode,
            driverId: effectiveTodayDriverId,
            driver: effectiveTodayDriver,
            tripIds: sequenceValidation.validTripIds,
          });
        } catch (callbackError) {
          console.error('Route saved but apply callback failed:', callbackError);
          setSaveNotice('Route saved, but trip assignment sync needs attention.');
        }
      } else if (saveMode === 'today' && !effectiveTodayDriverId) {
        setSaveNotice(`Saved "${template.name}" for today without a driver assignment. Trips were not reassigned.`);
      }

      setSaveSuccessMode(saveMode);
      setTimeout(() => {
        setSaveSuccessMode(null);
        setShowSaveModal(false);
        setTemplateName('');
        setSaveError('');
        setSaveNotice('');
        if (role !== 'driver') setSelectedDriver('');
      }, 1500);
    } catch (err) {
      console.error('Save failed:', err);
      setSaveError(err?.message || 'Save failed. Please try again.');
    }
    setIsSaving(false);
  };

  // Reassign a saved template to a different driver
  const handleReassignDriver = async (templateId, driverId) => {
    if (!templateId) return;
    const updatedTemplates = savedTemplates.map(tpl => {
      if (tpl.id === templateId) {
        return { ...tpl, assignedDriver: driverId || null };
      }
      return tpl;
    });
    try {
      await setDoc(doc(db, SEQUENCES_DOC), { templates: updatedTemplates }, { merge: true });
      setSavedTemplates(updatedTemplates);
    } catch (err) {
      console.error('Reassign failed:', err);
    }
    setReassigningId(null);
  };

  const statusColor = (status) => {
    if (status === 'Unassigned') return 'bg-rose-100 text-rose-700';
    if (status === 'Assigned') return 'bg-blue-100 text-blue-700';
    if (['In Progress', 'Navigating Pickup', 'At Pickup', 'In Transit'].includes(status)) return 'bg-amber-100 text-amber-700';
    return 'bg-emerald-100 text-emerald-700';
  };

  return (
    <div className="h-full min-h-0 w-full max-w-full flex flex-col overflow-hidden bg-slate-100">

      {/* ===== HEADER ===== */}
      <div className="backdrop-blur-xl bg-white/90 border-b border-slate-200/50 px-3 sm:px-4 lg:px-5 py-2.5 sm:py-3 flex flex-col lg:flex-row items-start lg:items-center justify-between flex-shrink-0 gap-3">
        <div className="flex items-center gap-3 min-w-0 w-full lg:w-auto">
          <div className="w-10 h-10 rounded-3xl flex items-center justify-center shadow-lg shadow-blue-200/50 flex-shrink-0 bg-blue-600">
            <Route className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-extrabold text-slate-900 leading-tight truncate tracking-tight">Route Sequencer</h2>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-slate-400 truncate">Multi-load Engine · Live Data</p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full lg:w-auto overflow-x-auto hide-scrollbar pb-0.5">
          {/* Day Selector */}
          <div className="bg-slate-100 border border-slate-200 rounded-3xl flex overflow-hidden p-0.5 flex-shrink-0">
            {DAY_FILTERS.map(day => (
              <button
                key={day}
                onClick={() => { setCurrentDay(day); setSequence([]); setStopOverrides({}); setStopMenuId(null); }}
                className={`min-h-9 px-2.5 lg:px-3 py-1.5 text-[11px] font-extrabold rounded-2xl transition-all whitespace-nowrap ${
                  currentDay === day
                    ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {day}
                <span className="ml-1 opacity-60">({dayCounts[day] || 0})</span>
              </button>
            ))}
          </div>

          {sequence.length > 0 && (
            <button
              onClick={() => setShowSaveModal(true)}
              className="min-h-9 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold rounded-2xl shadow-lg shadow-emerald-200/50 transition-all flex-shrink-0 active:scale-[0.97]"
            >
              <Save className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Save Route</span>
            </button>
          )}

          <button
            onClick={() => setShowTemplatesModal(true)}
            className="min-h-9 flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-extrabold rounded-2xl border border-blue-100 transition-all flex-shrink-0"
          >
            <Route className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Saved ({savedTemplates.length})</span>
          </button>

          {sequence.length > 0 && (
            <button
              onClick={clearSequence}
              className="min-h-9 min-w-9 p-2 bg-slate-100 border border-slate-200 rounded-2xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
              title="Clear sequence"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ===== METRICS BAR ===== */}
      <div className="px-3 lg:px-5 py-2 flex items-center gap-3 overflow-x-auto hide-scrollbar flex-shrink-0 bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="flex gap-2 sm:gap-5 min-w-max">
          {[
            [MapPin, 'Stops:', routeMetrics.stops, 'text-blue-400'],
            [Route, 'Miles:', routeMetrics.miles, 'text-emerald-400'],
            [Clock, 'Est:', routeMetrics.estTime, 'text-amber-400'],
            [Users, 'Pool:', availableToday.length, 'text-purple-400'],
          ].map(([Icon, label, value, color], i) => (
            <div key={i} className="flex items-center gap-1.5 rounded-2xl bg-white/5 px-2.5 py-1.5">
              <Icon className={`w-3.5 h-3.5 ${color}`} />
              <span className="hidden sm:inline text-[9px] font-extrabold uppercase tracking-[0.12em] text-white/40">{label}</span>
              <span className="text-[12px] font-extrabold text-white">{value}</span>
            </div>
          ))}
        </div>
        <div className="hidden lg:flex items-center gap-1.5 rounded-2xl bg-white/5 px-2.5 py-1.5">
          <CarFront className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-white/40">Capacity:</span>
          <span className="text-[12px] font-extrabold text-blue-400">{VEHICLE_CAPACITY} seats</span>
        </div>
      </div>

      {/* ===== MOBILE TABS ===== */}
      <div className="lg:hidden p-2.5 bg-white border-b border-slate-200/50 flex gap-2 flex-shrink-0">
        <button
          onClick={() => setMobileView('pool')}
          className={`flex-1 min-h-10 py-2 rounded-2xl text-[13px] font-extrabold transition-all ${
            mobileView === 'pool' ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20' : 'bg-slate-100 text-slate-500 border border-slate-200'
          }`}
        >
          Pool ({availableToday.length})
        </button>
        <button
          onClick={() => setMobileView('sequence')}
          className={`flex-1 min-h-10 py-2 rounded-2xl text-[13px] font-extrabold transition-all ${
            mobileView === 'sequence' ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20' : 'bg-slate-100 text-slate-500 border border-slate-200'
          }`}
        >
          Sequence ({sequence.length}) {sequenceValidation.errors.length > 0 && '⚠️'}
        </button>
      </div>

      {/* ===== MAIN WORKSPACE ===== */}
      <div className="relative flex flex-1 min-h-0 flex-col gap-0 overflow-hidden lg:flex-row lg:gap-5 lg:p-5">

        {/* LEFT: Trip Pool */}
        <div className={`h-full min-h-0 w-full flex-col gap-3 overflow-hidden flex-shrink-0 lg:w-[400px] xl:w-[440px] ${mobileView === 'pool' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white shadow-sm lg:rounded-3xl lg:border lg:border-slate-200/60">

            {/* Pool header */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 px-3 sm:px-4 py-3 border-b border-slate-100">
              <div className="flex items-center justify-between sm:justify-start gap-2 min-w-0">
                <h3 className="text-[13px] font-extrabold text-slate-900 flex items-center gap-2 tracking-tight">
                  <div className="w-8 h-8 rounded-2xl bg-blue-50 flex items-center justify-center">
                    <CalendarDays className="w-4 h-4 text-blue-600" />
                  </div>
                  {currentDay} · {availableToday.length} trip{availableToday.length !== 1 ? 's' : ''}
                </h3>
                <div className="flex bg-slate-100 rounded-2xl p-0.5 gap-0.5">
                  <button onClick={() => setActiveLeg('A')} className={`px-2.5 py-1 text-[10px] font-extrabold rounded-xl transition-all ${activeLeg === 'A' ? 'bg-white text-blue-700 shadow-sm border border-blue-100' : 'text-slate-400 hover:text-slate-600'}`}><Flag className="w-3 h-3 inline mr-0.5" />A</button>
                  <button onClick={() => setActiveLeg('B')} className={`px-2.5 py-1 text-[10px] font-extrabold rounded-xl transition-all ${activeLeg === 'B' ? 'bg-white text-amber-700 shadow-sm border border-amber-100' : 'text-slate-400 hover:text-slate-600'}`}><Flag className="w-3 h-3 inline mr-0.5" />B</button>
                </div>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
                {availableToday.length > 0 && (
                  <button
                    onClick={addAllPickups}
                    className="min-h-9 flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-extrabold rounded-2xl transition-colors border border-blue-100"
                    title="Add all pickups"
                  >
                    <Zap className="w-3 h-3" /> All PU
                  </button>
                )}
                <button
                  onClick={() => setShowAddTempModal(true)}
                  className="min-h-9 flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-extrabold rounded-2xl transition-colors border border-blue-100"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
                <div className="relative">
                  <button
                    onClick={() => setShowFilter(f => !f)}
                    className={`min-h-9 min-w-9 p-1.5 border rounded-2xl text-xs font-bold transition-colors ${filterStatus !== 'all' ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                  >
                    <Filter className="w-3.5 h-3.5" />
                  </button>
                  {showFilter && (
                    <div className="absolute right-0 top-full mt-1 card-premiumshadow-xl z-30 overflow-hidden w-36">
                      {[['all', 'All Trips'], ['unassigned', 'Unassigned'], ['assigned', 'Assigned']].map(([val, label]) => (
                        <button
                          key={val}
                          onClick={() => { setFilterStatus(val); setShowFilter(false); }}
                          className={`w-full text-left px-3 py-2 text-[11px] font-extrabold transition-colors ${filterStatus === val ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-3 sm:px-4 py-2.5 border-b border-slate-100/80 bg-slate-50">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={poolSearch}
                  onChange={(e) => setPoolSearch(e.target.value)}
                  placeholder="Search patient, booking, pickup, or dropoff"
                  className="w-full min-h-11 pl-9 pr-3 py-2.5 rounded-2xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>
            </div>

            {/* Pool list */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2.5 sm:p-3 space-y-2">
              {availableToday.length === 0 ? (
                <div className="text-center p-8 bg-slate-50 rounded-3xl border border-dashed border-slate-300 mt-4">
                  <Route className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="font-extrabold text-slate-500 text-[13px]">No trips for {currentDay}</p>
                  <p className="text-[11px] font-semibold text-slate-400 mt-1">
                    {allLiveClients.length > 0
                      ? 'Try All, another live day, or clear the search filter to pull in the current trip board.'
                      : 'Trips from Firestore appear here automatically as soon as the live board syncs.'}
                  </p>
                  {allLiveClients.length > 0 && currentDay !== 'All' && (
                    <button
                      onClick={() => setCurrentDay('All')}
                      className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-900 text-white text-[11px] font-extrabold shadow-lg shadow-slate-900/20"
                    >
                      <Route className="w-3.5 h-3.5" /> Open All Live Trips
                    </button>
                  )}
                </div>
              ) : (
                availableToday.map(client => (
                  <div key={client.id} className={`bg-white border shadow-sm rounded-3xl p-3 hover:border-blue-300 transition-all duration-300 group ${
                    client.urgency === 2 ? 'border-rose-300 shadow-rose-200/30 animate-pulse' :
                    client.urgency === 1 ? 'border-amber-300 shadow-amber-200/20' :
                    'border-slate-200/60'
                  }`}>
                    <div className="flex justify-between items-start mb-2">
                      <div className="min-w-0 flex-1 pr-2">
                        <h4 className="font-extrabold text-slate-900 leading-tight text-[13px] truncate flex items-center gap-1">
                          {client.urgency > 0 && <Zap size={12} className={client.urgency === 2 ? 'text-rose-500 fill-rose-500' : 'text-amber-500 fill-amber-500'} />}
                          {client.name}
                        </h4>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 text-[9px] font-extrabold rounded-lg">{client.req}</span>
                          {client.bookingId && (
                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[9px] font-extrabold rounded-lg border border-blue-100">{client.bookingId}</span>
                          )}
                          <span className={`px-1.5 py-0.5 text-[9px] font-extrabold rounded-lg ${statusColor(client.tripStatus)}`}>
                            {client.tripStatus}
                          </span>
                          {client.isTemp && (
                            <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 text-[9px] font-extrabold rounded-lg border border-amber-200">ONE-TIME</span>
                          )}
                        </div>
                        {client.driverName && (
                          <p className="text-[10px] font-semibold text-slate-400 mt-1 truncate">Driver: {client.driverName}</p>
                        )}
                        {(client.patientPhone || client.pickupPhone || client.dropoffPhone) && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(client.patientPhone || client.pickupPhone) && (
                              <span className="rounded-2xl border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                                Client {client.patientPhone || client.pickupPhone}
                              </span>
                            )}
                            {client.dropoffPhone && (
                              <span className="rounded-2xl border border-rose-100 bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-700">
                                Dropoff {client.dropoffPhone}
                              </span>
                            )}
                          </div>
                        )}
                        {client.notes && (
                          <p className="mt-1 truncate text-[10px] font-semibold text-amber-600">
                            Notes: {client.notes}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => toggleClientSkip(client.id)}
                        className="min-h-9 min-w-9 text-slate-300 hover:text-red-500 bg-slate-50 p-1.5 rounded-2xl border border-slate-100 transition-colors flex-shrink-0"
                        title="Skip"
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Address preview */}
                    <div className="space-y-1 mb-2">
                      {client.pu && (
                        <div className="flex items-start gap-1.5 text-[10px]">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1 flex-shrink-0" />
                          <span className="truncate">
                            <span className="font-extrabold text-emerald-700 mr-1">PU:</span>
                            <span className="font-semibold text-slate-500">{client.pu}</span>
                          </span>
                        </div>
                      )}
                      {client.do && (
                        <div className="flex items-start gap-1.5 text-[10px]">
                          <span className="w-2 h-2 rounded-full bg-red-500 mt-1 flex-shrink-0" />
                          <span className="truncate">
                            <span className="font-extrabold text-red-700 mr-1">DO:</span>
                            <span className="font-semibold text-slate-500">{client.do}</span>
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Add buttons */}
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => addStopToSequence(client.id, 'PU')}
                        disabled={isStopInSequence(client.id, 'PU')}
                        className={`min-h-10 flex-1 flex justify-between items-center px-2.5 py-1.5 border rounded-2xl text-[10px] font-extrabold transition-all ${
                          isStopInSequence(client.id, 'PU')
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 opacity-60'
                            : 'bg-white border-slate-200 hover:border-emerald-400 text-slate-700 hover:text-emerald-600 shadow-sm'
                        }`}
                      >
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" /> <span className="uppercase">Pickup</span> <span className="font-extrabold">{client.puTime}</span>
                        </span>
                        {isStopInSequence(client.id, 'PU') ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => addStopToSequence(client.id, 'DO')}
                        disabled={isStopInSequence(client.id, 'DO')}
                        className={`min-h-10 flex-1 flex justify-between items-center px-2.5 py-1.5 border rounded-2xl text-[10px] font-extrabold transition-all ${
                          isStopInSequence(client.id, 'DO')
                            ? 'bg-red-50 border-red-200 text-red-700 opacity-60'
                            : 'bg-white border-slate-200 hover:border-red-400 text-slate-700 hover:text-red-600 shadow-sm'
                        }`}
                      >
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-red-500" /> <span className="uppercase">Dropoff</span>
                        </span>
                        {isStopInSequence(client.id, 'DO') ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Skipped */}
            {skippedToday.length > 0 && (
              <div className="border-t border-rose-100/80 bg-rose-50/50 px-3 py-2">
                <p className="text-[10px] font-extrabold text-rose-700 flex items-center gap-1 mb-1.5 uppercase tracking-wider">
                  <AlertTriangle className="w-3 h-3" /> Skipped ({skippedToday.length})
                </p>
                <div className="space-y-1.5">
                  {skippedToday.map(client => (
                    <div key={client.id} className="flex justify-between items-center bg-white border border-rose-100 rounded-2xl px-2.5 py-1.5">
                      <span className="text-[11px] font-extrabold text-slate-700 truncate">{client.name}</span>
                      <button
                        onClick={() => toggleClientSkip(client.id)}
                        className="text-[10px] text-blue-600 font-extrabold hover:text-blue-800 ml-2 flex-shrink-0"
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Sequence Builder */}
        <div className={`h-full min-h-0 flex-1 flex-col overflow-hidden bg-white shadow-sm lg:rounded-3xl lg:border lg:border-slate-200/60 ${mobileView === 'sequence' ? 'flex' : 'hidden lg:flex'}`}>

          {/* Validation errors */}
          {sequenceValidation.errors.length > 0 && (
            <div className="bg-rose-50 border-b border-rose-200 px-3 sm:px-4 py-2.5 max-h-28 overflow-y-auto">
              {sequenceValidation.errors.map((err, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] font-extrabold text-rose-600">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}

          {/* Sequence header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 px-3 sm:px-4 py-3 border-b border-slate-100 flex-shrink-0">
            <div className="min-w-0">
              <h3 className="text-[13px] font-extrabold text-slate-900 tracking-tight">
                Route Sequence
                {sequence.length > 0 && <span className="ml-2 text-blue-600">({sequence.length} stops)</span>}
              </h3>
              {initialOrigin && (
                <p className="text-[10px] font-semibold text-emerald-600 mt-0.5 truncate max-w-full">
                  Starting from: {initialOrigin}
                </p>
              )}
            </div>
            {sequence.length > 0 && (
              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-extrabold">
                <GripVertical className="w-3 h-3" /> Drag to reorder
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2.5 sm:p-4 lg:p-5 bg-slate-100">
            {sequence.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <div className="w-16 h-16 bg-white backdrop-blur rounded-3xl shadow-sm border border-slate-200/60 flex items-center justify-center mb-4">
                  <Route className="w-7 h-7 text-slate-300" />
                </div>
                <p className="font-extrabold text-slate-700 text-[15px] tracking-tight">Build Your Sequence</p>
                <p className="text-[11px] font-semibold mt-1 max-w-xs text-center text-slate-400">
                  Click Pickup / Dropoff on any trip in the pool. Drag to reorder.
                </p>
                {availableToday.length > 0 && (
                  <button
                    onClick={addAllPickups}
                    className="mt-4 flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-extrabold rounded-2xl shadow-lg shadow-slate-900/20 transition-all active:scale-[0.97]"
                  >
                    <Zap className="w-3.5 h-3.5" /> Auto-Add All Pickups
                  </button>
                )}
              </div>
            ) : (
              <div className="w-full max-w-2xl mx-auto space-y-2.5 relative pb-10">
                {(() => {
                  let lastLeg = null;
                  let globalIdx = 0;
                  const nodes = [];
                  sequence.forEach((stop, seqIdx) => {
                    const leg = stop.leg || 'A';
                    if (leg !== lastLeg) {
                      if (lastLeg !== null) {
                        nodes.push(
                            <div key={'leg-divider-' + seqIdx} className="relative py-2">
                            <div className="absolute inset-0 flex items-center">
                              <div className="w-full border-t border-dashed border-amber-300/50" />
                            </div>
                            <div className="relative flex justify-center">
                              <span className="bg-slate-200/80 backdrop-blur px-3 text-[10px] font-extrabold uppercase tracking-[0.15em] text-amber-600 flex items-center gap-2 rounded-2xl">{leg === 'B' ? 'Leg B' : 'Leg ' + leg}{legCompletion[leg] === 'complete' && <span className="text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-xl text-[8px]">All Done</span>}{legCompletion[leg] === 'partial' && <span className="text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-xl text-[8px]">Partial</span>}
                                <button onClick={() => handleSortLeg(leg)} className="ml-1 px-1.5 py-0.5 bg-white/80 border border-amber-200 rounded-xl text-[8px] font-extrabold text-amber-600 hover:bg-amber-50 transition-colors flex items-center gap-0.5" title="Sort stops by time"><Clock className="w-2.5 h-2.5" /> Sort</button>
                              </span>
                            </div>
                          </div>
                        );
                      } else {
                        nodes.push(
                          <div key={'leg-label-' + leg} className="flex items-center gap-2 mb-2">
                            <div className={'w-6 h-6 rounded-xl flex items-center justify-center shadow-sm ' + (leg === 'B' ? 'bg-amber-500' : 'bg-blue-500')}>
                              <Flag className="w-3 h-3 text-white" />
                            </div>
                            <span className={'text-[11px] font-extrabold uppercase tracking-[0.12em] ' + (leg === 'B' ? 'text-amber-700' : 'text-blue-700')}>{leg === 'B' ? 'Leg B' : 'Leg ' + leg}</span>
                            {legCompletion[leg] === 'complete' && <span className="text-[9px] font-extrabold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-xl">All Done</span>}
                            {legCompletion[leg] === 'partial' && <span className="text-[9px] font-extrabold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-xl">Partial</span>}
                            <button onClick={() => handleSortLeg(leg)} className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-xl text-[9px] font-extrabold text-slate-500 hover:bg-slate-200 transition-colors flex items-center gap-1 flex-shrink-0" title="Sort stops by time"><Clock className="w-3 h-3" /> Sort by Time</button>
                          </div>
                        );
                      }
                      lastLeg = leg;
                    }
                    const client = allClients.find(c => c.id === stop.clientId);
                    if (!client) { globalIdx++; return; }
                    const trip = tripById.get(stop.clientId);
                    const tripStatus = trip?.status || '';
                    const tripIdForDisplay = trip?.bookingId || trip?.id || stop.clientId;
                    const isTerminal = trip && isTerminalTripStatus(tripStatus);
                    const isDone = tripStatus === 'Completed';
                    const isCancelled = tripStatus === 'Cancelled';
                    const isNoShow = tripStatus === 'No Show';
                    const isPU = stop.type === 'PU';
                    const passengersInCar = sequenceValidation.capacityLog[globalIdx];
                    const isOverCap = passengersInCar > VEHICLE_CAPACITY;
                    const override = getStopOverride(stop);
                    const effectiveOverride = override || (isDone ? { type: 'completed', scope: 'today', label: 'Completed', color: 'emerald' } : isNoShow ? { type: 'no-show', scope: 'today', label: 'No Show', color: 'amber' } : isCancelled ? { type: 'cancelled', scope: 'today', label: 'Cancelled', color: 'rose' } : null);
                    const idx = globalIdx;
                    globalIdx++;
                    nodes.push(
                      <div key={stop.id} draggable onDragStart={(e) => handleDragStart(e, idx)} onDragEnter={(e) => handleDragEnter(e, idx)} onDragEnd={handleDragEnd} onDragOver={(e) => e.preventDefault()}
                        className={`relative z-10 flex gap-2 lg:gap-3 items-stretch group transition-all ${isDragging && draggedIndex === idx ? 'opacity-40 scale-95' : 'opacity-100'}`}
                      >
                        <div className="flex flex-col items-center pt-1">
                          <div className={`w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-2xl flex items-center justify-center font-extrabold text-[11px] sm:text-[13px] border-2 sm:border-[3px] border-slate-50 shadow-sm flex-shrink-0 z-10 ${isPU ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200/50' : 'bg-rose-500 text-white shadow-lg shadow-rose-200/50'}`}>
                            {idx + 1}
                          </div>
                        </div>
                        <div className={`min-w-0 flex-1 bg-white rounded-2xl sm:rounded-3xl p-2 sm:p-3 shadow-sm flex items-start sm:items-center gap-2 transition-all border ${isPU ? 'border-emerald-100 hover:border-emerald-300' : 'border-red-100 hover:border-red-300'} ${isOverCap ? 'ring-2 ring-red-400' : ''} ${client.urgency === 2 ? 'shadow-[0_0_12px_-2px_rgba(225,29,72,0.4)] border-rose-300' : client.urgency === 1 ? 'shadow-[0_0_10px_-2px_rgba(245,158,11,0.3)] border-amber-300' : ''} ${effectiveOverride ? (effectiveOverride.color === 'rose' ? 'ring-2 ring-rose-300 bg-rose-50/30' : effectiveOverride.color === 'amber' ? 'ring-2 ring-amber-300 bg-amber-50/30' : effectiveOverride.color === 'red' ? 'ring-2 ring-red-400 bg-red-50/30 line-through opacity-60' : effectiveOverride.color === 'emerald' ? 'ring-2 ring-emerald-300 bg-emerald-50/30' : 'ring-2 ring-slate-300 bg-slate-50/30 line-through opacity-60') : ''}`}>
                          <div className="cursor-grab active:cursor-grabbing p-1 sm:p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-300 rounded-xl transition-colors hidden sm:flex flex-shrink-0"><GripVertical className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className={`text-[9px] font-extrabold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-lg ${isPU ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{isPU ? '⬆ PU' : '⬇ DO'}</span>
                              <span className="text-[9px] font-bold text-slate-400">{isPU ? client.puTime : client.doTime}</span>
                              {effectiveOverride && <span className={`px-1.5 py-0.5 rounded-lg text-[8px] font-extrabold uppercase tracking-wider ${effectiveOverride.color === 'emerald' ? 'bg-emerald-100 text-emerald-800' : effectiveOverride.color === 'amber' ? 'bg-amber-100 text-amber-800' : effectiveOverride.color === 'rose' ? 'bg-rose-100 text-rose-800' : effectiveOverride.color === 'red' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'}`}>{effectiveOverride.label}</span>}
                            </div>
                            <h4 className="font-extrabold text-slate-900 text-[13px] truncate flex items-center gap-1">
                              {client.urgency > 0 && <Zap size={11} className={client.urgency === 2 ? 'text-rose-500 fill-rose-500' : 'text-amber-500 fill-amber-500'} />}
                              {client.name}
                              {tripStatus === 'In Progress' && <span className="text-[8px] font-extrabold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full ml-auto animate-pulse flex-shrink-0">LIVE</span>}
                            </h4>
                            <div className="mt-1 flex flex-wrap gap-1 items-center">
                              <span className={`rounded-2xl border px-1.5 py-0.5 text-[9px] font-extrabold ${tripStatus === 'In Progress' ? 'border-blue-200 bg-blue-100 text-blue-800 ring-1 ring-blue-300' : 'border-blue-100 bg-blue-50 text-blue-700'}`}>{client.bookingId || tripIdForDisplay}</span>
                              {client.req && <span className="rounded-2xl border border-slate-200/60 bg-slate-100 px-1.5 py-0.5 text-[9px] font-extrabold text-slate-600">{client.req}</span>}
                            </div>
                            <p className="text-[10px] font-semibold text-slate-400 truncate flex items-center gap-1 mt-0.5"><MapPin className="w-2.5 h-2.5 text-blue-400 flex-shrink-0" />{isPU ? client.pu : client.do}</p>
                            {client.notes && <p className="mt-1 truncate text-[10px] font-semibold text-amber-600">Notes: {client.notes}</p>}
                          </div>
                          <div className="flex items-start sm:items-center gap-1 flex-shrink-0">
                            {!override && (
                              <div className="relative">
                                <button onClick={() => setStopMenuId(stopMenuId === stop.id ? null : stop.id)} className="min-h-9 min-w-9 p-1.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600 rounded-xl transition-colors"><MoreHorizontal className="w-3.5 h-3.5 mx-auto" /></button>
                {stopMenuId === stop.id && (
                    <div className="absolute right-0 top-full mt-1 z-50 card-premiumshadow-2xl py-1 min-w-[180px] max-w-[calc(100vw-2rem)]">
                      <div className="px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.15em] text-slate-400">Status Override</div>
                      <button onClick={() => handleNoShowToday(stop)} className="w-full px-3 py-2 text-[11px] font-extrabold text-left text-amber-700 hover:bg-amber-50 flex items-center gap-2 transition-colors"><UserX className="w-3.5 h-3.5" /> No Show Today</button>
                      <button onClick={() => handleCancelToday(stop)} className="w-full px-3 py-2 text-[11px] font-extrabold text-left text-rose-700 hover:bg-rose-50 flex items-center gap-2 transition-colors"><XCircle className="w-3.5 h-3.5" /> Cancel Today</button>
                      <button onClick={() => handleMarkCompleted(stop)} className="w-full px-3 py-2 text-[11px] font-extrabold text-left text-emerald-700 hover:bg-emerald-50 flex items-center gap-2 transition-colors"><CheckCircle2 className="w-3.5 h-3.5" /> Mark Completed</button>
                      <div className="border-t border-slate-100 my-1" />
                      <button onClick={() => handleCancelPermanent(stop)} className="w-full px-3 py-2 text-[11px] font-extrabold text-left text-red-700 hover:bg-red-50 flex items-center gap-2 transition-colors"><CalendarX className="w-3.5 h-3.5" /> Cancel Permanently</button>
                      <button onClick={() => handleRemoveWeek(stop)} className="w-full px-3 py-2 text-[11px] font-extrabold text-left text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition-colors"><Ban className="w-3.5 h-3.5" /> Remove from All Days</button>
                      <div className="border-t border-slate-100 my-1" />
                      <div className="px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.15em] text-slate-400">Leg</div>
                      <button onClick={() => handleMoveToOtherLeg(stop)} className="w-full px-3 py-2 text-[11px] font-extrabold text-left text-blue-700 hover:bg-blue-50 flex items-center gap-2 transition-colors"><Flag className="w-3.5 h-3.5" /> Move to Leg {stop.leg === 'B' ? 'A' : 'B'}</button>
                    </div>
                  )}
                              </div>
                            )}
                            {override && (
                              <button onClick={() => handleClearOverride(stop)} className="min-h-8 px-2 py-1 text-[9px] font-bold text-slate-500 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100" title="Clear override">Undo</button>
                            )}
                            <div className={`hidden md:flex flex-col items-center justify-center w-10 h-10 rounded-2xl border ${isOverCap ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100'}`}><Users className={`w-3.5 h-3.5 ${isOverCap ? 'text-red-500' : 'text-blue-500'}`} /><span className={`text-[9px] font-black ${isOverCap ? 'text-red-700' : 'text-slate-600'}`}>{passengersInCar}/{VEHICLE_CAPACITY}</span></div>
                            <div className="flex flex-col gap-0.5">
                              <button onClick={() => moveStopInLeg(stop.id, 'up')} className="min-h-7 min-w-7 p-1 bg-slate-50 hover:bg-slate-100 rounded-lg text-slate-400 disabled:opacity-20 border border-slate-200" title="Move up in leg"><ArrowUp className="w-3 h-3 mx-auto" /></button>
                              <button onClick={() => moveStopInLeg(stop.id, 'down')} className="min-h-7 min-w-7 p-1 bg-slate-50 hover:bg-slate-100 rounded-lg text-slate-400 disabled:opacity-20 border border-slate-200" title="Move down in leg"><ArrowDown className="w-3 h-3 mx-auto" /></button>
                            </div>
                            <button onClick={() => removeStopFromSequence(stop.id)} className="min-h-9 min-w-9 p-1.5 text-slate-200 hover:bg-red-50 hover:text-red-500 rounded-xl transition-colors border border-transparent hover:border-red-200"><X className="w-4 h-4 mx-auto" /></button>
                          </div>
                        </div>
                      </div>
                    );
                  });
                  return nodes;
                })()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== SAVE MODAL ===== */}
      {showSaveModal && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg max-h-[92vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex justify-between items-center flex-shrink-0">
              <h2 className="text-[15px] font-extrabold text-slate-900 flex items-center gap-2 tracking-tight">
                <div className="w-9 h-9 rounded-3xl bg-blue-50 flex items-center justify-center">
                  <Settings2 className="w-4 h-4 text-blue-600" />
                </div>
                Save Route
              </h2>
              <button onClick={() => setShowSaveModal(false)} className="w-8 h-8 rounded-2xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 bg-slate-50 overflow-y-auto">
              {role !== 'driver' ? (
              <div className="flex bg-white p-1 rounded-2xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setSaveType('recurring')}
                  className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${saveType === 'recurring' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500'}`}
                >
                  Recurring Template
                </button>
                <button
                  type="button"
                  onClick={() => setSaveType('today')}
                  className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${saveType === 'today' ? 'bg-amber-500 text-white shadow-md' : 'text-slate-500'}`}
                >
                  Today Override
                </button>
              </div>
              ) : (
                <div className="rounded-3xl border border-blue-100 bg-blue-50 px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-blue-500">Driver Route</p>
                  <p className="text-sm font-black text-blue-900 mt-0.5">This route will save for you only.</p>
                </div>
              )}

              <div>
                <label className="text-micro font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Template Name</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  placeholder="e.g., Northside Dialysis Loop"
                  className="w-full px-4 py-2.5 card-premiumtext-sm font-bold focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>

              {saveType === 'recurring' && (
                <div className="space-y-3">
                  {role !== 'driver' ? (
                  <div>
                    <label className="text-micro font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Applies On</label>
                    <div className="flex flex-wrap gap-2">
                      {DAYS_OF_WEEK.map(day => (
                        <button
                          type="button"
                          key={`modal-${day}`}
                          onClick={() => setTemplateDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])}
                          className={`px-3 py-1.5 rounded-2xl text-xs font-bold border transition-all ${
                            templateDays.includes(day)
                              ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                              : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                  ) : (
                    <div className="rounded-3xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-micro font-bold text-slate-400 uppercase tracking-wider">Assigned Driver</p>
                      <p className="text-sm font-black text-slate-900 mt-1">{currentDriver?.name || currentUser || 'You'}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-micro font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Default Driver (Optional)</label>
                    <select
                      value={selectedDriver}
                      onChange={e => setSelectedDriver(e.target.value)}
                      className="w-full px-4 py-2.5 card-premiumtext-sm font-bold focus:outline-none focus:border-blue-500 transition-all"
                    >
                      <option value="">No Default Driver</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>{d.name} — {d.vehicle || 'No vehicle'} ({d.status})</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              
              {saveType === 'today' && (
                <div>
                  <label className="text-micro font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Assign To Driver (Optional)</label>
                  {role === 'driver' ? (
                    <div className="w-full px-4 py-2.5 bg-white border border-blue-100 rounded-2xl text-sm font-black text-blue-900">
                      {currentDriver?.name || currentUser || 'You'} (You)
                    </div>
                  ) : (
                    <select
                      value={selectedDriver}
                      onChange={e => setSelectedDriver(e.target.value)}
                      className="w-full px-4 py-2.5 card-premiumtext-sm font-bold focus:outline-none focus:border-blue-500 transition-all"
                    >
                      <option value="">Leave Unassigned</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>{d.name} — {d.vehicle || 'No vehicle'} ({d.status})</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Sequence preview */}
              <div className="card-premiump-3 max-h-32 overflow-y-auto">
                <p className="text-micro font-bold text-slate-400 uppercase tracking-wider mb-2">Preview ({sequence.length} stops)</p>
                {sequence.map((stop, i) => {
                  const client = allClients.find(c => c.id === stop.clientId);
                  const isPU = stop.type === 'PU';
                  return (
                    <div key={stop.id} className="flex items-center gap-2 mb-1 last:mb-0">
                      <span className={`w-4 h-4 rounded-lg text-[8px] font-black flex items-center justify-center text-white ${isPU ? 'bg-emerald-500' : 'bg-red-500'}`}>{i + 1}</span>
                      <span className={`text-[9px] font-bold ${isPU ? 'text-emerald-700' : 'text-red-700'}`}>{isPU ? 'PU' : 'DO'}</span>
                      <span className="text-micro text-slate-600 font-semibold truncate">{client?.name}</span>
                      {client?.bookingId && (
                        <span className="rounded-2xl border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">
                          {client.bookingId}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 flex gap-2.5">
                <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-blue-800 leading-relaxed">
                  {saveType === 'recurring'
                    ? 'This sequence will be saved as a template in Firestore and can be applied on selected days.'
                    : `This will save as a one-time override for ${currentDay} only.`}
                </p>
              </div>

              {sequenceValidation.warnings.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 space-y-1">
                  {sequenceValidation.warnings.map((warning, index) => (
                    <p key={index} className="text-xs font-semibold text-amber-800">{warning}</p>
                  ))}
                </div>
              )}

              {saveError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
                  <p className="text-xs font-bold text-rose-800">{saveError}</p>
                </div>
              )}

              {saveNotice && !saveError && (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3">
                  <p className="text-xs font-semibold text-sky-800">{saveNotice}</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-white grid grid-cols-1 sm:flex sm:flex-wrap sm:justify-end gap-3 flex-shrink-0">
              <button type="button" onClick={() => setShowSaveModal(false)} className="min-h-11 px-4 py-2 rounded-2xl text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors">
                Cancel
              </button>
              {role !== 'driver' && (
              <button
                type="button"
                onClick={() => {
                  setSaveType('recurring');
                  handleSave('recurring');
                }}
                disabled={isSaving || saveSuccess}
                className="min-h-11 px-5 py-2 rounded-2xl text-sm font-bold text-white shadow-md transition-all bg-blue-600 hover:bg-blue-700 shadow-blue-200 disabled:opacity-70"
              >
                {saveSuccessMode === 'recurring' ? 'Saved Template' : isSaving && saveType === 'recurring' ? 'Saving Template...' : 'Save Template'}
              </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setSaveType('today');
                  handleSave('today');
                }}
                disabled={isSaving || saveSuccess}
                className="min-h-11 px-5 py-2 rounded-2xl text-sm font-bold text-white shadow-md transition-all bg-amber-500 hover:bg-amber-600 shadow-amber-200 disabled:opacity-70"
              >
                {saveSuccessMode === 'today' ? 'Saved Override' : isSaving && saveType === 'today' ? 'Saving Override...' : role === 'driver' ? 'Save Today Route' : 'Save Override'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== SAVED TEMPLATES MODAL ===== */}
      {showTemplatesModal && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[85vh]">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Route className="w-5 h-5 text-blue-600" /> Saved Route Sequences
              </h2>
              <button onClick={() => setShowTemplatesModal(false)} className="p-2 rounded-2xl bg-white hover:bg-slate-100 text-slate-500 shadow-sm border border-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-3 sm:p-5 overflow-y-auto space-y-3 flex-1 bg-slate-50/50">
              {savedTemplates.length === 0 ? (
                <div className="py-12 text-center text-slate-500 flex flex-col items-center">
                  <Route className="w-12 h-12 text-slate-200 mb-3" />
                  <p className="font-semibold text-sm">No saved routes yet</p>
                  <p className="text-xs mt-1">Create a sequence and click "Save Route"</p>
                </div>
              ) : (
                [...savedTemplates].reverse().map((tpl) => (
                  <div key={tpl.id} className="bg-white border border-slate-200 p-4 rounded-3xl flex flex-col gap-3 shadow-sm hover:shadow-md transition-all">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                      <div className="min-w-0">
                        <h4 className="font-black text-slate-900 text-base">{tpl.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border ${normalizeRouteRecord(tpl).statusBadgeClass}`}>
                            {normalizeRouteRecord(tpl).statusLabel}
                          </span>
                          <span className="text-xs font-semibold text-slate-500">
                            {tpl.type === 'recurring' ? (tpl.days?.join(', ') || 'No days') : (tpl.assignmentDate || 'No assignment date')}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-right">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{new Date(tpl.createdAt).toLocaleDateString()}</span>
                        <span className="text-xs font-semibold text-slate-600">By {tpl.createdBy}</span>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 sm:gap-4 text-xs font-semibold text-slate-600 border-t border-slate-100 pt-2">
                      <span>{tpl.sequence?.length || 0} Stops</span>
                      <span>{tpl.metrics?.miles || 0} mi</span>
                      <span>{tpl.metrics?.estTime || '0m'}</span>
                      {tpl.assignedDriver && (
                        <span className="text-blue-600 font-bold ml-auto">
                          Assigned to: {drivers.find(d => d.id === tpl.assignedDriver)?.name || tpl.assignedDriver}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:justify-end gap-2 mt-1 border-t border-slate-100 pt-3">
                      {reassigningId === tpl.id ? (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
                          <select
                            value={tpl.assignedDriver || ''}
                            onChange={e => handleReassignDriver(tpl.id, e.target.value)}
                            className="flex-1 px-3 py-1.5 card-premiumtext-xs font-bold focus:outline-none focus:border-blue-500"
                          >
                            <option value="">Unassigned</option>
                            {drivers.map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => setReassigningId(null)}
                            className="min-h-10 px-3 py-1.5 text-xs font-bold text-slate-500 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => setReassigningId(tpl.id)}
                            className="min-h-10 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors"
                          >
                            Reassign
                          </button>
                          <button 
                            onClick={() => {
                              setSequence((tpl.sequence || []).map(s => ({ ...s, leg: s.leg || 'A', id: `${s.clientId}-${s.type}-${Date.now()}-${Math.random()}` })));
                              setSelectedDriver(tpl.assignedDriver || '');
                              setStopOverrides(tpl.stopOverrides || {});
                              setShowTemplatesModal(false);
                            }}
                            className="min-h-10 px-4 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl transition-colors">
                            Load to Editor
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== ADD TEMP TRIP MODAL ===== */}
      {showAddTempModal && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg max-h-[92vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex justify-between items-center flex-shrink-0">
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-blue-600" /> One-Time Trip
              </h2>
              <button onClick={() => { setShowAddTempModal(false); setShowDuplicateWarning(false); }} className="p-2 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-3 bg-slate-50 overflow-y-auto flex-1">
              {showDuplicateWarning && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <p className="text-xs font-semibold text-amber-800">
                    A trip for &ldquo;{tempTripForm.name}&rdquo; already exists for {currentDay}. Add anyway?
                  </p>
                </div>
              )}

              <div>
                <label className="text-micro font-bold text-slate-400 uppercase tracking-wider block mb-1">Patient Name *</label>
                <input type="text" value={tempTripForm.name} onChange={e => setTempTripForm({...tempTripForm, name: e.target.value})} placeholder="e.g. John Doe" className="w-full px-3 py-2 card-premiumtext-sm font-bold focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-micro font-bold text-slate-400 uppercase tracking-wider block mb-1">Service Type</label>
                  <select value={tempTripForm.req} onChange={e => setTempTripForm({...tempTripForm, req: e.target.value})} className="w-full px-3 py-2 card-premiumtext-sm font-bold focus:outline-none focus:border-blue-500 transition-all">
                    <option value="AMB">AMB</option>
                    <option value="HIP">HIP</option>
                    <option value="CS-HIP">CS-HIP</option>
                    <option value="WC">WC</option>
                    <option value="AN_MDCR">AN_MDCR</option>
                  </select>
                </div>
                <div>
                  <label className="text-micro font-bold text-slate-400 uppercase tracking-wider block mb-1">Est. Miles</label>
                  <input type="number" value={tempTripForm.miles} onChange={e => setTempTripForm({...tempTripForm, miles: e.target.value})} placeholder="5.0" className="w-full px-3 py-2 card-premiumtext-sm font-bold focus:outline-none focus:border-blue-500 transition-all" />
                </div>
              </div>

              <div className="p-3 bg-white border border-emerald-100 rounded-3xl space-y-2">
                <h4 className="text-micro font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Pickup</h4>
                <input type="text" value={tempTripForm.pu} onChange={e => setTempTripForm({...tempTripForm, pu: e.target.value})} placeholder="Pickup address" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold focus:outline-none focus:border-emerald-500 transition-all" />
                <input type="time" value={tempTripForm.puTime} onChange={e => setTempTripForm({...tempTripForm, puTime: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold focus:outline-none focus:border-emerald-500 transition-all" />
              </div>

              <div className="p-3 bg-white border border-red-100 rounded-3xl space-y-2">
                <h4 className="text-micro font-black text-red-800 uppercase tracking-wider flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Dropoff</h4>
                <input type="text" value={tempTripForm.do} onChange={e => setTempTripForm({...tempTripForm, do: e.target.value})} placeholder="Dropoff address" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold focus:outline-none focus:border-red-500 transition-all" />
                <input type="time" value={tempTripForm.doTime} onChange={e => setTempTripForm({...tempTripForm, doTime: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold focus:outline-none focus:border-red-500 transition-all" />
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-white grid grid-cols-1 sm:flex sm:justify-end gap-3 flex-shrink-0">
              <button onClick={() => { setShowAddTempModal(false); setShowDuplicateWarning(false); }} className="min-h-11 px-4 py-2 rounded-2xl text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors">Cancel</button>
              {showDuplicateWarning ? (
                <button onClick={() => handleAddTempTrip(true)} className="min-h-11 px-5 py-2 rounded-2xl text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 shadow-md transition-colors">Add Anyway</button>
              ) : (
                <button onClick={() => handleAddTempTrip()} className="min-h-11 px-5 py-2 rounded-2xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md transition-colors">Add Trip</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
