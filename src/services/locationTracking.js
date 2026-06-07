// Agape Care — Driver Location Streaming + Anti-Fraud Engine (Tasks 8 & 9)
import { collection, addDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { emitSystemEvent, SYSTEM_EVENT_TYPES } from './firestoreEventEngine';
import { COLLECTIONS } from '../config/firestoreSchema';

const IMPOSSIBLE_SPEED_MPH = 120;
const TELEPORT_MILES = 50; // 50 miles in < 60 seconds = fraud

const haversineDistanceMiles = (lat1, lon1, lat2, lon2) => {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export class LocationStreamer {
  constructor(driverId) {
    this.driverId = driverId;
    this.watchId = null;
    this.lastLocation = null;
    this.lastTime = null;
  }

  start() {
    if (!navigator.geolocation || this.watchId !== null) return;
    this.watchId = navigator.geolocation.watchPosition(
      (position) => this._handlePosition(position),
      (err) => console.warn('[LocationStreamer] GPS error:', err.message),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
  }

  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  async _handlePosition(position) {
    const { latitude, longitude, speed: rawSpeed, heading, accuracy } = position.coords;
    const now = Date.now();

    let speedMph = rawSpeed ? rawSpeed * 2.23694 : 0;
    let fraudFlags = [];

    if (this.lastLocation && this.lastTime) {
      const distMiles = haversineDistanceMiles(this.lastLocation.lat, this.lastLocation.lng, latitude, longitude);
      const elapsedHours = (now - this.lastTime) / 3600000;
      if (elapsedHours > 0 && !rawSpeed) {
        speedMph = distMiles / elapsedHours;
      }
      // Fraud: teleport detection
      if (distMiles > TELEPORT_MILES && (now - this.lastTime) < 60000) {
        fraudFlags.push('teleport_detected');
      }
    }

    // Fraud: impossible speed
    if (speedMph > IMPOSSIBLE_SPEED_MPH) {
      fraudFlags.push('impossible_speed');
    }

    const locationPayload = {
      driverId: this.driverId,
      lat: latitude,
      lng: longitude,
      speedMph: Math.round(speedMph * 10) / 10,
      heading: heading || null,
      accuracy: accuracy || null,
      timestamp: serverTimestamp(),
      timestampLocal: new Date().toISOString(),
    };

    try {
      // 1. Append to location log
      await addDoc(collection(db, COLLECTIONS.DRIVER_LOCATIONS), locationPayload);

      // 2. Update live location on driver doc
      await setDoc(doc(db, COLLECTIONS.DRIVERS, this.driverId), {
        currentLocation: {
          lat: latitude,
          lng: longitude,
          speedMph: locationPayload.speedMph,
          heading: heading || null,
          updatedAt: serverTimestamp(),
        },
        online: true,
      }, { merge: true });

      // 3. Emit event
      emitSystemEvent(SYSTEM_EVENT_TYPES.LOCATION_UPDATED, {
        driverId: this.driverId,
        lat: latitude,
        lng: longitude,
        speedMph: locationPayload.speedMph,
      });

      // 4. Handle fraud
      if (fraudFlags.length > 0) {
        await setDoc(doc(db, COLLECTIONS.DRIVERS, this.driverId), {
          fraudFlags,
          lastFraudDetectedAt: serverTimestamp(),
        }, { merge: true });
        emitSystemEvent(SYSTEM_EVENT_TYPES.FRAUD_DETECTED, {
          driverId: this.driverId,
          flags: fraudFlags,
          location: { lat: latitude, lng: longitude },
        });
        // Also emit audit log
        await addDoc(collection(db, COLLECTIONS.AUDIT_LOGS), {
          type: 'fraud_detected',
          driverId: this.driverId,
          flags: fraudFlags,
          location: { lat: latitude, lng: longitude },
          timestamp: serverTimestamp(),
        });
      }
    } catch (err) {
      console.error('[LocationStreamer] Write failed:', err);
    }

    this.lastLocation = { lat: latitude, lng: longitude };
    this.lastTime = now;
  }
}
