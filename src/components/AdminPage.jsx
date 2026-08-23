import React, { lazy, Suspense } from 'react';
import { MOBILE_MEDIA_QUERY, useMediaQuery } from '../hooks/useMediaQuery';

const DesktopAdminPage = lazy(() => import('./DesktopAdminPage'));
const MobileAdminPage = lazy(() => import('./MobileAdminPage'));

const AdminFallback = () => (
  <div className="flex h-32 items-center justify-center" role="status" aria-label="Loading administration">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
  </div>
);

const AdminPage = (props) => {
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);

  return (
    <Suspense fallback={<AdminFallback />}>
      {isMobile ? <MobileAdminPage {...props} /> : <DesktopAdminPage {...props} />}
    </Suspense>
  );
};

export default React.memo(AdminPage);
