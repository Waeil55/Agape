import React, { useState, useMemo } from 'react';
import { 
  ChevronLeft, ChevronRight, Search, Clock, CheckCircle2, 
  XCircle, AlertTriangle, RefreshCw, User, ChevronDown, 
  Edit2, PhoneCall, Check, ChevronUp, RotateCcw, Home, Map, MessageCircle, Settings
} from 'lucide-react';
import { localCalendarYmd } from '../utils/tripDate';

const DetailRow = ({ label, value, valueColor = "text-slate-900" }) => (
  <div className="grid grid-cols-[130px_1fr] gap-4 py-1.5 items-start">
    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
      {label}
    </span>
    <span className={\	ext-[13px] font-bold \\}>
      {value}
    </span>
  </div>
);

const ReportsPage = ({ trips = [], drivers = [], onUpdateTrip, role }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTripId, setExpandedTripId] = useState(null);
  const [dateStr, setDateStr] = useState(localCalendarYmd());

  const filteredTrips = useMemo(() => {
    let filtered = trips.filter(t => t.date === dateStr);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        (t.patient && t.patient.toLowerCase().includes(q)) || 
        (t.bookingId && t.bookingId.toLowerCase().includes(q)) ||
        (t.pickup && t.pickup.toLowerCase().includes(q)) ||
        (t.dropoff && t.dropoff.toLowerCase().includes(q))
      );
    }
    return filtered.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  }, [trips, dateStr, searchQuery]);

  const toggleExpand = (id) => {
    setExpandedTripId(prev => prev === id ? null : id);
  };

  const getDriverRecord = (driverId) => drivers.find(d => d.id === driverId);

  const formatClock = (value) => value ? String(value) : '—';
  
  const calcMiles = (pickupOdo, dropoffOdo, storedDist) => {
    if (storedDist) return Number(storedDist).toFixed(1);
    if (pickupOdo && dropoffOdo) {
      const diff = Number(dropoffOdo) - Number(pickupOdo);
      if (diff > 0) return diff.toFixed(1);
    }
    return '—';
  };

  return (
    <div className="min-h-screen bg-slate-100 flex justify-center font-sans">
      <div className="w-full max-w-3xl bg-white min-h-screen relative shadow-2xl overflow-hidden flex flex-col mx-auto">
        
        {/* TOP APP BAR (Local to Reports) */}
        <div className="px-4 py-3 flex items-center justify-between bg-white border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 font-bold border border-blue-100 shrink-0">
              <span className="text-xs">REP</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-sm text-slate-900">Reports & History</h1>
                <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></div>
              </div>
              <p className="text-xs text-slate-500 font-medium">Operations Center</p>
            </div>
          </div>
        </div>

        {/* DATE & FILTERS BAR */}
        <div className="px-4 py-3 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-1">
            <button className="p-1 border border-slate-200 rounded text-slate-600 hover:bg-slate-50">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="px-3 py-1 text-sm font-bold text-slate-800 border border-slate-200 rounded hover:bg-slate-50">
              {new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              <span className="text-slate-400 font-normal text-xs ml-1">({filteredTrips.length})</span>
            </button>
            <button className="p-1 border border-slate-200 rounded text-slate-300">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1 hidden sm:flex">
            <button className="p-1.5 bg-[#2b4c7e] text-white rounded-full"><Clock className="w-4 h-4" /></button>
            <button className="p-1.5 border border-slate-200 text-slate-500 rounded-full"><CheckCircle2 className="w-4 h-4" /></button>
            <button className="p-1.5 border border-slate-200 text-slate-500 rounded-full"><XCircle className="w-4 h-4" /></button>
            <button className="p-1.5 border border-slate-200 text-slate-500 rounded-full"><AlertTriangle className="w-4 h-4" /></button>
          </div>
        </div>

        {/* SEARCH BAR */}
        <div className="px-4 pb-3 bg-white shrink-0 border-b border-slate-100">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search by patient, booking ID, address..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2b4c7e]/20 focus:border-[#2b4c7e]"
            />
          </div>
        </div>

        {/* MAIN SCROLLABLE CONTENT */}
        <div className="flex-1 overflow-y-auto bg-slate-50 pb-24">
          
          {/* DAILY SUMMARY BAR */}
          <div className="bg-white px-4 py-3 mb-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-600">
              <span className="bg-slate-100 px-2 py-1 rounded-md border border-slate-200 text-slate-800">{filteredTrips.length} trips</span>
              <span className="bg-slate-100 px-2 py-1 rounded-md border border-slate-200 text-slate-800">{filteredTrips.filter(t => t.reviewed).length}/{filteredTrips.length} reviewed</span>
            </div>
            <button className="flex items-center justify-center gap-1.5 bg-[#e8f7f0] text-emerald-700 border border-emerald-200 rounded-lg px-4 py-2 text-sm font-bold shadow-sm hover:bg-[#d1f0e1] transition-colors">
              <Check className="w-4 h-4" />
              Mark Day Reviewed
            </button>
          </div>

          <div className="px-4 space-y-4">
            {filteredTrips.map(trip => {
              const driver = getDriverRecord(trip.driverId);
              const isExpanded = expandedTripId === trip.id;

              return (
                <div key={trip.id} className="rounded-xl shadow-sm overflow-hidden border border-slate-200">
                  {/* Card Header */}
                  <div 
                    className="bg-[#2b4c7e] px-4 py-3 flex items-center justify-between cursor-pointer select-none"
                    onClick={() => toggleExpand(trip.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-white shrink-0">
                        <User className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-white font-extrabold text-sm uppercase tracking-wide truncate">{trip.patient || 'UNKNOWN'}</h2>
                        <p className="text-blue-200 text-xs font-semibold truncate">#{trip.bookingId || trip.id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className={\	ext-[10px] font-extrabold px-2 py-1 rounded uppercase tracking-wider \\}>
                        {trip.status || 'Scheduled'}
                      </span>
                      {isExpanded ? <ChevronUp className="w-5 h-5 text-blue-200" /> : <ChevronDown className="w-5 h-5 text-blue-200" />}
                    </div>
                  </div>

                  {/* Card Body */}
                  {isExpanded && (
                    <div className="bg-[#eaf0f6] p-4">
                      <DetailRow label="TRIP ID" value={trip.bookingId || trip.id} valueColor="text-blue-700" />
                      <DetailRow label="DATE" value={trip.date} />
                      <DetailRow label="DRIVER" value={driver ? driver.name : (trip.driverName || '—')} />
                      <DetailRow label="VEHICLE" value={trip.completedVehicle || (driver ? driver.vehicle : '—')} />
                      <DetailRow label="SCHEDULED" value={formatClock(trip.time)} valueColor="text-[#2b4c7e]" />
                      
                      <div className="my-3 border-t border-slate-300/50"></div>
                      
                      <DetailRow label="PICKUP ADDRESS" value={trip.pickup} valueColor="text-emerald-700" />
                      <DetailRow label="PICKUP ARRIVAL" value={formatClock(trip.arrivalTime)} valueColor="text-emerald-700" />
                      <DetailRow label="START ODOMETER" value={trip.pickupOdometer || '—'} valueColor="text-emerald-700" />
                      
                      <div className="my-3 border-t border-slate-300/50"></div>
                      
                      <DetailRow label="DROPOFF ADDRESS" value={trip.dropoff} valueColor="text-rose-700" />
                      <DetailRow label="DROPOFF ARRIVAL" value={formatClock(trip.arrivalDropoffTime)} valueColor="text-rose-700" />
                      <DetailRow label="END ODOMETER" value={trip.dropoffOdometer || '—'} valueColor="text-rose-700" />
                      
                      <div className="my-3 border-t border-slate-300/50"></div>
                      
                      <DetailRow label="DISTANCE" value={\\ mi\} />
                      <DetailRow label="TRAVEL TIME" value={trip.travelTime ? \\m\ : '—'} />
                      <DetailRow label="SIGNATURE" value={trip.paperSignatureConfirmed ? 'Yes' : 'No'} />
                      <DetailRow label="REVIEW STATUS" value={trip.reviewed ? 'Reviewed' : 'Pending'} valueColor={trip.reviewed ? 'text-emerald-600' : 'text-amber-600'} />
                      
                      <div className="mt-4 pt-4 border-t border-slate-300/50 flex gap-2">
                        <button className="flex-1 bg-white border border-slate-300 text-slate-700 rounded-lg py-2 text-xs font-bold hover:bg-slate-50 transition-colors flex justify-center items-center gap-1.5">
                          <Edit2 size={14} /> Edit Data
                        </button>
                        <button 
                          className={\lex-1 rounded-lg py-2 text-xs font-bold transition-colors flex justify-center items-center gap-1.5 \\}
                          onClick={() => onUpdateTrip(trip.id, { reviewed: !trip.reviewed })}
                        >
                          <CheckCircle2 size={14} /> {trip.reviewed ? 'Un-Review' : 'Review'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {filteredTrips.length === 0 && (
              <div className="text-center py-10 text-slate-400 text-sm font-medium">
                No trips found for this date/search.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
