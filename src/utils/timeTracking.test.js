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
});
