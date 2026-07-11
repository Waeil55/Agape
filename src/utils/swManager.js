/**
 * Service Worker Registration & Management
 * Handles SW registration and static asset cache updates.
 * Works across all platforms: PWA, iOS, Android, Desktop, Mac
 */

let swRegistration = null;
let updateCheckTimer = null;
let controllerChangeHandler = null;
let updateFoundHandler = null;
let stateChangeHandler = null;

/**
 * Register the service worker and set up update listeners
 */
export const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) {
    return null;
  }

  try {
    // Clean up previous registration listeners
    if (updateFoundHandler && swRegistration) {
      swRegistration.removeEventListener('updatefound', updateFoundHandler);
    }
    if (stateChangeHandler) {
      stateChangeHandler = null;
    }

    swRegistration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    // Listen for updates
    updateFoundHandler = () => {
      const newWorker = swRegistration.installing;
      if (!newWorker) return;
      
      // Remove previous statechange handler if any
      if (stateChangeHandler) {
        newWorker.removeEventListener('statechange', stateChangeHandler);
      }

      stateChangeHandler = () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          notifyUpdateAvailable();
        }
      };
      newWorker.addEventListener('statechange', stateChangeHandler);
    };
    swRegistration.addEventListener('updatefound', updateFoundHandler);

    // Check for updates periodically without forcing a page reload.
    if (updateCheckTimer) clearInterval(updateCheckTimer);
    updateCheckTimer = setInterval(() => {
      swRegistration.update();
    }, 5 * 60 * 1000);

    if (controllerChangeHandler && 'serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('controllerchange', controllerChangeHandler);
    }
    controllerChangeHandler = () => {
      window.dispatchEvent(new CustomEvent('swControllerChanged'));
    };
    navigator.serviceWorker.addEventListener('controllerchange', controllerChangeHandler);

    return swRegistration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return null;
  }
};

/**
 * Firestore owns realtime data sync. Service Worker sync is intentionally disabled.
 */
export const requestPeriodicSync = async () => {
  return false;
};

/**
 * Compatibility shim: request a Firestore listener resubscribe, never SW data sync.
 */
export const triggerSync = async () => {
  window.dispatchEvent(new CustomEvent('agape:realtime-resubscribe', {
    detail: { reason: 'legacy_trigger_sync', at: Date.now() }
  }));
};

/**
 * Handle message from service worker
 */
export const setupSWMessageHandler = (callback) => {
  if ('serviceWorker' in navigator) {
    const handler = (event) => {
      if (event.data?.type === 'STATIC_CACHE_UPDATED' || event.data?.type === 'appVisible') {
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

export const cleanupServiceWorker = () => {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
  if (controllerChangeHandler && 'serviceWorker' in navigator) {
    navigator.serviceWorker.removeEventListener('controllerchange', controllerChangeHandler);
    controllerChangeHandler = null;
  }
  if (updateFoundHandler && swRegistration) {
    swRegistration.removeEventListener('updatefound', updateFoundHandler);
    updateFoundHandler = null;
  }
  stateChangeHandler = null;
};

export default {
  registerServiceWorker,
  requestPeriodicSync,
  triggerSync,
  setupSWMessageHandler,
  skipWaiting
};
