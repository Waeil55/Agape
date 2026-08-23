import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');

describe('responsive page shell performance contract', () => {
  it.each(['./AdminPage.jsx', './ReportsPage.jsx'])(
    '%s uses the shared breakpoint store without a resize listener',
    (componentPath) => {
      const source = readSource(componentPath);

      expect(source).toContain('useMediaQuery(MOBILE_MEDIA_QUERY)');
      expect(source).not.toContain('window.innerWidth');
      expect(source).not.toContain("addEventListener('resize'");
      expect(source).toContain('export default React.memo');
    },
  );

  it('keeps desktop and mobile administration implementations behind dynamic imports', () => {
    const source = readSource('./AdminPage.jsx');

    expect(source).toContain("lazy(() => import('./DesktopAdminPage'))");
    expect(source).toContain("lazy(() => import('./MobileAdminPage'))");
    expect(source).not.toContain("import DesktopAdminPage from './DesktopAdminPage'");
    expect(source).not.toContain("import MobileAdminPage from './MobileAdminPage'");
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
