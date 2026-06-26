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

const PLACEHOLDER_NAMES = new Set(['', '-', '--', '\u2014', 'n/a', 'na', 'none', 'null', 'undefined', 'unknown', 'unnamed', 'unnamed client', 'client', 'patient', 'wc', 'will call']);
const PLACEHOLDER_ADDRESSES = new Set(['', '-', '--', '\u2014', 'n/a', 'na', 'none', 'null', 'undefined']);
const ROUTE_KEY_PATTERNS = [/::leg:/i, /^id:bk[:]/i, /^bk[:]/i, /^(bk|id|cmp)::/i, /\|(?:scheduled|unscheduled|will\s*call)\|/i];

function textValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  if (typeof value === 'object') {
    return [
      value.address,
      value.formattedAddress,
      value.label,
      value.name,
      value.street,
      value.line1,
    ].map(textValue).find(Boolean) || '';
  }
  return String(value).trim();
}

function normalized(value) {
  return textValue(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function isRouteKey(value) {
  const text = textValue(value);
  return text && ROUTE_KEY_PATTERNS.some(pattern => pattern.test(text));
}

function isCorrupted(trip) {
  const patient = normalized(trip.patient || trip.patientName || trip.clientName || trip.memberName);
  const pickup = normalized(trip.pickup || trip.pickupAddress || trip.originAddress || trip.fromAddress || trip.origin);
  const dropoff = normalized(trip.dropoff || trip.dropoffAddress || trip.destinationAddress || trip.toAddress || trip.destination);
  const date = textValue(trip.date || trip.scheduleDate || trip.tripDate || trip.serviceDate || trip.appointmentDate);

  if ([trip.id, trip.bookingId, trip.tripNumber, trip.tripId, trip.clientId].some(isRouteKey)) return true;
  if (PLACEHOLDER_NAMES.has(patient)) return true;
  if (PLACEHOLDER_ADDRESSES.has(pickup) && PLACEHOLDER_ADDRESSES.has(dropoff)) return true;
  if (!date) return true;
  return false;
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

async function main() {
  const token = await refreshToken();
  const DRY_RUN = process.argv.includes('--dry-run');

  console.log(`=== Clean Corrupted Trips (${DRY_RUN ? 'DRY RUN' : 'LIVE'}) ===\n`);

  // Check root trips
  console.log('--- Root trips ---');
  const rootTrips = await listAllPages('/trips', token);
  console.log(`Total: ${rootTrips.length}`);

  const corruptedRoot = rootTrips.filter(isCorrupted);
  console.log(`Corrupted: ${corruptedRoot.length}`);
  
  if (corruptedRoot.length > 0) {
    console.log('Sample corrupted:');
    corruptedRoot.slice(0, 10).forEach(t => {
      console.log(`  ${t.id} | patient=${t.patient} | pickup=${t.pickup || 'none'} | dropoff=${t.dropoff || 'none'} | status=${t.status}`);
    });

    if (!DRY_RUN) {
      let deleted = 0;
      for (let i = 0; i < corruptedRoot.length; i += 450) {
        const chunk = corruptedRoot.slice(i, i + 450);
        const writes = chunk.map(t => ({ delete: `projects/${PROJECT}/databases/(default)/documents/trips/${t.id}` }));
        await apiRequest('POST', ':commit', token, { writes });
        deleted += chunk.length;
        console.log(`  Deleted ${deleted}/${corruptedRoot.length} from root trips`);
      }
    }
  }

  // Check tripLedger
  console.log('\n--- tripLedger ---');
  const ledgerTrips = await listAllPages('/tripLedger', token);
  console.log(`Total: ${ledgerTrips.length}`);

  const corruptedLedger = ledgerTrips.filter(isCorrupted);
  console.log(`Corrupted: ${corruptedLedger.length}`);

  if (corruptedLedger.length > 0 && !DRY_RUN) {
    let deleted = 0;
    for (let i = 0; i < corruptedLedger.length; i += 450) {
      const chunk = corruptedLedger.slice(i, i + 450);
      const writes = chunk.map(t => ({ delete: `projects/${PROJECT}/databases/(default)/documents/tripLedger/${t.id}` }));
      await apiRequest('POST', ':commit', token, { writes });
      deleted += chunk.length;
      console.log(`  Deleted ${deleted}/${corruptedLedger.length} from tripLedger`);
    }
  }

  // Check root trashedTrips
  console.log('\n--- Root trashedTrips ---');
  const rootTrashedTrips = await listAllPages('/trashedTrips', token);
  console.log(`Total: ${rootTrashedTrips.length}`);

  const corruptedRootTrashed = rootTrashedTrips.filter(isCorrupted);
  console.log(`Corrupted: ${corruptedRootTrashed.length}`);

  if (corruptedRootTrashed.length > 0 && !DRY_RUN) {
    let deleted = 0;
    for (let i = 0; i < corruptedRootTrashed.length; i += 450) {
      const chunk = corruptedRootTrashed.slice(i, i + 450);
      const writes = chunk.map(t => ({ delete: `projects/${PROJECT}/databases/(default)/documents/trashedTrips/${t.id}` }));
      await apiRequest('POST', ':commit', token, { writes });
      deleted += chunk.length;
      console.log(`  Deleted ${deleted}/${corruptedRootTrashed.length} from root trashedTrips`);
    }
  }

  // Check appData/agape
  console.log('\n--- appData/agape ---');
  const appDataResult = await apiRequest('GET', '/appData/agape', token);
  const appData = docToObj(appDataResult);
  const appTrips = Array.isArray(appData.trips) ? appData.trips : [];
  const appTrashed = Array.isArray(appData.trashedTrips) ? appData.trashedTrips : [];

  const corruptedApp = appTrips.filter(isCorrupted);
  const corruptedTrashed = appTrashed.filter(isCorrupted);
  console.log(`appData trips: ${appTrips.length}, corrupted: ${corruptedApp.length}`);
  console.log(`appData trashed: ${appTrashed.length}, corrupted: ${corruptedTrashed.length}`);

  if ((corruptedApp.length > 0 || corruptedTrashed.length > 0) && !DRY_RUN) {
    const cleanTrips = appTrips.filter(t => !isCorrupted(t));
    const cleanTrashed = appTrashed.filter(t => !isCorrupted(t));
    await apiRequest('PATCH', '/appData/agape?updateMask.fieldPaths=trips&updateMask.fieldPaths=trashedTrips', token, {
      fields: {
        trips: encodeValue(cleanTrips),
        trashedTrips: encodeValue(cleanTrashed),
      }
    });
    console.log(`Cleaned appData: ${cleanTrips.length} trips, ${cleanTrashed.length} trashed`);
  }

  // Verify
  console.log('\n=== Verification ===');
  const verifyRoot = await listAllPages('/trips', token);
  const verifyLedger = await listAllPages('/tripLedger', token);
  console.log(`Root trips: ${rootTrips.length} → ${verifyRoot.length}`);
  console.log(`tripLedger: ${ledgerTrips.length} → ${verifyLedger.length}`);
  console.log(`\nDone. ${DRY_RUN ? '(DRY RUN)' : 'Corrupted trips removed.'}`);
}

main().catch(err => { console.error('Failed:', err); process.exit(1); });
