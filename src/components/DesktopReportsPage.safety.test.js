import { describe, expect, it } from 'vitest';
import { getManifestUrgency, getReviewBatchScope } from '../utils/portalSelectors';

describe('desktop report review batch scope', () => {
  it('blocks all-date review mutations even when rows are visible', () => {
    expect(getReviewBatchScope({
      allDates: true,
      dateStr: '2026-08-11',
      rowCount: 12,
      canUpdate: true,
    })).toMatchObject({
      allowed: false,
      dateKey: '',
      rowCount: 12,
    });
  });

  it('blocks invalid, empty, and unavailable scopes', () => {
    expect(getReviewBatchScope({ allDates: false, dateStr: '', rowCount: 2, canUpdate: true }).allowed).toBe(false);
    expect(getReviewBatchScope({ allDates: false, dateStr: '08/11/2026', rowCount: 2, canUpdate: true }).allowed).toBe(false);
    expect(getReviewBatchScope({ allDates: false, dateStr: '2026-08-11', rowCount: 0, canUpdate: true }).allowed).toBe(false);
    expect(getReviewBatchScope({ allDates: false, dateStr: '2026-08-11', rowCount: 2, canUpdate: false }).allowed).toBe(false);
  });

  it('allows only an exact single service date with a known row count and update handler', () => {
    expect(getReviewBatchScope({
      allDates: false,
      dateStr: '2026-08-11',
      rowCount: 3,
      canUpdate: true,
    })).toEqual({
      allowed: true,
      dateKey: '2026-08-11',
      rowCount: 3,
      reason: '',
    });
  });
});

describe('trip record urgency scope', () => {
  const now = new Date(2026, 7, 11, 12, 0, 0);

  it('compares the scheduled time on the trip service date', () => {
    expect(getManifestUrgency({ date: '2026-08-11', time: '10:00', status: 'Assigned' }, now)).toBe('late');
    expect(getManifestUrgency({ date: '2026-08-11', time: '12:15', status: 'Assigned' }, now)).toBe('soon');
    expect(getManifestUrgency({ date: '2026-08-12', time: '08:00', status: 'Assigned' }, now)).toBe('normal');
  });

  it('does not invent urgency for terminal, will-call, or invalid records', () => {
    expect(getManifestUrgency({ date: '2026-08-11', time: '08:00', status: 'Completed' }, now)).toBe('normal');
    expect(getManifestUrgency({ date: '2026-08-11', time: '08:00', status: 'Rerouted' }, now)).toBe('normal');
    expect(getManifestUrgency({ date: '2026-08-11', time: 'Will Call', status: 'Assigned' }, now)).toBe('normal');
    expect(getManifestUrgency({ date: '', time: '08:00', status: 'Assigned' }, now)).toBe('normal');
    expect(getManifestUrgency({ date: '2026-08-11', serviceDate: '2026-08-12', time: '08:00', status: 'Assigned' }, now)).toBe('normal');
  });
});
