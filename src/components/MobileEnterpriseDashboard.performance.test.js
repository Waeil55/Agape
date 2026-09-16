import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./MobileEnterpriseDashboard.jsx', import.meta.url), 'utf8');
const navSource = readFileSync(new URL('./shared/MobileBottomNav.jsx', import.meta.url), 'utf8');

describe('mobile enterprise subview render stability', () => {
  it('uses shared MobileLayout with HeaderProvider for all views', () => {
    expect(source).toContain('import {');
    expect(source).toContain('MobileLayout');
    expect(source).toContain('HeaderProvider');
    expect(source).toContain('from \'./shared\'');
    const mobileLayoutCount = (source.match(/<MobileLayout/g) || []).length;
    expect(mobileLayoutCount).toBeGreaterThan(5);
  });

  it('keeps the stable destination set only in the shared bottom navigation', () => {
    const navDeclaration = navSource.indexOf('export const MOBILE_PRIMARY_NAV = Object.freeze(');
    expect(navDeclaration).toBeGreaterThan(-1);
    expect(navSource).toContain("{ id: 'chat', label: 'Messages', icon: MessageSquare, roles: ['dispatcher', 'admin'] }");
    expect(source).not.toContain('const MOBILE_PRIMARY_NAV');
    expect(source).not.toContain('const navItems = useMemo');
  });

  it('wraps TripDetailView in a Suspense boundary', () => {
    expect(source).toContain('TripDetailView');
    expect(source).toContain('<Suspense fallback={<MobileFallback />}>');
    const tripDetailIndex = source.indexOf('<TripDetailView');
    const suspenseIndex = source.lastIndexOf('<Suspense fallback={<MobileFallback />}>', tripDetailIndex);
    expect(suspenseIndex).toBeGreaterThan(-1);
    expect(suspenseIndex).toBeLessThan(tripDetailIndex);
  });

  it('defers device-storage reads and writes away from initial render and click handlers', () => {
    expect(source).not.toContain("useState(() => localStorage.getItem('agape_toolsDriverId')");
    expect(source).not.toContain("if (toolsDriverId) localStorage.setItem('agape_toolsDriverId'");
    expect(source).toContain('startTransition');
  });

  it('uses code-split lazy imports for heavy sub-views', () => {
    const lazyImports = (source.match(/lazyWithRetry\(\(\) => import/g) || []).length;
    expect(lazyImports).toBeGreaterThan(5);
  });
});
