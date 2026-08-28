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
const workerMappingPath = fileURLToPath(new URL(
  '../../../../automation/welltrans-worker/src/welltrans.mapping.js',
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
const workerPackagePath = fileURLToPath(new URL(
  '../../../../automation/welltrans-worker/package.json',
  import.meta.url,
));
const workerInstallerPath = fileURLToPath(new URL(
  '../../../../automation/welltrans-worker/launcher/Install-AgapeWellTransAgent.ps1',
  import.meta.url,
));
const workerSetupPath = fileURLToPath(new URL(
  '../../../../automation/welltrans-worker/installer/AgapeWellTransAgentSetup.cs',
  import.meta.url,
));
const syncPagePath = fileURLToPath(new URL(
  '../components/WellTransSyncPage.jsx',
  import.meta.url,
));
const workerLauncherPath = fileURLToPath(new URL(
  '../../../../automation/welltrans-worker/launcher/Start-AgapeWellTrans.ps1',
  import.meta.url,
));
const localSettingsPath = fileURLToPath(new URL(
  '../../../../automation/welltrans-worker/src/welltrans.local-settings.js',
  import.meta.url,
));
const localSettingsHostPath = fileURLToPath(new URL(
  '../../../../automation/welltrans-worker/src/welltrans.settings-host.js',
  import.meta.url,
));
const syncServicePath = fileURLToPath(new URL(
  '../services/welltransService.js',
  import.meta.url,
));

describe('WellTrans staging safety contract', () => {
  it('keeps runtime, installer and package release versions identical', () => {
    const version = JSON.parse(readFileSync(workerPackagePath, 'utf8')).version;
    const installer = readFileSync(workerInstallerPath, 'utf8');
    expect(readFileSync(workerSourcePath, 'utf8')).toContain(`const workerVersion = '${version}'`);
    expect(installer).toContain(`$agentVersion = '${version}'`);
    expect(readFileSync(workerSetupPath, 'utf8')).toContain(`AssemblyVersion("${version}.0")`);
    expect(installer).toContain("'src\\welltrans.verifier.js'");
    expect(installer).toContain('integrated component $component is missing');
  });

  it('stores broker credentials only in the encrypted local Agent vault', () => {
    const localSettings = readFileSync(localSettingsPath, 'utf8');
    const localSettingsHost = readFileSync(localSettingsHostPath, 'utf8');
    const launcher = readFileSync(workerLauncherPath, 'utf8');
    const service = readFileSync(syncServicePath, 'utf8');
    expect(localSettings).toContain("server.listen(port, '127.0.0.1')");
    expect(localSettings).toContain('saveEncryptedCredentials');
    expect(localSettings).toContain("'https://agape5.web.app'");
    expect(localSettings).not.toContain('firebase');
    expect(localSettingsHost).not.toContain('firebase');
    expect(launcher).toContain('$env:WELLTRANS_CREDENTIAL_FILE = $wellTransCredentialPath');
    expect(service).toContain("const LOCAL_AGENT_SETTINGS_ROOT = 'http://127.0.0.1:43127/v1'");
    expect(service).toContain('portalPassword: deleteField()');
    const page = readFileSync(syncPagePath, 'utf8');
    expect(page).toContain('reauthenticateWithCredential');
    expect(page).toContain('EmailAuthProvider.credential');
    expect(page).toContain("const CREDENTIAL_ADMIN_ROLES = ['admin', 'superadmin', 'owner']");
    expect(page).toContain('Unlocks credential management for five minutes.');
    expect(page).toContain('The saved WellTrans password is never displayed.');
  });
  it('supports revocable per-device enrollment without requiring a Firebase JSON file', () => {
    const localSettings = readFileSync(localSettingsPath, 'utf8');
    const launcher = readFileSync(workerLauncherPath, 'utf8');
    const service = readFileSync(syncServicePath, 'utf8');
    const rules = readFileSync(firestoreRulesPath, 'utf8');
    expect(localSettings).toContain("url.pathname === '/v1/agent-enrollment'");
    expect(localSettings).toContain("exchangeUrl.hostname !== 'us-central1-agape-95c9f.cloudfunctions.net'");
    expect(launcher).toContain("$env:AGAPE_WORKER_CREDENTIAL_MODE = 'device_enrollment'");
    expect(service).toContain("httpsCallable(functions, 'createWellTransAgentEnrollment')");
    expect(rules).toContain('function isActiveWellTransAgent()');
    expect(rules).toContain('request.auth.token.welltransAgent == true');
  });
  it('replaces queued payload snapshots with the authoritative data actually staged', () => {
    const worker = readFileSync(workerSourcePath, 'utf8');
    expect(worker).toContain('payload: validation.payload');
    expect(worker).toContain('stagedPayload: payload');
    expect(worker).toContain('queuedSourceFingerprint: stagedSourceFingerprint');
  });
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

  it('binds every virtual-grid cell atomically by Booking ID, Activity and column', () => {
    const source = readFileSync(tripSourcePath, 'utf8');
    const boundCell = source.slice(
      source.indexOf('async function boundCellHandle'),
      source.indexOf('const normalized ='),
    );
    expect(boundCell).toContain('await ensureLiveRow(grid, row)');
    expect(boundCell).toContain('grid.evaluateHandle');
    expect(boundCell).toContain("header('Booking Id')");
    expect(boundCell).toContain("header('Activity')");
    expect(boundCell).toContain('criteria.columnTitle');
    expect(boundCell).toContain('matchingRows.length !== 1');
    expect(boundCell).toContain('targetCells.length !== 1');
    expect(boundCell).toContain('const cell = handle.asElement()');
    expect(boundCell).not.toContain('.first()');
    expect(source).not.toContain('async function exactCell');
  });

  it('halts when editing one Booking ID changes a visible neighboring booking', () => {
    const source = readFileSync(tripSourcePath, 'utf8');
    expect(source).toContain('async function captureVisibleEditableSnapshot');
    expect(source).toContain('async function assertNoCrossBookingMutation');
    expect(source).toContain('Cross-booking mutation detected while staging Booking');
    expect(source).toContain('const neighboringRowsBefore = await captureVisibleEditableSnapshot(grid)');
    expect(source).toContain('await assertNoCrossBookingMutation(');
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
    expect(backend).toContain('const allAuthoritativeTrips = fullDateMode');
    expect(backend).toContain('expectedTripIds: requestedIds');
  });

  it('isolates driver runs by authoritative driver ID and groups all-driver review work', () => {
    const backend = readFileSync(functionsSourcePath, 'utf8');
    const worker = readFileSync(workerSourcePath, 'utf8');
    const trip = readFileSync(tripSourcePath, 'utf8');
    const page = readFileSync(syncPagePath, 'utf8');
    const launcher = readFileSync(workerLauncherPath, 'utf8');
    const operatorConsole = readFileSync(operatorConsolePath, 'utf8');
    expect(page).toContain('aria-label="Choose drivers to fill"');
    expect(page).toContain("{ type: 'driver', driverId: selectedDriverScope.id }");
    expect(page).toContain("protocol.searchParams.set('driverId', activeScope.driverId)");
    expect(backend).toContain('String(trip.driverId || "") === scopeDriverId');
    expect(backend).toContain('Trip does not belong to the selected authoritative driver');
    expect(worker).toContain("allExpectedTrips.filter(trip => String(trip.driverId || '') === activeRunScope.driverId)");
    expect(worker).toContain("String(left.data().payload?.driver || '').localeCompare");
    expect(worker).toContain('expectedIds.has(String(document.data().tripId))');
    expect(trip).toContain('export async function sortWellTransReviewGridByDriver');
    expect(trip).toContain("cell.title === 'Driver'");
    expect(launcher).toContain("requested-sync-scope.json");
    expect(worker).toContain("action === 'switch-driver'");
    expect(worker).toContain('persistRequestedRunScope');
    expect(worker).toContain('The Agent will never mix driver scopes.');
    expect(operatorConsole).toContain('data-role="driver"');
    expect(operatorConsole).toContain("send('switch-driver'");
    expect(operatorConsole).toContain('state.scopeLocked');
    expect(operatorConsole).toContain("send('switch-date'");
    expect(operatorConsole).toContain('Switching Date...');
    expect(operatorConsole).toContain('Choose the next date now. It will switch automatically');
    expect(worker).toContain('Date ${serviceDate} queued.');
    expect(worker).toContain('await selectExactRequestedSchedule(page, requestedServiceDate)');
    expect(worker).toContain('currentDate === requestedServiceDate');
    expect(worker).toContain('requestedDate: requestedServiceDate');
  });

  it('marks a driver batch done only after every scoped trip is live-verified', () => {
    const worker = readFileSync(workerSourcePath, 'utf8');
    const page = readFileSync(syncPagePath, 'utf8');
    expect(worker).toContain("welltrans_driver_sync_status/${driverStatusId}");
    expect(worker).toContain("summary.completed === summary.total && summary.total > 0");
    expect(worker).toContain("? 'done'");
    expect(page).toContain("log?.portalVerification?.verified === true");
    expect(page).toContain("? 'Verifying Apply'");
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
    expect(worker).toContain('const isAuthoritativeCompletedTrip = isWellTransCompletedTrip');
    expect(readFileSync(workerMappingPath, 'utf8')).toContain("'no show', 'no-show', 'noshow'");
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
    expect(worker).toContain("stage: 'requeued_after_review_interruption'");
    expect(worker).toContain("type: 'review_browser_interrupted'");
    expect(worker).toContain('portalUnavailable() || isPortalClosedError(error)');
    expect(worker).toContain('if (!await isEditItineraryOpen(session.page))');
  });

  it('does not oscillate an already-selected schedule back through connecting', () => {
    const worker = readFileSync(workerSourcePath, 'utf8');
    const selectedBranch = worker.slice(
      worker.indexOf('if (currentDate === requestedServiceDate)'),
      worker.indexOf('const editOpen = await isEditItineraryOpen(page)'),
    );
    expect(selectedBranch).toContain('return currentDate;');
    expect(selectedBranch).not.toContain("state: 'connecting'");
    expect(worker).toContain('publishInstanceHeartbeat(stateForReviewSummary(summary))');
  });

  it('records append-only synchronization transitions and per-agent schedule heartbeats', () => {
    const worker = readFileSync(workerSourcePath, 'utf8');
    const rules = readFileSync(firestoreRulesPath, 'utf8');
    expect(worker).toContain("db.collection('welltrans_sync_events').doc()");
    expect(worker).toContain('selectedDate: activeServiceDate || null');
    expect(rules).toContain('match /welltrans_sync_events/{eventId}');
    expect(rules).toContain('allow write: if false;');
  });

  it('isolates launcher transcripts so duplicate clicks cannot crash a live review', () => {
    const launcher = readFileSync(workerLauncherPath, 'utf8');
    expect(launcher).toContain('welltrans-worker-events-$PID.log');
    expect(launcher).toContain('welltrans-worker-transcript-$PID.log');
    expect(launcher).toContain('Start-Transcript -Path $transcriptPath');
    expect(launcher).not.toContain('Start-Transcript -Path $logPath');
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

  it('provides a one-line draggable operator toolbar with essential controls only', () => {
    const worker = readFileSync(workerSourcePath, 'utf8');
    const operatorConsole = readFileSync(operatorConsolePath, 'utf8');
    expect(operatorConsole).toContain('Fill Date');
    expect(operatorConsole).toContain('Review &amp; Verify');
    expect(operatorConsole).toContain('data-role="verifier"');
    expect(operatorConsole).toContain('Independent deterministic reviewer integrated into this installed Agent');
    expect(operatorConsole).toContain('Agent command acknowledgement timed out.');
    expect(operatorConsole).toContain('Reset Session');
    expect(operatorConsole).toContain('role="toolbar"');
    expect(operatorConsole).toContain("'top:8px'");
    expect(operatorConsole).toContain("'left:50%'");
    expect(operatorConsole).toContain("drag.addEventListener('pointerdown'");
    expect(operatorConsole).toContain("localStorage.setItem(positionKey");
    expect(operatorConsole).not.toContain('data-action="reindex"');
    expect(operatorConsole).toContain('data-action="detect-date"');
    expect(operatorConsole).toContain('Use Open Date');
    expect(operatorConsole).toContain('data-role="collapse"');
    expect(operatorConsole).toContain('BOTTOM_ACTION_CLEARANCE = 96');
    expect(operatorConsole).toContain(':host([data-collapsed="true"])');
    expect(worker).toContain('previousErrorMessage:');
    expect(worker).toContain("type: 'trip_staging_failed'");
    expect(worker).toContain('errorMessage: String(error?.message || error).slice(0, 2000)');
    expect(worker).toContain('await installWellTransOperatorConsole(session.page, handleOperatorCommand)');
    expect(worker).toContain('operatorControl.dateOverride');
    expect(worker).toContain("action === 'restart'");
    expect(worker).toContain('operatorControl.fatalReviewError');
    expect(worker).toContain("operatorControl.message = 'The previous review is unsafe. Starting a clean session, then filling the opened date.'");
    expect(worker).toContain('return currentDate;');
  });

  it('runs an exhaustive pre-Apply audit and automatically repairs mismatched trips', () => {
    const worker = readFileSync(workerSourcePath, 'utf8');
    expect(worker).toContain('async function auditStagedReviewBatch(page, serviceDate)');
    expect(worker).toContain("stage: 'correction_command_pending'");
    expect(worker).toContain('buildVerificationDecision');
    expect(worker).toContain('validateCorrectionCommand');
    expect(worker).toContain("state: 'verifying_every_field'");
    expect(worker).toContain('finalReviewAuditValid');
    expect(worker).toContain('verifiedFields');
    expect(worker).toContain('&& summary.coverageComplete');
    expect(worker).toContain('blockedBookingIds');
    expect(worker).toContain('expected trip(s) remain blocked or missing');
    expect(worker).toContain("state: finalReviewAuditValid");
  });

  it('automatically starts a clean session after the operator closes an unsafe review', () => {
    const worker = readFileSync(workerSourcePath, 'utf8');
    expect(worker).toContain('if (reviewWasOpen && !reviewIsOpen)');
    expect(worker).toContain("process.exitCode = 42");
    expect(worker).toContain('Unsafe review was closed by the operator');
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
    expect(trip).toContain('Resolve the exact Booking ID + Activity +');
    expect(trip).toContain('capabilityKey(row, column, value, expectedKind)');
    expect(trip).not.toContain('return index >= 0 ? cells.nth(index) : null');
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

  it('requeues an unsafe old-version review only in a fresh upgraded browser session', () => {
    const worker = readFileSync(workerSourcePath, 'utf8');
    expect(worker).toContain("latest.data.stage === 'failed_review_close_required'");
    expect(worker).toContain('latest.data.reviewSessionId !== reviewSessionId');
    expect(worker).toContain('latest.data.workerVersion !== workerVersion');
    expect(worker).toContain('recoveredAfterAgentUpgrade: upgradedFreshSessionRecovery');
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
