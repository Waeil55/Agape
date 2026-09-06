const VERIFIED_REVIEW_STATES = new Set([
  'review_batch_verified',
  'review_ready_verified',
]);

const normalizeIds = values => [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))];

const sameIds = (left, right) => {
  const a = normalizeIds(left).sort();
  const b = normalizeIds(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
};

const normalizeBooking = value => String(value || '').replace(/\s+/g, '').toLowerCase();

const hasVerifiedReviewEvidence = (log, serviceDate, reviewSessionId) => {
  const preApply = log?.preApplyVerification;
  const independent = log?.independentVerification;
  const sourceFingerprint = String(log?.stagedSourceFingerprint || '');
  return Boolean(
    log?.verificationRunId
    && sourceFingerprint
    && preApply?.verified === true
    && preApply?.selectedDate === serviceDate
    && preApply?.reviewSessionId === reviewSessionId
    && preApply?.pickupRows === 1
    && preApply?.dropoffRows === 1
    && independent?.status === 'verified'
    && independent?.portalVerified === true
    && independent?.serviceDate === serviceDate
    && independent?.reviewSessionId === reviewSessionId
    && independent?.sourceFingerprint === sourceFingerprint
    && normalizeBooking(independent?.bookingId) === normalizeBooking(log?.bookingId)
  );
};

export const buildWellTransReviewState = ({
  serviceDate,
  worker,
  manifest,
  workerOnline,
  completedTripIds = [],
  currentLogs = [],
}) => {
  const reasons = [];
  const reviewSessionId = String(worker?.reviewSessionId || '').trim();
  const expectedTripIds = normalizeIds(manifest?.expectedTripIds);
  const completedIds = normalizeIds(completedTripIds);
  const expectedIdSet = new Set(expectedTripIds);
  const latestByTrip = new Map(currentLogs.map(log => [String(log?.tripId || ''), log]));
  const reviewState = String(worker?.state || '');

  if (!completedIds.length) reasons.push('The selected date has no completed trips.');
  if (!workerOnline) reasons.push('The local Agent is offline.');
  if (!worker?.workerInstanceId) reasons.push('The live Agent instance ID is missing.');
  if (worker?.selectedDate !== serviceDate) reasons.push('The Agent is open on a different service date.');
  if (!VERIFIED_REVIEW_STATES.has(reviewState)) reasons.push('The independent pre-Apply review is not complete.');
  if (!reviewSessionId) reasons.push('The live browser review session is missing.');
  if (!manifest || manifest.serviceDate !== serviceDate) reasons.push('The authoritative date manifest is missing.');
  if (manifest?.source !== 'authoritative_firestore_completed_trip_scan') {
    reasons.push('The date manifest was not built from the authoritative completed-trip scan.');
  }
  if (!sameIds(expectedTripIds, completedIds)) reasons.push('The manifest does not exactly match the selected trip scope.');
  if (Number(manifest?.expectedCount ?? expectedTripIds.length) !== expectedTripIds.length) {
    reasons.push('The manifest trip count is inconsistent.');
  }
  if (Number(manifest?.blockedCount || 0) > 0) reasons.push('The manifest contains blocked trips.');
  if (worker?.scopeType && manifest?.scopeType && worker.scopeType !== manifest.scopeType) {
    reasons.push('The Agent and manifest scopes do not match.');
  }
  if (String(worker?.scopeDriverId || '') !== String(manifest?.scopeDriverId || '')) {
    reasons.push('The Agent and manifest driver scopes do not match.');
  }

  const stagedLogs = [];
  let completed = 0;
  let pending = 0;
  let processing = 0;
  let failed = 0;
  let missing = 0;
  for (const tripId of expectedTripIds) {
    const log = latestByTrip.get(tripId);
    if (!log) {
      missing += 1;
    } else if (log.status === 'awaiting_review' && log.reviewSessionId === reviewSessionId) {
      stagedLogs.push(log);
      if (!hasVerifiedReviewEvidence(log, serviceDate, reviewSessionId)) {
        reasons.push(`Trip ${log.bookingId || tripId} is missing independent pre-Apply evidence.`);
      }
    } else if (log.status === 'completed'
      && log.portalVerification?.verified === true
      && log.portalVerification?.reviewSessionId === reviewSessionId) {
      completed += 1;
    } else if (log.status === 'pending') {
      pending += 1;
    } else if (log.status === 'processing') {
      processing += 1;
    } else if (log.status === 'failed') {
      failed += 1;
    } else {
      missing += 1;
    }
  }

  const foreignStaged = currentLogs.filter(log => log?.status === 'awaiting_review'
    && log?.reviewSessionId === reviewSessionId
    && !expectedIdSet.has(String(log?.tripId || '')));
  if (foreignStaged.length) reasons.push('The live review session contains trips outside the selected scope.');
  if (!stagedLogs.length) reasons.push('No independently verified staged trips are open for review.');
  if (processing || failed || missing) reasons.push('The selected review contains incomplete or failed trips.');

  const summary = worker?.reviewSummary || {};
  const summaryVerified = stagedLogs.length + completed;
  if (Number(summary.total ?? -1) !== expectedTripIds.length
    || Number(summary.staged ?? -1) !== stagedLogs.length
    || Number(summary.completed ?? -1) !== completed
    || Number(summary.pending ?? -1) !== pending
    || Number(summary.processing ?? -1) !== processing
    || Number(summary.failed ?? -1) !== failed
    || Number(summary.missing ?? -1) !== missing
    || Number(summary.verified ?? -1) !== summaryVerified) {
    reasons.push('The Agent review summary does not match the live trip records.');
  }
  if (Number(worker?.reviewBatchStaged ?? -1) !== stagedLogs.length) {
    reasons.push('The Agent staged-batch count does not match the live review rows.');
  }
  if (Number(worker?.reviewBatchRemaining ?? -1) !== pending) {
    reasons.push('The Agent remaining-trip count does not match the live queue.');
  }
  if (reviewState === 'review_ready_verified'
    && (pending !== 0 || summary?.coverageComplete !== true || summaryVerified !== expectedTripIds.length)) {
    reasons.push('The final review does not have complete date coverage.');
  }
  if (reviewState === 'review_batch_verified'
    && (pending < 1 || summaryVerified + pending !== expectedTripIds.length)) {
    reasons.push('The partial review batch does not account for every remaining trip.');
  }

  return {
    ready: reasons.length === 0,
    reasons: [...new Set(reasons)],
    stagedCount: stagedLogs.length,
    reviewSessionId,
  };
};

export { hasVerifiedReviewEvidence };
