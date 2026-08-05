import { describe, expect, it } from 'vitest';
import { safeDateMillis, toSafeIso, toValidDate } from './safeDate';

describe('safe date normalization', () => {
  it('returns null instead of throwing for malformed legacy dates', () => {
    expect(toValidDate('Invalid Date')).toBeNull();
    expect(toSafeIso('not-a-date')).toBeNull();
    expect(safeDateMillis({ seconds: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it('supports Firestore timestamp-like values', () => {
    const timestamp = { toDate: () => new Date('2026-08-05T12:00:00.000Z') };
    expect(toSafeIso(timestamp)).toBe('2026-08-05T12:00:00.000Z');
  });

  it('contains exceptions thrown by corrupted timestamp objects', () => {
    expect(toValidDate({ toDate: () => { throw new Error('corrupt'); } })).toBeNull();
  });
});
