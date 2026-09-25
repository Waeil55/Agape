import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('ForcePasswordChangeModal and temporary password security authority', () => {
  it('ForcePasswordChangeModal is properly structured and enforces password change', () => {
    const component = read('src/components/auth/ForcePasswordChangeModal.jsx');
    expect(component).toContain('First-Time Setup Required');
    expect(component).toContain('Create Your New Password');
    expect(component).toContain('validatePasswordStrength');
    expect(component).toContain('TEMPORARY_AUTHORIZED_PASSWORD');
    expect(component).toContain('You must choose a new secure password. You cannot keep the temporary password.');
    expect(component).toContain('enterpriseResetPassword');
    expect(component).toContain('isFirstTimeSetup: true');
    expect(component).toContain('Show password');
    expect(component).toContain('Hide password');
    expect(component).toContain('Show confirm password');
    expect(component).toContain('Hide confirm password');
  });

  it('App.jsx renders ForcePasswordChangeModal when mustChangePasswordUser is active', () => {
    const app = read('src/App.jsx');
    expect(app).toContain("import ForcePasswordChangeModal from './components/auth/ForcePasswordChangeModal'");
    expect(app).toContain('mustChangePasswordUser');
    expect(app).toContain('profile.mustChangePassword === true');
    expect(app).toContain('<ForcePasswordChangeModal');
  });

  it('functions/index.js exposes adminSetTemporaryPassword with admin authorization and mustChangePassword handling', () => {
    const functionsCode = read('functions/index.js');
    expect(functionsCode).toContain('exports.adminSetTemporaryPassword = functions.https.onCall(async (data, context) => {');
    expect(functionsCode).toContain('const actor = await requireAdmin(context);');
    expect(functionsCode).toContain('mustChangePassword');
    expect(functionsCode).toContain('admin.auth().updateUser(uid, { password: temporaryPassword })');
    expect(functionsCode).toContain('security.temp_password_assigned');
    expect(functionsCode).toContain('isFirstTimeSetup || userData.mustChangePassword');
  });

  it('UsersPage.jsx and DesktopAdminPage.jsx provide admin temp password controls', () => {
    const usersPage = read('src/components/UsersPage.jsx');
    const adminPage = read('src/components/DesktopAdminPage.jsx');
    expect(usersPage).toContain('Set Temporary Password');
    expect(usersPage).toContain('adminSetTemporaryPassword');
    expect(usersPage).toContain('tempPasswordMustChange');
    expect(adminPage).toContain('Employee will be required to set their personal password upon first login.');
    expect(adminPage).toContain('mustChangePassword: true');
  });
});
