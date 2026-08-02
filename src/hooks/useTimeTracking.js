/**
 * useTimeTracking.js
 * AI Dispatch + Automatic Time Tracking System (Master Prompt - All 18 Sections)
 * Event-driven, GPS-verified, audit-logged, multi-session aware.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { db, auth, collection, addDoc, doc, setDoc, serverTimestamp } from '../config/firebase';
import {
  TIME_TRACKING_STATES, POLICY_MODES, GAP_CLASSIFICATIONS, PAYROLL_EFFECTS,
  ARRIVAL_RADIUS_METERS, validateArrival, calculateAnchor, classifyGap,
  generatePendingClockOut, buildTimeEvents, generatePayrollOutput, detectAbuse,
  estimateTravelTimeMinutes, haversineDistanceMiles,
} from '../utils/timeTracking';
import { localCalendarYmd } from '../utils/tripDate';

const TT = TIME_TRACKING_STATES;
const nowIso = () => new Date().toISOString();
const localToday = () => localCalendarYmd();

const safeAddDoc = async (col, data) => {
  try { await addDoc(collection(db, col), { ...data, createdAt: serverTimestamp() }); }
  catch (err) { console.error('[useTimeTracking] addDoc failed:', col, err.code); }
};
const safeSetDoc = async (col, id, data) => {
  try { await setDoc(doc(db, col, id), { ...data, updatedAt: serverTimestamp() }, { merge: true }); }
  catch (err) { console.error('[useTimeTracking] setDoc failed:', col, id, err.code); }
};

export function useTimeTracking({ driver, trips = [], position, policyMode = POLICY_MODES.PAY_FROM_HOME, enabled = true, onClockIn, onClockOut, onBreakStart, onBreakEnd } = {}) {
  const [ttState, setTtState] = useState(() => {
    if (!driver?.clockedIn) return TT.OFF_SHIFT;
    if (driver?.timeTrackingState === TT.ON_BREAK) return TT.ON_BREAK;
    return TT.ON_SHIFT_ACTIVE;
  });
  const [billableMinutes, setBillableMinutes] = useState(0);
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [sessionEvents, setSessionEvents] = useState([]);
  const [gapLog, setGapLog] = useState([]);
  const [abuseFlags, setAbuseFlags] = useState([]);
  const [pendingClockOutInfo, setPendingClockOutInfo] = useState(null);
  const [arrivalValidation, setArrivalValidation] = useState(null);

  const stateRef = useRef(ttState);
  const eventsRef = useRef([]);
  const breakStartRef = useRef(null);
  const accumulatedBreakMsRef = useRef(0);
  const clockInTimeRef = useRef(null);
  const lastTripEventRef = useRef(null);
  const tickRef = useRef(null);
  const pendingTimerRef = useRef(null);
  const posRef = useRef(position);
  const driverRef = useRef(driver);
  const tripsRef = useRef(trips);

  useEffect(() => { posRef.current = position; }, [position]);
  useEffect(() => { driverRef.current = driver; }, [driver]);
  useEffect(() => { tripsRef.current = trips; }, [trips]);

  const driverId = driver?.id || driver?.email || '';
  const driverName = driver?.name || driverId;

  const payrollSummary = useMemo(() => {
    if (!sessionEvents.length) return null;
    const d = driverRef.current;
    const timeData = buildTimeEvents(tripsRef.current, d, d?.clockEvents || [], policyMode, { date: localToday() });
    return generatePayrollOutput(timeData, Number(d?.hourlyRate || 0));
  }, [sessionEvents.length, policyMode]);

  const getPos = useCallback(() => {
    const p = posRef.current;
    return (p?.lat != null && p?.lng != null) ? { lat: p.lat, lng: p.lng } : null;
  }, []);

  const transition = useCallback((next) => { stateRef.current = next; setTtState(next); }, []);

  const pushEvent = useCallback((evt) => {
    const full = { ...evt, driverId, timestamp: evt.timestamp || nowIso() };
    eventsRef.current = [...eventsRef.current, full];
    setSessionEvents(prev => [...prev, full]);
    safeAddDoc('shiftEvents', { ...full, driverName, date: localToday() });
    return full;
  }, [driverId, driverName]);

  const pushGap = useCallback((rec) => {
    const full = { ...rec, driverId, driverName, date: localToday() };
    setGapLog(prev => [...prev, full]);
    safeAddDoc('gapAuditLog', full);
  }, [driverId, driverName]);

  const clearPending = useCallback(() => {
    if (pendingTimerRef.current) { clearTimeout(pendingTimerRef.current); pendingTimerRef.current = null; }
    setPendingClockOutInfo(null);
  }, []);

  const startTick = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    const recalculate = () => {
      if (!clockInTimeRef.current) return;
      const nowMs = Date.now();
      const clockInMs = new Date(clockInTimeRef.current).getTime();
      const activeBreakMs = stateRef.current === TT.ON_BREAK && breakStartRef.current
        ? Math.max(0, nowMs - new Date(breakStartRef.current).getTime())
        : 0;
      const breakMs = accumulatedBreakMsRef.current + activeBreakMs;
      setBillableMinutes(Math.floor(Math.max(0, nowMs - clockInMs - breakMs) / 60000));
      setBreakMinutes(Math.floor(breakMs / 60000));
    };
    recalculate();
    tickRef.current = setInterval(recalculate, 15000);
  }, []);
  const stopTick = useCallback(() => { if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; } }, []);

  const persistSession = useCallback(async (clockOutEvt) => {
    const events = [...eventsRef.current];
    const d = driverRef.current;
    const allClock = events
      .filter(e => ['CLOCK_IN','AUTO_CLOCK_IN','CLOCK_OUT','BREAK_START','BREAK_END'].includes(e.type))
      .map(e => ({ type: e.type.toLowerCase().replace('_',''), timestamp: e.timestamp, lat: e.location?.lat, lng: e.location?.lng }));
    const timeData = buildTimeEvents(tripsRef.current, d, allClock, policyMode, { date: localToday() });
    const payroll = generatePayrollOutput(timeData, Number(d?.hourlyRate || 0));
    const abuse = detectAbuse({ breadcrumbs: d?.breadcrumbs || [],
      clockInLocation: events.find(e => e.type === 'CLOCK_IN' || e.type === 'AUTO_CLOCK_IN')?.location,
      clockOutLocation: clockOutEvt?.location, durationMinutes: payroll.payTime?.billableMinutes || 0 });
    const sessionId = `session_${driverId}_${Date.now()}`;
    await safeSetDoc('timeTrackingSessions', sessionId, {
      sessionId, driverId, driverName, driverEmail: d?.email || '', date: localToday(),
      policyMode, events, sessions: timeData.sessions, gapLog: timeData.gapLog,
      payrollOutput: payroll, abuseFlags: abuse.flags, status: 'complete',
      billableMinutes: payroll.payTime?.billableMinutes || 0 });
    setAbuseFlags(abuse.flags);
    return payroll;
  }, [driverId, driverName, policyMode]);

  // Section 4 — Auto clock-in from first pickup arrival
  const autoClockIn = useCallback(({ pickupLocation, pickupTime, lastWorkLocation } = {}) => {
    if (stateRef.current !== TT.OFF_SHIFT || !enabled) return;
    const anchor = calculateAnchor({ policyMode, driver: driverRef.current,
      lastWorkLocation: lastWorkLocation || null,
      pickupLocation: pickupLocation || getPos(),
      pickupTime: pickupTime ? new Date(pickupTime) : new Date() });
    const clockInTime = anchor.clockInTime ? anchor.clockInTime.toISOString() : nowIso();
    clockInTimeRef.current = clockInTime;
    const event = pushEvent({ type: 'AUTO_CLOCK_IN', timestamp: clockInTime, location: anchor.anchorLocation || getPos(),
      anchorType: anchor.anchorType, travelMinutes: Math.round(anchor.travelMinutes || 0), reason: 'FIRST_TRIP_ARRIVAL' });
    transition(TT.ON_SHIFT_ACTIVE); startTick(); clearPending(); onClockIn?.({ event, anchor });
  }, [enabled, policyMode, getPos, pushEvent, transition, startTick, clearPending, onClockIn]);

  // Manual clock-in
  const clockIn = useCallback(() => {
    if (stateRef.current !== TT.OFF_SHIFT || !enabled) return;
    const now = nowIso(); const loc = getPos(); clockInTimeRef.current = now;
    const event = pushEvent({ type: 'CLOCK_IN', timestamp: now, location: loc });
    transition(TT.ON_SHIFT_ACTIVE); startTick(); clearPending(); onClockIn?.({ event });
  }, [enabled, getPos, pushEvent, transition, startTick, clearPending, onClockIn]);

  // Section 5 — Mid-day break
  const startBreak = useCallback(() => {
    if (stateRef.current !== TT.ON_SHIFT_ACTIVE) return;
    const now = nowIso(); const loc = getPos(); breakStartRef.current = now;
    pushEvent({ type: 'BREAK_START', timestamp: now, location: loc });
    transition(TT.ON_BREAK); onBreakStart?.({ timestamp: now, location: loc });
  }, [getPos, pushEvent, transition, onBreakStart]);

  // Section 6 — Resume with smart anchor
  const resumeFromBreak = useCallback(({ nextPickup } = {}) => {
    if (stateRef.current !== TT.ON_BREAK) return;
    const now = nowIso(); const loc = getPos(); const d = driverRef.current;
    if (breakStartRef.current) {
      accumulatedBreakMsRef.current += Math.max(0, new Date(now) - new Date(breakStartRef.current));
      setBreakMinutes(Math.floor(accumulatedBreakMsRef.current / 60000));
    }
    let resumePayload = {};
    if (nextPickup?.location && d?.homeLat && d?.homeLng) {
      const H = { lat: d.homeLat, lng: d.homeLng }; const P = nextPickup.location; const L = loc;
      const dHome = haversineDistanceMiles(H.lat, H.lng, P.lat, P.lng);
      const dLast = L ? haversineDistanceMiles(L.lat, L.lng, P.lat, P.lng) : Infinity;
      const anchor = (dLast > dHome && L) ? L : H;
      const travelMin = estimateTravelTimeMinutes(anchor.lat, anchor.lng, P.lat, P.lng);
      resumePayload = { resumeAnchorType: dLast > dHome && L ? 'LAST_WORK' : 'HOME', travelMinutes: Math.round(travelMin) };
    }
    pushEvent({ type: 'BREAK_END', timestamp: now, location: loc, ...resumePayload });
    breakStartRef.current = null;
    transition(TT.ON_SHIFT_ACTIVE); startTick(); clearPending(); onBreakEnd?.({ timestamp: now });
  }, [getPos, pushEvent, transition, startTick, clearPending, onBreakEnd]);

  // Section 7 — End-of-day clock out
  const clockOut = useCallback(async () => {
    if (stateRef.current === TT.OFF_SHIFT) return;
    stopTick(); clearPending();
    const now = nowIso(); const loc = getPos();
    const event = { type: 'CLOCK_OUT', timestamp: now, location: loc };
    pushEvent(event); transition(TT.OFF_SHIFT);
    const payroll = await persistSession(event);
    setBillableMinutes(0); setBreakMinutes(0);
    eventsRef.current = []; clockInTimeRef.current = null; lastTripEventRef.current = null; breakStartRef.current = null; accumulatedBreakMsRef.current = 0;
    onClockOut?.({ payroll, timestamp: now }); return payroll;
  }, [stopTick, clearPending, getPos, pushEvent, transition, persistSession, onClockOut]);

  // Section 7 — Pending clock-out after last trip
  const schedulePendingClockOut = useCallback((lastTrip) => {
    clearPending();
    const { pendingClockOut, estimatedClockOutTime } = generatePendingClockOut({ lastTrip, driver: driverRef.current, policyMode });
    if (!pendingClockOut || !estimatedClockOutTime) return;
    setPendingClockOutInfo({ ...pendingClockOut, estimatedClockOutTime: estimatedClockOutTime.toISOString() });
    const ms = estimatedClockOutTime.getTime() - Date.now();
    if (ms > 0 && ms < 2 * 3600000) {
      pendingTimerRef.current = setTimeout(() => { if (stateRef.current !== TT.OFF_SHIFT) clockOut(); }, ms);
    }
  }, [policyMode, clearPending, clockOut]);

  // Section 13 — Cancel pending clock-out when dispatcher adds trip during break
  const cancelPendingAndResume = useCallback((nextPickup) => {
    clearPending();
    if (stateRef.current === TT.ON_BREAK) resumeFromBreak({ nextPickup });
  }, [clearPending, resumeFromBreak]);

  // Section 8 / 10 — Trip event with gap classification and audit log
  const logTripEvent = useCallback((eventType, tripId, location) => {
    if (stateRef.current === TT.OFF_SHIFT) return;
    const now = nowIso(); const loc = location || getPos(); const prev = lastTripEventRef.current;
    if (prev) {
      const gap = classifyGap(prev.timestamp, now, prev.location, loc);
      pushGap({ ...gap.auditRecord, tripId, sessionId: 'live' });
    }
    const evt = pushEvent({ type: 'TRIP_EVENT', eventType, timestamp: now, tripId, location: loc });
    lastTripEventRef.current = evt;
  }, [getPos, pushEvent, pushGap]);

  // Section 16 — GPS arrival validation
  const validatePickupArrival = useCallback((dLat, dLng, pLat, pLng, radius = ARRIVAL_RADIUS_METERS) => {
    const result = validateArrival(dLat, dLng, pLat, pLng, radius);
    setArrivalValidation(result); return result;
  }, []);

  // Section 11 — Forgotten clock-out via GPS inactivity
  const checkForgottenClockOut = useCallback((breadcrumbs = []) => {
    if (stateRef.current === TT.OFF_SHIFT || breadcrumbs.length < 2) return;
    const recent = breadcrumbs.slice(-5);
    const oldest = new Date(recent[0].capturedAt || recent[0].at || 0);
    const newest = new Date(recent[recent.length - 1].capturedAt || recent[recent.length - 1].at || 0);
    if ((newest - oldest) / 60000 < 10) return;
    let dist = 0;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i-1].lat && recent[i].lat) dist += haversineDistanceMiles(recent[i-1].lat, recent[i-1].lng, recent[i].lat, recent[i].lng);
    }
    if (dist < 0.01 && stateRef.current === TT.ON_SHIFT_ACTIVE) {
      pushGap({ type: 'GPS_INACTIVITY_REVIEW', timestamp: nowIso(), reason: 'GPS_INACTIVITY', payrollEffect: 'REVIEW' });
    }
  }, [pushGap]);

  // Sync with driver profile
  useEffect(() => {
    if (!enabled || !driver) return;
    const isClockedIn = driver.clockedIn;
    const isOnBreak = driver.timeTrackingState === TT.ON_BREAK || Boolean(driver.lastBreakStart);
    if (isClockedIn && stateRef.current === TT.OFF_SHIFT) {
      const t = driver.clockedInAt ? new Date(driver.clockedInAt) : new Date();
      const elapsedMs = Math.max(0, Date.now() - t.getTime());
      const savedBreakMs = Number(driver.totalBreakMilliseconds) || Number(driver.totalBreakMinutes || 0) * 60000;
      const addlBreakMs = isOnBreak && driver.lastBreakStart ? Math.max(0, Date.now() - new Date(driver.lastBreakStart)) : 0;
      const totalBreakMs = savedBreakMs + addlBreakMs;
      clockInTimeRef.current = t.toISOString();
      breakStartRef.current = isOnBreak ? driver.lastBreakStart : null;
      eventsRef.current = [{ type: driver.clockedInAt ? 'AUTO_CLOCK_IN' : 'CLOCK_IN', timestamp: t.toISOString(), location: getPos(), driverId }];
      accumulatedBreakMsRef.current = savedBreakMs;
      setBillableMinutes(Math.floor(Math.max(0, elapsedMs - totalBreakMs) / 60000)); setBreakMinutes(Math.floor(totalBreakMs / 60000));
      transition(isOnBreak ? TT.ON_BREAK : TT.ON_SHIFT_ACTIVE);
      startTick();
    } else if (!isClockedIn && stateRef.current !== TT.OFF_SHIFT) {
      stopTick(); transition(TT.OFF_SHIFT); setBillableMinutes(0); setBreakMinutes(0);
    }
  }, [enabled, driver?.clockedIn, driver?.timeTrackingState]); // eslint-disable-line

  useEffect(() => () => { stopTick(); clearPending(); }, [stopTick, clearPending]);

  return {
    ttState, isOffShift: ttState === TT.OFF_SHIFT, isOnShift: ttState === TT.ON_SHIFT_ACTIVE,
    isOnBreak: ttState === TT.ON_BREAK, billableMinutes, breakMinutes, sessionEvents,
    gapLog, abuseFlags, pendingClockOutInfo, arrivalValidation, payrollSummary,
    clockInTime: clockInTimeRef.current,
    autoClockIn, clockIn, clockOut, startBreak, resumeFromBreak,
    schedulePendingClockOut, cancelPendingAndResume, logTripEvent,
    validatePickupArrival, checkForgottenClockOut,
  };
}

export default useTimeTracking;
