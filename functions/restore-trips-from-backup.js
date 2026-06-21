#!/usr/bin/env node
const https = require('https');

const PROJECT = 'agape-95c9f';
const account = require('C:/Users/waeil/.config/configstore/firebase-tools.json');

const DRY_RUN = process.argv.includes('--dry-run');
const sourceArg = process.argv.find(arg => arg.startsWith('--source='));
const SOURCE_BACKUP_ID = sourceArg ? sourceArg.split('=').slice(1).join('=') : 'daily-2026-06-15';

function refreshToken() {
  return new Promise((resolve, reject) => {
    const postData = `client_id=563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com&client_secret=j9iVZfS8kkCEFUPaAeJV0sAi&refresh_token=${account.tokens.refresh_token}&grant_type=refresh_token`;
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data).access_token);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
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
  if (field.arrayValue) return (field.arrayValue.values || []).map(decodeValue);
  if (field.mapValue) {
    const obj = {};
    for (const [key, value] of Object.entries(field.mapValue.fields || {})) {
      obj[key] = decodeValue(value);
    }
    return obj;
  }
  return null;
}

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: 'NULL_VALUE' };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') {
    const fields = {};
    for (const [key, val] of Object.entries(value)) {
      if (val !== undefined) fields[key] = encodeValue(val);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function docToObj(document) {
  if (!document || document.error) return null;
  const obj = {
    id: String(document.name || '').split('/').pop(),
    __name: document.name,
    __createTime: document.createTime,
    __updateTime: document.updateTime,
  };
  for (const [key, value] of Object.entries(document.fields || {})) {
    obj[key] = decodeValue(value);
  }
  return obj;
}

function objToFields(obj) {
  const fields = {};
  for (const [key, value] of Object.entries(obj || {})) {
    if (key.startsWith('__')) continue;
    if (value !== undefined) fields[key] = encodeValue(value);
  }
  return fields;
}

function apiRequest(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const req = https.request({
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${PROJECT}/databases/(default)/documents${path}`,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          if (res.statusCode >= 400) {
            reject(new Error(parsed?.error?.message || `HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(payload);
    req.end();
  });
}

async function getDocument(path, token) {
  try {
    return docToObj(await apiRequest('GET', `/${path}`, token));
  } catch {
    return null;
  }
}

async function listCollection(collectionName, token) {
  const docs = [];
  let pageToken = '';
  do {
    const suffix = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const result = await apiRequest('GET', `/${collectionName}?pageSize=300${suffix}`, token);
    docs.push(...(result.documents || []).map(docToObj).filter(Boolean));
    pageToken = result.nextPageToken || '';
  } while (pageToken);
  return docs;
}

async function commitWrites(writes, token) {
  for (let i = 0; i < writes.length; i += 450) {
    const chunk = writes.slice(i, i + 450);
    await apiRequest('POST', ':commit', token, { writes: chunk });
  }
}

function fullDocName(path) {
  return `projects/${PROJECT}/databases/(default)/documents/${path}`;
}

function updateWrite(path, data) {
  return {
    update: {
      name: fullDocName(path),
      fields: objToFields(data),
    },
  };
}

function deleteWrite(nameOrPath) {
  const name = String(nameOrPath || '').startsWith('projects/')
    ? nameOrPath
    : fullDocName(nameOrPath);
  return { delete: name };
}

function byBookingId(records = []) {
  const map = new Map();
  for (const record of records) {
    const bookingId = String(record?.bookingId || '').trim();
    if (!bookingId) continue;
    if (!map.has(bookingId)) map.set(bookingId, []);
    map.get(bookingId).push(record);
  }
  return map;
}

function logicalKey(trip) {
  const bookingId = String(trip?.bookingId || '').trim();
  if (bookingId) return `bk::${bookingId.toLowerCase()}`;
  return [
    String(trip?.patient || '').trim().toLowerCase(),
    String(trip?.date || '').trim(),
    String(trip?.time || '').trim(),
    String(trip?.pickup || '').trim().toLowerCase().replace(/\s+/g, ' '),
    String(trip?.dropoff || '').trim().toLowerCase().replace(/\s+/g, ' '),
  ].join('|');
}

const STATUS_PRIORITY = {
  Completed: 10,
  'At Pickup': 9,
  'In Mission': 9,
  Assigned: 8,
  'No Show': 7,
  Cancelled: 7,
  Rerouted: 7,
  Unassigned: 1,
};

function recordTime(trip) {
  const raw = trip?.updatedAtLocal || trip?.updatedAt || trip?.createdAt || trip?.completedAt;
  const parsed = Date.parse(raw || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function dedupeTrips(trips = []) {
  const groups = new Map();
  for (const trip of trips) {
    const key = logicalKey(trip);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(trip);
  }
  const result = [];
  for (const group of groups.values()) {
    group.sort((a, b) => {
      const statusDiff = (STATUS_PRIORITY[b?.status] || 0) - (STATUS_PRIORITY[a?.status] || 0);
      if (statusDiff) return statusDiff;
      const driverDiff = (b?.driverId ? 1 : 0) - (a?.driverId ? 1 : 0);
      if (driverDiff) return driverDiff;
      return recordTime(b) - recordTime(a);
    });
    result.push(group[0]);
  }
  return result;
}

function makeSafeTripId(trip) {
  const bookingId = String(trip?.bookingId || '').trim();
  if (bookingId) return `bk-${bookingId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const raw = String(trip?.id || logicalKey(trip) || `trip-${Date.now()}`)
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 180);
  return raw || `trip-${Date.now()}`;
}

function cleanTripForWrite(trip, archiveState = null) {
  const safeId = makeSafeTripId(trip);
  const cleaned = { ...trip, id: safeId };
  if (trip?.id && trip.id !== safeId) cleaned.legacyId = trip.id;
  delete cleaned.__name;
  delete cleaned.__createTime;
  delete cleaned.__updateTime;
  if (archiveState) cleaned.archiveState = archiveState;
  cleaned.restoredFromBackup = SOURCE_BACKUP_ID;
  cleaned.restoredAtLocal = new Date().toISOString();
  return cleaned;
}

async function main() {
  const token = await refreshToken();
  const sourceBackup = await getDocument(`systemBackups/${SOURCE_BACKUP_ID}`, token);
  if (!sourceBackup || !Array.isArray(sourceBackup.trips)) {
    throw new Error(`Backup ${SOURCE_BACKUP_ID} does not exist or has no trips array.`);
  }

  const [activeTrips, trashedTrips, ledgerTrips, appData] = await Promise.all([
    listCollection('trips', token),
    listCollection('trashedTrips', token),
    listCollection('tripLedger', token),
    getDocument('appData/agape', token),
  ]);

  const sourceTrips = sourceBackup.trips.filter(trip => trip?.bookingId);
  const sourceByBooking = byBookingId(sourceTrips);
  const activeToDelete = activeTrips.filter(trip => sourceByBooking.has(String(trip.bookingId || '').trim()));
  const activeToKeep = activeTrips.filter(trip => !sourceByBooking.has(String(trip.bookingId || '').trim()));
  const ledgerToDelete = ledgerTrips.filter(trip => (
    trip.archiveState !== 'archived' && sourceByBooking.has(String(trip.bookingId || '').trim())
  ));

  const restoredTrips = sourceTrips.map(trip => cleanTripForWrite(trip));
  const finalActiveTrips = dedupeTrips([...restoredTrips, ...activeToKeep.map(trip => {
    const cleaned = { ...trip };
    delete cleaned.__name;
    delete cleaned.__createTime;
    delete cleaned.__updateTime;
    return cleaned;
  })]);
  const finalTrashedTrips = dedupeTrips((trashedTrips || []).map(trip => {
    const cleaned = { ...trip };
    delete cleaned.__name;
    delete cleaned.__createTime;
    delete cleaned.__updateTime;
    return cleaned;
  }));

  const manualBackupId = `manual-before-trip-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const manualBackup = {
    ...(appData || {}),
    id: manualBackupId,
    trips: activeTrips.map(trip => {
      const cleaned = { ...trip };
      delete cleaned.__name;
      delete cleaned.__createTime;
      delete cleaned.__updateTime;
      return cleaned;
    }),
    trashedTrips: finalTrashedTrips,
    reason: 'before-trip-restore',
    sourceBackup: SOURCE_BACKUP_ID,
    backedUpAt: new Date().toISOString(),
    counts: {
      trips: activeTrips.length,
      trashedTrips: trashedTrips.length,
      logs: Array.isArray(appData?.logs) ? appData.logs.length : 0,
      drivers: Array.isArray(appData?.drivers) ? appData.drivers.length : 0,
      dispatchers: Array.isArray(appData?.dispatchers) ? appData.dispatchers.length : 0,
      vehicles: Array.isArray(appData?.vehicles) ? appData.vehicles.length : 0,
    },
  };

  const rootWrites = [
    ...activeToDelete.map(trip => deleteWrite(trip.__name)),
    ...restoredTrips.map(trip => updateWrite(`trips/${trip.id}`, { ...trip, id: trip.id })),
  ];

  const ledgerWrites = [
    ...ledgerToDelete.map(trip => deleteWrite(trip.__name)),
    ...restoredTrips.map(trip => updateWrite(`tripLedger/${trip.id}`, cleanTripForWrite(trip, 'active'))),
  ];

  console.log(`Source backup: ${SOURCE_BACKUP_ID}`);
  console.log(`Current active trips: ${activeTrips.length}`);
  console.log(`Current trashed trips: ${trashedTrips.length}`);
  console.log(`Source trips to restore: ${restoredTrips.length}`);
  console.log(`Active docs to remove by bookingId: ${activeToDelete.length}`);
  console.log(`Active docs to keep: ${activeToKeep.length}`);
  console.log(`Final active trip count: ${finalActiveTrips.length}`);
  console.log(`TripLedger active docs to remove by bookingId: ${ledgerToDelete.length}`);
  console.log(`Manual safety backup: ${manualBackupId}`);

  if (DRY_RUN) {
    console.log('DRY RUN - no writes performed.');
    return;
  }

  await commitWrites([updateWrite(`systemBackups/${manualBackupId}`, manualBackup)], token);
  await commitWrites(rootWrites, token);
  await commitWrites(ledgerWrites, token);
  await commitWrites([
    updateWrite('appData/agape', {
      ...(appData || {}),
      trips: finalActiveTrips,
      trashedTrips: finalTrashedTrips,
      restoredFromBackup: SOURCE_BACKUP_ID,
      restoredAtLocal: new Date().toISOString(),
      updatedAtLocal: new Date().toISOString(),
      updatedField: 'trips-restore',
    }),
  ], token);

  const [verifyActive, verifyAppData] = await Promise.all([
    listCollection('trips', token),
    getDocument('appData/agape', token),
  ]);
  const verifyByDate = {};
  for (const trip of verifyActive) {
    verifyByDate[trip.date || 'NO_DATE'] = (verifyByDate[trip.date || 'NO_DATE'] || 0) + 1;
  }

  console.log('Restore complete.');
  console.log(`Root trips now: ${verifyActive.length}`);
  console.log(`appData/agape trips now: ${Array.isArray(verifyAppData?.trips) ? verifyAppData.trips.length : 0}`);
  console.log('Root trips by date:', verifyByDate);
}

main().catch(err => {
  console.error('Restore failed:', err);
  process.exit(1);
});
