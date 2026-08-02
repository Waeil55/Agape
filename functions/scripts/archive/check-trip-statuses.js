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

async function getDoc(token, path) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: 'firestore.googleapis.com', path: `/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, method: 'GET', headers: { 'Authorization': `Bearer ${token}` } }, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{try{resolve(JSON.parse(d))}catch(e){reject(e)}}); });
    req.on('error', reject); req.end();
  });
}

async function main() {
  const token = await refreshToken();
  const bookingIds = ['107342747', '107261808', '107261809', '107272539', '107272540', '107272541', '107328727', '107328728'];
  
  // First, query root trips collection
  const q = await runQuery(token, { structuredQuery: { from: [{ collectionId: 'trips' }], limit: 200 } });
  const trips = [];
  if (Array.isArray(q)) {
    q.forEach(r => {
      if (r.document) {
        const f = {};
        for (const [k, v] of Object.entries(r.document.fields || {})) f[k] = decodeValue(v);
        f.__name = r.document.name;
        trips.push(f);
      }
    });
  }

  console.log('=== Root trips collection ===');
  for (const bk of bookingIds) {
    const matches = trips.filter(t => String(t.bookingId || '') === bk || String(t.id || '').includes(bk));
    if (matches.length > 0) {
      matches.forEach(t => console.log(`  ${bk}: status=${t.status}, id=${t.id}, driverId=${t.driverId || 'NONE'}, updatedAt=${t.updatedAt || 'N/A'}`));
    } else {
      console.log(`  ${bk}: NOT FOUND in root trips`);
    }
  }

  // Also check driverTripProgress
  console.log('\n=== driverTripProgress ===');
  for (const bk of bookingIds) {
    try {
      const matchingTrips = trips.filter(t => String(t.bookingId || '') === bk);
      for (const t of matchingTrips) {
        try {
          const progress = await getDoc(token, `driverTripProgress/${t.id}`);
          if (progress && !progress.error) {
            const d = {};
            for (const [k, v] of Object.entries(progress.fields || {})) d[k] = decodeValue(v);
            console.log(`  ${bk} (${t.id}): progress=${JSON.stringify(d)}`);
          } else {
            console.log(`  ${bk} (${t.id}): no progress doc`);
          }
        } catch { console.log(`  ${bk} (${t.id}): error fetching progress`); }
      }
    } catch { console.log(`  ${bk}: error`); }
  }
}

main().catch(e => console.error('FATAL:', e));
