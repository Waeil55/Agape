/**
 * Service Worker Registration & Management
 * Handles SW registration and static asset cache updates.
 * Works across all platforms: PWA, iOS, Android, Desktop, Mac
 */

let swRegistration = null;
let updateCheckTimer = null;

/**
 * Register the service worker and set up update listeners
 */
export const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) {
    console.log('Service Workers not supported');
    return null;
  }

  try {
    swRegistration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    
    console.log('Service Worker registered successfully');

    // Listen for updates
    swRegistration.addEventListener('updatefound', () => {
      const newWorker = swRegistration.installing;
      
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New SW ready, notify user
          notifyUpdateAvailable();
        }
      });
    });

    // Check for updates periodically without forcing a page reload.
    if (updateCheckTimer) clearInterval(updateCheckTimer);
    updateCheckTimer = setInterval(() => {
      swRegistration.update();
    }, 5 * 60 * 1000);

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.dispatchEvent(new CustomEvent('swControllerChanged'));
    });

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

export default {
  registerServiceWorker,
  requestPeriodicSync,
  triggerSync,
  setupSWMessageHandler,
  skipWaiting
};
