import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LOCATION_STREAM_INTERVAL_MS,
  buildLocationFraudSignals,
  metersPerSecondToMph,
} from '../utils/locationFraud';

const MOVEMENT_THRESHOLD_M = 30;
const BATTERY_SAVE_INTERVAL_MS = 10000;

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
  const stationaryCountRef = useRef(0);
  const lastSignificantPositionRef = useRef(null);

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

    const haversineMeters = (lat1, lng1, lat2, lng2) => {
      const R = 6371000;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const capturedAt = new Date(pos.timestamp || Date.now()).toISOString();
        const speedMph = metersPerSecondToMph(pos.coords.speed);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy ?? null;
        const sample = {
          lat, lng, accuracy,
          altitude: pos.coords.altitude ?? null,
          speedMph,
          heading: Number.isFinite(Number(pos.coords.heading)) ? Number(pos.coords.heading) : null,
          capturedAt,
          clientTimeMs: Date.now(),
        };
        latestPositionRef.current = sample;
        onPositionChange?.({ lat, lng, accuracy });
        onTrackingChange?.(true);
        setError('');

        const last = lastSignificantPositionRef.current;
        const dist = last ? haversineMeters(last.lat, last.lng, lat, lng) : MOVEMENT_THRESHOLD_M + 1;

        if (dist > MOVEMENT_THRESHOLD_M || speedMph > 3) {
          stationaryCountRef.current = 0;
          lastSignificantPositionRef.current = { lat, lng };
        } else {
          stationaryCountRef.current += 1;
        }

        const effectiveInterval = stationaryCountRef.current > 5 ? BATTERY_SAVE_INTERVAL_MS : LOCATION_STREAM_INTERVAL_MS;
        const lastSentMs = Date.parse(lastSentRef.current?.capturedAt || 0);
        if (!Number.isFinite(lastSentMs) || Date.now() - lastSentMs >= effectiveInterval) {
          flushLatestPosition(dist > MOVEMENT_THRESHOLD_M ? 'gps' : 'stationary').catch(() => undefined);
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
