import React, { useState, useEffect, lazy, Suspense } from 'react';

const DesktopAdminPage = lazy(() => import('./DesktopAdminPage'));
const MobileAdminPage = lazy(() => import('./MobileAdminPage'));

const AdminPage = (props) => {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const Fallback = () => <div className="flex items-center justify-center h-32"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <Suspense fallback={<Fallback />}>
      {isMobile ? <MobileAdminPage {...props} /> : <DesktopAdminPage {...props} />}
    </Suspense>
  );
};

export default AdminPage;
