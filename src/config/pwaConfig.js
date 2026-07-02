/**
 * PWA SUPPORT CONFIGURATION
 * Service worker registration and browser online/offline state only.
 * Operational data sync is Firestore-backed and app-managed.
 */

import React from 'react';

// Service Worker caches static assets only.
export const setupServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) {
    console.log('Service Workers not supported');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    console.log('✓ Service Worker registered:', registration.scope);

    // Handle updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New version available
          console.log('New version available. Will update on next reload.');
          if (window.onNewVersionAvailable) {
            window.onNewVersionAvailable();
          }
        }
      });
    });

    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
  }
};

/**
 * LOCAL STORAGE MANAGER
 * Handles offline data persistence
 */
export class OfflineDataManager {
  constructor() {
    this.prefix = 'agape_offline_';
    this.maxSize = 50 * 1024 * 1024; // 50MB
  }

  /**
   * Save data for offline access
   */
  async saveForOffline(key, data, ttl = null) {
    try {
      const item = {
        data,
        timestamp: Date.now(),
        ttl: ttl ? Date.now() + ttl : null,
      };
      localStorage.setItem(this.prefix + key, JSON.stringify(item));
      return true;
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        this.clearOldest();
        return this.saveForOffline(key, data, ttl);
      }
      console.error('Offline save failed:', e);
      return false;
    }
  }

  /**
   * Retrieve offline data
   */
  getOfflineData(key) {
    try {
      const item = localStorage.getItem(this.prefix + key);
      if (!item) return null;

      const parsed = JSON.parse(item);

      // Check if expired
      if (parsed.ttl && parsed.ttl < Date.now()) {
        localStorage.removeItem(this.prefix + key);
        return null;
      }

      return parsed.data;
    } catch (e) {
      console.error('Offline retrieve failed:', e);
      return null;
    }
  }

  /**
   * Legacy compatibility no-op. Firestore writes and listeners own operational sync.
   */
  queueAction(action, data) {
    window.dispatchEvent(new CustomEvent('agape:realtime-resubscribe', {
      detail: { reason: 'legacy_queue_action', action, at: Date.now() },
    }));
    return true;
  }

  /**
   * Legacy compatibility no-op.
   */
  getPendingActions() {
    return [];
  }

  /**
   * Legacy compatibility no-op.
   */
  markActionSynced(actionId) {
    return Boolean(actionId);
  }

  /**
   * Clear old entries to free space
   */
  clearOldest() {
    try {
      const entries = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(this.prefix)) {
          const item = JSON.parse(localStorage.getItem(key));
          entries.push({
            key,
            timestamp: item.timestamp,
          });
        }
      }

      entries.sort((a, b) => a.timestamp - b.timestamp);

      // Remove oldest 25% of entries
      const toRemove = Math.ceil(entries.length * 0.25);
      for (let i = 0; i < toRemove; i++) {
        localStorage.removeItem(entries[i].key);
      }
    } catch (e) {
      console.error('Clear oldest failed:', e);
    }
  }

  /**
   * Clear all offline data
   */
  clearAll() {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(this.prefix)) {
          keys.push(key);
        }
      }
      keys.forEach(key => localStorage.removeItem(key));
      return true;
    } catch (e) {
      console.error('Clear all failed:', e);
      return false;
    }
  }
}

/**
 * NETWORK STATUS MONITOR
 */
export class NetworkStatusMonitor {
  constructor(callback) {
    this.callback = callback;
    this.online = navigator.onLine;
    this.init();
  }

  init() {
    window.addEventListener('online', () => this.setStatus(true));
    window.addEventListener('offline', () => this.setStatus(false));

  }

  setStatus(online) {
    if (online !== this.online) {
      this.online = online;
      this.callback(online);

      if (online) {
        console.log('Back online - requesting Firestore listener resubscribe');
        this.triggerSync();
      } else {
        console.log('Offline - Firestore persistence will serve cached snapshots until reconnect');
      }
    }
  }

  triggerSync() {
    window.dispatchEvent(new CustomEvent('agape:realtime-resubscribe', {
      detail: { reason: 'network_monitor_online', at: Date.now() },
    }));
  }

  isOnline() {
    return this.online;
  }
}

/**
 * OFFLINE HOOK FOR REACT COMPONENTS
 */
export const useOfflineSupport = () => {
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);
  const offlineManager = React.useRef(new OfflineDataManager());
  const networkMonitor = React.useRef(null);

  React.useEffect(() => {
    networkMonitor.current = new NetworkStatusMonitor(setIsOnline);
    return () => {
      if (networkMonitor.current) {
        networkMonitor.current = null;
      }
    };
  }, []);

  return {
    isOnline,
    offlineManager: offlineManager.current,
    saveForOffline: (key, data) => offlineManager.current.saveForOffline(key, data),
    getOfflineData: (key) => offlineManager.current.getOfflineData(key),
    queueAction: (action, data) => offlineManager.current.queueAction(action, data),
    getPendingActions: () => offlineManager.current.getPendingActions(),
  };
};

/**
 * OFFLINE INDICATOR COMPONENT
 */
export const OfflineIndicator = ({ isOnline, pendingCount = 0 }) => {
  if (isOnline && pendingCount === 0) return null;

  return (
    <div className={`fixed bottom-4 left-4 max-w-sm rounded-lg shadow-lg border p-4 ${
      isOnline
        ? 'bg-amber-50 border-amber-300 text-amber-800'
        : 'bg-red-50 border-red-300 text-red-800'
    }`}>
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-amber-600' : 'bg-red-600'}`} />
        <div className="flex-1">
          <p className="font-bold text-sm">
            {isOnline ? '⚠️ Syncing Offline Changes' : '📡 Offline Mode'}
          </p>
          {pendingCount > 0 && (
            <p className="text-xs mt-1">
              {pendingCount} change{pendingCount !== 1 ? 's' : ''} pending sync
            </p>
          )}
        </div>
        {isOnline && pendingCount > 0 && (
          <div className="animate-spin">⟳</div>
        )}
      </div>
    </div>
  );
};

/**
 * MANIFEST FOR INSTALLABLE PWA
 */
export const getWebManifest = () => ({
  name: 'Agape Care Fleet Management',
  short_name: 'Agape Care',
  description: 'Enterprise NEMT Platform - Real-time trip management, driver coordination, and customer communication',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait-primary',
  background_color: '#ffffff',
  theme_color: '#2563eb',
  icons: [
    {
      src: '/icon-192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/icon-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/icon-maskable.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
  screenshots: [
    {
      src: '/screenshot1.png',
      sizes: '540x720',
      type: 'image/png',
      form_factor: 'narrow',
    },
    {
      src: '/screenshot2.png',
      sizes: '1280x720',
      type: 'image/png',
      form_factor: 'wide',
    },
  ],
  categories: ['transportation', 'business'],
  shortcuts: [
    {
      name: 'View Trips',
      short_name: 'Trips',
      description: 'View and manage trips',
      url: '/trips?mode=standalone',
      icons: [{ src: '/icon-trips.png', sizes: '192x192' }],
    },
  ],
  share_target: {
    action: '/share',
    method: 'POST',
    enctype: 'multipart/form-data',
    params: {
      title: 'title',
      text: 'text',
      url: 'url',
      files: [
        {
          name: 'media',
          accept: ['image/*', 'video/*'],
        },
      ],
    },
  },
});

// Export manifest as JSON string
export const manifestJSON = JSON.stringify(getWebManifest());

export default {
  setupServiceWorker,
  OfflineDataManager,
  NetworkStatusMonitor,
  useOfflineSupport,
  OfflineIndicator,
  getWebManifest,
};
