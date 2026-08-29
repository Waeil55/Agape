import { describe, expect, it } from 'vitest';
import {
  POLICY_MODES,
  GAP_CLASSIFICATIONS,
  PAYROLL_EFFECTS,
  buildTimeEvents,
  calculateReturnToWorkFromPickup,
  classifyGap,
  generatePayrollOutput,
  stitchSessions,
  validateTimeEventSequence,
} from './timeTracking';

const event = (type, timestamp) => ({ type, timestamp });

describe('payroll time ledger', () => {
  it('back-calculates return from break using verified pickup arrival and route time', () => {
    const result = calculateReturnToWorkFromPickup({
      breakStartTime: '2026-08-05T15:00:00.000Z',
      pickupArrivalTime: '2026-08-05T16:00:00.000Z',
      breakLocation: { lat: 39.7, lng: -86.2 },
      pickupLocation: { lat: 39.8, lng: -86.1 },
      routedTravelMinutes: 22,
    });

    expect(result.returnTimeIso).toBe('2026-08-05T15:38:00.000Z');
    expect(result.travelMinutes).toBe(22);
    expect(result.source).toBe('ROUTED_PICKUP_BACKCALCULATION');
  });

  it('never back-calculates return before the recorded break began', () => {
    const result = calculateReturnToWorkFromPickup({
      breakStartTime: '2026-08-05T15:50:00.000Z',
      pickupArrivalTime: '2026-08-05T16:00:00.000Z',
      routedTravelMinutes: 45,
    });

    expect(result.returnTimeIso).toBe('2026-08-05T15:50:00.000Z');
    expect(result.travelMinutes).toBe(10);
  });
  it('ignores corrupted legacy timestamps without crashing the driver portal', () => {
    const corruptTimestamp = { toDate: () => new Date('Invalid Date') };
    expect(() => buildTimeEvents([
      { id: 'legacy-trip', date: '2026-08-05', status: 'Completed', arrivalTime: 'Invalid Date', completedAt: corruptTimestamp },
    ], { id: 'driver-1' }, [
      { type: 'IN', timestamp: 'Invalid Date' },
      { type: 'OUT', timestamp: { seconds: Number.POSITIVE_INFINITY } },
    ], POLICY_MODES.PAY_FROM_HOME, { date: '2026-08-05', now: '2026-08-05T12:00:00.000Z' })).not.toThrow();
  });

  it('does not treat an imported service-date marker as an active trip completion event', () => {
    const model = buildTimeEvents([
      {
        id: '107489324',
        date: '2026-08-05',
        status: 'In Progress',
        startedAt: '2026-08-05T12:00:00.000Z',
        completedAt: '08-05-2026',
        pickupLocation: { lat: 39.8, lng: -86.1 },
      },
    ], { id: 'DRV-GGQOR7' }, [], POLICY_MODES.PAY_FROM_HOME, {
      date: '2026-08-05',
      now: '2026-08-05T13:00:00.000Z',
    });

    expect(model.events.some((item) => item.eventType === 'TRIP_COMPLETED')).toBe(false);
    expect(model.reconciliation.status).toBe('ACTIVE');
  });

  it('never deducts an ambiguous gap based only on duration or movement', () => {
    const gap = classifyGap(
      '2026-08-03T09:00:00.000Z',
      '2026-08-03T11:00:00.000Z',
      { lat: 39.7, lng: -86.2 },
      { lat: 39.9, lng: -86.0 },
    );
    expect(gap.classification).toBe(GAP_CLASSIFICATIONS.NEEDS_REVIEW);
    expect(gap.payrollEffect).toBe(PAYROLL_EFFECTS.REVIEW);
    expect(gap.auditRecord.notes).toContain('no payroll deduction');
  });

  it('excludes a gap only after an attributable verified-personal decision', () => {
    const gap = classifyGap(
      '2026-08-03T09:00:00.000Z',
      '2026-08-03T11:00:00.000Z',
      null,
      null,
      { resolution: 'PERSONAL_UNPAID', resolvedBy: 'admin@agape.test', resolutionReason: 'Driver confirmed personal appointment' },
    );
    expect(gap.classification).toBe(GAP_CLASSIFICATIONS.VERIFIED_PERSONAL);
    expect(gap.payrollEffect).toBe(PAYROLL_EFFECTS.EXCLUDED);
    expect(gap.auditRecord.resolvedBy).toBe('admin@agape.test');
  });

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

  it('uses persisted route durations when imported trips have addresses but no coordinates', () => {
    const model = buildTimeEvents([{
      id: 'trip-route-boundaries',
      date: '2026-08-05',
      status: 'Completed',
      arrivalTime: '2026-08-05T08:00:00.000Z',
      arrivalDropoffTime: '2026-08-05T09:00:00.000Z',
      completedAt: '2026-08-05T09:01:00.000Z',
      homeToPickupTravelMinutes: 25,
      homeToPickupConfidence: 'route_verified',
      dropoffToHomeTravelMinutes: 30,
      dropoffToHomeConfidence: 'route_verified',
      estimatedHomeArrivalTime: '2026-08-05T09:30:00.000Z',
    }], { id: 'driver-1', homeLat: 39.7, homeLng: -86.2 }, [], POLICY_MODES.PAY_FROM_HOME, {
      date: '2026-08-05',
      now: '2026-08-06T12:00:00.000Z',
    });

    const clockIn = model.events.find((item) => item.type === 'AUTO_CLOCK_IN');
    const clockOut = model.events.find((item) => item.type === 'CLOCK_OUT');
    expect(clockIn.timestamp).toBe('2026-08-05T07:35:00.000Z');
    expect(clockIn.anchorType).toBe('HOME_ROUTE');
    expect(clockOut.timestamp).toBe('2026-08-05T09:30:00.000Z');
    expect(clockOut.anchorType).toBe('HOME_ROUTE');
    expect(model.billableMinutes).toBe(115);
  });

  it('anchors route-derived boundaries to pickup and dropoff arrivals instead of workflow button taps', () => {
    const model = buildTimeEvents([{
      id: 'trip-button-boundaries',
      date: '2026-08-05',
      status: 'Completed',
      startedAt: '2026-08-05T07:15:00.000Z',
      arrivalTime: '2026-08-05T08:00:00.000Z',
      arrivalDropoffTime: '2026-08-05T09:00:00.000Z',
      completedAt: '2026-08-05T09:45:00.000Z',
      homeToPickupTravelMinutes: 25,
      homeToPickupConfidence: 'route_verified',
      dropoffToHomeTravelMinutes: 30,
      dropoffToHomeConfidence: 'route_verified',
    }], { id: 'driver-1', homeLat: 39.7, homeLng: -86.2 }, [], POLICY_MODES.PAY_FROM_HOME, {
      date: '2026-08-05',
      now: '2026-08-06T12:00:00.000Z',
    });

    const clockIn = model.events.find((item) => item.type === 'AUTO_CLOCK_IN');
    const clockOut = model.events.find((item) => item.type === 'CLOCK_OUT');
    expect(clockIn.timestamp).toBe('2026-08-05T07:35:00.000Z');
    expect(clockOut.timestamp).toBe('2026-08-05T09:30:00.000Z');
    expect(clockIn.reason).toBe('HOME_TO_FIRST_PICKUP_ROUTE');
    expect(clockOut.reason).toBe('DROPOFF_TO_HOME_ROUTE');
  });

  it('prefers actual home GPS evidence over persisted route estimates', () => {
    const model = buildTimeEvents([{
      id: 'trip-gps-override',
      date: '2026-08-05',
      status: 'Completed',
      arrivalTime: '2026-08-05T08:00:00.000Z',
      arrivalDropoffTime: '2026-08-05T09:00:00.000Z',
      completedAt: '2026-08-05T09:01:00.000Z',
      homeToPickupTravelMinutes: 25,
      dropoffToHomeTravelMinutes: 30,
    }], { id: 'driver-1', homeLat: 39.7, homeLng: -86.2 }, [], POLICY_MODES.PAY_FROM_HOME, {
      date: '2026-08-05',
      now: '2026-08-06T12:00:00.000Z',
      breadcrumbs: [
        { capturedAt: '2026-08-05T07:20:00.000Z', lat: 39.7, lng: -86.2, accuracy: 8 },
        { capturedAt: '2026-08-05T09:42:00.000Z', lat: 39.7001, lng: -86.2001, accuracy: 7 },
      ],
    });

    const clockIn = model.events.find((item) => item.type === 'AUTO_CLOCK_IN');
    const clockOut = model.events.find((item) => item.type === 'CLOCK_OUT');
    expect(clockIn.timestamp).toBe('2026-08-05T07:20:00.000Z');
    expect(clockOut.timestamp).toBe('2026-08-05T09:42:00.000Z');
    expect(clockIn.confidence).toBe('gps_verified');
    expect(clockOut.confidence).toBe('gps_verified');
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
    expect(clockIn.reason).toBe('FIRST_PICKUP_ARRIVAL');
  });

  it('keeps between-trip waiting paid and allows an attributable personal-time correction', () => {
    const trips = [
      { id: 'trip-1', date: '2026-08-03', status: 'Completed', arrivalTime: '2026-08-03T08:00:00.000Z', completedAt: '2026-08-03T09:00:00.000Z' },
      { id: 'trip-2', date: '2026-08-03', status: 'Completed', arrivalTime: '2026-08-03T11:00:00.000Z', completedAt: '2026-08-03T12:00:00.000Z' },
    ];
    const paidWaiting = buildTimeEvents(trips, { id: 'driver-1' }, [], POLICY_MODES.PAY_FROM_FIRST_PICKUP, {
      date: '2026-08-03', now: '2026-08-04T12:00:00.000Z',
    });
    expect(paidWaiting.billableMinutes).toBe(240);
    expect(paidWaiting.approvalEligible).toBe(true);
    expect(paidWaiting.reviewRequiredGaps).toHaveLength(0);
    expect(paidWaiting.gapLog.some((gap) => gap.classification === GAP_CLASSIFICATIONS.WORK_WAITING)).toBe(true);

    const resolved = buildTimeEvents(trips, { id: 'driver-1' }, [{
      type: 'GAP_RESOLUTION',
      timestamp: '2026-08-03T11:00:00.000Z',
      gapStartTime: '2026-08-03T09:00:00.000Z',
      gapEndTime: '2026-08-03T11:00:00.000Z',
      resolution: 'PERSONAL_UNPAID',
      source: 'admin_correction',
      authority: 'admin',
      correctedBy: 'admin@agape.test',
      correctedAt: '2026-08-04T12:00:00.000Z',
      correctionReason: 'Driver reported personal appointment',
    }], POLICY_MODES.PAY_FROM_FIRST_PICKUP, {
      date: '2026-08-03', now: '2026-08-04T12:00:00.000Z',
    });
    expect(resolved.billableMinutes).toBe(120);
    expect(resolved.approvalEligible).toBe(true);
    expect(resolved.reviewRequiredGaps).toHaveLength(0);
  });

  it('uses automatically timestamped personal-time events as an exact unpaid interval', () => {
    const trips = [
      { id: 'trip-1', date: '2026-08-03', status: 'Completed', arrivalTime: '2026-08-03T08:00:00.000Z', completedAt: '2026-08-03T09:00:00.000Z' },
      { id: 'trip-2', date: '2026-08-03', status: 'Completed', arrivalTime: '2026-08-03T11:00:00.000Z', completedAt: '2026-08-03T12:00:00.000Z' },
    ];
    const model = buildTimeEvents(trips, { id: 'driver-1' }, [
      { type: 'BREAK_START', timestamp: '2026-08-03T09:00:00.000Z', source: 'driver_personal_declaration' },
      { type: 'BREAK_END', timestamp: '2026-08-03T11:00:00.000Z', source: 'driver_personal_declaration' },
    ], POLICY_MODES.PAY_FROM_FIRST_PICKUP, {
      date: '2026-08-03', now: '2026-08-04T12:00:00.000Z',
    });

    expect(model.billableMinutes).toBe(120);
    expect(model.sessions[0].breakMinutes).toBe(120);
    expect(model.reviewRequiredGaps).toHaveLength(0);
    expect(model.approvalEligible).toBe(true);
  });

  it('recovers a missing break end by back-calculating from the next verified pickup', () => {
    const trips = [
      {
        id: 'trip-1', date: '2026-08-03', status: 'Completed',
        arrivalTime: '2026-08-03T08:00:00.000Z', completedAt: '2026-08-03T09:00:00.000Z',
        pickupLat: 39.7, pickupLng: -86.2,
      },
      {
        id: 'trip-2', date: '2026-08-03', status: 'Completed',
        arrivalTime: '2026-08-03T11:00:00.000Z', completedAt: '2026-08-03T12:00:00.000Z',
        pickupLat: 39.8, pickupLng: -86.1,
      },
    ];
    const model = buildTimeEvents(trips, { id: 'driver-1' }, [{
      type: 'BREAK_START',
      timestamp: '2026-08-03T09:00:00.000Z',
      lat: 39.7,
      lng: -86.2,
      source: 'driver_personal_declaration',
    }], POLICY_MODES.PAY_FROM_FIRST_PICKUP, {
      date: '2026-08-03', now: '2026-08-04T12:00:00.000Z',
    });

    const inferredEnd = model.events.find((item) => item.type === 'BREAK_END');
    expect(inferredEnd.reason).toBe('INFERRED_FROM_VERIFIED_PICKUP_RETURN_TRAVEL');
    expect(new Date(inferredEnd.timestamp).getTime()).toBeLessThan(new Date('2026-08-03T11:00:00.000Z').getTime());
    expect(inferredEnd.travelMinutes).toBeGreaterThan(0);
    expect(model.anomalies).toEqual([]);
  });
});
