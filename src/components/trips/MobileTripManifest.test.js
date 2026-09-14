import { describe, it, expect } from 'vitest';
import {
  TERMINAL_MANIFEST_STATUSES,
  getManifestStatusBadge,
  getTripCountdown,
  buildInlineTripActions,
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

describe('getManifestStatusBadge — canonical badges', () => {
  it('maps the working set without crashing on unknowns', () => {
    expect(getManifestStatusBadge('Unassigned')).toContain('rose');
    expect(getManifestStatusBadge('Assigned')).toContain('blue');
    expect(getManifestStatusBadge('En Route')).toContain('amber');
    expect(getManifestStatusBadge('In Transit')).toContain('amber');
    expect(getManifestStatusBadge('Completed')).toContain('emerald');
    expect(getManifestStatusBadge('Cancelled')).toContain('rose');
    expect(getManifestStatusBadge('No Show')).toContain('amber');
    expect(getManifestStatusBadge('Rerouted')).toContain('purple');
    expect(getManifestStatusBadge('Something New')).toContain('slate');
    expect(getManifestStatusBadge(undefined)).toContain('slate');
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

describe('buildInlineTripActions — role matrix', () => {
  const base = { driver: { id: 'd1', name: 'Ann' }, trip: trip() };
  const cbs = {
    onDrive: () => {},
    onAssign: () => {},
    onNavigate: () => {},
    onCall: () => {},
    onMessage: () => {},
    phone: '555',
  };

  it('driver gets Drive + comms, never assign', () => {
    const { primary, icons } = buildInlineTripActions({ ...base, role: 'driver', callbacks: cbs });
    expect(primary.id).toBe('drive');
    expect(primary.label).toBe('Drive');
    expect(icons.map(i => i.id).sort()).toEqual(['call', 'message', 'navigate']);
  });

  it('dispatcher gets Drive + assign path for assigned trips', () => {
    const { primary } = buildInlineTripActions({ ...base, role: 'dispatcher', callbacks: cbs });
    expect(primary.id).toBe('drive');
  });

  it('dispatcher gets assign CTA for unassigned trips', () => {
    const { primary } = buildInlineTripActions({ ...base, role: 'dispatcher', callbacks: cbs, driver: null });
    expect(primary.id).toBe('assign-drive');
  });

  it('hides Drive on terminal trips', () => {
    const { primary } = buildInlineTripActions({
      ...base, role: 'dispatcher', callbacks: cbs, trip: trip({ status: 'Completed' }),
    });
    expect(primary).toBeNull();
  });

  it('hides assign for non-operating roles', () => {
    const { primary } = buildInlineTripActions({ ...base, role: 'driver', callbacks: cbs, driver: null });
    expect(primary).toBeNull();
  });

  it('omits comm icons without phone or pickup', () => {
    const { icons } = buildInlineTripActions({
      ...base, role: 'driver', trip: trip({ pickup: '' }),
      callbacks: { onDrive: () => {} },
    });
    expect(icons).toEqual([]);
  });
});
