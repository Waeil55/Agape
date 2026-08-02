#!/usr/bin/env node
const https = require('https');
const PROJECT = 'agape-95c9f';
const account = require('C:/Users/waeil/.config/configstore/firebase-tools.json');

function refreshToken() {
  return new Promise((resolve, reject) => {
    const postData = `client_id=${encodeURIComponent(process.env.GOOGLE_OAUTH_CLIENT_ID || "")}&client_secret=${encodeURIComponent(process.env.GOOGLE_OAUTH_CLIENT_SECRET || "")}&refresh_token=${account.tokens.refresh_token}&grant_type=refresh_token`;
    const req = https.request({ hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) } }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d).access_token); } catch (e) { reject(e); } });
    });
    req.on('error', reject); req.write(postData); req.end();
  });
}

function apiRequest(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const options = { hostname: 'firestore.googleapis.com', path: `/v1/projects/${PROJECT}/databases/(default)/documents${path}`, method, headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } };
    const req = https.request(options, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function decodeValue(field) {
  if (!field) return null;
  if (field.nullValue !== undefined) return null;
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.integerValue !== undefined) return Number(field.integerValue);
  if (field.doubleValue !== undefined) return field.doubleValue;
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.timestampValue) return field.timestampValue;
  if (field.arrayValue) return (field.arrayValue.values || []).map(v => decodeValue(v));
  if (field.mapValue) { const o = {}; for (const [k, v] of Object.entries(field.mapValue.fields || {})) o[k] = decodeValue(v); return o; }
  return null;
}

function docToObj(doc) {
  const obj = { id: doc.name.split('/').pop() };
  for (const [k, v] of Object.entries(doc.fields || {})) obj[k] = decodeValue(v);
  return obj;
}

async function listAllPages(path, token) {
  let allDocs = [];
  let pageToken = '';
  do {
    const sep = path.includes('?') ? '&' : '?';
    const pageParam = pageToken ? `${sep}pageToken=${pageToken}` : '';
    const result = await apiRequest('GET', `${path}${pageParam}`, token);
    if (result.error) break;
    if (result.documents) allDocs = allDocs.concat(result.documents.map(docToObj));
    pageToken = result.nextPageToken || '';
  } while (pageToken);
  return allDocs;
}

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: value } : { doubleValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) fields[k] = encodeValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function dedupByKey(trips) {
  const STATUS_PRIORITY = { 'Completed': 10, 'At Pickup': 9, 'In Mission': 9, 'Navigating Pickup': 8, 'Navigating Dropoff': 8, 'In Transit': 8, 'Assigned': 7, 'No Show': 5, 'Cancelled': 3, 'Unassigned': 1 };
  const groups = {};
  trips.forEach(t => {
    const key = String(t.bookingId || t.id);
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });
  const result = [];
  const duplicates = [];
  Object.entries(groups).forEach(([key, copies]) => {
    copies.sort((a, b) => {
      const pa = STATUS_PRIORITY[a.status] || 0;
      const pb = STATUS_PRIORITY[b.status] || 0;
      if (pa !== pb) return pb - pa;
      const da = a.driverId ? 1 : 0;
      const db = b.driverId ? 1 : 0;
      if (da !== db) return db - da;
      const ta = Date.parse(a.updatedAtLocal || a.updatedAt || a.createdAt || '');
      const tb = Date.parse(b.updatedAtLocal || b.updatedAt || b.createdAt || '');
      return tb - ta;
    });
    result.push(copies[0]);
    for (let i = 1; i < copies.length; i++) {
      duplicates.push(copies[i]);
    }
  });
  return { deduped: result, duplicates };
}

