/**
 * Service Worker Registration & Management
 * Handles SW registration, updates, and sync triggers
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
    // Check if already registered by index.html inline script
    if (swRegistration) return swRegistration;
    const existingReg = await navigator.serviceWorker.getRegistration('/');
    if (existingReg) {
      swRegistration = existingReg;
      return swRegistration;
    }
    
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
 * Request periodic background sync (PWA)
 */
export const requestPeriodicSync = async () => {
  if (!('serviceWorker' in navigator) || !('PeriodicSyncManager' in window)) {
    console.log('Periodic Sync not supported');
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
    console.log('Periodic sync error:', error);
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
