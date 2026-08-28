export const DEFAULT_MAINTENANCE_POLICY = Object.freeze({
  oilChangeIntervalMiles: 4000,
  oilDueSoonMiles: 500,
  filterChangeIntervalMonths: 12,
  filterDueSoonDays: 30,
});

import { tripCalendarDateKey } from './tripDate';

const numberOrNull = (value) => {
  const normalizedValue = String(value ?? '').replace(/,/g, '').trim();
  if (!normalizedValue) return null;
  const number = Number(normalizedValue);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const normalize = (value) => String(value || '').trim().toLowerCase();
const DAY_MS = 24 * 60 * 60 * 1000;

const dateOrNull = (value) => {
  if (!value) return null;
  const date = value?.toDate?.() || new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dateKey = (value) => {
  // Shared parser: pure dates stay verbatim; timestamped instants convert to
  // the LOCAL calendar day so evening events never land on "tomorrow" (UTC).
  return tripCalendarDateKey(value) || '';
};

// Calendar-date space: parse to LOCAL noon so month arithmetic and key
// round-trips are stable across DST and never shift a stored date by a day.
const calendarDate = (value) => {
  const key = tripCalendarDateKey(value);
  if (!key) return dateOrNull(value);
  const d = new Date(`${key}T12:00:00`);
  return Number.isNaN(d.getTime()) ? dateOrNull(value) : d;
};

const addMonths = (value, months) => {
  const date = new Date(value.getTime());
  date.setMonth(date.getMonth() + months);
  return date;
};

export function normalizeMaintenancePolicy(policy = {}) {
  return {
    oilChangeIntervalMiles: Math.max(500, numberOrNull(policy.oilChangeIntervalMiles) || DEFAULT_MAINTENANCE_POLICY.oilChangeIntervalMiles),
    oilDueSoonMiles: Math.max(50, numberOrNull(policy.oilDueSoonMiles) || DEFAULT_MAINTENANCE_POLICY.oilDueSoonMiles),
    filterChangeIntervalMonths: Math.max(1, numberOrNull(policy.filterChangeIntervalMonths) || DEFAULT_MAINTENANCE_POLICY.filterChangeIntervalMonths),
    filterDueSoonDays: Math.max(1, numberOrNull(policy.filterDueSoonDays) || DEFAULT_MAINTENANCE_POLICY.filterDueSoonDays),
  };
}

export function tripBelongsToVehicle(trip = {}, vehicle = {}, drivers = []) {
  if (!trip || !vehicle) return false;
  const vehicleId = normalize(vehicle.id);
  const vehicleName = normalize(vehicle.name);
  const explicitIds = [trip.vehicleId, trip.completedVehicleId, trip.assignedVehicleId].map(normalize).filter(Boolean);
  const explicitNames = [trip.completedVehicle, trip.vehicle, trip.vehicleName].map(normalize).filter(Boolean);
  if (explicitIds.length || explicitNames.length) {
    return Boolean((vehicleId && explicitIds.includes(vehicleId)) || (vehicleName && explicitNames.includes(vehicleName)));
  }

  // Legacy trips without a recorded vehicle can only be attributed through their driver.
  const driver = drivers.find((item) => item.id === trip.driverId || (trip.driverEmail && normalize(item.email) === normalize(trip.driverEmail)));
  return Boolean(driver && ((vehicleId && normalize(driver.vehicleId) === vehicleId) || (vehicleName && normalize(driver.vehicle) === vehicleName)));
}

export function deriveVehicleOdometer(vehicle = {}, trips = [], drivers = []) {
  const readings = [numberOrNull(vehicle.odometer)].filter((value) => value !== null);
  trips.forEach((trip) => {
    if (!tripBelongsToVehicle(trip, vehicle, drivers)) return;
    [trip.dropoffOdometer, trip.endOdometer, trip.endMileage, trip.odometer].forEach((value) => {
      const reading = numberOrNull(value);
      if (reading !== null && reading <= 10000000) readings.push(reading);
    });
  });
  return readings.length ? Math.max(...readings) : 0;
}

const oilState = (remaining) => {
  if (remaining < 0) return 'overdue';
  if (remaining === 0) return 'due';
  return 'healthy';
};

export const formatOilRemaining = (milesRemaining) => {
  const miles = Number(milesRemaining);
  if (!Number.isFinite(miles)) return 'Mileage unavailable';
  if (miles < 0) return `${Math.abs(miles).toLocaleString()} miles overdue`;
  if (miles === 0) return 'Oil change due now';
  return `${miles.toLocaleString()} miles remaining`;
};

export const formatFilterRemaining = (daysRemaining) => {
  if (daysRemaining === null || daysRemaining === undefined || daysRemaining === '') return 'Service baseline required';
  const days = Number(daysRemaining);
  if (!Number.isFinite(days)) return 'Service baseline required';
  if (days < 0) return `${Math.abs(days).toLocaleString()} days overdue`;
  if (days === 0) return 'Filter change due today';
  return `${days.toLocaleString()} days remaining`;
};

export function getVehicleMaintenanceStatus(vehicle = {}, trips = [], drivers = [], policy = {}, now = new Date()) {
  const defaults = normalizeMaintenancePolicy(policy);
  const odometer = deriveVehicleOdometer(vehicle, trips, drivers);
  const interval = Math.max(500, numberOrNull(vehicle.oilChangeIntervalMiles) || defaults.oilChangeIntervalMiles);
  const dueSoonMiles = Math.max(50, numberOrNull(vehicle.oilDueSoonMiles) || defaults.oilDueSoonMiles);
  const lastService = numberOrNull(vehicle.lastOilChangeOdometer);
  const explicitNext = numberOrNull(vehicle.nextOilChangeOdometer ?? vehicle.nextOilChange);
  const baseline = lastService ?? numberOrNull(vehicle.inServiceOdometer) ?? numberOrNull(vehicle.odometer) ?? 0;
  const nextService = explicitNext ?? (baseline + interval);
  const milesRemaining = nextService - odometer;
  const exactOilState = oilState(milesRemaining);
  const oilStatus = exactOilState === 'healthy' && milesRemaining <= dueSoonMiles ? 'due_soon' : exactOilState;

  const filterIntervalMonths = Math.max(1, numberOrNull(vehicle.filterChangeIntervalMonths) || defaults.filterChangeIntervalMonths);
  const filterDueSoonDays = Math.max(1, numberOrNull(vehicle.filterDueSoonDays) || defaults.filterDueSoonDays);
  const filterBaseline = calendarDate(vehicle.lastFilterChangeDate || vehicle.filterServiceDate);
  const filterNext = filterBaseline ? addMonths(filterBaseline, filterIntervalMonths) : null;
  const today = calendarDate(now) || new Date();
  const filterDaysRemaining = filterNext ? Math.ceil((filterNext.getTime() - today.getTime()) / DAY_MS) : null;
  const filterStatus = !filterBaseline
    ? 'setup_required'
    : filterDaysRemaining < 0
      ? 'overdue'
      : filterDaysRemaining === 0
        ? 'due'
        : filterDaysRemaining <= filterDueSoonDays ? 'due_soon' : 'healthy';

  const rank = { overdue: 5, due: 4, setup_required: 3, due_soon: 2, healthy: 1 };
  const status = rank[oilStatus] >= rank[filterStatus] ? oilStatus : filterStatus;
  return {
    odometer,
    status,
    attention: status !== 'healthy',
    interval,
    lastService,
    nextService,
    milesRemaining,
    oil: { status: oilStatus, intervalMiles: interval, dueSoonMiles, lastServiceOdometer: lastService, nextServiceOdometer: nextService, milesRemaining },
    filter: { status: filterStatus, intervalMonths: filterIntervalMonths, dueSoonDays: filterDueSoonDays, lastServiceDate: dateKey(filterBaseline), nextServiceDate: dateKey(filterNext), daysRemaining: filterDaysRemaining },
  };
}

export function summarizeFleetMaintenance(vehicles = [], trips = [], drivers = [], policy = {}, now = new Date()) {
  const records = vehicles.map((vehicle) => ({ vehicle, ...getVehicleMaintenanceStatus(vehicle, trips, drivers, policy, now) }));
  return {
    records,
    overdue: records.filter((item) => item.status === 'overdue').length,
    due: records.filter((item) => item.status === 'due').length,
    dueSoon: records.filter((item) => item.status === 'due_soon').length,
    setupRequired: records.filter((item) => item.status === 'setup_required').length,
    healthy: records.filter((item) => item.status === 'healthy').length,
    attention: records.filter((item) => item.attention).length,
  };
}
