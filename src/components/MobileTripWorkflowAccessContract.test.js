import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('mobile Drive workspace role and persistence contract', () => {
  it('mounts operator Drive with full workflow edit capability for admin/dispatcher', () => {
    const source = readSource('./MobileEnterpriseDashboard.jsx');
    const marker = source.indexOf('Operators share the real persisted workflow view');
    const start = source.indexOf('<DriverPage', marker);
    const end = source.indexOf('/>', start);
    const observer = source.slice(start, end);

    expect(marker).toBeGreaterThan(-1);
    expect(observer).toContain('workflowReadOnly={false}');
    expect(observer).toContain('onUpdateTrip={props.onUpdateTrip || props.onUpdateDriverTrip}');
    expect(observer).toContain('drivers={driverWorkDrivers}');
    expect(observer).toContain('trips={driverWorkTrips}');
    expect(observer).toContain('onDriverStatusUpdate={props.onDriverStatusUpdate}');
    expect(observer).toContain('onUpdateClockEvents={props.onUpdateClockEvents}');
    expect(observer).toContain('onUpdateDriverLocation={props.onUpdateDriverLocation}');
  });

  it('blocks observer workflow writes and keeps active driver writes save-first', () => {
    const source = readSource('./DriverPage.jsx');

    expect(source).toContain('if (workflowReadOnly || !trip?.id || !status) return Promise.resolve(false);');
    expect(source).toContain('if (workflowReadOnly || isEmbedded || !driverId) return;');
    expect(source).toContain('enabled: Boolean(me?.id) && !isEmbedded && !workflowReadOnly');
    expect(source).toContain("const saved = await advanceWorkflow(trip, 'In Progress'");
    expect(source).toContain("const saved = await advanceWorkflow(trip, 'Navigating Pickup'");
    expect(source).toContain("const saved = await advanceWorkflow(signatureTrip, 'In Transit'");
    expect(source).toContain("const saved = await advanceWorkflow(trip, 'At Dropoff'");
  });

  it('persists transfer requests and restores the sender step on decline', () => {
    const source = readSource('./DriverPage.jsx');

    expect(source).toContain("previousStatus: transferPrompt.type === 'trip'");
    expect(source).toContain("const saved = await advanceWorkflow(trip, 'Transferred'");
    expect(source).toContain('const restoredStatus = getTransferReturnStatus(req);');
    expect(source).toContain('await applyTripTransferDecision(trip, true);');
    expect(source).toContain('await applyTripTransferDecision(trip, false);');
  });

  it('stages every route trip before publishing a route transfer and decides each trip save-first', () => {
    const source = readSource('./DriverPage.jsx');

    expect(source).toContain('const routeTrips = getRouteTransferTrips(assignedSequence);');
    expect(source).toContain('const routeRequest = { ...request, tripIds: routeTrips.map((trip) => trip.id) };');
    expect(source).toContain('for (const trip of routeTrips) {');
    expect(source).toContain("const saved = await advanceWorkflow(trip, 'Transferred'");
    expect(source).toContain('if (routeSaved !== true)');
    expect(source).toContain('await applyTripTransferDecision(trip, accepted);');
    expect(source).toContain('This legacy route request has no verified trip list.');
    expect(source).not.toContain('route.validTripIds.forEach');
  });

  it('keeps direct operator reassignment on the current resumable workflow step', () => {
    const source = readSource('./DriverPage.jsx');

    expect(source).toContain('const reassignedStatus = getTransferReturnStatus({ previousStatus: trip.status });');
    expect(source).toContain('const saved = await onUpdateTrip?.(trip.id, reassignedStatus');
  });

  it('authorizes mutations from the stored trip instead of caller-supplied ownership fields', () => {
    const source = readSource('../App.jsx');

    expect(source).toContain('if (role === \'driver\') return true;');
    expect(source).toContain('const previousTrip = trips.find((trip) => trip.id === tripId);');
    expect(source).toContain('if (!mayUpdateOwnedWorkflow && !isTransferDecision)');
    expect(source).toContain('delete workflowFields.status;');
    expect(source).toContain('if (!prevTrip || !canControlTrip(prevTrip))');
  });
});
