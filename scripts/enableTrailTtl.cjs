const https = require('https');

const PROJECT_ID = 'agape-95c9f';
const COLLECTION_GROUP = 'trail';
const FIELD = 'ttlExpireAt';

async function getToken() {
  // Try google-auth-library if available
  try {
    const { GoogleAuth } = require('google-auth-library');
    const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/datastore' });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    return token.token;
  } catch (e) {
    // Fallback: try gcloud CLI
    const { execSync } = require('child_process');
    return execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
  }
}

async function enableTtl() {
  const token = await getToken();
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/collectionGroups/${COLLECTION_GROUP}/fields/${FIELD}`;
  const data = JSON.stringify({ ttlConfig: { state: 'ACTIVE' } });

  await new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`Response: ${body}`);
        if (res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`HTTP ${res.statusCode}: ${body}`));
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });

  console.log('TTL policy ACTIVE for collection group "trail" on field "ttlExpireAt".');
}

enableTtl().catch(err => {
  console.error('Failed:', err.message);
  console.error('\nTo set up TTL manually:\n  Firebase Console > Firestore > Rules > TTL policies > Add policy\n  Collection group: trail, Field: ttlExpireAt\n');
  process.exit(1);
});
