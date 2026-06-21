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
  const q = await runQuery(token, { structuredQuery: { from: [{ collectionId: 'tripLedger' }], limit: 1000 } });
  const docs = [];
  if (Array.isArray(q)) {
    q.forEach(r => {
      if (r.document) {
        const f = {};
        for (const [k, v] of Object.entries(r.document.fields || {})) f[k] = decodeValue(v);
        f.__name = r.document.name;
        f.__createTime = r.document.createTime;
        docs.push(f);
      }
    });
  }

  const groups = {};
  docs.forEach(t => {
    const key = `${t.patient || ''}|${t.date || ''}|${t.time || ''}|${t.pickup || ''}|${t.dropoff || ''}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  const dupGroups = Object.entries(groups).filter(([_, g]) => g.length > 1);
  console.log(`Total tripLedger docs: ${docs.length}`);
  console.log(`Duplicate groups: ${dupGroups.length}`);

  const toDelete = [];
  for (const [key, group] of dupGroups) {
    const sorted = [...group].sort((a, b) => {
      const pa = statusPriority(a.status);
      const pb = statusPriority(b.status);
      if (pa !== pb) return pb - pa;
      const da = a.driverId ? 1 : 0;
      const db = b.driverId ? 1 : 0;
      if (da !== db) return db - da;
      return (a.__createTime || '').localeCompare(b.__createTime || '');
    });
    for (let i = 1; i < sorted.length; i++) {
      toDelete.push({ name: sorted[i].__name, id: sorted[i].id, status: sorted[i].status, keeper: sorted[0].id });
    }
  }

  console.log(`Deleting: ${toDelete.length}`);
  if (DRY_RUN) {
    console.log('DRY RUN - no deletions.');
    return;
  }
  if (toDelete.length === 0) return;
  const result = await batchDelete(token, toDelete.map(d => d.name));
  console.log('Batch delete result:', result.slice(0, 300));
  console.log(`Deleted ${toDelete.length} duplicate tripLedger docs.`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
