/**
 * PERFORMANCE MONITORING & MOBILE OPTIMIZATION
 * Metrics collection, error tracking, mobile optimization
 */

import React from 'react';

/**
 * Performance Monitor
 */
export class PerformanceMonitor {
  constructor() {
    this.metrics = {
      pageLoadTime: 0,
      firstContentfulPaint: 0,
      largestContentfulPaint: 0,
      cumulativeLayoutShift: 0,
      firstInputDelay: 0,
      timeToInteractive: 0,
    };
    this.errors = [];
    this.slowRequests = [];
  }

  /**
   * Initialize monitoring
   */
  init() {
    this.collectWebVitals();
    this.monitorErrors();
    this.monitorNetworkRequests();
    this.monitorMemory();
  }

  /**
   * Collect Web Vitals
   */
  collectWebVitals() {
    // Navigation Timing API
    if (window.performance && window.performance.timing) {
      const t = window.performance.timing;
      this.metrics.pageLoadTime = t.loadEventEnd - t.navigationStart;
    }

    // Paint Timing API
    if (window.performance && window.performance.getEntriesByType) {
      const paintEntries = window.performance.getEntriesByType('paint');
      paintEntries.forEach(entry => {
        if (entry.name === 'first-contentful-paint') {
          this.metrics.firstContentfulPaint = entry.startTime;
        }
      });

      // Largest Contentful Paint
      const lcpEntries = window.performance.getEntriesByType('largest-contentful-paint');
      if (lcpEntries.length > 0) {
        this.metrics.largestContentfulPaint = lcpEntries[lcpEntries.length - 1].renderTime || lcpEntries[lcpEntries.length - 1].loadTime;
      }

      // Cumulative Layout Shift
      const clsEntries = window.performance.getEntriesByType('layout-shift');
      let cls = 0;
      clsEntries.forEach(entry => {
        if (!entry.hadRecentInput) {
          cls += entry.value;
        }
      });
      this.metrics.cumulativeLayoutShift = cls;
    }

    // First Input Delay
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach(entry => {
            if (entry.processingDuration > 0) {
              this.metrics.firstInputDelay = Math.max(this.metrics.firstInputDelay, entry.processingDuration);
            }
          });
        });
        observer.observe({ entryTypes: ['first-input'] });
      } catch (e) {
        console.log('FID measurement not available');
      }
    }
  }

  /**
   * Monitor errors
   */
  monitorErrors() {
    window.addEventListener('error', (event) => {
      this.errors.push({
        type: 'error',
        message: event.message,
        source: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        timestamp: new Date().toISOString(),
      });
      this.reportError(event);
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.errors.push({
        type: 'unhandledRejection',
        reason: event.reason,
        timestamp: new Date().toISOString(),
      });
      this.reportError(event);
    });
  }

  /**
   * Monitor network requests
   */
  monitorNetworkRequests() {
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach(entry => {
            const duration = entry.duration;
            if (duration > 3000) { // Log requests slower than 3s
              this.slowRequests.push({
                name: entry.name,
                duration,
                transferSize: entry.transferSize,
                decodedBodySize: entry.decodedBodySize,
                timestamp: new Date().toISOString(),
              });
            }
          });
        });
        observer.observe({ entryTypes: ['resource'] });
      } catch (e) {
        console.log('Resource monitoring not available');
      }
    }
  }

  /**
   * Monitor memory usage
   */
  monitorMemory() {
    if ('memory' in performance) {
      setInterval(() => {
        const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = performance.memory;
        const usage = (usedJSHeapSize / jsHeapSizeLimit) * 100;

        if (usage > 90) {
          console.warn('⚠️ High memory usage:', usage.toFixed(2) + '%');
          // Could trigger garbage collection or alert
        }
      }, 5000);
    }
  }

  /**
   * Report error to backend
   */
  reportError(event) {
    // In production, send to error tracking service (Sentry, LogRocket, etc.)
    if (this.errors.length > 100) {
      this.errors = this.errors.slice(-100); // Keep last 100
    }
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary() {
    return {
      ...this.metrics,
      errorCount: this.errors.length,
      slowRequestCount: this.slowRequests.length,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Send metrics to analytics
   */
  async sendMetrics() {
    try {
      const metrics = this.getMetricsSummary();
      // In production, send to analytics backend
      console.log('📊 Sending metrics:', metrics);
    } catch (e) {
      console.error('Failed to send metrics:', e);
    }
  }
}

/**
 * MOBILE OPTIMIZATION UTILITIES
 */

/**
 * Detect device type
 */
export const getDeviceType = () => {
  const ua = navigator.userAgent;
  if (/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua.toLowerCase())) {
    return 'mobile';
  }
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    return 'tablet';
  }
  return 'desktop';
};

