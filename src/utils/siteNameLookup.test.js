// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';

const firebaseMock = vi.hoisted(() => ({
  db: {},
  doc: vi.fn((_db, collectionName, id) => `${collectionName}/${id}`),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'server-timestamp'),
}));
vi.mock('../config/firebase', () => firebaseMock);

const loadGoogleMapsApi = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useGoogleMaps', () => ({ loadGoogleMapsApi }));

import { resolveSiteName } from './siteNameLookup';

describe('resolveSiteName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete window.google;
  });

  it('returns null for an address too short to be meaningful', async () => {
    expect(await resolveSiteName('12 St')).toBeNull();
    expect(firebaseMock.getDoc).not.toHaveBeenCalled();
  });

  it('returns a cached name from Firestore without calling Places', async () => {
    firebaseMock.getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ name: 'Valle Vista Health System' }) });
    const name = await resolveSiteName('65 Airport Pkwy Greenwood IN 46143');
    expect(name).toBe('Valle Vista Health System');
    expect(loadGoogleMapsApi).not.toHaveBeenCalled();
  });

  it('looks up via Places when nothing is cached, and caches the result', async () => {
    firebaseMock.getDoc.mockResolvedValueOnce({ exists: () => false });
    loadGoogleMapsApi.mockResolvedValueOnce({});
    const findPlaceFromQuery = vi.fn((_req, callback) => callback([{ name: 'Hellenic Senior Living' }], 'OK'));
    window.google = { maps: { places: { PlacesService: vi.fn(function PlacesServiceMock() { return { findPlaceFromQuery }; }), PlacesServiceStatus: { OK: 'OK' } } } };

    const name = await resolveSiteName('8601 Shelby St Apt 139 Indianapolis IN 46227 — a fresh address');
    expect(name).toBe('Hellenic Senior Living');
    expect(firebaseMock.setDoc).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ name: 'Hellenic Senior Living' }),
      { merge: true },
    );
  });

  it('never breaks when Places is unavailable, and caches the miss', async () => {
    firebaseMock.getDoc.mockResolvedValueOnce({ exists: () => false });
    loadGoogleMapsApi.mockRejectedValueOnce(new Error('no api key'));

    const name = await resolveSiteName('some long residential street address');
    expect(name).toBeNull();
    expect(firebaseMock.setDoc).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ name: '' }),
      { merge: true },
    );
  });
});
