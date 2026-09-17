import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relPath) => readFileSync(new URL('../../' + relPath, import.meta.url), 'utf8');

describe('Mobile Admin and Dispatcher Vertical Scroll Contract', () => {
  it('ensures PageLayout.jsx maintains a bounded flex chain for MobileLayout', () => {
    const pageLayout = read('src/components/shared/PageLayout.jsx');
    expect(pageLayout).toContain('className="flex-1 min-h-0 flex flex-col overflow-hidden relative"');
    expect(pageLayout).not.toMatch(/className="flex-1 overflow-hidden"[\s\S]*?paddingBottom:\s*showBottomNav/);
  });

  it('ensures MobileEnterpriseDashboard.jsx eliminates nested scroll containers on reports, menu, tools, and trips', () => {
    const dashboard = read('src/components/MobileEnterpriseDashboard.jsx');
    expect(dashboard).toContain('mobile-enterprise-dashboard-wrapper');
    expect(dashboard).toContain('<div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">');
    expect(dashboard).toContain('<div className="flex-1 min-h-0 overflow-hidden flex flex-col p-1.5">');
    // Reports view wrapper is bounded flex container, not a redundant scroll container
    expect(dashboard).toMatch(/currentView === 'reports'[\s\S]*?<div className="flex-1 min-h-0 flex flex-col overflow-hidden">/);
  });

  it('ensures mobile subviews provide touch momentum scrolling', () => {
    const payroll = read('src/components/PayrollReportPage.jsx');
    expect(payroll).toContain('overflow-y-auto');
    expect(payroll).toContain('touch-pan-y');
    expect(payroll).toContain('WebkitOverflowScrolling');

    const timeTracking = read('src/components/TimeTrackingAdmin.jsx');
    expect(timeTracking).toContain('overflow-y-auto');
    expect(timeTracking).toContain('touch-pan-y');
    expect(timeTracking).toContain('WebkitOverflowScrolling');

    const settings = read('src/components/SettingsPage.jsx');
    expect(settings).toContain('overflow-y-auto');
    expect(settings).toContain('touch-pan-y');
    expect(settings).toContain('WebkitOverflowScrolling');

    const routePlanner = read('src/components/EnterpriseRoutePlanner.jsx');
    expect(routePlanner).toContain('touch-pan-y');
    expect(routePlanner).toContain('WebkitOverflowScrolling');
  });

  it('ensures index.css scopes adm-main and hides redundant topbar in mobile enterprise dashboard', () => {
    const css = read('src/index.css');
    expect(css).toContain('.mobile-enterprise-dashboard-wrapper [class*="adm-main"]');
    expect(css).toContain('.mobile-enterprise-dashboard-wrapper .adm-topbar');
  });
});
