import { describe, it, expect } from 'vitest';
import {
  TERMINAL_MANIFEST_STATUSES,
  getManifestStatusBadge,
  getManifestDisplayStatus,
  getTripCountdown,
  buildInlineTripActions,
  getManifestAddressLines,
  getOnTimeStats,
  isActiveManifestTrip,
  isCompletedManifestTrip,
} from './MobileTripManifest';

const NOON = new Date('2026-09-13T12:00:00');

const trip = (over = {}) => ({
  id: 't1',
  patient: 'Jane',
  date: '2026-09-13',
  time: '14:00',
  status: 'Assigned',
  pickup: 'A',
  dropoff: 'B',
  ...over,
});

describe('getManifestStatusBadge — design tokens', () => {
  it('maps the design badge set with normalized keys and slate fallback', () => {
    expect(getManifestStatusBadge('Completed')).toContain('emerald');
    expect(getManifestStatusBadge('In Transit')).toContain('blue');
    expect(getManifestStatusBadge('En Route')).toContain('amber');
    expect(getManifestStatusBadge('Unassigned')).toContain('rose');
    expect(getManifestStatusBadge('No Show')).toContain('orange');
    expect(getManifestStatusBadge('no show')).toContain('orange');
    expect(getManifestStatusBadge('Rerouted')).toContain('purple');
    expect(getManifestStatusBadge('Trip rerouted')).toContain('purple');
    expect(getManifestStatusBadge('Cancelled')).toContain('slate');
    expect(getManifestStatusBadge('Assigned')).toContain('blue');
    expect(getManifestStatusBadge('In Progress')).toContain('blue');
    expect(getManifestStatusBadge('At Pickup')).toContain('emerald');
    expect(getManifestStatusBadge('Navigating Pickup')).toContain('blue');
    expect(getManifestStatusBadge('Arrived')).toContain('emerald');
    expect(getManifestStatusBadge('Something New')).toContain('slate');
    expect(getManifestStatusBadge(undefined)).toContain('slate');
  });
});

describe('manifest card data formatting', () => {
  it('splits a comma-delimited address without inventing a city', () => {
    expect(getManifestAddressLines('8402 Harcourt Rd, Indianapolis, IN 46260')).toEqual({
      street: '8402 Harcourt Rd',
      locality: 'Indianapolis, IN 46260',
    });
    expect(getManifestAddressLines('8402 Harcourt Rd')).toEqual({ street: '8402 Harcourt Rd', locality: '' });
  });

  it('uses explicit locality data and normalizes KPI status casing', () => {
    expect(getManifestAddressLines({ address: '8402 Harcourt Rd', city: 'Indianapolis' })).toEqual({
      street: '8402 Harcourt Rd',
      locality: 'Indianapolis',
    });
    expect(isActiveManifestTrip({ status: 'IN TRANSIT' })).toBe(true);
    expect(isActiveManifestTrip({ status: 'Transferred' })).toBe(false);
    expect(isCompletedManifestTrip({ status: 'completed' })).toBe(true);
    expect(isCompletedManifestTrip({ status: 'Assigned', completedAt: '2026-09-13T15:00:00Z' })).toBe(true);
    expect(getManifestDisplayStatus({ status: 'Assigned', completedAt: '2026-09-13T15:00:00Z' })).toBe('Completed');
    expect(getManifestDisplayStatus({ status: 'Cancelled', completedAt: '2026-09-13T15:00:00Z' })).toBe('Cancelled');
  });

  it('does not duplicate an explicit city already present in the raw address', () => {
    expect(getManifestAddressLines('8402 Harcourt Rd, Indianapolis, IN 46260', 'Indianapolis')).toEqual({
      street: '8402 Harcourt Rd',
      locality: 'Indianapolis, IN 46260',
    });
  });
});

describe('getTripCountdown — deterministic urgency', () => {
  it('marks terminal statuses done regardless of time', () => {
    for (const status of TERMINAL_MANIFEST_STATUSES) {
      expect(getTripCountdown(trip({ status }), NOON).level).toBe('done');
    }
  });

  it('labels Will Call without guessing a time', () => {
    const cd = getTripCountdown(trip({ time: 'Will Call' }), NOON);
    expect(cd.level).toBe('unscheduled');
    expect(cd.label).toBe('Will Call');
    expect(cd.minutes).toBeNull();
  });

  it('labels missing/unparseable times unscheduled', () => {
    expect(getTripCountdown(trip({ time: '' }), NOON).level).toBe('unscheduled');
    expect(getTripCountdown(trip({ time: 'sometime' }), NOON).level).toBe('unscheduled');
  });

  it('fails closed when the service date is missing', () => {
    expect(getTripCountdown(trip({ date: '' }), NOON)).toMatchObject({
      minutes: null,
      level: 'unscheduled',
      label: 'Date needed',
    });
  });

  it('computes bands from real clock math', () => {
    expect(getTripCountdown(trip({ time: '12:00' }), NOON)).toMatchObject({ level: 'critical', minutes: 0 });
    expect(getTripCountdown(trip({ time: '12:15' }), NOON).level).toBe('critical');
    expect(getTripCountdown(trip({ time: '12:45' }), NOON)).toMatchObject({ level: 'soon', minutes: 45 });
    expect(getTripCountdown(trip({ time: '14:00' }), NOON)).toMatchObject({ level: 'later', minutes: 120 });
    expect(getTripCountdown(trip({ time: '11:30' }), NOON).level).toBe('overdue');
  });

  it('formats long waits as hours', () => {
    expect(getTripCountdown(trip({ time: '14:00' }), NOON).label).toBe('2h away');
    expect(getTripCountdown(trip({ time: '14:30' }), NOON).label).toBe('2h 30m away');
  });
});

