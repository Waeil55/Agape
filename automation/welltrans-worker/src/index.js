import admin from 'firebase-admin';
import { performManualLogin } from './welltrans.login.js';
import { openWellTransBrowser } from './welltrans.browser.js';
import { syncWellTransTrip } from './welltrans.trip.js';

admin.initializeApp();
const db = admin.firestore();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const workerId = process.env.COMPUTERNAME || process.env.HOSTNAME || 'worker';
const publishHeartbeat = () => db.doc('welltrans_worker_status/primary').set({
  workerId, state: 'online', lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
  version: '1.0.0',
}, { merge: true });
const assertAllowedPortal = value => {
  const url = new URL(value);
  const configured = (process.env.WELLTRANS_ALLOWED_HOSTS || new URL(process.env.WELLTRANS_PORTAL_URL).hostname)
    .split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
  if (url.protocol !== 'https:' || !configured.includes(url.hostname.toLowerCase())) {
    throw new Error(`Portal host ${url.hostname} is not in WELLTRANS_ALLOWED_HOSTS`);
  }
  return url.toString();
};

async function claimNextJob() {
  const snapshot = await db.collection('welltrans_sync_logs').where('status', '==', 'pending').orderBy('createdAt', 'asc').limit(1).get();
  if (snapshot.empty) return null;
  const ref = snapshot.docs[0].ref;
  return db.runTransaction(async transaction => {
    const fresh = await transaction.get(ref);
    if (!fresh.exists || fresh.data().status !== 'pending') return null;
    transaction.update(ref, { status: 'processing', stage: 'claimed', startedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(), leaseExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60 * 1000), attempt: admin.firestore.FieldValue.increment(1), workerId });
    return { id: fresh.id, ref, ...fresh.data() };
  });
}

async function processJob(job) {
  let browser;
  let page;
  try {
    const settings = (await db.doc('welltrans_settings/primary').get()).data() || {};
    const portalUrl = assertAllowedPortal(settings.portalUrl || process.env.WELLTRANS_PORTAL_URL);
    ({ browser, page } = await openWellTransBrowser());
    await page.goto(portalUrl, { waitUntil: 'domcontentloaded' });
    await job.ref.update({ stage: 'matching_booking', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    await syncWellTransTrip(page, job.payload, settings.fieldMapping || {});
    await job.ref.update({ status: 'completed', stage: 'verified', completedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(), leaseExpiresAt: admin.firestore.FieldValue.delete(), errorMessage: '' });
    await db.doc('welltrans_settings/primary').set({ lastSync: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  } catch (error) {
    let screenshot = '';
    if (page) {
      const buffer = await page.screenshot({ fullPage: true }).catch(() => null);
      if (buffer) {
        screenshot = `welltrans_sync_screenshots/${job.id}.png`;
        await admin.storage().bucket().file(screenshot).save(buffer, { contentType: 'image/png', resumable: false, metadata: { cacheControl: 'private, no-store' } });
      }
    }
    await job.ref.update({ status: 'failed', stage: 'failed', completedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(), leaseExpiresAt: admin.firestore.FieldValue.delete(), errorMessage: String(error?.message || error).slice(0, 2000), screenshot });
  } finally {
    await browser?.close().catch(() => {});
  }
}

async function main() {
  if (process.argv.includes('--login')) return performManualLogin();
  const stale = await db.collection('welltrans_sync_logs').where('status', '==', 'processing').where('leaseExpiresAt', '<', admin.firestore.Timestamp.now()).get();
  await Promise.all(stale.docs.map(item => item.ref.update({ status: 'failed', stage: 'worker_lease_expired', errorMessage: 'Worker stopped before completing this trip. Retry is safe.', completedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(), leaseExpiresAt: admin.firestore.FieldValue.delete() })));
  const once = process.argv.includes('--once');
  await publishHeartbeat();
  do {
    await publishHeartbeat();
    const job = await claimNextJob();
    if (job) await processJob(job);
    else if (!once) await sleep(Number(process.env.WELLTRANS_POLL_MS) || 10000);
  } while (!once);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
