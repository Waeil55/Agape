import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { findUniqueExactOption } from '../../../../automation/welltrans-worker/src/welltrans.trip';

const tripSourcePath = fileURLToPath(new URL(
  '../../../../automation/welltrans-worker/src/welltrans.trip.js',
  import.meta.url,
));
const workerSourcePath = fileURLToPath(new URL(
  '../../../../automation/welltrans-worker/src/index.js',
  import.meta.url,
));
const operatorConsolePath = fileURLToPath(new URL(
  '../../../../automation/welltrans-worker/src/welltrans.operator-console.js',
  import.meta.url,
));
const functionsSourcePath = fileURLToPath(new URL(
  '../../../../functions/index.js',
  import.meta.url,
));
const firestoreRulesPath = fileURLToPath(new URL(
  '../../../../firestore.rules',
  import.meta.url,
));

describe('WellTrans staging safety contract', () => {
  it('accepts only a unique normalized-exact broker option', () => {
    const options = [
      'Rider Unable to Sign',
      'Rider Refused to Sign',
      'Rider Signature Received',
      'Signature Not Requested',
    ];

    expect(findUniqueExactOption(options, 'rider signature received'))
      .toBe('Rider Signature Received');
    expect(findUniqueExactOption(options, 'Rider Signature'))
      .toBeNull();
    expect(findUniqueExactOption(options, 'Signature Not Required'))
      .toBeNull();
  });

  it('contains no keyboard fallback that can choose the wrong signature reason', () => {
    const source = readFileSync(tripSourcePath, 'utf8');
    expect(source).not.toContain("keyboard.press('ArrowUp')");
    expect(source).toContain(
      "page, grid, pickup, 'Signature Captured?', 'Rider Signature Received'",
    );
    expect(source).toContain(
      "page, grid, dropoff, 'Signature Captured?', 'Rider Signature Received'",
    );
  });

  it('never silently requeues failed jobs after an agent upgrade', () => {
    const source = readFileSync(workerSourcePath, 'utf8');
    expect(source).not.toContain('migrateLegacyDateJobs');
    expect(source).not.toContain('queued_for_worker_upgrade');
    expect(source).toContain('failed_review_close_required');
  });

  it('accepts only integrity-checked supervised booking aliases', () => {
    const source = readFileSync(workerSourcePath, 'utf8');
    expect(source).toContain('async function resolveBookingAlias(sourceBookingId, serviceDate)');
    expect(source).toContain("alias.matchMethod === 'supervised_unique_composite'");
    expect(source).toContain("alias.provider === 'welltrans'");
    expect(source).toContain('bookingId: bookingAlias?.portalBookingId || validation.payload.bookingId');
    expect(source).toContain("bookingMatchMethod: bookingAlias?.matchMethod || 'exact_booking_id'");
  });

  it('treats TripSpark listboxes as exact-option editors before their internal text inputs', () => {
    const source = readFileSync(tripSourcePath, 'utf8');
    const setTextCell = source.slice(
      source.indexOf('async function setTextCell'),
      source.indexOf('async function setListCell'),
    );
    expect(setTextCell.indexOf('if (await listbox.count())'))
      .toBeLessThan(setTextCell.indexOf('if (await editor.count())'));
    expect(source).toContain('if (equalCellValue(entry.column, current, entry.original)) return;');
  });

  it('uses a trusted pointer click for exact custom-dropdown options', () => {
    const source = readFileSync(tripSourcePath, 'utf8');
    const clickListOption = source.slice(
      source.indexOf('async function clickListOption'),
      source.indexOf('async function selectListOption'),
    );
    expect(clickListOption).toContain('page.getByText(optionStr, { exact: true })');
    expect(clickListOption).toContain('candidate.click({ force: true })');
    expect(clickListOption.indexOf('candidate.click({ force: true })'))
      .toBeLessThan(clickListOption.indexOf('page.evaluate'));
  });

  it('keeps vehicle matching optional and can restore an originally blank list cell', () => {
    const source = readFileSync(tripSourcePath, 'utf8');
    expect(source).toContain("entry.reason = 'portal_rejected_optional_exact_match'");
    expect(source).toContain('waitForListDropdownOptions(page, { strict: optionalExactList })');
    expect(source).toContain('if (strictOnly) return [...new Set(results)]');
    expect(source).toContain("await editor.fill('')");
    expect(source).toContain('await restorePlanEntry(page, grid, entry)');
  });

  it('stages exact signature reasons before required fields and optional vehicles last', () => {
    const source = readFileSync(tripSourcePath, 'utf8');
    const syncTrip = source.slice(source.indexOf('export async function syncWellTransTrip'));
    const signature = syncTrip.indexOf(
      "page, grid, pickup, 'Signature Captured?', 'Rider Signature Received'",
    );
    const driver = syncTrip.indexOf(
      "preflightCell(page, grid, pickup, 'Driver', payload.driver",
    );
    const vehicle = syncTrip.indexOf(
      "preflightCell(page, grid, pickup, 'Vehicle', payload.vehicle",
    );
    expect(signature).toBeGreaterThan(-1);
    expect(signature).toBeLessThan(driver);
    expect(driver).toBeLessThan(vehicle);
  });

  it('resolves a virtual-grid cell in one browser pass', () => {
    const source = readFileSync(tripSourcePath, 'utf8');
    const exactCell = source.slice(
      source.indexOf('async function exactCell'),
      source.indexOf('async function resolveColumnLeft'),
    );
    expect(exactCell).toContain('cells.evaluateAll');
    expect(exactCell).not.toContain('await cell.evaluate');
    expect(exactCell).toContain('element.title === coordinates.columnTitle');
  });

  it('does not discard TripSpark first-row cells that share top:0 with the header layer', () => {
    const source = readFileSync(tripSourcePath, 'utf8');
    expect(source).not.toContain('if (cellTop === 0 || !Number.isFinite(cellTop)) continue;');
    expect(source).not.toContain('if (top === 0 || !Number.isFinite(top)');
    expect(source).toContain('const headerCells = new Set(columnTitles.map(header).filter(Boolean));');
    expect(source).toContain('if (headerCells.has(cell) || !Number.isFinite(cellTop)) continue;');
  });

  it('isolates every TripSpark editor and never commits a typed list filter', () => {
    const source = readFileSync(tripSourcePath, 'utf8');
    expect(source).toContain('async function dismissActiveEditor(page)');
    expect(source).toContain('await dismissActiveEditor(page);');
    expect(source).toContain('const exactFiltered = findUniqueExactOption(filteredOptions, optionStr)');
    expect(source).toContain('exactFiltered && await clickListOption(page, exactFiltered)');
    expect(source).not.toContain("filter.press('Tab')");
  });

  it('waits for lazy TripSpark options and exact-searches during preflight', () => {
    const source = readFileSync(tripSourcePath, 'utf8');
    expect(source).toContain('async function waitForListDropdownOptions');
    expect(source).toContain('async function filterListDropdown');
    expect(source).toContain('const filteredOptions = await filterListDropdown(page, value)');
    expect(source).toContain('exactMatch = findUniqueExactOption(options, value)');
  });

  it('supports TripSpark direct dropdown dialogs without a listbox wrapper', () => {
    const source = readFileSync(tripSourcePath, 'utf8');
    expect(source).toContain("page.locator('.DropDownDialog:visible').last()");
    expect(source).toContain('Treat the visible dialog itself as open');
    expect(source).toContain('await listbox.count() || await directDialog.count()');
    expect(source).toContain('if (!await listbox.count() && !await directDialog.count())');
  });

  it('blocks review-ready until the authoritative completed-trip manifest has full coverage', () => {
    const worker = readFileSync(workerSourcePath, 'utf8');
    const backend = readFileSync(functionsSourcePath, 'utf8');
    expect(worker).toContain("db.doc(`welltrans_sync_manifests/${serviceDate}`).get()");
    expect(worker).toContain('verified === summary.total');
    expect(worker).toContain('summary.missing === 0');
    expect(worker).toContain('summary.blocked === 0');
    expect(backend).toContain('authoritative_firestore_completed_trip_scan');
    expect(backend).toContain('const authoritativeTrips = fullDateMode');
    expect(backend).toContain('expectedTripIds: requestedIds');
  });

  it('requires complete date reconciliation before manual Apply confirmation', () => {
    const source = readFileSync(functionsSourcePath, 'utf8');
    expect(source).toContain('exports.confirmWellTransDateApplied');
    expect(source).toContain('Apply confirmation is locked');
    expect(source).toContain('["awaiting_review", "completed"]');
  });

  it('never trusts staged rows from a closed browser review session', () => {
    const source = readFileSync(workerSourcePath, 'utf8');
    expect(source).toContain("reviewSessionId = randomUUID()");
    expect(source).toContain('async function recoverStaleReviewJobs(serviceDate)');
    expect(source).toContain("stage: 'requeued_for_new_review_session'");
    expect(source).toContain('item.reviewSessionId === reviewSessionId');
  });

  it('autonomously discovers every completed trip and excludes cancelled records', () => {
    const worker = readFileSync(workerSourcePath, 'utf8');
    expect(worker).toContain('async function reconcileAuthoritativeCompletedTrips(serviceDate)');
    expect(worker).toContain("db.collection('trips').get()");
    expect(worker).toContain("source: 'authoritative_worker_completed_trip_scan'");
    expect(worker).toContain('if (/cancell?ed/.test(lifecycle)) return false');
    expect(worker).toContain('await reconcileAuthoritativeCompletedTrips(selectedDate)');
  });

  it('does not trust a completed log without current live portal verification', () => {
    const worker = readFileSync(workerSourcePath, 'utf8');
    const trip = readFileSync(tripSourcePath, 'utf8');
    expect(trip).toContain('export async function auditWellTransTrip');
    expect(worker).toContain('async function auditCompletedPortalTrips(page, serviceDate)');
    expect(worker).toContain("stage: 'requeued_after_live_portal_audit'");
    expect(worker).toContain('item.portalReviewSessionId === reviewSessionId');
    expect(worker).toContain('Date.now() - lastAuthoritativeReconcileAt >= 60_000');
  });

  it('fills pending rows before running broad live verification', () => {
    const worker = readFileSync(workerSourcePath, 'utf8');
    expect(worker).toContain('initialSummary.pending === 0');
    expect(worker).toContain('if (summary.pending === 0 && summary.staged === 0 && summary.unverifiedCompleted > 0)');
    expect(worker).toContain("await publishHeartbeat('staging')");
  });

  it('verifies a manually closed review batch and safely rebuilds unsaved rows', () => {
    const worker = readFileSync(workerSourcePath, 'utf8');
    const trip = readFileSync(tripSourcePath, 'utf8');
    expect(trip).toContain('export const isEditItineraryOpen');
    expect(worker).toContain('async function verifyClosedReviewBatch(page, serviceDate)');
    expect(worker).toContain("stage: 'manual_apply_live_verified'");
    expect(worker).toContain("stage: 'requeued_after_manual_dialog_close'");
    expect(worker).toContain('if (!await isEditItineraryOpen(session.page))');
  });

  it('records append-only synchronization transitions and per-agent schedule heartbeats', () => {
    const worker = readFileSync(workerSourcePath, 'utf8');
    const rules = readFileSync(firestoreRulesPath, 'utf8');
    expect(worker).toContain("db.collection('welltrans_sync_events').doc()");
    expect(worker).toContain('selectedDate: activeServiceDate || null');
    expect(rules).toContain('match /welltrans_sync_events/{eventId}');
    expect(rules).toContain('allow write: if false;');
  });

  it('monitors active agents, stuck jobs, and blocked dates without client write access', () => {
    const backend = readFileSync(functionsSourcePath, 'utf8');
    const rules = readFileSync(firestoreRulesPath, 'utf8');
    expect(backend).toContain('exports.monitorWellTransOperations');
    expect(backend).toContain('staleProcessingCount');
    expect(backend).toContain('blockedDateCount');
    expect(backend).toContain('welltrans.operations.health_changed');
    expect(rules).toContain('match /welltrans_operations/{document}');
  });

  it('provides an in-browser operator console with automatic and manual date controls', () => {
    const worker = readFileSync(workerSourcePath, 'utf8');
    const operatorConsole = readFileSync(operatorConsolePath, 'utf8');
    expect(operatorConsole).toContain('Reconcile & Fill Opened Date');
    expect(operatorConsole).toContain('Verify Every Field');
    expect(operatorConsole).toContain('Use Opened Date');
    expect(operatorConsole).toContain('Switch & Fill');
    expect(worker).toContain('await installWellTransOperatorConsole(session.page, handleOperatorCommand)');
    expect(worker).toContain('operatorControl.dateOverride');
    expect(worker).toContain('return currentDate;');
  });

  it('runs an exhaustive pre-Apply audit and automatically repairs mismatched trips', () => {
    const worker = readFileSync(workerSourcePath, 'utf8');
    expect(worker).toContain('async function auditStagedReviewBatch(page, serviceDate)');
    expect(worker).toContain("stage: 'requeued_by_pre_apply_exhaustive_audit'");
    expect(worker).toContain("state: 'verifying_every_field'");
    expect(worker).toContain('finalReviewAuditValid');
    expect(worker).toContain('verifiedFields');
  });

  it('keeps Apply and Close as explicit human-only actions', () => {
    const worker = readFileSync(workerSourcePath, 'utf8');
    const operatorConsole = readFileSync(operatorConsolePath, 'utf8');
    expect(operatorConsole).toContain('HUMAN APPLY ONLY');
    expect(operatorConsole).toContain('never clicks Apply or Close');
    expect(operatorConsole).not.toContain("data-action=\"apply\"");
    expect(operatorConsole).not.toContain("data-action=\"close\"");
    expect(worker).not.toMatch(/getByRole\(['"]button['"],\s*\{\s*name:\s*['"]Apply/);
    expect(worker).not.toMatch(/locator\(['"][^'"]*Apply[^'"]*['"]\)\.click/);
  });

  it('uses session-proven editor capabilities and adaptive turbo waits', () => {
    const trip = readFileSync(tripSourcePath, 'utf8');
    expect(trip).toContain("const TURBO_MODE = process.env.WELLTRANS_TURBO_MODE !== 'false'");
    expect(trip).toContain('provenEditorCapabilities');
    expect(trip).toContain('capabilityCacheHit: true');
    expect(trip).toContain('async function waitForEditorSurface');
    expect(trip).toContain('export function resetWellTransSessionCaches()');
  });

  it('runs and monitors a read-only production portal contract canary', () => {
    const worker = readFileSync(workerSourcePath, 'utf8');
    const trip = readFileSync(tripSourcePath, 'utf8');
    const backend = readFileSync(functionsSourcePath, 'utf8');
    const rules = readFileSync(firestoreRulesPath, 'utf8');
    expect(trip).toContain('export async function inspectWellTransPortalContract');
    expect(worker).toContain('async function runPortalContractCanary');
    expect(worker).toContain("db.doc('welltrans_canary/latest')");
    expect(backend).toContain('canaryContractFingerprint');
    expect(rules).toContain('match /welltrans_canary/{document}');
  });

  it('uses durable date shards and Cloud Tasks for large reconciliations', () => {
    const backend = readFileSync(functionsSourcePath, 'utf8');
    expect(backend).toContain('exports.wellTransReconcileShard');
    expect(backend).toContain('onTaskDispatched');
    expect(backend).toContain('WELLTRANS_SHARD_SIZE = 250');
    expect(backend).toContain('taskQueue.enqueue');
    expect(backend).toContain('orchestrationId');
  });

  it('keeps AI supervision read-only and deterministic when Gemini is unavailable', () => {
    const backend = readFileSync(functionsSourcePath, 'utf8');
    expect(backend).toContain('exports.explainWellTransFailureAI');
    expect(backend).toContain('classifyWellTransFailure');
    expect(backend).toContain('readOnly: true');
    expect(backend).not.toMatch(/explainWellTransFailureAI[\s\S]*?collection\("trips"\)[\s\S]*?\.update\(/);
  });
});
