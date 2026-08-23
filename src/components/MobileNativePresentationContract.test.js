import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readComponent = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

describe('mobile native presentation contract', () => {
  it('keeps mobile non-driver surfaces light, slate-based, and safe above navigation', () => {
    for (const name of ['MobileMenuPage.jsx', 'MobileAdminPage.jsx', 'MobileReportsPage.jsx']) {
      const source = readComponent(name);
      expect(source).toContain('bg-slate-50');
      expect(source).toContain('pb-24');
      expect(source).not.toContain('gray-');
    }
  });

  it('keeps dispatch interaction targets readable and rendering inexpensive', () => {
    const source = readComponent('MobileDispatchView.jsx');

    expect(source).toContain('pb-24');
    expect(source).toContain('min-h-11');
    expect(source).not.toContain('backdrop-blur');
    expect(source).not.toContain('transition-all');
    expect(source).not.toMatch(/text-\[(?:8|9)px\]/);
    expect(source).not.toMatch(/\b[wh]-[789]\b/);
  });

  it('keeps enterprise navigation to five stable primary destinations', () => {
    const source = readComponent('MobileEnterpriseDashboard.jsx');
    const nav = source.match(/MOBILE_PRIMARY_NAV = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';
    const ids = [...nav.matchAll(/id: '([^']+)'/g)].map((match) => match[1]);

    expect(ids).toEqual(['trips', 'map', 'chat', 'reports', 'menu']);
    expect(source).not.toContain('backdrop-blur');
    expect(source).not.toContain('transition-all');
  });

  it('uses separate semantic controls for report expansion and editing', () => {
    const source = readComponent('MobileReportsPage.jsx');

    expect(source).not.toContain('role="button"');
    expect(source).toContain('aria-expanded={isExpanded}');
    expect(source).toContain('aria-label={`Edit ${trip.patient || \'trip\'}`}');
    expect(source).toContain('role={editMessage.includes(\'not saved\')');
  });
});
