import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { performManualLogin } from './welltrans.login.js';
import { openWellTransBrowser } from './welltrans.browser.js';
import { getSelectedPortalDate, syncWellTransTrip, validateWellTransTrip } from './welltrans.trip.js';
import { validateTripForWellTrans } from '../../../src/features/welltrans-sync/utils/welltransMapping.js';

initializeApp({
  credential: applicationDefault(),
  projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'agape-95c9f',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'agape-95c9f.firebasestorage.app',
});
const db = getFirestore();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const workerId = process.env.COMPUTERNAME || process.env.HOSTNAME || 'worker';
const publishHeartbeat = (state = 'online') => db.doc('welltrans_worker_status/primary').set({
  workerId, state, writesEnabled: process.env.WELLTRANS_ENABLE_WRITES === 'true',
  adapter: 'tripspark-novusmed', lastSeenAt: FieldValue.serverTimestamp(),
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

async function claimNextJobForDate(serviceDate) {
  const snapshot = await db.collection('welltrans_sync_logs')
    .where('status', '==', 'pending').orderBy('createdAt', 'asc').limit(500).get();
  const candidate = snapshot.docs.find(document => {
    const data = document.data();
    return String(data.payload?.serviceDate || data.serviceDate || '').slice(0, 10) === serviceDate;
  });
  if (!candidate) return null;
  const ref = candidate.ref;
  return db.runTransaction(async transaction => {
    const fresh = await transaction.get(ref);
    if (!fresh.exists || fresh.data().status !== 'pending') return null;
    transaction.update(ref, { status: 'processing', stage: 'claimed', startedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), leaseExpiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000), attempt: FieldValue.increment(1), workerId });
    return { id: fresh.id, ref, ...fresh.data() };
  });
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
      attempt: FieldValue.increment(1), workerId,
    });
    return { id: fresh.id, ref, ...fresh.data() };
  });
}

async function processJob(job, existingSession = null) {
  let browser = existingSession?.browser;
  let page = existingSession?.page;
  try {
    const tripSnapshot = await db.doc(`trips/${job.tripId}`).get();
    if (!tripSnapshot.exists) throw new Error(`Source trip ${job.tripId} no longer exists`);
    const trip = tripSnapshot.data() || {};
    const settings = (await db.doc('welltrans_settings/primary').get()).data() || {};
    const driverSnapshot = trip.driverId ? await db.doc(`drivers/${trip.driverId}`).get() : null;
    const hydratedTrip = {
      id: tripSnapshot.id,
      ...trip,
      completedDriverName: driverSnapshot?.exists ? driverSnapshot.data().name : trip.completedDriverName,
    };
    const validation = validateTripForWellTrans(hydratedTrip);
    if (!validation.valid) throw new Error(`Source trip is not ready: ${validation.errors.join('; ')}`);
    const payload = {
      ...validation.payload,
      driver: settings.driverValueMapping?.[validation.payload.driver] || validation.payload.driver,
      vehicle: settings.vehicleValueMapping?.[validation.payload.vehicle] || validation.payload.vehicle,
    };
    const portalUrl = assertAllowedPortal(settings.portalUrl || process.env.WELLTRANS_PORTAL_URL);
    if (!existingSession) {
      ({ browser, page } = await openWellTransBrowser());
      await page.goto(portalUrl, { waitUntil: 'domcontentloaded' });
    } else if (!page.url().startsWith(new URL(portalUrl).origin)) {
      throw new Error('Calibrated WellTrans page is not on the allowed portal host');
    }
    await job.ref.update({ stage: 'matching_booking', updatedAt: FieldValue.serverTimestamp() });
    await syncWellTransTrip(page, payload, settings.fieldMapping || {});
    await job.ref.update({ status: 'completed', stage: 'verified', completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), leaseExpiresAt: FieldValue.delete(), errorMessage: '' });
    await db.doc('welltrans_settings/primary').set({ lastSync: FieldValue.serverTimestamp() }, { merge: true });
    return true;
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
    await job.ref.update({ status: 'failed', stage: 'failed', completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), leaseExpiresAt: FieldValue.delete(), errorMessage: `${String(error?.message || error)}${screenshotError}`.slice(0, 2000), screenshot });
    return false;
  } finally {
    if (!existingSession) await browser?.close().catch(() => {});
  }
}

async function main() {
  if (process.argv.includes('--login')) return performManualLogin();
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
    if (process.env.WELLTRANS_ENABLE_WRITES !== 'true') throw new Error('WELLTRANS_ENABLE_WRITES=true is required for --run-job');
    const logId = process.argv[process.argv.indexOf('--run-job') + 1];
    if (!logId) throw new Error('Usage: node src/index.js --run-job <welltrans_sync_log_id>');
    await publishHeartbeat('online');
    await processJob(await claimJobById(logId));
    return;
  }
  if (process.argv.includes('--calibrate-job')) {
    if (process.env.WELLTRANS_ENABLE_WRITES !== 'true') throw new Error('WELLTRANS_ENABLE_WRITES=true is required for --calibrate-job');
    const logId = process.argv[process.argv.indexOf('--calibrate-job') + 1];
    if (!logId) throw new Error('Usage: node src/index.js --calibrate-job <welltrans_sync_log_id>');
    const session = await performManualLogin({ keepOpen: true });
    try {
      await publishHeartbeat('online');
      await processJob(await claimJobById(logId), session);
    } finally {
      await session.browser.close().catch(() => {});
    }
    return;
  }
  if (process.env.WELLTRANS_ENABLE_WRITES !== 'true') {
    await publishHeartbeat('standby');
    throw new Error('WellTrans writes are locked. Set WELLTRANS_ENABLE_WRITES=true only after the TripSpark adapter passes a supervised test.');
  }
  const stale = await db.collection('welltrans_sync_logs').where('status', '==', 'processing').where('leaseExpiresAt', '<', Timestamp.now()).get();
  await Promise.all(stale.docs.map(item => item.ref.update({ status: 'failed', stage: 'worker_lease_expired', errorMessage: 'Worker stopped before completing this trip. Retry is safe.', completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), leaseExpiresAt: FieldValue.delete() })));
  const once = process.argv.includes('--once');
  const session = await performManualLogin({ keepOpen: true });
  try {
    const selectedDate = await getSelectedPortalDate(session.page);
    await publishHeartbeat('calibrated');
    await db.doc('welltrans_worker_status/primary').set({
      selectedDate, calibratedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    process.stdout.write(`Worker calibrated to WellTrans schedule ${selectedDate}. Only this date will be processed.\n`);
    do {
      await publishHeartbeat('calibrated');
      const job = await claimNextJobForDate(selectedDate);
      if (job) await processJob(job, session);
      else if (!once) await sleep(Number(process.env.WELLTRANS_POLL_MS) || 10000);
    } while (!once);
  } finally {
    await publishHeartbeat('offline').catch(() => {});
    await session.browser.close().catch(() => {});
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
