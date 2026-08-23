import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('premium navy visual system contract', () => {
  it('keeps the responsive login story and role-specific controls', () => {
    const source = readSource('../App.jsx');

    expect(source).toContain('agape-login-mobile-intro');
    expect(source).toContain('One calm command center.');
    expect(source).toContain('data-login-role={r.key}');
    expect(source).toContain('agape-login-logo');
  });

  it('uses navy for app chrome and keeps secondary surfaces neutral', () => {
    const styles = readSource('../index.css');
    const dashboard = readSource('./DesktopEnterpriseDashboard.jsx');
    const table = readSource('./ui/AppTable.jsx');

    expect(styles).toContain('--brand-primary: #2A52AC');
    expect(styles).toContain('linear-gradient(110deg, #1F428F');
    expect(styles).toContain('NAVY BRAND HARMONIZATION');
    expect(styles).toContain('background-color: #f3f5fa !important');
    expect(styles).toContain('.bg-blue-600 { background-color: #2a52ac !important; }');
    expect(dashboard).toContain('bg-[var(--brand-primary)]');
    expect(table).toContain('bg-[var(--brand-primary)]');
  });

  it('aligns web and native shell metadata to navy', () => {
    const capacitor = JSON.parse(readSource('../../capacitor.config.json'));
    const manifest = JSON.parse(readSource('../../public/manifest.webmanifest'));

    expect(capacitor.backgroundColor).toBe('#2A52AC');
    expect(manifest.background_color).toBe('#2A52AC');
    expect(manifest.theme_color).toBe('#2A52AC');
  });
});
