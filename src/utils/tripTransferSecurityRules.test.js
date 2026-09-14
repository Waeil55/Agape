import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const rulesPath = fileURLToPath(new URL('../../firestore.rules', import.meta.url));
const rules = readFileSync(rulesPath, 'utf8');

const functionSource = (name, nextName) => {
  const start = rules.indexOf(`function ${name}(`);
  const end = rules.indexOf(`function ${nextName}(`, start + 1);
  expect(start, `Missing Firestore rule helper ${name}`).toBeGreaterThan(-1);
  expect(end, `Missing Firestore rule helper ${nextName}`).toBeGreaterThan(start);
  return rules.slice(start, end);
};

const quotedFields = (source, expression) => {
  const match = source.match(expression);
  expect(match).not.toBeNull();
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
};

describe('Firestore pending trip-transfer decision boundary', () => {
  it('locks the sender while a transfer is pending and resolves target IDs fail closed', () => {
    const selfUpdate = functionSource('tripSelfUpdate', 'tripHasPendingTransfer');
    const strictDriver = functionSource('strictTransferDriverIdMatchesWriter', 'transferRequestTargetsWriter');
    const target = functionSource('transferRequestTargetsWriter', 'transferReturnsStoredWorkflow');

    expect(selfUpdate).toContain('!tripHasPendingTransfer(old)');
    expect(strictDriver).toContain("currentProfile().get('profileId', '') == driverId");
    expect(strictDriver).toContain('/documents/driverProfiles/$(driverId)');
    expect(strictDriver).not.toContain('!exists(');
    expect(target).toContain("(targetEmail != '' || targetId != '')");
    expect(target).toContain("targetEmail.lower() == tripWriterEmail().lower()");
    expect(target).toContain("targetId == '' || strictTransferDriverIdMatchesWriter(targetId)");
  });

  it('allows exactly one accept/decline decision plus persistence metadata', () => {
    const recipient = functionSource('tripTransferRecipientUpdate', 'validOverrideCostPolicy');
    const changedFields = quotedFields(recipient, /changed\.hasOnly\(\[([\s\S]*?)\]\)/);
    const decisionFields = quotedFields(
      recipient,
      /decision\.diff\(transfer\)\.affectedKeys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/,
    );

    expect(changedFields).toEqual([
      'status', 'driverId', 'driverEmail', 'driverName',
      'transferStatus', 'transferRequest', 'workflowUpdatedAt',
      'updatedAtLocal', 'lifecycleStatus', 'lifecycleStep',
      'operationalStatus', 'updatedAt', 'syncedAt', 'syncedAtLocal',
    ]);
    expect(decisionFields).toEqual(['status', 'decidedAt', 'decidedBy']);
    expect(recipient).toContain("old.get('status', '').lower() == 'transferred'");
    expect(recipient).toContain('tripHasPendingTransfer(old)');
    expect(recipient).toContain("changed.hasAll(['status', 'transferStatus', 'transferRequest'])");
    expect(recipient).toContain("decision.get('status', '') in ['accepted', 'declined']");
    expect(recipient).toContain("decision.get('decidedBy', '').lower() == tripWriterEmail().lower()");

    for (const forbidden of [
      'pickupOdometer', 'dropoffOdometer', 'arrivalTime',
      'departedPickupTime', 'completedAt', 'notes',
    ]) {
      expect(changedFields).not.toContain(forbidden);
    }
  });

  it('preserves the stored workflow and validates generated lifecycle metadata', () => {
    const workflow = functionSource('transferReturnsStoredWorkflow', 'validTransferLifecycle');
    const lifecycle = functionSource('validTransferLifecycle', 'validTransferPersistenceMetadata');
    const metadata = functionSource('validTransferPersistenceMetadata', 'validAcceptedTransferIdentity');

    for (const status of [
      'assigned', 'in mission', 'en route', 'in progress',
      'navigating pickup', 'at pickup', 'in transit',
      'navigating dropoff', 'at dropoff', 'arrived',
    ]) {
      expect(workflow).toContain(`'${status}'`);
    }
    expect(workflow).toContain("data.get('status', '').lower() == previous.lower()");
    expect(metadata).toContain("data.get('updatedAt', null) == request.time");
    expect(metadata).toContain("data.get('syncedAt', null) == request.time");
    expect(metadata).toContain("data.get('updatedAtLocal', '') == data.get('workflowUpdatedAt', '')");
    expect(metadata).toContain('validTransferLifecycle(data)');
    expect(lifecycle).toContain("'assigned', 'in mission', 'in progress'");
    expect(lifecycle).toContain("status.lower() == 'en route'");
    expect(lifecycle).not.toContain("'completed'");
    expect(lifecycle).not.toContain("'transferred'");
  });

  it('assigns accepted trips only to the recipient and leaves declined identity unchanged', () => {
    const accepted = functionSource('validAcceptedTransferIdentity', 'validDeclinedTransferIdentity');
    const declined = functionSource('validDeclinedTransferIdentity', 'tripTransferRecipientUpdate');

    expect(accepted).toContain("strictTransferDriverIdMatchesWriter(data.get('driverId', ''))");
    expect(accepted).toContain("targetId == '' || data.get('driverId', '') == targetId");
    expect(accepted).toContain("data.get('driverEmail', '').lower() == tripWriterEmail().lower()");
    expect(declined).toContain("data.get('driverId', null) == old.get('driverId', null)");
    expect(declined).toContain("data.get('driverEmail', null) == old.get('driverEmail', null)");
    expect(declined).toContain("data.get('driverName', null) == old.get('driverName', null)");
  });
});
