import { db, doc, getDoc, setDoc, serverTimestamp } from '../config/firebase';

const COLLECTION = 'userUiState';
const FLUSH_DELAY_MS = 500;
const MAX_SYNC_VALUE_CHARS = 100000;
const EXACT_KEYS = new Set(['expandedTripId']);
const EXCLUDED_KEYS = new Set(['agape-sync-trigger']);

let activeUid = null;
let patched = false;
let flushTimer = null;
let suppressPatchWrite = false;
let originalSetItem = null;
let originalRemoveItem = null;
let originalClear = null;

function isSyncableKey(key) {
  if (!key || EXCLUDED_KEYS.has(key)) return false;
  return EXACT_KEYS.has(key) || key.startsWith('agape_');
}

function readSyncableSnapshot() {
  const items = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!isSyncableKey(key)) continue;
    const value = localStorage.getItem(key);
    if (value === null || value.length > MAX_SYNC_VALUE_CHARS) continue;
    items[key] = value;
  }
  return items;
}

async function flushUserLocalState() {
  if (!activeUid) return false;
  const uid = activeUid;
  const items = readSyncableSnapshot();
  await setDoc(doc(db, COLLECTION, uid), {
    uid,
    items,
    updatedAt: serverTimestamp(),
    updatedAtLocal: new Date().toISOString(),
  });
  return true;
}

function scheduleFlush() {
  if (!activeUid || suppressPatchWrite) return;
  window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => {
    flushUserLocalState().catch((err) => {
      console.error('User local state Firebase sync failed:', err);
    });
  }, FLUSH_DELAY_MS);
}

function patchLocalStorage() {
  if (patched || typeof window === 'undefined') return;
  originalSetItem = Storage.prototype.setItem;
  originalRemoveItem = Storage.prototype.removeItem;
  originalClear = Storage.prototype.clear;

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    originalSetItem.call(this, key, value);
    if (this === localStorage && isSyncableKey(String(key))) scheduleFlush();
  };

  Storage.prototype.removeItem = function patchedRemoveItem(key) {
    originalRemoveItem.call(this, key);
    if (this === localStorage && isSyncableKey(String(key))) scheduleFlush();
  };

  Storage.prototype.clear = function patchedClear() {
    originalClear.call(this);
    if (this === localStorage) scheduleFlush();
  };

  window.addEventListener('online', scheduleFlush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushUserLocalState().catch(() => {});
    }
  });
  window.addEventListener('pagehide', () => {
    flushUserLocalState().catch(() => {});
  });

  patched = true;
}

export async function hydrateUserLocalState(uid) {
  if (!uid) return false;
  const snap = await getDoc(doc(db, COLLECTION, uid));
  if (!snap.exists()) return false;
  const items = snap.data()?.items || {};
  suppressPatchWrite = true;
  try {
    Object.entries(items).forEach(([key, value]) => {
      if (!isSyncableKey(key) || typeof value !== 'string') return;
      localStorage.setItem(key, value);
    });
  } finally {
    suppressPatchWrite = false;
  }
  return true;
}

export function startUserLocalStateSync(uid) {
  if (!uid) return;
  activeUid = uid;
  patchLocalStorage();
  scheduleFlush();
}

export async function stopUserLocalStateSync() {
  const uid = activeUid;
  window.clearTimeout(flushTimer);
  try {
    await flushUserLocalState();
  } finally {
    if (activeUid === uid) activeUid = null;
  }
}

export async function flushUserLocalStateNow() {
  window.clearTimeout(flushTimer);
  return flushUserLocalState();
}
