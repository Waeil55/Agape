import { db, doc, getDoc, setDoc, serverTimestamp } from '../config/firebase';
import { loadGoogleMapsApi } from '../hooks/useGoogleMaps';

const COLLECTION = 'placeNameCache';
const memoryCache = new Map();
let sharedDiv = null;
let sharedService = null;

const normalizeAddressKey = (address) => String(address || '').trim().toLowerCase().replace(/\s+/g, ' ');
// Firestore doc IDs are capped at 1500 bytes and reject "/"; addresses are
// short in practice but this keeps a pathological input safe either way.
const addressCacheDocId = (key) => encodeURIComponent(key).slice(0, 400);

async function getPlacesService() {
  await loadGoogleMapsApi();
  if (!window.google?.maps?.places?.PlacesService) return null;
  if (!sharedService) {
    // findPlaceFromQuery requires a Map or HTMLDivElement for attribution;
    // it never needs to be attached to the page for this lookup-only use.
    sharedDiv = document.createElement('div');
    sharedService = new window.google.maps.places.PlacesService(sharedDiv);
  }
  return sharedService;
}

function findPlaceFromQuery(service, address) {
  return new Promise((resolve) => {
    try {
      service.findPlaceFromQuery(
        { query: address, fields: ['name', 'business_status'] },
        (results, status) => {
          const ok = status === window.google.maps.places.PlacesServiceStatus.OK;
          const name = ok ? results?.[0]?.name : null;
          // A bare address with no matching place returns its own formatted
          // address as the "name" — that is not a site name, so drop it.
          resolve(name && name.trim() && name.trim() !== String(address || '').trim() ? name.trim() : null);
        },
      );
    } catch {
      resolve(null);
    }
  });
}

/**
 * Resolves a business/facility name for a bare street address, for trips
 * whose import did not include one. Looked up once per unique address
 * (in-memory, then a shared Firestore cache so every operator's device
 * benefits from the first lookup) and never re-queried after that —
 * including a "not found" result, to avoid retry storms on addresses with
 * no matching place. Never throws; a failed lookup just yields no name.
 */
export async function resolveSiteName(address) {
  const key = normalizeAddressKey(address);
  if (!key || key.length < 6) return null;
  if (memoryCache.has(key)) return memoryCache.get(key);

  const cacheRef = doc(db, COLLECTION, addressCacheDocId(key));
  try {
    const cached = await getDoc(cacheRef);
    if (cached.exists()) {
      const name = cached.data()?.name || null;
      memoryCache.set(key, name);
      return name;
    }
  } catch {
    // Cache read is best-effort; fall through to a live lookup.
  }

  let name = null;
  try {
    const service = await getPlacesService();
    if (service) name = await findPlaceFromQuery(service, address);
  } catch {
    // Places lookup is best-effort and must never break the trip view.
  }

  memoryCache.set(key, name);
  try {
    await setDoc(cacheRef, { address: String(address || ''), name: name || '', resolvedAt: serverTimestamp() }, { merge: true });
  } catch {
    // Cache write is best-effort — a repeat lookup next time is acceptable.
  }
  return name;
}
