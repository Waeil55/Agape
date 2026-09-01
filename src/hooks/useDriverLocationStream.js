import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LOCATION_STREAM_INTERVAL_MS,
  buildLocationFraudSignals,
  metersPerSecondToMph,
} from '../utils/locationFraud';
import { haversineMiles } from '../utils/driverTelemetry';
import { db, doc, setDoc } from '../config/firebase';

const getCapacitorGeolocation = () => {
  try {
    const Capacitor = window?.Capacitor;
    if (Capacitor?.isNativePlatform && Capacitor?.plugins?.Geolocation) {
      return Capacitor.plugins.Geolocation;
    }
  } catch (_) {}
  return null;
};

const BATCH_FLUSH_INTERVAL_MS = 6000;
const TRAIL_WRITE_INTERVAL_MS = 15000;

export function useDriverLocationStream({
  enabled,
  driver,
  role = 'driver',
  currentTrip = null,
  onLocationUpdate,
  onPositionChange,
  onTrackingChange,
  onPermissionChange,
}) {
  const [error, setError] = useState('');
  const watchIdRef = useRef(null);
  const latestPositionRef = useRef(null);
  const lastSentRef = useRef(null);
  const flushingRef = useRef(false);
  const driverId = driver?.id || '';
  const batchQueueRef = useRef([]);

  // UI-position throttle: raw GPS samples arrive every 1-2s; pushing each one
  // into React state re-renders the whole driver page. The stream's internal
  // ref stays per-sample accurate; consumers get at most ~4s staleness or a
  // >20m move, which every UI use (distance checks, route building) tolerates.
  const uiPositionRef = useRef({ at: 0, lat: null, lng: null });

  const flushLatestPosition = useCallback(async (reason = 'interval') => {
    if (!enabled || !driverId || !latestPositionRef.current || flushingRef.current) return;

    flushingRef.current = true;
    try {
      const sample = latestPositionRef.current;
      const fraudSignals = buildLocationFraudSignals(lastSentRef.current, sample);
      const telemetry = {
        accuracy: sample.accuracy,
        altitude: sample.altitude,
        speedMph: sample.speedMph,
        heading: sample.heading,
        actorRole: role || 'driver',
        source: 'driver-pwa-location-stream',
        streamIntervalMs: LOCATION_STREAM_INTERVAL_MS,
        streamReason: reason,
        recordedAt: sample.capturedAt,
        capturedAt: sample.capturedAt,
        clientTimeMs: sample.clientTimeMs,
        tripId: currentTrip?.id || null,
        assignmentId: currentTrip?.assignmentId || null,
        currentTripStatus: currentTrip?.status || null,
        fraudSignals,
      };

      batchQueueRef.current.push(sample);
      await onLocationUpdate?.(driverId, sample.lat, sample.lng, telemetry);
      lastSentRef.current = {
        ...sample,
        fraudSignals,
      };
    } catch (err) {
      setError(err?.message || 'Location stream update failed');
    } finally {
      flushingRef.current = false;
    }
  }, [currentTrip?.assignmentId, currentTrip?.id, currentTrip?.status, driverId, enabled, onLocationUpdate, role]);

  const sendLastPosition = useCallback(() => {
    const sample = latestPositionRef.current;
    if (!enabled || !driverId || !sample) return;
    try {
      setDoc(doc(db, 'driver_locations', driverId), {
        lat: sample.lat,
        lng: sample.lng,
        accuracy: sample.accuracy,
        speedMph: sample.speedMph,
        heading: sample.heading,
        capturedAt: sample.capturedAt,
        clientTimeMs: Date.now(),
        tripId: currentTrip?.id || null,
        reason: 'page_unload',
        lastPingAt: new Date().toISOString(),
      }, { merge: true }).catch(() => undefined);
    } catch (_) {}
  }, [currentTrip?.id, driverId, enabled]);

  useEffect(() => {
    if (!enabled || !driverId || typeof navigator === 'undefined' || !navigator.geolocation) {
      onTrackingChange?.(false);
      return undefined;
    }

    let cancelled = false;
    let visibilityTimer = null;
    let capWatchId = null;

    const processPosition = (lat, lng, accuracy, altitude, speed, heading, timestamp) => {
      const capturedAt = new Date(timestamp || Date.now()).toISOString();
      const sample = {
        lat,
        lng,
        accuracy: accuracy ?? null,
        altitude: altitude ?? null,
        speedMph: metersPerSecondToMph(speed),
        heading: Number.isFinite(Number(heading)) ? Number(heading) : null,
        capturedAt,
        clientTimeMs: Date.now(),
      };
      latestPositionRef.current = sample;
      const ui = uiPositionRef.current;
      const movedMiles = ui.lat != null && sample.lat && sample.lng
        ? haversineMiles({ lat: ui.lat, lng: ui.lng }, { lat: sample.lat, lng: sample.lng })
        : Infinity;
      if (ui.at === 0 || Date.now() - ui.at >= 4000 || movedMiles > 0.012) {
        uiPositionRef.current = { at: Date.now(), lat: sample.lat, lng: sample.lng };
        onPositionChange?.({ lat: sample.lat, lng: sample.lng, accuracy: sample.accuracy });
      }
      onTrackingChange?.(true);
      setError('');

      const lastSent = lastSentRef.current;
      const lastSentMs = Date.parse(lastSent?.capturedAt || 0);
      const elapsedMs = Date.now() - lastSentMs;

      let shouldFlush = false;
      if (!Number.isFinite(lastSentMs) || elapsedMs >= 10000) {
        shouldFlush = true; // throttle time
      } else if (lastSent && sample.lat && sample.lng) {
        const dist = haversineMiles(
          { lat: lastSent.lat, lng: lastSent.lng },
          { lat: sample.lat, lng: sample.lng }
        );
        if (dist > 0.005) { // ~8 meters
          shouldFlush = true;
        }
      }

      if (shouldFlush && !document.hidden) {
        flushLatestPosition('gps').catch(() => undefined);
      }
    };

    const startWatching = async () => {
      // Try Capacitor native geolocation first (when running in Capacitor shell)
      const capGeo = getCapacitorGeolocation();
      if (capGeo) {
        try {
          const permResult = await capGeo.requestPermissions();
          if (permResult.location !== 'granted') {
            throw new Error('Capacitor location permission denied');
          }
          capWatchId = capGeo.watchPosition(
            { enableHighAccuracy: true, timeout: 10000 },
            (pos, err) => {
              if (err) {
                setError(err?.message || 'Capacitor GPS unavailable');
                onTrackingChange?.(false);
                return;
              }
              if (pos) {
                processPosition(
                  pos.latitude, pos.longitude,
                  pos.accuracy, pos.altitude,
                  pos.speed, pos.heading,
                  pos.timestamp
                );
              }
            }
          );
          return;
        } catch (_) {
          // Capacitor geo failed, fall through to browser API
        }
      }

      // Fallback: browser Geolocation API
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (navigator.permissions?.query) {
        navigator.permissions.query({ name: 'geolocation' })
          .then((result) => {
            if (!cancelled) onPermissionChange?.(result.state === 'granted');
          })
          .catch(() => undefined);
      }
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          processPosition(
            pos.coords.latitude, pos.coords.longitude,
            pos.coords.accuracy, pos.coords.altitude,
            pos.coords.speed, pos.coords.heading,
            pos.timestamp
          );
        },
        (err) => {
          setError(err?.message || 'GPS unavailable');
          onTrackingChange?.(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 1500,
        }
      );
    };

    startWatching();

    // Visibility change: re-acquire GPS immediately when tab becomes active
    const handleVisibility = () => {
      if (document.hidden) {
        sendLastPosition();
      } else {
        startWatching().catch(() => undefined);
        if (latestPositionRef.current) {
          flushLatestPosition('visibility').catch(() => undefined);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Before unload: send last known position
    const handleBeforeUnload = () => {
      sendLastPosition();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      cancelled = true;
      if (visibilityTimer) clearTimeout(visibilityTimer);
      if (capWatchId !== null) {
        const capGeo = getCapacitorGeolocation();
        capGeo?.clearWatch?.(capWatchId);
        capWatchId = null;
      }
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      onTrackingChange?.(false);
    };
  }, [driverId, enabled, flushLatestPosition, onPermissionChange, onPositionChange, onTrackingChange, sendLastPosition]);

  return {
    error,
    intervalMs: LOCATION_STREAM_INTERVAL_MS,
    batchIntervalMs: BATCH_FLUSH_INTERVAL_MS,
    trailIntervalMs: TRAIL_WRITE_INTERVAL_MS,
    lastSent: lastSentRef.current,
  };
}
