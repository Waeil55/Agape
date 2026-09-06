import { describe, expect, it } from 'vitest';
import { compareStableRowOrder, createStableRowOrder } from './stableTableOrder';

describe('stableTableOrder', () => {
  it('preserves the visible row order while a trip is edited and saved', () => {
    const rows = [{ id: 'trip-30' }, { id: 'trip-2' }, { id: 'trip-11' }];
    const order = createStableRowOrder(rows);
    const updatedRows = [
      { id: 'trip-2', time: '01:00' },
      { id: 'trip-11', time: '02:00' },
      { id: 'trip-30', time: '03:00' },
    ];

    updatedRows.sort((left, right) => compareStableRowOrder(left.id, right.id, order));

    expect(updatedRows.map((row) => row.id)).toEqual(['trip-30', 'trip-2', 'trip-11']);
  });

  it('keeps newly arriving rows after the stabilized rows without losing them', () => {
    const order = createStableRowOrder([{ id: 'trip-a' }, { id: 'trip-b' }]);
    const rows = [{ id: 'trip-new' }, { id: 'trip-b' }, { id: 'trip-a' }];

    rows.sort((left, right) => (
      compareStableRowOrder(left.id, right.id, order)
      ?? String(left.id).localeCompare(String(right.id))
    ));

    expect(rows.map((row) => row.id)).toEqual(['trip-a', 'trip-b', 'trip-new']);
  });
});
