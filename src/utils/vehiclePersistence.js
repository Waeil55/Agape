/**
 * Vehicle Persistence Utility for Agape Care
 * Ensures assigned vehicles are permanently remembered across sessions, reloads, offline states, and trip completion workflows.
 */

const STORAGE_PREFIX_ID = 'agape_assigned_veh_id_';
const STORAGE_PREFIX_EMAIL = 'agape_assigned_veh_email_';

// In-memory fallback for environments where window.localStorage is unavailable (Node/testing)
const memoryStore = new Map();

const getStorage = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage;
  }
  return {
    getItem: (key) => memoryStore.get(key) || null,
    setItem: (key, val) => memoryStore.set(key, String(val)),
    removeItem: (key) => memoryStore.delete(key),
    clear: () => memoryStore.clear(),
  };
};

const normalizeKey = (val) => String(val || '').trim().toLowerCase();

/**
 * Save an assigned vehicle to persistent localStorage / storage engine.
 * @param {string} driverIdOrEmail - Driver ID or Email
 * @param {string} vehicleName - Vehicle identifier/name (e.g. 'Prius #350025')
 */
export function saveAssignedVehicle(driverIdOrEmail, vehicleName) {
  if (!vehicleName || typeof vehicleName !== 'string') return;
  const cleanedVehicle = vehicleName.trim();
  if (
    !cleanedVehicle ||
    cleanedVehicle.toLowerCase() === 'pending' ||
    cleanedVehicle.toLowerCase() === 'pending assignment' ||
    cleanedVehicle.toLowerCase() === 'no vehicle'
  ) return;

  try {
    const store = getStorage();
    const key = normalizeKey(driverIdOrEmail);
    if (key) {
      if (key.includes('@')) {
        store.setItem(`${STORAGE_PREFIX_EMAIL}${key}`, cleanedVehicle);
      } else {
        store.setItem(`${STORAGE_PREFIX_ID}${key}`, cleanedVehicle);
      }
    }
  } catch (err) {
    console.warn('[vehiclePersistence] Failed to write to storage:', err);
  }
}

/**
 * Retrieve saved vehicle from storage engine.
 * @param {string} driverIdOrEmail
 * @returns {string} Remembered vehicle or empty string
 */
export function getAssignedVehicle(driverIdOrEmail) {
  try {
    const store = getStorage();
    const key = normalizeKey(driverIdOrEmail);
    if (!key) return '';

    if (key.includes('@')) {
      const byEmail = store.getItem(`${STORAGE_PREFIX_EMAIL}${key}`);
      if (byEmail) return byEmail;
    } else {
      const byId = store.getItem(`${STORAGE_PREFIX_ID}${key}`);
      if (byId) return byId;
    }

    return '';
  } catch (err) {
    return '';
  }
}

export function clearAssignedVehicle(driverIdOrEmail) {
  try {
    const store = getStorage();
    const key = normalizeKey(driverIdOrEmail);
    if (!key) return;
    store.removeItem(`${key.includes('@') ? STORAGE_PREFIX_EMAIL : STORAGE_PREFIX_ID}${key}`);
  } catch (err) {
    console.warn('[vehiclePersistence] Failed to clear stored assignment:', err);
  }
}

export function planVehicleAssignment(drivers = [], vehicles = [], driverId, vehicleName = '') {
  const driver = drivers.find(item => item.id === driverId);
  if (!driver) throw new Error('The selected driver no longer exists.');
  const normalizedName = String(vehicleName || '').trim();
  const vehicle = normalizedName
    ? vehicles.find(item => String(item.name || '').trim().toLowerCase() === normalizedName.toLowerCase())
    : null;
  if (normalizedName && !vehicle) throw new Error('The selected vehicle no longer exists.');

  const nextDrivers = drivers.map(item => {
    const occupiesSelected = normalizedName
      && String(item.vehicle || '').trim().toLowerCase() === normalizedName.toLowerCase();
    if (item.id === driverId) {
      return { ...item, vehicle: normalizedName, vehicleId: vehicle?.id || '' };
    }
    return occupiesSelected ? { ...item, vehicle: '', vehicleId: '' } : item;
  });
  const nextVehicles = vehicles.map(item => {
    const isSelected = vehicle && item.id === vehicle.id;
    const wasOwnedByDriver = item.driverId === driverId || item.assignedDriver === driverId;
    const occupantWasCleared = Boolean(
      item.driverId && nextDrivers.some(candidate => candidate.id === item.driverId && !candidate.vehicle),
    );
    if (isSelected) return { ...item, driverId, assignedDriver: driverId };
    if (wasOwnedByDriver || occupantWasCleared) return { ...item, driverId: '', assignedDriver: '' };
    return item;
  });
  return { nextDrivers, nextVehicles, vehicle };
}

/**
 * Intelligently resolves a driver's vehicle by checking profile properties first,
 * then falling back to remembered persistent storage.
 * @param {Object} driver - Driver profile object
 * @param {string} fallbackEmail - Current user email or ID
 * @returns {string} Resolved vehicle name
 */
export function resolveDriverVehicle(driver = {}, fallbackEmail = '') {
  const explicitVehicle =
    driver?.vehicle ||
    driver?.assignedVehicle ||
    driver?.completedVehicle ||
    driver?.vehicleName ||
    driver?.vehicleId ||
    '';

  if (
    explicitVehicle &&
    typeof explicitVehicle === 'string' &&
    explicitVehicle.trim() !== '' &&
    explicitVehicle.toLowerCase() !== 'pending' &&
    explicitVehicle.toLowerCase() !== 'pending assignment' &&
    explicitVehicle.toLowerCase() !== 'no vehicle' &&
    explicitVehicle.toLowerCase() !== 'n/a'
  ) {
    saveAssignedVehicle(driver?.id || driver?.email || fallbackEmail, explicitVehicle);
    return explicitVehicle.trim();
  }

  const remembered =
    getAssignedVehicle(driver?.id) ||
    getAssignedVehicle(driver?.email) ||
    getAssignedVehicle(fallbackEmail);

  return remembered || '';
}

/**
 * Resolves the vehicle for a trip, auto-filling from driver's vehicle if trip lacks explicit completedVehicle.
 * @param {Object} trip
 * @param {Object} driver
 * @returns {string} Vehicle name for the trip
 */
export function resolveTripVehicle(trip = {}, driver = {}) {
  const tripVehicle =
    trip?.completedVehicle ||
    trip?.vehicle ||
    trip?.vehicleName ||
    trip?.vehicleId ||
    '';

  if (
    tripVehicle &&
    typeof tripVehicle === 'string' &&
    tripVehicle.trim() !== '' &&
    tripVehicle.toLowerCase() !== 'pending' &&
    tripVehicle.toLowerCase() !== 'pending assignment'
  ) {
    return tripVehicle.trim();
  }

  return resolveDriverVehicle(driver, trip?.driverEmail || trip?.driverId);
}

/**
 * Clear cached persistence storage (for testing purposes).
 */
export function clearVehiclePersistence() {
  try {
    const store = getStorage();
    if (store && typeof store.clear === 'function') {
      store.clear();
    }
  } catch (e) {
    memoryStore.clear();
  }
}
