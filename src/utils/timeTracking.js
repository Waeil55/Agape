/**
 * AUTOMATED TIME TRACKING ENGINE
 * Event-driven, GPS-verified, audit-logged, multi-session aware.
 * 
 * States: OFF_SHIFT → ON_SHIFT_ACTIVE ↔ ON_BREAK → PENDING_RESUME → OFF_SHIFT
 * Payroll is based on EVENTS, not raw clock-in/out times.
 */

import { haversineMiles } from '../config/maps';
import { todayLocal } from './driverTelemetry';

// ─── CONSTANTS ───────────────────────────────────────────────────
export const TIME_TRACKING_STATES = {
  OFF_SHIFT: 'OFF_SHIFT',
  ON_SHIFT_ACTIVE: 'ON_SHIFT_ACTIVE',
  ON_BREAK: 'ON_BREAK',
  PENDING_RESUME: 'PENDING_RESUME',
};

export const POLICY_MODES = {
  PAY_FROM_HOME: 'PAY_FROM_HOME',
  PAY_FROM_FIRST_PICKUP: 'PAY_FROM_FIRST_PICKUP',
  SMART_MODE: 'SMART_MODE',
};

export const GAP_CLASSIFICATIONS = {
  SHORT: 'SHORT',           // 0-20 min: normal delay, continuous session
  MEDIUM: 'MEDIUM',         // 20-90 min: unconfirmed break, no pay
  LONG: 'LONG',             // 90+ min or GPS deviation: split session, personal time
};

export const PAYROLL_EFFECTS = {
  INCLUDED: 'INCLUDED',
  EXCLUDED: 'EXCLUDED',
};

export const ARRIVAL_RADIUS_FT = 200; // Default arrival radius in feet
export const ARRIVAL_RADIUS_METERS = ARRIVAL_RADIUS_FT * 0.3048; // ~61 meters

// Gap thresholds in minutes
export const GAP_THRESHOLDS = {
  SHORT_MAX: 20,
  MEDIUM_MAX: 90,
};

// Travel speed assumption (mph) when Google Maps API unavailable
export const ASSUMED_TRAVEL_SPEED_MPH = 30;

// ─── HAVERSINE DISTANCE ──────────────────────────────────────────
export const haversineDistanceMiles = (lat1, lng1, lat2, lng2) => {
  return haversineMiles(lat1, lng1, lat2, lng2);
};

export const haversineDistanceMeters = (lat1, lng1, lat2, lng2) => {
  return haversineDistanceMiles(lat1, lng1, lat2, lng2) * 1609.344;
};

export const haversineDistanceFeet = (lat1, lng1, lat2, lng2) => {
  return haversineDistanceMeters(lat1, lng1, lat2, lng2) * 3.28084;
};

// ─── TRAVEL TIME ESTIMATION ──────────────────────────────────────
export const estimateTravelTimeMinutes = (lat1, lng1, lat2, lng2) => {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return 0;
  const miles = haversineDistanceMiles(lat1, lng1, lat2, lng2);
  if (miles < 0.01) return 0; // Less than ~50 feet
  // Add 30% for road routing factor
  const effectiveMiles = miles * 1.3;
  return (effectiveMiles / ASSUMED_TRAVEL_SPEED_MPH) * 60;
};

// ─── GPS ARRIVAL VALIDATION ──────────────────────────────────────
export const validateArrival = (driverLat, driverLng, targetLat, targetLng, radiusMeters = ARRIVAL_RADIUS_METERS) => {
  if (driverLat == null || driverLng == null || targetLat == null || targetLng == null) {
    return { valid: false, distanceFeet: Infinity, reason: 'Missing coordinates' };
  }
  const distanceMeters = haversineDistanceMeters(driverLat, driverLng, targetLat, targetLng);
  const distanceFeet = haversineDistanceFeet(driverLat, driverLng, targetLat, targetLng);
  const valid = distanceMeters <= radiusMeters;
  return {
    valid,
    distanceFeet: Math.round(distanceFeet),
    distanceMeters: Math.round(distanceMeters),
    reason: valid ? 'Within arrival radius' : `Too far (${Math.round(distanceFeet)}ft > ${Math.round(radiusMeters * 3.28084)}ft)`,
  };
};

