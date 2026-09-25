import { describe, expect, it } from 'vitest';
import { evaluateTripLegGap, TRIP_LEG_MAX_GAP_MINUTES } from './tripTimeSanity';

describe('evaluateTripLegGap', () => {
  it('returns null when either timestamp is missing', () => {
    expect(evaluateTripLegGap(null, '2026-01-01T07:16:00.000Z')).toBeNull();
    expect(evaluateTripLegGap('2026-01-01T07:16:00.000Z', '')).toBeNull();
  });

  it('flags a departure recorded before arrival, never correcting it', () => {
    const result = evaluateTripLegGap('2026-01-01T07:16:00.000Z', '2026-01-01T06:36:00.000Z');
    expect(result.severity).toBe('invalid');
    expect(result.gapMinutes).toBe(-40);
    expect(result.message).toContain('40 min before arrival');
  });

  it('flags an unusually large but forward gap', () => {
    const result = evaluateTripLegGap('2026-01-01T07:00:00.000Z', '2026-01-01T08:30:00.000Z', 60);
    expect(result.severity).toBe('warn');
    expect(result.gapMinutes).toBe(90);
  });

  it('accepts a normal short loading/unloading gap', () => {
    expect(evaluateTripLegGap('2026-01-01T07:00:00.000Z', '2026-01-01T07:08:00.000Z')).toBeNull();
  });

  it('defaults the warning threshold to an hour', () => {
    expect(TRIP_LEG_MAX_GAP_MINUTES).toBe(60);
  });
});
