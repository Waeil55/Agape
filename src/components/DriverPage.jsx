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
  Star, Activity, Repeat, Zap, X
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
      <div className="flex-1 bg-slate-50 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 bg-blue-100 rounded-[2rem] flex items-center justify-center mb-6 animate-pulse">
          <Truck size={40} className="text-blue-600" />
        </div>
        <h2 className="text-xl font-black text-slate-900">Synchronizing Profile...</h2>
        <p className="text-sm text-slate-500 mt-2 max-w-xs mx-auto">Connecting to your driver profile...</p>
        <div className="mt-8 flex gap-2">
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.3s]" />
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" />
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

  return (
    <div className="flex-1 flex flex-col bg-slate-50" style={{paddingBottom: 'env(safe-area-inset-bottom, 0px)'}}>
      {/* ===== TRIPS PAGE ===== */}
      {activeNav === 'trips' && (
        <div className="flex-1 overflow-y-auto pb-24 px-4 pt-4 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
                <span className="text-white font-black text-sm">{me?.name?.charAt(0)}</span>
              </div>
              <div>
                <p className="font-bold text-sm text-slate-900">{me?.name}</p>
                <p className="text-[10px] text-slate-500">{me?.vehicle || 'No Vehicle'} • {me?.currentZone || '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleStatusToggle} className={`px-4 py-2 rounded-xl font-bold text-[11px] uppercase tracking-wider transition-all active:scale-95 ${isOnline ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'bg-slate-200 text-slate-500'}`}>
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {phoneNumbers?.routing && (
              <a href={`tel:${cleanPhone(phoneNumbers.routing)}`} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider whitespace-nowrap hover:bg-blue-700 active:scale-95 transition-all shadow-sm shrink-0">
                <Phone size={12} /> Routing
              </a>
            )}
            {phoneNumbers?.dispatcher && (
              <a href={`tel:${cleanPhone(phoneNumbers.dispatcher)}`} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider whitespace-nowrap hover:bg-emerald-700 active:scale-95 transition-all shadow-sm shrink-0">
                <Phone size={12} /> Dispatch
              </a>
            )}
            <button className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider whitespace-nowrap hover:bg-indigo-700 active:scale-95 transition-all shadow-sm shrink-0">
              <Sparkles size={12} /> AI Optimize
            </button>
            <button onClick={handleStatusToggle} className="flex items-center gap-2 px-4 py-2.5 bg-rose-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider whitespace-nowrap hover:bg-rose-700 active:scale-95 transition-all shadow-sm shrink-0">
              <X size={12} /> {isOnline ? 'Go Offline' : 'Go Online'}
            </button>
          </div>

          {/* Stats Card */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5 shadow-xl shadow-blue-600/20">
            <div className="flex items-center justify-between mb-4">
              <p className="text-white/80 text-xs font-bold uppercase tracking-wider">{getTodayStr()} Manifest</p>
              <span className="px-3 py-1 bg-white/20 rounded-full text-white text-[10px] font-bold">{activeTrips.length} active</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-white">{myTrips.length}</p>
                <p className="text-[9px] text-white/60 uppercase font-bold tracking-wider mt-0.5">Total</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-white">{completedTrips.length}</p>
                <p className="text-[9px] text-white/60 uppercase font-bold tracking-wider mt-0.5">Done</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-white">{Math.max(0, myTrips.length - completedTrips.length - noShowTrips.length - cancelledTrips.length)}</p>
                <p className="text-[9px] text-white/60 uppercase font-bold tracking-wider mt-0.5">To Go</p>
              </div>
            </div>
          </div>

          {/* Manifest Section */}
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Today & Tomorrow Manifest</h3>
            <span className="text-[10px] text-slate-400">{activeTrips.length} trip{activeTrips.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Trip Cards */}
          {activeTrips.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center shadow-sm">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} className="text-slate-300" />
              </div>
              <p className="font-bold text-slate-700">All Clear</p>
              <p className="text-xs text-slate-400 mt-1">No trips assigned. Check back soon.</p>
            </div>
          ) : (
            activeTrips.map((trip) => {
              const isActive = !['Assigned', 'Unassigned'].includes(trip.status);
              return (
                <div key={trip.id} className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden transition-all ${isActive ? 'border-blue-500 shadow-lg shadow-blue-500/5' : 'border-slate-100'}`}>
                  {/* Card Header */}
                  <div className="p-4 pb-3">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-black text-slate-900 text-base truncate">{trip.patient}</h3>
                          {trip.bookingId && <span className="text-[9px] text-blue-600 font-bold whitespace-nowrap bg-blue-50 px-2 py-0.5 rounded-md">{trip.bookingId}</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-3xl font-black text-blue-600 tracking-tight">{to12hr(trip.time)}</span>
                          <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                            {trip.status}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <a href={`tel:${cleanPhone(clientPhone(trip))}`} className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 active:scale-90 transition-all"><Phone size={16} /></a>
                        <a href={`sms:${cleanPhone(clientPhone(trip))}`} className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 active:scale-90 transition-all"><MessageCircle size={16} /></a>
                      </div>
                    </div>
                  </div>

                  {/* Route Timeline */}
                  <div className="px-4 pb-3">
                    <div className="relative pl-6 border-l-2 border-slate-200 ml-[5px] space-y-3">
                      <div className="relative">
                        <div className="absolute -left-[19px] top-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow-sm" />
                        <p className="text-xs font-bold text-slate-700 truncate">{trip.pickup}</p>
                        {trip.pickupPhone && <p className="text-[9px] text-slate-400 mt-0.5">{trip.pickupPhone}</p>}
                      </div>
                      <div className="relative">
                        <div className="absolute -left-[19px] top-1 w-3 h-3 rounded-full bg-rose-500 border-2 border-white shadow-sm" />
                        <p className="text-xs font-bold text-slate-700 truncate">{trip.dropoff}</p>
                        {trip.dropoffPhone && <p className="text-[9px] text-slate-400 mt-0.5">{trip.dropoffPhone}</p>}
                      </div>
                    </div>
                    {trip.notes && <p className="text-[10px] text-amber-600 font-medium mt-2 bg-amber-50 px-3 py-1.5 rounded-lg">{trip.notes}</p>}
                  </div>

                  {/* Action Buttons */}
                  <div className="px-4 pb-4 flex gap-2">
                    <button className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-xs active:scale-[0.98] transition-all shadow-sm shadow-blue-600/20 hover:bg-blue-700">
                      <Play size={14} className="inline mr-1.5 -mt-0.5" /> Start Trip
                    </button>
                    <button className="px-4 py-3 bg-amber-50 text-amber-700 rounded-xl font-bold text-[10px] uppercase tracking-wider active:scale-95 transition-all hover:bg-amber-100">No Show</button>
                    <button className="px-4 py-3 bg-rose-50 text-rose-700 rounded-xl font-bold text-[10px] uppercase tracking-wider active:scale-95 transition-all hover:bg-rose-100">Cancel</button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ===== HISTORY PAGE ===== */}
      {activeNav === 'history' && (
        <div className="flex-1 overflow-y-auto pb-24 px-4 pt-4">
          <h2 className="text-xl font-black text-slate-900 mb-4">History</h2>

          {/* Filter Tabs */}
          <div className="flex gap-1.5 mb-5 overflow-x-auto no-scrollbar">
            {[
              { id: 'all', label: 'All' },
              { id: 'completed', label: 'Completed' },
              { id: 'noshow', label: 'No Show' },
              { id: 'cancelled', label: 'Cancelled' },
            ].map(f => (
              <button key={f.id} onClick={() => setHistoryFilter(f.id)}
                className={`px-4 py-2 rounded-xl font-bold text-xs transition-all active:scale-95 whitespace-nowrap ${historyFilter === f.id ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {f.label}
              </button>
            ))}
          </div>

          {/* History Cards */}
          <div className="space-y-3">
            {filteredHistory.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center shadow-sm">
                <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <History size={32} className="text-slate-300" />
                </div>
                <p className="font-bold text-slate-700">No history yet</p>
                <p className="text-xs text-slate-400 mt-1">Completed trips will appear here.</p>
              </div>
            ) : (
              filteredHistory.map(trip => {
                const statusColors = { 'Completed': 'bg-emerald-100 text-emerald-700', 'No Show': 'bg-amber-100 text-amber-700', 'Cancelled': 'bg-rose-100 text-rose-700' };
                return (
                  <div key={trip.id} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-900 text-sm truncate">{trip.patient}</h4>
                          {trip.bookingId && <span className="text-[8px] text-blue-600 font-bold whitespace-nowrap bg-blue-50 px-1.5 py-0.5 rounded">{trip.bookingId}</span>}
                        </div>
                        <p className="text-xs font-bold text-blue-600 mt-0.5">{to12hr(trip.time)}</p>
                        <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-slate-500">
                          <MapPin size={10} className="text-emerald-500 shrink-0" />
                          <span className="truncate">{trip.pickup}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                          <MapPin size={10} className="text-rose-500 shrink-0" />
                          <span className="truncate">{trip.dropoff}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${statusColors[trip.status] || 'bg-slate-100 text-slate-500'}`}>
                          {trip.status}
                        </span>
                      </div>
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
        <div className="flex-1 flex flex-col bg-white">
          <div className="p-4 border-b border-slate-100">
            <h2 className="text-xl font-black text-slate-900">Messages</h2>
            <p className="text-xs text-slate-400 mt-0.5">Communicate with dispatch</p>
          </div>
          <div className="flex-1 flex items-center justify-center p-8 text-center">
            <div className="max-w-xs">
              <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-4">
                <MessageCircle size={40} className="text-slate-300" />
              </div>
              <p className="font-bold text-slate-700">No Messages</p>
              <p className="text-xs text-slate-400 mt-1">Your conversations with dispatch will appear here.</p>
            </div>
          </div>
        </div>
      )}

      {/* ===== PROFILE PAGE ===== */}
      {activeNav === 'profile' && (
        <div className="flex-1 overflow-y-auto pb-24 px-4 pt-4">
          {/* Profile Card */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 shadow-xl shadow-blue-600/20 text-white mb-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-2xl font-black shadow-inner">
                {me?.name?.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-black truncate">{me?.name}</h2>
                <p className="text-sm text-white/70 truncate">{me?.email}</p>
                <p className="text-xs text-white/50 mt-0.5">{me?.vehicle || 'No Vehicle'} • {me?.currentZone || '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <button onClick={handleStatusToggle} className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all active:scale-95 ${isOnline ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}>
                {isOnline ? 'Go Offline' : 'Go Online'}
              </button>
              <div className="flex items-center gap-1.5 px-3 py-2 bg-white/10 rounded-xl text-xs font-medium">
                <Gauge size={12} /> {me?.odometer?.toLocaleString() || 0} mi
              </div>
            </div>
          </div>

          {/* Odometer Update */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm mb-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Odometer</p>
            <p className="text-2xl font-black text-slate-900">{me?.odometer?.toLocaleString() || 0} <span className="text-sm font-medium text-slate-400">mi</span></p>
            <p className="text-[10px] text-slate-400 mt-1">Next oil change at {me?.nextOilChange?.toLocaleString() || '5,000'} mi</p>
          </div>

          {/* Vehicle Info */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm mb-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Vehicle</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Vehicle</span><span className="font-bold text-slate-900">{me?.vehicle || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Zone</span><span className="font-bold text-slate-900">{me?.currentZone || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Status</span><span className={`font-bold ${isOnline ? 'text-emerald-600' : 'text-slate-400'}`}>{isOnline ? 'Online' : 'Offline'}</span></div>
            </div>
          </div>

          {/* Account Actions */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <button onClick={() => onOpenSettings?.()} className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition border-b border-slate-100">
              <div className="flex items-center gap-3">
                <Settings size={18} className="text-slate-400" />
                <span className="font-bold text-sm text-slate-900">Settings</span>
              </div>
              <ChevronRight size={16} className="text-slate-300" />
            </button>
            <button onClick={() => signOut(auth)} className="w-full flex items-center justify-between p-4 hover:bg-rose-50 transition">
              <div className="flex items-center gap-3">
                <LogOut size={18} className="text-rose-400" />
                <span className="font-bold text-sm text-rose-600">Sign Out</span>
              </div>
              <ChevronRight size={16} className="text-slate-300" />
            </button>
          </div>
        </div>
      )}

      {/* ===== BOTTOM NAVIGATION ===== */}
      <nav className="fixed bottom-0 left-0 right-0 z-50" style={{paddingBottom: 'env(safe-area-inset-bottom, 0px)'}}>
        <div className="bg-white/90 backdrop-blur-2xl border-t border-slate-100 shadow-[0_-4px_30px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-around px-2 py-1.5 max-w-lg mx-auto">
            {[
              { id: 'trips', label: 'Trips', icon: Home },
              { id: 'history', label: 'History', icon: History },
              { id: 'chat', label: 'Chat', icon: MessageCircle },
              { id: 'profile', label: 'Profile', icon: User },
            ].map(item => {
              const Icon = item.icon;
              const isActive = activeNav === item.id;
              return (
                <button key={item.id} onClick={() => setActiveNav(item.id)}
                  className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-2xl transition-all relative ${isActive ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${isActive ? 'bg-blue-50' : ''}`}>
                    <Icon size={20} className={isActive ? 'text-blue-600' : ''} strokeWidth={isActive ? 2.5 : 2} />
                  </div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider transition-all ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>{item.label}</span>
                  {isActive && <div className="absolute -top-0.5 w-6 h-0.5 bg-blue-600 rounded-full" />}
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