// ─── GPS ANCHOR CALCULATION ──────────────────────────────────────
/**
 * Calculate the auto clock-in time based on policy mode.
 * 
 * @param {Object} params
 * @param {string} params.policyMode - PAY_FROM_HOME | PAY_FROM_FIRST_PICKUP | SMART_MODE
 * @param {Object} params.driver - Driver profile with homeLat/homeLng
 * @param {Object} params.lastWorkLocation - Last work/clock-out location { lat, lng }
 * @param {Object} params.pickupLocation - Next pickup location { lat, lng }
 * @param {Date} params.pickupTime - Scheduled pickup time
 * @returns {{ anchorLocation: Object, travelMinutes: number, clockInTime: Date, anchorType: string }}
 */
export const calculateAnchor = ({ policyMode, driver, lastWorkLocation, pickupLocation, pickupTime }) => {
  if (!pickupLocation || !pickupTime) {
    return { anchorLocation: null, travelMinutes: 0, clockInTime: pickupTime, anchorType: 'NONE' };
  }

  const homeLat = driver?.homeLat;
  const homeLng = driver?.homeLng;
  const hasHome = homeLat != null && homeLng != null;

  switch (policyMode) {
    case POLICY_MODES.PAY_FROM_FIRST_PICKUP: {
      // No home travel pay
      return {
        anchorLocation: null,
        travelMinutes: 0,
        clockInTime: pickupTime,
        anchorType: 'FIRST_PICKUP',
      };
    }

    case POLICY_MODES.PAY_FROM_HOME: {
      // Always include home → pickup travel
      if (hasHome) {
        const travelMinutes = estimateTravelTimeMinutes(homeLat, homeLng, pickupLocation.lat, pickupLocation.lng);
        const clockInTime = new Date(pickupTime.getTime() - travelMinutes * 60 * 1000);
        return {
          anchorLocation: { lat: homeLat, lng: homeLng },
          travelMinutes,
          clockInTime,
          anchorType: 'HOME',
        };
      }
      // Fallback to FIRST_PICKUP if no home address
      return {
        anchorLocation: null,
        travelMinutes: 0,
        clockInTime: pickupTime,
        anchorType: 'FIRST_PICKUP_FALLBACK',
      };
    }

    case POLICY_MODES.SMART_MODE:
    default: {
      // Smart mode: compare distances and choose best anchor
      if (!hasHome && !lastWorkLocation) {
        return {
          anchorLocation: null,
          travelMinutes: 0,
          clockInTime: pickupTime,
          anchorType: 'NO_ANCHOR',
        };
      }

      const dHome = hasHome
        ? haversineDistanceMiles(homeLat, homeLng, pickupLocation.lat, pickupLocation.lng)
        : Infinity;
      const dLast = lastWorkLocation
        ? haversineDistanceMiles(lastWorkLocation.lat, lastWorkLocation.lng, pickupLocation.lat, pickupLocation.lng)
        : Infinity;

      // Rule: If d_last > d_home → use L as anchor (last work is farther, fairer to pay from there)
      // If d_home <= d_last → use H as anchor (home is closer or equal)
      let anchorLat, anchorLng, anchorType;

      if (dLast > dHome && lastWorkLocation) {
        anchorLat = lastWorkLocation.lat;
        anchorLng = lastWorkLocation.lng;
        anchorType = 'LAST_WORK';
      } else if (hasHome) {
        anchorLat = homeLat;
        anchorLng = homeLng;
        anchorType = 'HOME';
      } else if (lastWorkLocation) {
        anchorLat = lastWorkLocation.lat;
        anchorLng = lastWorkLocation.lng;
        anchorType = 'LAST_WORK_FALLBACK';
      } else {
        return {
          anchorLocation: null,
          travelMinutes: 0,
          clockInTime: pickupTime,
          anchorType: 'NO_ANCHOR',
        };
      }

      const travelMinutes = estimateTravelTimeMinutes(anchorLat, anchorLng, pickupLocation.lat, pickupLocation.lng);
      const clockInTime = new Date(pickupTime.getTime() - travelMinutes * 60 * 1000);

      return {
        anchorLocation: { lat: anchorLat, lng: anchorLng },
        travelMinutes,
        clockInTime,
        anchorType,
      };
    }
  }
};

// ─── GAP CLASSIFICATION ──────────────────────────────────────────
/**
 * Classify the gap between two events.
 * 
 * @param {Date|string} lastEventTime
 * @param {Date|string} nextEventTime
 * @param {Object} lastLocation - { lat, lng }
 * @param {Object} nextLocation - { lat, lng }
 * @returns {{ classification: string, durationMinutes: number, payrollEffect: string, auditRecord: Object }}
 */
