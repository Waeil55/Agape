/**
 * useTimeTracking - React hook for automated time tracking.
 * Integrates with DriverPage and the time tracking engine.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  TIME_TRACKING_STATES,
  POLICY_MODES,
  buildTimeEvents,
  generatePendingClockOut,
  validateArrival,
  calculateAnchor,
  classifyGap,
  detectAbuse,
  generatePayrollOutput,
} from '../utils/timeTracking';

const STORAGE_KEY_PREFIX = 'agape_timeTracking_';
const POLICY_KEY = 'agape_timeTracking_policy';

const getStorageKey = (driverId) => `${STORAGE_KEY_PREFIX}${driverId}`;

export const useTimeTracking = ({ driverId, driver, trips, clockEvents, currentPosition, onStatusChange }) => {
  const [state, setState] = useState(TIME_TRACKING_STATES.OFF_SHIFT);
  const [policyMode, setPolicyMode] = useState(() => {
    try { return localStorage.getItem(POLICY_KEY) || POLICY_MODES.SMART_MODE; }
    catch { return POLICY_MODES.SMART_MODE; }
  });
  const [currentSession, setCurrentSession] = useState(null);
  const [todaySessions, setTodaySessions] = useState([]);
  const [gapLog, setGapLog] = useState([]);
  const [billableMinutes, setBillableMinutes] = useState(0);
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [lastWorkLocation, setLastWorkLocation] = useState(null);
  const [pendingClockOut, setPendingClockOut] = useState(null);
  const [arrivalValidation, setArrivalValidation] = useState(null);
  const [abuseFlags, setAbuseFlags] = useState([]);
  const [payroll, setPayroll] = useState(null);

  const stateRef = useRef(state);
  const breakStartRef = useRef(null);
  const pendingClockOutRef = useRef(null);
  const driverRef = useRef(driver);

  // Keep refs in sync
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { driverRef.current = driver; }, [driver]);

  // Persist state to localStorage
  useEffect(() => {
    if (!driverId) return;
    const key = getStorageKey(driverId);
    const data = {
      state,
      policyMode,
      currentSession,
      lastWorkLocation,
      pendingClockOut,
      breakStartRef: breakStartRef.current,
    };
    try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
  }, [driverId, state, policyMode, currentSession, lastWorkLocation, pendingClockOut]);

  // Restore state from localStorage
  useEffect(() => {
    if (!driverId) return;
    const key = getStorageKey(driverId);
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      if (saved) {
        if (saved.state) setState(saved.state);
        if (saved.policyMode) setPolicyMode(saved.policyMode);
        if (saved.currentSession) setCurrentSession(saved.currentSession);
        if (saved.lastWorkLocation) setLastWorkLocation(saved.lastWorkLocation);
        if (saved.pendingClockOut) {
          setPendingClockOut(saved.pendingClockOut);
          pendingClockOutRef.current = saved.pendingClockOut;
        }
        if (saved.breakStartRef) breakStartRef.current = saved.breakStartRef;
      }
    } catch {}
  }, [driverId]);

  // Persist policy mode
  useEffect(() => {
    try { localStorage.setItem(POLICY_KEY, policyMode); } catch {}
  }, [policyMode]);

  // ─── AUTO CLOCK-IN ON FIRST TRIP ARRIVAL ───────────────────────
  const handleTripArrival = useCallback((trip) => {
    if (!trip || stateRef.current !== TIME_TRACKING_STATES.OFF_SHIFT) return;

    const pickupLocation = trip.pickupLat ? { lat: trip.pickupLat, lng: trip.pickupLng } : null;
    const pickupTime = trip.arrivalTime ? new Date(trip.arrivalTime) : new Date();

    // Validate GPS arrival
    if (currentPosition && pickupLocation) {
      const validation = validateArrival(
        currentPosition.lat, currentPosition.lng,
        pickupLocation.lat, pickupLocation.lng
      );
      setArrivalValidation(validation);
      if (!validation.valid) {
        console.warn('[TimeTracking] Arrival validation failed:', validation.reason);
        // Still proceed but log the warning
      }
    }

    // Calculate anchor and auto clock-in time
    const anchor = calculateAnchor({
      policyMode,
      driver: driverRef.current,
      lastWorkLocation,
      pickupLocation,
      pickupTime,
    });

    const clockInTime = anchor.clockInTime || new Date();
    const clockInLocation = currentPosition
      ? { lat: currentPosition.lat, lng: currentPosition.lng }
      : anchor.anchorLocation;

    // Create session
    const session = {
      sessionId: `session_${Date.now()}`,
      clockInTime: clockInTime.toISOString(),
      clockInLocation,
      clockInType: anchor.anchorType === 'FIRST_PICKUP' || anchor.anchorType === 'NO_ANCHOR'
        ? 'AUTO_CLOCK_IN'
        : 'AUTO_CLOCK_IN',
      anchorType: anchor.anchorType,
      travelMinutes: anchor.travelMinutes,
      events: [{
        type: 'TRIP_EVENT',
        eventType: 'AUTO_CLOCK_IN',
        timestamp: clockInTime.toISOString(),
        tripId: trip.id,
        patient: trip.patient,
        location: clockInLocation,
      }],
      breakMinutes: 0,
      gapMinutes: 0,
      personalGapMinutes: 0,
    };

    setCurrentSession(session);
    setState(TIME_TRACKING_STATES.ON_SHIFT_ACTIVE);
    breakStartRef.current = null;

    // Clear any pending clock-out
    if (pendingClockOutRef.current) {
      setPendingClockOut(null);
      pendingClockOutRef.current = null;
    }

    // Notify parent
    onStatusChange?.({
      type: 'AUTO_CLOCK_IN',
      timestamp: clockInTime.toISOString(),
      location: clockInLocation,
      anchorType: anchor.anchorType,
      travelMinutes: anchor.travelMinutes,
      tripId: trip.id,
    });
  }, [policyMode, lastWorkLocation, currentPosition, onStatusChange]);

  // ─── TRIP EVENT TRACKING ───────────────────────────────────────
  const handleTripEvent = useCallback((eventType, trip, extra = {}) => {
    if (!trip) return;
    if (stateRef.current === TIME_TRACKING_STATES.OFF_SHIFT) return;

    const event = {
      type: 'TRIP_EVENT',
      eventType,
      timestamp: new Date().toISOString(),
      tripId: trip.id,
      patient: trip.patient,
      location: currentPosition ? { lat: currentPosition.lat, lng: currentPosition.lng } : null,
      ...extra,
    };

    setCurrentSession(prev => {
      if (!prev) return prev;
      const events = [...prev.events, event];

      // Check for gap between this event and the previous one
      if (events.length > 1) {
        const prevEvent = events[events.length - 2];
        const gap = classifyGap(prevEvent.timestamp, event.timestamp, prevEvent.location, event.location);

        setGapLog(prevLog => [...prevLog, {
          ...gap.auditRecord,
          sessionId: prev.sessionId,
          tripId: trip.id,
        }]);

        return {
          ...prev,
          events,
          gapMinutes: prev.gapMinutes + (gap.payrollEffect === 'EXCLUDED' ? gap.durationMinutes : 0),
          personalGapMinutes: prev.personalGapMinutes + (gap.classification === 'LONG' ? gap.durationMinutes : 0),
        };
      }

      return { ...prev, events };
    });

    // Update last work location on trip completion
    if (eventType === 'TRIP_COMPLETED' && trip.dropoffLat) {
      setLastWorkLocation({ lat: trip.dropoffLat, lng: trip.dropoffLng });
    }

    onStatusChange?.({ type: eventType, timestamp: event.timestamp, tripId: trip.id });
  }, [currentPosition, onStatusChange]);

  // ─── BREAK / RESUME ────────────────────────────────────────────
  const startBreak = useCallback(() => {
    if (stateRef.current !== TIME_TRACKING_STATES.ON_SHIFT_ACTIVE) return;

    breakStartRef.current = new Date().toISOString();
    setState(TIME_TRACKING_STATES.ON_BREAK);

    setCurrentSession(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        events: [...prev.events, {
          type: 'BREAK_START',
          timestamp: breakStartRef.current,
          location: currentPosition ? { lat: currentPosition.lat, lng: currentPosition.lng } : null,
        }],
      };
    });

    onStatusChange?.({ type: 'BREAK_START', timestamp: breakStartRef.current });
  }, [currentPosition, onStatusChange]);

  const resumeWork = useCallback(() => {
    if (stateRef.current !== TIME_TRACKING_STATES.ON_BREAK) return;

    const resumeTime = new Date().toISOString();
    const breakStartTime = breakStartRef.current;

    if (breakStartTime) {
      const breakDurationMs = new Date(resumeTime) - new Date(breakStartTime);
      const breakDurationMinutes = breakDurationMs / (1000 * 60);

      setCurrentSession(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          events: [...prev.events, {
            type: 'BREAK_END',
            timestamp: resumeTime,
            breakDurationMinutes,
            location: currentPosition ? { lat: currentPosition.lat, lng: currentPosition.lng } : null,
          }],
          breakMinutes: prev.breakMinutes + breakDurationMinutes,
        };
      });
    }

    setState(TIME_TRACKING_STATES.ON_SHIFT_ACTIVE);
    breakStartRef.current = null;

    onStatusChange?.({ type: 'BREAK_END', timestamp: resumeTime });
  }, [currentPosition, onStatusChange]);

  // ─── CLOCK OUT ─────────────────────────────────────────────────
  const clockOut = useCallback((reason = 'MANUAL') => {
    const clockOutTime = new Date().toISOString();
    const clockOutLocation = currentPosition
      ? { lat: currentPosition.lat, lng: currentPosition.lng }
      : null;

    setCurrentSession(prev => {
      if (!prev) return null;
      const events = [...prev.events, {
        type: 'CLOCK_OUT',
        timestamp: clockOutTime,
        location: clockOutLocation,
        reason,
      }];

      const totalMs = new Date(clockOutTime) - new Date(prev.clockInTime);
      const totalMinutes = totalMs / (1000 * 60);

      return {
        ...prev,
        events,
        clockOutTime,
        clockOutLocation,
        totalMinutes,
        billableMinutes: totalMinutes - prev.breakMinutes - prev.personalGapMinutes,
        isOpen: false,
      };
    });

    setState(TIME_TRACKING_STATES.OFF_SHIFT);
    setPendingClockOut(null);
    pendingClockOutRef.current = null;

    onStatusChange?.({ type: 'CLOCK_OUT', timestamp: clockOutTime, reason });
  }, [currentPosition, onStatusChange]);

  // ─── DISPATCHER ADDED TRIP DURING BREAK ────────────────────────
  const handleDispatcherTrip = useCallback((trip) => {
    if (stateRef.current !== TIME_TRACKING_STATES.ON_BREAK) return;

    // Cancel pending clock-out
    if (pendingClockOutRef.current) {
      setPendingClockOut(null);
      pendingClockOutRef.current = null;
    }

    // Auto resume
    resumeWork();

    // Then handle as normal trip arrival
    setTimeout(() => handleTripArrival(trip), 100);
  }, [resumeWork, handleTripArrival]);

  // ─── PENDING CLOCK-OUT CHECK ───────────────────────────────────
  useEffect(() => {
    if (!currentSession || state !== TIME_TRACKING_STATES.ON_SHIFT_ACTIVE) return;
    if (currentSession.events.some(e => e.type === 'TRIP_EVENT' && e.eventType === 'TRIP_COMPLETED')) {
      // Check if there are any remaining trips
      const todayTrips = (trips || []).filter(t => {
        const today = new Date().toISOString().split('T')[0];
        return t.date === today && t.driverId === driverId;
      });
      const activeTrips = todayTrips.filter(t =>
        !['Completed', 'Cancelled', 'No Show'].includes(t.status)
      );

      if (activeTrips.length === 0) {
        // All trips complete - generate pending clock-out
        const lastTrip = todayTrips
          .filter(t => t.completedAt)
          .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))[0];

        if (lastTrip) {
          const pending = generatePendingClockOut({
            lastTrip,
            driver: driverRef.current,
            policyMode,
          });

          if (pending.pendingClockOut) {
            setPendingClockOut(pending.pendingClockOut);
            pendingClockOutRef.current = pending.pendingClockOut;
          }
        }
      }
    }
  }, [currentSession, state, trips, driverId, policyMode]);

  // ─── ABUSE DETECTION ──────────────────────────────────────────
  useEffect(() => {
    if (!currentSession || currentSession.events.length < 2) return;

    const result = detectAbuse({
      breadcrumbs: currentSession.events
        .filter(e => e.location)
        .map(e => ({ lat: e.location.lat, lng: e.location.lng, at: e.timestamp, accuracy: 50 })),
      clockInLocation: currentSession.clockInLocation,
      clockOutLocation: null,
      durationMinutes: (new Date() - new Date(currentSession.clockInTime)) / (1000 * 60),
    });

    setAbuseFlags(result.flags);
  }, [currentSession]);

  // ─── COMPUTE BILLABLE TIME ─────────────────────────────────────
  useEffect(() => {
    if (!currentSession) {
      setBillableMinutes(0);
      setBreakMinutes(0);
      return;
    }

    const now = new Date();
    const clockIn = new Date(currentSession.clockInTime);
    const totalMs = now - clockIn;
    const totalMinutes = totalMs / (1000 * 60);

    setBillableMinutes(Math.max(0, totalMinutes - currentSession.breakMinutes - currentSession.personalGapMinutes));
    setBreakMinutes(currentSession.breakMinutes || 0);
  }, [currentSession]);

  // ─── GENERATE PAYROLL ──────────────────────────────────────────
  const generatePayroll = useCallback((hourlyRate = 0) => {
    const timeData = buildTimeEvents(trips, driver, clockEvents, policyMode);
    const payrollOutput = generatePayrollOutput(timeData, hourlyRate);
    setPayroll(payrollOutput);
    return payrollOutput;
  }, [trips, driver, clockEvents, policyMode]);

  // ─── PUBLIC API ────────────────────────────────────────────────
  return {
    // State
    state,
    policyMode,
    setPolicyMode,
    currentSession,
    todaySessions,
    gapLog,
    billableMinutes,
    breakMinutes,
    lastWorkLocation,
    pendingClockOut,
    arrivalValidation,
    abuseFlags,
    payroll,

    // Actions
    handleTripArrival,
    handleTripEvent,
    startBreak,
    resumeWork,
    clockOut,
    handleDispatcherTrip,
    generatePayroll,

    // Computed
    isOffShift: state === TIME_TRACKING_STATES.OFF_SHIFT,
    isActive: state === TIME_TRACKING_STATES.ON_SHIFT_ACTIVE,
    isOnBreak: state === TIME_TRACKING_STATES.ON_BREAK,
    isPendingResume: state === TIME_TRACKING_STATES.PENDING_RESUME,
    hasActiveSession: currentSession != null,
    billableHours: Math.round((billableMinutes / 60) * 10) / 10,
    breakHours: Math.round((breakMinutes / 60) * 10) / 10,
    shiftDuration: currentSession
      ? Math.round(((new Date() - new Date(currentSession.clockInTime)) / (1000 * 60)) * 10) / 10
      : 0,
  };
};

export default useTimeTracking;
