import React, { useMemo, useState } from 'react';
import { Activity, KeyRound, Search, Shield, Truck, Wifi, WifiOff } from 'lucide-react';
import { getDriverLiveStatus } from '../constants/statuses';
import { auth, sendPasswordResetEmail } from '../config/firebase';

const ACTIVE_TRIP_STATUSES = new Set([
  'Assigned',
  'In Progress',
  'In Mission',
  'En Route',
  'Navigating Pickup',
  'At Pickup',
  'In Transit',
  'Navigating Dropoff',
  'At Dropoff',
  'Arrived',
]);

const StatCard = ({ label, value, tone = 'slate' }) => {
  const tones = {
    slate: 'bg-slate-50 text-slate-900 border-slate-100',
    blue: 'bg-blue-50 text-blue-800 border-blue-100',
    amber: 'bg-amber-50 text-amber-800 border-amber-100',
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-100',
  };
  return (
    <div className={`rounded-2xl border px-3 py-3 ${tones[tone] || tones.slate}`}>
      <p className="text-xl font-black leading-none">{value}</p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] opacity-70">{label}</p>
    </div>
  );
};

const MobileAdminPage = ({
  drivers = [],
  dispatchers = [],
  trips = [],
  logs = [],
  setDrivers,
  setDispatchers,
  currentUser,
  role,
  requestAuthAction,
  addAuditLog,
  statusColor,
}) => {
  const [pwResetMsg, setPwResetMsg] = useState({});
  const [activeTab, setActiveTab] = useState('overview');
  const [query, setQuery] = useState('');

  const allUsers = useMemo(() => (
    [
      ...dispatchers.map(d => ({ ...d, _role: 'dispatcher', _source: 'dispatchers' })),
      ...drivers.map(d => ({ ...d, _role: 'driver', _source: 'drivers' })),
    ].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  ), [dispatchers, drivers]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allUsers;
    return allUsers.filter((user) => (
      String(user.name || '').toLowerCase().includes(q) ||
      String(user.email || '').toLowerCase().includes(q) ||
      String(user.vehicle || '').toLowerCase().includes(q)
    ));
  }, [allUsers, query]);

  const activeTripsByDriver = useMemo(() => {
    const map = new Map();
    trips.forEach((trip) => {
      if (!ACTIVE_TRIP_STATUSES.has(trip.status)) return;
      const driver = drivers.find((entry) => (
        entry.id === trip.driverId ||
        entry.name === trip.driverName ||
        String(entry.email || '').trim().toLowerCase() === String(trip.driverEmail || '').trim().toLowerCase()
      ));
      if (driver && !map.has(driver.id)) map.set(driver.id, trip);
    });
    return map;
  }, [drivers, trips]);

  const driverStatusCounts = useMemo(() => {
    let online = 0;
    let busy = 0;
    let offline = 0;
    drivers.forEach((driver) => {
      const label = getDriverLiveStatus(driver).label.toLowerCase();
      if (label.includes('offline')) offline += 1;
      else if (label.includes('trip') || label.includes('busy')) busy += 1;
      else online += 1;
    });
    return { online, busy, offline };
  }, [drivers]);

  const handlePasswordReset = async (email) => {
    if (!email) return;
    try {
      await sendPasswordResetEmail(auth, email);
      setPwResetMsg(prev => ({ ...prev, [email]: 'Email sent' }));
      setTimeout(() => setPwResetMsg(prev => { const n = { ...prev }; delete n[email]; return n; }), 3000);
    } catch (err) {
      setPwResetMsg(prev => ({ ...prev, [email]: err.message || 'Failed' }));
      setTimeout(() => setPwResetMsg(prev => { const n = { ...prev }; delete n[email]; return n; }), 3000);
    }
  };

  const handleRoleChange = (user, newRole) => {
    if (!user || !newRole || user._role === newRole) return;
    if (user._source === 'dispatchers') {
      setDispatchers(prev => prev.filter(d => d.id !== user.id));
      if (newRole === 'driver') {
        setDrivers(prev => [...prev, { id: user.id, name: user.name, email: user.email, status: 'Available', vehicle: '', phone: user.phone || '', schedule: [] }]);
      }
    } else if (user._source === 'drivers') {
      setDrivers(prev => prev.filter(d => d.id !== user.id));
      if (newRole === 'dispatcher') {
        setDispatchers(prev => [...prev, { id: user.id, name: user.name, email: user.email || `${String(user.name || 'dispatcher').replace(/\s+/g, '.').toLowerCase()}@auth.agapecare.local`, clockedIn: false, phone: user.phone || '' }]);
      }
    }
    addAuditLog?.('Role Changed', `${currentUser} changed ${user.name} from ${user._role} to ${newRole}`, 'amber');
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'drivers', label: 'Drivers' },
    { id: 'people', label: 'People' },
    { id: 'activity', label: 'Activity' },
  ];

  return (
    <div className="flex min-h-full w-full flex-col bg-gray-50 pb-20">
      <div className="sticky top-0 z-20 border-b border-gray-200 bg-white px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2b4c7e]">Command Admin</p>
            <h1 className="mt-0.5 truncate text-xl font-black text-gray-950">Team Control</h1>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <Shield size={20} />
          </div>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black transition-all ${activeTab === tab.id ? 'bg-[#1e3a5f] text-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-3 px-2.5 py-3 sm:px-4">
        {activeTab === 'overview' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="Drivers" value={drivers.length} tone="blue" />
              <StatCard label="Dispatchers" value={dispatchers.length} tone="slate" />
              <StatCard label="Online" value={driverStatusCounts.online} tone="emerald" />
              <StatCard label="Busy" value={driverStatusCounts.busy} tone="amber" />
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Truck size={18} className="text-blue-600" />
                <h2 className="text-sm font-black text-slate-900">Driver Workflow Status</h2>
              </div>
              <div className="mt-3 space-y-2">
                {drivers.slice(0, 8).map((driver) => {
                  const live = getDriverLiveStatus(driver);
                  return (
                    <div key={driver.id || driver.email || driver.name} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2.5">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black uppercase ${live.color}`}>{(driver.name || '?')[0]}</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-slate-900">{driver.name}</p>
                        <p className="truncate text-[11px] font-semibold text-slate-500">{driver.vehicle || 'No vehicle'}</p>
                      </div>
                      <span className={`shrink-0 rounded-lg px-2 py-1 text-[9px] font-black uppercase ${live.color}`}>{live.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {activeTab === 'drivers' && (
          <div className="space-y-3">
            {drivers.map((driver) => {
              const live = getDriverLiveStatus(driver);
              const activeTrip = activeTripsByDriver.get(driver.id);
              return (
                <div key={driver.id || driver.email || driver.name} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-black uppercase ${live.color}`}>{(driver.name || '?')[0]}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-black text-slate-950">{driver.name}</h3>
                          <p className="mt-0.5 text-xs font-semibold text-slate-500">{driver.vehicle || 'No vehicle'}</p>
                        </div>
                        <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-black uppercase ${live.color}`}>{live.label}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <p className="font-black uppercase tracking-wide text-slate-400">Phone</p>
                          <p className="mt-1 truncate font-bold text-slate-800">{driver.phone || '-'}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <p className="font-black uppercase tracking-wide text-slate-400">Zone</p>
                          <p className="mt-1 truncate font-bold text-slate-800">{driver.currentZone || '-'}</p>
                        </div>
                      </div>
                      {activeTrip && (
                        <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 p-3">
                          <p className="text-[10px] font-black uppercase tracking-wide text-amber-700">{activeTrip.status}</p>
                          <p className="mt-1 text-sm font-black text-slate-900">{activeTrip.patient}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'people' && (
          <>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search people..."
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-slate-900 outline-none focus:border-[#2b4c7e] focus:ring-2 focus:ring-[#2b4c7e]/15"
              />
            </div>
            <div className="space-y-3">
              {filteredUsers.map((user, i) => {
                const live = user._role === 'driver' ? getDriverLiveStatus(user) : null;
                return (
                  <div key={user.id || i} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-sm font-black uppercase text-slate-700">
                          {(user.name || '?')[0]}
                        </div>
                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-black text-slate-900">{user.name}</h4>
                          <p className="truncate text-xs font-semibold text-slate-500">{user.email || 'No email'}</p>
                        </div>
                      </div>
                      {user._role === 'driver' ? (
                        <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-black ${live.color}`}>{live.label}</span>
                      ) : (
                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-black ${statusColor ? statusColor(user.clockedIn ? 'online' : 'offline') : 'bg-gray-200 text-gray-700'}`}>
                          {user.clockedIn ? <Wifi size={10} /> : <WifiOff size={10} />}
                          {user.clockedIn ? 'Online' : 'Offline'}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                      <select
                        value={user._role}
                        onChange={(e) => {
                          const newRole = e.target.value;
                          if (requestAuthAction) requestAuthAction(`Change role for ${user.name}`, () => handleRoleChange(user, newRole));
                          else handleRoleChange(user, newRole);
                        }}
                        className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-700 outline-none focus:ring-2 focus:ring-[#2b4c7e]/15"
                      >
                        <option value="admin">Admin</option>
                        <option value="dispatcher">Dispatcher</option>
                        <option value="driver">Driver</option>
                      </select>
                      <div className="flex items-center gap-2">
                        {pwResetMsg[user.email] && <span className="text-[10px] font-bold text-emerald-600">{pwResetMsg[user.email]}</span>}
                        {user.email && (
                          <button onClick={() => handlePasswordReset(user.email)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
                            <KeyRound size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {activeTab === 'activity' && (
          <div className="space-y-2">
            {logs.slice(0, 40).map((log, index) => (
              <div key={index} className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                <div className="flex items-start gap-2">
                  <Activity size={14} className="mt-0.5 shrink-0 text-blue-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-slate-900">{log.t || 'Activity'}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs font-semibold text-slate-500">{log.meta?.summary || log.d}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold text-slate-400">{log.time ? new Date(log.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileAdminPage;