export const classifyGap = (lastEventTime, nextEventTime, lastLocation, nextLocation) => {
  const last = new Date(lastEventTime);
  const next = new Date(nextEventTime);
  const durationMs = next.getTime() - last.getTime();
  const durationMinutes = Math.max(0, durationMs / (1000 * 60));

  let classification;
  let payrollEffect;
  let notes = '';

  if (durationMinutes <= GAP_THRESHOLDS.SHORT_MAX) {
    classification = GAP_CLASSIFICATIONS.SHORT;
    payrollEffect = PAYROLL_EFFECTS.INCLUDED;
    notes = 'Short gap - treated as normal delay';
  } else if (durationMinutes <= GAP_THRESHOLDS.MEDIUM_MAX) {
    classification = GAP_CLASSIFICATIONS.MEDIUM;
    payrollEffect = PAYROLL_EFFECTS.EXCLUDED;
    notes = 'Medium gap - unconfirmed break, no payroll';
  } else {
    classification = GAP_CLASSIFICATIONS.LONG;
    payrollEffect = PAYROLL_EFFECTS.EXCLUDED;
    notes = 'Long gap - personal time suspected, excluded from payroll';
  }

  // Check for GPS deviation (location jumped significantly during gap)
  if (lastLocation && nextLocation && classification !== GAP_CLASSIFICATIONS.LONG) {
    const gapDistanceMiles = haversineDistanceMiles(
      lastLocation.lat, lastLocation.lng,
      nextLocation.lat, nextLocation.lng
    );
    // If driver moved >10 miles during a "short" gap, reclassify
    if (gapDistanceMiles > 10 && classification === GAP_CLASSIFICATIONS.SHORT) {
      classification = GAP_CLASSIFICATIONS.MEDIUM;
      payrollEffect = PAYROLL_EFFECTS.EXCLUDED;
      notes = `Reclassified: ${gapDistanceMiles.toFixed(1)}mi movement during short gap`;
    }
  }

  const auditRecord = {
    type: 'GAP_DETECTED',
    startTime: last.toISOString(),
    endTime: next.toISOString(),
    durationMinutes: Math.round(durationMinutes * 10) / 10,
    startLocation: lastLocation ? { lat: lastLocation.lat, lng: lastLocation.lng } : null,
    endLocation: nextLocation ? { lat: nextLocation.lat, lng: nextLocation.lng } : null,
    classification,
    payrollEffect,
    notes,
    classifiedAt: new Date().toISOString(),
  };

  return { classification, durationMinutes, payrollEffect, auditRecord };
};

// ─── SESSION STITCHING ───────────────────────────────────────────
/**
 * Stitch multiple trips/events into work sessions.
 * Connects trips but removes/excludes personal gap time.
 * 
 * @param {Array} events - Sorted array of time events
 * @returns {{ sessions: Array, totalBillableMinutes: number, gapLog: Array }}
 */
