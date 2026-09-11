import { describe, expect, it } from 'vitest';
import {
  isUnresolvedEmptyTripSnapshot,
  mergeUnresolvedCachedFields,
} from './realtimeCacheMerge';

describe('realtime cache merge', () => {
  it('keeps cached trips when a different live collection arrives first', () => {
    const current = { trips: [], drivers: [{ id: 'live-driver' }], phoneNumbers: {} };
    const cached = { trips: [{ id: 'cached-trip' }], drivers: [{ id: 'cached-driver' }] };

    expect(mergeUnresolvedCachedFields(current, cached, new Set(['drivers']))).toMatchObject({
      trips: [{ id: 'cached-trip' }],
      drivers: [{ id: 'live-driver' }],
    });
  });

  it('never lets a late cache read replace a live trip snapshot', () => {
    const current = { trips: [{ id: 'live-trip' }], drivers: [] };
    const cached = { trips: [{ id: 'stale-trip' }], drivers: [{ id: 'cached-driver' }] };

    expect(mergeUnresolvedCachedFields(current, cached, new Set(['trips']))).toMatchObject({
      trips: [{ id: 'live-trip' }],
      drivers: [{ id: 'cached-driver' }],
    });
  });

  it('does not treat an initial empty Firestore cache event as an empty server manifest', () => {
    expect(isUnresolvedEmptyTripSnapshot({ empty: true, metadata: { fromCache: true } }, false)).toBe(true);
    expect(isUnresolvedEmptyTripSnapshot({ empty: true, metadata: { fromCache: false } }, false)).toBe(false);
    expect(isUnresolvedEmptyTripSnapshot({ empty: true, metadata: { fromCache: true } }, true)).toBe(false);
  });
});
