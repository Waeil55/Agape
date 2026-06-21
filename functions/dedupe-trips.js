const https = require('https');
const PROJECT = 'agape-95c9f';
const account = require('C:/Users/waeil/.config/configstore/firebase-tools.json');

const DRY_RUN = process.argv.includes('--dry-run');

function refreshToken() {
  return new Promise((resolve, reject) => {
    const postData = `client_id=563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com&client_secret=j9iVZfS8kkCEFUPaAeJV0sAi&refresh_token=${account.tokens.refresh_token}&grant_type=refresh_token`;
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

async function runQuery(token, query) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(query);
    const req = https.request({ hostname: 'firestore.googleapis.com', path: `/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`, method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } }, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{try{resolve(JSON.parse(d))}catch(e){reject(e)}}); });
    req.on('error', reject); req.write(postData); req.end();
  });
}

async function batchDelete(token, names) {
  return new Promise((resolve, reject) => {
    const body = { writes: names.map(name => ({ delete: name })) };
    const postData = JSON.stringify(body);
    const req = https.request({ hostname: 'firestore.googleapis.com', path: `/v1/projects/${PROJECT}/databases/(default)/documents:batchWrite`, method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } }, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(d)); });
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
  const q = await runQuery(token, { structuredQuery: { from: [{ collectionId: 'trips' }], limit: 500 } });
  const trips = [];
  if (Array.isArray(q)) {
    q.forEach(r => {
      if (r.document) {
        const f = {};
        for (const [k, v] of Object.entries(r.document.fields || {})) f[k] = decodeValue(v);
        f.__name = r.document.name;
        f.__createTime = r.document.createTime;
        f.__updateTime = r.document.updateTime;
        trips.push(f);
      }
    });
  }

  const groups = {};
  trips.forEach(t => {
    const key = `${t.patient || ''}|${t.date || ''}|${t.time || ''}|${t.pickup || ''}|${t.dropoff || ''}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  const dupGroups = Object.entries(groups).filter(([_, g]) => g.length > 1);
  console.log(`Total trips: ${trips.length}`);
  console.log(`Duplicate groups: ${dupGroups.length}`);

  const toDelete = [];
  const toKeep = [];

  for (const [key, group] of dupGroups) {
    // Sort by priority desc, then has driver, then earliest createTime
    const sorted = [...group].sort((a, b) => {
      const pa = statusPriority(a.status);
      const pb = statusPriority(b.status);
      if (pa !== pb) return pb - pa;
      const da = a.driverId ? 1 : 0;
      const db = b.driverId ? 1 : 0;
      if (da !== db) return db - da;
      return (a.__createTime || '').localeCompare(b.__createTime || '');
    });
    const keeper = sorted[0];
    toKeep.push(keeper);
    for (let i = 1; i < sorted.length; i++) {
      toDelete.push({ name: sorted[i].__name, id: sorted[i].id, status: sorted[i].status, keeper: keeper.id, keeperStatus: keeper.status });
    }
  }

  console.log(`\nKeeping: ${toKeep.length}`);
  console.log(`Deleting: ${toDelete.length}`);

  for (const d of toDelete.slice(0, 30)) {
    console.log(`  DEL ${d.id} (${d.status}) -> keep ${d.keeper} (${d.keeperStatus})`);
  }
  if (toDelete.length > 30) console.log(`  ... and ${toDelete.length - 30} more`);

  if (DRY_RUN) {
    console.log('\nDRY RUN - no deletions performed.');
    return;
  }

  if (toDelete.length === 0) {
    console.log('No duplicates to delete.');
    return;
  }

  // batchWrite has limit of 500 writes; we have ~130, well within
  const names = toDelete.map(d => d.name);
  const result = await batchDelete(token, names);
  console.log('\nBatch delete result:', result.slice(0, 500));
  console.log(`\nDeleted ${toDelete.length} duplicate trips.`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
