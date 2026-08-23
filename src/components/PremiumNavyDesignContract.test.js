import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('premium navy visual system contract', () => {
  it('gives mobile login a compact operations story and role-specific controls', () => {
    const source = readSource('../App.jsx');

    expect(source).toContain('agape-login-mobile-intro');
    expect(source).toContain('One calm command center.');
    expect(source).toContain('data-login-role={r.key}');
    expect(source).toContain('agape-login-logo');
  });

  it('uses the premium navy palette for shared app chrome and table heads', () => {
    const styles = readSource('../index.css');
    const dashboard = readSource('./DesktopEnterpriseDashboard.jsx');
    const table = readSource('./ui/AppTable.jsx');

    expect(styles).toContain('--brand-navy: #10234C');
    expect(styles).toContain('--gradient-table-head:');
    expect(styles).toContain('table thead tr[class]');
    expect(styles).toContain('.enterprise-topbar');
    expect(dashboard).toContain('enterprise-mobile-topbar');
    expect(table).toContain('bg-[var(--brand-navy)]');
  });
});
