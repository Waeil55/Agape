"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { evaluateWellTransReviewBatch } = require("./welltransReviewGuard");

const nowMs = Date.parse("2026-09-06T16:00:00Z");
const stagedLog = {
  id: "log-1",
  tripId: "trip-1",
  bookingId: "1001",
  status: "awaiting_review",
  reviewSessionId: "session-1",
  stagedSourceFingerprint: "source-1",
  verificationRunId: "verify-1",
  updatedAt: nowMs - 1_000,
  preApplyVerification: {
    verified: true,
    selectedDate: "2026-09-06",
    reviewSessionId: "session-1",
    pickupRows: 1,
    dropoffRows: 1,
  },
  independentVerification: {
    status: "verified",
    portalVerified: true,
    bookingId: "1001",
    serviceDate: "2026-09-06",
    reviewSessionId: "session-1",
    sourceFingerprint: "source-1",
  },
};
const manifest = {
  serviceDate: "2026-09-06",
  source: "authoritative_firestore_completed_trip_scan",
  orchestrationId: "run-1",
  scopeType: "all",
  scopeDriverId: null,
  expectedTripIds: ["trip-1"],
  expectedCount: 1,
  blockedCount: 0,
};
const worker = {
  version: "5.0.7",
  state: "review_ready_verified",
  selectedDate: "2026-09-06",
  reviewSessionId: "session-1",
  scopeType: "all",
  scopeDriverId: null,
  lastSeenAt: nowMs - 1_000,
  reviewSummaryAt: nowMs - 1_000,
  reviewBatchStaged: 1,
  reviewBatchRemaining: 0,
  reviewSummary: {
    total: 1, staged: 1, completed: 0, pending: 0, processing: 0,
    failed: 0, missing: 0, blocked: 0, verified: 1, coverageComplete: true,
  },
};

describe("WellTrans review confirmation guard", () => {
  it("accepts only a live independently verified exact-date batch", () => {
    const result = evaluateWellTransReviewBatch({
      serviceDate: "2026-09-06", reviewSessionId: "session-1",
      worker, manifest, logs: [stagedLog], nowMs,
    });
    assert.equal(result.ready, true);
    assert.equal(result.counts.staged, 1);
  });

  it("blocks stale dates and missing evidence", () => {
    const unsafeLog = { ...stagedLog, independentVerification: null };
    const result = evaluateWellTransReviewBatch({
      serviceDate: "2026-09-07", reviewSessionId: "session-1",
      worker, manifest, logs: [unsafeLog], nowMs,
    });
    assert.equal(result.ready, false);
    assert.match(result.blockers.join(" "), /date does not match/i);
    assert.match(result.blockers.join(" "), /lacks complete independent/i);
  });

  it("blocks duplicate staged records for one trip", () => {
    const result = evaluateWellTransReviewBatch({
      serviceDate: "2026-09-06", reviewSessionId: "session-1",
      worker, manifest, logs: [stagedLog, { ...stagedLog, id: "log-2" }], nowMs,
    });
    assert.equal(result.ready, false);
    assert.match(result.blockers.join(" "), /duplicate staged/i);
  });

  it("accepts an independently verified partial batch only when pending trips are accounted for", () => {
    const result = evaluateWellTransReviewBatch({
      serviceDate: "2026-09-06", reviewSessionId: "session-1",
      worker: {
        ...worker,
        state: "review_batch_verified",
        reviewBatchRemaining: 1,
        reviewSummary: {
          ...worker.reviewSummary,
          total: 2, pending: 1, verified: 1, coverageComplete: false,
        },
      },
      manifest: { ...manifest, expectedTripIds: ["trip-1", "trip-2"], expectedCount: 2 },
      logs: [stagedLog, { id: "log-2", tripId: "trip-2", status: "pending", updatedAt: nowMs - 1_000 }],
      nowMs,
    });
    assert.equal(result.ready, true);
  });
});
