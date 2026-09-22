import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('mobile control navigation contract', () => {
  it('gives every nested More page an explicit shared-header back action', () => {
    const source = readFileSync(new URL('./MobileEnterpriseDashboard.jsx', import.meta.url), 'utf8');
    expect(source).toContain('showBack: true');
    expect(source).toContain('setSubView(null)');
    expect(source).toContain('<DriversVehiclesPage {...props} mode="drivers" />');
    expect(source).toContain('<DriversVehiclesPage {...props} mode="vehicles" />');
    expect(source).toContain('showBottomNav={false}');
  });

  it('uses one accessible Settings section selector on mobile', () => {
    const source = readFileSync(new URL('./SettingsPage.jsx', import.meta.url), 'utf8');
    expect(source).toContain('htmlFor="mobile-settings-section"');
    expect(source).toContain('id="mobile-settings-section"');
    expect(source).toContain('onChange={(event) => setActiveSection(event.target.value)}');
  });

  it('exposes distinct driver, vehicle, payroll, and time control destinations', () => {
    const source = readFileSync(new URL('./MobileMenuPage.jsx', import.meta.url), 'utf8');
    for (const id of ['drivers', 'fleet', 'payroll', 'activity']) {
      expect(source).toContain(`id: '${id}'`);
    }
    expect(source).not.toContain("label: 'Fleet & Drivers'");
  });

  it('keeps destructive driver and vehicle removal admin-only', () => {
    const source = readFileSync(new URL('./DriversVehiclesPage.jsx', import.meta.url), 'utf8');
    expect(source.match(/role === 'admin'/g)?.length).toBeGreaterThanOrEqual(4);
    expect(source.match(/deleteDriver\(d\)/g)?.length).toBe(2);
    expect(source.match(/deleteVehicle\(v\)/g)?.length).toBe(2);
  });
});
