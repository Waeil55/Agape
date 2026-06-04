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
    <div className="bg-white border border-slate-100 rounded-2xl md:rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200">
      <div className="p-3 md:p-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50/50 to-blue-50/50">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-100 border border-blue-200 flex items-center justify-center text-sm font-black text-blue-700 uppercase shrink-0">
            {(driver.name || '?')[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-bold text-slate-900 text-sm md:text-base truncate">{driver.name}</p>
              <span className={`px-2.5 py-1 rounded-lg text-[10px] md:text-xs font-bold ${statusColor(driver.status)}`}>{driver.status || 'Unknown'}</span>
            </div>
            <p className="text-[11px] md:text-xs text-slate-500 mt-0.5 truncate">{driver.vehicle || 'No vehicle'}</p>
          </div>
        </div>
      </div>

      <div className="p-3 md:p-4 space-y-3 md:space-y-4">
        {currentTrip && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 md:p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-blue-700">Current Trip</span>
              {onViewTrip && (
                <button onClick={() => onViewTrip(currentTrip.id)} className="ml-auto flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded-lg text-[9px] md:text-[10px] font-bold hover:bg-blue-700 transition-colors shrink-0">
                  <ExternalLink size={12} /> View
                </button>
              )}
            </div>
            <p className="font-bold text-slate-900 text-sm md:text-base">{currentTrip.patient}</p>
            <p className="text-[10px] md:text-xs text-slate-500 mt-0.5">{currentTrip.time} - {displayRef(currentTrip)}</p>
            <div className="mt-2 md:mt-3 space-y-1">
              <div className="flex items-start gap-2 text-[10px] md:text-xs">
                <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 mt-px"><span className="text-[6px] font-black text-white">P</span></div>
                <span className="text-slate-600 min-w-0 break-words">{currentTrip.pickup || '-'}</span>
              </div>
              <div className="flex items-start gap-2 text-[10px] md:text-xs">
                <div className="w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center shrink-0 mt-px"><span className="text-[6px] font-black text-white">D</span></div>
                <span className="text-slate-600 min-w-0 break-words">{currentTrip.dropoff || '-'}</span>
              </div>
            </div>
          </div>
        )}

        {nextTrip && !currentTrip && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 md:p-4">
            <p className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-amber-700 mb-2">Next Trip</p>
            <p className="font-bold text-slate-900 text-sm md:text-base">{nextTrip.patient}</p>
            <p className="text-[10px] md:text-xs text-slate-500 mt-1">{nextTrip.time} • {nextTrip.pickup} to {nextTrip.dropoff}</p>
          </div>
        )}

        {completedTrips.length > 0 && (
          <div>
            <p className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Recent Completed</p>
            <div className="space-y-1.5">
              {completedTrips.map((trip, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] md:text-xs bg-emerald-50/60 rounded-lg px-3 py-2 border border-emerald-100 hover:bg-emerald-50 transition-colors">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="font-semibold text-slate-700 min-w-fit">{trip.time}</span>
                  <span className="text-slate-600 truncate flex-1">{trip.patient}</span>
                  {onViewTrip && (
                    <button onClick={() => onViewTrip(trip.id)} className="ml-auto text-blue-600 hover:text-blue-800 font-bold text-[9px] md:text-[10px] shrink-0">View</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {driverLogs.length > 0 && (
          <div>
            <p className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Activity Log</p>
            <div className="space-y-1.5">
              {driverLogs.map((log, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px] md:text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100 hover:bg-slate-100/50 transition-colors">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${log.c === 'emerald' ? 'bg-emerald-500' : log.c === 'rose' ? 'bg-rose-500' : log.c === 'amber' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                  <span className="font-semibold text-slate-700 capitalize shrink-0">{log.t}</span>
                  <span className="truncate flex-1">{log.meta?.summary || log.d}</span>
                  <span className="text-slate-400 text-[9px] md:text-[10px] shrink-0 whitespace-nowrap">{fmtTime(log.time)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!currentTrip && completedTrips.length === 0 && driverLogs.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-6">No activity yet</p>
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
    <div className="bg-white border border-slate-100 rounded-2xl md:rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200">
      <div className="p-3 md:p-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50/50 to-blue-50/50">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-12 h-12 rounded-xl bg-indigo-100 border border-indigo-200 flex items-center justify-center text-sm font-black text-indigo-700 uppercase shrink-0">
            {(dispatcher.name || '?')[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-bold text-slate-900 text-sm md:text-base truncate">{dispatcher.name}</p>
              {dispatcher.clockedIn !== undefined && (
                <span className={`flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] md:text-xs font-bold ${dispatcher.clockedIn ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                  {dispatcher.clockedIn ? <Wifi size={12} /> : <WifiOff size={12} />}
                  <span className="hidden md:inline">{dispatcher.clockedIn ? 'Online' : 'Offline'}</span>
                </span>
              )}
            </div>
            <p className="text-[11px] md:text-xs text-slate-500 mt-0.5 truncate">{dispatcher.email || ''}</p>
          </div>
        </div>
      </div>
      <div className="p-3 md:p-4">
        {dispLogs.length > 0 ? (
          <div className="space-y-2">
            {dispLogs.slice(0, 4).map((log, i) => {
              const tripId = getTripIdFromLog(log);
              return (
                <div key={i} className="flex items-start gap-2 text-[10px] md:text-xs group hover:bg-slate-50 rounded-lg px-2 py-2 -mx-2 transition-colors border border-transparent group-hover:border-slate-100">
                  <span className={`w-2 h-2 rounded-full shrink-0 mt-1 ${log.c === 'emerald' ? 'bg-emerald-500' : log.c === 'rose' ? 'bg-rose-500' : log.c === 'amber' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-slate-700">{log.t}</span>
                    <p className="text-slate-500 line-clamp-1 mt-0.5">{log.meta?.summary || log.d}</p>
                  </div>
                  <div className="text-slate-400 text-[9px] md:text-[10px] shrink-0 whitespace-nowrap">{fmtTime(log.time)}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-slate-400 text-center py-6">No activity logged</p>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {dispatchers.filter(d => d.name).map((disp, i) => (
            <DispatcherActivityCard key={disp.id || i} dispatcher={disp} logs={entityLogs.dispatcher} onViewTrip={onViewTrip} />
          ))}
          {dispatchers.filter(d => d.name).length === 0 && (
            <p className="text-sm text-slate-400 col-span-full text-center py-8">No dispatchers configured.</p>
          )}
        </div>
      ) },
    { id: 'drivers', title: 'Driver Activity', icon: Truck, count: drivers.length,
      content: (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {activeDrivers.map((driver, i) => (
            <DriverActivityCard key={driver.id || i} driver={driver} trips={trips} logs={entityLogs.driver} onViewTrip={onViewTrip} />
          ))}
          {activeDrivers.length === 0 && (
            <p className="text-sm text-slate-400 col-span-full text-center py-8">No drivers configured.</p>
          )}
        </div>
      ) },
    { id: 'logins', title: 'Logins & Roles', icon: UserCog, count: allUsers.length,
      content: (
        <>
          {/* Mobile: Card View | Desktop: Table View */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-100 shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-100 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs md:text-[11px] font-bold text-slate-600 uppercase tracking-wider">User</th>
                  <th className="px-4 py-3 text-left text-xs md:text-[11px] font-bold text-slate-600 uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-left text-xs md:text-[11px] font-bold text-slate-600 uppercase tracking-wider">Role</th>
                  <th className="px-4 py-3 text-left text-xs md:text-[11px] font-bold text-slate-600 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs md:text-[11px] font-bold text-slate-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allUsers.map((user, i) => (
                  <tr key={`${user._source}-${user.id || i}`} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 md:gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-black text-slate-700 uppercase shrink-0">{(user.name || '?')[0]}</div>
                        <span className="font-semibold text-slate-900 text-xs md:text-sm truncate">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs md:text-sm text-slate-600 truncate">{user.email || '-'}</td>
                    <td className="px-4 py-3">
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
                        className="px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-bold bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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
                            className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-[10px] font-bold text-slate-600 transition-colors"
                            title="Send password reset email"
                          >
                            <KeyRound size={10} /> Reset PW
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteUser(user)}
                          className="flex items-center gap-1 px-2 py-1 bg-white border border-rose-200 hover:bg-rose-50 rounded-lg text-[10px] font-bold text-rose-600 transition-colors"
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

          {/* Mobile: Card View */}
          <div className="md:hidden space-y-3">
            {allUsers.map((user, i) => (
              <div key={`${user._source}-${user.id || i}`} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-xs font-black text-slate-700 uppercase shrink-0">
                      {(user.name || '?')[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 text-sm truncate">{user.name}</p>
                      <p className="text-xs text-slate-500 truncate">{user.email || '-'}</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 ${user._role === 'admin' ? 'bg-purple-100 text-purple-700' : user._role === 'dispatcher' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'}`}>
                    {user._role}
                  </span>
                </div>

                <div className="mb-3 pb-3 border-b border-slate-100">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold ${statusColor(user.clockedIn !== undefined ? (user.clockedIn ? 'online' : 'offline') : user.status)}`}>
                    {user.clockedIn !== undefined ? (user.clockedIn ? <Wifi size={12} /> : <WifiOff size={12} />) : null}
                    {user.clockedIn !== undefined ? (user.clockedIn ? 'Online' : 'Offline') : (user.status || '-')}
                  </span>
                </div>

                <div className="flex gap-2 flex-wrap">
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
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="admin">Admin</option>
                    <option value="dispatcher">Dispatcher</option>
                    <option value="driver">Driver</option>
                  </select>
                  {user.email && (
                    <button
                      onClick={() => handlePasswordReset(user.email)}
                      className="flex items-center gap-1 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-600 transition-colors shrink-0"
                      title="Send password reset email"
                    >
                      <KeyRound size={12} /> Reset
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteUser(user)}
                    className="flex items-center gap-1 px-3 py-2 bg-white border border-rose-200 hover:bg-rose-50 rounded-lg text-xs font-bold text-rose-600 transition-colors shrink-0"
                    title="Delete user"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
                {pwResetMsg[user.email] && (
                  <p className={`text-xs mt-2 font-medium ${pwResetMsg[user.email] === 'Email sent!' ? 'text-emerald-600' : 'text-rose-600'}`}>{pwResetMsg[user.email]}</p>
                )}
              </div>
            ))}
            {allUsers.length === 0 && (
              <div className="text-center py-8">
                <p className="text-slate-400 text-sm">No users configured</p>
              </div>
            )}
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white space-y-4 md:space-y-6">
      {/* Mobile-First Header */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-100 px-4 py-3 md:px-0 md:rounded-b-2xl">
        <div className="md:bg-white md:border md:border-slate-100/50 md:rounded-3xl md:overflow-hidden md:shadow-sm md:p-4">
          <div className="flex flex-col gap-3 md:gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-blue-600">Admin Workspace</p>
              <h2 className="mt-1 text-lg md:text-2xl font-black tracking-tight text-slate-900">People, Fleet & Access</h2>
              <p className="mt-1 text-xs md:text-sm font-medium text-slate-500">Manage dispatchers, drivers, vehicles, and audit logs</p>
            </div>
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
                <p className="text-xs md:text-sm font-black text-blue-900">{drivers?.length || 0}</p>
                <p className="text-[10px] md:text-xs text-blue-700 font-semibold mt-1">Drivers</p>
              </div>
              <div className="bg-indigo-50 rounded-xl p-3 text-center border border-indigo-100">
                <p className="text-xs md:text-sm font-black text-indigo-900">{dispatchers?.length || 0}</p>
                <p className="text-[10px] md:text-xs text-indigo-700 font-semibold mt-1">Dispatchers</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100">
                <p className="text-xs md:text-sm font-black text-emerald-900">{vehicles?.length || 0}</p>
                <p className="text-[10px] md:text-xs text-emerald-700 font-semibold mt-1">Vehicles</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile-First Tabs - Horizontal Scroll on Small Screens */}
      <div className="px-4 md:px-0">
        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 md:flex-wrap">
          <button 
            onClick={runSecurityAnalysis} 
            disabled={aiSecLoading}
            className="px-4 py-2.5 rounded-2xl text-xs md:text-sm font-bold transition-all shrink-0 flex items-center gap-2 bg-gradient-to-r from-slate-900 to-slate-800 text-white hover:shadow-lg active:scale-95 shadow-md disabled:opacity-60"
          >
            {aiSecLoading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            {aiSecLoading ? 'Scanning' : 'Security Scan'}
          </button>
          {sections.map(s => (
            <SectionTab 
              key={s.id} 
              title={s.title} 
              count={s.count} 
              isActive={activeSection === s.id} 
              onClick={() => toggleSection(s.id)} 
            />
          ))}
        </div>
      </div>

      {/* AI Security Insights */}
      <div className="px-4 md:px-0">
        <AIInsightsBanner insights={aiSecurity} loading={aiSecLoading} onClose={() => setAiSecurity(null)} />
      </div>

      {/* Content Sections - Responsive Cards */}
      <div className="px-4 md:px-0 space-y-4 pb-8">
        {sections.filter(s => activeSection === s.id).map(s => (
          <div key={s.id} className="bg-white border border-slate-100/50 rounded-2xl md:rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all">
            <div className="px-4 md:px-6 py-4 md:py-6">{s.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminPage;
