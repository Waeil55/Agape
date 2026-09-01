import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readComponent = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

describe('desktop administration visual contract', () => {
  it('keeps the admin shell opaque, keyboard visible, and built from light surfaces', () => {
    const source = readComponent('admin/AdminKit.jsx');

    expect(source).toContain('adm-topbar !border-slate-200 !bg-white');
    expect(source).toContain("backdropFilter: 'none'");
    expect(source).toContain('focus-visible:ring-2 focus-visible:ring-blue-500');
    expect(source).toContain('aria-current={isActive');
    expect(source).toContain('rounded-xl border border-slate-200 bg-white shadow-sm');
  });

  it('uses a structured, accessible reports workspace instead of a dense legacy strip', () => {
    const shell = readComponent('ReportsPage.jsx');
    const desktop = readComponent('DesktopReportsPage.jsx');

    expect(shell).toContain('role="tablist"');
    expect(shell).toContain('role="tabpanel"');
    expect(shell).toContain("lazy(() => import('./DesktopReportsPage'))");
    expect(desktop).toContain('role="toolbar" aria-label="Trip report controls"');
    expect(desktop).toContain('aria-label="Search trip reports"');
    expect(desktop).not.toContain('transition-all');
    expect(desktop).not.toContain('backdrop-blur');
  });

  it('provides landmark navigation and explicit empty states across desktop admin pages', () => {
    const settings = readComponent('SettingsPage.jsx');
    const users = readComponent('UsersPage.jsx');
    const fleet = readComponent('DriversVehiclesPage.jsx');
    const archives = readComponent('ArchivesPage.jsx');

    expect(settings).toContain('aria-label="Settings workspace"');
    expect(settings).toContain('aria-label="Settings sections"');
    expect(users).toContain('aria-label="People and access management"');
    expect(users).toContain('role="dialog" aria-modal="true"');
    expect(fleet).toContain('aria-label="Drivers and vehicles workspace"');
    expect(fleet).not.toContain('backdrop-blur');
    expect(archives).toContain('aria-label="Archived trips"');
    expect(archives).toContain('Try clearing the search or changing the date range.');
  });

  it('opens Add Vehicle in the real fleet section with a stable, independently scrolling dialog', () => {
    const admin = readComponent('DesktopAdminPage.jsx');
    const fleet = readComponent('DriversVehiclesPage.jsx');

    expect(admin).toContain("setActiveSection('drivers')");
    expect(admin).not.toContain("setActiveSection('vehicles')");
    expect(fleet).toContain('vehicle-form-overlay fixed inset-0');
    expect(fleet).toContain('data-scroll-region="vehicle-form"');
    expect(fleet).toContain('max-h-[calc(100dvh-1.5rem)] min-h-0');
    expect(fleet).toContain("setAssignmentError('Vehicle name is required.')");
    expect(fleet).toContain("savingVehicle ? 'Saving…'");
  });
});
