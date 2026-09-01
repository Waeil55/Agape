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

  it('never interrupts an active workspace to activate or reload an update', () => {
    const worker = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
    const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
    const installHandler = worker.match(/self\.addEventListener\('install',[\s\S]*?\n\}\);/)?.[0] || '';
    expect(installHandler).not.toContain('self.skipWaiting()');
    expect(app).not.toContain('clearAgapeStaticCaches().finally(() => window.location.reload())');
    expect(app).not.toContain('1000 - elapsed');
  });

  it('offers an explicit update without making background refresh noisy', () => {
    const prompt = readFileSync(new URL('../components/pwa/PWAUpdatePrompt.jsx', import.meta.url), 'utf8');
    const manager = readFileSync(new URL('./swManager.js', import.meta.url), 'utf8');
    expect(prompt).toContain("window.addEventListener('swUpdateAvailable', handler)");
    expect(prompt).toContain('reg.waiting && navigator.serviceWorker.controller');
    expect(prompt).toContain("reg.waiting.postMessage({ type: 'SKIP_WAITING' })");
    expect(manager.indexOf("addEventListener('updatefound', updateFoundHandler)")).toBeLessThan(manager.indexOf('await checkForServiceWorkerUpdate()'));
    expect(manager).toContain('void checkForServiceWorkerUpdate()');
    expect(manager).not.toContain('setInterval(() => {\n      swRegistration.update();');
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
