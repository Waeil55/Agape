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

function isCorrupted(trip) {
  const patient = String(trip.patient || trip.patientName || '').trim();
  const pickup = String(trip.pickup || trip.pickupAddress || '').trim();
  const dropoff = String(trip.dropoff || trip.dropoffAddress || '').trim();
  
  // Corrupted if: no patient name, or patient is "Unnamed Client"/"WC", and no pickup/dropoff
  if (!patient || patient === 'Unnamed Client' || patient === 'WC' || patient === 'null' || patient === 'undefined') {
    if (!pickup && !dropoff) return true;
  }
  
  // Corrupted if: pickup = dropoff (same address)
  if (pickup && dropoff && pickup.toLowerCase().replace(/\s+/g, ' ') === dropoff.toLowerCase().replace(/\s+/g, ' ')) {
    return true;
  }
  
  return false;
}

async function main() {
  const token = await refreshToken();

  console.log('=== Checking root trips for corrupted data ===\n');

  const rootTrips = await listAllPages('/trips', token);
  console.log(`Total root trips: ${rootTrips.length}`);

  const corrupted = rootTrips.filter(isCorrupted);
  console.log(`Corrupted trips: ${corrupted.length}`);

  if (corrupted.length > 0) {
    console.log('\nSample corrupted trips:');
    corrupted.slice(0, 20).forEach(t => {
      console.log(`  ${t.id} | patient=${t.patient || 'null'} | pickup=${t.pickup || 'none'} | dropoff=${t.dropoff || 'none'} | date=${t.date} | status=${t.status}`);
    });

    // Also check for pickup = dropoff
    const samePickupDropoff = rootTrips.filter(t => {
      const pickup = String(t.pickup || '').trim().toLowerCase();
      const dropoff = String(t.dropoff || '').trim().toLowerCase();
      return pickup && dropoff && pickup === dropoff;
    });
    console.log(`\nTrips with pickup = dropoff: ${samePickupDropoff.length}`);
    samePickupDropoff.slice(0, 10).forEach(t => {
      console.log(`  ${t.id} | ${t.patient} | ${t.pickup}`);
    });
  }

  // Check date distribution
  const dateCounts = {};
  rootTrips.forEach(t => {
    const d = String(t.date || 'no-date').slice(0, 10);
    dateCounts[d] = (dateCounts[d] || 0) + 1;
  });
  console.log('\nDate distribution:');
  Object.entries(dateCounts).sort((a, b) => b[1] - a[1]).forEach(([d, c]) => console.log(`  ${d}: ${c}`));

  // Check for trips with bookingId starting with "107296" (from user's paste)
  const userTrips = rootTrips.filter(t => String(t.bookingId || '').startsWith('107296'));
  console.log(`\nTrips with bookingId starting with 107296: ${userTrips.length}`);
  userTrips.forEach(t => {
    console.log(`  ${t.id} | bookingId=${t.bookingId} | patient=${t.patient} | pickup=${t.pickup || 'none'} | dropoff=${t.dropoff || 'none'} | date=${t.date}`);
  });
}

main().catch(err => { console.error('Failed:', err); process.exit(1); });
