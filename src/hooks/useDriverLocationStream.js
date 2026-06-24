import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LOCATION_STREAM_INTERVAL_MS,
  buildLocationFraudSignals,
  metersPerSecondToMph,
} from '../utils/locationFraud';

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

  useEffect(() => {
    if (!enabled || !driverId || typeof navigator === 'undefined' || !navigator.geolocation) {
      onTrackingChange?.(false);
      return undefined;
    }

    let cancelled = false;

    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: 'geolocation' })
        .then((result) => {
          if (!cancelled) onPermissionChange?.(result.state === 'granted');
        })
        .catch(() => undefined);
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const capturedAt = new Date(pos.timestamp || Date.now()).toISOString();
        const sample = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
          altitude: pos.coords.altitude ?? null,
          speedMph: metersPerSecondToMph(pos.coords.speed),
          heading: Number.isFinite(Number(pos.coords.heading)) ? Number(pos.coords.heading) : null,
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
      },
      (err) => {
        setError(err?.message || 'GPS unavailable');
        onTrackingChange?.(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 3000,
      }
    );

    const streamTimer = setInterval(() => {
      flushLatestPosition('interval').catch(() => undefined);
    }, LOCATION_STREAM_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(streamTimer);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      onTrackingChange?.(false);
    };
  }, [driverId, enabled, flushLatestPosition, onPermissionChange, onPositionChange, onTrackingChange]);

  return {
    error,
    intervalMs: LOCATION_STREAM_INTERVAL_MS,
    lastSent: lastSentRef.current,
  };
}

export default useDriverLocationStream;
