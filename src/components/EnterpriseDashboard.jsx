import React, { lazy, Suspense, Component } from 'react';
import { MOBILE_MEDIA_QUERY, useMediaQuery } from '../hooks/useMediaQuery';

const loadDesktop = () => import('./DesktopEnterpriseDashboard');
const loadMobile = () => import('./MobileEnterpriseDashboard');
const DesktopEnterpriseDashboard = lazy(loadDesktop);
const MobileEnterpriseDashboard = lazy(loadMobile);

// Preload both shells eagerly so a viewport switch never suspends a
// not-yet-loaded chunk during a synchronous media-query update (React #306).
Promise.all([loadDesktop(), loadMobile()]).catch(() => {
  /* prefetch failures are swallowed; lazy() will retry on demand */
});

const DashboardFallback = () => (
  <div className="flex h-full items-center justify-center" role="status" aria-label="Loading workspace">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
  </div>
);

class DashboardErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    // recoverable static fallback instead of a blank screen
  }

  render() {
    if (this.state.hasError) {
      return <DashboardFallback />;
    }
    return this.props.children;
  }
}

const EnterpriseDashboard = (props) => {
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);

  return (
    <DashboardErrorBoundary>
      <Suspense fallback={<DashboardFallback />}>
        {isMobile ? <MobileEnterpriseDashboard {...props} /> : <DesktopEnterpriseDashboard {...props} />}
      </Suspense>
    </DashboardErrorBoundary>
  );
};

export default React.memo(EnterpriseDashboard);
