import { describe, expect, it } from 'vitest';
import { buildWellTransReviewState } from './welltransReviewState';

const verifiedStagedLog = (tripId = 'trip-1') => ({
  tripId,
  bookingId: `booking-${tripId}`,
  status: 'awaiting_review',
  reviewSessionId: 'session-1',
  stagedSourceFingerprint: `source-${tripId}`,
  verificationRunId: `verification-${tripId}`,
  preApplyVerification: {
    verified: true,
    selectedDate: '2026-09-06',
    reviewSessionId: 'session-1',
    pickupRows: 1,
    dropoffRows: 1,
  },
  independentVerification: {
    status: 'verified',
    portalVerified: true,
    bookingId: `booking-${tripId}`,
    serviceDate: '2026-09-06',
    reviewSessionId: 'session-1',
    sourceFingerprint: `source-${tripId}`,
  },
});

const manifest = {
  serviceDate: '2026-09-06',
  source: 'authoritative_firestore_completed_trip_scan',
  scopeType: 'all',
  scopeDriverId: null,
  expectedTripIds: ['trip-1'],
  expectedCount: 1,
  blockedCount: 0,
};

const worker = {
  workerInstanceId: 'workstation-session-1',
  state: 'review_ready_verified',
  selectedDate: '2026-09-06',
  reviewSessionId: 'session-1',
  scopeType: 'all',
  scopeDriverId: null,
  reviewBatchStaged: 1,
  reviewBatchRemaining: 0,
  reviewSummary: {
    total: 1, staged: 1, completed: 0, pending: 0,
    processing: 0, failed: 0, missing: 0, verified: 1,
    coverageComplete: true,
  },
};

it('unlocks review confirmation only for an exact verified date and browser session', () => {
  const state = buildWellTransReviewState({
    serviceDate: '2026-09-06', worker, manifest, workerOnline: true,
    completedTripIds: ['trip-1'], currentLogs: [verifiedStagedLog()],
  });
  expect(state.ready).toBe(true);
  expect(state.stagedCount).toBe(1);
});

it('blocks a stale worker batch from another selected date', () => {
  const state = buildWellTransReviewState({
    serviceDate: '2026-09-07', worker, manifest: null, workerOnline: true,
    completedTripIds: [], currentLogs: [],
  });
  expect(state.ready).toBe(false);
  expect(state.stagedCount).toBe(0);
  expect(state.reasons.join(' ')).toContain('different service date');
});

it('blocks a staged row whose independent evidence is missing', () => {
  const log = verifiedStagedLog();
  delete log.independentVerification;
  const state = buildWellTransReviewState({
    serviceDate: '2026-09-06', worker, manifest, workerOnline: true,
    completedTripIds: ['trip-1'], currentLogs: [log],
  });
  expect(state.ready).toBe(false);
  expect(state.reasons.join(' ')).toContain('missing independent pre-Apply evidence');
});

describe('partial review batches', () => {
  it('permits only an accounted verified batch with pending trips', () => {
    const pending = { tripId: 'trip-2', status: 'pending' };
    const state = buildWellTransReviewState({
      serviceDate: '2026-09-06',
      worker: {
        ...worker,
        state: 'review_batch_verified',
        reviewBatchRemaining: 1,
        reviewSummary: {
          ...worker.reviewSummary,
          total: 2,
          pending: 1,
          verified: 1,
          coverageComplete: false,
        },
      },
      manifest: { ...manifest, expectedTripIds: ['trip-1', 'trip-2'], expectedCount: 2 },
      workerOnline: true,
      completedTripIds: ['trip-1', 'trip-2'],
      currentLogs: [verifiedStagedLog(), pending],
    });
    expect(state.ready).toBe(true);
  });
});
