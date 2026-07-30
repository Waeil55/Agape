import { applicationDefault, initializeApp } from 'firebase-admin/app';
import {
  FieldPath,
  FieldValue,
  Timestamp,
  getFirestore,
} from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { performManualLogin } from './welltrans.login.js';
import { openWellTransBrowser } from './welltrans.browser.js';
import {
  auditWellTransTrip,
  buildWellTransGridIndex,
  getSelectedPortalDate,
  isEditItineraryOpen,
  syncWellTransTrip,
  validateWellTransTrip,
} from './welltrans.trip.js';
import { normalizeServiceDate, validateTripForWellTrans } from './welltrans.mapping.js';

initializeApp({
  credential: applicationDefault(),
  projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'agape-95c9f',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'agape-95c9f.firebasestorage.app',
});
const db = getFirestore();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const wellTransSourceFingerprint = payload => createHash('sha256')
  .update(JSON.stringify({
    bookingId: payload.bookingId,
    serviceDate: payload.serviceDate,
    driver: payload.driver,
    vehicle: payload.vehicle,
    pickup: payload.pickup,
    dropoff: payload.dropoff,
  }))
  .digest('hex');
const workerId = process.env.COMPUTERNAME || process.env.HOSTNAME || 'worker';
const workerInstanceId = `${workerId}-${randomUUID()}`;
const workerVersion = '3.3.0';
let requestedServiceDate = '';
let activeServiceDate = '';
let reviewSessionId = '';
let lastCompletedPortalAuditAt = 0;
let lastAuthoritativeReconcileAt = 0;
let portalGridIndex = null;
const stagingDurations = [];
const firestorePageSize = Math.min(
  1000,
  Math.max(100, Number(process.env.WELLTRANS_FIRESTORE_PAGE_SIZE) || 500),
);
const reviewBatchSize = Math.min(
  500,
  Math.max(25, Number(process.env.WELLTRANS_REVIEW_BATCH_SIZE) || 250),
);
const heartbeatPayload = state => ({
  workerId, state, writesEnabled: process.env.WELLTRANS_ENABLE_WRITES === 'true',
  adapter: 'tripspark-novusmed', lastSeenAt: FieldValue.serverTimestamp(),
  version: workerVersion, requestedDate: requestedServiceDate || null,
  selectedDate: activeServiceDate || null,
  reviewSessionId: reviewSessionId || null,
  workerInstanceId,
  indexedBookings: portalGridIndex?.bookingCount || 0,
  indexedRows: portalGridIndex?.rowCount || 0,
  throughputPerMinute: stagingDurations.length
    ? Number((60_000 / (stagingDurations.reduce((sum, value) => sum + value, 0) / stagingDurations.length)).toFixed(1))
    : 0,
});
const publishHeartbeat = (state = 'online') => Promise.all([
  db.doc('welltrans_worker_status/primary').set(heartbeatPayload(state), { merge: true }),
  db.doc(`welltrans_workers/${workerInstanceId}`).set(heartbeatPayload(state), { merge: true }),
]);

