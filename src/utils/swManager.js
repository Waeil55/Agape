/**
 * Service Worker Registration & Management
 * Handles SW registration, updates, and sync triggers
 * Works across all platforms: PWA, iOS, Android, Desktop, Mac
 */

let swRegistration = null;
let updateCheckTimer = null;
let controllerChangeListenerRegistered = false;
let registrationListenersAttached = false;

const SW_RELOAD_VERSION_KEY = 'agape_sw_reloaded_version';
const SW_RELOAD_AT_KEY = 'agape_sw_reloaded_at';
const SW_RELOAD_COOLDOWN_MS = 60 * 1000;

const reloadOnceForVersion = (version = 'unknown') => {
  try {
    const now = Date.now();
    const lastVersion = localStorage.getItem(SW_RELOAD_VERSION_KEY);
    const lastAt = Number(localStorage.getItem(SW_RELOAD_AT_KEY) || 0);
    if (lastVersion === version) return false;
    if (lastAt && now - lastAt < SW_RELOAD_COOLDOWN_MS) return false;
    localStorage.setItem(SW_RELOAD_VERSION_KEY, version);
    localStorage.setItem(SW_RELOAD_AT_KEY, String(now));
  } catch {
    // Storage can fail in private mode; still avoid throwing during app startup.
  }
  window.location.reload();
  return true;
};

const attachRegistrationListeners = (registration) => {
  if (!registration || registrationListenersAttached) return;
  registrationListenersAttached = true;

  registration.addEventListener('updatefound', () => {
    const newWorker = registration.installing;
    if (!newWorker) return;
    newWorker.addEventListener('statechange', () => {
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        notifyUpdateAvailable();
      }
    });
  });

  if (!controllerChangeListenerRegistered) {
    controllerChangeListenerRegistered = true;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.dispatchEvent(new CustomEvent('swControllerChanged'));
    });
  }
};

/**
 * Register the service worker and set up update listeners
 */
export const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) {
    console.log('Service Workers not supported');
    return null;
  }

  try {
    if (swRegistration) return swRegistration;
    const existingReg = await navigator.serviceWorker.getRegistration('/');
    if (existingReg) {
      swRegistration = existingReg;
      attachRegistrationListeners(swRegistration);
      if (swRegistration.waiting && navigator.serviceWorker.controller) {
        notifyUpdateAvailable();
      }
      swRegistration.update().catch(() => {});
      if (updateCheckTimer) clearInterval(updateCheckTimer);
      updateCheckTimer = setInterval(() => {
        swRegistration.update().catch(() => {});
      }, 5 * 60 * 1000);
      return swRegistration;
    }
    
    swRegistration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    
    console.log('Service Worker registered successfully');

    attachRegistrationListeners(swRegistration);

    // Check for updates periodically without forcing a page reload.
    if (updateCheckTimer) clearInterval(updateCheckTimer);
    updateCheckTimer = setInterval(() => {
      swRegistration.update().catch(() => {});
    }, 5 * 60 * 1000);

    return swRegistration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return null;
  }
};

/**
 * Request periodic background sync (PWA)
 */
export const requestPeriodicSync = async () => {
  if (!('serviceWorker' in navigator) || !('PeriodicSyncManager' in window)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    if (registration.periodicSync) {
      await registration.periodicSync.register('sync-data', {
        minInterval: 60000 // 1 minute
      });
      console.log('Periodic sync registered');
      return true;
    }
  } catch (error) {
    // Periodic background sync is not consistently available across mobile browsers.
    // The app still uses Firestore snapshots, visibility refresh, and manual SW sync.
  }
  return false;
};

/**
 * Trigger immediate sync via service worker
 */
export const triggerSync = async () => {
  if (!navigator.serviceWorker.controller) {
    console.log('No active SW controller');
    return;
  }

  navigator.serviceWorker.controller.postMessage({
    type: 'SYNC_DATA',
    timestamp: Date.now()
  });
};

/**
 * Handle message from service worker
 */
export const setupSWMessageHandler = (callback) => {
  if ('serviceWorker' in navigator) {
    const handler = (event) => {
      if (event.data?.type === 'SW_UPDATED') {
        const version = event.data.version || 'unknown';
        if (!reloadOnceForVersion(version)) {
          console.log('[SW] Reload already handled for version', version);
          return;
        }
        return;
      }
      if (event.data?.type === 'SYNC_REQUEST' || event.data?.type === 'appVisible') {
        callback(event.data);
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }
  return () => {};
};

/**
 * Notify user that an update is available
 */
const notifyUpdateAvailable = () => {
  // Trigger custom event for the app to handle
  window.dispatchEvent(new CustomEvent('swUpdateAvailable', {
    detail: { message: 'A new version is available. Please refresh.' }
  }));
};

/**
 * Skip waiting and activate new SW immediately
 */
export const skipWaiting = () => {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SKIP_WAITING'
    });
  }
};

export default {
  registerServiceWorker,
  requestPeriodicSync,
  triggerSync,
  setupSWMessageHandler,
  skipWaiting
};
