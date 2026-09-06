import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');

const collectSourceFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return collectSourceFiles(path);
  return ['.js', '.jsx'].includes(extname(entry.name)) && !entry.name.includes('.test.') ? [path] : [];
});

describe('global page and table layout contract', () => {
  it('uses the shared 2 percent workspace gutter without shrinking the protected driver shell', () => {
    const css = read('src/index.css');
    expect(css).toContain('--app-page-width: 96%;');
    expect(css).toMatch(/\.app-page-frame\s*\{[\s\S]*?max-width:\s*var\(--app-page-width\);[\s\S]*?margin-inline:\s*auto;/);
    expect(css).toMatch(/html,\s*body,\s*#root\s*\{[\s\S]*?overflow-x:\s*hidden;/);
    expect(read('src/components/DesktopEnterpriseDashboard.jsx')).toContain('app-page-frame flex-1 min-h-0');
    expect(read('src/components/MobileEnterpriseDashboard.jsx')).toContain('app-page-frame mobile-enterprise-dashboard-wrapper');
    expect(read('src/components/DriverPage.jsx')).toContain('className="w-full h-full overflow-hidden');
    expect(read('src/components/DriverPage.jsx')).not.toContain('app-page-frame w-full h-full');
  });

  it('keeps desktop filter controls on one line without horizontal scrolling and preserves mobile wrapping', () => {
    const files = collectSourceFiles(join(root, 'src'));
    const css = read('src/index.css');
    const dashboard = read('src/components/DesktopEnterpriseDashboard.jsx');
    const operations = read('src/components/OperationsCommandCenter.jsx');
    const reports = read('src/components/DesktopReportsPage.jsx');
    const portal = read('src/features/welltrans-sync/components/WellTransSyncPage.jsx');

    expect(css).toMatch(/\.app-filter-bar\s*\{[\s\S]*?flex-wrap:\s*wrap;[\s\S]*?overflow-x:\s*hidden;/);
    expect(css).toMatch(/@media \(min-width:\s*768px\)[\s\S]*?\.app-filter-bar\s*\{[\s\S]*?flex-wrap:\s*nowrap;/);
    for (const path of files) {
      expect(readFileSync(path, 'utf8'), path).not.toMatch(/overflow-x-(?:auto|scroll)/);
    }
    expect(dashboard).toContain('hidden h-14 items-center');
    expect(dashboard).not.toContain('hidden h-20 items-center');
    expect(operations).toContain('aria-label="Sort trips"');
    expect(operations).toContain('aria-label="Manifest layout"');
    expect(reports).toContain('<CompactSelect ariaLabel="Report view"');
    expect(portal).not.toContain('{/* Control bar */}');
    expect(portal).not.toContain('bulkMenuOpen');
  });

  it('keeps the reports workspace switcher at a compact accessible height', () => {
    const reportsShell = read('src/components/ReportsPage.jsx');
    expect(reportsShell).toContain('group flex h-9 min-w-0');
    expect(reportsShell).not.toContain('group flex min-h-12 min-w-0');
    expect(reportsShell).toContain('shrink-0 border-b border-slate-200 bg-white px-3 py-1');
  });

  it('uses one authoritative compact command strip for comparable desktop workspaces', () => {
    const operations = read('src/components/OperationsCommandCenter.jsx');
    const tripReports = read('src/components/DesktopReportsPage.jsx');
    const overrides = read('src/components/UnloadedTripsReport.jsx');
    const archives = read('src/components/ArchivesPage.jsx');
    const payroll = read('src/components/PayrollReportPage.jsx');

    expect(operations).toContain('data-testid="operations-toolbar"');
    expect(operations).toContain('className="app-filter-bar !flex-nowrap');
    expect(operations.slice(operations.indexOf('data-testid="operations-toolbar"'), operations.indexOf('const renderInlineTripCard'))).not.toContain('w-px h-4');
    expect(tripReports).toContain('data-testid="reports-toolbar"');
    expect(overrides).toContain('data-testid="override-toolbar"');
    expect(overrides).toContain('aria-label="Override result view"');
    expect(archives).toContain('data-testid="archives-toolbar"');
    expect(payroll).toContain('data-testid="payroll-toolbar"');
  });

  it('keeps every real table inside the page without horizontal table scrolling', () => {
    const files = collectSourceFiles(join(root, 'src'));
    const tableFiles = files.filter((path) => readFileSync(path, 'utf8').includes('<table'));

    for (const path of tableFiles) {
      const source = readFileSync(path, 'utf8');
      const tableCount = source.match(/<table\b/g)?.length || 0;
      const frameCount = source.match(/app-table-frame/g)?.length || 0;
      expect(source, path).not.toMatch(/<table\b[^>]*\bmin-w-/);
      expect(source, path).not.toMatch(/overflow-x-(?:auto|scroll)[^>]*>\s*<table\b/);
      expect(frameCount, path).toBeGreaterThanOrEqual(tableCount);
    }

    const css = read('src/index.css');
    expect(css).toMatch(/table\s*\{[\s\S]*?min-width:\s*0\s*!important;[\s\S]*?table-layout:\s*fixed;/);
    expect(css).toMatch(/table td,[\s\S]*?white-space:\s*nowrap\s*!important;/);
    expect(css).not.toContain('.overflow-x-auto table');
    expect(css).not.toContain('width: max-content;');
  });

  it('uses a visible native checkbox and an indeterminate select-all state', () => {
    const css = read('src/index.css');
    const checkbox = read('src/components/ui/TableCheckbox.jsx');
    const operations = read('src/components/OperationsCommandCenter.jsx');
    expect(css).toMatch(/input\[type="checkbox"\][\s\S]*?appearance:\s*none;[\s\S]*?border:\s*2px solid/);
    expect(css).toContain('input[type="checkbox"]:checked');
    expect(css).toContain('input[type="checkbox"]:indeterminate');
    expect(checkbox).toContain('inputRef.current.indeterminate');
    expect(operations).toContain('label="Select all visible trips"');
  });

  it('records the no-parallel-implementation cleanup rule for future work', () => {
    const instructions = read('AGENTS.md');
    expect(instructions).toContain('Never place a second implementation beside an older implementation');
    expect(instructions).toContain('one authoritative implementation remains');
  });
});
