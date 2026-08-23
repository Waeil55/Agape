import { beforeEach, describe, expect, it, vi } from 'vitest';

const idbMock = vi.hoisted(() => ({
  openDB: vi.fn(),
}));

vi.mock('idb', () => ({ openDB: idbMock.openDB }));

function createFakeDatabase() {
  const stores = new Map([
    ['appData', new Map()],
    ['trips', new Map()],
    ['trashedTrips', new Map()],
    ['drivers', new Map()],
    ['dispatchers', new Map()],
    ['vehicles', new Map()],
    ['logs', new Map()],
    ['phoneNumbers', new Map()],
    ['syncQueue', new Map()],
    ['meta', new Map()],
    ['deadLetterQueue', new Map()],
  ]);
  let nextQueueId = 1;
  const transactions = [];
  const failures = [];
  let nextTransactionFailure = null;

  const maybeFail = (storeName, method) => {
    const index = failures.findIndex((failure) => (
      failure.storeName === storeName && failure.method === method
    ));
    if (index >= 0) {
      const [failure] = failures.splice(index, 1);
      throw failure.error;
    }
  };

  const storeApi = (storeName) => {
    const records = stores.get(storeName);
    if (!records) throw new Error(`Unknown fake store: ${storeName}`);
    return {
      async add(value) {
        maybeFail(storeName, 'add');
        const id = storeName === 'syncQueue' ? nextQueueId++ : value.id;
        records.set(id, { ...value, id });
        return id;
      },
      async clear() {
        maybeFail(storeName, 'clear');
        records.clear();
      },
      async delete(id) {
        maybeFail(storeName, 'delete');
        records.delete(id);
      },
      async get(id) {
        maybeFail(storeName, 'get');
        return records.get(id);
      },
      async put(value, explicitKey) {
        maybeFail(storeName, 'put');
        const id = explicitKey ?? value.id;
        records.set(id, explicitKey === undefined ? { ...value, id } : value);
        return id;
      },
    };
  };

  const database = {
    stores,
    transactions,
    failOnce(storeName, method, error = new Error('Injected IndexedDB failure')) {
      failures.push({ storeName, method, error });
    },
    failTransactionOnce(error = new Error('Injected IndexedDB failure')) {
      nextTransactionFailure = error;
    },
    transaction(storeNames, mode) {
      const normalizedStores = Array.isArray(storeNames) ? storeNames : [storeNames];
      const transactionError = nextTransactionFailure;
      const transaction = {
        storeNames: normalizedStores,
        mode,
        aborted: false,
        objectStore: storeApi,
        abort() {
          this.aborted = true;
        },
        done: transactionError
          ? Promise.resolve().then(() => { throw transactionError; })
          : Promise.resolve(),
      };
      nextTransactionFailure = null;
      transactions.push(transaction);
      return transaction;
    },
    async add(storeName, value) {
      return storeApi(storeName).add(value);
    },
    async clear(storeName) {
      return storeApi(storeName).clear();
    },
    async getAll(storeName) {
      return [...stores.get(storeName).values()];
    },
    async getAllFromIndex(storeName, _indexName, value) {
      return [...stores.get(storeName).values()].filter((record) => record.status === value);
    },
  };

  return database;
}

let database;
let localDB;

beforeEach(async () => {
  vi.resetModules();
  idbMock.openDB.mockReset();
  database = createFakeDatabase();
  idbMock.openDB.mockResolvedValue(database);
  localDB = await import('./localDB');
});