async function main() {
  const token = await refreshToken();
  const DRY_RUN = process.argv.includes('--dry-run');

  console.log(`=== Deep Dedup by BookingId (${DRY_RUN ? 'DRY RUN' : 'LIVE'}) ===\n`);

  // 1. Root trips
  console.log('--- Root trips ---');
  const rootTrips = await listAllPages('/trips', token);
  console.log(`Total: ${rootTrips.length}`);
  const { deduped: cleanRoot, duplicates: dupRoot } = dedupByKey(rootTrips);
  console.log(`Unique by bookingId: ${cleanRoot.length}`);
  console.log(`Duplicates to delete: ${dupRoot.length}`);

  if (dupRoot.length > 0) {
    console.log('Sample duplicates:');
    dupRoot.slice(0, 10).forEach(t => {
      console.log(`  ${t.id} | bookingId=${t.bookingId} | ${t.patient} | ${t.status}`);
    });

    if (!DRY_RUN) {
      let deleted = 0;
      for (let i = 0; i < dupRoot.length; i += 450) {
        const chunk = dupRoot.slice(i, i + 450);
        const writes = chunk.map(t => ({ delete: `projects/${PROJECT}/databases/(default)/documents/trips/${t.id}` }));
        await apiRequest('POST', ':commit', token, { writes });
        deleted += chunk.length;
        console.log(`  Deleted ${deleted}/${dupRoot.length} from root trips`);
      }
    }
  }

  // 2. tripLedger
  console.log('\n--- tripLedger ---');
  const ledgerTrips = await listAllPages('/tripLedger', token);
  console.log(`Total: ${ledgerTrips.length}`);
  const { deduped: cleanLedger, duplicates: dupLedger } = dedupByKey(ledgerTrips);
  console.log(`Unique by bookingId: ${cleanLedger.length}`);
  console.log(`Duplicates to delete: ${dupLedger.length}`);

  if (dupLedger.length > 0 && !DRY_RUN) {
    let deleted = 0;
    for (let i = 0; i < dupLedger.length; i += 450) {
      const chunk = dupLedger.slice(i, i + 450);
      const writes = chunk.map(t => ({ delete: `projects/${PROJECT}/databases/(default)/documents/tripLedger/${t.id}` }));
      await apiRequest('POST', ':commit', token, { writes });
      deleted += chunk.length;
      console.log(`  Deleted ${deleted}/${dupLedger.length} from tripLedger`);
    }
  }

  // 3. appData/agape
  console.log('\n--- appData/agape ---');
  const appDataResult = await apiRequest('GET', '/appData/agape', token);
  const appData = docToObj(appDataResult);
  const appTrips = Array.isArray(appData.trips) ? appData.trips : [];
  const appTrashed = Array.isArray(appData.trashedTrips) ? appData.trashedTrips : [];

  const { deduped: cleanAppTrips, duplicates: dupAppTrips } = dedupByKey(appTrips);
  const { deduped: cleanAppTrashed, duplicates: dupAppTrashed } = dedupByKey(appTrashed);

  console.log(`appData trips: ${appTrips.length} → ${cleanAppTrips.length} (${dupAppTrips.length} dupes)`);
  console.log(`appData trashed: ${appTrashed.length} → ${cleanAppTrashed.length} (${dupAppTrashed.length} dupes)`);

  if ((dupAppTrips.length > 0 || dupAppTrashed.length > 0) && !DRY_RUN) {
    await apiRequest('PATCH', '/appData/agape?updateMask.fieldPaths=trips&updateMask.fieldPaths=trashedTrips', token, {
      fields: {
        trips: encodeValue(cleanAppTrips),
        trashedTrips: encodeValue(cleanAppTrashed),
      }
    });
    console.log('Cleaned appData/agape');
  }

  // 4. trashedTrips collection
  console.log('\n--- Root trashedTrips ---');
  const rootTrashed = await listAllPages('/trashedTrips', token);
  console.log(`Total: ${rootTrashed.length}`);
  const { deduped: cleanTrashed, duplicates: dupTrashed } = dedupByKey(rootTrashed);
  console.log(`Unique by bookingId: ${cleanTrashed.length}`);
  console.log(`Duplicates to delete: ${dupTrashed.length}`);

  if (dupTrashed.length > 0 && !DRY_RUN) {
    let deleted = 0;
    for (let i = 0; i < dupTrashed.length; i += 450) {
      const chunk = dupTrashed.slice(i, i + 450);
      const writes = chunk.map(t => ({ delete: `projects/${PROJECT}/databases/(default)/documents/trashedTrips/${t.id}` }));
      await apiRequest('POST', ':commit', token, { writes });
      deleted += chunk.length;
      console.log(`  Deleted ${deleted}/${dupTrashed.length} from trashedTrips`);
    }
  }

  // Verify
  console.log('\n=== Verification ===');
  const vRoot = await listAllPages('/trips', token);
  const vLedger = await listAllPages('/tripLedger', token);
  const vTrashed = await listAllPages('/trashedTrips', token);
  console.log(`Root trips: ${rootTrips.length} → ${vRoot.length}`);
  console.log(`tripLedger: ${ledgerTrips.length} → ${vLedger.length}`);
  console.log(`Trashed: ${rootTrashed.length} → ${vTrashed.length}`);
  console.log(`\nDone. ${DRY_RUN ? '(DRY RUN)' : 'All duplicates removed.'}`);
}

main().catch(err => { console.error('Failed:', err); process.exit(1); });
