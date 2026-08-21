import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_LEG_MILES,
  ODOMETER_MAX_READING,
  deriveVehicleOdometerState,
  evaluateOdometerEntry,
  normalizeOdometerReading,
} from './vehicleOdometer';

describe('normalizeOdometerReading', () => {
  it('parses digits with thousands separators', () => {
    expect(normalizeOdometerReading('45,230')).toBe(45230);
    expect(normalizeOdometerReading(' 45230 ')).toBe(45230);
    expect(normalizeOdometerReading(45230)).toBe(45230);
  });

  it('rejects malformed, zero, and implausible readings', () => {
    expect(normalizeOdometerReading('')).toBeNull();
    expect(normalizeOdometerReading('12a4')).toBeNull();
    expect(normalizeOdometerReading('-500')).toBeNull();
    expect(normalizeOdometerReading('45.2')).toBeNull();
    expect(normalizeOdometerReading(0)).toBeNull();
    expect(normalizeOdometerReading(ODOMETER_MAX_READING + 1)).toBeNull();
  });
});

describe('deriveVehicleOdometerState', () => {
  it('resolves the same global reading for a shared vehicle regardless of which driver asks', () => {
    const vehicle = { id: 'V1', name: 'Van 1', odometer: 45310, odometerUpdatedAt: '2026-08-20T15:00:00Z' };
    const drivers = [
      { id: 'D1', vehicleId: 'V1', vehicle: 'Van 1' },
      { id: 'D2', vehicleId: 'V1', vehicle: 'Van 1' },
    ];
    // Driver A's completed trip is not visible in driver B's scoped list.
    const driverAScope = [{ id: 'T1', driverId: 'D1', vehicleId: 'V1', dropoffOdometer: 45310 }];
    const driverBScope = [];
    const stateA = deriveVehicleOdometerState({ vehicle, trips: driverAScope, drivers });
    const stateB = deriveVehicleOdometerState({ vehicle, trips: driverBScope, drivers });
    expect(stateA.miles).toBe(45310);
    expect(stateB.miles).toBe(45310);
  });

  it('counts an in-progress pickup reading so the next leg never sees an old number', () => {
    const vehicle = { id: 'V1', name: 'Van 1', odometer: 45000 };
    const trips = [{
      id: 'T2',
      vehicleId: 'V1',
      status: 'In Progress',
      pickupOdometer: 45120,
      arrivalTime: '2026-08-20T14:00:00Z',
    }];
    const state = deriveVehicleOdometerState({ vehicle, trips, drivers: [] });
    expect(state.miles).toBe(45120);
    expect(state.source).toBe('trip_pickup');
    expect(state.sourceTripId).toBe('T2');
  });

  it('prefers the highest reading and reports its source trip', () => {
    const vehicle = { id: 'V1', name: 'Van 1', odometer: 1000 };
    const trips = [
      { id: 'T1', completedVehicle: 'Van 1', dropoffOdometer: 1500, completedAt: '2026-08-19T18:00:00Z' },
      { id: 'T2', completedVehicle: 'Van 1', dropoffOdometer: 1325, completedAt: '2026-08-20T18:00:00Z' },
    ];
    const state = deriveVehicleOdometerState({ vehicle, trips, drivers: [] });
    expect(state.miles).toBe(1500);
    expect(state.sourceTripId).toBe('T1');
  });

  it('never attributes another vehicle\'s trips to this vehicle', () => {
    const vehicle = { id: 'V2', name: 'Van 2', odometer: 2000 };
    const trips = [{ id: 'T9', vehicleId: 'V1', completedVehicle: 'Van 1', dropoffOdometer: 90000 }];
    const state = deriveVehicleOdometerState({ vehicle, trips, drivers: [] });
    expect(state.miles).toBe(2000);
    expect(state.source).toBe('vehicle_record');
  });

  it('returns a zero state when nothing is known', () => {
    const state = deriveVehicleOdometerState({ vehicle: {}, trips: [], drivers: [] });
    expect(state.miles).toBe(0);
    expect(state.source).toBe('');
  });
});

describe('evaluateOdometerEntry', () => {
  const baseline = 45230;

  it('accepts a normal forward reading without warnings', () => {
    const result = evaluateOdometerEntry({ raw: '45310', baselineMiles: baseline, pickupOdometer: 45250 });
    expect(result.status).toBe('ok');
    expect(result.value).toBe(45310);
    expect(result.distance).toBe(60);
    expect(result.warnings).toHaveLength(0);
  });

  it('blocks non-numeric input instead of coercing it', () => {
    const result = evaluateOdometerEntry({ raw: '45o3', baselineMiles: baseline });
    expect(result.status).toBe('invalid');
    expect(result.value).toBeNull();
  });

  it('blocks a final reading lower than the trip pickup odometer', () => {
    const result = evaluateOdometerEntry({ raw: '45200', baselineMiles: baseline, pickupOdometer: 45250 });
    expect(result.status).toBe('blocked');
    expect(result.errors[0]).toContain('pickup odometer');
  });

  it('requires confirmation below the last verified vehicle reading', () => {
    const result = evaluateOdometerEntry({ raw: String(baseline - 10), baselineMiles: baseline });
    expect(result.status).toBe('confirm');
    expect(result.warnings[0]).toContain('below the last verified reading');
  });

  it('requires confirmation when one leg implies an implausible distance', () => {
    const result = evaluateOdometerEntry({
      raw: String(baseline + DEFAULT_MAX_LEG_MILES + 100),
      baselineMiles: baseline,
      pickupOdometer: baseline,
    });
    expect(result.status).toBe('confirm');
    expect(result.warnings.some((warning) => warning.includes('unusually high'))).toBe(true);
  });

  it('flags suspicious repeated-digit entries as likely typos', () => {
    const result = evaluateOdometerEntry({ raw: '15555', baselineMiles: 11000 });
    expect(result.status).toBe('confirm');
    expect(result.warnings.some((warning) => warning.includes('identical digits'))).toBe(true);
  });

  it('rejects readings above the mechanical plausibility ceiling', () => {
    const result = evaluateOdometerEntry({ raw: String(ODOMETER_MAX_READING + 5), baselineMiles: baseline });
    expect(result.status).toBe('invalid');
  });

  it('reports empty input distinctly so the UI can prompt instead of erroring', () => {
    const result = evaluateOdometerEntry({ raw: '', baselineMiles: baseline });
    expect(result.status).toBe('empty');
  });
});
