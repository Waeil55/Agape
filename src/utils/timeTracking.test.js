import { describe, expect, it } from 'vitest';
import {
  POLICY_MODES,
  buildTimeEvents,
  generatePayrollOutput,
  stitchSessions,
  validateTimeEventSequence,
} from './timeTracking';

const event = (type, timestamp) => ({ type, timestamp });

describe('payroll time ledger', () => {
  it('calculates a shift with a break from exact timestamps', () => {
    const ledger = stitchSessions([
      event('IN', '2026-07-27T08:00:00.000-04:00'),
      event('BREAK_START', '2026-07-27T12:00:00.000-04:00'),
      event('BREAK_END', '2026-07-27T12:30:00.000-04:00'),
      event('OUT', '2026-07-27T17:00:00.000-04:00'),
    ], { now: '2026-07-27T17:00:00.000-04:00' });

    expect(ledger.totalBillableMilliseconds).toBe(510 * 60000);
    expect(ledger.sessions[0].breakMilliseconds).toBe(30 * 60000);
  });

  it('adds exact break milliseconds and rounds only payroll output', () => {
    const ledger = stitchSessions([
      event('IN', '2026-07-27T08:00:00.000Z'),
      event('BREAK_START', '2026-07-27T09:00:10.000Z'),
      event('BREAK_END', '2026-07-27T09:01:00.000Z'),
      event('BREAK_START', '2026-07-27T10:00:00.000Z'),
      event('BREAK_END', '2026-07-27T10:00:50.000Z'),
      event('OUT', '2026-07-27T11:00:00.000Z'),
    ]);
    const payroll = generatePayrollOutput({ ...ledger, date: '2026-07-27', policyMode: POLICY_MODES.PAY_FROM_HOME }, 20);

    expect(ledger.sessions[0].breakMilliseconds).toBe(100000);
    expect(payroll.payTime.billableMinutes).toBe(178);
    expect(payroll.payTime.totalPay).toBeCloseTo(59.44, 2);
  });

  it('deducts an active pause from an open shift', () => {
    const ledger = stitchSessions([
      event('IN', '2026-07-27T08:00:00.000Z'),
      event('BREAK_START', '2026-07-27T09:00:00.000Z'),
    ], { now: '2026-07-27T10:00:00.000Z' });

    expect(ledger.totalBillableMinutes).toBe(60);
    expect(ledger.sessions[0].breakMinutes).toBe(60);
    expect(ledger.sessions[0].isOpen).toBe(true);
  });

  it('never expands a historical missing clock-out through the export date', () => {
    const ledger = stitchSessions([
      event('IN', '2026-07-21T05:02:00.000-04:00'),
    ], { now: '2026-08-02T12:00:00.000-04:00', requireClosed: true });

    expect(ledger.totalBillableMinutes).toBe(0);
    expect(ledger.anomalies.map((item) => item.code)).toContain('OPEN_SHIFT');
  });

  it('blocks implausibly long shifts and breaks from payroll approval', () => {
    const ledger = stitchSessions([
      event('IN', '2026-07-20T04:18:00.000-04:00'),
      event('BREAK_START', '2026-07-20T05:00:00.000-04:00'),
      event('BREAK_END', '2026-07-20T18:00:00.000-04:00'),
      event('OUT', '2026-07-20T18:20:00.000-04:00'),
    ]);

    expect(ledger.anomalies.map((item) => item.code)).toContain('EXCESSIVE_BREAK');
  });

  it('does not double-deduct duplicate pause or resume events', () => {
    const events = [
      event('IN', '2026-07-27T08:00:00.000Z'),
      event('BREAK_START', '2026-07-27T09:00:00.000Z'),
      event('BREAK_START', '2026-07-27T09:05:00.000Z'),
      event('BREAK_END', '2026-07-27T09:30:00.000Z'),
      event('BREAK_END', '2026-07-27T09:35:00.000Z'),
      event('OUT', '2026-07-27T10:00:00.000Z'),
    ];
    const ledger = stitchSessions(events);

    expect(ledger.sessions[0].breakMinutes).toBe(30);
    expect(ledger.totalBillableMinutes).toBe(90);
    expect(ledger.anomalies.map((item) => item.code)).toEqual(expect.arrayContaining(['DUPLICATE_BREAK_START', 'ORPHAN_BREAK_END']));
  });

  it('supports multiple work sessions without combining their breaks', () => {
    const ledger = stitchSessions([
      event('IN', '2026-07-27T06:00:00.000Z'), event('OUT', '2026-07-27T08:00:00.000Z'),
      event('IN', '2026-07-27T12:00:00.000Z'), event('OUT', '2026-07-27T15:00:00.000Z'),
    ]);
    expect(ledger.sessions).toHaveLength(2);
    expect(ledger.totalBillableMinutes).toBe(300);
  });

  it('flags invalid administrator corrections', () => {
    const validation = validateTimeEventSequence([
      event('BREAK_END', '2026-07-27T09:00:00.000Z'),
      event('OUT', '2026-07-27T10:00:00.000Z'),
    ]);
    expect(validation.valid).toBe(false);
    expect(validation.anomalies.map((item) => item.code)).toEqual(expect.arrayContaining(['ORPHAN_BREAK_END', 'ORPHAN_CLOCK_OUT']));
  });

  it('uses home as the default automatic anchor', () => {
    const model = buildTimeEvents([
      { id: 'trip-1', date: '2026-07-27', startedAt: '2026-07-27T12:00:00.000Z', pickupLat: 39.80, pickupLng: -86.10 },
    ], { id: 'driver-1', homeLat: 39.70, homeLng: -86.20 }, [], undefined, {
      date: '2026-07-27', now: '2026-07-27T18:00:00.000Z',
    });
    const clockIn = model.events.find((item) => item.type === 'AUTO_CLOCK_IN');
    expect(model.policyMode).toBe(POLICY_MODES.PAY_FROM_HOME);
    expect(clockIn.anchorType).toBe('HOME');
    expect(new Date(clockIn.timestamp).getTime()).toBeLessThan(new Date('2026-07-27T12:00:00.000Z').getTime());
  });

  it('replaces duplicate driver punches with one trip-authoritative shift', () => {
    const model = buildTimeEvents([
      {
        id: 'trip-1',
        date: '2026-08-03',
        status: 'Completed',
        arrivalTime: '2026-08-03T08:00:00.000-04:00',
        departedPickupTime: '2026-08-03T08:05:00.000-04:00',
        arrivalDropoffTime: '2026-08-03T09:00:00.000-04:00',
        completedAt: '2026-08-03T09:02:00.000-04:00',
      },
    ], { id: 'driver-1' }, [
      event('IN', '2026-08-03T07:40:00.000-04:00'),
      event('AUTO_IN', '2026-08-03T07:41:00.000-04:00'),
      event('IN', '2026-08-03T07:42:00.000-04:00'),
    ], POLICY_MODES.PAY_FROM_FIRST_PICKUP, {
      date: '2026-08-03',
      now: '2026-08-04T12:00:00.000-04:00',
    });

    expect(model.events.filter((item) => item.type === 'AUTO_CLOCK_IN')).toHaveLength(1);
    expect(model.events.filter((item) => item.type === 'CLOCK_IN')).toHaveLength(0);
    expect(model.events.filter((item) => item.type === 'CLOCK_OUT')).toHaveLength(1);
    expect(model.anomalies).toEqual([]);
    expect(model.approvalEligible).toBe(true);
    expect(model.billableMinutes).toBe(60);
  });

  it('uses GPS home departure and return as the home-to-home payroll boundary', () => {
    const model = buildTimeEvents([
      {
        id: 'trip-1',
        date: '2026-08-03',
        status: 'Completed',
        arrivalTime: '2026-08-03T08:00:00.000-04:00',
        arrivalDropoffTime: '2026-08-03T09:00:00.000-04:00',
        completedAt: '2026-08-03T09:01:00.000-04:00',
        pickupLat: 39.8,
        pickupLng: -86.1,
        dropoffLat: 39.82,
        dropoffLng: -86.12,
      },
    ], { id: 'driver-1', homeLat: 39.7, homeLng: -86.2 }, [], POLICY_MODES.PAY_FROM_HOME, {
      date: '2026-08-03',
      now: '2026-08-04T12:00:00.000-04:00',
      breadcrumbs: [
        { capturedAt: '2026-08-03T07:15:00.000-04:00', lat: 39.7, lng: -86.2, accuracy: 8 },
        { capturedAt: '2026-08-03T09:35:00.000-04:00', lat: 39.7002, lng: -86.2001, accuracy: 7 },
      ],
    });

    const clockIn = model.events.find((item) => item.type === 'AUTO_CLOCK_IN');
    const clockOut = model.events.find((item) => item.type === 'CLOCK_OUT');
    expect(clockIn.timestamp).toBe('2026-08-03T11:15:00.000Z');
    expect(clockOut.timestamp).toBe('2026-08-03T13:35:00.000Z');
    expect(clockIn.confidence).toBe('gps_verified');
    expect(clockOut.confidence).toBe('gps_verified');
    expect(model.billableMinutes).toBe(140);
  });

  it('rejects stale or inaccurate home GPS samples and labels the fallback as an estimate', () => {
    const model = buildTimeEvents([{
      id: 'trip-1',
      date: '2026-08-03',
      status: 'Completed',
      arrivalTime: '2026-08-03T12:00:00.000Z',
      arrivalDropoffTime: '2026-08-03T13:00:00.000Z',
      completedAt: '2026-08-03T13:01:00.000Z',
      pickupLat: 39.8,
      pickupLng: -86.1,
      dropoffLat: 39.82,
      dropoffLng: -86.12,
    }], { id: 'driver-1', homeLat: 39.7, homeLng: -86.2 }, [], POLICY_MODES.PAY_FROM_HOME, {
      date: '2026-08-03',
      now: '2026-08-04T12:00:00.000Z',
      breadcrumbs: [
        { capturedAt: '2026-08-03T02:00:00.000Z', lat: 39.7, lng: -86.2, accuracy: 8 },
        { capturedAt: '2026-08-03T11:30:00.000Z', lat: 39.7, lng: -86.2, accuracy: 400 },
      ],
    });

    const clockIn = model.events.find((item) => item.type === 'AUTO_CLOCK_IN');
    expect(clockIn.anchorType).toBe('HOME');
    expect(clockIn.confidence).toBe('route_estimate');
    expect(clockIn.reason).toBe('FIRST_WORK_EVENT');
  });
});
