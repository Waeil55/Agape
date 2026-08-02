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

// All 32 trip IDs from the user's paste
const TARGET_IDS = [
  '106952747', '106952748', '107080356', '107091766', '107091768',
  '107098453', '107098454', '107098455', '107098456', '107103470',
  '107103471', '107103472', '107103477', '107106322', '107106323',
  '107123151', '107123209', '107123322', '107123351', '107143509',
  '107143534', '107143802', '107146770', '107146810', '107178059',
  '107178073', '107178254', '107178261', '107178265', '107180386',
  '107180410', '107180474'
];

async function main() {
  const token = await refreshToken();

  console.log('=== Checking root TRIPS collection ===');
  let foundInTrips = 0;
  let missingFromTrips = [];
  for (const id of TARGET_IDS) {
    const result = await apiRequest('GET', `/trips/${id}`, token);
    if (result.error) {
      missingFromTrips.push(id);
    } else {
      foundInTrips++;
    }
  }
  console.log(`Found in root trips: ${foundInTrips}/${TARGET_IDS.length}`);
  if (missingFromTrips.length > 0) {
    console.log(`Missing from root trips: ${missingFromTrips.length}`);
    missingFromTrips.forEach(id => console.log(`  - ${id}`));
  }

  console.log('\n=== Checking root TRASHED_TRIPS collection ===');
  let foundInTrashed = 0;
  let missingFromTrashed = [];
  for (const id of TARGET_IDS) {
    const result = await apiRequest('GET', `/trashedTrips/${id}`, token);
    if (result.error) {
      missingFromTrashed.push(id);
    } else {
      foundInTrashed++;
    }
  }
  console.log(`Found in root trashedTrips: ${foundInTrashed}/${TARGET_IDS.length}`);
  if (missingFromTrashed.length > 0) {
    console.log(`Missing from root trashedTrips: ${missingFromTrashed.length}`);
  }

  console.log('\n=== Checking TRIP_LEDGER collection ===');
  let foundInLedger = 0;
  let missingFromLedger = [];
  for (const id of TARGET_IDS) {
    const result = await apiRequest('GET', `/tripLedger/${id}`, token);
    if (result.error) {
      missingFromLedger.push(id);
    } else {
      foundInLedger++;
    }
  }
  console.log(`Found in tripLedger: ${foundInLedger}/${TARGET_IDS.length}`);
  if (missingFromLedger.length > 0) {
    console.log(`Missing from tripLedger: ${missingFromLedger.length}`);
  }

  console.log('\n=== Checking appData/agape ===');
  const appDataSnap = await apiRequest('GET', '/appData/agape', token);
  const appData = docToObj(appDataSnap);
  const appDataTripIds = (appData.trips || []).map(t => String(t.id));
  const foundInAppData = TARGET_IDS.filter(id => appDataTripIds.includes(id));
  const missingFromAppData = TARGET_IDS.filter(id => !appDataTripIds.includes(id));
  console.log(`Found in appData/trips: ${foundInAppData.length}/${TARGET_IDS.length}`);
  if (missingFromAppData.length > 0) {
    console.log(`Missing from appData/trips: ${missingFromAppData.length}`);
    missingFromAppData.forEach(id => console.log(`  - ${id}`));
  }

  console.log('\n=== Summary ===');
  console.log(`These ${TARGET_IDS.length} trips exist in:`);
  console.log(`  Root trips:    ${foundInTrips}`);
  console.log(`  Root trashed:  ${foundInTrashed}`);
  console.log(`  tripLedger:    ${foundInLedger}`);
  console.log(`  appData:       ${foundInAppData.length}`);

  if (missingFromTrips.length > 0) {
    console.log(`\n*** ${missingFromTrips.length} trips are NOT in root trips — they won't show in the app ***`);
  }
}

main().catch(err => { console.error('Failed:', err); process.exit(1); });
