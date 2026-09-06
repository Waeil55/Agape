"use strict";

const VERIFIED_REVIEW_STATES = new Set([
  "review_batch_verified",
  "review_ready_verified",
]);

function timestampMillis(value) {
  return value?.toMillis?.()
    || value?.toDate?.()?.getTime?.()
    || (value ? new Date(value).getTime() : 0)
    || 0;
}

function versionAtLeast(actual, required) {
  const parse = (value) => String(value || "0").split(".").map((part) => Number(part) || 0);
  const left = parse(actual);
  const right = parse(required);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    if ((left[index] || 0) !== (right[index] || 0)) return (left[index] || 0) > (right[index] || 0);
  }
  return true;
}

function uniqueIds(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizedBooking(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function hasVerifiedEvidence(log, serviceDate, reviewSessionId) {
  const preApply = log?.preApplyVerification;
  const independent = log?.independentVerification;
  const sourceFingerprint = String(log?.stagedSourceFingerprint || "");
  return Boolean(
    log?.verificationRunId
    && sourceFingerprint
    && preApply?.verified === true
    && preApply?.selectedDate === serviceDate
    && preApply?.reviewSessionId === reviewSessionId
    && preApply?.pickupRows === 1
    && preApply?.dropoffRows === 1
    && independent?.status === "verified"
    && independent?.portalVerified === true
    && independent?.serviceDate === serviceDate
    && independent?.reviewSessionId === reviewSessionId
    && independent?.sourceFingerprint === sourceFingerprint
    && normalizedBooking(independent?.bookingId) === normalizedBooking(log?.bookingId)
  );
}

function evaluateWellTransReviewBatch({
  serviceDate,
  reviewSessionId,
  worker = {},
  manifest = {},
  logs = [],
  nowMs = Date.now(),
  minimumWorkerVersion = "5.0.8",
  maxHeartbeatAgeMs = 60_000,
}) {
  const blockers = [];
  const expectedTripIds = uniqueIds(manifest.expectedTripIds);
  const expectedIdSet = new Set(expectedTripIds);
  const state = String(worker.state || "");

  if (worker.selectedDate !== serviceDate) blockers.push("Worker date does not match the requested service date.");
  if (worker.reviewSessionId !== reviewSessionId || !reviewSessionId) blockers.push("Worker browser review session does not match.");
  if (!VERIFIED_REVIEW_STATES.has(state)) blockers.push("Independent pre-Apply verification is not complete.");
  if (!versionAtLeast(worker.version, minimumWorkerVersion)) blockers.push("The installed Agent must be upgraded before confirming Apply.");
  const heartbeatAge = nowMs - timestampMillis(worker.lastSeenAt);
  if (!Number.isFinite(heartbeatAge) || heartbeatAge < 0 || heartbeatAge > maxHeartbeatAgeMs) {
    blockers.push("The Agent heartbeat is stale.");
  }
  const summaryAge = nowMs - timestampMillis(worker.reviewSummaryAt);
  if (!Number.isFinite(summaryAge) || summaryAge < 0 || summaryAge > maxHeartbeatAgeMs) {
    blockers.push("The independent review summary is stale.");
  }
  if (manifest.serviceDate !== serviceDate) blockers.push("Authoritative manifest date does not match.");
  if (manifest.source !== "authoritative_firestore_completed_trip_scan") blockers.push("Authoritative completed-trip manifest is missing.");
  if (!manifest.orchestrationId) blockers.push("Authoritative reconciliation run ID is missing.");
  if (!expectedTripIds.length) blockers.push("The authoritative manifest contains no completed trips.");
  if (Number(manifest.expectedCount ?? expectedTripIds.length) !== expectedTripIds.length) blockers.push("Manifest trip count is inconsistent.");
  if (Number(manifest.blockedCount || 0) !== 0) blockers.push("Manifest contains blocked trips.");
  if (worker.scopeType !== manifest.scopeType
    || String(worker.scopeDriverId || "") !== String(manifest.scopeDriverId || "")) {
    blockers.push("Worker scope does not match the authoritative manifest.");
  }

  const latestByTrip = new Map();
  for (const log of logs) {
    const tripId = String(log?.tripId || "");
    if (!tripId) continue;
    const updatedAt = timestampMillis(log.updatedAt || log.createdAt);
    const current = latestByTrip.get(tripId);
    if (!current || updatedAt > current.updatedAt) latestByTrip.set(tripId, { data: log, updatedAt });
  }

  const duplicateStagedTrips = new Set();
  const stagedSeen = new Set();
  for (const log of logs) {
    const tripId = String(log?.tripId || "");
    if (log?.status !== "awaiting_review" || log?.reviewSessionId !== reviewSessionId || !tripId) continue;
    if (stagedSeen.has(tripId)) duplicateStagedTrips.add(tripId);
    stagedSeen.add(tripId);
  }
  if (duplicateStagedTrips.size) blockers.push("The review session contains duplicate staged trip records.");

  const stagedLogs = [];
  let completed = 0;
  let pending = 0;
  let processing = 0;
  let failed = 0;
  let missing = 0;
  for (const tripId of expectedTripIds) {
    const log = latestByTrip.get(tripId)?.data;
    if (!log) {
      missing += 1;
    } else if (log.status === "awaiting_review" && log.reviewSessionId === reviewSessionId) {
      stagedLogs.push(log);
      if (!hasVerifiedEvidence(log, serviceDate, reviewSessionId)) {
        blockers.push(`Booking ${log.bookingId || tripId} lacks complete independent pre-Apply evidence.`);
      }
    } else if (log.status === "completed"
      && log.portalVerification?.verified === true
      && log.portalVerification?.reviewSessionId === reviewSessionId) {
      completed += 1;
    } else if (log.status === "pending") {
      pending += 1;
    } else if (log.status === "processing") {
      processing += 1;
    } else if (log.status === "failed") {
      failed += 1;
    } else {
      missing += 1;
    }
  }
  const foreignStaged = [...latestByTrip.entries()].filter(([tripId, item]) =>
    item.data.status === "awaiting_review"
    && item.data.reviewSessionId === reviewSessionId
    && !expectedIdSet.has(tripId));
  if (foreignStaged.length) blockers.push("The review session contains staged trips outside the authoritative scope.");
  if (!stagedLogs.length) blockers.push("No verified staged trips belong to this review session.");
  if (processing || failed || missing) blockers.push("The review contains processing, failed, missing, or stale trip records.");

  const summary = worker.reviewSummary || {};
  const verified = stagedLogs.length + completed;
  if (Number(summary.total ?? -1) !== expectedTripIds.length
    || Number(summary.staged ?? -1) !== stagedLogs.length
    || Number(summary.completed ?? -1) !== completed
    || Number(summary.pending ?? -1) !== pending
    || Number(summary.processing ?? -1) !== processing
    || Number(summary.failed ?? -1) !== failed
    || Number(summary.missing ?? -1) !== missing
    || Number(summary.verified ?? -1) !== verified) {
    blockers.push("Worker review summary does not match the authoritative live records.");
  }
  if (Number(summary.blocked || 0) !== 0) blockers.push("Worker review summary contains blocked trips.");
  if (Number(worker.reviewBatchStaged ?? -1) !== stagedLogs.length) blockers.push("Worker staged count does not match the live review batch.");
  if (Number(worker.reviewBatchRemaining ?? -1) !== pending) blockers.push("Worker remaining count does not match the live queue.");
  if (state === "review_ready_verified"
    && (pending !== 0 || summary.coverageComplete !== true || verified !== expectedTripIds.length)) {
    blockers.push("Final review does not have complete authoritative coverage.");
  }
  if (state === "review_batch_verified"
    && (pending < 1 || verified + pending !== expectedTripIds.length)) {
    blockers.push("Partial review batch does not account for every remaining trip.");
  }

  return {
    ready: blockers.length === 0,
    blockers: [...new Set(blockers)],
    stagedLogs,
    expectedTripIds,
    counts: { staged: stagedLogs.length, completed, pending, processing, failed, missing, verified },
  };
}

module.exports = {
  evaluateWellTransReviewBatch,
  hasVerifiedEvidence,
  versionAtLeast,
};