async function commitSyncTransition(ref, update, event = {}) {
  const batch = db.batch();
  batch.update(ref, update);
  batch.set(db.collection('welltrans_sync_events').doc(), {
    provider: 'welltrans',
    logId: ref.id,
    tripId: event.tripId || null,
    bookingId: event.bookingId || null,
    serviceDate: event.serviceDate || null,
    type: event.type || 'state_transition',
    status: event.status || update.status || null,
    stage: event.stage || update.stage || null,
    sourceFingerprint: event.sourceFingerprint || null,
    portalVerified: event.portalVerified === true,
    reviewSessionId: reviewSessionId || null,
    workerId,
    workerInstanceId,
    workerVersion,
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
}
const assertAllowedPortal = value => {
  const url = new URL(value);
  const configured = (process.env.WELLTRANS_ALLOWED_HOSTS || new URL(process.env.WELLTRANS_PORTAL_URL).hostname)
    .split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
  if (url.protocol !== 'https:' || !configured.includes(url.hostname.toLowerCase())) {
    throw new Error(`Portal host ${url.hostname} is not in WELLTRANS_ALLOWED_HOSTS`);
  }
  return url.toString();
};

async function loadAllQueryDocuments(baseQuery, pageSize = firestorePageSize) {
  const documents = [];
  let cursor = null;
  do {
    let pageQuery = baseQuery
      .orderBy(FieldPath.documentId())
      .limit(pageSize);
    if (cursor) pageQuery = pageQuery.startAfter(cursor);
    const snapshot = await pageQuery.get();
    documents.push(...snapshot.docs);
    cursor = snapshot.docs.at(-1) || null;
    if (snapshot.size < pageSize) break;
  } while (cursor);
  return documents;
}

const loadAllLogsForDate = serviceDate =>
  loadAllQueryDocuments(
    db.collection('welltrans_sync_logs').where('serviceDate', '==', serviceDate),
  );

const readRequestedServiceDate = async () => {
  if (!process.env.WELLTRANS_REQUEST_FILE) return '';
  const value = String(await readFile(process.env.WELLTRANS_REQUEST_FILE, 'utf8').catch(() => '')).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
};

const readVisiblePortalDate = async (page, fallback = '') => {
  const runName = await page.locator('.RunName').last().innerText({ timeout: 1500 }).catch(() => '');
  const match = String(runName).match(/\[(\d{2})-(\d{2})-(\d{4})\]/);
  return match ? `${match[3]}-${match[1]}-${match[2]}` : fallback;
};

async function selectExactRequestedSchedule(page, serviceDate) {
  const [year, month, day] = serviceDate.split('-');
  const exactLabels = new Set([
    `${month}/${day}/${year}`,
    `${month}-${day}-${year}`,
    `[${month}-${day}-${year}]`,
  ]);
  const exactMatches = [];
  for (const frame of page.frames()) {
    const candidates = frame.locator(
      '.GridCell:visible, [role="gridcell"]:visible, option:visible, [role="option"]:visible',
    );
    const count = Math.min(await candidates.count().catch(() => 0), 250);
    for (let index = 0; index < count; index += 1) {
      const candidate = candidates.nth(index);
      const value = await candidate.evaluate(element =>
        String(element.title || element.textContent || '').trim()).catch(() => '');
      if (exactLabels.has(value)) exactMatches.push(candidate);
    }
  }
  if (exactMatches.length !== 1) return false;

  await exactMatches[0].click({ force: true });
  for (const frame of page.frames()) {
    const proceed = frame.getByRole('button', { name: 'Proceed', exact: true }).last();
    if (await proceed.isVisible().catch(() => false)) {
      await proceed.click();
      break;
    }
  }
  await page.waitForTimeout(500);
  return true;
}

async function waitForRequestedSchedule(page, selectedDate) {
  requestedServiceDate = await readRequestedServiceDate();
  if (!requestedServiceDate || requestedServiceDate === selectedDate) return selectedDate;

  const scheduleControl = page.locator('.ChangeSchedule[title="Select Schedule"]:visible').last();
  if (await scheduleControl.count()) {
    await scheduleControl.click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    await selectExactRequestedSchedule(page, requestedServiceDate).catch(() => false);
  }

  while (page.context().browser()?.isConnected()) {
    const currentDate = await readVisiblePortalDate(page, selectedDate);
    requestedServiceDate = await readRequestedServiceDate() || requestedServiceDate;
    if (currentDate === requestedServiceDate) {
      await db.doc('welltrans_worker_status/primary').set({
        state: 'connecting', selectedDate: currentDate, requestedDate: requestedServiceDate,
        lastSeenAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return currentDate;
    }
    await db.doc('welltrans_worker_status/primary').set({
      state: 'date_selection_required', selectedDate: currentDate,
      requestedDate: requestedServiceDate, lastSeenAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await sleep(1000);
  }
  throw new Error('The WellTrans browser closed before the requested schedule was selected.');
}

async function listPendingJobIdsForDate(serviceDate, limit = reviewBatchSize) {
  const snapshot = await db.collection('welltrans_sync_logs')
    .where('serviceDate', '==', serviceDate)
    .where('status', '==', 'pending')
    .limit(Math.max(1, Math.min(reviewBatchSize, limit)))
    .get();
  const candidates = [...snapshot.docs].sort((left, right) => {
    const leftTime = left.data().createdAt?.toMillis?.() || 0;
    const rightTime = right.data().createdAt?.toMillis?.() || 0;
    return leftTime - rightTime;
  });
  return candidates.map(document => document.id);
}

async function claimJobById(logId) {
  const ref = db.doc(`welltrans_sync_logs/${logId}`);
  return db.runTransaction(async transaction => {
    const fresh = await transaction.get(ref);
    if (!fresh.exists) throw new Error(`WellTrans sync log ${logId} was not found`);
    if (fresh.data().status !== 'pending') throw new Error(`WellTrans sync log ${logId} is ${fresh.data().status}, not pending`);
    transaction.update(ref, {
      status: 'processing', stage: 'claimed', startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(), leaseExpiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
      attempt: FieldValue.increment(1), workerId, workerInstanceId,
    });
    return { id: fresh.id, ref, ...fresh.data() };
  });
}

async function acquireDateLease(serviceDate) {
  const ref = db.doc(`welltrans_sync_leases/${serviceDate}`);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const lease = snapshot.exists ? snapshot.data() || {} : {};
    const expiresAt = lease.expiresAt?.toMillis?.() || 0;
    if (expiresAt > Date.now() && lease.ownerInstanceId !== workerInstanceId) {
      return false;
    }
    transaction.set(ref, {
      provider: 'welltrans',
      serviceDate,
      ownerInstanceId: workerInstanceId,
      workerId,
      fencingToken: lease.ownerInstanceId === workerInstanceId
        ? Number(lease.fencingToken || 1)
        : Number(lease.fencingToken || 0) + 1,
      expiresAt: Timestamp.fromMillis(Date.now() + 45_000),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
}

async function waitForDateLease(serviceDate) {
  while (!await acquireDateLease(serviceDate)) {
    await publishHeartbeat('lease_standby');
    await sleep(5000);
  }
}

async function publishDateReviewSummary(serviceDate) {
  const [documents, manifestSnapshot] = await Promise.all([
    loadAllLogsForDate(serviceDate),
    db.doc(`welltrans_sync_manifests/${serviceDate}`).get(),
  ]);
  const latestByTrip = new Map();
  for (const document of documents) {
    const data = document.data();
    const key = String(data.tripId);
    const current = latestByTrip.get(key);
    const updatedAt = data.updatedAt?.toMillis?.() || data.createdAt?.toMillis?.() || 0;
    if (!current || updatedAt > current.updatedAt) {
      latestByTrip.set(key, {
        status: data.status,
        reviewSessionId: data.reviewSessionId || '',
        portalReviewSessionId: data.portalVerification?.reviewSessionId || '',
        portalVerified: data.portalVerification?.verified === true,
        updatedAt,
      });
    }
  }
  const manifest = manifestSnapshot.exists ? manifestSnapshot.data() || {} : {};
  const expectedTripIds = manifestSnapshot.exists
    ? [...new Set((manifest.expectedTripIds || []).map(String))]
    : [...latestByTrip.keys()];
  const summary = {
    total: expectedTripIds.length,
    staged: 0,
    completed: 0,
    failed: 0,
    pending: 0,
    processing: 0,
    missing: 0,
    unverifiedCompleted: 0,
    blocked: Number(manifest.blockedCount || 0),
  };
  for (const tripId of expectedTripIds) {
    const item = latestByTrip.get(tripId);
    if (!item) {
      summary.missing += 1;
      continue;
    }
    if (item.status === 'awaiting_review' && item.reviewSessionId === reviewSessionId) {
      summary.staged += 1;
    } else if (item.status === 'awaiting_review') {
      summary.missing += 1;
    }
    else if (item.status === 'completed'
      && item.portalVerified
      && item.portalReviewSessionId === reviewSessionId) {
      summary.completed += 1;
    } else if (item.status === 'completed') {
      summary.missing += 1;
      summary.unverifiedCompleted += 1;
    } else if (Object.hasOwn(summary, item.status)) summary[item.status] += 1;
  }
  const verified = summary.staged + summary.completed;
  const coverageComplete = summary.total > 0
    && verified === summary.total
    && summary.failed === 0
    && summary.pending === 0
    && summary.processing === 0
    && summary.missing === 0
    && summary.blocked === 0;
  const state = coverageComplete
    ? (summary.staged > 0 ? 'review_ready' : 'completed')
    : (summary.failed || summary.blocked || summary.missing ? 'reconciliation_blocked' : 'calibrated');
  const update = {
    state,
    selectedDate: serviceDate,
    reviewSummary: { ...summary, verified, coverageComplete },
    reviewSummaryAt: FieldValue.serverTimestamp(),
    indexedBookings: portalGridIndex?.bookingCount || 0,
    indexedRows: portalGridIndex?.rowCount || 0,
    averageTripMs: stagingDurations.length
      ? Math.round(stagingDurations.reduce((sum, value) => sum + value, 0) / stagingDurations.length)
      : 0,
    throughputPerMinute: stagingDurations.length
      ? Number((60_000 / (stagingDurations.reduce((sum, value) => sum + value, 0) / stagingDurations.length)).toFixed(1))
      : 0,
    estimatedMinutesRemaining: stagingDurations.length
      ? Number(((summary.pending * (stagingDurations.reduce((sum, value) => sum + value, 0) / stagingDurations.length)) / 60_000).toFixed(1))
      : null,
  };
  const writes = [db.doc('welltrans_worker_status/primary').set(update, { merge: true })];
  if (manifestSnapshot.exists) {
    writes.push(manifestSnapshot.ref.set({
      state,
      stagedCount: summary.staged,
      completedCount: summary.completed,
      pendingCount: summary.pending,
      processingCount: summary.processing,
      failedCount: summary.failed,
      missingCount: summary.missing,
      verifiedCount: verified,
      coverageComplete,
      workerVersion,
      reconciledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }));
  }
  await Promise.all(writes);
  return summary;
}

async function recoverStaleReviewJobs(serviceDate) {
  const documents = await loadAllLogsForDate(serviceDate);
  const latestByTrip = new Map();
  for (const document of documents) {
    const data = document.data();
    const key = String(data.tripId);
    const current = latestByTrip.get(key);
    const updatedAt = data.updatedAt?.toMillis?.() || data.createdAt?.toMillis?.() || 0;
    if (!current || updatedAt > current.updatedAt) {
      latestByTrip.set(key, { ref: document.ref, data, updatedAt });
    }
  }
  const stale = [...latestByTrip.values()].filter(item =>
    item.data.status === 'awaiting_review'
    && item.data.reviewSessionId !== reviewSessionId);
  for (let offset = 0; offset < stale.length; offset += 400) {
    const batch = db.batch();
    for (const item of stale.slice(offset, offset + 400)) {
      batch.update(item.ref, {
        status: 'pending',
        stage: 'requeued_for_new_review_session',
        previousReviewSessionId: item.data.reviewSessionId || null,
        reviewSessionId,
        stagedAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
        leaseExpiresAt: FieldValue.delete(),
        errorMessage: '',
      });
    }
    await batch.commit();
  }
  return stale.length;
}

async function resolveBookingAlias(sourceBookingId, serviceDate) {
  const snapshot = await db.doc(`welltrans_booking_aliases/${sourceBookingId}`).get();
  if (!snapshot.exists) return null;
  const alias = snapshot.data() || {};
  const portalBookingId = String(alias.portalBookingId || '').trim();
  const valid = alias.status === 'active'
    && alias.provider === 'welltrans'
    && String(alias.sourceBookingId || '') === String(sourceBookingId)
    && String(alias.serviceDate || '').slice(0, 10) === serviceDate
    && /^\d+$/.test(portalBookingId)
    && alias.matchMethod === 'supervised_unique_composite';
  if (!valid) {
    throw new Error(`WellTrans booking alias for ${sourceBookingId} failed integrity validation`);
  }
  return { id: snapshot.id, portalBookingId, matchMethod: alias.matchMethod };
}

async function buildCurrentPortalPayload(tripId) {
  const tripSnapshot = await db.doc(`trips/${tripId}`).get();
  if (!tripSnapshot.exists) throw new Error(`Source trip ${tripId} no longer exists`);
  const trip = tripSnapshot.data() || {};
  const settings = (await db.doc('welltrans_settings/primary').get()).data() || {};
  const driverSnapshot = trip.driverId ? await db.doc(`drivers/${trip.driverId}`).get() : null;
  const hydratedTrip = {
    id: tripSnapshot.id,
    ...trip,
    completedDriverName: driverSnapshot?.exists
      ? driverSnapshot.data().name
      : trip.completedDriverName,
  };
  const validation = validateTripForWellTrans(hydratedTrip);
  if (!validation.valid) {
    throw new Error(`Source trip is not ready: ${validation.errors.join('; ')}`);
  }
  const bookingAlias = await resolveBookingAlias(
    validation.payload.bookingId,
    validation.payload.serviceDate,
  );
  const payload = {
    ...validation.payload,
    bookingId: bookingAlias?.portalBookingId || validation.payload.bookingId,
    driver: settings.driverValueMapping?.[validation.payload.driver] || validation.payload.driver,
    vehicle: settings.vehicleValueMapping?.[validation.payload.vehicle] || validation.payload.vehicle,
  };
  return {
    tripSnapshot,
    validation,
    bookingAlias,
    payload,
    settings,
    sourceFingerprint: wellTransSourceFingerprint(validation.payload),
  };
}

const isAuthoritativeCompletedTrip = trip => {
  const lifecycle = [
    trip.status, trip.operationalStatus, trip.lifecycleStatus, trip.lifecycleStep,
  ].map(value => String(value || '').trim().toLowerCase()).join(' ');
  if (/cancell?ed/.test(lifecycle)) return false;
  return lifecycle.includes('completed')
    || lifecycle.includes('complete')
    || lifecycle.includes('done')
    || Boolean(trip.completedAt);
};

async function loadAuthoritativeTripsForDate(serviceDate) {
  const outboxSnapshot = await db.collection('welltrans_sync_outbox')
    .where('serviceDate', '==', serviceDate)
    .where('eligibility', '==', 'eligible')
    .get();
  if (outboxSnapshot.size) {
    const outboxByTrip = new Map(outboxSnapshot.docs.map(document => [
      String(document.data().tripId),
      document.data(),
    ]));
    const tripIds = [...outboxByTrip.keys()];
    const documents = [];
    for (let offset = 0; offset < tripIds.length; offset += 300) {
      const refs = tripIds.slice(offset, offset + 300).map(id => db.doc(`trips/${id}`));
      documents.push(...await db.getAll(...refs));
    }
    return documents
      .filter(document => document.exists)
      .map(document => ({
        id: document.id,
        ...document.data(),
        _outboxUpdatedAt: outboxByTrip.get(document.id)?.updatedAt || null,
      }))
      .filter(trip => isAuthoritativeCompletedTrip(trip) && normalizeServiceDate(trip) === serviceDate);
  }

  // One-time legacy bootstrap. Future trip writes are maintained by the
  // captureWellTransTripCompletion trigger.
  const tripsSnapshot = await db.collection('trips').get();
  const trips = tripsSnapshot.docs
    .map(document => ({ id: document.id, ...document.data() }))
    .filter(trip => isAuthoritativeCompletedTrip(trip) && normalizeServiceDate(trip) === serviceDate);
  for (let offset = 0; offset < trips.length; offset += 400) {
    const batch = db.batch();
    for (const trip of trips.slice(offset, offset + 400)) {
      const id = createHash('sha256').update(`welltrans:${serviceDate}:${trip.id}`).digest('hex');
      batch.set(db.doc(`welltrans_sync_outbox/${id}`), {
        provider: 'welltrans',
        tripId: String(trip.id),
        serviceDate,
        eligibility: 'eligible',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
  }
  return trips;
}

async function reconcileAuthoritativeCompletedTrips(serviceDate) {
  const [expectedTrips, logDocuments] = await Promise.all([
    loadAuthoritativeTripsForDate(serviceDate),
    loadAllLogsForDate(serviceDate),
  ]);
  const latestByTrip = new Map();
  for (const document of logDocuments) {
    const data = document.data();
    const key = String(data.tripId);
    const current = latestByTrip.get(key);
    const updatedAt = data.updatedAt?.toMillis?.() || data.createdAt?.toMillis?.() || 0;
    if (!current || updatedAt > current.updatedAt) {
      latestByTrip.set(key, { ref: document.ref, data, updatedAt });
    }
  }

  const blockedTrips = [];
  let queued = 0;
  let covered = 0;
  for (const trip of expectedTrips) {
    const latest = latestByTrip.get(String(trip.id));
    const outboxUpdatedAt = trip._outboxUpdatedAt?.toMillis?.() || 0;
    const logUpdatedAt = latest?.updatedAt || 0;
    if (latest && latest.data.status !== 'failed' && outboxUpdatedAt <= logUpdatedAt) {
      covered += 1;
      continue;
    }
    let current;
    try {
      current = await buildCurrentPortalPayload(trip.id);
    } catch (error) {
      blockedTrips.push({
        tripId: String(trip.id),
        bookingId: String(trip.bookingId || trip.id),
        errors: [String(error?.message || error)],
      });
      continue;
    }

    if (!latest) {
      const ref = db.collection('welltrans_sync_logs').doc();
      await ref.create({
        tripId: String(trip.id),
        bookingId: current.validation.payload.bookingId,
        serviceDate,
        status: 'pending',
        stage: 'queued_by_authoritative_worker_reconciliation',
        startedAt: null,
        completedAt: null,
        errorMessage: '',
        screenshot: '',
        syncedBy: `agent:${workerId}`,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        attempt: 0,
        provider: 'welltrans',
        automationMethod: 'playwright',
        payload: current.validation.payload,
        manifestId: serviceDate,
        queuedSourceFingerprint: current.sourceFingerprint,
        workerVersion,
      });
      queued += 1;
      continue;
    }

    if (latest.data.status === 'failed') {
      const safeRetry = latest.data.stage === 'failed_no_partial_changes'
        || latest.data.mutationStarted !== true
        || latest.data.rollbackVerified === true;
      const retryCount = latest.data.retryWorkerVersion === workerVersion
        ? Number(latest.data.automaticRetryCount || 0)
        : 0;
      if (!safeRetry || retryCount >= 3) {
        blockedTrips.push({
          tripId: String(trip.id),
          bookingId: current.validation.payload.bookingId,
          errors: [
            !safeRetry
              ? (latest.data.errorMessage
                || 'Prior WellTrans mutation could not be safely rolled back')
              : `Automatic retry limit reached: ${latest.data.errorMessage || 'unresolved portal failure'}`,
          ],
        });
        continue;
      }
      await latest.ref.update({
        status: 'pending',
        stage: 'requeued_by_authoritative_worker_reconciliation',
        errorMessage: '',
        completedAt: FieldValue.delete(),
        leaseExpiresAt: FieldValue.delete(),
        queuedSourceFingerprint: current.sourceFingerprint,
        retryWorkerVersion: workerVersion,
        automaticRetryCount: retryCount + 1,
        updatedAt: FieldValue.serverTimestamp(),
        workerVersion,
      });
      queued += 1;
      continue;
    }
    covered += 1;
  }

  const manifest = {
    provider: 'welltrans',
    serviceDate,
    state: blockedTrips.length ? 'blocked' : (expectedTrips.length ? 'queued' : 'empty'),
    expectedTripIds: expectedTrips.map(trip => String(trip.id)),
    expectedCount: expectedTrips.length,
    eligibleCount: expectedTrips.length - blockedTrips.length,
    queuedCount: queued,
    coveredCount: covered,
    blockedCount: blockedTrips.length,
    blockedTrips: blockedTrips.slice(0, 200),
    source: 'authoritative_worker_completed_trip_scan',
    workerId,
    workerVersion,
    reconciledAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await db.doc(`welltrans_sync_manifests/${serviceDate}`).set(manifest, { merge: true });
  return { expected: expectedTrips.length, queued, covered, blocked: blockedTrips.length };
}

async function auditCompletedPortalTrips(page, serviceDate) {
  const documents = await loadAllLogsForDate(serviceDate);
  const latestByTrip = new Map();
  for (const document of documents) {
    const data = document.data();
    const key = String(data.tripId);
    const current = latestByTrip.get(key);
    const updatedAt = data.updatedAt?.toMillis?.() || data.createdAt?.toMillis?.() || 0;
    if (!current || updatedAt > current.updatedAt) {
      latestByTrip.set(key, { ref: document.ref, data, updatedAt });
    }
  }

  const completed = [...latestByTrip.values()]
    .filter(item => item.data.status === 'completed');
  const result = { audited: 0, verified: 0, requeued: 0, failed: 0 };
  for (const item of completed) {
    result.audited += 1;
    try {
      const current = await buildCurrentPortalPayload(item.data.tripId);
      if (current.validation.payload.serviceDate !== serviceDate) {
        throw new Error(
          `Source trip belongs to ${current.validation.payload.serviceDate}, not ${serviceDate}`,
        );
      }
      const warnings = Array.isArray(item.data.warnings) ? item.data.warnings : [];
      const vehicleWasIntentionallySkipped = warnings.some(warning =>
        /vehicle was left unchanged because no unique exact WellTrans match/i.test(String(warning)));
      const portalAudit = await auditWellTransTrip(page, current.payload, {
        verifyVehicle: !vehicleWasIntentionallySkipped,
        gridIndex: portalGridIndex,
      });
      const sourceChanged = Boolean(
        item.data.stagedSourceFingerprint
        && item.data.stagedSourceFingerprint !== current.sourceFingerprint
      );
      if (!portalAudit.verified || sourceChanged) {
        const reasons = [
          ...portalAudit.mismatches,
          ...(sourceChanged ? ['Agape source data changed after the prior staging'] : []),
        ];
        await item.ref.update({
          status: 'pending',
          stage: 'requeued_after_live_portal_audit',
          previousCompletedAt: item.data.completedAt || null,
          completedAt: FieldValue.delete(),
          reviewSessionId,
          portalAuditMismatch: reasons.slice(0, 30),
          portalVerifiedAt: FieldValue.delete(),
          portalVerification: FieldValue.delete(),
          queuedSourceFingerprint: current.sourceFingerprint,
          updatedAt: FieldValue.serverTimestamp(),
          leaseExpiresAt: FieldValue.delete(),
          errorMessage: '',
          workerVersion,
        });
        result.requeued += 1;
      } else {
        await item.ref.update({
          portalVerifiedAt: FieldValue.serverTimestamp(),
          portalVerification: { ...portalAudit, reviewSessionId },
          workerVersion,
        });
        result.verified += 1;
      }
    } catch (error) {
      await item.ref.update({
        status: 'failed',
        stage: 'live_portal_reconciliation_failed',
        errorMessage: String(error?.message || error).slice(0, 2000),
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        workerVersion,
      });
      result.failed += 1;
    }
  }
  return result;
}

async function verifyClosedReviewBatch(page, serviceDate) {
  const documents = await loadAllLogsForDate(serviceDate);
  const staged = documents.filter(document => {
    const data = document.data();
    return data.status === 'awaiting_review' && data.reviewSessionId === reviewSessionId;
  });
  const result = { verified: 0, requeued: 0, failed: 0 };
  for (const document of staged) {
    const data = document.data();
    try {
      const current = await buildCurrentPortalPayload(data.tripId);
      const sourceChanged = Boolean(
        data.stagedSourceFingerprint
        && data.stagedSourceFingerprint !== current.sourceFingerprint
      );
      const warnings = Array.isArray(data.warnings) ? data.warnings : [];
      const vehicleWasIntentionallySkipped = warnings.some(warning =>
        /vehicle was left unchanged because no unique exact WellTrans match/i.test(String(warning)));
      const portalAudit = await auditWellTransTrip(page, current.payload, {
        verifyVehicle: !vehicleWasIntentionallySkipped,
        gridIndex: portalGridIndex,
      });
      if (!portalAudit.verified || sourceChanged) {
        await commitSyncTransition(document.ref, {
          status: 'pending',
          stage: 'requeued_after_manual_dialog_close',
          errorMessage: '',
          completedAt: FieldValue.delete(),
          portalVerification: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
          workerVersion,
        }, {
          tripId: data.tripId,
          bookingId: data.bookingId,
          serviceDate,
          type: 'manual_dialog_closed_without_persisted_values',
          status: 'pending',
          stage: 'requeued_after_manual_dialog_close',
          sourceFingerprint: current.sourceFingerprint,
        });
        result.requeued += 1;
      } else {
        await commitSyncTransition(document.ref, {
          status: 'completed',
          stage: 'manual_apply_live_verified',
          completedAt: FieldValue.serverTimestamp(),
          portalVerifiedAt: FieldValue.serverTimestamp(),
          portalVerification: { ...portalAudit, reviewSessionId },
          updatedAt: FieldValue.serverTimestamp(),
          workerVersion,
        }, {
          tripId: data.tripId,
          bookingId: data.bookingId,
          serviceDate,
          type: 'manual_apply_live_verified',
          status: 'completed',
          stage: 'manual_apply_live_verified',
          sourceFingerprint: current.sourceFingerprint,
          portalVerified: true,
        });
        result.verified += 1;
      }
    } catch (error) {
      await commitSyncTransition(document.ref, {
        status: 'failed',
        stage: 'manual_apply_verification_failed',
        errorMessage: String(error?.message || error).slice(0, 2000),
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        workerVersion,
      }, {
        tripId: data.tripId,
        bookingId: data.bookingId,
        serviceDate,
        type: 'manual_apply_verification_failed',
        status: 'failed',
        stage: 'manual_apply_verification_failed',
      });
      result.failed += 1;
    }
  }
  return result;
}

async function processJob(job, existingSession = null) {
  if (!existingSession?.browser || !existingSession?.page) {
    throw new Error('WellTrans staging requires a calibrated headed browser session so an operator can review every field before Apply.');
  }
  const page = existingSession.page;
  const stagingStartedAt = Date.now();
  try {
    const current = await buildCurrentPortalPayload(job.tripId);
    const {
      validation, bookingAlias, payload, settings,
      sourceFingerprint: stagedSourceFingerprint,
    } = current;
    const portalUrl = assertAllowedPortal(settings.portalUrl || process.env.WELLTRANS_PORTAL_URL);
    if (!page.url().startsWith(new URL(portalUrl).origin)) {
      throw new Error('Calibrated WellTrans page is not on the allowed portal host');
    }
    await job.ref.update({
      stage: 'matching_booking',
      updatedAt: FieldValue.serverTimestamp(),
      sourceBookingId: validation.payload.bookingId,
      portalBookingId: payload.bookingId,
      bookingAliasId: bookingAlias?.id || FieldValue.delete(),
      bookingMatchMethod: bookingAlias?.matchMethod || 'exact_booking_id',
    });
    const result = await syncWellTransTrip(
      page,
      payload,
      settings.fieldMapping || {},
      portalGridIndex,
    );
    await commitSyncTransition(job.ref, {
      status: 'awaiting_review', stage: 'awaiting_manual_apply', stagedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(), leaseExpiresAt: FieldValue.delete(), errorMessage: '',
      warnings: result.warnings || [], verification: result.verification || {},
      stagedSourceFingerprint,
      sourceChangedAfterQueue: Boolean(
        job.queuedSourceFingerprint && job.queuedSourceFingerprint !== stagedSourceFingerprint,
      ),
      workerVersion, reviewSessionId,
    }, {
      tripId: job.tripId,
      bookingId: payload.bookingId,
      serviceDate: payload.serviceDate,
      type: 'trip_staged_and_verified',
      status: 'awaiting_review',
      stage: 'awaiting_manual_apply',
      sourceFingerprint: stagedSourceFingerprint,
    });
    stagingDurations.push(Date.now() - stagingStartedAt);
    if (stagingDurations.length > 50) stagingDurations.shift();
    return { success: true, safeToContinue: true };
  } catch (error) {
    let screenshot = '';
    let screenshotError = '';
    if (page) {
      const buffer = await page.screenshot({ fullPage: true }).catch(() => null);
      if (buffer) {
        try {
          screenshot = `welltrans_sync_screenshots/${job.id}.png`;
          await getStorage().bucket().file(screenshot).save(buffer, { contentType: 'image/png', resumable: false, metadata: { cacheControl: 'private, no-store' } });
        } catch (uploadError) {
          screenshot = '';
          screenshotError = ` Screenshot capture could not be stored: ${uploadError?.message || uploadError}`;
        }
      }
    }
    const safeToContinue = error?.welltransSafeToContinue !== false;
    const rollbackVerified = error?.welltransRollbackVerified === true;
    const rollbackErrors = Array.isArray(error?.welltransRollbackErrors)
      ? error.welltransRollbackErrors.slice(0, 20) : [];
    await commitSyncTransition(job.ref, {
      status: 'failed',
      stage: safeToContinue ? 'failed_no_partial_changes' : 'failed_review_close_required',
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      leaseExpiresAt: FieldValue.delete(),
      errorMessage: `${String(error?.message || error)}${screenshotError}`.slice(0, 2000),
      screenshot,
      workerVersion,
      mutationStarted: error?.welltransMutationStarted === true,
      rollbackVerified,
      rollbackErrors,
    }, {
      tripId: job.tripId,
      bookingId: job.bookingId,
      serviceDate: job.serviceDate || job.payload?.serviceDate,
      type: 'trip_staging_failed',
      status: 'failed',
      stage: safeToContinue ? 'failed_no_partial_changes' : 'failed_review_close_required',
      sourceFingerprint: job.queuedSourceFingerprint,
    });
    // Dismiss only a transient cell/dropdown editor so one failed row cannot
    // poison the next job. Keep the itinerary itself open and never Apply.
    if (existingSession && page) {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(100).catch(() => {});
    }
    return { success: false, safeToContinue };
  }
}

async function main() {
  requestedServiceDate = await readRequestedServiceDate();
  if (process.argv.includes('--login')) {
    await publishHeartbeat('waiting_for_login');
    return performManualLogin({
      onWaiting: () => publishHeartbeat('waiting_for_login').catch(() => {}),
    });
  }
  if (process.argv.includes('--inspect')) {
    await publishHeartbeat('inspection');
    const settings = (await db.doc('welltrans_settings/primary').get()).data() || {};
    const portalUrl = assertAllowedPortal(settings.portalUrl || process.env.WELLTRANS_PORTAL_URL);
    const { browser, page } = await openWellTransBrowser();
    try {
      await page.goto(portalUrl, { waitUntil: 'domcontentloaded' });
      const loginVisible = await page.getByRole('textbox', { name: /login name/i }).count() > 0;
      const frames = [];
      for (const frame of page.frames()) {
        const headers = (await frame.locator('th').allTextContents().catch(() => [])).map(value => value.trim()).filter(Boolean);
        const controls = await frame.locator('input, select, button').evaluateAll(elements => elements.slice(0, 120).map(element => ({
          tag: element.tagName.toLowerCase(), type: element.getAttribute('type') || '',
          name: element.getAttribute('name') || '', id: element.id || '',
          ariaLabel: element.getAttribute('aria-label') || '', title: element.getAttribute('title') || '',
          text: element.tagName.toLowerCase() === 'button' ? String(element.textContent || '').trim() : '',
        }))).catch(() => []);
        const navigation = await frame.locator('[title], a, [role="button"], img').evaluateAll(elements => elements.slice(0, 160).map(element => ({
          tag: element.tagName.toLowerCase(), id: element.id || '', className: String(element.className || '').slice(0, 160),
          title: element.getAttribute('title') || '', ariaLabel: element.getAttribute('aria-label') || '',
          text: String(element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100),
        })).filter(item => item.title || item.ariaLabel || item.text)).catch(() => []);
        const gridClasses = await frame.locator('*').evaluateAll(elements => [...new Set(elements.flatMap(element => String(element.className || '').split(/\s+/)).filter(name => /grid|cell|column|itinerary|trip/i.test(name)))].slice(0, 200)).catch(() => []);
        const componentMetadata = await frame.locator('html').evaluate(() => {
          const result = [];
          const seen = new Set();
          const visit = (root, scope = 'document') => {
            for (const element of root.querySelectorAll('*')) {
              const tag = element.tagName.toLowerCase();
              const className = String(element.className || '').trim().replace(/\s+/g, ' ').slice(0, 180);
              const title = element.getAttribute('title') || '';
              const role = element.getAttribute('role') || '';
              const ariaLabel = element.getAttribute('aria-label') || '';
              const isCustom = tag.includes('-') || tag.includes(':');
              const isRelevant = /grid|table|row|cell|column|trip|itinerary|booking|arrival|departure|mileage|signature|schedule|edit|apply/i
                .test(`${tag} ${className} ${title} ${role} ${ariaLabel}`);
              const key = `${scope}|${tag}|${className}|${title}|${role}|${ariaLabel}|${Boolean(element.shadowRoot)}`;
              if ((isCustom || isRelevant || element.shadowRoot) && !seen.has(key) && result.length < 400) {
                seen.add(key);
                result.push({
                  scope, tag, id: element.id || '', className, title, role, ariaLabel,
                  hasShadowRoot: Boolean(element.shadowRoot),
                  inputCount: element.shadowRoot?.querySelectorAll('input,select,textarea,[contenteditable="true"]').length || 0,
                });
              }
              if (element.shadowRoot) visit(element.shadowRoot, `${scope}>${tag}${element.id ? `#${element.id}` : ''}`);
            }
          };
          visit(document);
          return result;
        }).catch(() => []);
        const gridMetadata = await frame.locator('core\\:grid').evaluateAll(grids => grids.map(grid => {
          const attributes = element => Object.fromEntries([...element.attributes]
            .filter(attribute => !/value|data|source/i.test(attribute.name))
            .map(attribute => [attribute.name, attribute.value.slice(0, 200)]));
          const descendants = [...grid.querySelectorAll('*')];
          const signatures = [];
          const seen = new Set();
          for (const element of descendants) {
            const signature = {
              tag: element.tagName.toLowerCase(),
              className: String(element.className || '').trim().replace(/\s+/g, ' ').slice(0, 180),
              attributes: attributes(element),
              childTags: [...element.children].map(child => child.tagName.toLowerCase()).slice(0, 20),
            };
            const key = JSON.stringify(signature);
            if (!seen.has(key) && signatures.length < 300) {
              seen.add(key);
              signatures.push(signature);
            }
          }
          return { attributes: attributes(grid), childTags: [...grid.children].map(child => child.tagName.toLowerCase()), signatures };
        })).catch(() => []);
        frames.push({ name: frame.name(), url: frame.url(), headers, controls, navigation, gridClasses, componentMetadata, gridMetadata });
      }
      console.log(JSON.stringify({ authenticated: !loginVisible, title: await page.title(), url: page.url(), frames }, null, 2));
    } finally { await browser.close(); }
    return;
  }
  if (process.argv.includes('--inspect-editor')) {
    await publishHeartbeat('inspection');
    const settings = (await db.doc('welltrans_settings/primary').get()).data() || {};
    const portalUrl = assertAllowedPortal(settings.portalUrl || process.env.WELLTRANS_PORTAL_URL);
    const { browser, page } = await openWellTransBrowser();
    try {
      await page.goto(portalUrl, { waitUntil: 'domcontentloaded' });
      await page.locator('.BulkEdit[title="Bulk Edit"]').click();
      await page.waitForFunction(() => document.querySelectorAll('core\\:grid').length > 1, null, { timeout: 15000 });
      const editorProbe = await page.locator('core\\:grid').last().evaluate(grid => {
        const cells = [...grid.querySelectorAll('.GridCell')];
        const header = cells.find(cell => cell.getAttribute('title') === 'Arrival Time');
        if (!header) return { activated: false, reason: 'Arrival Time header unavailable' };
        const left = Number.parseFloat(header.style.left);
        const target = cells.find(cell =>
          Number.parseFloat(cell.style.left) === left
          && Number.parseFloat(cell.style.top) > 0
          && cell.style.display !== 'none');
        if (!target) return { activated: false, reason: 'Arrival Time data cell unavailable' };
        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return { activated: true, columnLeft: left, rowTop: Number.parseFloat(target.style.top) };
      });
      await page.waitForTimeout(300);
      const metadata = await page.locator('body').evaluate(() => {
        const matchingGrids = [...document.querySelectorAll('core\\:grid')].filter(element =>
          element.getAttribute('gridobject') === 'Pass.UI.Grid.TripBrokerEventsGrid');
        const grid = matchingGrids.at(-1);
        if (!grid) return { editorGridFound: false, gridCount: 0 };
        const descendants = [...grid.querySelectorAll('*')];
        const classCounts = {};
        const tagCounts = {};
        for (const element of descendants) {
          const tag = element.tagName.toLowerCase();
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          for (const className of String(element.className || '').split(/\s+/).filter(Boolean)) {
            classCounts[className] = (classCounts[className] || 0) + 1;
          }
        }
        const allowedHeaders = /^(Booking Id|Activity|Driver|Vehicle|Arrival Time|Departure Time|Mileage\/Odometer|Signature Capture|Signature Captured|Is Read Only)$/i;
        const headers = descendants.filter(element => allowedHeaders.test(element.getAttribute('title') || '')).map(element => ({
          tag: element.tagName.toLowerCase(),
          className: String(element.className || ''),
          title: element.getAttribute('title'),
          style: element.getAttribute('style') || '',
          parentClass: String(element.parentElement?.className || ''),
          parentStyle: element.parentElement?.getAttribute('style') || '',
        }));
        const editors = descendants.filter(element =>
          ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName) || element.getAttribute('contenteditable') === 'true').map(element => ({
          tag: element.tagName.toLowerCase(),
          className: String(element.className || ''),
          type: element.getAttribute('type') || '',
          style: element.getAttribute('style') || '',
          parentClass: String(element.parentElement?.className || ''),
        }));
        return {
          editorGridFound: true,
          gridCount: matchingGrids.length,
          gridAttributes: Object.fromEntries([...grid.attributes].map(attribute => [attribute.name, attribute.value])),
          descendantCount: descendants.length,
          classCounts,
          tagCounts,
          headers,
          editors,
        };
      });
      await page.keyboard.press('Escape').catch(() => {});
      console.log(JSON.stringify({ authenticated: true, title: await page.title(), url: page.url(), editorProbe, metadata }, null, 2));
      const close = page.locator('[title="Close"], .Close, .DialogClose').last();
      if (await close.count()) await close.click().catch(() => {});
    } finally { await browser.close(); }
    return;
  }
  if (process.argv.includes('--standby')) {
    for (;;) {
      await publishHeartbeat('standby');
      await sleep(Number(process.env.WELLTRANS_POLL_MS) || 10000);
    }
  }
  if (process.argv.includes('--dry-run')) {
    await publishHeartbeat('inspection');
    const logId = process.argv[process.argv.indexOf('--dry-run') + 1];
    if (!logId) throw new Error('Usage: node src/index.js --dry-run <welltrans_sync_log_id>');
    const logSnapshot = await db.doc(`welltrans_sync_logs/${logId}`).get();
    if (!logSnapshot.exists) throw new Error(`WellTrans sync log ${logId} was not found`);
    const log = logSnapshot.data();
    const tripSnapshot = await db.doc(`trips/${log.tripId}`).get();
    if (!tripSnapshot.exists) throw new Error(`Source trip ${log.tripId} was not found`);
    const trip = tripSnapshot.data() || {};
    const serviceDate = String(log.payload?.serviceDate || trip.dateKey || trip.serviceDate || trip.tripDate || trip.scheduledDate || trip.pickupDate || trip.date || '').slice(0, 10);
    const payload = { ...log.payload, serviceDate };
    const settings = (await db.doc('welltrans_settings/primary').get()).data() || {};
    const portalUrl = assertAllowedPortal(settings.portalUrl || process.env.WELLTRANS_PORTAL_URL);
    const { browser, page } = await openWellTransBrowser();
    try {
      await page.goto(portalUrl, { waitUntil: 'domcontentloaded' });
      const result = await validateWellTransTrip(page, payload);
      console.log(JSON.stringify({ safe: true, bookingId: payload.bookingId, serviceDate, ...result }, null, 2));
    } finally {
      await browser.close();
    }
    return;
  }
  if (process.argv.includes('--run-job')) {
    throw new Error('--run-job is disabled because it cannot preserve a headed browser for mandatory manual review. Use --calibrate-job or calibrate-run.');
  }
  if (process.argv.includes('--calibrate-job')) {
    if (process.env.WELLTRANS_ENABLE_WRITES !== 'true') throw new Error('WELLTRANS_ENABLE_WRITES=true is required for --calibrate-job');
    const logId = process.argv[process.argv.indexOf('--calibrate-job') + 1];
    if (!logId) throw new Error('Usage: node src/index.js --calibrate-job <welltrans_sync_log_id>');
    const session = await performManualLogin({
      keepOpen: true,
      onWaiting: () => publishHeartbeat('waiting_for_login').catch(() => {}),
    });
    await publishHeartbeat('online');
    await processJob(await claimJobById(logId), session);
    process.stdout.write('Trip staged for review. The browser will remain open; review all fields and click Apply yourself when ready.\n');
    while (session.browser.isConnected()) {
      await publishHeartbeat('review_ready').catch(() => {});
      await sleep(10000);
    }
    return;
  }
  if (process.env.WELLTRANS_ENABLE_WRITES !== 'true') {
    await publishHeartbeat('standby');
    throw new Error('WellTrans writes are locked. Set WELLTRANS_ENABLE_WRITES=true only after the TripSpark adapter passes a supervised test.');
  }
  const processing = await loadAllQueryDocuments(
    db.collection('welltrans_sync_logs').where('status', '==', 'processing'),
  );
  const now = Date.now();
  const stale = processing.filter(item => (item.data().leaseExpiresAt?.toMillis?.() || Number.POSITIVE_INFINITY) < now);
  await Promise.all(stale.map(item => item.ref.update({ status: 'failed', stage: 'worker_lease_expired', errorMessage: 'Worker stopped before completing this trip. Retry is safe.', completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), leaseExpiresAt: FieldValue.delete() })));
  const once = process.argv.includes('--once');
  await publishHeartbeat('connecting');
  const session = await performManualLogin({
    keepOpen: true,
    reuseSession: true,
    onWaiting: () => publishHeartbeat('waiting_for_login').catch(() => {}),
  });
  try {
    let selectedDate = await getSelectedPortalDate(session.page);
    selectedDate = await waitForRequestedSchedule(session.page, selectedDate);
    activeServiceDate = selectedDate;
    await waitForDateLease(selectedDate);
    reviewSessionId = randomUUID();
    await publishHeartbeat('indexing_schedule');
    portalGridIndex = await buildWellTransGridIndex(session.page, selectedDate);
    const authoritative = await reconcileAuthoritativeCompletedTrips(selectedDate);
    lastAuthoritativeReconcileAt = Date.now();
    const recovered = await recoverStaleReviewJobs(selectedDate);
    const initialSummary = await publishDateReviewSummary(selectedDate);
    const completedAudit = initialSummary.pending === 0
      ? await auditCompletedPortalTrips(session.page, selectedDate)
      : { requeued: 0, verified: 0, failed: 0, deferred: initialSummary.unverifiedCompleted };
    lastCompletedPortalAuditAt = Date.now();
    await publishHeartbeat('calibrated');
    await db.doc('welltrans_worker_status/primary').set({
      selectedDate, calibratedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    process.stdout.write(
      `Worker calibrated to WellTrans schedule ${selectedDate}. `
      + `${recovered} stale review trip(s) and ${completedAudit.requeued} incomplete completed trip(s) `
      + `will be rebuilt in this browser session. Authoritative coverage: `
      + `${authoritative.expected} completed, ${authoritative.blocked} blocked.\n`,
    );
    do {
      const activeDate = await waitForRequestedSchedule(session.page, selectedDate);
      if (activeDate !== selectedDate) {
        selectedDate = activeDate;
        activeServiceDate = selectedDate;
        await waitForDateLease(selectedDate);
        reviewSessionId = randomUUID();
        await publishHeartbeat('indexing_schedule');
        portalGridIndex = await buildWellTransGridIndex(session.page, selectedDate);
        await reconcileAuthoritativeCompletedTrips(selectedDate);
        lastAuthoritativeReconcileAt = Date.now();
        await recoverStaleReviewJobs(selectedDate);
        const changedDateSummary = await publishDateReviewSummary(selectedDate);
        if (changedDateSummary.pending === 0) {
          await publishHeartbeat('verifying_applied_records');
          await auditCompletedPortalTrips(session.page, selectedDate);
        }
        lastCompletedPortalAuditAt = Date.now();
        await db.doc('welltrans_worker_status/primary').set({
          selectedDate, calibratedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      await waitForDateLease(selectedDate);
      await publishHeartbeat('calibrated');
      if (Date.now() - lastAuthoritativeReconcileAt >= 60_000) {
        await reconcileAuthoritativeCompletedTrips(selectedDate);
        lastAuthoritativeReconcileAt = Date.now();
      }
      let summary = await publishDateReviewSummary(selectedDate);
      if (summary.staged > 0
        && (summary.staged >= reviewBatchSize || summary.pending === 0)) {
        if (!await isEditItineraryOpen(session.page)) {
          await publishHeartbeat('verifying_applied_records');
          const verification = await verifyClosedReviewBatch(session.page, selectedDate);
          lastCompletedPortalAuditAt = Date.now();
          process.stdout.write(
            `Manual dialog completion detected: ${verification.verified} applied and verified, `
            + `${verification.requeued} not persisted and requeued, ${verification.failed} failed.\n`,
          );
          if (!once) await sleep(Number(process.env.WELLTRANS_POLL_MS) || 1500);
          continue;
        }
        const state = summary.pending === 0 && summary.failed === 0
          && summary.blocked === 0 && summary.missing === 0
          ? 'review_ready'
          : 'review_batch_ready';
        await db.doc('welltrans_worker_status/primary').set({
          state,
          selectedDate,
          reviewSessionId,
          reviewBatchSize,
          reviewBatchStaged: summary.staged,
          reviewBatchRemaining: summary.pending,
          lastSeenAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        process.stdout.write(
          `Review batch ready for ${selectedDate}: ${summary.staged} staged, `
          + `${summary.pending} remaining. Review the browser and click Apply yourself.\n`,
        );
        if (!once) await sleep(Number(process.env.WELLTRANS_POLL_MS) || 1500);
        continue;
      }
      if (summary.pending === 0 && summary.staged === 0 && summary.unverifiedCompleted > 0) {
        await publishHeartbeat('verifying_applied_records');
        const audit = await auditCompletedPortalTrips(session.page, selectedDate);
        lastCompletedPortalAuditAt = Date.now();
        summary = await publishDateReviewSummary(selectedDate);
        process.stdout.write(
          `Post-Apply verification: ${audit.verified} verified, ${audit.requeued} rebuilt, `
          + `${audit.failed} blocked.\n`,
        );
      }
      const batchCapacity = Math.max(0, reviewBatchSize - summary.staged);
      const pendingJobIds = batchCapacity
        ? await listPendingJobIdsForDate(selectedDate, batchCapacity)
        : [];
      if (pendingJobIds.length) {
        const batchDate = selectedDate;
        for (const logId of pendingJobIds) {
          const latestDate = await waitForRequestedSchedule(session.page, selectedDate);
          if (latestDate !== batchDate) {
            selectedDate = latestDate;
            break;
          }
          const job = await claimJobById(logId);
          if (job) {
            await publishHeartbeat('staging');
            const outcome = await processJob(job, session);
            await publishHeartbeat('calibrated');
            if (!outcome.safeToContinue) {
              throw new Error(
                `Booking ${job.bookingId || job.tripId} could not be rolled back completely. `
                + 'Processing stopped. Review this browser and click Close to discard the unsaved batch; never click Apply.',
              );
            }
          }
        }
      } else {
        process.stdout.write(`Review summary for ${selectedDate}: ${summary.staged} staged, ${summary.failed} failed, ${summary.pending} pending.\n`);
        if (!once) await sleep(Number(process.env.WELLTRANS_POLL_MS) || 1500);
      }
    } while (!once);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
    process.stdout.write('\nThe agent encountered an error. The review browser will remain open for inspection until it is closed by the operator.\n');
    let keepReviewOpen = true;
    while (keepReviewOpen) {
      await publishHeartbeat('review_error').catch(() => {});
      await sleep(10000);
      keepReviewOpen = !session.browser.isConnected() ? false : keepReviewOpen;
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
