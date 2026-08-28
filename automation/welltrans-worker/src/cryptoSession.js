import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const keyFromEnvironment = () => {
  const encoded = process.env.WELLTRANS_SESSION_KEY || '';
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('WELLTRANS_SESSION_KEY must be a base64-encoded 32-byte key');
  return key;
};

async function saveEncryptedJson(filePath, value, marker) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFromEnvironment(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const payload = Buffer.concat([Buffer.from(marker), iv, cipher.getAuthTag(), encrypted]);
  await fs.writeFile(filePath, payload, { mode: 0o600 });
}

async function loadEncryptedJson(filePath, marker) {
  const payload = await fs.readFile(filePath);
  if (payload.subarray(0, 5).toString() !== marker) throw new Error('Invalid encrypted local vault format');
  const iv = payload.subarray(5, 17);
  const tag = payload.subarray(17, 33);
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyFromEnvironment(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(payload.subarray(33)), decipher.final()]).toString('utf8'));
}

export async function saveEncryptedSession(filePath, state) {
  await saveEncryptedJson(filePath, state, 'AGWT1');
}

export async function loadEncryptedSession(filePath) {
  try {
    return await loadEncryptedJson(filePath, 'AGWT1');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function saveEncryptedCredentials(filePath, credentials) {
  await saveEncryptedJson(filePath, credentials, 'AGWC1');
}

export async function loadEncryptedCredentials(filePath) {
  return loadEncryptedJson(filePath, 'AGWC1');
}
