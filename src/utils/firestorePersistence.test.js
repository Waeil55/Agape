import { describe, expect, it } from 'vitest';
import {
  applyFirestoreDocumentChanges,
  findRemovedDocumentIds,
  planCollectionMutations,
  rollbackOptimisticValue,
} from './firestorePersistence';

describe('Firestore collection persistence', () => {
  it('identifies records that must be deleted remotely', () => {
    const previous = [{ id: 'DRV-1' }, { id: 'DRV-2' }, { id: 'DRV-3' }];
    const current = [{ id: 'DRV-1' }, { id: 'DRV-3' }];

    expect(findRemovedDocumentIds(previous, current)).toEqual(['DRV-2']);
  });

  it('ignores empty IDs and deduplicates deletion work', () => {
    const previous = [{ id: 'VHC-1' }, { id: 'VHC-1' }, { name: 'invalid' }];

    expect(findRemovedDocumentIds(previous, [])).toEqual(['VHC-1']);
  });

  it('plans only changed records for global persistence', () => {
    const timestamp = { toMillis: () => 1234 };
    const previous = [
      { id: 'TRIP-1', status: 'Assigned', updatedAt: timestamp },
      { id: 'TRIP-2', status: 'Assigned' },
    ];
    const current = [
      { updatedAt: timestamp, status: 'Assigned', id: 'TRIP-1' },
      { id: 'TRIP-2', status: 'Completed' },
      { id: 'TRIP-3', status: 'Unassigned' },
    ];

    expect(planCollectionMutations(previous, current)).toEqual({
      upserts: [current[1], current[2]],
      removedIds: [],
      changed: true,
    });
  });

  it('does not infer remote trip deletion from an ordinary local list update', () => {
    const previous = [{ id: 'TRIP-1' }, { id: 'TRIP-2' }];
    const current = [{ id: 'TRIP-1' }];

    expect(planCollectionMutations(previous, current, { allowDeletes: false })).toEqual({
      upserts: [],
      removedIds: [],
      changed: false,
    });
  });

  it('applies added, modified, and removed listener changes without rebuilding from a snapshot', () => {
    const doc = (id, data) => ({ id, data: () => data });
    const next = applyFirestoreDocumentChanges(
      [{ id: 'TRIP-1', status: 'Assigned' }, { id: 'TRIP-2', status: 'Assigned' }],
      [
        { type: 'modified', doc: doc('TRIP-1', { status: 'Completed' }) },
        { type: 'removed', doc: doc('TRIP-2', {}) },
        { type: 'added', doc: doc('TRIP-3', { status: 'Unassigned' }) },
      ],
    );

    expect(next).toEqual([
      { id: 'TRIP-1', status: 'Completed' },
      { id: 'TRIP-3', status: 'Unassigned' },
    ]);
  });

  it('rolls back only failed records and preserves newer realtime values', () => {
    const previous = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }];
    const attempted = [{ id: '1', name: 'A-local' }, { id: '2', name: 'B' }, { id: '3', name: 'C-local' }];
    const plan = planCollectionMutations(previous, attempted);
    const current = [{ id: '1', name: 'A-remote-newer' }, { id: '2', name: 'B' }, { id: '3', name: 'C-local' }];

    expect(rollbackOptimisticValue(current, previous, attempted, plan)).toEqual([
      { id: '1', name: 'A-remote-newer' },
      { id: '2', name: 'B' },
    ]);
  });

  it('restores a failed deletion without overwriting unrelated realtime changes', () => {
    const previous = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }];
    const attempted = [{ id: '1', name: 'A' }];
    const plan = planCollectionMutations(previous, attempted, { allowDeletes: true });
    const current = [{ id: '1', name: 'A-remote-newer' }];

    expect(rollbackOptimisticValue(current, previous, attempted, plan)).toEqual([
      { id: '1', name: 'A-remote-newer' },
      { id: '2', name: 'B' },
    ]);
  });
});
