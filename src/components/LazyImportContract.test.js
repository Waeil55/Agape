import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const srcUrl = new URL('../', import.meta.url);
const readSource = (url) => readFileSync(url, 'utf8');

const SHELLS = [
  'components/MobileEnterpriseDashboard.jsx',
  'components/DesktopEnterpriseDashboard.jsx',
  'components/DriverPage.jsx',
];

const LAZY_RE = /lazy(?:WithRetry)?\(\s*\(\s*\)\s*=>\s*import\('([^']+)'\)(?:\.then\(\s*m\s*=>\s*\(\{\s*default:\s*m\.(\w+)\s*\}\)\s*\))?/g;

const CONTAINS_DEFAULT_EXPORT = /\bexport\s+default\b/;
const containsNamedExport = (source, name) => {
  const named = new RegExp(`\\bexport\\s+(?:const|let|var|function|class)\\s+${name}\\b`);
  const reExport = new RegExp(`\\bexport\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`);
  return named.test(source) || reExport.test(source);
};

function resolveModuleFiles(importPath) {
  const clean = importPath.replace(/^\.\//, '');
  const candidates = [
    `components/${clean}.jsx`,
    `components/${clean}.js`,
    `${clean}.jsx`,
    `${clean}.js`,
  ];
  return candidates.map((c) => new URL(c, srcUrl)).filter((url) => existsSync(url));
}

describe('lazy import targets resolve to real exports', () => {
  for (const shell of SHELLS) {
    it(`every lazy target in ${shell.split('/').pop()} matches a real export`, () => {
      const source = readSource(new URL(shell, srcUrl));
      let match;
      let found = false;
      LAZY_RE.lastIndex = 0;
      while ((match = LAZY_RE.exec(source)) !== null) {
        found = true;
        const [importPath, namedExport] = [match[1], match[2]];
        const files = resolveModuleFiles(importPath);
        expect(files.length, `${shell}: module for "${importPath}" not found`).toBeGreaterThan(0);
        const moduleSource = files.map(readSource).join('\n');
        if (namedExport) {
          expect(containsNamedExport(moduleSource, namedExport), `${shell}: "${importPath}" has no named export "${namedExport}"`).toBe(true);
        } else {
          expect(CONTAINS_DEFAULT_EXPORT.test(moduleSource), `${shell}: "${importPath}" has no default export`).toBe(true);
        }
      }
      expect(found, `${shell}: no lazy imports found`).toBe(true);
    });
  }
});