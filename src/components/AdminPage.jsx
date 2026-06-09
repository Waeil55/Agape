import React, { useState, useMemo, useCallback } from 'react';
import { Truck, CarFront, Activity, ExternalLink, ClipboardList, KeyRound, Trash2, UserCog, Wifi, WifiOff, BrainCircuit, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { sendPasswordResetEmail, auth } from '../config/firebase';
import AIInsightsBanner from './AIInsightsBanner';
import { aiSecurityAnalysis } from '../config/ai';
import DriversVehiclesPage from './DriversVehiclesPage';
import UsersPage from './UsersPage';

const getEntityType = (log) => {
  const action = String(log?.t || '').toLowerCase();
  const details = String(log?.d || '').toLowerCase();
  const meta = log?.meta;
  if (meta?.entity) return meta.entity;
  if (action.includes('vehicle') || details.includes('vehicle')) return 'vehicle';
  if (action.includes('driver') || details.includes('driver')) return 'driver';
  if (action.includes('dispatcher') || action.includes('user') || details.includes('dispatcher') || details.includes('user')) return 'dispatcher';
  if (action.includes('trip') || details.includes('trip')) return 'trip';
  return 'other';
};

const getTripIdFromLog = (log) => {
  if (log?.meta?.entity === 'trip' && log?.meta?.id) return log.meta.id;
  const match = String(log?.d || '').match(/\b(TRP-[\w-]+|BK-[\w-]+)\b/i);
  return match ? match[1] : null;
};

const fmtTime = (t) => t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
const fmtDate = (t) => t ? new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
const displayRef = (trip) => (trip.bookingId || trip.id || '').replace(/^TRIP-/, 'Trip ID: ');

const statusColor = (status) => {
  if (!status) return 'bg-slate-200 text-slate-600';
  const s = String(status).toLowerCase();
  if (s === 'available' || s === 'online') return 'bg-emerald-100 text-emerald-700';
  if (s === 'busy' || s === 'on trip') return 'bg-amber-100 text-amber-700';
  if (s === 'offline' || s === 'unavailable') return 'bg-slate-200 text-slate-500';
  return 'bg-blue-100 text-blue-700';
};

const SectionTab = ({ title, count, isActive, onClick }) => (
  <button onClick={onClick} className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all shrink-0 border ${isActive ? 'bg-slate-900 text-white shadow-sm border-slate-900' : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'}`}>
    {title}
    {count !== undefined && <span className={`ml-1 ${isActive ? 'text-blue-200' : 'text-slate-400'}`}>({count})</span>}
  </button>
);

const DriverActivityCard = ({ driver, trips, logs, onViewTrip }) => {
  const driverTrips = trips.filter(t => t.driverId === driver.id || t.driverName === driver.name);
  const currentTrip = driverTrips.find(t => ['Assigned', 'In Progress', 'Navigating Pickup', 'At Pickup', 'In Transit', 'En Route', 'Arrived'].includes(t.status));
  const completedTrips = driverTrips.filter(t => t.status === 'Completed').slice(-3);
  const nextTrip = driverTrips.find(t => t.status === 'Assigned' && t.id !== currentTrip?.id);
  const driverLogs = logs.filter(l => String(l?.d || '').toLowerCase().includes(driver.name.toLowerCase())).slice(0, 5);

  if (!driver.name) return null;

  return (
    <div className="bg-white border border-slate-100/50 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200">
      <div className="p-4 border-b border-slate-100 bg-slate-50/70">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-sm font-black text-blue-700 uppercase shrink-0">
            {(driver.name || '?')[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-bold text-slate-900 truncate">{driver.name}</p>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColor(driver.status)}`}>{driver.status || 'Unknown'}</span>
            </div>
            <p className="text-[11px] text-slate-500">{driver.vehicle || 'No vehicle'} {driver.phone ? `- ${driver.phone}` : ''}</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {currentTrip && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Current Trip</span>
              {onViewTrip && (
                <button onClick={() => onViewTrip(currentTrip.id)} className="ml-auto flex items-center gap-1 px-3 py-1.5 min-h-[36px] bg-blue-600 text-white rounded-lg text-[9px] font-bold hover:bg-blue-700 transition-colors">
                  <ExternalLink size={7} /> View
                </button>
              )}
            </div>
            <p className="font-bold text-slate-900 text-sm">{currentTrip.patient}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{currentTrip.time} - {displayRef(currentTrip)}</p>
            <div className="mt-2 space-y-1">
              <div className="flex items-start gap-2 text-[10px]">
                <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 mt-px"><span className="text-[6px] font-black text-white">P</span></div>
                <span className="text-slate-600">{currentTrip.pickup || '-'}</span>
              </div>
              <div className="flex items-start gap-2 text-[10px]">
                <div className="w-4 h-4 rounded-full bg-rose-500 flex items-center justify-center shrink-0 mt-px"><span className="text-[6px] font-black text-white">D</span></div>
                <span className="text-slate-600">{currentTrip.dropoff || '-'}</span>
              </div>
            </div>
          </div>
        )}

        {nextTrip && !currentTrip && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-1">Next Trip</p>
            <p className="font-bold text-slate-900 text-sm">{nextTrip.patient}</p>
            <p className="text-[10px] text-slate-500">{nextTrip.time} - {nextTrip.pickup} to {nextTrip.dropoff}</p>
          </div>
        )}

        {completedTrips.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Recent Completed</p>
            <div className="space-y-1">
              {completedTrips.map((trip, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] bg-emerald-50/50 rounded-lg px-2.5 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="font-semibold text-slate-700 min-w-[80px]">{trip.time}</span>
                  <span className="text-slate-600 truncate">{trip.patient}</span>
                  {onViewTrip && (
                    <button onClick={() => onViewTrip(trip.id)} className="ml-auto text-blue-600 hover:text-blue-800 font-bold text-[9px] shrink-0 min-h-[36px] px-2 py-1">View</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {driverLogs.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Activity</p>
            <div className="space-y-1">
              {driverLogs.map((log, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px] text-slate-500">
                  <span className={`w-1 h-1 rounded-full shrink-0 ${log.c === 'emerald' ? 'bg-emerald-500' : log.c === 'rose' ? 'bg-rose-500' : log.c === 'amber' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                  <span className="font-semibold text-slate-600 capitalize shrink-0">{log.t}</span>
                  <span className="truncate">{log.meta?.summary || log.d}</span>
                  <span className="ml-auto text-slate-400 shrink-0">{fmtTime(log.time)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!currentTrip && completedTrips.length === 0 && driverLogs.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-4">No activity yet for this driver.</p>
        )}
      </div>
    </div>
  );
};

const DispatcherActivityCard = ({ dispatcher, logs, onViewTrip }) => {
  const dispLogs = logs.filter(l => {
    const d = String(l?.d || '').toLowerCase();
    const t = String(l?.t || '').toLowerCase();
    return d.includes(dispatcher.name.toLowerCase()) || d.includes((dispatcher.email || '').toLowerCase());
  }).slice(0, 8);

  return (
    <div className="bg-white border border-slate-100/50 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200">
      <div className="p-3.5 border-b border-slate-100 bg-slate-50/70">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-sm font-black text-blue-700 uppercase shrink-0">
            {(dispatcher.name || '?')[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="font-bold text-slate-900 text-sm truncate">{dispatcher.name}</p>
              {dispatcher.clockedIn !== undefined && (
                <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${dispatcher.clockedIn ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                  {dispatcher.clockedIn ? <Wifi size={8} /> : <WifiOff size={8} />}
                  {dispatcher.clockedIn ? 'Online' : 'Offline'}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-500">{dispatcher.email || ''}</p>
          </div>
        </div>
      </div>
      <div className="p-3.5">
        {dispLogs.length > 0 ? (
          <div className="space-y-1.5">
            {dispLogs.map((log, i) => {
              const tripId = getTripIdFromLog(log);
              return (
                <div key={i} className="flex items-start gap-2 text-[10px] group hover:bg-slate-50 rounded-lg px-2 py-1.5 -mx-2 transition-colors">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-0.5 ${log.c === 'emerald' ? 'bg-emerald-500' : log.c === 'rose' ? 'bg-rose-500' : log.c === 'amber' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-slate-700">{log.t}</span>
                    <p className="text-slate-500 truncate">{log.meta?.summary || log.d}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-slate-400">{fmtTime(log.time)}</span>
                    {tripId && onViewTrip && (
                      <button onClick={() => onViewTrip(tripId)} className="opacity-0 group-hover:opacity-100 px-2 py-1 min-h-[36px] bg-blue-600 text-white rounded text-[8px] font-bold transition-opacity"><ExternalLink size={7} /></button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-slate-400 text-center py-4">No activity logged for this dispatcher.</p>
        )}
      </div>
    </div>
  );
};

const AdminPage = ({
  role, currentUser, drivers, setDrivers, dispatchers, setDispatchers,
  addAuditLog, logs = [], trips, vehicles, setVehicles,
  assignTripToDriver, requestAuthAction, onViewTrip
}) => {
  const [activeSection, setActiveSection] = useState('dispatchers');
  const [pwResetMsg, setPwResetMsg] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [aiSecurity, setAiSecurity] = useState(null);
  const [aiSecLoading, setAiSecLoading] = useState(false);

  const runSecurityAnalysis = useCallback(async () => { setAiSecLoading(true); const r = await aiSecurityAnalysis([...drivers, ...dispatchers].map(u => ({ email: u.email, role: u.role, lastLogin: u.lastLogin, disabled: u.disabled })), logs || []); setAiSecurity(r); setAiSecLoading(false); }, [drivers, dispatchers, logs]);

  const toggleSection = (id) => {
    setActiveSection(prev => prev === id ? null : id);
  };

  // All users merged from drivers + dispatchers with role labels
  const allUsers = useMemo(() => {
    const users = [];
    dispatchers.forEach(d => users.push({ ...d, _role: 'dispatcher', _source: 'dispatchers' }));
    drivers.forEach(d => users.push({ ...d, _role: 'driver', _source: 'drivers' }));
    return users;
  }, [dispatchers, drivers]);

  // Work time tracking from logs
  const workTimes = useMemo(() => {
    const times = {};
    logs.forEach(log => {
      const action = String(log?.t || '').toLowerCase();
      const desc = String(log?.d || '').toLowerCase();
      const name = desc.match(/(\S+)\s+(?:logged|clocked|signed|went)/i)?.[1] || '';
      if (name && (action.includes('login') || action.includes('logout') || action.includes('clock'))) {
        if (!times[name]) times[name] = [];
        times[name].push({ action: log.t, time: log.time });
      }
    });
    return times;
  }, [logs]);

  const handlePasswordReset = async (email) => {
    if (!email) return;
    try {
      await sendPasswordResetEmail(auth, email);
      setPwResetMsg(prev => ({ ...prev, [email]: 'Email sent!' }));
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
        setDispatchers(prev => [...prev, { id: user.id, name: user.name, email: user.email || `${user.name.replace(/\s+/g, '.').toLowerCase()}@auth.agapecare.local`, clockedIn: false, phone: user.phone || '' }]);
      }
    }
    addAuditLog('Role Changed', `${currentUser} changed ${user.name} from ${user._role} to ${newRole}`, 'amber', { entity: 'user', id: user.id, diffs: [{ field: 'role', before: user._role, after: newRole }] });
  };

  const handleDeleteUser = (user) => {
    if (user._source === 'dispatchers') {
      setDispatchers(prev => prev.filter(d => d.id !== user.id));
    } else if (user._source === 'drivers') {
      setDrivers(prev => prev.filter(d => d.id !== user.id));
    }
    addAuditLog('User Deleted', `${currentUser} deleted ${user.name} (${user._role})`, 'rose');
    setConfirmDelete(null);
    if (requestAuthAction) requestAuthAction('Delete User', () => {});
  };

  const activeDrivers = useMemo(() => {
    const now = new Date();
    return drivers
      .filter(d => d.name)
      .sort((a, b) => {
        const aActive = trips.some(t => t.driverId === a.id && ['In Progress', 'Navigating Pickup', 'At Pickup', 'In Transit', 'Assigned'].includes(t.status)) ? 0 : 1;
        const bActive = trips.some(t => t.driverId === b.id && ['In Progress', 'Navigating Pickup', 'At Pickup', 'In Transit', 'Assigned'].includes(t.status)) ? 0 : 1;
        return aActive - bActive;
      });
  }, [drivers, trips]);

  const entityLogs = useMemo(() => ({
    dispatcher: logs.filter(l => getEntityType(l) === 'dispatcher'),
    driver: logs.filter(l => getEntityType(l) === 'driver'),
    vehicle: logs.filter(l => getEntityType(l) === 'vehicle'),
  }), [logs]);

  const sections = [
    { id: 'dispatchers', title: 'Dispatcher Activity', icon: ClipboardList, count: dispatchers.length,
      content: (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {dispatchers.filter(d => d.name).map((disp, i) => (
            <DispatcherActivityCard key={disp.id || i} dispatcher={disp} logs={entityLogs.dispatcher} onViewTrip={onViewTrip} />
          ))}
          {dispatchers.filter(d => d.name).length === 0 && (
            <p className="text-sm text-slate-400 col-span-full text-center py-6">No dispatchers configured.</p>
          )}
        </div>
      ) },
    { id: 'drivers', title: 'Driver Activity', icon: Truck, count: drivers.length,
      content: (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {activeDrivers.map((driver, i) => (
            <DriverActivityCard key={driver.id || i} driver={driver} trips={trips} logs={entityLogs.driver} onViewTrip={onViewTrip} />
          ))}
          {activeDrivers.length === 0 && (
            <p className="text-sm text-slate-400 col-span-full text-center py-6">No drivers configured.</p>
          )}
        </div>
      ) },
    { id: 'logins', title: 'Logins & Roles', icon: UserCog, count: allUsers.length,
      content: (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-sm">
            <table className="w-full">
              <thead className="bg-slate-50/80 border-b border-slate-100">
                <tr>
                  <th className="px-3 py-2.5 text-left text-[11px] font-bold text-slate-600 uppercase tracking-wider">User</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-bold text-slate-600 uppercase tracking-wider">Email</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-bold text-slate-600 uppercase tracking-wider">Role</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-bold text-slate-600 uppercase tracking-wider">Status</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-bold text-slate-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allUsers.map((user, i) => (
                  <tr key={`${user._source}-${user.id || i}`} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-black text-slate-700 uppercase shrink-0">{(user.name || '?')[0]}</div>
                        <span className="font-semibold text-slate-900 text-sm">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">{user.email || '-'}</td>
                    <td className="px-3 py-2.5">
                      <select
                        value={user._role}
                        onChange={(e) => {
                          const newRole = e.target.value;
                          if (newRole === user._role) return;
                          if (requestAuthAction) {
                            requestAuthAction(`Change ${user.name} from ${user._role} to ${newRole}`, () => handleRoleChange(user, newRole));
                          } else {
                            handleRoleChange(user, newRole);
                          }
                        }}
                        className="px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-200 text-[11px] font-bold bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="admin">Admin</option>
                        <option value="dispatcher">Dispatcher</option>
                        <option value="driver">Driver</option>
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${statusColor(user.clockedIn !== undefined ? (user.clockedIn ? 'online' : 'offline') : user.status)}`}>
                        {user.clockedIn !== undefined ? (user.clockedIn ? <Wifi size={10} /> : <WifiOff size={10} />) : null}
                        {user.clockedIn !== undefined ? (user.clockedIn ? 'Online' : 'Offline') : (user.status || '-')}
                      </span>
                      {workTimes[user.name]?.length > 0 && (
                        <div className="mt-1 text-[9px] text-slate-400">
                          {workTimes[user.name].slice(-2).map((w, j) => (
                            <span key={j} className="block">{w.action}: {fmtTime(w.time)} {fmtDate(w.time)}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {user.email && (
                          <button
                            onClick={() => handlePasswordReset(user.email)}
                            className="flex items-center gap-1 px-3 py-1.5 min-h-[36px] bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-[10px] font-bold text-slate-600 transition-colors"
                            title="Send password reset email"
                          >
                            <KeyRound size={10} /> Reset PW
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteUser(user)}
                          className="flex items-center gap-1 px-3 py-1.5 min-h-[36px] bg-white border border-rose-200 hover:bg-rose-50 rounded-lg text-[10px] font-bold text-rose-600 transition-colors"
                          title="Delete user"
                        >
                          <Trash2 size={10} /> Delete
                        </button>
                      </div>
                      {pwResetMsg[user.email] && (
                        <p className={`text-[9px] mt-1 ${pwResetMsg[user.email] === 'Email sent!' ? 'text-emerald-600' : 'text-rose-600'}`}>{pwResetMsg[user.email]}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) },
    { id: 'vehicles', title: 'Vehicles', icon: CarFront, count: vehicles.length,
      content: (
        <DriversVehiclesPage
          mode="vehicles"
          role={role} drivers={drivers} setDrivers={setDrivers}
          dispatchers={dispatchers}
          addAuditLog={addAuditLog} currentUser={currentUser}
          trips={trips} onAssignTrip={assignTripToDriver}
          requestAuthAction={requestAuthAction}
          vehicles={vehicles} setVehicles={setVehicles}
        />
      ) },
    { id: 'activity', title: 'System Activity', icon: Activity,
      content: (
        <UsersPage
          activityFeedOnly
          drivers={drivers} setDrivers={setDrivers}
          dispatchers={dispatchers} setDispatchers={setDispatchers}
          addAuditLog={addAuditLog} currentUser={currentUser}
          role={role} requestAuthAction={requestAuthAction}
          logs={logs}
        />
      ) },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-100/50 bg-white p-4 shadow-sm hover:shadow-md transition-all duration-200">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-blue-600">Admin Workspace</p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900">People, Fleet, and Access Control</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Dispatcher activity, driver movement, vehicle records, login control, and audit history.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">{drivers?.length || 0} drivers</span>
            <span className="rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">{dispatchers?.length || 0} dispatchers</span>
            <span className="rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">{vehicles?.length || 0} vehicles</span>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 sticky top-0 z-10 bg-[#F3F4F6]/95 backdrop-blur">
        <button onClick={runSecurityAnalysis} disabled={aiSecLoading} className="px-3 py-2 rounded-xl text-[11px] font-bold transition-colors shrink-0 flex items-center gap-1.5 bg-slate-900 text-white hover:bg-slate-800 shadow-sm border border-slate-900 disabled:opacity-60">
          {aiSecLoading ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
          {aiSecLoading ? 'Scanning...' : 'Security Scan'}
        </button>
        {sections.map(s => (
          <SectionTab key={s.id} title={s.title} count={s.count} isActive={activeSection === s.id} onClick={() => toggleSection(s.id)} />
        ))}
      </div>
      <div className="space-y-3">
        <AIInsightsBanner insights={aiSecurity} loading={aiSecLoading} onClose={() => setAiSecurity(null)} />
        {sections.filter(s => activeSection === s.id).map(s => (
          <div key={s.id} className="bg-white border border-slate-100/50 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200">
            <div className="px-5 py-4">{s.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminPage;
