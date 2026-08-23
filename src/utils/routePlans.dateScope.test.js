import { describe, expect, it } from 'vitest';
import {
  ROUTE_ASSIGNMENT_STATUS,
  normalizeRouteRecord,
  routeHasAssignedTripsForDriver,
} from './routePlans';

describe('route assignment service-date scope', () => {
  const driver = { id: 'driver-1', email: 'driver@example.com' };
  const route = {
    id: 'route-1',
    type: 'today',
    assignmentDate: '2026-08-14',
    assignmentStatus: ROUTE_ASSIGNMENT_STATUS.ASSIGNED,
    assignedDriver: driver.id,
    expiresAt: '2026-08-15T03:59:59.999Z',
    sequence: [{ clientId: 'trip-1', type: 'PU' }],
  };

  it('matches normalized ISO and Firestore Timestamp trip dates', () => {
    const isoTrip = {
      id: 'trip-1',
      date: '2026-08-14T10:30:00.000Z',
      status: 'Assigned',
      driverId: driver.id,
    };
    const timestampTrip = {
      ...isoTrip,
      date: { toDate: () => new Date(2026, 7, 14, 8, 30) },
    };

    expect(routeHasAssignedTripsForDriver(route, driver, [isoTrip])).toBe(true);
    expect(routeHasAssignedTripsForDriver(route, driver, [timestampTrip])).toBe(true);
  });

  it('normalizes a Firestore Timestamp assignment date before matching', () => {
    const timestampRoute = {
      ...route,
      assignmentDate: { toDate: () => new Date(2026, 7, 14, 12, 0) },
    };
    const trip = {
      id: 'trip-1',
      date: '2026-08-14',
      status: 'Assigned',
      driverId: driver.id,
    };

    expect(routeHasAssignedTripsForDriver(timestampRoute, driver, [trip])).toBe(true);
    expect(normalizeRouteRecord(timestampRoute, new Date(2026, 7, 13, 12, 0)).assignmentDate).toBe('2026-08-14');
  });

  it('fails closed for absent, invalid, or different trip service dates', () => {
    const baseTrip = { id: 'trip-1', status: 'Assigned', driverId: driver.id };

    expect(routeHasAssignedTripsForDriver(route, driver, [{ ...baseTrip, date: '2026-08-13' }])).toBe(false);
    expect(routeHasAssignedTripsForDriver(route, driver, [{ ...baseTrip, date: 'not-a-date' }])).toBe(false);
    expect(routeHasAssignedTripsForDriver(route, driver, [{ ...baseTrip, date: '2026-99-99' }])).toBe(false);
    expect(routeHasAssignedTripsForDriver(route, driver, [baseTrip])).toBe(false);

    const invalidRoute = { ...route, assignmentDate: '2026-99-99' };
    expect(routeHasAssignedTripsForDriver(invalidRoute, driver, [{ ...baseTrip, date: '2026-99-99' }])).toBe(false);
    expect(normalizeRouteRecord(invalidRoute, new Date(2026, 7, 13, 12, 0)).assignmentDate).toBeNull();

    const invalidManualRoute = {
      ...invalidRoute,
      sequence: [{ clientId: 'manual-stop', source: 'route-plan', address: 'Dispatch-entered stop' }],
    };
    expect(routeHasAssignedTripsForDriver(invalidManualRoute, driver, [])).toBe(false);
  });

  it('keeps an exact future-date override scheduled rather than expiring it early', () => {
    const normalized = normalizeRouteRecord(route, new Date(2026, 7, 13, 12, 0));

    expect(normalized.assignmentDate).toBe('2026-08-14');
    expect(normalized.isFutureAssignment).toBe(true);
    expect(normalized.isExpired).toBe(false);
    expect(normalized.isActiveToday).toBe(false);
    expect(normalized.statusLabel).toBe('Scheduled');
  });
});