export const stitchSessions = (events) => {
  if (!events || events.length === 0) {
    return { sessions: [], totalBillableMinutes: 0, gapLog: [] };
  }

  const sorted = [...events].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const sessions = [];
  const gapLog = [];
  let currentSession = null;

  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i];

    if (event.type === 'CLOCK_IN' || event.type === 'AUTO_CLOCK_IN') {
      // Start a new session
      currentSession = {
        sessionId: `session_${Date.now()}_${i}`,
        clockInTime: event.timestamp,
        clockInLocation: event.location || null,
        clockInType: event.type,
        events: [event],
        billableMinutes: 0,
        breakMinutes: 0,
        gapMinutes: 0,
        personalGapMinutes: 0,
      };
      sessions.push(currentSession);
      continue;
    }

    if (event.type === 'CLOCK_OUT') {
      if (currentSession) {
        currentSession.clockOutTime = event.timestamp;
        currentSession.clockOutLocation = event.location || null;
        currentSession.events.push(event);
        // Calculate session duration
        const durationMs = new Date(event.timestamp) - new Date(currentSession.clockInTime);
        currentSession.totalMinutes = Math.max(0, durationMs / (1000 * 60));
        currentSession.billableMinutes = currentSession.totalMinutes - currentSession.breakMinutes - currentSession.personalGapMinutes;
        currentSession = null;
      }
      continue;
    }

    if (event.type === 'BREAK_START') {
      if (currentSession) {
        currentSession.breakStartTime = event.timestamp;
        currentSession.events.push(event);
      }
      continue;
    }

    if (event.type === 'BREAK_END') {
      if (currentSession && currentSession.breakStartTime) {
        const breakDurationMs = new Date(event.timestamp) - new Date(currentSession.breakStartTime);
        const breakMinutes = Math.max(0, breakDurationMs / (1000 * 60));
        currentSession.breakMinutes += breakMinutes;
        currentSession.events.push(event);
        currentSession.breakStartTime = null;
      }
      continue;
    }

    if (event.type === 'TRIP_EVENT') {
      if (currentSession) {
        currentSession.events.push(event);

        // Check for gap between this event and the previous one
        if (currentSession.events.length > 1) {
          const prevEvent = currentSession.events[currentSession.events.length - 2];
          const gap = classifyGap(
            prevEvent.timestamp,
            event.timestamp,
            prevEvent.location,
            event.location
          );

          gapLog.push({
            ...gap.auditRecord,
            sessionId: currentSession.sessionId,
            tripId: event.tripId || null,
          });

          if (gap.payrollEffect === PAYROLL_EFFECTS.EXCLUDED) {
            currentSession.gapMinutes += gap.durationMinutes;
            if (gap.classification === GAP_CLASSIFICATIONS.LONG) {
              currentSession.personalGapMinutes += gap.durationMinutes;
            }
          }
        }
      }
      continue;
    }
  }

  // If session is still open (driver hasn't clocked out yet)
  if (currentSession) {
    const now = new Date();
    const durationMs = now - new Date(currentSession.clockInTime);
    currentSession.totalMinutes = Math.max(0, durationMs / (1000 * 60));
    currentSession.billableMinutes = currentSession.totalMinutes - currentSession.breakMinutes - currentSession.personalGapMinutes;
    currentSession.isOpen = true;
  }

  const totalBillableMinutes = sessions.reduce((sum, s) => sum + (s.billableMinutes || 0), 0);

  return { sessions, totalBillableMinutes, gapLog };
};

// ─── END OF DAY AUTO CLOCK-OUT ───────────────────────────────────
/**
 * Generate a pending clock-out event after last trip.
 * 
 * @param {Object} params
 * @param {Object} params.lastTrip - Last completed trip
 * @param {Object} params.driver - Driver profile
 * @param {Object} params.policyMode
 * @returns {{ pendingClockOut: Object, estimatedClockOutTime: Date }}
 */
export const generatePendingClockOut = ({ lastTrip, driver, policyMode }) => {
  if (!lastTrip) return { pendingClockOut: null, estimatedClockOutTime: null };

  const lastDropoffTime = lastTrip.arrivalDropoffTime || lastTrip.completedAt;
  if (!lastDropoffTime) return { pendingClockOut: null, estimatedClockOutTime: null };

  const dropoffTime = new Date(lastDropoffTime);

  if (policyMode === POLICY_MODES.PAY_FROM_HOME && driver?.homeLat && driver?.homeLng) {
    // Calculate travel time from last dropoff to home
    const lastDropoffLat = lastTrip.dropoffLat || lastTrip.pickupLat;
    const lastDropoffLng = lastTrip.dropoffLng || lastTrip.pickupLng;

    if (lastDropoffLat && lastDropoffLng) {
      const travelMinutes = estimateTravelTimeMinutes(
        lastDropoffLat, lastDropoffLng,
        driver.homeLat, driver.homeLng
      );
      const estimatedClockOutTime = new Date(dropoffTime.getTime() + travelMinutes * 60 * 1000);

      return {
        pendingClockOut: {
          type: 'PENDING_CLOCK_OUT',
          reason: 'END_OF_DAY',
          estimatedAt: estimatedClockOutTime.toISOString(),
          lastTripId: lastTrip.id,
          travelMinutes,
          anchorType: 'HOME',
        },
        estimatedClockOutTime,
      };
    }
  }

  // Default: clock out at dropoff time
  return {
    pendingClockOut: {
      type: 'PENDING_CLOCK_OUT',
      reason: 'END_OF_DAY',
      estimatedAt: dropoffTime.toISOString(),
      lastTripId: lastTrip.id,
      travelMinutes: 0,
      anchorType: 'DROPOFF',
    },
    estimatedClockOutTime: dropoffTime,
  };
};

// ─── ANTI-ABUSE DETECTION ────────────────────────────────────────
/**
 * Detect potential time tracking abuse.
 * 
 * @param {Object} params
 * @param {Array} params.breadcrumbs - GPS trail during the period
 * @param {Object} params.clockInLocation - Where driver clocked in
 * @param {Object} params.clockOutLocation - Where driver clocked out
 * @param {number} params.durationMinutes - Total shift duration
 * @returns {{ flags: Array, suspicious: boolean, details: Object }}
 */
