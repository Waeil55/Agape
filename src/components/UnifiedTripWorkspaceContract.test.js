import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('unified trip workspace information architecture', () => {
  it('keeps dispatch, manifest, fleet, and driver execution in one trip destination', () => {
    const dashboard = readSource('./DesktopEnterpriseDashboard.jsx');
    const operations = readSource('./OperationsCommandCenter.jsx');
    const trips = readSource('./TripsPage.jsx');

    expect(dashboard).toContain("{ id: 'trips', label: 'Trips', icon: ClipboardList, active: activePanel === 'operations' || activePanel === 'drive'");
    expect(dashboard).not.toContain("{ id: 'drive', label: 'Drive'");
    expect(dashboard).not.toContain("{ id: 'welltrans', label: 'WellTrans'");
    expect(dashboard).toContain('openDriverWorkspaceForTrip');
    expect(dashboard).toContain('defaultTripId={driverWorkTripId}');
    expect(operations).toContain("onDriveTrip?.(trip)");
    expect(operations).toContain('Open Driver Workspace');
    expect(operations).toContain('Assign to Drive');
    expect(trips).toContain("onDriveTrip?.(trip)");
    expect(trips).toContain('Drive trip');
  });

  it('moves archived records and broker portal completion into Reports', () => {
    const reports = readSource('./ReportsPage.jsx');
    const dashboard = readSource('./DesktopEnterpriseDashboard.jsx');
    const settings = readSource('./SettingsPage.jsx');
    const mobileMenu = readSource('./MobileMenuPage.jsx');
    const portal = readSource('../features/welltrans-sync/components/WellTransSyncPage.jsx');

    expect(reports).toContain("lazy(() => import('./ArchivesPage'))");
    expect(reports).toContain("lazy(() => import('../features/welltrans-sync/components/WellTransSyncPage'))");
    expect(reports).toContain("label: 'Archived trips'");
    expect(reports).toContain("label: 'Portal Completion'");
    expect(reports).toContain("canUsePortalCompletion = props.role === 'admin'");
    expect(dashboard).toContain("openReportsWorkspace('archive')");
    expect(dashboard).toContain("openReportsWorkspace('portal')");
    expect(settings).not.toContain("{ id: 'archived', label: 'Archived Trips'");
    expect(mobileMenu).not.toContain("id: 'archives'");
    expect(mobileMenu).not.toContain("id: 'welltrans'");
    expect(portal).toContain('PORTAL COMPLETION');
    expect(portal).toContain('app-filter-bar gap-y-2 px-3 py-2');
  });

  it('preserves backward navigation without exposing duplicate destinations', () => {
    const dashboard = readSource('./DesktopEnterpriseDashboard.jsx');
    const reports = readSource('./ReportsPage.jsx');
    const settings = readSource('./SettingsPage.jsx');

    expect(dashboard).toContain("if (['trips', 'drive'].includes(saved)) return 'operations'");
    expect(dashboard).toContain("if (['archives', 'welltrans'].includes(saved)) return 'reports'");
    expect(reports).toContain("if (section === 'archives' || section === 'archived') return 'archive'");
    expect(reports).toContain("if (section === 'welltrans' || section === 'portal-filler') return 'portal'");
    expect(settings).toContain("personalSectionIds.includes(stored) ? stored : 'profile'");
    expect(settings).not.toContain("{ group: 'Administration', items: adminNav }");
  });
});
