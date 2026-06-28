import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LOCATION_STREAM_INTERVAL_MS,
  buildLocationFraudSignals,
  metersPerSecondToMph,
} from '../utils/locationFraud';
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
  const lastTrailWriteRef = useRef(0);

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
      onPositionChange?.({ lat: sample.lat, lng: sample.lng, accuracy: sample.accuracy });
      onTrackingChange?.(true);
      setError('');

      const lastSentMs = Date.parse(lastSentRef.current?.capturedAt || 0);
      if (!Number.isFinite(lastSentMs) || Date.now() - lastSentMs >= LOCATION_STREAM_INTERVAL_MS) {
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

    const streamTimer = setInterval(() => {
      flushLatestPosition('interval').catch(() => undefined);
    }, LOCATION_STREAM_INTERVAL_MS);

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
      clearInterval(streamTimer);
      if (visibilityTimer) clearTimeout(visibilityTimer);
      if (capWatchId !== null) {
        const capGeo = getCapacitorGeolocation();
        capGeo?.clearWatch?.({ id: capWatchId });
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

export default useDriverLocationStream;
