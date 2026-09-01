import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');

describe('responsive page shell performance contract', () => {
  it.each(['./ReportsPage.jsx'])(
    '%s uses the shared breakpoint store without a resize listener',
    (componentPath) => {
      const source = readSource(componentPath);

      expect(source).toContain('useMediaQuery(MOBILE_MEDIA_QUERY)');
      expect(source).not.toContain('window.innerWidth');
      expect(source).not.toContain("addEventListener('resize'");
      expect(source).toContain('export default React.memo');
    },
  );

  it('loads the correct administration implementation directly from each responsive shell', () => {
    const desktopSource = readSource('./DesktopEnterpriseDashboard.jsx');
    const mobileSource = readSource('./MobileEnterpriseDashboard.jsx');

    expect(desktopSource).toContain("lazy(() => import('./DesktopAdminPage'))");
    expect(desktopSource).not.toContain("lazy(() => import('./MobileAdminPage'))");
    expect(mobileSource).toContain("lazy(() => import('./MobileAdminPage'))");
    expect(mobileSource).not.toContain("lazy(() => import('./DesktopAdminPage'))");
  });

  it('keeps desktop, mobile, and unloaded reports behind dynamic imports', () => {
    const source = readSource('./ReportsPage.jsx');

    expect(source).toContain("lazy(() => import('./DesktopReportsPage'))");
    expect(source).toContain("lazy(() => import('./MobileReportsPage'))");
    expect(source).toContain("lazy(() => import('./UnloadedTripsReport'))");
    expect(source).not.toContain("import DesktopReportsPage from './DesktopReportsPage'");
    expect(source).not.toContain("import MobileReportsPage from './MobileReportsPage'");
  });
});
