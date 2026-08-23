import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Archive, ClipboardList, Gauge, PanelTopOpen } from 'lucide-react';
import { MOBILE_MEDIA_QUERY, useMediaQuery } from '../hooks/useMediaQuery';

const DesktopReportsPage = lazy(() => import('./DesktopReportsPage'));
const MobileReportsPage = lazy(() => import('./MobileReportsPage'));
const UnloadedTripsReport = lazy(() => import('./UnloadedTripsReport'));
const ArchivesPage = lazy(() => import('./ArchivesPage'));
const WellTransSyncPage = lazy(() => import('../features/welltrans-sync/components/WellTransSyncPage'));

const ReportsFallback = () => (
  <div className="flex min-h-40 flex-1 items-center justify-center" role="status" aria-label="Loading reports">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
  </div>
);

export const normalizeReportsSection = (section) => {
  if (section === 'archives' || section === 'archived') return 'archive';
  if (section === 'welltrans' || section === 'portal-filler') return 'portal';
  return ['trips', 'unloaded', 'archive', 'portal'].includes(section) ? section : 'trips';
};

const ReportsPage = (props) => {
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);
  const requestedSection = normalizeReportsSection(props.initialSection);
  const [section, setSection] = useState(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('agape_reportsSection') : '';
    return normalizeReportsSection(props.initialSection || stored);
  });
  const canUsePortalCompletion = props.role === 'admin';

  useEffect(() => {
    if (requestedSection === 'portal' && !canUsePortalCompletion) {
      setSection('trips');
      return;
    }
    if (props.initialSection) setSection(requestedSection);
  }, [canUsePortalCompletion, props.initialSection, requestedSection]);

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem('agape_reportsSection', section);
    props.onSectionChange?.(section);
  }, [props.onSectionChange, section]);

  const sections = useMemo(() => [
    { id: 'trips', label: 'All trips', description: 'Review, export, and reconcile trip records', icon: ClipboardList, count: props.trips?.length || 0 },
    { id: 'unloaded', label: 'Unloaded mileage', description: 'Track non-passenger vehicle mileage', icon: Gauge },
    { id: 'archive', label: 'Archived trips', description: 'Historical records, edits, and recovery', icon: Archive, count: props.trashedTrips?.length || 0 },
    ...(canUsePortalCompletion ? [{ id: 'portal', label: 'Portal Completion', description: 'Validate and fill completed trips into the broker portal', icon: PanelTopOpen }] : []),
  ], [canUsePortalCompletion, props.trashedTrips?.length, props.trips?.length]);

  const renderSection = () => {
    if (section === 'unloaded') {
      return <UnloadedTripsReport trips={props.trips} drivers={props.drivers} onUpdateTrip={props.onUpdateTrip} />;
    }
    if (section === 'archive') {
      return (
        <ArchivesPage
          trashedTrips={props.trashedTrips}
          restoreTrip={props.restoreTrip}
          drivers={props.drivers}
          role={props.role}
          updateTrashedTrip={props.updateTrashedTrip}
        />
      );
    }
    if (section === 'portal' && canUsePortalCompletion) {
      return (
        <WellTransSyncPage
          trips={props.trips}
          drivers={props.drivers}
          vehicles={props.vehicles}
          role={props.role}
          onUpdateTrip={props.onUpdateTrip}
        />
      );
    }
    return isMobile ? <MobileReportsPage {...props} /> : <DesktopReportsPage {...props} />;
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Reports workspace">
      <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2.5 sm:px-4" role="tablist" aria-label="Reports and records sections">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {sections.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSection(item.id)}
                className={`group flex min-h-12 shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors sm:min-w-[180px] ${active ? 'border-blue-600 bg-blue-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50'}`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-white group-hover:text-blue-700'}`}>
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-xs font-bold">
                    {item.label}
                    {Number.isFinite(item.count) && <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'}`}>{item.count}</span>}
                  </span>
                  <span className={`hidden max-w-[180px] truncate text-[10px] font-semibold sm:block ${active ? 'text-blue-100' : 'text-slate-500'}`}>{item.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col" role="tabpanel">
        <Suspense fallback={<ReportsFallback />}>
          {renderSection()}
        </Suspense>
      </div>
    </section>
  );
};

export default React.memo(ReportsPage);
