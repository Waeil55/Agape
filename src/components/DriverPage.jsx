import React, { useState, useEffect, useRef, useCallback } from 'react';
import { tripMatchesTodayOrTomorrow } from '../utils/tripDate';
import { EmailAuthProvider, reauthenticateWithCredential, signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { 
  Truck, MapPin, Phone, MessageCircle, CheckCircle2, XCircle, 
  AlertCircle, Navigation, Gauge, Clock, User, ChevronRight, Play, Check,
  ChevronUp, ChevronDown, Edit2, ListChecks, Sparkles, Target, RotateCcw, Lock,
  Home, History, MessageSquare, Settings, LogOut, ChevronLeft, Calendar,
  Wifi, WifiOff, Filter, ArrowRight, Send, Smile, Bell, Circle, Search,
  Star, Activity, Repeat, Zap, X, Route, PhoneCall, Radio, CircleDot
} from 'lucide-react';

const cleanPhone = (p) => (p || '').replace(/[^0-9]/g, '');
const FACILITY_KEYS = ['hospital','center','clinic','academy','school','treatment','health','dental','pharmacy','office','suite','care','medical','therapy','rehab','wellness','surgery','diagnostic','lab','institute'];

const clientPhone = (trip) => {
  if (!trip) return '';
  const pickupFac = FACILITY_KEYS.some(k => (trip.pickup || '').toLowerCase().includes(k));
  const dropFac = FACILITY_KEYS.some(k => (trip.dropoff || '').toLowerCase().includes(k));
  if (pickupFac && !dropFac) return trip.dropoffPhone || trip.pickupPhone || '';
  if (!pickupFac && dropFac) return trip.pickupPhone || trip.dropoffPhone || '';
  return trip.pickupPhone || trip.dropoffPhone || '';
};

const to12hr = (time) => {
  if (!time || time === 'Will Call' || time === 'WC') return time || 'Will Call';
  const m = String(time).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (m && m[3]) return time;
  const parts = String(time).match(/(\d{1,2}):(\d{2})/);
  if (!parts) return time;
  let h = parseInt(parts[1], 10);
  const min = parts[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${min} ${ampm}`;
};

const DriverPage = ({ currentUser, role, drivers, trips, activeMission, onUpdateMission, onUpdateTrip, onDriverStatusUpdate, onCompleteTrip, onOpenSettings, appSettings, phoneNumbers }) => {
  const me = drivers.find(d => (d.email || '').toLowerCase() === (currentUser || '').toLowerCase());
  const [activeNav, setActiveNav] = useState('trips');
  const [historyFilter, setHistoryFilter] = useState('all');

  if (!me) {
    return (
      <div className="flex-1 bg-slate-50 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="w-20 h-20 bg-white rounded-[2rem] shadow-lg flex items-center justify-center mx-auto mb-6">
            <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Loading profile...</h2>
          <p className="text-sm text-slate-400 mt-1">Connecting to your driver account</p>
        </div>
      </div>
    );
  }

  const myTrips = trips
    .filter(t => {
      const isAssignedToMe = (t.driverId === me?.id || ((t.driverEmail || '').toLowerCase() === (me?.email || '').toLowerCase()));
      const inWindow = tripMatchesTodayOrTomorrow(t.date);
      const isActiveStatus = !['Completed', 'Cancelled', 'No Show'].includes(t.status);
      return (isAssignedToMe && inWindow) || (isAssignedToMe && isActiveStatus);
    })
    .sort((a, b) => {
      const tm = (t) => { if (!t || !t.time) return 1440; const m = String(t.time).match(/(\d{1,2}):(\d{2})/); if (!m) return 1440; let h = parseInt(m[1],10); let mn = parseInt(m[2],10); const p = String(t.time).match(/(AM|PM)/i); if (p) { if (p[1].toUpperCase()==='PM'&&h!==12) h+=12; if (p[1].toUpperCase()==='AM'&&h===12) h=0; } return h*60+mn; };
      return tm(a.time) - tm(b.time);
    });

  const completedTrips = trips.filter(t => (t.driverId === me?.id || (t.driverEmail||'').toLowerCase() === (me?.email||'').toLowerCase()) && t.status === 'Completed');
  const noShowTrips = trips.filter(t => (t.driverId === me?.id || (t.driverEmail||'').toLowerCase() === (me?.email||'').toLowerCase()) && t.status === 'No Show');
  const cancelledTrips = trips.filter(t => (t.driverId === me?.id || (t.driverEmail||'').toLowerCase() === (me?.email||'').toLowerCase()) && t.status === 'Cancelled');
  const allHistory = [...completedTrips, ...noShowTrips, ...cancelledTrips].sort((a,b) => { const da = a.completedAt || a.date || ''; const db = b.completedAt || b.date || ''; return db.localeCompare(da); });
  
  const activeTrips = myTrips.filter(t => !['Completed', 'Cancelled', 'No Show'].includes(t.status));
  const isClockedIn = me?.clockedIn || false;
  const isOnline = isClockedIn;
  const getTodayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

  const filteredHistory = historyFilter === 'all' ? allHistory : historyFilter === 'completed' ? completedTrips : historyFilter === 'noshow' ? noShowTrips : historyFilter === 'cancelled' ? cancelledTrips : allHistory;
  const handleStatusToggle = () => onDriverStatusUpdate(me?.id, !isClockedIn);

  const navItems = [
    { id: 'trips', label: 'Trips', icon: Home },
    { id: 'history', label: 'History', icon: Clock },
    { id: 'chat', label: 'Chat', icon: MessageCircle },
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex-1 flex flex-col bg-[#f5f5f7]">
      {/* ===== TRIPS PAGE ===== */}
      {activeNav === 'trips' && (
        <div className="flex-1 overflow-y-auto pb-28 px-3 pt-3 space-y-3">

          {/* Header */}
          <div className="flex items-center justify-between px-1 py-2">
            <div className="flex items-center gap-2">
              <div className="w-11 h-11 rounded-2xl bg-white shadow-sm border border-slate-100/50 flex items-center justify-center">
                <Truck size={18} className="text-blue-600" />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-900">Agape Care</h1>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  <span className="text-[10px] font-medium text-slate-400">{isOnline ? 'Online' : 'Offline'}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 ml-1">
                {phoneNumbers?.routing && (
                  <a href={`tel:${cleanPhone(phoneNumbers.routing)}`} className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm active:scale-90 transition-all" title="Call Routing">
                    <Phone size={12} className="text-white" />
                  </a>
                )}
                {phoneNumbers?.dispatcher && (
                  <a href={`tel:${cleanPhone(phoneNumbers.dispatcher)}`} className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-sm active:scale-90 transition-all" title="Call Dispatch">
                    <Phone size={12} className="text-white" />
                  </a>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="w-9 h-9 rounded-2xl bg-white shadow-sm border border-slate-100/50 flex items-center justify-center">
                <Bell size={16} className="text-slate-400" />
              </button>
              <button onClick={handleStatusToggle} className={`h-9 px-3.5 rounded-xl font-bold text-[9px] uppercase tracking-wider transition-all active:scale-95 shadow-sm border ${isOnline ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-500 border-slate-200'}`}>
                {isOnline ? 'Online' : 'Offline'}
              </button>
            </div>
          </div>

          {/* Quick Actions 2x2 Grid */}
          <div className="grid grid-cols-2 gap-2">
            <button className="flex items-center gap-2.5 px-3.5 py-3 bg-white rounded-2xl shadow-sm border border-slate-100/50 active:scale-[0.97] transition-all hover:border-indigo-200">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
                <Sparkles size={14} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-slate-900">AI Optimize</p>
                <p className="text-[8px] text-slate-400">Smart routing</p>
              </div>
            </button>
            <button onClick={handleStatusToggle} className="flex items-center gap-2.5 px-3.5 py-3 bg-white rounded-2xl shadow-sm border border-slate-100/50 active:scale-[0.97] transition-all hover:border-rose-200">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shadow-sm ${isOnline ? 'bg-gradient-to-br from-rose-500 to-rose-600' : 'bg-gradient-to-br from-emerald-500 to-emerald-600'}`}>
                <X size={14} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-slate-900">{isOnline ? 'Offline' : 'Online'}</p>
                <p className="text-[8px] text-slate-400">Toggle status</p>
              </div>
            </button>
          </div>

          {/* Stats Glass Card */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600/90 to-indigo-700/90 shadow-lg shadow-blue-600/10 backdrop-blur-xl">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.1),transparent_60%)]" />
            <div className="relative px-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-white/70 text-[10px] font-bold uppercase tracking-[0.15em]">{getTodayStr()}</p>
                  <p className="text-white/50 text-[9px] mt-0.5">{activeTrips.length} active • {myTrips.length} total</p>
                </div>
                <div className="px-3 py-1.5 bg-white/10 backdrop-blur-md rounded-xl border border-white/10">
                  <span className="text-white text-[11px] font-bold">{me?.name}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Total', value: myTrips.length, color: 'from-blue-300/30 to-blue-400/10' },
                  { label: 'Done', value: completedTrips.length, color: 'from-emerald-300/30 to-emerald-400/10' },
                  { label: 'Remaining', value: Math.max(0, myTrips.length - completedTrips.length - noShowTrips.length - cancelledTrips.length), color: 'from-amber-300/30 to-amber-400/10' },
                ].map(stat => (
                  <div key={stat.label} className={`bg-gradient-to-br ${stat.color} rounded-xl px-2.5 py-2.5 border border-white/10`}>
                    <p className="text-lg font-black text-white">{stat.value}</p>
                    <p className="text-[8px] text-white/60 uppercase font-bold tracking-wider mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Manifest Header */}
          <div className="flex items-center justify-between px-1 pt-1">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.12em]">Today & Tomorrow</h3>
            <span className="text-[10px] text-slate-300 font-medium">{activeTrips.length} trip{activeTrips.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Trip Cards */}
          {activeTrips.length === 0 ? (
            <div className="bg-white/80 backdrop-blur-md rounded-3xl border border-slate-100/50 p-10 text-center shadow-sm mt-2">
              <div className="w-20 h-20 bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-[2rem] flex items-center justify-center mx-auto mb-5 shadow-inner">
                <CheckCircle2 size={36} className="text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">All Clear</h3>
              <p className="text-sm text-slate-400 mt-1.5 max-w-[200px] mx-auto leading-relaxed">No trips assigned. Your manifest is up to date.</p>
            </div>
          ) : (
            <div className="space-y-3 pb-2">
              {activeTrips.map((trip) => {
                const isActive = !['Assigned', 'Unassigned'].includes(trip.status);
                return (
                  <div key={trip.id} className={`bg-white rounded-3xl shadow-sm border transition-all overflow-hidden ${isActive ? 'border-blue-200 shadow-md shadow-blue-600/5' : 'border-slate-100'}`}>
                    {/* Card Header */}
                    <div className="px-4 pt-4 pb-1">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-base text-slate-900 truncate">{trip.patient}</h3>
                            {trip.bookingId && <span className="text-[8px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded-md shrink-0">{trip.bookingId}</span>}
                          </div>
                          <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-[28px] font-black text-blue-600 tracking-tight leading-none">{to12hr(trip.time)}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider ${isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{trip.status}</span>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <a href={`tel:${cleanPhone(clientPhone(trip))}`} className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 active:scale-90 transition-all"><Phone size={15} /></a>
                          <a href={`sms:${cleanPhone(clientPhone(trip))}`} className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 active:scale-90 transition-all"><MessageCircle size={15} /></a>
                        </div>
                      </div>
                    </div>

                    {/* Route Info */}
                    <div className="px-4 py-2">
                      <div className="relative pl-6">
                        <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-gradient-to-b from-emerald-400 via-blue-200 to-rose-400 rounded-full" />
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-[18px] h-[18px] rounded-full bg-emerald-500 border-[3px] border-emerald-100 shrink-0 mt-0.5 shadow-sm" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-700 leading-tight">{trip.pickup}</p>
                            {trip.pickupPhone && <p className="text-[9px] text-slate-400 mt-0.5">{trip.pickupPhone}</p>}
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="w-[18px] h-[18px] rounded-full bg-rose-500 border-[3px] border-rose-100 shrink-0 mt-0.5 shadow-sm" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-700 leading-tight">{trip.dropoff}</p>
                            {trip.dropoffPhone && <p className="text-[9px] text-slate-400 mt-0.5">{trip.dropoffPhone}</p>}
                          </div>
                        </div>
                      </div>
                      {trip.notes && (
                        <div className="mt-2 bg-amber-50/80 rounded-xl px-3 py-2 border border-amber-100/50">
                          <p className="text-[10px] text-amber-700 font-medium leading-relaxed">{trip.notes}</p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="px-4 pb-4 flex gap-2">
                      <button className="flex-1 h-11 bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-2xl font-bold text-xs shadow-sm shadow-blue-600/20 active:scale-[0.97] transition-all hover:shadow-md hover:shadow-blue-600/30 flex items-center justify-center gap-2">
                        <Play size={13} /> Start Trip
                      </button>
                      <button className="h-11 px-4 bg-amber-50 text-amber-700 rounded-2xl font-bold text-[10px] uppercase tracking-wider active:scale-95 transition-all hover:bg-amber-100 border border-amber-100/50">No Show</button>
                      <button className="h-11 px-4 bg-rose-50 text-rose-700 rounded-2xl font-bold text-[10px] uppercase tracking-wider active:scale-95 transition-all hover:bg-rose-100 border border-rose-100/50">Cancel</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== HISTORY PAGE ===== */}
      {activeNav === 'history' && (
        <div className="flex-1 overflow-y-auto pb-28 px-3 pt-3">
          <div className="px-1 pt-2 pb-4">
            <h2 className="text-xl font-bold text-slate-900">History</h2>
            <p className="text-xs text-slate-400 mt-0.5">Review past trips and activity</p>
          </div>

          <div className="flex gap-1.5 mb-5 overflow-x-auto no-scrollbar px-1">
            {[
              { id: 'all', label: 'All' },
              { id: 'completed', label: 'Completed' },
              { id: 'noshow', label: 'No Show' },
              { id: 'cancelled', label: 'Cancelled' },
            ].map(f => (
              <button key={f.id} onClick={() => setHistoryFilter(f.id)}
                className={`px-4 py-2 rounded-xl font-bold text-xs transition-all active:scale-95 whitespace-nowrap ${historyFilter === f.id ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-100 shadow-sm hover:bg-slate-50'}`}>
                {f.label}
              </button>
            ))}
          </div>

          <div className="space-y-2.5 px-1">
            {filteredHistory.length === 0 ? (
              <div className="bg-white/80 backdrop-blur-md rounded-3xl border border-slate-100/50 p-12 text-center shadow-sm">
                <div className="w-16 h-16 bg-gradient-to-br from-slate-50 to-slate-100 rounded-[2rem] flex items-center justify-center mx-auto mb-4 shadow-inner">
                  <Clock size={28} className="text-slate-300" />
                </div>
                <h3 className="text-base font-bold text-slate-700">No history</h3>
                <p className="text-sm text-slate-400 mt-1">Your completed trips will appear here.</p>
              </div>
            ) : (
              filteredHistory.map(trip => {
                const styles = {
                  'Completed': { bg: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
                  'No Show': { bg: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
                  'Cancelled': { bg: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
                };
                const s = styles[trip.status] || styles['Completed'];
                return (
                  <div key={trip.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 active:scale-[0.99] transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${s.dot}`} />
                          <h4 className="font-bold text-sm text-slate-900 truncate">{trip.patient}</h4>
                          {trip.bookingId && <span className="text-[8px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded">{trip.bookingId}</span>}
                        </div>
                        <p className="text-sm font-bold text-blue-600 mt-1">{to12hr(trip.time)}</p>
                        <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-slate-500">
                          <ArrowRight size={10} className="text-emerald-500 shrink-0" />
                          <span className="truncate">{trip.pickup}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                          <ArrowRight size={10} className="text-rose-500 shrink-0" />
                          <span className="truncate">{trip.dropoff}</span>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-lg text-[8px] font-bold uppercase tracking-wider shrink-0 ${s.bg}`}>
                        {trip.status}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ===== CHAT PAGE ===== */}
      {activeNav === 'chat' && (
        <div className="flex-1 flex flex-col">
          <div className="px-4 pt-4 pb-3 bg-white/80 backdrop-blur-md border-b border-slate-100/50">
            <h2 className="text-xl font-bold text-slate-900">Messages</h2>
            <p className="text-xs text-slate-400 mt-0.5">Chat with dispatch</p>
          </div>
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-slate-50 to-slate-100 rounded-[2rem] flex items-center justify-center mx-auto mb-5 shadow-inner">
                <MessageCircle size={36} className="text-slate-300" />
              </div>
              <h3 className="text-base font-bold text-slate-700">No Messages</h3>
              <p className="text-sm text-slate-400 mt-1 max-w-[200px] mx-auto leading-relaxed">Your conversations with dispatch will show here.</p>
            </div>
          </div>
        </div>
      )}

      {/* ===== PROFILE PAGE ===== */}
      {activeNav === 'profile' && (
        <div className="flex-1 overflow-y-auto pb-28 px-3 pt-3 space-y-3">
          {/* Profile Header */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600/90 to-indigo-700/90 shadow-lg shadow-blue-600/10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,255,0.1),transparent_60%)]" />
            <div className="relative px-5 py-5">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-2xl font-black text-white shadow-inner border border-white/10">
                  {me?.name?.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold text-white truncate">{me?.name}</h2>
                  <p className="text-sm text-white/70 truncate">{me?.email}</p>
                  <p className="text-xs text-white/50 mt-0.5">{me?.vehicle || 'No vehicle'} • {me?.currentZone || '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <button onClick={handleStatusToggle} className={`px-4 h-9 rounded-xl font-bold text-xs uppercase tracking-wider transition-all active:scale-95 shadow-sm border ${isOnline ? 'bg-rose-500 text-white border-rose-500' : 'bg-emerald-500 text-white border-emerald-500'}`}>
                  {isOnline ? 'Go Offline' : 'Go Online'}
                </button>
                <div className="flex items-center gap-1.5 px-3 h-9 bg-white/10 backdrop-blur-md rounded-xl border border-white/10">
                  <Gauge size={12} className="text-white/70" />
                  <span className="text-xs font-medium text-white">{me?.odometer?.toLocaleString() || 0} mi</span>
                </div>
              </div>
            </div>
          </div>

          {/* Odometer Card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.12em] mb-2">Odometer</p>
            <p className="text-2xl font-bold text-slate-900">{me?.odometer?.toLocaleString() || 0} <span className="text-sm font-medium text-slate-400">mi</span></p>
            <p className="text-[10px] text-slate-400 mt-1">Next service at {me?.nextOilChange?.toLocaleString() || '5,000'} mi</p>
          </div>

          {/* Vehicle Info */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.12em] mb-3">Vehicle Info</p>
            <div className="space-y-2.5 text-sm">
              {[
                ['Vehicle', me?.vehicle || 'N/A'],
                ['Zone', me?.currentZone || 'N/A'],
                ['Status', isOnline ? 'Online' : 'Offline'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-slate-400 text-xs">{label}</span>
                  <span className={`font-semibold text-xs ${value === 'Online' ? 'text-emerald-600' : value === 'Offline' ? 'text-slate-400' : 'text-slate-800'}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <button onClick={() => onOpenSettings?.()} className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50/50 transition border-b border-slate-100/50">
              <div className="flex items-center gap-3">
                <Settings size={17} className="text-slate-400" />
                <span className="font-medium text-sm text-slate-800">Settings</span>
              </div>
              <ChevronRight size={15} className="text-slate-300" />
            </button>
            <button onClick={() => signOut(auth)} className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-rose-50/50 transition">
              <div className="flex items-center gap-3">
                <LogOut size={17} className="text-rose-400" />
                <span className="font-medium text-sm text-rose-600">Sign Out</span>
              </div>
              <ChevronRight size={15} className="text-slate-300" />
            </button>
          </div>
        </div>
      )}

      {/* ===== SETTINGS PAGE ===== */}
      {activeNav === 'settings' && (
        <div className="flex-1 overflow-y-auto pb-28 px-3 pt-3">
          <div className="px-1 pt-2 pb-4">
            <h2 className="text-xl font-bold text-slate-900">Settings</h2>
            <p className="text-xs text-slate-400 mt-0.5">Account and app preferences</p>
          </div>
          <div className="space-y-2.5 px-1">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <button onClick={() => onOpenSettings?.()} className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50/50 transition border-b border-slate-100/50">
                <div className="flex items-center gap-3">
                  <Settings size={17} className="text-slate-400" />
                  <span className="font-medium text-sm text-slate-800">App Settings</span>
                </div>
                <ChevronRight size={15} className="text-slate-300" />
              </button>
              <button className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50/50 transition border-b border-slate-100/50">
                <div className="flex items-center gap-3">
                  <Bell size={17} className="text-slate-400" />
                  <span className="font-medium text-sm text-slate-800">Notifications</span>
                </div>
                <ChevronRight size={15} className="text-slate-300" />
              </button>
              <button className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50/50 transition border-b border-slate-100/50">
                <div className="flex items-center gap-3">
                  <Phone size={17} className="text-slate-400" />
                  <span className="font-medium text-sm text-slate-800">Contact Support</span>
                </div>
                <ChevronRight size={15} className="text-slate-300" />
              </button>
              <button onClick={() => signOut(auth)} className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-rose-50/50 transition">
                <div className="flex items-center gap-3">
                  <LogOut size={17} className="text-rose-400" />
                  <span className="font-medium text-sm text-rose-600">Sign Out</span>
                </div>
                <ChevronRight size={15} className="text-slate-300" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== BOTTOM NAVIGATION ===== */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-center" style={{paddingBottom: 'env(safe-area-inset-bottom, 0px)'}}>
        <div className="mx-3 mb-2 w-full max-w-md bg-white/80 backdrop-blur-2xl rounded-2xl shadow-xl shadow-black/5 border border-white/50 px-2 py-1">
          <div className="flex items-center justify-around">
            {navItems.map((item, idx) => {
              const Icon = item.icon;
              const isActive = activeNav === item.id;
              return (
                <button key={item.id} onClick={() => setActiveNav(item.id)}
                  className={`flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-2xl transition-all relative min-w-[56px] ${isActive ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${isActive ? 'bg-blue-50' : ''}`}>
                    <Icon size={20} strokeWidth={isActive ? 2.5 : 1.5} className="transition-all" />
                  </div>
                  <span className={`text-[8px] font-bold uppercase tracking-wider transition-all ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
};

export default DriverPage;