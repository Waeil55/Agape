import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tripMatchesRoutePlannerServiceDate } from '../utils/portalSelectors';

describe('route planner service-date scope', () => {
  it('never persists rider route drafts or saved plans in browser storage', () => {
    const source = readFileSync(new URL('./RoutePlannerPage.jsx', import.meta.url), 'utf8');

    expect(source).not.toContain('localStorage');
    expect(source).not.toContain('sessionStorage');
    expect(source).not.toContain('agape_routePlanner');
  });

  const selectedDate = '2026-08-13';

  it('includes only trips whose normalized service date matches the selected day', () => {
    expect(tripMatchesRoutePlannerServiceDate({ date: '2026-08-13' }, selectedDate)).toBe(true);
    expect(tripMatchesRoutePlannerServiceDate({ date: '2026-08-13T14:30:00.000Z' }, selectedDate)).toBe(true);
    expect(tripMatchesRoutePlannerServiceDate({ date: '2026-08-14' }, selectedDate)).toBe(false);
  });

  it('supports the existing service-date field precedence through the shared normalizer', () => {
    expect(tripMatchesRoutePlannerServiceDate({ scheduledDate: '08/13/2026' }, selectedDate)).toBe(true);
    expect(tripMatchesRoutePlannerServiceDate({ scheduleDate: '2026-08-14' }, selectedDate)).toBe(false);
  });

  it('fails closed when a trip or selected date has no usable calendar date', () => {
    expect(tripMatchesRoutePlannerServiceDate({}, selectedDate)).toBe(false);
    expect(tripMatchesRoutePlannerServiceDate({ date: 'not-a-date' }, selectedDate)).toBe(false);
    expect(tripMatchesRoutePlannerServiceDate({ date: selectedDate }, '')).toBe(false);
  });

  it('normalizes Firestore-style timestamp values without accessing Firebase', () => {
    const timestamp = { toDate: () => new Date(2026, 7, 13, 9, 15) };
    expect(tripMatchesRoutePlannerServiceDate({ date: timestamp }, selectedDate)).toBe(true);
  });
});
