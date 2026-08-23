import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appDataSource = readFileSync(
  new URL('../hooks/useFirestoreAppData.js', import.meta.url),
  'utf8',
);
const operationsSource = readFileSync(
  new URL('../components/OperationsCommandCenter.jsx', import.meta.url),
  'utf8',
);
const chatSource = readFileSync(
  new URL('../hooks/useChat.js', import.meta.url),
  'utf8',
);
const mainSource = readFileSync(
  new URL('../main.jsx', import.meta.url),
  'utf8',
);
const appSource = readFileSync(
  new URL('../App.jsx', import.meta.url),
  'utf8',
);

describe('interaction latency regression contract', () => {
  it('paints optimistic field state before collection-wide persistence preparation', () => {
    const writeFieldStart = appDataSource.indexOf('const writeField = useCallback');
    const writeFieldEnd = appDataSource.indexOf('const setTrips = useCallback', writeFieldStart);
    const writeField = appDataSource.slice(writeFieldStart, writeFieldEnd);
    const optimisticState = writeField.indexOf('setState(prev => ({ ...prev, [field]: value');
    const persistenceYield = writeField.indexOf('await yieldBeforePersistenceWork()');
    const collectionPreparation = writeField.indexOf('hydrateTripDriverIdentities(cleanTripCollection(value)');

    expect(writeFieldStart).toBeGreaterThan(-1);
    expect(optimisticState).toBeGreaterThan(-1);
    expect(persistenceYield).toBeGreaterThan(optimisticState);
    expect(collectionPreparation).toBeGreaterThan(persistenceYield);
    expect(writeField).not.toContain('const previousData = normalizeData(dataRef.current)');
    expect(writeField).toContain('Array.isArray(preparedValue)');
  });

  it('ignores metadata-only trip echoes once no import acknowledgement is pending', () => {
    expect(appDataSource).toContain("snap.docChanges({ includeMetadataChanges: false })");
    expect(appDataSource).toContain('pendingTripImportsRef.current.size === 0');
  });

  it('persists realtime offline-cache fields during idle time instead of rewriting every collection', () => {
    const persistenceStart = appDataSource.indexOf('const persistLocalSnapshot');
    const persistenceEnd = appDataSource.indexOf('// Render the last authoritative snapshot', persistenceStart);
    const persistence = appDataSource.slice(persistenceStart, persistenceEnd);

    expect(persistenceStart).toBeGreaterThan(-1);
    expect(persistence).toContain('window.requestIdleCallback');
    expect(persistence).toContain('await saveField(field, value, { previousValue })');
    expect(persistence).not.toContain('saveAppData(');
  });

  it('does not rehydrate every trip when only driver telemetry fields change', () => {
    expect(appDataSource).toContain('const driverIdentityChanged = isFleetField');
    expect(appDataSource).toContain('...(driverIdentityChanged ? {');
    expect(appDataSource).toContain("persistLocalSnapshot(\n        field,");
  });

  it('memoizes selected-date trips and indexes driver workload in one pass', () => {
    expect(operationsSource).toContain('const todayTrips = useMemo(');
    expect(operationsSource).toContain('const activeTripCountByDriver = new Map()');
    expect(operationsSource).toContain('driverById.get(t.driverId)?.phone');
    expect(operationsSource).not.toContain("inProgressTrips.filter((trip) => trip.driverId === a.id).length");
  });

  it('releases nested chat profile listeners and skips the directory for alert-only consumers', () => {
    expect(chatSource).toContain('let unsubscribeUserProfile = () => {}');
    expect(chatSource).toContain('unsubscribeUserProfile();\n      unsubscribeAuth();');
    expect(chatSource).toContain('if (!currentUser || alerts) return;');
  });

  it('does not scan every table row in the global capture-phase click handler', () => {
    const clickHandlerStart = mainSource.indexOf("document.addEventListener('click'");
    const clickHandlerEnd = mainSource.indexOf("document.addEventListener('keydown'", clickHandlerStart);
    const clickHandler = mainSource.slice(clickHandlerStart, clickHandlerEnd);

    expect(clickHandlerStart).toBeGreaterThan(-1);
    expect(mainSource).toContain('let selectedTableRow = null');
    expect(clickHandler).not.toContain('querySelectorAll');
  });

  it('marks telemetry and declaration echoes as non-urgent rendering work', () => {
    expect(appSource).toContain('startTransition(() => setDriverTelemetry(filtered))');
    expect(appSource).toContain('startTransition(() => setTimeTrackingDeclarations(recentDeclarations))');
    expect(appSource).toContain('startTransition(() => setDriverTelemetry((prev) => {');
  });
});
