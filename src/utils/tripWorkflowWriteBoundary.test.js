import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath) => readFileSync(
  fileURLToPath(new URL(relativePath, import.meta.url)),
  'utf8',
);

describe('driver trip workflow write boundary', () => {
  it('uses one component-to-store command instead of legacy parallel writes', () => {
    const driverPage = readSource('../components/DriverPage.jsx');
    const firebaseConfig = readSource('../config/firebase.js');

    expect(driverPage).not.toContain('saveTripWorkflowUpdate');
    expect(driverPage).not.toContain('saveOdometerReading');
    expect(firebaseConfig).not.toContain('export async function saveTripWorkflowUpdate');
    expect(firebaseConfig).not.toContain("doc(db, 'appData', 'agape')");
  });

  it('commits the trip, progress, and ledger mirrors in one batch', () => {
    const dataHook = readSource('../hooks/useFirestoreAppData.js');
    const boundary = dataHook.match(/const upsertDriverTrip[\s\S]*?\n {2}\}\), \[activeTenantId, enqueueFieldPersistence\]\);/)?.[0] || '';

    expect(boundary).toContain('const batch = writeBatch(db);');
    expect(boundary).toContain('TRIPS_COLLECTION');
    expect(boundary).toContain('DRIVER_TRIP_PROGRESS_COLLECTION');
    expect(boundary).toContain('TRIP_LEDGER_COLLECTION');
    expect(boundary).toContain('await batch.commit();');
  });

  it('keeps odometer dialogs open when persistence fails', () => {
    const driverPage = readSource('../components/DriverPage.jsx');
    const pickupStart = driverPage.indexOf('const submitOdometer = async () =>');
    const pickupEnd = driverPage.indexOf('const handleArriveDropoff', pickupStart);
    const pickupBoundary = driverPage.slice(pickupStart, pickupEnd);
    const completionStart = driverPage.indexOf('const submitComplete = async () =>');
    const completionEnd = driverPage.indexOf('const startTripAndOpen', completionStart);
    const completionBoundary = driverPage.slice(completionStart, completionEnd);

    expect(pickupBoundary).toContain('const saved = await advanceWorkflow');
    expect(pickupBoundary.indexOf('if (!saved)')).toBeLessThan(pickupBoundary.indexOf('setShowOdometerPrompt(null)'));
    expect(completionBoundary).toContain('const saved = await advanceWorkflow');
    expect(completionBoundary.indexOf('if (saved === false)')).toBeLessThan(completionBoundary.indexOf('setShowCompleteModal(null)'));
  });
});
