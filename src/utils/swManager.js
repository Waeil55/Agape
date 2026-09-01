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
let stateChangeWorker = null;
let onlineUpdateHandler = null;
let visibilityUpdateHandler = null;
let updateInFlight = null;

const checkForServiceWorkerUpdate = async () => {
  if (!swRegistration) return null;
  if (updateInFlight) return updateInFlight;

  updateInFlight = swRegistration.update()
    .catch(() => null)
    .finally(() => {
      updateInFlight = null;
    });
  return updateInFlight;
};

const monitorInstallingWorker = (worker) => {
  if (!worker) return;
  if (stateChangeWorker && stateChangeHandler) {
    stateChangeWorker.removeEventListener('statechange', stateChangeHandler);
  }
  stateChangeWorker = worker;
  stateChangeHandler = () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      notifyUpdateAvailable();
    }
  };
  worker.addEventListener('statechange', stateChangeHandler);
};

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
      updateViaCache: 'none',
    });

    // Attach update listeners before checking so a fast installation cannot be
    // missed between register() and update().
    updateFoundHandler = () => {
      monitorInstallingWorker(swRegistration?.installing);
    };
    swRegistration.addEventListener('updatefound', updateFoundHandler);
    monitorInstallingWorker(swRegistration.installing);
    if (swRegistration.waiting && navigator.serviceWorker.controller) {
      notifyUpdateAvailable();
    }
    await checkForServiceWorkerUpdate();

    // Retry checks when connectivity or visibility returns. Every check is
    // caught so a transient fetch failure never becomes an unhandled rejection.
    if (updateCheckTimer) clearInterval(updateCheckTimer);
    updateCheckTimer = setInterval(() => {
      void checkForServiceWorkerUpdate();
    }, 5 * 60 * 1000);

    if (onlineUpdateHandler) window.removeEventListener('online', onlineUpdateHandler);
    onlineUpdateHandler = () => { void checkForServiceWorkerUpdate(); };
    window.addEventListener('online', onlineUpdateHandler);

    if (visibilityUpdateHandler) document.removeEventListener('visibilitychange', visibilityUpdateHandler);
    visibilityUpdateHandler = () => {
      if (document.visibilityState === 'visible') void checkForServiceWorkerUpdate();
    };
    document.addEventListener('visibilitychange', visibilityUpdateHandler);

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
  if (stateChangeWorker && stateChangeHandler) {
    stateChangeWorker.removeEventListener('statechange', stateChangeHandler);
  }
  stateChangeWorker = null;
  stateChangeHandler = null;
  if (onlineUpdateHandler) {
    window.removeEventListener('online', onlineUpdateHandler);
    onlineUpdateHandler = null;
  }
  if (visibilityUpdateHandler) {
    document.removeEventListener('visibilitychange', visibilityUpdateHandler);
    visibilityUpdateHandler = null;
  }
  updateInFlight = null;
};

export default {
  registerServiceWorker,
  requestPeriodicSync,
  triggerSync,
  setupSWMessageHandler,
  skipWaiting
};
