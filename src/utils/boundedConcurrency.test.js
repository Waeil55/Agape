import { describe, expect, it } from 'vitest';
import { forEachWithConcurrency } from './boundedConcurrency';

describe('forEachWithConcurrency', () => {
  it('processes every item while respecting the configured concurrency ceiling', async () => {
    let active = 0;
    let peakActive = 0;
    const completed = [];

    await forEachWithConcurrency(Array.from({ length: 12 }, (_, index) => index), async (item) => {
      active += 1;
      peakActive = Math.max(peakActive, active);
      await new Promise(resolve => setTimeout(resolve, 2));
      completed.push(item);
      active -= 1;
    }, 3);

    expect(peakActive).toBe(3);
    expect(completed.sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, index) => index));
  });

  it('surfaces the first worker failure and does not schedule the full remaining queue', async () => {
    const started = [];

    await expect(forEachWithConcurrency(Array.from({ length: 20 }, (_, index) => index), async (item) => {
      started.push(item);
      if (item === 0) throw new Error('rejected update');
      await new Promise(resolve => setTimeout(resolve, 2));
    }, 4)).rejects.toThrow('rejected update');

    expect(started.length).toBeLessThan(20);
    expect(started.length).toBeLessThanOrEqual(4);
  });

  it('treats a missing list as an empty queue', async () => {
    let calls = 0;
    await forEachWithConcurrency(null, () => { calls += 1; });
    expect(calls).toBe(0);
  });
});
