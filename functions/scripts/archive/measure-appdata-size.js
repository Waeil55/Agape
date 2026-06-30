const https = require('https');
const PROJECT = 'agape-95c9f';
const account = require('C:/Users/waeil/.config/configstore/firebase-tools.json');

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

async function getDoc(token, path) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: 'firestore.googleapis.com', path: `/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, method: 'GET', headers: { 'Authorization': `Bearer ${token}` } }, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{try{resolve(JSON.parse(d))}catch(e){reject(e)}}); });
    req.on('error', reject); req.end();
  });
}

async function main() {
  const token = await refreshToken();
  const doc = await getDoc(token, 'appData/agape');
  const data = {};
  for (const [k, v] of Object.entries(doc.fields || {})) data[k] = decodeValue(v);

  const sizes = {};
  for (const [k, v] of Object.entries(data)) {
    sizes[k] = JSON.stringify(v).length;
  }

  const total = JSON.stringify(data).length;
  console.log(`Total appData JSON size: ${total} bytes (${(total/1024).toFixed(1)} KB)`);
  console.log('\nField sizes:');
  Object.entries(sizes).sort((a,b) => b[1]-a[1]).forEach(([k, size]) => {
    const count = Array.isArray(data[k]) ? data[k].length : (data[k] && typeof data[k] === 'object' ? Object.keys(data[k]).length : 0);
    console.log(`  ${k}: ${size} bytes (${(size/1024).toFixed(1)} KB), count=${count}`);
  });
}

main().catch(e => console.error('FATAL:', e));