export const detectAbuse = ({ breadcrumbs, clockInLocation, clockOutLocation, durationMinutes }) => {
  const flags = [];
  const details = {};

  if (!breadcrumbs || breadcrumbs.length < 2) {
    return { flags: [], suspicious: false, details: {} };
  }

  // 1. Check for location manipulation (teleportation)
  for (let i = 1; i < breadcrumbs.length; i++) {
    const prev = breadcrumbs[i - 1];
    const curr = breadcrumbs[i];
    if (prev.lat && curr.lat && prev.lng && curr.lng) {
      const distMiles = haversineDistanceMiles(prev.lat, prev.lng, curr.lat, curr.lng);
      const timeMinutes = (new Date(curr.at) - new Date(prev.at)) / (1000 * 60);
      if (timeMinutes > 0 && timeMinutes < 5) {
        const speedMph = (distMiles / timeMinutes) * 60;
        if (speedMph > 95) {
          flags.push('TELEPORT_DETECTED');
          details.teleport = { from: prev, to: curr, speedMph: Math.round(speedMph) };
        }
      }
    }
  }

  // 2. Check for unnecessary movement during break
  // (breaks would be marked in the event stream - look for rapid GPS changes
  //  during periods marked as break)

  // 3. Check for abnormal distance changes
  if (clockInLocation && clockOutLocation) {
    const commuteDistance = haversineDistanceMiles(
      clockInLocation.lat, clockInLocation.lng,
      clockOutLocation.lat, clockOutLocation.lng
    );
    if (commuteDistance > 50) {
      flags.push('ABNORMAL_COMMUTE_DISTANCE');
      details.commuteDistance = Math.round(commuteDistance);
    }
  }

  // 4. Check for GPS spoofing indicators
  const accuracies = breadcrumbs.map(b => b.accuracy).filter(a => a > 0);
  const avgAccuracy = accuracies.reduce((s, a) => s + a, 0) / accuracies.length;
  if (avgAccuracy > 150) {
    flags.push('POOR_GPS_ACCURACY');
    details.avgAccuracyMeters = Math.round(avgAccuracy);
  }

  return {
    flags,
    suspicious: flags.length > 0,
    details,
  };
};

// ─── BUILD TIME EVENTS FROM TRIPS ────────────────────────────────
/**
 * Convert trip data into time tracking events.
 * 
 * @param {Array} trips - Driver's trips for the day
 * @param {Object} driver - Driver profile
 * @param {Object} clockEvents - Clock in/out events
 * @param {string} policyMode
 * @returns {{ events: Array, sessions: Object, gapLog: Array, billableMinutes: number }}
 */
export const buildTimeEvents = (trips, driver, clockEvents, policyMode = POLICY_MODES.SMART_MODE) => {
  const events = [];
  const today = todayLocal();

  // Add clock events
  if (clockEvents && clockEvents.length > 0) {
    clockEvents.forEach(ce => {
      if (ce.timestamp && ce.timestamp.startsWith(today)) {
        events.push({
          type: ce.type === 'in' ? 'CLOCK_IN' : 'CLOCK_OUT',
          timestamp: ce.timestamp,
          location: ce.lat && ce.lng ? { lat: ce.lat, lng: ce.lng } : null,
        });
      }
    });
  }

  // Add trip events
  (trips || []).forEach(trip => {
    if (trip.date !== today) return;

    // Trip started
    if (trip.startedAt) {
      events.push({
        type: 'TRIP_EVENT',
        eventType: 'TRIP_STARTED',
        timestamp: trip.startedAt,
        tripId: trip.id,
        patient: trip.patient,
        location: null,
      });
    }

    // Arrived at pickup
    if (trip.arrivalTime) {
      events.push({
        type: 'TRIP_EVENT',
        eventType: 'ARRIVED_PICKUP',
        timestamp: trip.arrivalTime,
        tripId: trip.id,
        patient: trip.patient,
        location: trip.pickupLat ? { lat: trip.pickupLat, lng: trip.pickupLng } : null,
      });
    }

    // Departed pickup
    if (trip.departedPickupTime) {
      events.push({
        type: 'TRIP_EVENT',
        eventType: 'DEPARTED_PICKUP',
        timestamp: trip.departedPickupTime,
        tripId: trip.id,
        patient: trip.patient,
        location: null,
      });
    }

    // Arrived at dropoff
    if (trip.arrivalDropoffTime) {
      events.push({
        type: 'TRIP_EVENT',
        eventType: 'ARRIVED_DROPOFF',
        timestamp: trip.arrivalDropoffTime,
        tripId: trip.id,
        patient: trip.patient,
        location: trip.dropoffLat ? { lat: trip.dropoffLat, lng: trip.dropoffLng } : null,
      });
    }

    // Trip completed
    if (trip.completedAt) {
      events.push({
        type: 'TRIP_EVENT',
        eventType: 'TRIP_COMPLETED',
        timestamp: trip.completedAt,
        tripId: trip.id,
        patient: trip.patient,
        location: null,
      });
    }
  });

  // Sort all events by timestamp
  events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Stitch sessions
  const { sessions, totalBillableMinutes, gapLog } = stitchSessions(events);

  return {
    events,
    sessions,
    gapLog,
    billableMinutes: totalBillableMinutes,
    policyMode,
  };
};

