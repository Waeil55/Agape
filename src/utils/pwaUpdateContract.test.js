import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('PWA update contract', () => {
  it('never serves navigations from the browser HTTP cache', () => {
    const worker = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
    expect(worker).toContain("fetch(request, { cache: 'no-store' })");
    expect(worker).toContain("name !== RUNTIME_CACHE");
  });

  it('pre-caches every generated application chunk for complete offline navigation', () => {
    const worker = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
    const vite = readFileSync(new URL('../../vite.config.js', import.meta.url), 'utf8');
    expect(worker).toContain("fetch('/asset-manifest.json'");
    expect(worker).toContain('cacheOfflineApplication()');
    expect(vite).toContain("fileName: 'asset-manifest.json'");
  });

  it('marks the agape5 application shell as no-store', () => {
    const firebase = JSON.parse(readFileSync(new URL('../../firebase.json', import.meta.url), 'utf8'));
    const agape5 = firebase.hosting.find((target) => target.target === 'agape5');
    const catchAll = agape5.headers.find((header) => header.source === '**');
    expect(catchAll.headers).toContainEqual({
      key: 'Cache-Control',
      value: 'no-cache, no-store, must-revalidate',
    });
  });
});
