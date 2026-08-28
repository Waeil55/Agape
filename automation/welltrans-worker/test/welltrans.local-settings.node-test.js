import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { after, before, describe, it } from 'node:test';
import {
  loadLocalWellTransCredentials,
  startLocalWellTransSettingsServer,
} from '../src/welltrans.local-settings.js';

let server;
let baseUrl;
let temporaryDirectory;
const origin = 'https://agape5.web.app';

describe('local encrypted WellTrans credential vault', () => {
  before(async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'agape-welltrans-vault-'));
    process.env.WELLTRANS_SESSION_KEY = crypto.randomBytes(32).toString('base64');
    process.env.WELLTRANS_CREDENTIAL_FILE = path.join(temporaryDirectory, 'credentials.vault');
    process.env.AGAPE_DEVICE_CREDENTIAL_FILE = path.join(temporaryDirectory, 'device.vault');
    process.env.AGAPE_LOCAL_SETTINGS_PORT = '0';
    server = startLocalWellTransSettingsServer();
    if (!server.listening) await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}/v1/welltrans-credentials`;
  });

  it('rejects enrollment exchanges to every non-Agape endpoint', async () => {
    const enrollmentUrl = baseUrl.replace('/welltrans-credentials', '/agent-enrollment');
    const rejected = await fetch(enrollmentUrl, {
      method: 'PUT',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exchangeUrl: 'https://attacker.example/steal',
        grantId: 'grant',
        grantSecret: 'secret',
        apiKey: 'public-firebase-api-key',
      }),
    });
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).error, 'The enrollment service URL is not authorized');
  });

  after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('accepts credentials only from the approved Agape origin and never stores plaintext', async () => {
    const rejected = await fetch(baseUrl, {
      method: 'PUT',
      headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'broker-user', password: 'broker-password' }),
    });
    assert.equal(rejected.status, 403);

    const saved = await fetch(baseUrl, {
      method: 'PUT',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'broker-user', password: 'broker-password' }),
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.headers.get('access-control-allow-origin'), origin);

    const encrypted = await readFile(process.env.WELLTRANS_CREDENTIAL_FILE);
    assert.equal(encrypted.subarray(0, 5).toString(), 'AGWC1');
    assert.equal(encrypted.includes(Buffer.from('broker-user')), false);
    assert.equal(encrypted.includes(Buffer.from('broker-password')), false);
    assert.deepEqual(await loadLocalWellTransCredentials(), {
      username: 'broker-user',
      password: 'broker-password',
    });
  });

  it('reports only non-secret status and can remove the local vault', async () => {
    const status = await fetch(baseUrl, { headers: { Origin: origin } }).then(response => response.json());
    assert.deepEqual(status, {
      ok: true,
      configured: true,
      username: 'broker-user',
    });
    assert.equal(Object.hasOwn(status, 'password'), false);

    const removed = await fetch(baseUrl, { method: 'DELETE', headers: { Origin: origin } });
    assert.equal(removed.status, 200);
    assert.equal(await loadLocalWellTransCredentials(), null);
  });
});
