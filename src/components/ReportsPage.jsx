import React, { lazy, Suspense, useState } from 'react';
import { MOBILE_MEDIA_QUERY, useMediaQuery } from '../hooks/useMediaQuery';

const DesktopReportsPage = lazy(() => import('./DesktopReportsPage'));
const MobileReportsPage = lazy(() => import('./MobileReportsPage'));
const UnloadedTripsReport = lazy(() => import('./UnloadedTripsReport'));

const ReportsFallback = () => (
  <div className="flex min-h-40 flex-1 items-center justify-center" role="status" aria-label="Loading reports">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
  </div>
);

const ReportsPage = (props) => {
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);
  const [section, setSection] = useState('trips');

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Reports workspace">
      <div className="flex shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-3 py-2" role="tablist" aria-label="Report sections">
        <button type="button" role="tab" aria-selected={section === 'trips'} onClick={() => setSection('trips')} className={`min-h-11 rounded-xl px-4 text-xs font-bold transition-colors ${section === 'trips' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Trip reports</button>
        <button type="button" role="tab" aria-selected={section === 'unloaded'} onClick={() => setSection('unloaded')} className={`min-h-11 rounded-xl px-4 text-xs font-bold transition-colors ${section === 'unloaded' ? 'bg-amber-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Unloaded mileage</button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col" role="tabpanel">
        <Suspense fallback={<ReportsFallback />}>
          {section === 'unloaded'
            ? <UnloadedTripsReport trips={props.trips} drivers={props.drivers} onUpdateTrip={props.onUpdateTrip} />
            : isMobile ? <MobileReportsPage {...props} /> : <DesktopReportsPage {...props} />}
        </Suspense>
      </div>
    </section>
  );
};

export default React.memo(ReportsPage);
