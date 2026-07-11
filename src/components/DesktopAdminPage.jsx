import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Truck, CarFront, Activity, ExternalLink, ClipboardList, KeyRound, Trash2, UserCog, Loader2, ShieldCheck, AlertTriangle, Plus, Save, X, Briefcase, Download, MessageCircle, DollarSign } from 'lucide-react';
import { sendPasswordResetEmail, auth, db, firebaseConfig, setDoc, doc, deleteApp, initializeApp, getAuth, createUserWithEmailAndPassword, signOut as authSignOut } from '../config/firebase';
import AIInsightsBanner from './AIInsightsBanner';
import { aiSecurityAnalysis } from '../config/ai';
import { isInOutTrip } from '../utils/inOutTrips';
import DriversVehiclesPage from './DriversVehiclesPage';
import UsersPage from './UsersPage';
import DriverAvatar from './DriverAvatar';
import DriverPerformanceCard from './DriverPerformanceCard';
import AdminChatMonitor from './AdminChatMonitor';
import { getDriverLiveStatus } from '../constants/statuses';
import PayrollReportPage from './PayrollReportPage';
import { AdminShell, AdminCard, AdminButton, AdminBadge, AdminIconButton } from './admin/AdminKit';

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
const INTERNAL_AUTH_DOMAIN = 'auth.agapecare.local';
const normalizeEmail = (value = '') => String(value || '').trim().toLowerCase();
const normalizeUsername = (value = '') => String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
const usernameToAuthEmail = (username = '') => {
  const normalized = normalizeUsername(username);
  return normalized ? `${normalized}@${INTERNAL_AUTH_DOMAIN}` : '';
};
const buildStableProfileId = (role, uid) => {
  const seed = String(uid || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'USER';
  if (role === 'dispatcher') return `DSP-${seed}`;
  if (role === 'driver') return `DRV-${seed}`;
  return null;
};

const statusColor = (status) => {
  if (!status) return 'bg-emerald-100 text-emerald-700';
  const s = String(status).toLowerCase();
  if (s === 'busy' || s === 'on trip') return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
};

const SectionTab = ({ title, count, isActive, onClick }) => (
  <button onClick={onClick} className={`px-3 py-2 rounded-xl text-xs font-bold transition-all shrink-0 border ${isActive ? 'bg-slate-900 text-white shadow-sm border-slate-900' : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'}`}>
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
    <AdminCard pad>
      <div className="p-4 border-b border-slate-100 bg-slate-50/70">
        <div className="flex items-center gap-3">
          <DriverAvatar driver={driver} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-slate-900 truncate">{driver.name}</p>
              <AdminBadge tone={getDriverLiveStatus(driver).label.toLowerCase().includes('offline') ? 'offline' : getDriverLiveStatus(driver).label.toLowerCase().includes('trip') || getDriverLiveStatus(driver).label.toLowerCase().includes('busy') ? 'busy' : 'online'} dot>
                {getDriverLiveStatus(driver).label}
              </AdminBadge>
            </div>
            <p className="text-xs text-slate-500">{driver.vehicle || 'No vehicle'} {driver.phone ? `- ${driver.phone}` : ''}</p>
          </div>
          <DriverPerformanceCard driver={driver} trips={trips} compact />
        </div>
      </div>

      <div className="p-4 space-y-3">
        {currentTrip && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Current Trip</span>
              {isInOutTrip(currentTrip) && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200 shrink-0">
                  {currentTrip.inOutLeg ? `${currentTrip.inOutLeg} LEG` : 'IN/OUT'}
                </span>
              )}
              {onViewTrip && (
                <button onClick={() => onViewTrip(currentTrip.id)} className="ml-auto flex items-center gap-1 px-2 py-0.5 bg-blue-600 text-white rounded-lg text-[9px] font-bold hover:bg-blue-700 transition-colors">
                  <ExternalLink size={7} /> View
                </button>
              )}
            </div>
            <p className="font-semibold text-slate-900 text-sm">{currentTrip.patient}</p>
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
            <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 mb-1">Next Trip</p>
            <p className="font-semibold text-slate-900 text-sm">{nextTrip.patient}</p>
            <p className="text-[10px] text-slate-500">{nextTrip.time} - {nextTrip.pickup} to {nextTrip.dropoff}</p>
          </div>
        )}

        {completedTrips.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Recent Completed</p>
            <div className="space-y-1">
              {completedTrips.map((trip, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-emerald-50/50 rounded-lg px-2.5 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="font-semibold text-slate-700 min-w-[80px]">{trip.time}</span>
                  <span className="text-slate-600 truncate">{trip.patient}</span>
                  {isInOutTrip(trip) && (
                    <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200 shrink-0">I/O</span>
                  )}
                  {onViewTrip && (
                    <button onClick={() => onViewTrip(trip.id)} className="ml-auto text-blue-600 hover:text-blue-800 font-bold text-[9px] shrink-0">View</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {driverLogs.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Activity</p>
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
    </AdminCard>
  );
};

const DispatcherActivityCard = ({ dispatcher, logs, onViewTrip }) => {
  const dispLogs = logs.filter(l => {
    const d = String(l?.d || '').toLowerCase();
    const t = String(l?.t || '').toLowerCase();
    return d.includes(dispatcher.name.toLowerCase()) || d.includes((dispatcher.email || '').toLowerCase());
  }).slice(0, 8);

  return (
    <AdminCard pad>
      <div className="p-3.5 border-b border-slate-100 bg-slate-50/70">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-sm font-black text-indigo-700 uppercase shrink-0">
            {(dispatcher.name || '?')[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="font-semibold text-slate-900 text-sm truncate">{dispatcher.name}</p>
              {dispatcher.clockedIn !== undefined && (
                <AdminBadge tone={dispatcher.clockedIn ? 'online' : 'offline'} dot>
                  {dispatcher.clockedIn ? 'Active' : 'Offline'}
                </AdminBadge>
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
                    <span className="font-semibold text-slate-700">{log.t}</span>
                    <p className="text-slate-500 truncate">{log.meta?.summary || log.d}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-slate-400">{fmtTime(log.time)}</span>
                    {tripId && onViewTrip && (
                      <button onClick={() => onViewTrip(tripId)} className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 bg-blue-600 text-white rounded text-[8px] font-bold transition-opacity"><ExternalLink size={7} /></button>
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
    </AdminCard>
  );
};

const buildCsvValue = (value) => `"${String(value ?? '').replace(/"/g, '""').replace(/—/g, '')}"`;

const downloadFile = (content, filename, mimeType) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const exportTripsCsv = (trips, drivers) => {
  const headers = ['Date', 'Driver', 'Scheduled Time', 'Trip ID', 'Passenger', 'Pickup', 'Dropoff', 'Status', 'Reviewed'];
  const rows = (trips || []).map(trip => {
    const driver = drivers?.find(d => d.id === trip.driverId || d.email === trip.driverEmail);
    return [
      buildCsvValue(trip.date || ''),
      buildCsvValue(driver?.name || trip.driverName || ''),
      buildCsvValue(trip.time || ''),
      buildCsvValue(trip.bookingId || trip.id || ''),
      buildCsvValue(trip.patient || ''),
      buildCsvValue(trip.pickup || ''),
      buildCsvValue(trip.dropoff || ''),
      buildCsvValue(trip.status || ''),
      buildCsvValue(trip.reviewed ? 'Yes' : 'No'),
    ].join(',');
  });
  const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  downloadFile(csv, `agape-trips-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8;');
};

const exportDriversCsv = (drivers) => {
  const headers = ['Name', 'Email', 'Phone', 'Vehicle', 'Status', 'ID'];
  const rows = (drivers || []).map(d => [
    buildCsvValue(d.name || ''),
    buildCsvValue(d.email || ''),
    buildCsvValue(d.phone || ''),
    buildCsvValue(d.vehicle || ''),
    buildCsvValue(d.status || ''),
    buildCsvValue(d.id || ''),
  ].join(','));
  const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  downloadFile(csv, `agape-drivers-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8;');
};

const exportFullJson = (trips, drivers, dispatchers, vehicles, logs) => {
  const data = { exportedAt: new Date().toISOString(), trips, drivers, dispatchers, vehicles, logs };
  const json = JSON.stringify(data, null, 2);
  downloadFile(json, `agape-full-export-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
};

const DesktopAdminPage = ({
  role, currentUser, drivers, setDrivers, upsertDriverProfile, dispatchers, setDispatchers,
  addAuditLog, logs = [], trips, vehicles, setVehicles,
  assignTripToDriver, requestAuthAction, onViewTrip, chatUnreadCount = 0
}) => {
  const [activeSection, setActiveSection] = useState(() => role === 'admin' ? 'dispatchers' : 'drivers');
  const [pwResetMsg, setPwResetMsg] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [aiSecurity, setAiSecurity] = useState(null);
  const [aiSecLoading, setAiSecLoading] = useState(false);
  const [createUserRole, setCreateUserRole] = useState(null);
  const [createForm, setCreateForm] = useState({ username: '', password: '', phone: '' });
  const [createError, setCreateError] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [vehicleCreateIntent, setVehicleCreateIntent] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [payrollPolicy, setPayrollPolicy] = useState('SMART_MODE');
  const exportRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const runSecurityAnalysis = useCallback(async () => {
    setAiSecLoading(true);
    const r = await aiSecurityAnalysis([...drivers, ...dispatchers].map(u => ({ email: u.email, role: u.role, lastLogin: u.lastLogin, disabled: u.disabled })), logs || []);
    setAiSecurity(r);
    setAiSecLoading(false);
  }, [drivers, dispatchers, logs]);

  const toggleSection = (id) => {
    setActiveSection(prev => prev === id ? null : id);
  };

  const openCreateUser = (targetRole) => {
    if (targetRole === 'dispatcher' && role !== 'admin') return;
    if (targetRole !== 'driver' && targetRole !== 'dispatcher') return;
    setCreateError('');
    setCreateForm({ username: '', password: '', phone: '' });
    setCreateUserRole(targetRole);
  };

  const closeCreateUser = () => {
    setCreateUserRole(null);
    setCreateError('');
    setCreatingUser(false);
  };

  const createRoleUser = async () => {
    setCreateError('');
    if (!createUserRole) return;
    if (createUserRole === 'dispatcher' && role !== 'admin') {
      setCreateError('Dispatchers cannot create dispatcher accounts.');
      return;
    }
    if (!createForm.username || !createForm.password) {
      setCreateError('Username and password are required.');
      return;
    }
    if (createForm.password.length < 6) {
      setCreateError('Password must be at least 6 characters.');
      return;
    }
    const username = normalizeUsername(createForm.username);
    if (!username) {
      setCreateError('Username can use only letters, numbers, dot, dash, or underscore.');
      return;
    }

    const authEmail = usernameToAuthEmail(username);
    const duplicateDriver = drivers.some((item) => normalizeEmail(item.email) === authEmail || normalizeUsername(item.username || item.name) === username);
    const duplicateDispatcher = dispatchers.some((item) => normalizeEmail(item.email) === authEmail || normalizeUsername(item.username || item.name) === username);
    if (duplicateDriver || duplicateDispatcher) {
      setCreateError('That username is already in use.');
      return;
    }

    let secondaryApp;
    setCreatingUser(true);
    try {
      secondaryApp = initializeApp(firebaseConfig, `secondary-admin-create-${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);
      const userCred = await createUserWithEmailAndPassword(secondaryAuth, authEmail, createForm.password);
      const profileId = buildStableProfileId(createUserRole, userCred.user.uid);
      await setDoc(doc(db, 'users', userCred.user.uid), {
        email: authEmail,
        username,
        name: username,
        role: createUserRole,
        phone: createForm.phone,
        profileId,
        loginType: 'username',
      }, { merge: true });

      await authSignOut(secondaryAuth);
      await deleteApp(secondaryApp);
      secondaryApp = null;

      if (createUserRole === 'dispatcher') {
        setDispatchers(prev => [...prev, {
          id: profileId,
          name: username,
          email: authEmail,
          username,
          phone: createForm.phone,
          clockedIn: false,
        }]);
      } else {
        const currentDispatcher = role === 'dispatcher'
          ? dispatchers.find((item) => normalizeEmail(item.email) === normalizeEmail(currentUser))
          : null;
        setDrivers(prev => [...prev, {
          id: profileId,
          name: username,
          email: authEmail,
          username,
          phone: createForm.phone,
          status: 'Available',
          vehicle: 'Pending Assignment',
          dist: '--',
          currentZone: 'TBD',
          odometer: 0,
          nextOilChange: 5000,
          assignedDispatcher: currentDispatcher?.id || '',
          assignedTo: currentDispatcher?.id || '',
          schedule: [],
          clockedIn: false,
        }]);
      }

      addAuditLog(
        createUserRole === 'dispatcher' ? 'Dispatcher Added' : 'Driver Added',
        `${currentUser} created ${createUserRole} account: ${username}`,
        'emerald',
        { entity: createUserRole, id: profileId, diffs: [{ field: 'username', before: null, after: username }] }
      );
      closeCreateUser();
    } catch (err) {
      if (secondaryApp) await deleteApp(secondaryApp).catch(() => {});
      setCreateError(String(err?.message || 'Could not create account.').replace('Firebase: ', ''));
    } finally {
      setCreatingUser(false);
    }
  };

  const openVehicleCreate = () => {
    setActiveSection('vehicles');
    setVehicleCreateIntent({ nonce: Date.now() });
  };

  const allUsers = useMemo(() => {
    const users = [];
    dispatchers.forEach(d => users.push({ ...d, _role: 'dispatcher', _source: 'dispatchers' }));
    drivers.forEach(d => users.push({ ...d, _role: 'driver', _source: 'drivers' }));
    return users;
  }, [dispatchers, drivers]);

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
        setDispatchers(prev => [...prev, { id: user.id, name: user.name, email: user.email || `${String(user.name || 'dispatcher').replace(/\s+/g, '.').toLowerCase()}@auth.agapecare.local`, clockedIn: false, phone: user.phone || '' }]);
      }
    }
    addAuditLog?.('Role Changed', `${currentUser} changed ${user.name} from ${user._role} to ${newRole}`, 'amber');
  };

  const handleDeleteUser = (user) => {
    if (!requestAuthAction) return;
    requestAuthAction('Delete User', () => {
      if (user._source === 'dispatchers') {
        setDispatchers(prev => prev.filter(d => d.id !== user.id));
      } else if (user._source === 'drivers') {
        setDrivers(prev => prev.filter(d => d.id !== user.id));
      }
      addAuditLog('User Deleted', `${currentUser} deleted ${user.name} (${user._role})`, 'rose');
      setConfirmDelete(null);
    });
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
    { id: 'dispatchers', title: 'Dispatcher Activity', icon: ClipboardList, count: dispatchers.length, roles: ['admin'],
      content: (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {dispatchers.filter(d => d.name).map((disp, i) => (
            <DispatcherActivityCard key={disp.id || i} dispatcher={disp} logs={entityLogs.dispatcher} onViewTrip={onViewTrip} />
          ))}
          {dispatchers.filter(d => d.name).length === 0 && (
            <p className="text-sm text-slate-400 col-span-full text-center py-6">No dispatchers configured.</p>
          )}
        </div>
      ) },
    { id: 'drivers', title: 'Driver Activity', icon: Truck, count: drivers.length, roles: ['admin', 'dispatcher'],
      content: (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {activeDrivers.map((driver, i) => (
            <DriverActivityCard key={driver.id || i} driver={driver} trips={trips} logs={entityLogs.driver} onViewTrip={onViewTrip} />
          ))}
          {activeDrivers.length === 0 && (
            <p className="text-sm text-slate-400 col-span-full text-center py-6">No drivers configured.</p>
          )}
        </div>
      ) },
    { id: 'logins', title: 'Logins & Roles', icon: UserCog, count: allUsers.length, roles: ['admin'],
      content: (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-sm">
            <table className="w-full">
              <thead className="bg-slate-50/80 border-b border-slate-100">
                <tr>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">User</th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Email</th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Role</th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
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
                        className="px-2 py-1 rounded-lg border border-slate-200 text-xs font-bold bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="admin">Admin</option>
                        <option value="dispatcher">Dispatcher</option>
                        <option value="driver">Driver</option>
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      {user._role === 'driver' ? (
                        <AdminBadge tone={getDriverLiveStatus(user).label.toLowerCase().includes('offline') ? 'offline' : getDriverLiveStatus(user).label.toLowerCase().includes('trip') || getDriverLiveStatus(user).label.toLowerCase().includes('busy') ? 'busy' : 'online'} dot>
                          {getDriverLiveStatus(user).label}
                        </AdminBadge>
                      ) : (
                        <AdminBadge tone="info" dot>Active</AdminBadge>
                      )}
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
                          <AdminIconButton onClick={() => handlePasswordReset(user.email)} title="Send password reset email">
                            <KeyRound size={10} /> Reset PW
                          </AdminIconButton>
                        )}
                        <AdminButton variant="ghost" size="sm" onClick={() => handleDeleteUser(user)}>
                          <Trash2 size={10} /> Delete
                        </AdminButton>
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
    { id: 'vehicles', title: 'Vehicles', icon: CarFront, count: vehicles.length, roles: ['admin', 'dispatcher'],
      content: (
        <DriversVehiclesPage
          mode="vehicles"
          role={role} drivers={drivers} setDrivers={setDrivers} upsertDriverProfile={upsertDriverProfile}
          dispatchers={dispatchers}
          addAuditLog={addAuditLog} currentUser={currentUser}
          trips={trips} onAssignTrip={assignTripToDriver}
          requestAuthAction={requestAuthAction}
          vehicles={vehicles} setVehicles={setVehicles}
          createIntent={vehicleCreateIntent}
          onCreateIntentHandled={() => setVehicleCreateIntent(null)}
        />
      ) },
    { id: 'activity', title: 'System Activity', icon: Activity, roles: ['admin', 'dispatcher'],
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
    { id: 'chat', title: 'Chat Monitor', icon: MessageCircle, roles: ['admin'],
      content: (
        <AdminChatMonitor chatUnreadCount={chatUnreadCount} />
      ) },
    { id: 'payroll', title: 'Payroll Report', icon: DollarSign, roles: ['admin', 'dispatcher'],
      content: (
        <PayrollReportPage
          drivers={drivers}
          trips={trips}
          policyMode={payrollPolicy}
          onPolicyChange={setPayrollPolicy}
        />
      ) },
  ];

  const visibleSections = sections.filter((section) => !section.roles || section.roles.includes(role));

  const nav = [{
    label: 'Manage',
    items: visibleSections.map(s => ({
      id: s.id,
      label: s.title,
      icon: s.icon,
      badge: s.id === 'chat' ? (chatUnreadCount > 0 ? chatUnreadCount : undefined) : (s.count != null ? s.count : undefined),
    })),
  }];

  const mobileNav = visibleSections.map(s => ({ id: s.id, label: s.title, icon: s.icon }));

  const activeTitle = visibleSections.find(s => s.id === activeSection)?.title || 'Admin';
  const activeSubtitle = `${drivers.length} drivers · ${dispatchers.length} dispatchers · ${vehicles?.length || 0} vehicles`;

  const topActions = (
    <div className="relative flex items-center gap-2" ref={exportRef}>
      {role === 'admin' && (
        <AdminButton variant="ghost" size="sm" onClick={runSecurityAnalysis} disabled={aiSecLoading}>
          {aiSecLoading ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
          {aiSecLoading ? 'Scanning' : 'Security'}
        </AdminButton>
      )}
      <AdminButton variant="primary" size="sm" onClick={() => openCreateUser('driver')}>
        <Plus size={14} /> Driver
      </AdminButton>
      <AdminButton variant="ghost" size="sm" onClick={openVehicleCreate}>
        <Plus size={14} /> Vehicle
      </AdminButton>
      {role === 'admin' && (
        <AdminButton variant="primary" size="sm" onClick={() => openCreateUser('dispatcher')}>
          <Plus size={14} /> Disp.
        </AdminButton>
      )}
      <div className="relative">
        <AdminButton variant="ghost" size="sm" onClick={() => setExportOpen(v => !v)}>
          <Download size={13} /> Export
        </AdminButton>
        {exportOpen && (
          <div className="absolute right-0 top-full mt-1 z-50 w-40 rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
            <button onClick={() => { exportTripsCsv(trips, drivers); setExportOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">Trips CSV</button>
            <button onClick={() => { exportDriversCsv(drivers); setExportOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">Drivers CSV</button>
            <button onClick={() => { exportFullJson(trips, drivers, dispatchers, vehicles, logs); setExportOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">Full JSON</button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <AdminShell
      nav={nav}
      active={activeSection}
      onNavigate={setActiveSection}
      mobileNav={mobileNav}
      mobileActive={activeSection}
      onMobileNavigate={setActiveSection}
      title={activeTitle}
      subtitle={activeSubtitle}
      eyebrow={role === 'admin' ? 'Admin Workspace' : 'Dispatcher Workspace'}
      actions={topActions}
    >
      {role === 'admin' && aiSecurity && (
        <AIInsightsBanner insights={aiSecurity} loading={aiSecLoading} onClose={() => setAiSecurity(null)} />
      )}
      <div className="space-y-4">
        {visibleSections.filter(s => activeSection === s.id).map(s => (
          <AdminCard key={s.id} pad={false} className="overflow-hidden">
            <div className="p-4 sm:p-5">{s.content}</div>
          </AdminCard>
        ))}
      </div>

      {/* Create User Modal */}
      {createUserRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 sm:px-5 py-3 sm:py-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl sm:rounded-2xl text-white ${createUserRole === 'dispatcher' ? 'bg-blue-600' : 'bg-emerald-600'}`}>
                  {createUserRole === 'dispatcher' ? <Briefcase size={18} /> : <Truck size={18} />}
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-950">Add {createUserRole === 'dispatcher' ? 'Dispatcher' : 'Driver'}</h3>
                  <p className="text-xs font-semibold text-slate-500">Creates login + profile.</p>
                </div>
              </div>
              <button type="button" onClick={closeCreateUser} className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition hover:bg-slate-200" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createRoleUser(); }} className="space-y-4 p-4 sm:p-5">
              {createError && (
                <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {createError}
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-800">Username</label>
                <input type="text" required autoCapitalize="none" autoCorrect="off" spellCheck="false"
                  value={createForm.username}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, username: e.target.value }))}
                  className="adm-input"
                  placeholder={createUserRole === 'dispatcher' ? 'dispatcher.name' : 'driver.name'}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-800">Password</label>
                <input type="password" required
                  value={createForm.password}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, password: e.target.value }))}
                  className="adm-input"
                  placeholder="Min 6 characters"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-800">Phone Number</label>
                <input type="tel"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, phone: e.target.value }))}
                  className="adm-input"
                  placeholder="+1 (555) 000-0000"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <AdminButton variant="ghost" onClick={closeCreateUser}>Cancel</AdminButton>
                <AdminButton type="submit" disabled={creatingUser}>
                  {creatingUser ? 'Creating...' : <span className="inline-flex items-center justify-center gap-2"><Save size={15} /> Create</span>}
                </AdminButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminShell>
  );
};

export default DesktopAdminPage;