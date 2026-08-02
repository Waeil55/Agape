const https = require('https');
const PROJECT = 'agape-95c9f';
const account = require('C:/Users/waeil/.config/configstore/firebase-tools.json');

const DRY_RUN = process.argv.includes('--dry-run');

function refreshToken() {
  return new Promise((resolve, reject) => {
    const postData = `client_id=${encodeURIComponent(process.env.GOOGLE_OAUTH_CLIENT_ID || "")}&client_secret=${encodeURIComponent(process.env.GOOGLE_OAUTH_CLIENT_SECRET || "")}&refresh_token=${account.tokens.refresh_token}&grant_type=refresh_token`;
    const req = https.request({ hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) } }, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{try{resolve(JSON.parse(d).access_token)}catch(e){reject(e)}}); });
    req.on('error', reject); req.write(postData); req.end();
  });
}

function decodeValue(field) {
  if (!field) return null;
  if (field.nullValue !== undefined) return null;
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.integerValue !== undefined) return Number(field.integerValue);
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.timestampValue) return field.timestampValue;
  if (field.arrayValue) return (field.arrayValue.values||[]).map(v=>decodeValue(v));
  if (field.mapValue) { const o={}; for (const [k,v] of Object.entries(field.mapValue.fields||{})) o[k]=decodeValue(v); return o; }
  return null;
}

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: 'NULL_VALUE' };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(value)) fields[k] = encodeValue(v);
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

async function getDoc(token, path) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: 'firestore.googleapis.com', path: `/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, method: 'GET', headers: { 'Authorization': `Bearer ${token}` } }, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{try{resolve(JSON.parse(d))}catch(e){reject(e)}}); });
    req.on('error', reject); req.end();
  });
}

async function patchDoc(token, path, fields) {
  return new Promise((resolve, reject) => {
    const encodedFields = {};
    for (const [k, v] of Object.entries(fields)) encodedFields[k] = encodeValue(v);
    const postData = JSON.stringify({ fields: encodedFields });
    const req = https.request({ hostname: 'firestore.googleapis.com', path: `/v1/projects/${PROJECT}/databases/(default)/documents/${path}?currentDocument.exists=true`, method: 'PATCH', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } }, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ console.log('patch status', res.statusCode, d.slice(0,300)); resolve(d); }); });
    req.on('error', reject); req.write(postData); req.end();
  });
}

const STATUS_PRIORITY = {
  'Completed': 10,
  'At Pickup': 9,
  'In Mission': 9,
  'Assigned': 8,
  'No Show': 7,
  'Cancelled': 7,
  'Rerouted': 7,
  'Unassigned': 1,
};
function statusPriority(s) { return STATUS_PRIORITY[s] || 0; }

async function main() {
  const token = await refreshToken();
  const doc = await getDoc(token, 'appData/agape');
  const data = {};
  for (const [k, v] of Object.entries(doc.fields || {})) data[k] = decodeValue(v);

  const trips = Array.isArray(data.trips) ? data.trips : [];
  const beforeSize = JSON.stringify(trips).length;
  console.log(`appData trips count: ${trips.length}, JSON bytes: ${beforeSize}`);

  const groups = {};
  trips.forEach(t => {
    const key = `${t.patient || ''}|${t.date || ''}|${t.time || ''}|${t.pickup || ''}|${t.dropoff || ''}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  const deduped = [];
  let dupGroups = 0;
  for (const [key, group] of Object.entries(groups)) {
    if (group.length > 1) dupGroups++;
    const sorted = [...group].sort((a, b) => {
      const pa = statusPriority(a.status);
      const pb = statusPriority(b.status);
      if (pa !== pb) return pb - pa;
      const da = a.driverId ? 1 : 0;
      const db = b.driverId ? 1 : 0;
      if (da !== db) return db - da;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
    deduped.push(sorted[0]);
  }

  const afterSize = JSON.stringify(deduped).length;
  console.log(`Duplicate groups: ${dupGroups}`);
  console.log(`Trips after dedupe: ${deduped.length}`);
  console.log(`JSON bytes after: ${afterSize} (saved ${beforeSize - afterSize})`);

  if (DRY_RUN) {
    console.log('DRY RUN - no write.');
    return;
  }

  // Update only the trips field to keep other fields intact
  const result = await patchDoc(token, 'appData/agape', { trips: deduped });
  console.log('Update result:', result.slice(0, 500));
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
