import React, { lazy } from 'react';

// A workspace chunk that never resolves (a stalled mobile fetch) previously left
// the app on a bare spinner forever, and a failed chunk triggered an unbounded
// reload loop. This utility is the single authority for loading every lazily
// imported workspace surface: it bounds the wait, bounds the recovery reloads,
// and — if recovery is impossible — renders a visible, actionable error state
// instead of an eternal spinner.

const RELOAD_GUARD_KEY = 'agape_chunk_reload_attempts';
export const MAX_RELOAD_ATTEMPTS = 2;
export const CHUNK_LOAD_TIMEOUT_MS = 20000;
export const RELOAD_GRACE_MS = 4000;

const defaultStore = {
  read: () => {
    try {
      return Number.parseInt(sessionStorage.getItem(RELOAD_GUARD_KEY) || '0', 10) || 0;
    } catch {
      return 0;
    }
  },
  write: (value) => {
    try { sessionStorage.setItem(RELOAD_GUARD_KEY, String(value)); } catch {}
  },
  clear: () => {
    try { sessionStorage.removeItem(RELOAD_GUARD_KEY); } catch {}
  },
};

export const clearChunkReloadGuard = () => defaultStore.clear();

const clearStaticCaches = () => {
  try {
    if (typeof caches !== 'undefined' && caches && typeof caches.keys === 'function') {
      return caches.keys()
        .then((names) => Promise.all(names.map((name) => caches.delete(name).catch(() => false))))
        .catch(() => {});
    }
  } catch {}
  return Promise.resolve();
};

// A stale service worker can keep serving an old app shell whose chunk hashes no
// longer exist, so an import fails forever. Recovery must clear the cached shell
// *and* unregister the worker before reloading. Firebase auth lives in
// localStorage/IndexedDB and is unaffected, so the session is preserved.
const resetStaticShell = async () => {
  await clearStaticCaches();
  try {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker && typeof navigator.serviceWorker.getRegistrations === 'function') {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister().catch(() => null)));
    }
  } catch {}
};

const reloadPage = () => {
  try { window.location.reload(); } catch {}
};

const withTimeout = (promise, ms, makeError) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(makeError()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

export const WorkspaceErrorState = ({ title = 'Unable to load this section', message, onRetry, retryLabel = 'Retry' }) => (
  React.createElement(
    'div',
    { className: 'flex h-full min-h-0 flex-1 items-center justify-center bg-slate-50 p-8' },
    React.createElement(
      'div',
      { className: 'mx-auto max-w-sm text-center' },
      React.createElement(
        'div',
        { className: 'mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100' },
        React.createElement('span', { className: 'text-2xl font-bold text-rose-600' }, '!')
      ),
      React.createElement('p', { className: 'mb-2 text-lg font-semibold text-slate-900' }, title),
      message ? React.createElement('p', { className: 'mb-4 break-words text-sm text-slate-500' }, message) : null,
      onRetry
        ? React.createElement(
            'button',
            {
              type: 'button',
              onClick: onRetry,
              className: 'rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 active:bg-blue-800',
            },
            retryLabel
          )
        : null
    )
  )
);

// Loads a workspace chunk with a bounded timeout and bounded recovery. Returns
// either the resolved module or a `{ default: Component }` error surface so a
// Suspense boundary always resolves to something a user can act on.
export const loadWorkspaceChunk = async (loader, options = {}) => {
  const store = options.store || defaultStore;
  const maxAttempts = options.maxReloadAttempts ?? MAX_RELOAD_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? CHUNK_LOAD_TIMEOUT_MS;
  const reload = options.reload || reloadPage;
  const clearCaches = options.clearCaches || resetStaticShell;
  const wait = options.wait || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const reloadGraceMs = options.reloadGraceMs ?? RELOAD_GRACE_MS;

  try {
    const mod = await withTimeout(
      loader(),
      timeoutMs,
      () => Object.assign(new Error('Loading timed out'), { name: 'ChunkTimeoutError' })
    );
    store.clear();
    return mod;
  } catch (error) {
    const attempts = store.read();
    if (attempts < maxAttempts) {
      store.write(attempts + 1);
      await clearCaches();
      reload();
      // If the reload was blocked, do not hang: fall through to a visible error.
      await wait(reloadGraceMs);
    }

    const message = String((error && error.message) || error || 'The section could not be loaded.');
    const onRetry = options.onRetry || (() => {
      store.clear();
      reload();
    });
    const Fallback = () => React.createElement(WorkspaceErrorState, { message, onRetry });
    return { default: Fallback };
  }
};

export const lazyWithRetry = (loader) => lazy(() => loadWorkspaceChunk(loader));

export default lazyWithRetry;
