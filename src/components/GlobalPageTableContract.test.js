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
  it('uses one shared maximum width for desktop, mobile, and driver pages', () => {
    const css = read('src/index.css');
    expect(css).toContain('--app-page-max-width: 1440px;');
    expect(css).toMatch(/\.app-page-frame\s*\{[\s\S]*?max-width:\s*var\(--app-page-max-width\);[\s\S]*?margin-inline:\s*auto;/);
    expect(css).toMatch(/html,\s*body,\s*#root\s*\{[\s\S]*?overflow-x:\s*hidden;/);
    expect(read('src/components/DesktopEnterpriseDashboard.jsx')).toContain('app-page-frame flex-1 min-h-0');
    expect(read('src/components/MobileEnterpriseDashboard.jsx')).toContain('app-page-frame mobile-enterprise-dashboard-wrapper');
    expect(read('src/components/DriverPage.jsx')).toContain('app-page-frame w-full h-full');
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
    expect(css).not.toContain('.overflow-x-auto table');
    expect(css).not.toContain('width: max-content;');
  });

  it('records the no-parallel-implementation cleanup rule for future work', () => {
    const instructions = read('AGENTS.md');
    expect(instructions).toContain('Never place a second implementation beside an older implementation');
    expect(instructions).toContain('one authoritative implementation remains');
  });
});
