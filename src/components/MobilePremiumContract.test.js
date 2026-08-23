import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readComponent = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('mobile premium interaction contract', () => {
  it('keeps both mobile navigation bars at five stable destinations', () => {
    const enterpriseSource = readComponent('./MobileEnterpriseDashboard.jsx');
    const driverSource = readComponent('./DriverPage.jsx');
    const enterpriseNav = enterpriseSource.match(/MOBILE_PRIMARY_NAV = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';
    const driverNav = driverSource.match(/const navItems = useMemo\(\(\) => \{([\s\S]*?)\}, \[unreadCount\]\);/)?.[1] || '';
    const enterpriseIds = [...enterpriseNav.matchAll(/id: '([^']+)'/g)].map((match) => match[1]);
    const driverIds = [...driverNav.matchAll(/id: '([^']+)'/g)].map((match) => match[1]);

    expect(enterpriseIds).toEqual(['trips', 'map', 'chat', 'reports', 'menu']);
    expect(driverIds).toEqual(['trips', 'tools', 'chat', 'history', 'settings']);
    expect(driverNav).not.toContain('splice');
    expect(driverNav).not.toContain("id: 'active-trip'");
  });

  it('keeps active-trip continuity outside the fixed driver navigation', () => {
    const driverSource = readComponent('./DriverPage.jsx');

    expect(driverSource).toContain("activeWorkTrip && activeNav !== 'active-trip'");
    expect(driverSource).toContain('Resume active trip for');
    expect(driverSource).toContain('aria-current={isActiveTab');
  });

  it('prevents the primary bottom bar from colliding with nested Admin tabs', () => {
    const enterpriseSource = readComponent('./MobileEnterpriseDashboard.jsx');
    expect(enterpriseSource).toContain("subView !== 'admin'");
  });

  it('gives the login credential back control an accessible name', () => {
    const appSource = readComponent('../App.jsx');

    expect(appSource).toContain('aria-label="Back to role selection"');
  });

  it('uses truthful install copy and checks safety before every update reload', () => {
    const installSource = readComponent('./pwa/PWAInstallPrompt.jsx');
    const updateSource = readComponent('./pwa/PWAUpdatePrompt.jsx');
    const firstSafetyCheck = updateSource.indexOf('const unsafeReasons = await checkUpdateSafety()');
    const activateWorker = updateSource.indexOf("reg.waiting.postMessage({ type: 'SKIP_WAITING' })");
    const finalSafetyCheck = updateSource.indexOf('const finalUnsafeReasons = await checkUpdateSafety()');
    const reload = updateSource.indexOf('window.location.reload()');

    expect(installSource).not.toContain('Access your data even without internet');
    expect(installSource).not.toContain('Your data stays on your device');
    expect(installSource).toContain('Supported offline work');
    expect(firstSafetyCheck).toBeGreaterThan(-1);
    expect(firstSafetyCheck).toBeLessThan(activateWorker);
    expect(finalSafetyCheck).toBeGreaterThan(activateWorker);
    expect(finalSafetyCheck).toBeLessThan(reload);
  });
});
