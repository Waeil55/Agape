/**
 * AUTOMATED TIME TRACKING ENGINE
 * Event-driven, GPS-verified, audit-logged, multi-session aware.
 * 
 * States: OFF_SHIFT → ON_SHIFT_ACTIVE ↔ ON_BREAK → PENDING_RESUME → OFF_SHIFT
 * Payroll is based on EVENTS, not raw clock-in/out times.
 */

import { todayLocal } from './driverTelemetry';

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const normalizePoint = (pointOrLat, maybeLng) => {
  if (pointOrLat && typeof pointOrLat === 'object') {
    const lat = toNumber(pointOrLat.lat ?? pointOrLat.latitude);
    const lng = toNumber(pointOrLat.lng ?? pointOrLat.longitude);
    return lat == null || lng == null ? null : { lat, lng };
  }
  const lat = toNumber(pointOrLat);
  const lng = toNumber(maybeLng);
  return lat == null || lng == null ? null : { lat, lng };
};

function haversineMiles(pointAOrLat, pointBOrLng, maybeLat2, maybeLng2) {
  const pointA = normalizePoint(pointAOrLat, pointBOrLng);
  const pointB = pointAOrLat && typeof pointAOrLat === 'object'
    ? normalizePoint(pointBOrLng)
    : normalizePoint(maybeLat2, maybeLng2);
  if (!pointA || !pointB) return 0;
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(pointB.lat - pointA.lat);
  const dLng = toRad(pointB.lng - pointA.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(pointA.lat)) * Math.cos(toRad(pointB.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
  WORK_WAITING: 'WORK_WAITING',
  VERIFIED_PERSONAL: 'VERIFIED_PERSONAL',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
};

export const PAYROLL_EFFECTS = {
  INCLUDED: 'INCLUDED',
  EXCLUDED: 'EXCLUDED',
  REVIEW: 'REVIEW',
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
export const classifyGap = (lastEventTime, nextEventTime, lastLocation, nextLocation, context = {}) => {
  const last = new Date(lastEventTime);
  const next = new Date(nextEventTime);
  const durationMs = next.getTime() - last.getTime();
  const durationMinutes = Math.max(0, durationMs / (1000 * 60));

  let classification;
  let payrollEffect;
  let notes = '';
  let gapDistanceMiles = null;

  const resolution = String(context?.resolution || '').trim().toUpperCase();
  const verifiedPersonal = resolution === 'PERSONAL_UNPAID' || context?.verifiedPersonal === true;
  const verifiedWaiting = resolution === 'PAID_WAITING' || context?.requiredToRemain === true || context?.sameTrip === true;

  if (verifiedPersonal) {
    classification = GAP_CLASSIFICATIONS.VERIFIED_PERSONAL;
    payrollEffect = PAYROLL_EFFECTS.EXCLUDED;
    notes = 'Verified off-duty personal time; excluded by an attributable payroll decision';
  } else if (verifiedWaiting || durationMinutes <= GAP_THRESHOLDS.SHORT_MAX) {
    classification = GAP_CLASSIFICATIONS.WORK_WAITING;
    payrollEffect = PAYROLL_EFFECTS.INCLUDED;
    notes = verifiedWaiting ? 'Work-related waiting supported by trip or review evidence' : 'Short operational gap included as continuous work';
  } else {
    classification = GAP_CLASSIFICATIONS.NEEDS_REVIEW;
    payrollEffect = PAYROLL_EFFECTS.REVIEW;
    notes = 'Ambiguous gap remains included until an authorized reviewer records a decision; no payroll deduction was made';
  }

  // GPS movement is an integrity signal only. It never proves personal activity.
  if (lastLocation && nextLocation) {
    gapDistanceMiles = haversineDistanceMiles(
      lastLocation.lat, lastLocation.lng,
      nextLocation.lat, nextLocation.lng
    );
    if (gapDistanceMiles > 10 && classification === GAP_CLASSIFICATIONS.WORK_WAITING && !verifiedWaiting) {
      classification = GAP_CLASSIFICATIONS.NEEDS_REVIEW;
      payrollEffect = PAYROLL_EFFECTS.REVIEW;
      notes = `${gapDistanceMiles.toFixed(1)}mi movement requires review; no payroll deduction was made`;
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
    gapType: payrollEffect === PAYROLL_EFFECTS.EXCLUDED
      ? 'VERIFIED_OFF_DUTY'
      : payrollEffect === PAYROLL_EFFECTS.REVIEW ? 'REVIEW_REQUIRED' : 'WORK_CONTINUITY',
    payrollEffect,
    gapDistanceMiles: gapDistanceMiles == null ? null : Math.round(gapDistanceMiles * 10) / 10,
    notes,
    classifiedAt: new Date().toISOString(),
    resolution: resolution || null,
    resolvedBy: context?.resolvedBy || null,
    resolvedAt: context?.resolvedAt || null,
    resolutionReason: context?.resolutionReason || null,
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
const CLOCK_EVENT_TYPES = new Set(['CLOCK_IN', 'AUTO_CLOCK_IN', 'CLOCK_OUT', 'BREAK_START', 'BREAK_END', 'TRIP_EVENT', 'GAP_RESOLUTION']);

const canonicalEventType = (type) => {
  const normalized = String(type || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (normalized === 'IN' || normalized === 'CLOCKIN') return 'CLOCK_IN';
  if (normalized === 'AUTO_IN' || normalized === 'AUTOCLOCKIN') return 'AUTO_CLOCK_IN';
  if (normalized === 'OUT' || normalized === 'CLOCKOUT' || normalized === 'AUTO_OUT' || normalized === 'AUTOCLOCKOUT') return 'CLOCK_OUT';
  if (normalized === 'PAUSE' || normalized === 'START_BREAK') return 'BREAK_START';
  if (normalized === 'RESUME' || normalized === 'END_BREAK') return 'BREAK_END';
  return normalized;
};

const eventMillis = (event) => {
  const value = event?.timestamp || event?.at || event?.time || event?.createdAt;
  const date = value?.toDate ? value.toDate() : value?.seconds ? new Date(value.seconds * 1000) : new Date(value);
  return Number.isFinite(date.getTime()) ? date.getTime() : null;
};

export const validateTimeEventSequence = (events, options = {}) => {
  const nowMs = eventMillis({ timestamp: options.now || new Date() });
  const anomalies = [];
  let onShift = false;
  let onBreak = false;

  const normalizedEvents = (events || [])
    .map((event, sourceIndex) => ({ ...event, type: canonicalEventType(event.type), _sourceIndex: sourceIndex, _ms: eventMillis(event) }))
    .filter((event) => {
      if (event._ms == null) {
        anomalies.push({ code: 'INVALID_TIMESTAMP', sourceIndex: event._sourceIndex, message: 'Event has an invalid timestamp.' });
        return false;
      }
      if (!CLOCK_EVENT_TYPES.has(event.type)) {
        anomalies.push({ code: 'UNKNOWN_EVENT', sourceIndex: event._sourceIndex, message: `Unsupported event type: ${event.type || 'empty'}.` });
        return false;
      }
      if (nowMs != null && event._ms > nowMs + 60000) {
        anomalies.push({ code: 'FUTURE_EVENT', sourceIndex: event._sourceIndex, message: 'Event is in the future.' });
        return false;
      }
      return true;
    })
    .sort((a, b) => a._ms - b._ms || a._sourceIndex - b._sourceIndex);

  normalizedEvents.forEach((event) => {
    if (event.type === 'GAP_RESOLUTION') return;
    if (event.type === 'CLOCK_IN' || event.type === 'AUTO_CLOCK_IN') {
      if (onShift) anomalies.push({ code: 'DUPLICATE_CLOCK_IN', sourceIndex: event._sourceIndex, message: 'Clock in occurred while a shift was already open.' });
      else { onShift = true; onBreak = false; }
    } else if (event.type === 'CLOCK_OUT') {
      if (!onShift) anomalies.push({ code: 'ORPHAN_CLOCK_OUT', sourceIndex: event._sourceIndex, message: 'Clock out has no matching clock in.' });
      else { onShift = false; onBreak = false; }
    } else if (event.type === 'BREAK_START') {
      if (!onShift) anomalies.push({ code: 'BREAK_OUTSIDE_SHIFT', sourceIndex: event._sourceIndex, message: 'Break started outside a shift.' });
      else if (onBreak) anomalies.push({ code: 'DUPLICATE_BREAK_START', sourceIndex: event._sourceIndex, message: 'Break was already active.' });
      else onBreak = true;
    } else if (event.type === 'BREAK_END') {
      if (!onShift || !onBreak) anomalies.push({ code: 'ORPHAN_BREAK_END', sourceIndex: event._sourceIndex, message: 'Resume has no matching pause.' });
      else onBreak = false;
    }
  });

  return {
    valid: anomalies.length === 0,
    anomalies,
    normalizedEvents: normalizedEvents.map(({ _sourceIndex, _ms, ...event }) => event),
    hasOpenShift: onShift,
    hasOpenBreak: onShift && onBreak,
  };
};

export const stitchSessions = (events, options = {}) => {
  if (!events || events.length === 0) {
    return { sessions: [], totalBillableMinutes: 0, totalBillableMilliseconds: 0, gapLog: [], anomalies: [] };
  }

  const validation = validateTimeEventSequence(events, options);
  const sorted = validation.normalizedEvents.map((event, index) => ({ ...event, _ms: eventMillis(event), _index: index }));
  const gapResolutions = sorted.filter((event) => event.type === 'GAP_RESOLUTION');
  const sessions = [];
  const gapLog = [];
  const anomalies = [...validation.anomalies];
  let currentSession = null;

  const finalizeSession = (session, endMs, event = null, isOpen = false) => {
    if (session.breakStartMs != null) {
      session.breakMilliseconds += Math.max(0, endMs - session.breakStartMs);
      session.breakStartMs = null;
    }
    if (event) session.events.push(event);
    session.clockOutTime = isOpen ? null : new Date(endMs).toISOString();
    session.clockOutLocation = isOpen ? null : (event?.location || null);
    session.totalMilliseconds = Math.max(0, endMs - session.clockInMs);
    session.billableMilliseconds = Math.max(0, session.totalMilliseconds - session.breakMilliseconds - session.excludedGapMilliseconds);
    session.totalMinutes = session.totalMilliseconds / 60000;
    session.breakMinutes = session.breakMilliseconds / 60000;
    session.excludedGapMinutes = session.excludedGapMilliseconds / 60000;
    session.billableMinutes = session.billableMilliseconds / 60000;
    session.isOpen = isOpen;
  };

  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i];

    if (event.type === 'GAP_RESOLUTION') {
      continue;
    }

    if (event.type === 'CLOCK_IN' || event.type === 'AUTO_CLOCK_IN') {
      if (currentSession) continue;
      currentSession = {
        sessionId: `session_${event._ms}_${i}`,
        clockInTime: event.timestamp,
        clockInMs: event._ms,
        clockInLocation: event.location || null,
        clockInType: event.type,
        events: [event],
        billableMilliseconds: 0,
        breakMilliseconds: 0,
        excludedGapMilliseconds: 0,
        gapMinutes: 0,
        personalGapMinutes: 0,
      };
      sessions.push(currentSession);
      continue;
    }

    if (event.type === 'CLOCK_OUT') {
      if (currentSession) {
        finalizeSession(currentSession, event._ms, event, false);
        currentSession = null;
      }
      continue;
    }

    if (event.type === 'BREAK_START') {
      if (currentSession && currentSession.breakStartMs == null) {
        currentSession.breakStartTime = event.timestamp;
        currentSession.breakStartMs = event._ms;
        currentSession.events.push(event);
      }
      continue;
    }

    if (event.type === 'BREAK_END') {
      if (currentSession && currentSession.breakStartMs != null) {
        currentSession.breakMilliseconds += Math.max(0, event._ms - currentSession.breakStartMs);
        currentSession.events.push(event);
        currentSession.breakStartTime = null;
        currentSession.breakStartMs = null;
      }
      continue;
    }

    if (event.type === 'TRIP_EVENT') {
      if (currentSession) {
        currentSession.events.push(event);

        // Check for gap between this event and the previous one
        if (currentSession.events.length > 1) {
          const prevEvent = currentSession.events[currentSession.events.length - 2];
          const matchingResolution = gapResolutions.find((resolution) => {
            const startMs = eventMillis({ timestamp: resolution.gapStartTime });
            const endMs = eventMillis({ timestamp: resolution.gapEndTime });
            return startMs != null && endMs != null
              && Math.abs(startMs - prevEvent._ms) <= 60000
              && Math.abs(endMs - event._ms) <= 60000;
          });
          const gap = classifyGap(
            prevEvent.timestamp,
            event.timestamp,
            prevEvent.location,
            event.location,
            {
              sameTrip: Boolean(prevEvent.tripId && prevEvent.tripId === event.tripId),
              requiredToRemain: prevEvent.type === 'TRIP_EVENT' && event.type === 'TRIP_EVENT',
              resolution: matchingResolution?.resolution,
              resolvedBy: matchingResolution?.correctedBy || matchingResolution?.resolvedBy,
              resolvedAt: matchingResolution?.correctedAt || matchingResolution?.resolvedAt,
              resolutionReason: matchingResolution?.correctionReason || matchingResolution?.resolutionReason,
            }
          );

          gapLog.push({
            ...gap.auditRecord,
            sessionId: currentSession.sessionId,
            tripId: event.tripId || null,
          });

          if (gap.payrollEffect === PAYROLL_EFFECTS.EXCLUDED) {
            currentSession.gapMinutes += gap.durationMinutes;
            currentSession.excludedGapMilliseconds += gap.durationMinutes * 60000;
            if (gap.classification === GAP_CLASSIFICATIONS.VERIFIED_PERSONAL) {
              currentSession.personalGapMinutes += gap.durationMinutes;
            }
          } else if (gap.payrollEffect === PAYROLL_EFFECTS.REVIEW) {
            currentSession.gapMinutes += gap.durationMinutes;
          }
        }
      }
      continue;
    }
  }

  // If session is still open (driver hasn't clocked out yet)
  if (currentSession) {
    const requestedNow = eventMillis({ timestamp: options.now || new Date() });
    const lastKnownEventMs = currentSession.events.reduce((latest, event) => Math.max(latest, eventMillis(event) || latest), currentSession.clockInMs);
    const openSessionEndMs = options.requireClosed
      ? lastKnownEventMs
      : Math.max(currentSession.clockInMs, requestedNow || Date.now());
    finalizeSession(currentSession, openSessionEndMs, null, true);
    if (options.requireClosed) {
      anomalies.push({ code: 'OPEN_SHIFT', message: 'Shift has no clock-out event and cannot be approved for payroll.' });
    }
  }

  sessions.forEach((session) => {
    delete session.clockInMs;
    delete session.breakStartMs;
    session.events = session.events.map(({ _ms, _index, ...event }) => event);
    const maxShiftMilliseconds = Number(options.maxShiftHours || 18) * 3600000;
    const maxBreakMilliseconds = Number(options.maxBreakHours || 4) * 3600000;
    if (session.totalMilliseconds > maxShiftMilliseconds) {
      anomalies.push({ code: 'EXCESSIVE_SHIFT', sessionId: session.sessionId, message: `Shift exceeds ${options.maxShiftHours || 18} hours and requires correction.` });
    }
    if (session.breakMilliseconds > maxBreakMilliseconds) {
      anomalies.push({ code: 'EXCESSIVE_BREAK', sessionId: session.sessionId, message: `Recorded break exceeds ${options.maxBreakHours || 4} hours and requires correction.` });
    }
  });
  const totalBillableMilliseconds = sessions.reduce((sum, s) => sum + (s.billableMilliseconds || 0), 0);
  const totalBillableMinutes = totalBillableMilliseconds / 60000;

  return { sessions, totalBillableMinutes, totalBillableMilliseconds, gapLog, anomalies };
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

    if (lastDropoffLat != null && lastDropoffLng != null) {
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
export const detectAbuse = ({ breadcrumbs, clockInLocation, clockOutLocation, durationMinutes: _durationMinutes }) => {
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
export const buildTimeEvents = (trips, driver, clockEvents, policyMode = POLICY_MODES.PAY_FROM_HOME, options = {}) => {
  const events = [];
  const dateFilter = options.date || todayLocal();
  const driverId = driver?.id || driver?.email || options.driverId || '';
  const automaticShift = options.automaticShift !== false;

  const toIso = (value) => {
    if (!value) return null;
    if (typeof value === 'string') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
    if (typeof value.toDate === 'function') return value.toDate().toISOString();
    if (value.seconds) return new Date(value.seconds * 1000).toISOString();
    return null;
  };

  const isoDateKey = (value) => {
    const iso = toIso(value);
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const shouldIncludeDate = (dateKey) => !dateFilter || dateKey === dateFilter;

  const locationFrom = (entity, latKey = 'lat', lngKey = 'lng') => {
    const direct = normalizePoint(entity?.location);
    if (direct) return direct;
    return normalizePoint(entity?.[latKey], entity?.[lngKey]);
  };

  const clockLocationFrom = (clockEvent) => (
    locationFrom(clockEvent)
    || normalizePoint(clockEvent?.clockLocation)
    || normalizePoint(clockEvent?.lat, clockEvent?.lng)
    || normalizePoint(clockEvent?.latitude, clockEvent?.longitude)
  );

  const normalizeClockType = (type) => {
    const lower = String(type || '').toLowerCase();
    if (lower.includes('gap') && lower.includes('resolution')) return 'GAP_RESOLUTION';
    if (lower.includes('break') && (lower.includes('end') || lower.includes('resume'))) return 'BREAK_END';
    if (lower.includes('break')) return 'BREAK_START';
    if (lower.includes('out')) return 'CLOCK_OUT';
    if (lower.includes('auto')) return 'AUTO_CLOCK_IN';
    if (lower === 'in' || lower === 'clock_in' || lower === 'clockin') return 'CLOCK_IN';
    if (lower === 'out' || lower === 'clock_out' || lower === 'clockout') return 'CLOCK_OUT';
    if (lower === 'break_end') return 'BREAK_END';
    if (lower === 'break_start') return 'BREAK_START';
    return 'CLOCK_IN';
  };

  const tripDateKey = (trip) => {
    if (typeof trip?.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(trip.date)) return trip.date.slice(0, 10);
    return (
      isoDateKey(trip?.arrivalTime)
      || isoDateKey(trip?.startTime)
      || isoDateKey(trip?.startedAt)
      || isoDateKey(trip?.arrivalDropoffTime)
      || isoDateKey(trip?.completedAt)
      || null
    );
  };

  const pickupLocationFrom = (trip) => (
    normalizePoint(trip?.pickupLocation)
    || normalizePoint(trip?.pickupLat ?? trip?.pickupLatitude, trip?.pickupLng ?? trip?.pickupLongitude)
  );
  const dropoffLocationFrom = (trip) => (
    normalizePoint(trip?.dropoffLocation)
    || normalizePoint(trip?.dropoffLat ?? trip?.dropoffLatitude, trip?.dropoffLng ?? trip?.dropoffLongitude)
  );

  const normalizedClockEvents = (clockEvents || [])
    .map((ce) => {
      const timestamp = toIso(ce.timestamp || ce.at || ce.createdAt || ce.time);
      if (!timestamp) return null;
      const date = isoDateKey(timestamp);
      if (!shouldIncludeDate(date)) return null;
      return {
        ...ce,
        driverId: ce.driverId || driverId,
        date,
        at: timestamp,
        timestamp,
        type: normalizeClockType(ce.type || ce.eventType || ce.clockEventType),
        location: clockLocationFrom(ce),
      };
    })
    .filter(Boolean)
    .filter((event, index, all) => all.findIndex((candidate) => (
      candidate.type === event.type && candidate.timestamp === event.timestamp
    )) === index);

  const normalizedTrips = [];
  (trips || []).forEach((trip) => {
    const date = tripDateKey(trip) || dateFilter;
    if (!shouldIncludeDate(date)) return;
    const pickupLocation = pickupLocationFrom(trip);
    const dropoffLocation = dropoffLocationFrom(trip);
    const base = {
      ...trip,
      driverId: trip.driverId || trip.assignedDriverId || driverId,
      date,
      pickupLocation,
      dropoffLocation,
    };
    normalizedTrips.push(base);

    const addTripEvent = (eventType, timestampValue, location) => {
      const timestamp = toIso(timestampValue);
      if (!timestamp) return;
      events.push({
        type: 'TRIP_EVENT',
        eventType,
        timestamp,
        tripId: trip.id,
        patient: trip.patient,
        location: location || null,
        driverId: base.driverId,
        date: isoDateKey(timestamp),
      });
    };

    addTripEvent('TRIP_STARTED', trip.startedAt || trip.startTime, pickupLocation);
    addTripEvent('ARRIVED_PICKUP', trip.arrivalTime || trip.arrivedPickupAt, pickupLocation);
    addTripEvent('DEPARTED_PICKUP', trip.departedPickupTime || trip.departedPickupAt, pickupLocation);
    addTripEvent('ARRIVED_DROPOFF', trip.arrivalDropoffTime || trip.arrivedDropoffAt, dropoffLocation);
    addTripEvent('TRIP_COMPLETED', trip.completedAt || trip.completedTime, dropoffLocation || pickupLocation);
  });

  const tripEvents = events.filter((event) => event.type === 'TRIP_EVENT');
  const firstWorkEvent = [...tripEvents]
    .filter((event) => event.type === 'TRIP_EVENT')
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))[0];
  const lastWorkEvent = [...tripEvents]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

  const isAdminCorrection = (event) => (
    event?.source === 'admin_correction'
    || event?.authority === 'admin'
    || Boolean(event?.correctedBy)
    || Boolean(event?.correctionReason)
  );
  const retainedClockEvents = automaticShift && firstWorkEvent
    ? normalizedClockEvents.filter((event) => (
        event.type === 'BREAK_START'
        || event.type === 'BREAK_END'
        || isAdminCorrection(event)
      ))
    : normalizedClockEvents;

  retainedClockEvents.forEach((ce) => {
    events.push({
      ...ce,
      driverId: ce.driverId || driverId,
      date: ce.date,
    });
  });

  const correctedEnd = [...retainedClockEvents].reverse().find((event) => (
    isAdminCorrection(event) && event.type === 'CLOCK_OUT'
  ));
  const hasClockIn = retainedClockEvents.some((event) => event.type === 'CLOCK_IN' || event.type === 'AUTO_CLOCK_IN');

  const breadcrumbTime = (breadcrumb) => toIso(
    breadcrumb?.capturedAt || breadcrumb?.recordedAt || breadcrumb?.timestamp || breadcrumb?.at
  );
  const homePoint = normalizePoint(driver?.homeLat, driver?.homeLng);
  const homeBreadcrumbs = homePoint
    ? (options.breadcrumbs || driver?.breadcrumbs || [])
        .map((breadcrumb) => ({
          timestamp: breadcrumbTime(breadcrumb),
          location: normalizePoint(breadcrumb),
          accuracy: Number(breadcrumb?.accuracy || 0),
        }))
        .filter((breadcrumb) => (
          breadcrumb.timestamp
          && breadcrumb.location
          && (!breadcrumb.accuracy || breadcrumb.accuracy <= 200)
          && shouldIncludeDate(isoDateKey(breadcrumb.timestamp))
          && haversineDistanceMiles(
            breadcrumb.location.lat,
            breadcrumb.location.lng,
            homePoint.lat,
            homePoint.lng,
          ) <= 0.12
        ))
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    : [];

  if (!hasClockIn && firstWorkEvent) {
    const anchor = calculateAnchor({
      policyMode,
      driver,
      lastWorkLocation: options.lastWorkLocation || null,
      pickupLocation: firstWorkEvent.location,
      pickupTime: new Date(firstWorkEvent.timestamp),
    });
    const firstWorkMs = new Date(firstWorkEvent.timestamp).getTime();
    const gpsHomeDeparture = [...homeBreadcrumbs]
      .reverse()
      .find((breadcrumb) => {
        const breadcrumbMs = new Date(breadcrumb.timestamp).getTime();
        return breadcrumbMs <= firstWorkMs && firstWorkMs - breadcrumbMs <= 3 * 60 * 60 * 1000;
      });
    const automaticStart = policyMode === POLICY_MODES.PAY_FROM_HOME && gpsHomeDeparture
      ? gpsHomeDeparture.timestamp
      : (anchor.clockInTime ? anchor.clockInTime.toISOString() : firstWorkEvent.timestamp);
    events.push({
      type: 'AUTO_CLOCK_IN',
      timestamp: automaticStart,
      location: gpsHomeDeparture?.location || anchor.anchorLocation || firstWorkEvent.location || null,
      driverId,
      date: dateFilter,
      anchorType: gpsHomeDeparture ? 'HOME_GPS' : anchor.anchorType,
      travelMinutes: Math.round(anchor.travelMinutes || 0),
      reason: gpsHomeDeparture ? 'HOME_DEPARTURE_GEOFENCE' : 'FIRST_WORK_EVENT',
      source: 'authoritative_trip_ledger',
      confidence: gpsHomeDeparture ? 'gps_verified' : (anchor.anchorType === 'HOME' ? 'route_estimate' : 'trip_verified'),
    });
  }

  if (automaticShift && firstWorkEvent && lastWorkEvent && !correctedEnd) {
    const terminalStatuses = new Set(['completed', 'complete', 'done', 'no show', 'no-show', 'noshow', 'cancelled', 'canceled']);
    const historicalDate = dateFilter < todayLocal(options.now || new Date());
    const allTripsTerminal = normalizedTrips.every((trip) => terminalStatuses.has(String(trip?.status || '').trim().toLowerCase()));
    const lastWorkMs = new Date(lastWorkEvent.timestamp).getTime();
    const gpsHomeArrival = homeBreadcrumbs.find((breadcrumb) => new Date(breadcrumb.timestamp).getTime() >= lastWorkMs);
    const lastTrip = normalizedTrips.find((trip) => trip.id === lastWorkEvent.tripId) || normalizedTrips[normalizedTrips.length - 1];
    const pending = generatePendingClockOut({ lastTrip, driver, policyMode });
    const estimatedEnd = pending.estimatedClockOutTime && !Number.isNaN(pending.estimatedClockOutTime.getTime())
      ? pending.estimatedClockOutTime.toISOString()
      : lastWorkEvent.timestamp;
    const automaticEnd = policyMode === POLICY_MODES.PAY_FROM_HOME && gpsHomeArrival
      ? gpsHomeArrival.timestamp
      : estimatedEnd;
    const endMs = new Date(automaticEnd).getTime();
    const nowMs = new Date(options.now || new Date()).getTime();
    if (historicalDate || (allTripsTerminal && endMs <= nowMs)) {
      events.push({
        type: 'CLOCK_OUT',
        timestamp: automaticEnd,
        location: gpsHomeArrival?.location || (pending.pendingClockOut?.anchorType === 'HOME' ? homePoint : lastWorkEvent.location),
        driverId,
        date: dateFilter,
        anchorType: gpsHomeArrival ? 'HOME_GPS' : (pending.pendingClockOut?.anchorType || 'LAST_WORK_EVENT'),
        reason: gpsHomeArrival ? 'HOME_ARRIVAL_GEOFENCE' : 'LAST_WORK_EVENT_COMPLETE',
        source: 'authoritative_trip_ledger',
        confidence: gpsHomeArrival ? 'gps_verified' : (pending.pendingClockOut?.anchorType === 'HOME' ? 'route_estimate' : 'trip_verified'),
      });
    }
  }

  const eventPriority = (event) => {
    if (event.type === 'CLOCK_IN' || event.type === 'AUTO_CLOCK_IN') return 0;
    if (event.type === 'GAP_RESOLUTION' || event.type === 'BREAK_END') return 1;
    if (event.type === 'TRIP_EVENT') return 2;
    if (event.type === 'BREAK_START') return 3;
    if (event.type === 'CLOCK_OUT') return 4;
    return 2;
  };
  events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp) || eventPriority(a) - eventPriority(b));

  const calculationNow = options.now || new Date();
  const { sessions, totalBillableMinutes, totalBillableMilliseconds, gapLog, anomalies } = stitchSessions(events, {
    now: calculationNow,
    requireClosed: dateFilter < todayLocal(calculationNow),
  });
  const gapLogWithMeta = gapLog.map((gap) => ({
    ...gap,
    driverId: gap.driverId || driverId,
    date: gap.date || isoDateKey(gap.startTime) || dateFilter,
  }));

  const firstSession = sessions[0] || {};
  const lastSession = sessions[sessions.length - 1] || {};
  const abuse = detectAbuse({
    breadcrumbs: options.breadcrumbs || driver?.breadcrumbs || [],
    clockInLocation: firstSession.clockInLocation,
    clockOutLocation: lastSession.clockOutLocation,
    durationMinutes: sessions.reduce((sum, session) => sum + (session.totalMinutes || 0), 0),
  });
  const teleports = abuse.flags.map((flag) => ({
    driverId,
    date: dateFilter,
    type: flag,
    details: abuse.details,
    payrollEffect: 'REVIEW',
  }));
  const reviewRequiredGaps = gapLogWithMeta.filter((gap) => gap.payrollEffect === PAYROLL_EFFECTS.REVIEW);
  const estimatedBoundaries = events.filter((event) => (
    (event.type === 'AUTO_CLOCK_IN' || event.type === 'CLOCK_OUT') && event.confidence === 'route_estimate'
  ));
  const openSessions = sessions.filter((session) => session.isOpen);
  const reconciliationIssues = [
    ...anomalies.map((issue) => ({ severity: 'critical', code: issue.code, message: issue.message })),
    ...reviewRequiredGaps.map((gap) => ({
      severity: 'review',
      code: 'AMBIGUOUS_GAP',
      message: `${Math.round(gap.durationMinutes)} minute gap requires an authorized paid-waiting or personal-time decision.`,
      startTime: gap.startTime,
      endTime: gap.endTime,
    })),
    ...estimatedBoundaries.map((event) => ({
      severity: 'evidence',
      code: 'ESTIMATED_BOUNDARY',
      message: `${event.type === 'AUTO_CLOCK_IN' ? 'Shift start' : 'Shift end'} uses a route estimate because verified GPS boundary evidence was unavailable.`,
      timestamp: event.timestamp,
    })),
  ];
  const reconciliation = {
    status: openSessions.length > 0 ? 'ACTIVE' : (anomalies.length > 0 || reviewRequiredGaps.length > 0 ? 'NEEDS_REVIEW' : 'READY'),
    tripCount: normalizedTrips.length,
    sessionCount: sessions.length,
    unresolvedGapCount: reviewRequiredGaps.length,
    verifiedPersonalGapCount: gapLogWithMeta.filter((gap) => gap.classification === GAP_CLASSIFICATIONS.VERIFIED_PERSONAL).length,
    paidWaitingGapCount: gapLogWithMeta.filter((gap) => gap.classification === GAP_CLASSIFICATIONS.WORK_WAITING).length,
    estimatedBoundaryCount: estimatedBoundaries.length,
    issues: reconciliationIssues,
  };

  return {
    date: dateFilter,
    driverId,
    events,
    sessions: sessions.map((session) => ({ ...session, driverId, date: dateFilter })),
    gapLog: gapLogWithMeta,
    gaps: gapLogWithMeta,
    clockEvents: events.filter((event) => event.type !== 'TRIP_EVENT'),
    sourceClockEvents: normalizedClockEvents,
    trips: normalizedTrips,
    teleports,
    abuse,
    billableMinutes: totalBillableMinutes,
    billableMilliseconds: totalBillableMilliseconds,
    anomalies,
    reviewRequiredGaps,
    reconciliation,
    approvalEligible: anomalies.length === 0 && reviewRequiredGaps.length === 0 && sessions.every((session) => !session.isOpen),
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
  const { sessions = [], gapLog = [], policyMode, date } = timeData || {};
  const billableMilliseconds = Number.isFinite(timeData?.billableMilliseconds ?? timeData?.totalBillableMilliseconds)
    ? (timeData.billableMilliseconds ?? timeData.totalBillableMilliseconds)
    : Number(timeData?.billableMinutes || 0) * 60000;
  const billableMinutesExact = billableMilliseconds / 60000;
  const billableMinutes = Math.round(billableMinutesExact);
  const billableHours = billableMilliseconds / 3600000;
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
    excludedGapMinutes: Math.round(s.excludedGapMinutes || 0),
    tripCount: s.events.filter(e => e.type === 'TRIP_EVENT').length,
    isOpen: s.isOpen || false,
  }));

  const adminNotes = [];
  if (overtimeHours > 0) {
    adminNotes.push(`Overtime: ${overtimeHours.toFixed(1)} hours at ${overtimeMultiplier}x rate`);
  }
  if (gapLog.filter(g => g.classification === GAP_CLASSIFICATIONS.VERIFIED_PERSONAL).length > 0) {
    adminNotes.push(`${gapLog.filter(g => g.classification === GAP_CLASSIFICATIONS.VERIFIED_PERSONAL).length} verified personal-time gap(s) excluded from payroll`);
  }
  if (gapLog.filter(g => g.classification === GAP_CLASSIFICATIONS.NEEDS_REVIEW).length > 0) {
    adminNotes.push(`${gapLog.filter(g => g.classification === GAP_CLASSIFICATIONS.NEEDS_REVIEW).length} ambiguous gap(s) require review; no automatic deduction was made`);
  }
  if (sessions.some(s => s.breakMinutes > 60)) {
    adminNotes.push('Extended break detected (>60 min)');
  }

  return {
    payTime: {
      date: date || todayLocal(),
      billableMinutes: Math.round(billableMinutes),
      billableMilliseconds,
      billableHours: Math.round(billableHours * 100) / 100,
      regularHours: Math.round(regularHours * 100) / 100,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
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
  validateTimeEventSequence,
  generatePendingClockOut,
  detectAbuse,
  buildTimeEvents,
  generatePayrollOutput,
};
