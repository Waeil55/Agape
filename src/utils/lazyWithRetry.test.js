import { describe, it, expect, vi } from 'vitest';
import { loadWorkspaceChunk, MAX_RELOAD_ATTEMPTS, clearChunkReloadGuard } from './lazyWithRetry';

const makeStore = (initial = 0) => {
  const state = { attempts: initial };
  return {
    state,
    read: () => state.attempts,
    write: (value) => { state.attempts = value; },
    clear: () => { state.attempts = 0; },
  };
};

const makeOptions = (overrides = {}) => {
  const store = overrides.store || makeStore(0);
  return {
    store,
    reload: vi.fn(),
    clearCaches: vi.fn(() => Promise.resolve()),
    wait: vi.fn(() => Promise.resolve()),
    timeoutMs: 50,
    ...overrides,
  };
};

describe('loadWorkspaceChunk', () => {
  it('returns the resolved module and clears the reload guard on success', async () => {
    const store = makeStore(1);
    const mod = { default: () => null };
    const options = makeOptions({ store });
    const result = await loadWorkspaceChunk(() => Promise.resolve(mod), options);
    expect(result).toBe(mod);
    expect(store.state.attempts).toBe(0);
    expect(options.reload).not.toHaveBeenCalled();
    expect(options.clearCaches).not.toHaveBeenCalled();
  });

  it('clears caches and reloads once when a chunk fails within the attempt budget', async () => {
    const store = makeStore(0);
    const options = makeOptions({ store });
    const result = await loadWorkspaceChunk(() => Promise.reject(new Error('404')), options);
    expect(options.clearCaches).toHaveBeenCalledTimes(1);
    expect(options.reload).toHaveBeenCalledTimes(1);
    expect(options.wait).toHaveBeenCalledTimes(1);
    expect(store.state.attempts).toBe(1);
    expect(typeof result.default).toBe('function');
  });

  it('does not reload again once the attempt budget is exhausted and returns a visible fallback', async () => {
    const store = makeStore(MAX_RELOAD_ATTEMPTS);
    const options = makeOptions({ store });
    const result = await loadWorkspaceChunk(() => Promise.reject(new Error('boom')), options);
    expect(options.reload).not.toHaveBeenCalled();
    expect(options.clearCaches).not.toHaveBeenCalled();
    expect(store.state.attempts).toBe(MAX_RELOAD_ATTEMPTS);
    expect(typeof result.default).toBe('function');
  });

  it('treats a stalled chunk load as a failure (bounded timeout)', async () => {
    const store = makeStore(MAX_RELOAD_ATTEMPTS);
    const options = makeOptions({ store, timeoutMs: 10 });
    const never = new Promise(() => {});
    const result = await loadWorkspaceChunk(() => never, options);
    expect(typeof result.default).toBe('function');
  });

  it('exposes a callable clearChunkReloadGuard', () => {
    expect(() => clearChunkReloadGuard()).not.toThrow();
  });
});
