import React, { lazy, Suspense } from 'react';
import { MOBILE_MEDIA_QUERY, useMediaQuery } from '../hooks/useMediaQuery';

const DesktopEnterpriseDashboard = lazy(() => import('./DesktopEnterpriseDashboard'));
const MobileEnterpriseDashboard = lazy(() => import('./MobileEnterpriseDashboard'));

const DashboardFallback = () => (
  <div className="flex h-full items-center justify-center" role="status" aria-label="Loading workspace">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
  </div>
);

const EnterpriseDashboard = (props) => {
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);

  return (
    <Suspense fallback={<DashboardFallback />}>
      {isMobile ? <MobileEnterpriseDashboard {...props} /> : <DesktopEnterpriseDashboard {...props} />}
    </Suspense>
  );
};

export default React.memo(EnterpriseDashboard);
