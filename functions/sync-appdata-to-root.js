#!/usr/bin/env node
/**
 * sync-appdata-to-root.js
 *
 * One-time script: reads all trips/trashedTrips from appData/agape
 * and writes any missing ones to the root `trips` / `trashedTrips` collections.
 *
 * Usage: node functions/sync-appdata-to-root.js
 */

const https = require('https');
const PROJECT = 'agape-95c9f';
const account = require('C:/Users/waeil/.config/configstore/firebase-tools.json');

function refreshToken() {
  return new Promise((resolve, reject) => {
    const postData = `client_id=563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com&client_secret=j9iVZfS8kkCEFUPaAeJV0sAi&refresh_token=${account.tokens.refresh_token}&grant_type=refresh_token`;
    const req = https.request({ hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) } }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d).access_token); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function apiRequest(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${PROJECT}/databases/(default)/documents${path}`,
      method,
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    };
    const req = https.request(options, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return { integerValue: value };
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

function decodeValue(field) {
  if (!field) return null;
  if (field.nullValue !== undefined) return null;
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.integerValue !== undefined) return Number(field.integerValue);
  if (field.doubleValue !== undefined) return field.doubleValue;
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.timestampValue) return field.timestampValue;
  if (field.arrayValue) return (field.arrayValue.values || []).map(v => decodeValue(v));
  if (field.mapValue) {
    const o = {};
    for (const [k, v] of Object.entries(field.mapValue.fields || {})) o[k] = decodeValue(v);
    return o;
  }
  return null;
}

function docToObj(doc) {
  const obj = { id: doc.name.split('/').pop() };
  for (const [k, v] of Object.entries(doc.fields || {})) {
    obj[k] = decodeValue(v);
  }
  return obj;
}

function objToDoc(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'id') continue;
    if (v !== undefined) fields[k] = encodeValue(v);
  }
  return { fields };
}

async function getDocument(path, token) {
  const result = await apiRequest('GET', `/${path}`, token);
  if (result.error) return null;
  return docToObj(result);
}

async function listCollection(collection, token) {
  const result = await apiRequest('GET', `/${collection}`, token);
  if (result.error) return [];
  const docs = result.documents || [];
  return docs.map(docToObj);
}

async function writeDocument(path, data, token) {
  const body = objToDoc(data);
  return apiRequest('PATCH', `/${path}?mask.fieldPaths=id`, token, body);
}

async function commitBatch(ops, token) {
  if (ops.length === 0) return;
  const writes = ops.map(op => ({
    update: { name: `projects/${PROJECT}/databases/(default)/documents/${op.path}`, fields: objToDoc(op.data).fields },
  }));
  return apiRequest('POST', ':commit', token, { writes });
}

async function main() {
  console.log('=== Sync appData/agape trips → root collections ===\n');

  const token = await refreshToken();
  console.log('Authenticated.\n');

  // 1. Read appData/agape
  const appData = await getDocument('appData/agape', token);
  if (!appData) {
    console.log('appData/agape does not exist. Nothing to sync.');
    return;
  }
  const appDataTrips = Array.isArray(appData.trips) ? appData.trips : [];
  const appDataTrashed = Array.isArray(appData.trashedTrips) ? appData.trashedTrips : [];
  console.log(`appData/agape trips: ${appDataTrips.length}`);
  console.log(`appData/agape trashedTrips: ${appDataTrashed.length}`);

  // 2. Read root collections
  const rootTrips = await listCollection('trips', token);
  const rootTripIds = new Set(rootTrips.map(t => t.id));
  console.log(`\nRoot trips collection: ${rootTripIds.size}`);

  const rootTrashed = await listCollection('trashedTrips', token);
  const rootTrashedIds = new Set(rootTrashed.map(t => t.id));
  console.log(`Root trashedTrips collection: ${rootTrashedIds.size}`);

  // 3. Find missing
  const missingTrips = appDataTrips.filter(t => t && t.id && !rootTripIds.has(String(t.id)));
  const missingTrashed = appDataTrashed.filter(t => t && t.id && !rootTrashedIds.has(String(t.id)));

  console.log(`\nMissing from root trips: ${missingTrips.length}`);
  missingTrips.forEach(t => console.log(`  - ${t.id} | ${t.patientName || 'unknown'} | ${t.date || 'no date'}`));

  console.log(`\nMissing from root trashedTrips: ${missingTrashed.length}`);
  missingTrashed.forEach(t => console.log(`  - ${t.id} | ${t.patientName || 'unknown'} | ${t.date || 'no date'}`));

  if (missingTrips.length === 0 && missingTrashed.length === 0) {
    console.log('\nEverything is already synced!');
    return;
  }

  // 4. Write missing trips in batches of 300
  let totalWritten = 0;
  for (let i = 0; i < missingTrips.length; i += 300) {
    const chunk = missingTrips.slice(i, i + 300);
    const ops = chunk.map(trip => ({
      path: `trips/${trip.id}`,
      data: { ...trip, id: trip.id },
    }));
    await commitBatch(ops, token);
    totalWritten += chunk.length;
    console.log(`  Wrote ${totalWritten}/${missingTrips.length} trips to root trips`);
  }

  let totalTrashed = 0;
  for (let i = 0; i < missingTrashed.length; i += 300) {
    const chunk = missingTrashed.slice(i, i + 300);
    const ops = chunk.map(trip => ({
      path: `trashedTrips/${trip.id}`,
      data: { ...trip, id: trip.id },
    }));
    await commitBatch(ops, token);
    totalTrashed += chunk.length;
    console.log(`  Wrote ${totalTrashed}/${missingTrashed.length} trips to root trashedTrips`);
  }

  // 5. Verify
  const verifyTrips = await listCollection('trips', token);
  const verifyTrashed = await listCollection('trashedTrips', token);
  console.log(`\n=== Verification ===`);
  console.log(`Root trips now: ${verifyTrips.length} (was ${rootTripIds.size})`);
  console.log(`Root trashedTrips now: ${verifyTrashed.length} (was ${rootTrashedIds.size})`);
  console.log(`\nDone! ${totalWritten} trips + ${totalTrashed} trashed synced to root collections.`);
}

main().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});
