/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/firebase', () => ({
  GOOGLE_MAPS_API_KEY: () => 'test-key',
}));

describe('Google Maps loader', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    delete window.google;
    vi.resetModules();
  });

  it('uses one async script with only supported libraries', async () => {
    const { loadGoogleMapsApi } = await import('./useGoogleMaps');
    const first = loadGoogleMapsApi();
    const second = loadGoogleMapsApi();
    expect(second).toBe(first);

    const script = document.getElementById('agape-gm-api');
    const url = new URL(script.src);
    expect(url.searchParams.get('loading')).toBe('async');
    expect(url.searchParams.get('callback')).toBe('__agapeGoogleMapsReady');
    expect(url.searchParams.get('libraries')).toBe('places,marker');
    expect(url.searchParams.get('libraries')).not.toContain('directions');
    expect(document.querySelectorAll('#agape-gm-api')).toHaveLength(1);

    window.google = { maps: { Map: class Map {} } };
    window.__agapeGoogleMapsReady();
    await expect(first).resolves.toBe(window.google.maps);
  });

  it('reuses an already initialized API without injecting a script', async () => {
    window.google = { maps: { ready: true } };
    const { loadGoogleMapsApi } = await import('./useGoogleMaps');
    await expect(loadGoogleMapsApi()).resolves.toBe(window.google.maps);
    expect(document.getElementById('agape-gm-api')).toBeNull();
  });

  it('turns Google authorization failure into an application event', async () => {
    const listener = vi.fn();
    window.addEventListener('agape:google-maps-auth-failure', listener);
    const { loadGoogleMapsApi } = await import('./useGoogleMaps');
    loadGoogleMapsApi();
    window.gm_authFailure();
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener('agape:google-maps-auth-failure', listener);
  });
});
