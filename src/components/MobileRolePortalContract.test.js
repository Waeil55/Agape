import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');

describe('mobile admin and dispatcher portal contract', () => {
  const dashboard = read('./DesktopEnterpriseDashboard.jsx');
  const adminKit = read('./admin/AdminKit.jsx');
  const mobileAdmin = read('./MobileAdminPage.jsx');

  it('uses the driver visual shell for the shared role header and navigation', () => {
    expect(dashboard).toContain('driver-page-header enterprise-mobile-topbar');
    expect(dashboard).toContain("{ id: 'operations', label: 'Trips'");
    expect(dashboard).toContain("{ id: 'routePlanner', label: 'Tools'");
    expect(dashboard).toContain("{ id: 'chat', label: 'Chat'");
    expect(dashboard).toContain("{ id: 'more', label: 'More'");
    expect(dashboard).toContain("rounded-full bg-blue-50");
  });

  it('keeps secondary role workspaces visible without overcrowding bottom navigation', () => {
    for (const label of ['Live Map', 'Reports', 'Settings', 'Driver Work', 'Dispatch Assistant', 'Upload Trips']) {
      expect(dashboard).toContain(label);
    }
    expect(dashboard).toContain("role === 'admin' ? 'Admin' : 'Fleet'");
  });

  it('removes nested mobile chrome while retaining administration section access', () => {
    expect(dashboard).toContain('embeddedMobile');
    expect(mobileAdmin).toContain('embeddedMobile={embeddedMobile}');
    expect(adminKit).toContain('admin-mobile-section-tabs');
    expect(adminKit).toContain("embeddedMobile ? '!hidden' : ''");
  });
});
