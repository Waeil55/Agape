import React, { useState, useEffect } from 'react';
import DesktopAdminPage from './DesktopAdminPage';
import MobileAdminPage from './MobileAdminPage';

const AdminPage = (props) => {
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
    return <MobileAdminPage {...props} />;
  }

  return <DesktopAdminPage {...props} />;
};

export default AdminPage;
