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
    <div className="w-[450px] shrink-0 border-r border-white/10 bg-slate-950 flex flex-col z-20 shadow-[10px_0_30px_rgba(0,0,0,0.5)]">
      {/* TABS */}
      <div className="flex px-4 pt-4 pb-0 gap-1 border-b border-white/[0.06] shrink-0 bg-slate-950">
        {[
          { id: 'drivers', icon: Users, label: 'Drivers' },
          { id: 'trips', icon: Route, label: 'Trips' },
          { id: 'vehicles', icon: Truck, label: 'Vehicles' }
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setLeftTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 ${
                leftTab === tab.id 
                  ? 'text-white border-blue-500 bg-white/[0.04]' 
                  : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-white/[0.02]'
              }`}
            >
              <Icon size={14} /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto overscroll-contain bg-slate-950 custom-scrollbar">
        {leftTab === 'drivers' && (
          <div className="flex flex-col">
            {driverSummaries.length === 0 && <p className="p-6 text-center text-xs text-slate-500">No drivers available.</p>}
            {driverSummaries
              .filter(s => !hudSearch || s.driver.name?.toLowerCase().includes(hudSearch.toLowerCase()))
              .map(summary => {
                const { driver, currentTrip, upcoming, completed, movementState, fresh } = summary;
                const isSelected = selectedDriverId === driver.id;
                return (
                  <div 
                    key={driver.id} 
                    className={`p-3 border-b border-white/[0.04] transition-colors cursor-pointer ${isSelected ? 'bg-blue-500/10 border-l-2 border-l-blue-500' : 'hover:bg-white/[0.02] bg-slate-950 border-l-2 border-l-transparent'}`} 
                    onClick={() => setSelectedDriverId(driver.id)}
                  >
                     <div className="flex items-start justify-between">
                       <div className="flex gap-3 items-center">
                          <span className={`w-2.5 h-2.5 shrink-0 rounded-full ${fresh && movementState === 'moving' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : fresh ? 'bg-amber-400' : 'bg-slate-600'}`} />
                          <div>
                            <h4 className="text-sm font-black text-white">{driver.name || 'Unnamed'}</h4>
                            <p className="text-[11px] text-slate-500">
                              {driver.vehicle || 'No vehicle'} • {formatMovementState(movementState)}
                            </p>
                          </div>
                       </div>
                       {isSelected && (
                         <button onClick={(e) => { e.stopPropagation(); setShowDetailModal(true); }} className="px-2 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded flex items-center gap-1 transition-colors">
                           <Target size={12} /> Details
                         </button>
                       )}
                     </div>
                     
                     <div className="mt-3 ml-5 pl-3 border-l-2 border-white/[0.05] flex flex-col gap-2">
                       {currentTrip ? (
                         <div className="bg-slate-900 rounded-lg p-2.5 border border-white/5 shadow-inner">
                           <div className="flex justify-between items-center mb-1">
                              <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Current Mission</p>
                              <span className="text-[10px] text-slate-500">{currentTrip.time || ''}</span>
                           </div>
                           <p className="text-xs font-bold text-slate-200 mb-1">{currentTrip.patient || 'Unknown Client'}</p>
                           <p className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                             <ArrowRight size={12} className="shrink-0 text-blue-400"/>
                             {getTripPhase(currentTrip).destination}
                           </p>
                         </div>
                       ) : (
                         <p className="text-[11px] font-medium text-slate-500 italic py-1">No active mission</p>
                       )}
                       
                       {(upcoming.length > 0 || completed > 0) && (
                         <div className="flex items-center gap-3 pt-1">
                           {upcoming.length > 0 && <span className="text-[10px] text-slate-400 font-medium bg-white/[0.04] px-2 py-1 rounded">{upcoming.length} upcoming</span>}
                           {completed > 0 && <span className="text-[10px] text-emerald-400 font-bold bg-emerald-400/10 px-2 py-1 rounded">&#10003; {completed} completed</span>}
                         </div>
                       )}
                     </div>
                  </div>
                )
              })
            }
          </div>
        )}

        {leftTab === 'trips' && (
          <div className="p-3 space-y-4">
            {unassignedTrips.length > 0 && (
              <div className="bg-rose-950/20 border border-rose-500/20 rounded-xl overflow-hidden">
                <div className="bg-rose-500/10 px-3 py-2 flex justify-between items-center">
                  <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider">Needs Assignment</h3>
                  <span className="text-[10px] font-bold bg-rose-500 text-white px-1.5 rounded">{unassignedTrips.length}</span>
                </div>
                <div className="flex flex-col divide-y divide-white/[0.04]">
                  {unassignedTrips.map(t => (
                    <div key={t.id} className="p-3">
                      <p className="text-[11px] text-rose-300 font-bold mb-1">{t.time || 'No time'}</p>
                      <p className="text-[12px] font-black text-white">{t.patient || 'Unknown'}</p>
                      <p className="text-[11px] text-slate-400 truncate mt-1">Pickup: {t.pickup}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTrips.length > 0 && (
              <div className="bg-blue-950/20 border border-blue-500/20 rounded-xl overflow-hidden">
                <div className="bg-blue-500/10 px-3 py-2 flex justify-between items-center">
                  <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider">Active Now</h3>
                  <span className="text-[10px] font-bold bg-blue-500 text-white px-1.5 rounded">{activeTrips.length}</span>
                </div>
                <div className="flex flex-col divide-y divide-white/[0.04]">
                  {activeTrips.map(t => (
                    <div key={t.id} className="p-3">
                      <div className="flex justify-between items-start">
                        <p className="text-[12px] font-black text-white">{t.patient || 'Unknown'}</p>
                        <span className="text-[10px] text-blue-300 font-bold bg-blue-500/20 px-1.5 rounded">{t.status}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1"><MapPin size={10}/> {t.dropoff}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {completedTrips.length > 0 && (
              <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl overflow-hidden">
                <div className="bg-emerald-500/10 px-3 py-2 flex justify-between items-center">
                  <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Completed</h3>
                  <span className="text-[10px] font-bold bg-emerald-500 text-white px-1.5 rounded">{completedTrips.length}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {leftTab === 'vehicles' && (
          <div className="flex flex-col gap-1 p-2">
            {driverSummaries.map(summary => (
              <div key={summary.driver.id} className="p-3 bg-slate-900 border border-white/[0.04] rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-1"><Truck size={12} className="text-slate-400"/> {summary.driver.vehicle || 'Unknown Vehicle'}</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">Operated by {summary.driver.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-white tabular-nums">{summary.driver?.speedMph ?? summary.driver?.telemetry?.speedMph ?? 0} <span className="text-[10px] text-slate-500 font-normal">mph</span></p>
                  <p className="text-[10px] text-slate-400">{formatAge(summary.lastPing)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
