import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/ai', () => ({ analyzeActivityLogs: vi.fn() }));
vi.mock('../config/maps', () => ({ getDistanceMiles: vi.fn() }));

import { buildDriverLoads, buildHotspots } from '../utils/portalSelectors';

describe('command intelligence local selectors', () => {
  it('indexes active trips once while preserving exact id-or-email assignment semantics', () => {
    const nowMs = new Date(2026, 7, 11, 12, 0, 0, 0).getTime();
    const drivers = [
      { id: 'driver-a', email: 'a@example.com', name: 'A', status: 'Available' },
      { id: 'driver-b', email: 'b@example.com', name: 'B', status: 'Busy' },
    ];
    const trips = [
      { id: 'id-match', driverId: 'driver-a', driverEmail: 'other@example.com', time: '1:00 PM' },
      { id: 'email-match', driverId: 'other', driverEmail: 'a@example.com', time: '2:00 PM' },
      { id: 'both-match', driverId: 'driver-a', driverEmail: 'a@example.com', time: '11:00 AM' },
      { id: 'cross-match', driverId: 'driver-b', driverEmail: 'a@example.com', time: '3:00 PM' },
    ];

    const loads = buildDriverLoads(trips, drivers, nowMs);

    expect(loads.map(load => ({ id: load.id, count: load.assignedCount }))).toEqual([
      { id: 'driver-a', count: 4 },
      { id: 'driver-b', count: 1 },
    ]);
    expect(loads[0].nextTrip.id).toBe('both-match');
  });

  it('does not rescan every active trip for every driver', () => {
    let assignmentReads = 0;
    const trips = Array.from({ length: 500 }, (_, index) => {
      const trip = { id: `trip-${index}`, time: 'WILL CALL' };
      Object.defineProperties(trip, {
        driverId: { enumerable: true, get: () => { assignmentReads += 1; return `missing-${index}`; } },
        driverEmail: { enumerable: true, get: () => { assignmentReads += 1; return `missing-${index}@example.com`; } },
      });
      return trip;
    });
    const drivers = Array.from({ length: 100 }, (_, index) => ({
      id: `driver-${index}`,
      email: `driver-${index}@example.com`,
      status: 'Available',
    }));

    buildDriverLoads(trips, drivers, Date.now());

    expect(assignmentReads).toBe(trips.length * 2);
  });

  it('does not treat two missing identities as an exact driver assignment', () => {
    const drivers = [
      { id: undefined, email: '', name: 'Unlinked profile', status: 'Available' },
      { name: 'Legacy profile', status: 'Available' },
    ];
    const trips = [
      { id: 'unassigned', status: 'Unassigned', time: 'WILL CALL' },
      { id: 'blank', driverId: '', driverEmail: '   ', time: 'WILL CALL' },
    ];

    const loads = buildDriverLoads(trips, drivers, Date.now());

    expect(loads.every(load => load.assignedCount === 0)).toBe(true);
  });

  it('uses constant-time late membership while retaining hotspot ranking', () => {
    const lateTrip = { id: 'late', pickup: '100 Main St, Indianapolis', status: 'Assigned' };
    const unassignedTrip = { id: 'open', pickup: '200 Main St, Indianapolis', status: 'Unassigned' };
    const otherTrip = { id: 'other', pickup: '300 Oak Ave, Carmel', status: 'Assigned' };
    const lateTrips = [lateTrip];
    lateTrips.includes = () => { throw new Error('linear includes lookup must not be used'); };

    const hotspots = buildHotspots([lateTrip, unassignedTrip, otherTrip], lateTrips);

    expect(hotspots).toEqual([
      { zone: 'Main St', count: 2, late: 1, unassigned: 1 },
      { zone: 'Oak Ave', count: 1, late: 0, unassigned: 0 },
    ]);
  });
});
