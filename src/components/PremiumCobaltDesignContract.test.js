import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('premium cobalt visual system contract', () => {
  it('keeps the responsive login story and role-specific controls', () => {
    const source = readSource('../App.jsx');

    expect(source).toContain('agape-login-mobile-intro');
    expect(source).toContain('One calm command center.');
    expect(source).toContain('data-login-role={r.key}');
    expect(source).toContain('agape-login-logo');
  });

  it('uses one medium cobalt family for app chrome, tables and utilities', () => {
    const styles = readSource('../index.css');
    const dashboard = readSource('./DesktopEnterpriseDashboard.jsx');
    const table = readSource('./ui/AppTable.jsx');

    expect(styles).toContain('--brand-primary: #3468E8');
    expect(styles).toContain('--gradient-table-head:');
    expect(styles).toContain('linear-gradient(110deg, #2E5DCE');
    expect(styles).toContain('COBALT BRAND HARMONIZATION');
    expect(styles).toContain('.bg-blue-50');
    expect(styles).toContain('background-color: #f3f5fa !important');
    expect(dashboard).toContain('enterprise-mobile-topbar');
    expect(dashboard).toContain('bg-[var(--brand-primary)]');
    expect(table).toContain('bg-[var(--brand-primary)]');
  });

  it('aligns web and native shell metadata to cobalt', () => {
    const capacitor = JSON.parse(readSource('../../capacitor.config.json'));
    const manifest = JSON.parse(readSource('../../public/manifest.webmanifest'));

    expect(capacitor.backgroundColor).toBe('#3468E8');
    expect(manifest.background_color).toBe('#3468E8');
    expect(manifest.theme_color).toBe('#3468E8');
  });
});
