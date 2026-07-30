import { describe, expect, it } from 'vitest';
import {
  pageWellTransRows,
  partitionWellTransRun,
  WELLTRANS_REVIEW_BATCH_SIZE,
} from './welltransScale';

describe('WellTrans high-volume run partitioning', () => {
  it('covers 5,000 trips exactly once across bounded shards', () => {
    const ids = Array.from({ length: 5000 }, (_, index) => String(107000000 + index));
    const shards = partitionWellTransRun(ids);
    const flattened = shards.flat();

    expect(shards).toHaveLength(20);
    expect(shards.every(shard => shard.length <= WELLTRANS_REVIEW_BATCH_SIZE)).toBe(true);
    expect(flattened).toEqual(ids);
    expect(new Set(flattened).size).toBe(5000);
  });

  it('deduplicates retries and paginates without dropping boundary rows', () => {
    const ids = Array.from({ length: 5000 }, (_, index) => `trip-${index}`);
    const shards = partitionWellTransRun([...ids, ids[0], ids[4999]]);
    expect(shards.flat()).toEqual(ids);
    expect(pageWellTransRows(ids, 49)).toEqual(ids.slice(4900, 5000));
  });
});