describe('localDB durable outbox contract', () => {
  it('defaults offline snapshots to the Agape tenant when no tenant id is provided', async () => {
    await expect(localDB.saveAppData({ trips: [{ id: 'trip-1', status: 'Assigned' }] })).resolves.toBeUndefined();
    expect(database.stores.get('appData').get('tenant::agape-care')).toMatchObject({ trips: [{ id: 'trip-1', status: 'Assigned' }] });
  });

  it('rejects ownerless queue entries before writing anything', async () => {
    await expect(localDB.queueSyncOperation({ type: 'setDoc' }))
      .rejects.toThrow('tenantId is required');
    expect(database.stores.get('syncQueue')).toHaveLength(0);
  });

  it('stores normalized ownership and returns the durable queue id', async () => {
    const id = await localDB.queueSyncOperation({
      type: 'setDoc',
      collection: 'trips',
      docId: 'trip-1',
      data: { status: 'Completed' },
      tenantId: ' agape-care ',
      userId: ' user-1 ',
    });

    expect(id).toBe(1);
    expect(database.stores.get('syncQueue').get(1)).toMatchObject({
      tenantId: 'agape-care',
      userId: 'user-1',
      status: 'pending',
      attempts: 0,
    });
  });

  it('persists a field snapshot, granular records, and outbox in one transaction', async () => {
    const result = await localDB.saveFieldWithSyncOperations(
      'trips',
      [{ id: 'trip-1', status: 'Completed' }],
      [{
        type: 'setDoc',
        collection: 'trips',
        docId: 'trip-1',
        data: { status: 'Completed' },
      }],
      { tenantId: 'agape-care', userId: 'user-1' },
    );

    expect(result).toEqual({ queuedOperationIds: [1] });
    expect(database.transactions).toHaveLength(1);
    expect(database.transactions[0].storeNames.sort()).toEqual([
      'appData',
      'syncQueue',
      'trips',
    ]);
    expect(database.stores.get('trips').get('trip-1')).toMatchObject({ id: 'trip-1' });
    expect(database.stores.get('appData').get('tenant::agape-care').trips).toHaveLength(1);
    expect(database.stores.get('syncQueue').get(1)).toMatchObject({
      tenantId: 'agape-care',
      userId: 'user-1',
    });
  });

  it('patches changed collection records without clearing and rewriting the full store', async () => {
    const previousValue = [
      { id: 'trip-1', status: 'Assigned' },
      { id: 'trip-2', status: 'Completed' },
    ];
    database.stores.get('trips').set('trip-1', previousValue[0]);
    database.stores.get('trips').set('trip-2', previousValue[1]);
    database.failOnce('trips', 'clear');

    await expect(localDB.saveField(
      'trips',
      [{ id: 'trip-1', status: 'Completed' }],
      { previousValue, tenantId: 'agape-care' },
    )).resolves.toBeUndefined();

    expect(database.stores.get('trips').get('trip-1')).toMatchObject({ status: 'Completed' });
    expect(database.stores.get('trips').has('trip-2')).toBe(false);
  });

  it('propagates snapshot, field, queue, completion, and retry persistence failures', async () => {
    database.failTransactionOnce();
    await expect(localDB.saveAppData({ trips: [] })).rejects.toThrow('Injected IndexedDB failure');

    database.failTransactionOnce();
    await expect(localDB.saveField('trips', [], { tenantId: 'agape-care' })).rejects.toThrow('Injected IndexedDB failure');

    database.failOnce('syncQueue', 'add');
    await expect(localDB.queueSyncOperation({
      type: 'setDoc',
      tenantId: 'agape-care',
      userId: 'user-1',
    })).rejects.toThrow('Injected IndexedDB failure');

    const id = await localDB.queueSyncOperation({
      type: 'setDoc',
      tenantId: 'agape-care',
      userId: 'user-1',
    });
    database.failOnce('syncQueue', 'delete');
    await expect(localDB.completeSyncOperation(id)).rejects.toThrow('Injected IndexedDB failure');

    database.failOnce('syncQueue', 'put');
    await expect(localDB.failSyncOperation(id, new Error('offline')))
      .rejects.toThrow('Injected IndexedDB failure');
  });

  it('moves permanent failures atomically and reports owner-scoped status', async () => {
    const ownedId = await localDB.queueSyncOperation({
      type: 'setDoc',
      tenantId: 'agape-care',
      userId: 'user-1',
    });
    await localDB.queueSyncOperation({
      type: 'setDoc',
      tenantId: 'another-tenant',
      userId: 'another-user',
    });

    await localDB.deadLetterSyncOperation(
      ownedId,
      Object.assign(new Error('Permission denied'), { code: 'permission-denied' }),
      'permanent_validation_or_permission',
    );

    expect(database.stores.get('syncQueue').has(ownedId)).toBe(false);
    expect(database.stores.get('deadLetterQueue').get(ownedId)).toMatchObject({
      status: 'dead_letter',
      tenantId: 'agape-care',
      userId: 'user-1',
      errorCode: 'permission-denied',
    });
    await expect(localDB.getSyncQueueStatus({
      tenantId: 'agape-care',
      userId: 'user-1',
    })).resolves.toMatchObject({ pending: 0, deadLetter: 1, total: 1 });
    await expect(localDB.getSyncQueueStatus({
      tenantId: 'another-tenant',
      userId: 'another-user',
    })).resolves.toMatchObject({ pending: 1, deadLetter: 0, total: 1 });
  });
});
