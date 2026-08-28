import http from 'node:http';
import { rm } from 'node:fs/promises';
import {
  loadEncryptedCredentials,
  saveEncryptedCredentials,
} from './cryptoSession.js';

const DEFAULT_PORT = 43127;
const MAX_BODY_BYTES = 16_384;
const DEFAULT_ORIGINS = new Set([
  'https://agape5.web.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

const allowedOrigins = () => {
  const configured = String(process.env.AGAPE_LOCAL_SETTINGS_ORIGINS || '')
    .split(',').map(value => value.trim()).filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...configured]);
};

const credentialPath = () => process.env.WELLTRANS_CREDENTIAL_FILE || '';
const deviceCredentialPath = () => process.env.AGAPE_DEVICE_CREDENTIAL_FILE || '';

const safeDeviceStatus = async () => {
  const filePath = deviceCredentialPath();
  if (!filePath) return { configured: false, deviceId: '', label: '' };
  try {
    const value = await loadEncryptedCredentials(filePath);
    return {
      configured: Boolean(value?.deviceId && value?.deviceSecret),
      deviceId: String(value?.deviceId || ''),
      label: String(value?.label || ''),
    };
  } catch {
    return { configured: false, deviceId: '', label: '' };
  }
};

export async function loadLocalWellTransCredentials() {
  const filePath = credentialPath();
  if (!filePath) return null;
  try {
    const value = await loadEncryptedCredentials(filePath);
    const username = String(value?.username || '').trim();
    const password = String(value?.password || '');
    return username && password ? { username, password } : null;
  } catch {
    return null;
  }
}

const writeJson = (response, status, payload, origin = '') => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
  });
  response.end(JSON.stringify(payload));
};

const readJson = request => new Promise((resolve, reject) => {
  let body = '';
  request.setEncoding('utf8');
  request.on('data', chunk => {
    body += chunk;
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
      reject(new Error('Credential request is too large'));
      request.destroy();
    }
  });
  request.on('end', () => {
    try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Credential request is invalid')); }
  });
  request.on('error', reject);
});

export function startLocalWellTransSettingsServer({ onCredentialsChanged } = {}) {
  const origins = allowedOrigins();
  const configuredPort = process.env.AGAPE_LOCAL_SETTINGS_PORT === undefined
    ? DEFAULT_PORT
    : Number(process.env.AGAPE_LOCAL_SETTINGS_PORT);
  const port = configuredPort === 0 ? 0 : Math.max(1024, Math.min(65535, configuredPort || DEFAULT_PORT));
  const server = http.createServer(async (request, response) => {
    const origin = String(request.headers.origin || '');
    if (!origins.has(origin)) {
      writeJson(response, 403, { ok: false, error: 'Origin is not authorized' });
      return;
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Private-Network': 'true',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      });
      response.end();
      return;
    }
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const isPortalCredentials = url.pathname === '/v1/welltrans-credentials';
    const isAgentEnrollment = url.pathname === '/v1/agent-enrollment';
    if (!isPortalCredentials && !isAgentEnrollment) {
      writeJson(response, 404, { ok: false, error: 'Not found' }, origin);
      return;
    }
    try {
      if (isAgentEnrollment) {
        if (request.method === 'GET') {
          writeJson(response, 200, { ok: true, ...await safeDeviceStatus() }, origin);
          return;
        }
        if (request.method !== 'PUT') {
          writeJson(response, 405, { ok: false, error: 'Method not allowed' }, origin);
          return;
        }
        if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
          writeJson(response, 415, { ok: false, error: 'JSON is required' }, origin);
          return;
        }
        const body = await readJson(request);
        const exchangeUrl = new URL(String(body.exchangeUrl || ''));
        if (exchangeUrl.protocol !== 'https:'
          || exchangeUrl.hostname !== 'us-central1-agape-95c9f.cloudfunctions.net'
          || exchangeUrl.pathname !== '/exchangeWellTransAgentEnrollment') {
          writeJson(response, 400, { ok: false, error: 'The enrollment service URL is not authorized' }, origin);
          return;
        }
        if (!body.grantId || !body.grantSecret || !body.apiKey) {
          writeJson(response, 400, { ok: false, error: 'The enrollment grant is incomplete' }, origin);
          return;
        }
        const exchangeResponse = await fetch(exchangeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grantId: body.grantId,
            grantSecret: body.grantSecret,
            deviceLabel: String(body.deviceLabel || 'Windows WellTrans Agent').slice(0, 120),
          }),
        });
        const enrollment = await exchangeResponse.json().catch(() => ({}));
        if (!exchangeResponse.ok || !enrollment.deviceId || !enrollment.deviceSecret) {
          writeJson(response, 403, { ok: false, error: enrollment.error || 'Enrollment was rejected' }, origin);
          return;
        }
        const filePath = deviceCredentialPath();
        if (!filePath) throw new Error('The encrypted device vault is not configured');
        await saveEncryptedCredentials(filePath, {
          deviceId: enrollment.deviceId,
          deviceSecret: enrollment.deviceSecret,
          label: String(body.deviceLabel || 'Windows WellTrans Agent').slice(0, 120),
          apiKey: String(body.apiKey),
          projectId: enrollment.projectId,
          storageBucket: enrollment.storageBucket,
          tokenUrl: enrollment.tokenUrl,
          enrolledAt: new Date().toISOString(),
        });
        writeJson(response, 200, {
          ok: true,
          configured: true,
          deviceId: enrollment.deviceId,
          label: String(body.deviceLabel || 'Windows WellTrans Agent').slice(0, 120),
        }, origin);
        return;
      }
      if (request.method === 'GET') {
        const credentials = await loadLocalWellTransCredentials();
        writeJson(response, 200, {
          ok: true,
          configured: Boolean(credentials),
          username: credentials?.username || '',
        }, origin);
        return;
      }
      if (request.method === 'PUT') {
        if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
          writeJson(response, 415, { ok: false, error: 'JSON is required' }, origin);
          return;
        }
        const body = await readJson(request);
        const username = String(body.username || '').trim();
        const password = String(body.password || '');
        if (!username || username.length > 200 || !password || password.length > 500) {
          writeJson(response, 400, { ok: false, error: 'Enter a valid WellTrans username and password' }, origin);
          return;
        }
        const filePath = credentialPath();
        if (!filePath) throw new Error('The local credential vault is not configured');
        await saveEncryptedCredentials(filePath, {
          username,
          password,
          updatedAt: new Date().toISOString(),
        });
        await onCredentialsChanged?.();
        writeJson(response, 200, { ok: true, configured: true, username }, origin);
        return;
      }
      if (request.method === 'DELETE') {
        const filePath = credentialPath();
        if (filePath) await rm(filePath, { force: true });
        await onCredentialsChanged?.();
        writeJson(response, 200, { ok: true, configured: false, username: '' }, origin);
        return;
      }
      writeJson(response, 405, { ok: false, error: 'Method not allowed' }, origin);
    } catch (error) {
      writeJson(response, 500, { ok: false, error: String(error?.message || error) }, origin);
    }
  });
  server.on('error', error => {
    process.stderr.write(`Local WellTrans Settings service unavailable: ${error.message}\n`);
  });
  server.listen(port, '127.0.0.1');
  return server;
}
