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

async function deleteDocument(path, token) {
  return new Promise((resolve, reject) => {
    const options = { hostname: 'firestore.googleapis.com', path: `/v1/projects/${PROJECT}/databases/(default)/documents${path}`, method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } };
    const req = https.request(options, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve());
    });
    req.on('error', reject);
    req.end();
  });
}

async function commitBatch(writes, token) {
  if (writes.length === 0) return;
  return apiRequest('POST', ':commit', token, { writes });
}

async function main() {
  const token = await refreshToken();
  const DRY_RUN = process.argv.includes('--dry-run');

  console.log(`=== Dedup Cleanup (${DRY_RUN ? 'DRY RUN' : 'LIVE'}) ===\n`);

  // 1. Clean root trips collection
  console.log('--- Root trips ---');
  const rootTrips = await listAllPages('/trips', token);
  console.log(`Total: ${rootTrips.length}`);

  const tripsByBookingId = {};
  rootTrips.forEach(t => {
    const key = String(t.bookingId || t.id);
    if (!tripsByBookingId[key]) tripsByBookingId[key] = [];
    tripsByBookingId[key].push(t);
  });

  const tripsToDelete = [];
  Object.entries(tripsByBookingId).forEach(([key, copies]) => {
    if (copies.length > 1) {
      // Keep the one with the most recent updatedAtLocal or the most advanced status
      const STATUS_PRIORITY = { 'Completed': 10, 'At Pickup': 9, 'In Mission': 9, 'Assigned': 8, 'No Show': 7, 'Cancelled': 7, 'Rerouted': 7, 'Unassigned': 1 };
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
      // Delete all but the first (best) copy
      for (let i = 1; i < copies.length; i++) {
        tripsToDelete.push(copies[i]);
      }
    }
  });

  console.log(`Duplicates to delete: ${tripsToDelete.length}`);
  if (tripsToDelete.length > 0) {
    console.log('Sample duplicates:');
    tripsToDelete.slice(0, 5).forEach(t => {
      console.log(`  ${t.id} | bookingId=${t.bookingId} | ${t.patient} | ${t.date}`);
    });

    if (!DRY_RUN) {
      let deleted = 0;
      for (let i = 0; i < tripsToDelete.length; i += 450) {
        const chunk = tripsToDelete.slice(i, i + 450);
        const writes = chunk.map(t => ({ delete: `projects/${PROJECT}/databases/(default)/documents/trips/${t.id}` }));
        await commitBatch(writes, token);
        deleted += chunk.length;
        console.log(`  Deleted ${deleted}/${tripsToDelete.length} from root trips`);
      }
    }
  }

  // 2. Clean tripLedger collection
  console.log('\n--- tripLedger ---');
  const ledgerTrips = await listAllPages('/tripLedger', token);
  console.log(`Total: ${ledgerTrips.length}`);

  const ledgerByBookingId = {};
  ledgerTrips.forEach(t => {
    const key = String(t.bookingId || t.id);
    if (!ledgerByBookingId[key]) ledgerByBookingId[key] = [];
    ledgerByBookingId[key].push(t);
  });

  const ledgerToDelete = [];
  Object.entries(ledgerByBookingId).forEach(([key, copies]) => {
    if (copies.length > 1) {
      const STATUS_PRIORITY = { 'Completed': 10, 'At Pickup': 9, 'In Mission': 9, 'Assigned': 8, 'No Show': 7, 'Cancelled': 7, 'Rerouted': 7, 'Unassigned': 1 };
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
      for (let i = 1; i < copies.length; i++) {
        ledgerToDelete.push(copies[i]);
      }
    }
  });

  console.log(`Duplicates to delete: ${ledgerToDelete.length}`);
  if (ledgerToDelete.length > 0 && !DRY_RUN) {
    let deleted = 0;
    for (let i = 0; i < ledgerToDelete.length; i += 450) {
      const chunk = ledgerToDelete.slice(i, i + 450);
      const writes = chunk.map(t => ({ delete: `projects/${PROJECT}/databases/(default)/documents/tripLedger/${t.id}` }));
      await commitBatch(writes, token);
      deleted += chunk.length;
      console.log(`  Deleted ${deleted}/${ledgerToDelete.length} from tripLedger`);
    }
  }

  // 3. Verify
  console.log('\n=== Verification ===');
  const verifyRoot = await listAllPages('/trips', token);
  const verifyLedger = await listAllPages('/tripLedger', token);
  console.log(`Root trips: ${rootTrips.length} → ${verifyRoot.length}`);
  console.log(`tripLedger: ${ledgerTrips.length} → ${verifyLedger.length}`);
  console.log(`\nDone. ${DRY_RUN ? '(DRY RUN - no changes made)' : 'Duplicates cleaned.'}`);
}

main().catch(err => { console.error('Failed:', err); process.exit(1); });
