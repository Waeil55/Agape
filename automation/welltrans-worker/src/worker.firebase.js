import { loadEncryptedCredentials } from './cryptoSession.js';

const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'agape-95c9f';
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || 'agape-95c9f.firebasestorage.app';

async function initializeDeviceFirebase() {
  const vaultPath = String(process.env.AGAPE_DEVICE_CREDENTIAL_FILE || '').trim();
  if (!vaultPath) throw new Error('The enrolled device vault path is missing. Enroll this PC again from Agape.');
  const device = await loadEncryptedCredentials(vaultPath);
  if (!device?.deviceId || !device?.deviceSecret || !device?.tokenUrl || !device?.apiKey) {
    throw new Error('The enrolled device vault is incomplete. Enroll this PC again from Agape.');
  }
  const response = await fetch(device.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: device.deviceId, deviceSecret: device.deviceSecret }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.customToken) {
    throw new Error(payload.error || 'This PC enrollment could not be authorized. Ask an administrator to enroll it again.');
  }
  const firebase = (await import('firebase/compat/app')).default;
  await import('firebase/compat/auth');
  await import('firebase/compat/firestore');
  await import('firebase/compat/storage');
  const app = firebase.apps.find(item => item.name === 'welltrans-agent') || firebase.initializeApp({
    apiKey: device.apiKey,
    projectId: device.projectId || projectId,
    storageBucket: device.storageBucket || storageBucket,
  }, 'welltrans-agent');
  await app.auth().signInWithCustomToken(payload.customToken);
  const db = app.firestore();
  db.getAll = (...references) => Promise.all(references.map(reference => reference.get()));
  return {
    db,
    FieldPath: firebase.firestore.FieldPath,
    FieldValue: firebase.firestore.FieldValue,
    Timestamp: firebase.firestore.Timestamp,
    createDocument: async (reference, data) => db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      if (snapshot.exists) {
        const error = new Error('Document already exists');
        error.code = 6;
        throw error;
      }
      transaction.set(reference, data);
    }),
    saveScreenshot: async (path, bytes) => app.storage().ref(path).put(
      new Uint8Array(bytes),
      { contentType: 'image/png', cacheControl: 'private, no-store' },
    ),
  };
}

async function initializeAdminFirebase() {
  const { applicationDefault, initializeApp, getApps } = await import('firebase-admin/app');
  const { FieldPath, FieldValue, Timestamp, getFirestore } = await import('firebase-admin/firestore');
  const { getStorage } = await import('firebase-admin/storage');
  if (getApps().length === 0) initializeApp({ credential: applicationDefault(), projectId, storageBucket });
  return {
    db: getFirestore(),
    FieldPath,
    FieldValue,
    Timestamp,
    createDocument: (reference, data) => reference.create(data),
    saveScreenshot: (path, bytes) => getStorage().bucket().file(path).save(bytes, {
      contentType: 'image/png', resumable: false, metadata: { cacheControl: 'private, no-store' },
    }),
  };
}

const platform = process.env.AGAPE_WORKER_CREDENTIAL_MODE === 'device_enrollment'
  ? await initializeDeviceFirebase()
  : await initializeAdminFirebase();

export const { db, FieldPath, FieldValue, Timestamp, createDocument, saveScreenshot } = platform;
