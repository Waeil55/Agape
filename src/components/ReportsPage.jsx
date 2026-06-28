import React, { useState, useEffect } from 'react';
import DesktopReportsPage from './DesktopReportsPage';
import MobileReportsPage from './MobileReportsPage';

const ReportsPage = (props) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (isMobile) {
    return <MobileReportsPage {...props} />;
  }

  return <DesktopReportsPage {...props} />;
};

export default ReportsPage;
