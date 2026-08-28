import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadEncryptedSession, saveEncryptedSession } from '../src/cryptoSession.js';

test('a first-run worker treats a missing session vault as a fresh login', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'agape-session-test-'));
  try {
    process.env.WELLTRANS_SESSION_KEY = Buffer.alloc(32, 7).toString('base64');
    const sessionPath = path.join(directory, 'missing-session.enc');
    assert.equal(await loadEncryptedSession(sessionPath), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('session vault corruption still fails closed', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'agape-session-test-'));
  try {
    process.env.WELLTRANS_SESSION_KEY = Buffer.alloc(32, 9).toString('base64');
    const sessionPath = path.join(directory, 'session.enc');
    await writeFile(sessionPath, 'not-an-agape-session');
    await assert.rejects(loadEncryptedSession(sessionPath), /Invalid encrypted local vault format/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('an encrypted session still round-trips', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'agape-session-test-'));
  try {
    process.env.WELLTRANS_SESSION_KEY = Buffer.alloc(32, 11).toString('base64');
    const sessionPath = path.join(directory, 'session.enc');
    const expected = { cookies: [], origins: [] };
    await saveEncryptedSession(sessionPath, expected);
    assert.deepEqual(await loadEncryptedSession(sessionPath), expected);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