// ─── PAYROLL OUTPUT ──────────────────────────────────────────────
/**
 * Generate payroll output for a day.
 * 
 * @param {Object} timeData - Output from buildTimeEvents
 * @param {number} hourlyRate - Driver's hourly rate
 * @returns {{ payTime: Object, sessionBreakdown: Array, gapLogs: Array, adminNotes: Array }}
 */
export const generatePayrollOutput = (timeData, hourlyRate = 0) => {
  const { sessions, gapLog, billableMinutes, policyMode } = timeData;

  const billableHours = billableMinutes / 60;
  const regularHours = Math.min(billableHours, 8);
  const overtimeHours = Math.max(0, billableHours - 8);
  const overtimeMultiplier = 1.5;

  const regularPay = regularHours * hourlyRate;
  const overtimePay = overtimeHours * hourlyRate * overtimeMultiplier;
  const totalPay = regularPay + overtimePay;

  const sessionBreakdown = sessions.map(s => ({
    sessionId: s.sessionId,
    clockIn: s.clockInTime,
    clockOut: s.clockOutTime || 'OPEN',
    totalMinutes: Math.round(s.totalMinutes || 0),
    billableMinutes: Math.round(s.billableMinutes || 0),
    breakMinutes: Math.round(s.breakMinutes || 0),
    gapMinutes: Math.round(s.gapMinutes || 0),
    personalGapMinutes: Math.round(s.personalGapMinutes || 0),
    tripCount: s.events.filter(e => e.type === 'TRIP_EVENT').length,
    isOpen: s.isOpen || false,
  }));

  const adminNotes = [];
  if (overtimeHours > 0) {
    adminNotes.push(`Overtime: ${overtimeHours.toFixed(1)} hours at ${overtimeMultiplier}x rate`);
  }
  if (gapLog.filter(g => g.classification === 'LONG').length > 0) {
    adminNotes.push(`${gapLog.filter(g => g.classification === 'LONG').length} long gap(s) excluded from payroll`);
  }
  if (sessions.some(s => s.breakMinutes > 60)) {
    adminNotes.push('Extended break detected (>60 min)');
  }

  return {
    payTime: {
      date: todayLocal(),
      billableMinutes: Math.round(billableMinutes),
      billableHours: Math.round(billableHours * 10) / 10,
      regularHours: Math.round(regularHours * 10) / 10,
      overtimeHours: Math.round(overtimeHours * 10) / 10,
      hourlyRate,
      regularPay: Math.round(regularPay * 100) / 100,
      overtimePay: Math.round(overtimePay * 100) / 100,
      totalPay: Math.round(totalPay * 100) / 100,
      policyMode,
      sessionCount: sessions.length,
    },
    sessionBreakdown,
    gapLogs: gapLog,
    adminNotes,
  };
};

export default {
  TIME_TRACKING_STATES,
  POLICY_MODES,
  GAP_CLASSIFICATIONS,
  PAYROLL_EFFECTS,
  ARRIVAL_RADIUS_FT,
  ARRIVAL_RADIUS_METERS,
  GAP_THRESHOLDS,
  haversineDistanceMiles,
  haversineDistanceMeters,
  haversineDistanceFeet,
  estimateTravelTimeMinutes,
  validateArrival,
  calculateAnchor,
  classifyGap,
  stitchSessions,
  generatePendingClockOut,
  detectAbuse,
  buildTimeEvents,
  generatePayrollOutput,
};
