const https = require('https');
const PROJECT = 'agape-95c9f';
const account = require('C:/Users/waeil/.config/configstore/firebase-tools.json');

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

async function runQuery(token, query) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(query);
    const req = https.request({ hostname: 'firestore.googleapis.com', path: `/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`, method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } }, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{try{resolve(JSON.parse(d))}catch(e){reject(e)}}); });
    req.on('error', reject); req.write(postData); req.end();
  });
}

async function main() {
  const token = await refreshToken();
  const q = await runQuery(token, { structuredQuery: { from: [{ collectionId: 'trips' }], limit: 500 } });
  const trips = [];
  if (Array.isArray(q)) {
    q.forEach(r => {
      if (r.document) {
        const f = {};
        for (const [k, v] of Object.entries(r.document.fields || {})) f[k] = decodeValue(v);
        trips.push(f);
      }
    });
  }

  // Group by patient + date + time + pickup + dropoff
  const groups = {};
  trips.forEach(t => {
    const key = `${t.patient || ''}|${t.date || ''}|${t.time || ''}|${t.pickup || ''}|${t.dropoff || ''}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  const dupGroups = Object.entries(groups).filter(([key, group]) => group.length > 1);
  console.log(`Total trips: ${trips.length}`);
  console.log(`Duplicate groups (same patient/date/time/pickup/dropoff): ${dupGroups.length}`);
  console.log(`Trips in duplicate groups: ${dupGroups.reduce((sum, [_, g]) => sum + g.length, 0)}`);

  dupGroups.slice(0, 20).forEach(([key, group], i) => {
    console.log(`\n  [${i}] ${key}`);
    group.forEach(t => {
      console.log(`      id=${t.id}, status=${t.status}, driverId=${t.driverId || 'NONE'}, createdAt=${t.createdAt || t.updatedAtLocal || 'N/A'}`);
    });
  });
}

main().catch(e => console.error('FATAL:', e));
