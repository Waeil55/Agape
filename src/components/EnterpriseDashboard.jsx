import React, { useState, useEffect } from 'react';
import DesktopEnterpriseDashboard from './DesktopEnterpriseDashboard';
import MobileEnterpriseDashboard from './MobileEnterpriseDashboard';

const EnterpriseDashboard = (props) => {
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
    return <MobileEnterpriseDashboard {...props} />;
  }

  return <DesktopEnterpriseDashboard {...props} />;
};

export default EnterpriseDashboard;
