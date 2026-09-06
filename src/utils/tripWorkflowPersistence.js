import { sanitizeFirestorePayload } from './firestorePayload';
import { attachTenantScope } from './tenantScope';
import { buildOperationalTripRecord } from './tripLifecycle';

const identityPatch = (trip = {}) => ({
  driverId: trip.driverId || null,
  driverEmail: trip.driverEmail || null,
  driverName: trip.driverName || null,
});

/**
 * Build the three records that represent one driver workflow mutation.
 *
 * `trips` is authoritative. The progress and ledger documents are searchable
 * mirrors used by the driver UI and audit/reconciliation views. Keeping their
 * payloads together lets the caller commit them in one Firestore batch instead
 * of reporting success after only one of several competing writes lands.
 */
export function buildTripWorkflowPersistenceRecords({
  tripId,
  currentTrip,
  updates = {},
  tenantId,
  nowIso = new Date().toISOString(),
}) {
  const safeTripId = String(tripId || '').trim();
  if (!safeTripId) throw new TypeError('A trip ID is required for workflow persistence.');
  if (!currentTrip || String(currentTrip.id || '') !== safeTripId) {
    throw new TypeError(`Trip ${safeTripId} is not present in the authoritative trip collection.`);
  }

  const safeUpdates = sanitizeFirestorePayload(updates);
  const workflowUpdatedAt = safeUpdates.workflowUpdatedAt || nowIso;
  const authoritativeTrip = sanitizeFirestorePayload(attachTenantScope(
    buildOperationalTripRecord({
      ...currentTrip,
      ...safeUpdates,
      id: safeTripId,
      workflowUpdatedAt,
      updatedAtLocal: workflowUpdatedAt,
    }),
    tenantId,
  ));
  const authoritativePatch = sanitizeFirestorePayload(attachTenantScope({
    id: safeTripId,
    ...safeUpdates,
    workflowUpdatedAt,
    updatedAtLocal: workflowUpdatedAt,
    lifecycleStatus: authoritativeTrip.lifecycleStatus,
    lifecycleStep: authoritativeTrip.lifecycleStep,
    operationalStatus: authoritativeTrip.operationalStatus,
  }, tenantId));
  const mirrorPatch = sanitizeFirestorePayload(attachTenantScope({
    tripId: safeTripId,
    ...identityPatch(authoritativeTrip),
    ...safeUpdates,
    workflowUpdatedAt,
  }, tenantId));

  return {
    authoritativeTrip,
    authoritativePatch,
    progressPatch: mirrorPatch,
    ledgerPatch: mirrorPatch,
    workflowUpdatedAt,
  };
}
