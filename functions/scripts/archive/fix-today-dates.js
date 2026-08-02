const https = require('https');
const PROJECT = 'agape-95c9f';
const account = require('C:/Users/waeil/.config/configstore/firebase-tools.json');

const FIX_MODE = process.argv.includes('--fix');

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

async function patchDoc(token, path, fields) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ fields });
    const req = https.request({ hostname: 'firestore.googleapis.com', path: `/v1/projects/${PROJECT}/databases/(default)/documents/${path}?updateMask.fieldPaths=date`, method: 'PATCH', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } }, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{try{resolve(JSON.parse(d))}catch(e){reject(e)}}); });
    req.on('error', reject); req.write(postData); req.end();
  });
}

function fixIsoDateShift(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const m = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
}

function localYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function main() {
  const token = await refreshToken();
  console.log(`Mode: ${FIX_MODE ? 'FIX (will update Firestore)' : 'DRY RUN (no changes)'}\n`);

  const today = localYmd(new Date());
  console.log(`Today's date: ${today}\n`);

  const results = await runQuery(token, {
    structuredQuery: {
      from: [{ collectionId: 'trips' }],
      where: {
        compositeFilter: {
          op: 'OR',
          filters: [
            { fieldFilter: { field: { fieldPath: 'source' }, op: 'EQUAL', value: { stringValue: 'dispatch_upload' } } },
            { fieldFilter: { field: { fieldPath: 'source' }, op: 'EQUAL', value: { stringValue: 'report_upload' } } }
          ]
        }
      }
    }
  });

  const trips = [];
  for (const r of results) {
    if (r.document) {
      const d = r.document;
      const name = d.name;
      const fields = d.fields || {};
      trips.push({
        id: name.split('/').pop(),
        name,
        date: decodeValue(fields.date),
        dateKey: decodeValue(fields.dateKey),
        source: decodeValue(fields.source),
        status: decodeValue(fields.status),
        patient: decodeValue(fields.patient) || decodeValue(fields.patientName),
        createdAt: decodeValue(fields.createdAt),
        updatedAtLocal: decodeValue(fields.updatedAtLocal),
      });
    }
  }

  console.log(`Found ${trips.length} uploaded trips\n`);

  const todayTrips = [];
  const shiftedTrips = [];
  const noDateTrips = [];

  for (const t of trips) {
    if (!t.date) {
      noDateTrips.push(t);
      continue;
    }
    if (t.date === today) {
      todayTrips.push(t);
      continue;
    }
    const created = t.createdAt || t.updatedAtLocal || '';
    const createdToday = String(created).includes(today);
    if (createdToday && t.date !== today) {
      shiftedTrips.push({ ...t, correctedDate: today });
    }
  }

  console.log(`--- Summary ---`);
  console.log(`Trips with today's date (${today}): ${todayTrips.length}`);
  console.log(`Trips created today but with WRONG date: ${shiftedTrips.length}`);
  console.log(`Trips with NO date field: ${noDateTrips.length}`);
  console.log(`Other trips: ${trips.length - todayTrips.length - shiftedTrips.length - noDateTrips.length}\n`);

  if (shiftedTrips.length > 0) {
    console.log(`--- Trips to Fix (created today, wrong date) ---`);
    for (const t of shiftedTrips.slice(0, 20)) {
      console.log(`  ${t.id}: date="${t.date}" -> "${t.correctedDate}" status=${t.status} patient=${t.patient}`);
    }
    if (shiftedTrips.length > 20) console.log(`  ... and ${shiftedTrips.length - 20} more`);
    console.log();
  }

  if (FIX_MODE && shiftedTrips.length > 0) {
    console.log(`Fixing ${shiftedTrips.length} trips...`);
    let fixed = 0;
    let failed = 0;
    for (const t of shiftedTrips) {
      try {
        await patchDoc(token, `trips/${t.id}`, { date: { stringValue: t.correctedDate } });
        fixed++;
        if (fixed % 50 === 0) console.log(`  Fixed ${fixed}/${shiftedTrips.length}...`);
      } catch (err) {
        failed++;
        console.error(`  FAILED ${t.id}: ${err.message || err}`);
      }
    }
    console.log(`Done: ${fixed} fixed, ${failed} failed\n`);
  } else if (FIX_MODE) {
    console.log(`No shifted trips to fix.`);
  } else {
    console.log(`To fix these dates, run: node functions/fix-today-dates.js --fix`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
