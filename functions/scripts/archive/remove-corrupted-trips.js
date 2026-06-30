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

function isCorrupted(trip) {
  const pickup = String(trip.pickup || trip.pickupAddress || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const dropoff = String(trip.dropoff || trip.dropoffAddress || '').trim().toLowerCase().replace(/\s+/g, ' ');
  
  // Corrupted if pickup = dropoff (same address)
  if (pickup && dropoff && pickup === dropoff) return true;
  
  // Corrupted if no patient name
  const patient = String(trip.patient || trip.patientName || '').trim();
  if (!patient || patient === 'Unnamed Client' || patient === 'WC' || patient === 'null') return true;
  
  // Corrupted if no pickup AND no dropoff
  if (!pickup && !dropoff) return true;
  
  return false;
}

async function main() {
  const token = await refreshToken();

  console.log('=== Remove corrupted trips (pickup = dropoff) ===\n');

  // 1. Clean root trips
  const rootTrips = await listAllPages('/trips', token);
  const corruptedRoot = rootTrips.filter(isCorrupted);
  const cleanRoot = rootTrips.filter(t => !isCorrupted(t));
  console.log(`Root trips: ${rootTrips.length} → ${cleanRoot.length} (${corruptedRoot.length} corrupted)`);

  if (corruptedRoot.length > 0) {
    const writes = corruptedRoot.map(t => ({ delete: `projects/${PROJECT}/databases/(default)/documents/trips/${t.id}` }));
    for (let i = 0; i < writes.length; i += 450) {
      const chunk = writes.slice(i, i + 450);
      await apiRequest('POST', ':commit', token, { writes: chunk });
    }
    console.log(`  Deleted ${corruptedRoot.length} corrupted trips from root`);
  }

  // 2. Clean appData/agape
  const appDataResult = await apiRequest('GET', '/appData/agape', token);
  const appData = docToObj(appDataResult);
  const appTrips = Array.isArray(appData.trips) ? appData.trips : [];
  const appTrashed = Array.isArray(appData.trashedTrips) ? appData.trashedTrips : [];

  const corruptedApp = appTrips.filter(isCorrupted);
  const cleanApp = appTrips.filter(t => !isCorrupted(t));
  console.log(`\nappData trips: ${appTrips.length} → ${cleanApp.length} (${corruptedApp.length} corrupted)`);

  if (corruptedApp.length > 0) {
    await apiRequest('PATCH', '/appData/agape?updateMask.fieldPaths=trips', token, {
      fields: { trips: encodeValue(cleanApp) }
    });
    console.log(`  Cleaned appData/agape`);
  }

  // 3. Clean root trashedTrips
  const rootTrashed = await listAllPages('/trashedTrips', token);
  const corruptedTrashed = rootTrashed.filter(isCorrupted);
  const cleanTrashed = rootTrashed.filter(t => !isCorrupted(t));
  console.log(`\nRoot trashedTrips: ${rootTrashed.length} → ${cleanTrashed.length} (${corruptedTrashed.length} corrupted)`);

  if (corruptedTrashed.length > 0) {
    const writes = corruptedTrashed.map(t => ({ delete: `projects/${PROJECT}/databases/(default)/documents/trashedTrips/${t.id}` }));
    for (let i = 0; i < writes.length; i += 450) {
      const chunk = writes.slice(i, i + 450);
      await apiRequest('POST', ':commit', token, { writes: chunk });
    }
    console.log(`  Deleted ${corruptedTrashed.length} corrupted trashed trips`);
  }

  console.log('\nDone.');
}

main().catch(err => { console.error('Failed:', err); process.exit(1); });
