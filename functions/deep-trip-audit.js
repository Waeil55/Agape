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

async function main() {
  const token = await refreshToken();

  console.log('=== appData/agape ===');
  const appDataResult = await apiRequest('GET', '/appData/agape', token);
  const appData = docToObj(appDataResult);
  const appTrips = Array.isArray(appData.trips) ? appData.trips : [];
  const appTrashed = Array.isArray(appData.trashedTrips) ? appData.trashedTrips : [];
  console.log(`trips: ${appTrips.length}, trashedTrips: ${appTrashed.length}`);

  // Date distribution in appData
  const appDates = {};
  appTrips.forEach(t => {
    const d = String(t.date || 'no-date').slice(0, 10);
    appDates[d] = (appDates[d] || 0) + 1;
  });
  console.log('\nDate distribution in appData/trips:');
  Object.entries(appDates).sort((a, b) => b[1] - a[1]).forEach(([d, c]) => console.log(`  ${d}: ${c}`));

  // Show first 5 trips with key fields
  console.log('\nFirst 5 appData trips:');
  appTrips.slice(0, 5).forEach(t => {
    console.log(`  id=${t.id} | bookingId=${t.bookingId} | date=${t.date} | time=${t.time} | patient=${t.patient} | status=${t.status}`);
  });

  console.log('\n=== Root trips collection (all pages) ===');
  const rootTrips = await listAllPages('/trips', token);
  console.log(`Total root trips: ${rootTrips.length}`);

  const rootDates = {};
  rootTrips.forEach(t => {
    const d = String(t.date || 'no-date').slice(0, 10);
    rootDates[d] = (rootDates[d] || 0) + 1;
  });
  console.log('\nDate distribution in root trips:');
  Object.entries(rootDates).sort((a, b) => b[1] - a[1]).forEach(([d, c]) => console.log(`  ${d}: ${c}`));

  // Show first 5 root trips
  console.log('\nFirst 5 root trips:');
  rootTrips.slice(0, 5).forEach(t => {
    console.log(`  id=${t.id} | bookingId=${t.bookingId} | date=${t.date} | time=${t.time} | patient=${t.patient} | status=${t.status}`);
  });

  console.log('\n=== Root trashedTrips (all pages) ===');
  const rootTrashed = await listAllPages('/trashedTrips', token);
  console.log(`Total root trashedTrips: ${rootTrashed.length}`);

  console.log('\n=== tripLedger (all pages) ===');
  const ledgerTrips = await listAllPages('/tripLedger', token);
  console.log(`Total tripLedger: ${ledgerTrips.length}`);

  // Check for booking IDs matching the user's paste
  const targetBookingIds = [
    '106952747', '106952748', '107080356', '107091766', '107091768',
    '107098453', '107098454', '107098455', '107098456', '107103470',
    '107103471', '107103472', '107103477', '107106322', '107106323',
    '107123151', '107123209', '107123322', '107123351', '107143509',
    '107143534', '107143802', '107146770', '107146810', '107178059',
    '107178073', '107178254', '107178261', '107178265', '107180386',
    '107180410', '107180474'
  ];

  console.log('\n=== Searching for user booking IDs across all sources ===');
  const allTrips = [...rootTrips, ...rootTrashed, ...ledgerTrips, ...appTrips, ...appTrashed];
  for (const bid of targetBookingIds) {
    const matches = allTrips.filter(t => String(t.bookingId) === bid || String(t.id) === bid);
    if (matches.length > 0) {
      console.log(`  ${bid}: FOUND ${matches.length}x | id=${matches[0].id} | date=${matches[0].date}`);
    } else {
      console.log(`  ${bid}: NOT FOUND anywhere`);
    }
  }

  // Duplicates check
  const idCounts = {};
  allTrips.forEach(t => {
    const key = String(t.bookingId || t.id);
    idCounts[key] = (idCounts[key] || 0) + 1;
  });
  const dups = Object.entries(idCounts).filter(([k, c]) => c > 1);
  console.log(`\n=== Duplicates (by bookingId or id): ${dups.length} ===`);
  dups.slice(0, 20).forEach(([k, c]) => console.log(`  ${k}: ${c} copies`));
}

main().catch(err => { console.error('Failed:', err); process.exit(1); });
