import React, { useState, useEffect } from 'react';
import DesktopReportsPage from './DesktopReportsPage';
import MobileReportsPage from './MobileReportsPage';
import UnloadedTripsReport from './UnloadedTripsReport';

const ReportsPage = (props) => {
  const [isMobile, setIsMobile] = useState(false);
  const [section, setSection] = useState('trips');

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-3 py-2">
        <button type="button" onClick={() => setSection('trips')} className={`min-h-[36px] rounded-lg px-3 text-xs font-bold ${section === 'trips' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Trip reports</button>
        <button type="button" onClick={() => setSection('unloaded')} className={`min-h-[36px] rounded-lg px-3 text-xs font-bold ${section === 'unloaded' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Unloaded mileage</button>
      </div>
      {section === 'unloaded'
        ? <UnloadedTripsReport trips={props.trips} drivers={props.drivers} onUpdateTrip={props.onUpdateTrip} />
        : isMobile ? <MobileReportsPage {...props} /> : <DesktopReportsPage {...props} />}
    </div>
  );
};

export default ReportsPage;
