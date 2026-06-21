#!/usr/bin/env node
const https = require('https');
const PROJECT = 'agape-95c9f';
const account = require('C:/Users/waeil/.config/configstore/firebase-tools.json');

function refreshToken() {
  return new Promise((resolve, reject) => {
    const postData = `client_id=563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com&client_secret=j9iVZfS8kkCEFUPaAeJV0sAi&refresh_token=${account.tokens.refresh_token}&grant_type=refresh_token`;
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

function isValidTrip(trip) {
  const patient = String(trip.patient || trip.patientName || '').trim();
  const pickup = String(trip.pickup || trip.pickupAddress || '').trim();
  const dropoff = String(trip.dropoff || trip.dropoffAddress || '').trim();
  
  // Must have a real patient name
  if (!patient || patient === 'Unnamed Client' || patient === 'WC' || patient === 'null' || patient === 'undefined') return false;
  
  // Must have at least pickup or dropoff
  if (!pickup && !dropoff) return false;
  
  // Must have a date
  if (!trip.date) return false;
  
  return true;
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

  console.log('=== Deep Clean appData/agape ===\n');

  // 1. Read appData/agape
  const appDataResult = await apiRequest('GET', '/appData/agape', token);
  const appData = docToObj(appDataResult);
  const appTrips = Array.isArray(appData.trips) ? appData.trips : [];
  const appTrashed = Array.isArray(appData.trashedTrips) ? appData.trashedTrips : [];

  console.log(`Current appData trips: ${appTrips.length}`);
  console.log(`Current appData trashed: ${appTrashed.length}`);

  // 2. Filter out invalid trips
  const validTrips = appTrips.filter(isValidTrip);
  const invalidTrips = appTrips.filter(t => !isValidTrip(t));
  console.log(`\nInvalid trips (will remove): ${invalidTrips.length}`);
  invalidTrips.slice(0, 10).forEach(t => {
    console.log(`  ${t.id} | patient=${t.patient} | pickup=${t.pickup || 'none'} | dropoff=${t.dropoff || 'none'} | date=${t.date}`);
  });

  // 3. Deduplicate
  const { deduped: cleanTrips, duplicates: dupTrips } = dedupByKey(validTrips);
  console.log(`\nDuplicates (will remove): ${dupTrips.length}`);

  // 4. Same for trashed
  const validTrashed = appTrashed.filter(isValidTrip);
  const invalidTrashed = appTrashed.filter(t => !isValidTrip(t));
  const { deduped: cleanTrashed, duplicates: dupTrashed } = dedupByKey(validTrashed);
  console.log(`Invalid trashed (will remove): ${invalidTrashed.length}`);
  console.log(`Duplicate trashed (will remove): ${dupTrashed.length}`);

  // 5. Show date distribution of clean trips
  const dateCounts = {};
  cleanTrips.forEach(t => {
    const d = String(t.date || 'no-date').slice(0, 10);
    dateCounts[d] = (dateCounts[d] || 0) + 1;
  });
  console.log('\nDate distribution of clean trips:');
  Object.entries(dateCounts).sort((a, b) => b[1] - a[1]).forEach(([d, c]) => console.log(`  ${d}: ${c}`));

  console.log(`\nFinal: ${appTrips.length} → ${cleanTrips.length} trips`);
  console.log(`Final: ${appTrashed.length} → ${cleanTrashed.length} trashed`);

  // 6. Write cleaned data
  await apiRequest('PATCH', '/appData/agape?updateMask.fieldPaths=trips&updateMask.fieldPaths=trashedTrips', token, {
    fields: {
      trips: encodeValue(cleanTrips),
      trashedTrips: encodeValue(cleanTrashed),
    }
  });

  console.log('\nDone. appData/agape cleaned.');

  // 7. Now sync to root collections
  console.log('\n=== Syncing to root collections ===');
  
  const rootTrips = await listAllPages('/trips', token);
  const rootTripIds = new Set(rootTrips.map(t => t.id));
  
  const missingTrips = cleanTrips.filter(t => t && t.id && !rootTripIds.has(String(t.id)));
  console.log(`Missing from root trips: ${missingTrips.length}`);
  
  if (missingTrips.length > 0) {
    for (let i = 0; i < missingTrips.length; i += 300) {
      const chunk = missingTrips.slice(i, i + 300);
      const writes = chunk.map(t => ({
        update: { name: `projects/${PROJECT}/databases/(default)/documents/trips/${t.id}`, fields: encodeValue(t).mapValue.fields },
      }));
      await apiRequest('POST', ':commit', token, { writes });
      console.log(`  Wrote ${Math.min(i + 300, missingTrips.length)}/${missingTrips.length} trips`);
    }
  }

  const rootTrashed = await listAllPages('/trashedTrips', token);
  const rootTrashedIds = new Set(rootTrashed.map(t => t.id));
  const missingTrashed = cleanTrashed.filter(t => t && t.id && !rootTrashedIds.has(String(t.id)));
  if (missingTrashed.length > 0) {
    for (let i = 0; i < missingTrashed.length; i += 300) {
      const chunk = missingTrashed.slice(i, i + 300);
      const writes = chunk.map(t => ({
        update: { name: `projects/${PROJECT}/databases/(default)/documents/trashedTrips/${t.id}`, fields: encodeValue(t).mapValue.fields },
      }));
      await apiRequest('POST', ':commit', token, { writes });
      console.log(`  Wrote ${Math.min(i + 300, missingTrashed.length)}/${missingTrashed.length} trashed`);
    }
  }

  console.log('\nDone.');
}

main().catch(err => { console.error('Failed:', err); process.exit(1); });
