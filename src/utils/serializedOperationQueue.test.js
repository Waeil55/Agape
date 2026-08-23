import { describe, expect, it } from 'vitest';
import { createSerializedOperationQueue } from './serializedOperationQueue';

describe('serialized persistence operations', () => {
  it('never lets a later reactivation overtake an earlier archive commit', async () => {
    const enqueue = createSerializedOperationQueue();
    let releaseArchive;
    const archiveGate = new Promise(resolve => { releaseArchive = resolve; });
    const events = [];
    const archive = enqueue(async () => {
      events.push('archive:start');
      await archiveGate;
      events.push('archive:commit');
    });
    const reactivate = enqueue(async () => {
      events.push('reactivate:commit');
    });

    await Promise.resolve();
    expect(events).toEqual(['archive:start']);
    releaseArchive();
    await Promise.all([archive, reactivate]);
    expect(events).toEqual(['archive:start', 'archive:commit', 'reactivate:commit']);
  });

  it('continues safely after a failed operation without hiding that failure', async () => {
    const enqueue = createSerializedOperationQueue();
    const failed = enqueue(async () => { throw new Error('archive failed'); });
    const next = enqueue(async () => 'next completed');
    await expect(failed).rejects.toThrow('archive failed');
    await expect(next).resolves.toBe('next completed');
  });
});
