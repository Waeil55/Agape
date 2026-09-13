import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Source contract for upload assignment scoping. Role scoping for imports
// lives in several layers; these assertions pin every layer so a refactor
// cannot silently drop one (fail closed: admin → all, dispatcher → assigned
// drivers, driver → self only).
const appPath = fileURLToPath(new URL('../App.jsx', import.meta.url));
const rulesPath = fileURLToPath(new URL('../../firestore.rules', import.meta.url));
const uploadPath = fileURLToPath(new URL('../components/FileUploadTrips.jsx', import.meta.url));
const scopePath = fileURLToPath(new URL('./accessControl.js', import.meta.url));

describe('upload scope contract', () => {
  it('App.jsx computes one upload scope for every portal', () => {
    const app = readFileSync(appPath, 'utf8');
    expect(app).toContain('getUploadScopeForRole');
    expect(app).toContain('uploadScope.allowedDrivers');
    expect(app).toContain('uploadScope.lockedDriverId');
  });

  it('App.jsx gates every import before any write, including merge targets', () => {
    const app = readFileSync(appPath, 'utf8');
    expect(app).toContain('isTripInUploadScope(trip, uploadScope)');
    expect(app).toContain('Scope Blocked');
    expect(app).toContain('tripImportKey');
    expect(app).toContain('Nothing was written');
  });

  it('FileUploadTrips enforces the allow-list and self-lock in UI', () => {
    const upload = readFileSync(uploadPath, 'utf8');
    expect(upload).toContain('allowedDrivers');
    expect(upload).toContain('lockedDriverId');
    expect(upload).toContain('isSelfLocked');
    expect(upload).toContain('scopeBlocked');
    expect(upload).toContain('Out of scope');
  });

  it('accessControl.js owns the scope matrix (admin/dispatcher/driver/deny)', () => {
    const scope = readFileSync(scopePath, 'utf8');
    expect(scope).toContain('getUploadScopeForRole');
    expect(scope).toContain('isTripInUploadScope');
    expect(scope).toContain("allowUnassigned: false");
  });

  it('firestore rules scope trip creates and updates to self or dispatcher role', () => {
    const rules = readFileSync(rulesPath, 'utf8');
    expect(rules).toContain('tripSelfCreate()');
    expect(rules).toContain('tripSelfUpdate()');
    expect(rules).toContain('tripTransferRecipientUpdate()');
    expect(rules).toContain('allow create: if signedIn() && (isDispatcher() || tripSelfCreate());');
    expect(rules).toContain('allow update: if signedIn() && (isDispatcher() || tripSelfUpdate());');
  });
});