describe('getOnTimeStats — honest metric, never invented', () => {
  const done = (time, arrivalTime) => ({ status: 'Completed', time, arrivalTime });

  it('scores arrivals within grace as on-time', () => {
    const stats = getOnTimeStats([done('09:00', '09:10'), { ...done('10:00', '10:00'), status: 'completed' }]);
    expect(stats).toMatchObject({ eligible: 2, rate: 100 });
    expect(stats.lateTrips).toEqual([]);
  });

  it('flags arrivals past grace and sorts worst first', () => {
    const stats = getOnTimeStats([done('09:00', '09:40'), done('10:00', '10:20'), done('11:00', '11:05')]);
    expect(stats.eligible).toBe(3);
    expect(stats.rate).toBe(33);
    expect(stats.lateTrips.map(e => e.lateBy)).toEqual([40, 20]);
  });

  it('excludes non-completed and timestamp-missing trips without guessing', () => {
    const stats = getOnTimeStats([
      { status: 'Assigned', time: '09:00', arrivalTime: '09:00' },
      { status: 'Completed', time: 'Will Call', arrivalTime: '09:00' },
      { status: 'Completed', time: '09:00', arrivalTime: '' },
      done('09:00', '09:05'),
    ]);
    expect(stats).toMatchObject({ eligible: 1, rate: 100 });
  });

  it('returns null rate (not 0, not 100) when nothing is eligible', () => {
    expect(getOnTimeStats([])).toMatchObject({ eligible: 0, rate: null });
    expect(getOnTimeStats([{ status: 'Assigned' }]).rate).toBeNull();
  });
});

describe('buildInlineTripActions — role matrix', () => {
  const base = { driver: { id: 'd1', name: 'Ann' }, trip: trip() };
  const cbs = {
    onDrive: () => {},
    onAssign: () => {},
    onReassign: () => {},
    onArchive: () => {},
    onNavigate: () => {},
    onCall: () => {},
    onMessage: () => {},
    phone: '555',
  };

  it('driver gets Drive + comms, never reassign/archive', () => {
    const { primary, icons, reassign, archive } = buildInlineTripActions({ ...base, role: 'driver', callbacks: cbs });
    expect(primary.id).toBe('drive');
    expect(primary.label).toBe('Drive');
    expect(icons.map(i => i.id).sort()).toEqual(['call', 'message']);
    expect(reassign).toBeNull();
    expect(archive).toBeNull();
  });

  it('dispatcher gets Drive + reassign + archive for assigned trips', () => {
    const { primary, icons, reassign, archive } = buildInlineTripActions({ ...base, role: 'dispatcher', callbacks: cbs });
    expect(primary.id).toBe('drive');
    expect(icons.map(i => i.id).sort()).toEqual(['call', 'message']);
    expect(reassign?.id).toBe('reassign');
    expect(archive?.id).toBe('archive');
  });

  it('dispatcher gets assign CTA for unassigned trips', () => {
    const { primary } = buildInlineTripActions({ ...base, role: 'dispatcher', callbacks: cbs, driver: null });
    expect(primary.id).toBe('assign-drive');
  });

  it('Drive stays available on terminal trips (opens progress read-only)', () => {
    const { primary } = buildInlineTripActions({
      ...base, role: 'dispatcher', callbacks: cbs, trip: trip({ status: 'Completed' }),
    });
    expect(primary?.id).toBe('drive');
  });

  it('reassign hides on terminal trips; archive does not', () => {
    const { reassign, archive } = buildInlineTripActions({
      ...base, role: 'dispatcher', callbacks: cbs, trip: trip({ status: 'Completed' }),
    });
    expect(reassign).toBeNull();
    expect(archive?.id).toBe('archive');
  });

  it('hides assign for non-operating roles', () => {
    const { primary, icons } = buildInlineTripActions({ ...base, role: 'driver', callbacks: cbs, driver: null });
    expect(primary).toBeNull();
    expect(icons).toEqual([]);
  });

  it('omits comm icons without phone or pickup', () => {
    const { icons } = buildInlineTripActions({
      ...base, role: 'driver', trip: trip({ pickup: '' }),
      callbacks: { onDrive: () => {} },
    });
    expect(icons).toEqual([]);
  });
});
