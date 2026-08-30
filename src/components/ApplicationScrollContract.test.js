import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('application scrolling contract', () => {
  it('uses the dynamic viewport and lets shrinking flex children form scroll viewports', () => {
    const css = read('src/index.css');
    expect(css).toContain('height: 100dvh;');
    expect(css).toMatch(/\.flex-1\s*\{\s*min-height:\s*0;/);
    expect(css).toMatch(/\.overflow-y-auto,[\s\S]*?touch-action:\s*pan-y;/);
  });

  it('provides a touch-scroll fallback for full-screen overlays without changing trip windows', () => {
    const css = read('src/index.css');
    expect(css).toContain('.fixed.inset-0:not(.trip-window-overlay)');
    expect(css).toContain('overflow-y: auto;');
    expect(css).toContain('.fixed.inset-0.items-center:not(.trip-window-overlay)');
    expect(css).toContain('align-items: safe center;');
  });

  it('keeps the admin shell constrained to its parent with one scrolling content region', () => {
    const css = read('src/index.css');
    const shell = read('src/components/admin/AdminKit.jsx');
    expect(css).toMatch(/\.admin-app\s*\{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/);
    expect(css).toMatch(/\.adm-main\s*\{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/);
    expect(css).toMatch(/\.adm-content\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?min-height:\s*0;/);
    expect(shell).toContain('data-scroll-region="admin-sections"');
    expect(css).toMatch(/\.adm-content\s*\{[\s\S]*?overscroll-behavior-y:\s*contain;[\s\S]*?touch-action:\s*pan-y;/);
  });

  it('bounds Operations and defaults existing installations to the compact ledger once', () => {
    const dashboard = read('src/components/DesktopEnterpriseDashboard.jsx');
    const operations = read('src/components/OperationsCommandCenter.jsx');
    expect(dashboard).toContain("['operations', 'reports', 'admin', 'drive', 'chat'].includes(activePanel) ? 'flex flex-col overflow-hidden'");
    expect(operations).toContain("manifestView: migrated && ['table', 'card', 'board'].includes(storedView) ? storedView : 'table'");
    expect(operations).toContain("showIntelligence: migrated && localStorage.getItem('agape_opsShowIntelligence') === 'true'");
    expect(operations).toContain('data-scroll-region="operations-ledger"');
    expect(operations).toContain('className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"');
  });

  it('keeps the Driver Quick SMS header fixed and scrolls only its message body', () => {
    const driver = read('src/components/DriverPage.jsx');
    expect(driver).toContain('data-scroll-region="driver-quick-sms"');
    expect(driver).toContain('relative flex max-h-[85dvh] min-h-0 w-full max-w-lg flex-col overflow-hidden');
    expect(driver).toContain('min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y px-4');
  });

  it('gives the create-user window a bounded scrolling form', () => {
    const source = read('src/components/DesktopAdminPage.jsx');
    expect(source).toContain('max-h-[calc(100dvh-1.5rem)]');
    expect(source).toContain('min-h-0 space-y-4 overflow-y-auto overscroll-contain');
  });

  it('does not shrink and clip the login stage on short mobile screens', () => {
    const css = read('src/index.css');
    expect(css).toMatch(/\.agape-login-panel\s*\{[\s\S]*?flex-shrink:\s*0;/);
    expect(css).toMatch(/@media \(max-width: 1023px\)[\s\S]*?\.agape-login-stage\s*\{[\s\S]*?min-height:\s*100%;[\s\S]*?flex-shrink:\s*0;/);
  });
});
