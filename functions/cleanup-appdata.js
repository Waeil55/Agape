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

function dedupByKey(trips) {
  const STATUS_PRIORITY = { 'Completed': 10, 'At Pickup': 9, 'In Mission': 9, 'Assigned': 8, 'No Show': 7, 'Cancelled': 7, 'Rerouted': 7, 'Unassigned': 1 };
  const groups = {};
  trips.forEach(t => {
    const key = String(t.bookingId || t.id);
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });
  const result = [];
  Object.values(groups).forEach(copies => {
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
  });
  return result;
}

async function main() {
  const token = await refreshToken();

  console.log('=== Cleaning appData/agape ===\n');

  const appDataResult = await apiRequest('GET', '/appData/agape', token);
  const appData = docToObj(appDataResult);

  const appTrips = Array.isArray(appData.trips) ? appData.trips : [];
  const appTrashed = Array.isArray(appData.trashedTrips) ? appData.trashedTrips : [];

  console.log(`Before: trips=${appTrips.length}, trashedTrips=${appTrashed.length}`);

  const cleanTrips = dedupByKey(appTrips);
  const cleanTrashed = dedupByKey(appTrashed);

  console.log(`After:  trips=${cleanTrips.length}, trashedTrips=${cleanTrashed.length}`);
  console.log(`Removed: ${appTrips.length - cleanTrips.length} trip dupes, ${appTrashed.length - cleanTrashed.length} trashed dupes`);

  // Build the update document - only update trips and trashedTrips arrays
  const fields = {};
  for (const [k, v] of Object.entries(appData)) {
    if (k === 'id') continue;
    if (k === 'trips') {
      fields[k] = encodeValue(cleanTrips);
    } else if (k === 'trashedTrips') {
      fields[k] = encodeValue(cleanTrashed);
    } else {
      fields[k] = encodeValue(v);
    }
  }

  const body = { fields };
  await apiRequest('PATCH', '/appData/agape?updateMask.fieldPaths=trips&updateMask.fieldPaths=trashedTrips', token, {
    fields: {
      trips: encodeValue(cleanTrips),
      trashedTrips: encodeValue(cleanTrashed),
    }
  });

  console.log('\nDone. appData/agape cleaned.');
}

main().catch(err => { console.error('Failed:', err); process.exit(1); });
