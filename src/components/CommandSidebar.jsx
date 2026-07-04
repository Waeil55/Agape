import React, { useState } from 'react';
import { Users, Route, Truck, ArrowRight, Target, MapPin, Compass } from 'lucide-react';
import { formatMovementState, formatTelemetryDuration } from '../utils/driverTelemetry';

function formatAge(iso) {
  if (!iso) return 'No live ping';
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return 'No live ping';
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function getTripPhase(trip) {
  if (!trip) return { label: 'No active trip', color: 'slate', destination: null };
  if (['Assigned', 'In Mission', 'In Progress', 'Navigating Pickup', 'En Route'].includes(trip.status)) {
    return { label: 'Going to pickup', color: 'blue', destination: trip.pickup };
  }
  if (['At Pickup', 'In Transit', 'Navigating Dropoff', 'At Dropoff', 'Arrived'].includes(trip.status)) {
    return { label: 'Going to dropoff', color: 'emerald', destination: trip.dropoff };
  }
  return { label: trip.status || 'Active', color: 'amber', destination: trip.pickup || trip.dropoff };
}

const ACTIVE_STATUSES = new Set(['Assigned', 'In Mission', 'In Progress', 'Navigating Pickup', 'En Route', 'At Pickup', 'In Transit', 'Navigating Dropoff', 'At Dropoff', 'Arrived']);

export default function CommandSidebar({
  driverSummaries,
  todaysTrips,
  unassignedTrips,
  selectedDriverId,
  setSelectedDriverId,
  setShowDetailModal,
  hudSearch
}) {
  const [leftTab, setLeftTab] = useState('drivers');

  const activeTrips = todaysTrips.filter(t => ACTIVE_STATUSES.has(t.status));
  const completedTrips = todaysTrips.filter(t => t.status === 'Completed');

  return (
    <div className="w-full max-h-[46dvh] shrink-0 border-b border-slate-200/60 bg-slate-50 flex flex-col z-20 shadow-sm relative font-outfit md:w-[400px] md:max-h-none md:border-b-0 md:border-r md:shadow-2xl xl:w-[450px]">
      
      {/* TABS HEADER */}
      <div className="bg-white px-3 pt-3 pb-3 border-b border-slate-200 shrink-0 z-10 md:px-4 md:pt-5 md:pb-4">
        <h2 className="mb-3 text-lg font-bold tracking-tight text-slate-900 md:mb-4 md:text-xl">Command <span className="text-blue-600">Center</span></h2>
        
        {/* Segmented Control */}
        <div className="flex bg-slate-100 p-1 rounded-xl">
          {[
            { id: 'drivers', icon: Users, label: 'Drivers' },
            { id: 'trips', icon: Route, label: 'Trips' },
            { id: 'vehicles', icon: Truck, label: 'Vehicles' }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = leftTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setLeftTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold transition-all duration-300 rounded-lg sm:gap-2 sm:text-xs ${
                  isActive 
                    ? 'bg-white text-blue-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                }`}
              >
                <Icon size={14} /> {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* CONTENT REGION */}
      <div className="flex-1 overflow-y-auto overscroll-contain bg-slate-50/50 p-2 space-y-2 custom-scrollbar md:p-3 md:space-y-3">
        
        {/* === DRIVERS TAB === */}
        {leftTab === 'drivers' && (
          <div className="flex flex-col gap-3">
            {driverSummaries.length === 0 && <p className="p-6 text-center text-sm font-medium text-slate-500">No drivers available.</p>}
            {driverSummaries
              .filter(s => !hudSearch || s.driver.name?.toLowerCase().includes(hudSearch.toLowerCase()))
              .map(summary => {
                const { driver, currentTrip, upcoming, completed, movementState, fresh } = summary;
                const isSelected = selectedDriverId === driver.id;
                
                return (
                  <div 
                    key={driver.id} 
                    className={`bg-white rounded-2xl p-4 transition-all duration-300 cursor-pointer border ${
                      isSelected 
                        ? 'border-blue-300 shadow-md ring-4 ring-blue-50' 
                        : 'border-slate-200 hover:border-blue-200 hover:shadow-md hover:-translate-y-0.5'
                    }`} 
                    onClick={() => setSelectedDriverId(driver.id)}
                  >
                     <div className="flex items-start justify-between">
                       <div className="flex gap-3 items-center">
                          <span className={`w-3 h-3 shrink-0 rounded-full border-2 border-white shadow-sm ${
                            fresh && movementState === 'moving' ? 'bg-emerald-500' : fresh ? 'bg-amber-400' : 'bg-slate-400'
                          }`} />
                          <div>
                            <h4 className="text-base font-bold text-slate-900 leading-tight">{driver.name || 'Unnamed'}</h4>
                            <p className="text-xs font-semibold text-slate-500 mt-0.5">
                              {driver.vehicle || 'No vehicle'} <span className="text-slate-300 mx-1">•</span> {formatMovementState(movementState)}
                            </p>
                          </div>
                       </div>
                       {isSelected && (
                         <button onClick={(e) => { e.stopPropagation(); setShowDetailModal(true); }} className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors border border-blue-200/60">
                           <Target size={14} /> Details
                         </button>
                       )}
                     </div>
                     
                     <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2.5">
                       {currentTrip ? (
                         <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                           <div className="flex justify-between items-center mb-1.5">
                              <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Current Mission</p>
                              <span className="text-xs font-bold text-slate-500">{currentTrip.time || ''}</span>
                           </div>
                           <p className="text-sm font-bold text-slate-800 mb-0.5">{currentTrip.patient || 'Unknown Client'}</p>
                           <p className="text-xs font-medium text-slate-600 truncate flex items-center gap-1.5">
                             <ArrowRight size={14} className="shrink-0 text-blue-400"/>
                             {getTripPhase(currentTrip).destination}
                           </p>
                         </div>
                       ) : (
                         <p className="text-xs font-bold text-slate-500 italic py-1 px-1">No active mission</p>
                       )}
                       
                        {(upcoming.length > 0 || completed.length > 0) && (
                          <div className="flex items-center gap-2 pt-1">
                            {upcoming.length > 0 && <span className="text-xs text-slate-600 font-bold bg-slate-100 border border-slate-200 px-2 py-1 rounded-md">{upcoming.length} upcoming</span>}
                            {completed.length > 0 && <span className="text-xs text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-md flex items-center gap-1"><span className="text-emerald-500">✓</span> {completed.length} completed</span>}
                         </div>
                       )}
                     </div>
                  </div>
                )
              })
            }
          </div>
        )}

        {/* === TRIPS TAB === */}
        {leftTab === 'trips' && (
          <div className="space-y-5">
            {unassignedTrips.length > 0 && (
              <div className="bg-white rounded-2xl border border-rose-200 overflow-hidden shadow-sm">
                <div className="bg-rose-50 border-b border-rose-100 px-4 py-3 flex justify-between items-center">
                  <h3 className="text-xs font-bold text-rose-700 uppercase tracking-widest">Needs Assignment</h3>
                  <span className="text-xs font-bold bg-rose-600 text-white px-2 py-0.5 rounded-full shadow-sm">{unassignedTrips.length}</span>
                </div>
                <div className="flex flex-col divide-y divide-slate-100">
                  {unassignedTrips.map(t => (
                    <div key={t.id} className="p-4 hover:bg-slate-50 transition-colors cursor-pointer">
                      <p className="text-xs font-bold text-rose-500 mb-1">{t.time || 'No time'}</p>
                      <p className="text-sm font-bold text-slate-900">{t.patient || 'Unknown'}</p>
                      <p className="text-xs font-medium text-slate-500 truncate mt-1 flex items-center gap-1">
                        <MapPin size={12} className="text-slate-500"/> {t.pickup}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTrips.length > 0 && (
              <div className="bg-white rounded-2xl border border-blue-200 overflow-hidden shadow-sm">
                <div className="bg-blue-50 border-b border-blue-100 px-4 py-3 flex justify-between items-center">
                  <h3 className="text-xs font-bold text-blue-700 uppercase tracking-widest">Active Now</h3>
                  <span className="text-xs font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full shadow-sm">{activeTrips.length}</span>
                </div>
                <div className="flex flex-col divide-y divide-slate-100">
                  {activeTrips.map(t => (
                    <div key={t.id} className="p-4 hover:bg-slate-50 transition-colors cursor-pointer">
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-sm font-bold text-slate-900">{t.patient || 'Unknown'}</p>
                        <span className="text-xs font-bold text-blue-700 bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-md">{t.status}</span>
                      </div>
                      <p className="text-xs font-medium text-slate-500 truncate flex items-center gap-1">
                        <ArrowRight size={12} className="text-slate-500"/> {t.dropoff}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {completedTrips.length > 0 && (
              <div className="bg-white rounded-2xl border border-emerald-200 overflow-hidden shadow-sm">
                <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-3 flex justify-between items-center">
                  <h3 className="text-xs font-bold text-emerald-700 uppercase tracking-widest">Completed</h3>
                  <span className="text-xs font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full shadow-sm">{completedTrips.length}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* === VEHICLES TAB === */}
        {leftTab === 'vehicles' && (
          <div className="flex flex-col gap-3">
            {driverSummaries.map(summary => (
              <div key={summary.driver.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-all flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5"><Truck size={14} className="text-blue-500"/> {summary.driver.vehicle || 'Unknown Vehicle'}</h4>
                  <p className="text-xs font-semibold text-slate-500 mt-1">Operated by {summary.driver.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-slate-800 tabular-nums leading-none">{summary.driver?.speedMph ?? summary.driver?.telemetry?.speedMph ?? 0} <span className="text-xs text-slate-500 font-bold ml-0.5">mph</span></p>
                  <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">{formatAge(summary.lastPing)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
