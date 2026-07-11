import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Activity, KeyRound, Search, Shield, Truck, Users, UserCog, CircleDot, Loader2, LayoutDashboard } from 'lucide-react';
import { getDriverLiveStatus } from '../constants/statuses';
import { auth, sendPasswordResetEmail } from '../config/firebase';
import {
  AdminShell, AdminCard, AdminCardHead, AdminStat, AdminBadge,
  AdminButton, AdminIconButton, AdminAvatar, AdminSearch, AdminEmpty,
} from './admin/AdminKit';

const ACTIVE_TRIP_STATUSES = new Set([
  'Assigned', 'In Progress', 'In Mission', 'En Route', 'Navigating Pickup',
  'At Pickup', 'In Transit', 'Navigating Dropoff', 'At Dropoff', 'Arrived',
]);

const liveTone = (label) => {
  const l = String(label || '').toLowerCase();
  if (l.includes('offline')) return 'offline';
  if (l.includes('trip') || l.includes('busy')) return 'busy';
  return 'online';
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
    let online = 0, busy = 0, offline = 0;
    drivers.forEach((driver) => {
      const label = getDriverLiveStatus(driver).label.toLowerCase();
      if (label.includes('offline')) offline += 1;
      else if (label.includes('trip') || label.includes('busy')) busy += 1;
      else online += 1;
    });
    return { online, busy, offline };
  }, [drivers]);

  const timeoutRefs = useRef([]);
  useEffect(() => () => timeoutRefs.current.forEach(clearTimeout), []);

  const handlePasswordReset = async (email) => {
    if (!email) return;
    try {
      await sendPasswordResetEmail(auth, email);
      setPwResetMsg(prev => ({ ...prev, [email]: 'Email sent' }));
      timeoutRefs.current.push(setTimeout(() => setPwResetMsg(prev => { const n = { ...prev }; delete n[email]; return n; }), 3000));
    } catch (err) {
      setPwResetMsg(prev => ({ ...prev, [email]: err.message || 'Failed' }));
      timeoutRefs.current.push(setTimeout(() => setPwResetMsg(prev => { const n = { ...prev }; delete n[email]; return n; }), 3000));
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

  const nav = [{
    label: 'Operations',
    items: [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'drivers', label: 'Drivers', icon: Truck },
      { id: 'people', label: 'People', icon: Users },
      { id: 'activity', label: 'Activity', icon: Activity },
    ],
  }];

  const mobileNav = [
    { id: 'overview', label: 'Home', icon: LayoutDashboard },
    { id: 'drivers', label: 'Drivers', icon: Truck },
    { id: 'people', label: 'People', icon: Users },
    { id: 'activity', label: 'Activity', icon: Activity },
  ];

  const subtitles = {
    overview: 'Live fleet & team snapshot',
    drivers: `${drivers.length} drivers on roster`,
    people: 'Dispatchers & drivers',
    activity: 'Recent audit events',
  };

  return (
    <AdminShell
      nav={nav}
      active={activeTab}
      onNavigate={setActiveTab}
      mobileNav={mobileNav}
      mobileActive={activeTab}
      onMobileNavigate={setActiveTab}
      title="Team Control"
      subtitle={subtitles[activeTab]}
      eyebrow="Command Admin"
      actions={
        <AdminBadge tone="online" dot>
          {drivers.length + dispatchers.length} people
        </AdminBadge>
      }
    >
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="adm-stats">
            <AdminStat icon={Users} value={drivers.length} label="Drivers" />
            <AdminStat icon={UserCog} value={dispatchers.length} label="Dispatchers" />
            <AdminStat icon={CircleDot} value={driverStatusCounts.online} label="Online" accent="rgba(16,185,129,0.12)" />
            <AdminStat icon={Loader2} value={driverStatusCounts.busy} label="Busy" accent="rgba(245,158,11,0.14)" />
          </div>

          <AdminCard>
            <AdminCardHead icon={Truck} title="Driver Workflow Status" />
            <div className="adm-card-pad space-y-1">
              {drivers.slice(0, 8).map((driver) => {
                const live = getDriverLiveStatus(driver);
                return (
                  <div key={driver.id || driver.email || driver.name} className="adm-list-row">
                    <AdminAvatar name={driver.name} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{driver.name}</p>
                      <p className="truncate text-xs font-medium text-slate-500">{driver.vehicle || 'No vehicle'}</p>
                    </div>
                    <AdminBadge tone={liveTone(live.label)} dot>{live.label}</AdminBadge>
                  </div>
                );
              })}
              {drivers.length === 0 && <AdminEmpty icon={Truck} title="No drivers yet" />}
            </div>
          </AdminCard>
        </div>
      )}

      {activeTab === 'drivers' && (
        <div className="space-y-3">
          {drivers.map((driver) => {
            const live = getDriverLiveStatus(driver);
            const activeTrip = activeTripsByDriver.get(driver.id);
            return (
              <AdminCard key={driver.id || driver.email || driver.name}>
                <div className="adm-card-pad">
                  <div className="flex items-start gap-3">
                    <AdminAvatar name={driver.name} brand size={48} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold text-slate-900">{driver.name}</h3>
                          <p className="mt-0.5 text-xs font-medium text-slate-500">{driver.vehicle || 'No vehicle'}</p>
                        </div>
                        <AdminBadge tone={liveTone(live.label)} dot>{live.label}</AdminBadge>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Phone</p>
                          <p className="mt-1 truncate text-sm font-semibold text-slate-800">{driver.phone || '—'}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Zone</p>
                          <p className="mt-1 truncate text-sm font-semibold text-slate-800">{driver.currentZone || '—'}</p>
                        </div>
                      </div>
                      {activeTrip && (
                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">{activeTrip.status}</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{activeTrip.patient}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </AdminCard>
            );
          })}
          {drivers.length === 0 && <AdminEmpty icon={Truck} title="No drivers on roster" hint="Add drivers from the People tab" />}
        </div>
      )}

      {activeTab === 'people' && (
        <div className="space-y-3">
          <AdminSearch value={query} onChange={setQuery} placeholder="Search people..." />
          {filteredUsers.map((user, i) => {
            const live = user._role === 'driver' ? getDriverLiveStatus(user) : null;
            return (
              <AdminCard key={user.id || i}>
                <div className="adm-card-pad">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <AdminAvatar name={user.name} size={44} />
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-semibold text-slate-900">{user.name}</h4>
                        <p className="truncate text-xs font-medium text-slate-500">{user.email || 'No email'}</p>
                      </div>
                    </div>
                    {user._role === 'driver' ? (
                      <AdminBadge tone={liveTone(live.label)} dot>{live.label}</AdminBadge>
                    ) : (
                      <AdminBadge tone="info" dot>Active</AdminBadge>
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
                      className="adm-select"
                    >
                      {role === 'admin' && <option value="admin">Admin</option>}
                      <option value="dispatcher">Dispatcher</option>
                      <option value="driver">Driver</option>
                    </select>
                    <div className="flex items-center gap-2">
                      {pwResetMsg[user.email] && <span className="text-[11px] font-bold text-emerald-600">{pwResetMsg[user.email]}</span>}
                      {user.email && (
                        <AdminIconButton onClick={() => handlePasswordReset(user.email)} title="Send password reset">
                          <KeyRound size={15} />
                        </AdminIconButton>
                      )}
                    </div>
                  </div>
                </div>
              </AdminCard>
            );
          })}
          {filteredUsers.length === 0 && <AdminEmpty icon={Users} title="No matching people" hint="Try a different search" />}
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="space-y-2">
          {logs.slice(0, 40).map((log, index) => (
            <AdminCard key={index} className="!shadow-none">
              <div className="adm-card-pad flex items-start gap-3 py-3">
                <div className="adm-avatar--brand adm-avatar" style={{ width: 34, height: 34, borderRadius: 10 }}>
                  <Activity size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{log.t || 'Activity'}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs font-medium text-slate-500">{log.meta?.summary || log.d}</p>
                </div>
                <span className="shrink-0 text-[11px] font-bold text-slate-400">
                  {log.time ? new Date(log.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
            </AdminCard>
          ))}
          {logs.length === 0 && <AdminEmpty icon={Activity} title="No activity yet" />}
        </div>
      )}
    </AdminShell>
  );
};

export default MobileAdminPage;