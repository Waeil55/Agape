import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');

describe('enterprise callable authorization', () => {
  it('bridges legacy calls through Firebase Admin modular services', () => {
    expect(source).toContain('const { FieldValue, Timestamp, getFirestore } = require("firebase-admin/firestore")');
    expect(source).toContain('admin.firestore = getFirestore');
    expect(source).toContain('admin.auth = getAuth');
  });

  it('fails closed when creating assignments and assigns tenant scope server-side', () => {
    expect(source).toMatch(/exports\.createAssignments[\s\S]*?const actor = await requireAdminOrDispatcher\(context\)/);
    expect(source).toMatch(/tenantId: actor\.tenantId/);
    expect(source).not.toMatch(/createAssignments: could not read user role, proceeding anyway/);
  });

  it('restricts user creation, migration and arbitrary push delivery', () => {
    expect(source).toMatch(/exports\.createUser[\s\S]*?const actor = await requireAdmin\(context\)/);
    expect(source).toMatch(/exports\.migrateTripDateKeys[\s\S]*?const actor = await requireAdmin\(context\)/);
    expect(source).toMatch(/exports\.sendPushNotification[\s\S]*?await requireAdminOrDispatcher\(context\)/);
  });
});
