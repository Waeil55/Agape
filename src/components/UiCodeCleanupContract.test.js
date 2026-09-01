import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const srcUrl = new URL('../', import.meta.url);
const readSource = (name) => readFileSync(new URL(name, srcUrl), 'utf8');

describe('code-native UI cleanup contract', () => {
  it('does not load the retired browser-console data exporter', () => {
    expect(readSource('App.jsx')).not.toContain("./utils/clientExport");
    expect(existsSync(new URL('utils/clientExport.js', srcUrl))).toBe(false);
  });

  it('keeps each responsive administration implementation in its owning shell', () => {
    expect(existsSync(new URL('components/AdminPage.jsx', srcUrl))).toBe(false);
    expect(readSource('components/DesktopEnterpriseDashboard.jsx')).toContain("lazy(() => import('./DesktopAdminPage'))");
    expect(readSource('components/MobileEnterpriseDashboard.jsx')).toContain("lazy(() => import('./MobileAdminPage'))");
  });

  it('retains native-feeling interaction, scrolling, and reduced-motion safeguards', () => {
    const css = readSource('index.css');
    const main = readSource('main.jsx');

    expect(css).toContain('touch-action: manipulation');
    expect(css).toContain('-webkit-overflow-scrolling: touch');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(main.indexOf("import './styles/tripWindows.css'")).toBeGreaterThan(main.indexOf("import './index.css'"));
  });

  it('does not retain selectors for removed administration widgets', () => {
    const css = readSource('index.css');
    const kit = readSource('components/admin/AdminKit.jsx');

    expect(css).not.toMatch(/\.adm-(?:stat|stats|pill-tab|pill-tabs|section-title)\b/);
    expect(kit).not.toMatch(/AdminStat|AdminPillTabs|AdminSectionTitle/);
  });
});
