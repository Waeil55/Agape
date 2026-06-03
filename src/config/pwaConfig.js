/**
 * PWA & OFFLINE SUPPORT CONFIGURATION
 * Service worker, offline sync, local storage, background sync
 */

// Enhanced Service Worker with offline support
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

    // Request periodic sync
    if ('periodicSync' in registration) {
      try {
        await registration.periodicSync.register('sync-trips', {
          minInterval: 24 * 60 * 60 * 1000, // 24 hours
        });
        console.log('✓ Periodic sync registered');
      } catch (e) {
        console.log('Periodic sync not available:', e);
      }
    }

    // Request background sync for failed requests
    if ('sync' in registration) {
      console.log('✓ Background sync available');
    }

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
   * Queue action for sync when online
   */
  queueAction(action, data) {
    try {
      const queue = JSON.parse(localStorage.getItem(this.prefix + 'sync_queue') || '[]');
      queue.push({
        id: `${action}_${Date.now()}`,
        action,
        data,
        timestamp: Date.now(),
        retries: 0,
      });
      localStorage.setItem(this.prefix + 'sync_queue', JSON.stringify(queue));
      return true;
    } catch (e) {
      console.error('Queue action failed:', e);
      return false;
    }
  }

  /**
   * Get pending sync actions
   */
  getPendingActions() {
    try {
      const queue = JSON.parse(localStorage.getItem(this.prefix + 'sync_queue') || '[]');
      return queue;
    } catch (e) {
      return [];
    }
  }

  /**
   * Mark action as synced
   */
  markActionSynced(actionId) {
    try {
      const queue = JSON.parse(localStorage.getItem(this.prefix + 'sync_queue') || '[]');
      const filtered = queue.filter(a => a.id !== actionId);
      localStorage.setItem(this.prefix + 'sync_queue', JSON.stringify(filtered));
      return true;
    } catch (e) {
      console.error('Mark synced failed:', e);
      return false;
    }
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

    // Periodic connectivity check
    setInterval(() => {
      fetch('/ping', { method: 'HEAD', cache: 'no-cache' })
        .then(() => this.setStatus(true))
        .catch(() => this.setStatus(false));
    }, 30000);
  }

  setStatus(online) {
    if (online !== this.online) {
      this.online = online;
      this.callback(online);
      
      if (online) {
        console.log('✓ Back online - syncing offline data');
        this.triggerSync();
      } else {
        console.log('⚠ Offline - using cached data');
      }
    }
  }

  triggerSync() {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then(registration => {
        if (registration.sync) {
          registration.sync.register('offline-sync');
        }
      });
    }
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
    {
      name: 'Chat',
      short_name: 'Chat',
      description: 'Message drivers and customers',
      url: '/chat?mode=standalone',
      icons: [{ src: '/icon-chat.png', sizes: '192x192' }],
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
