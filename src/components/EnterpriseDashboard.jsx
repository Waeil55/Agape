import React, { Suspense, Component } from 'react';
import { MOBILE_MEDIA_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { lazyWithRetry, WorkspaceErrorState } from '../utils/lazyWithRetry';

const loadDesktop = () => import('./DesktopEnterpriseDashboard');
const loadMobile = () => import('./MobileEnterpriseDashboard');
const DesktopEnterpriseDashboard = lazyWithRetry(loadDesktop);
const MobileEnterpriseDashboard = lazyWithRetry(loadMobile);

// Preload both shells eagerly so a viewport switch never suspends a
// not-yet-loaded chunk during a synchronous media-query update (React #306).
Promise.all([loadDesktop(), loadMobile()]).catch(() => {
  /* prefetch failures are swallowed; lazyWithRetry() will retry on demand */
});

const DashboardFallback = () => (
  <div className="flex h-full items-center justify-center" role="status" aria-label="Loading workspace">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
  </div>
);

// A render error in a dashboard shell must never be hidden behind a spinner.
// Surface the reason and let the operator recover without losing their session.
class DashboardErrorBoundary extends Component {
  state = { hasError: false, message: '' };

  static getDerivedStateFromError(error) {
    return { hasError: true, message: String((error && error.message) || error || 'Unexpected error') };
  }

  componentDidCatch(error, errorInfo) {
    console.error('EnterpriseDashboard ErrorBoundary:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      return <WorkspaceErrorState title="Unable to open the workspace" message={this.state.message} onRetry={this.handleRetry} />;
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
