import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./MobileEnterpriseDashboard.jsx', import.meta.url), 'utf8');

describe('mobile enterprise subview render stability', () => {
  it('defines the shared subview wrapper at module scope', () => {
    const wrapperDeclaration = source.indexOf('export const SubViewWrapper');
    const dashboardDeclaration = source.indexOf('const MobileEnterpriseDashboard');

    expect(wrapperDeclaration).toBeGreaterThan(-1);
    expect(wrapperDeclaration).toBeLessThan(dashboardDeclaration);
    expect(source.slice(dashboardDeclaration)).not.toContain('const SubViewWrapper');
  });

  it('passes the dashboard top bar into every stable wrapper instance', () => {
    const wrapperOpenings = source.match(/<SubViewWrapper\b[^>]*>/g) || [];

    expect(wrapperOpenings.length).toBeGreaterThan(0);
    wrapperOpenings.forEach((opening) => {
      expect(opening).toContain('renderTopBar={renderTopBar}');
    });
  });

  it('isolates alert subscription updates inside the memoized bottom navigation', () => {
    const navigationDeclaration = source.indexOf('export const MobileBottomNavigation = React.memo');
    const dashboardDeclaration = source.indexOf('const MobileEnterpriseDashboard');
    const dashboardSource = source.slice(dashboardDeclaration);

    expect(navigationDeclaration).toBeGreaterThan(-1);
    expect(navigationDeclaration).toBeLessThan(dashboardDeclaration);
    expect(source.slice(navigationDeclaration, dashboardDeclaration)).toContain('useChat({ alerts: true })');
    expect(dashboardSource).not.toContain('useChat({ alerts: true })');
    expect(dashboardSource).toContain('<MobileBottomNavigation');
  });

  it('defers device-storage reads and writes away from initial render and click handlers', () => {
    expect(source).toContain('const scheduleIdleWork');
    expect(source).toContain('window.requestIdleCallback');
    expect(source).not.toContain("useState(() => localStorage.getItem('agape_toolsDriverId')");
    expect(source).not.toContain("if (toolsDriverId) localStorage.setItem('agape_toolsDriverId'");
  });

  it('memoizes route-tool trip collections outside the active render branch', () => {
    const toolsBranchStart = source.indexOf("if (currentView === 'tools')");
    const toolsBranchEnd = source.indexOf("if (currentView === 'chat')", toolsBranchStart);
    const toolsBranch = source.slice(toolsBranchStart, toolsBranchEnd);

    expect(source).toContain('const toolsTrips = useMemo');
    expect(source).toContain('const toolsActiveTrips = useMemo');
    expect(toolsBranch).not.toContain('driverWorkTrips.filter');
    expect(toolsBranch).not.toContain('toolSelectedTrips.includes');
  });
});
