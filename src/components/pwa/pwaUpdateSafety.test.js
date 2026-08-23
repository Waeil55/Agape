import { describe, expect, it } from 'vitest';
import { getUnsafeUpdateReasons } from './pwaUpdateSafety';

const createStorage = (entries = {}) => {
  const values = new Map(Object.entries(entries));
  const keys = [...values.keys()];
  return {
    get length() {
      return keys.length;
    },
    key(index) {
      return keys[index] ?? null;
    },
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
  };
};

const idleQueue = {
  state: 'idle',
  pending: 0,
  deadLetter: 0,
};

describe('PWA update safety', () => {
  it('allows restart only when the owned queue and persisted work are clear', () => {
    expect(getUnsafeUpdateReasons({
      queueStatus: idleQueue,
      storage: createStorage(),
    })).toEqual([]);
  });

  it('blocks pending and attention-required sync work', () => {
    const reasons = getUnsafeUpdateReasons({
      queueStatus: { state: 'attention_required', pending: 2, deadLetter: 1 },
      storage: createStorage(),
    });

    expect(reasons).toEqual(expect.arrayContaining([
      expect.stringContaining('2 saved changes'),
      expect.stringContaining('1 saved change'),
    ]));
  });

  it('blocks an active trip, message draft, and queued chat outbox', () => {
    const reasons = getUnsafeUpdateReasons({
      queueStatus: idleQueue,
      storage: createStorage({
        agape_drvActiveTrip_driver: 'trip-123',
        agape_chat_draft_dispatch: 'Need assistance',
        agape_chat_outbox: JSON.stringify([{ id: 'message-1' }]),
      }),
    });

    expect(reasons).toEqual(expect.arrayContaining([
      expect.stringContaining('active trip'),
      expect.stringContaining('unsent message draft'),
      expect.stringContaining('1 chat message'),
    ]));
  });

  it('fails closed when queue, storage, or outbox state cannot be verified', () => {
    const blockedQueueReasons = getUnsafeUpdateReasons({
      queueStatus: { state: 'blocked', pending: null, deadLetter: null },
      storage: createStorage({ agape_chat_outbox: '{invalid' }),
    });
    expect(blockedQueueReasons).toEqual(expect.arrayContaining([
      expect.stringContaining('sync status could not be verified'),
      expect.stringContaining('Saved chat work could not be verified'),
    ]));

    const unavailableStorageReasons = getUnsafeUpdateReasons({
      queueStatus: idleQueue,
      storage: null,
    });
    expect(unavailableStorageReasons).toEqual([
      'Local draft and active-trip state could not be verified on this device.',
    ]);
  });
});