/**
 * Detect orientation
 */
export const useOrientation = () => {
  const [orientation, setOrientation] = React.useState(
    window.innerHeight > window.innerWidth ? 'portrait' : 'landscape'
  );

  React.useEffect(() => {
    const handleOrientationChange = () => {
      setOrientation(
        window.innerHeight > window.innerWidth ? 'portrait' : 'landscape'
      );
    };

    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleOrientationChange);

    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', handleOrientationChange);
    };
  }, []);

  return orientation;
};

/**
 * Responsive image loader
 */
export const ResponsiveImage = ({ src, alt, srcSet, className = '' }) => {
  const deviceType = getDeviceType();
  const quality = deviceType === 'mobile' ? 'low' : 'high';

  return (
    <img
      src={src}
      alt={alt}
      srcSet={srcSet}
      className={className}
      loading="lazy"
      decoding="async"
    />
  );
};

/**
 * Touch-optimized button wrapper
 */
export const TouchButton = ({ children, onClick, className = '', ...props }) => {
  const [isPressed, setIsPressed] = React.useState(false);

  return (
    <button
      onClick={onClick}
      onTouchStart={() => setIsPressed(true)}
      onTouchEnd={() => setIsPressed(false)}
      className={`transition-transform ${isPressed ? 'scale-95' : 'scale-100'} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

/**
 * Lazy loading wrapper
 */
export const LazyLoadComponent = ({ component: Component, fallback = null, ...props }) => {
  const [isLoaded, setIsLoaded] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return isLoaded ? <Component {...props} /> : fallback;
};

/**
 * Image optimization
 */
export const optimizeImage = (url, options = {}) => {
  const {
    width = 300,
    quality = 75,
    format = 'webp',
  } = options;

  // In production, use image CDN like Cloudinary, Imgix, etc.
  // Example: return `https://image-cdn.example.com/${url}?w=${width}&q=${quality}&f=${format}`;
  
  return url; // Fallback to original
};

/**
 * Network information detector
 */
export const useNetworkInfo = () => {
  const [networkInfo, setNetworkInfo] = React.useState({
    effectiveType: '4g',
    downlink: Infinity,
    rtt: 0,
    saveData: false,
  });

  React.useEffect(() => {
    const connection =
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection;

    if (connection) {
      setNetworkInfo({
        effectiveType: connection.effectiveType,
        downlink: connection.downlink,
        rtt: connection.rtt,
        saveData: connection.saveData,
      });

      connection.addEventListener('change', () => {
        setNetworkInfo({
          effectiveType: connection.effectiveType,
          downlink: connection.downlink,
          rtt: connection.rtt,
          saveData: connection.saveData,
        });
      });
    }
  }, []);

  return networkInfo;
};

/**
 * Viewport observer for infinite scroll
 */
export const useInfiniteScroll = (callback) => {
  const ref = React.useRef(null);

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          callback();
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, [callback]);

  return ref;
};

/**
 * Mobile-safe modal with viewport adjustment
 */
export const useMobileViewport = () => {
  const [viewport, setViewport] = React.useState({
    width: window.innerWidth,
    height: window.innerHeight,
    isMobile: getDeviceType() === 'mobile',
    orientation: useOrientation(),
  });

  React.useEffect(() => {
    const handleResize = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
        isMobile: getDeviceType() === 'mobile',
        orientation: window.innerHeight > window.innerWidth ? 'portrait' : 'landscape',
      });
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return viewport;
};

// Initialize on app load
export const initializePerformanceMonitoring = () => {
  const monitor = new PerformanceMonitor();
  monitor.init();
  
  // Send metrics periodically
  setInterval(() => monitor.sendMetrics(), 60000);
  
  return monitor;
};

export default {
  PerformanceMonitor,
  getDeviceType,
  useOrientation,
  useNetworkInfo,
  useInfiniteScroll,
  useMobileViewport,
  initializePerformanceMonitoring,
};
