import React, { useState, useEffect, lazy, Suspense } from 'react';

const DesktopEnterpriseDashboard = lazy(() => import('./DesktopEnterpriseDashboard'));
const MobileEnterpriseDashboard = lazy(() => import('./MobileEnterpriseDashboard'));

const EnterpriseDashboard = (props) => {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const Fallback = () => <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <Suspense fallback={<Fallback />}>
      {isMobile ? <MobileEnterpriseDashboard {...props} /> : <DesktopEnterpriseDashboard {...props} />}
    </Suspense>
  );
};

export default EnterpriseDashboard;
