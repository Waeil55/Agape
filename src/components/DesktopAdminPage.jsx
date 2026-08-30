import { useState, useMemo, useRef, useEffect } from 'react';
import { Truck, Activity, ExternalLink, UserCog, AlertTriangle, Plus, Save, X, Briefcase, MessageCircle, DollarSign, LayoutDashboard, RadioTower, CircleDot, FileDown, UserPlus, BellRing, TrendingUp, CheckCircle2, CalendarClock, Wrench, ServerCog } from 'lucide-react';
import { functions, httpsCallable } from '../config/firebase';


import { recordMatchesSearch } from '../utils/search';
import DriversVehiclesPage from './DriversVehiclesPage';
import UsersPage from './UsersPage';



import { getDriverLiveStatus } from '../constants/statuses';
import PayrollReportPage from './PayrollReportPage';
import TimeTrackingAdmin from './TimeTrackingAdmin';
import AdminActivityCenter from './admin/AdminActivityCenter';
import { summarizeFleetMaintenance } from '../utils/fleetMaintenance';
import { ChatPage } from './chat/ChatPage';
import SystemControlCenter from './admin/SystemControlCenter';
import { useChat } from '../hooks/useChat';
import { AdminShell, AdminCard, AdminButton, AdminBadge, AdminAvatar, AdminEmpty, AdminCardHead } from './admin/AdminKit';



const getTripIdFromLog = (log) => {
  if (log?.meta?.entity === 'trip' && log?.meta?.id) return log.meta.id;
  const match = String(log?.d || '').match(/\b(TRP-[\w-]+|BK-[\w-]+)\b/i);
  return match ? match[1] : null;
};

const fmtTime = (t) => t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

const INTERNAL_AUTH_DOMAIN = 'auth.agapecare.local';
const normalizeEmail = (value = '') => String(value || '').trim().toLowerCase();
const normalizeUsername = (value = '') => String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
const usernameToAuthEmail = (username = '') => {
  const normalized = normalizeUsername(username);
  return normalized ? `${normalized}@${INTERNAL_AUTH_DOMAIN}` : '';
};
const ACTIVE_TRIP_STATUSES = new Set([
  'Assigned', 'In Progress', 'In Mission', 'En Route', 'Navigating Pickup',
  'At Pickup', 'In Transit', 'Navigating Dropoff', 'At Dropoff', 'Arrived',
]);

const TERMINAL_TRIP_STATUSES = new Set(['Completed', 'Cancelled', 'No Show', 'Rerouted']);

const liveTone = (label) => {
  const l = String(label || '').toLowerCase();
  if (l.includes('offline')) return 'offline';
  if (l.includes('trip') || l.includes('busy')) return 'busy';
  return 'online';
};

const tripTitle = (trip) => (
  trip?.patient || trip?.memberName || trip?.clientName || trip?.bookingId || trip?.id || 'Trip'
);

const tripMeta = (trip) => (
  [
    trip?.time || trip?.pickupTime || trip?.appointmentTime || trip?.date,
    trip?.driverName || trip?.driver || trip?.driverEmail || 'Unassigned',
  ].filter(Boolean).join(' - ')
);

const AdminMetricTile = ({ icon: Icon, label, value, hint, tone = 'brand' }) => (
  <div className={`admin-metric admin-metric--${tone}`}>
    <div className="admin-metric-icon">{Icon && <Icon size={18} />}</div>
    <div>
      <p className="admin-metric-value">{value}</p>
      <p className="admin-metric-label">{label}</p>
      {hint && <p className="admin-metric-hint">{hint}</p>}
    </div>
  </div>
);

const AdminSectionFrame = ({ eyebrow, title, children, action }) => (
  <div className="admin-section-frame">
    <div className="admin-section-frame-head">
      <div>
        {eyebrow && <p className="admin-section-eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
    {children}
  </div>
);

const CompactActivityFeed = ({ logs = [], onViewTrip, limit = 8 }) => (
  <AdminCard pad={false} className="overflow-hidden">
    <AdminCardHead icon={Activity} title="Recent Activity" />
    <div className="admin-feed-list">
      {logs.slice(0, limit).map((log, i) => {
        const tripId = getTripIdFromLog(log);
        return (
          <div key={log.id || log.time || i} className="admin-feed-item">
            <span className={`admin-feed-dot ${log.c === 'rose' ? 'is-danger' : log.c === 'amber' ? 'is-warning' : log.c === 'emerald' ? 'is-success' : ''}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{log.t || 'Activity'}</p>
              <p className="line-clamp-2 text-xs font-medium text-slate-500">{log.meta?.summary || log.d || 'No details'}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-400">{fmtTime(log.time)}</span>
              {tripId && onViewTrip && (
                <button type="button" onClick={() => onViewTrip(tripId)} className="admin-mini-link" aria-label="Open trip">
                  <ExternalLink size={12} />
                </button>
              )}
            </div>
          </div>
        );
      })}
      {logs.length === 0 && <AdminEmpty icon={Activity} title="No activity yet" />}
    </div>
  </AdminCard>
);

const AdminSignalPanel = ({ openTrips, activeTrips, unassignedTrips, offlineDrivers }) => {
  const signals = [
    {
      label: 'Open Manifest',
      value: openTrips.length,
      hint: 'Trips still moving through dispatch',
      tone: openTrips.length ? 'brand' : 'success',
    },
    {
      label: 'Attention Queue',
      value: unassignedTrips.length,
      hint: 'Trips without a ready driver',
      tone: unassignedTrips.length ? 'danger' : 'success',
    },
    {
      label: 'Live Missions',
      value: activeTrips.length,
      hint: 'Drivers actively working',
      tone: activeTrips.length ? 'warning' : 'muted',
    },
  ];

  return (
    <AdminCard pad={false} className="admin-command-panel">
      <AdminCardHead icon={TrendingUp} title="Operations Intelligence" action={<AdminBadge tone={offlineDrivers ? 'warning' : 'online'} dot>{offlineDrivers ? `${offlineDrivers} offline` : 'Stable'}</AdminBadge>} />
      <div className="admin-signal-list">
        {signals.map((signal) => (
          <div key={signal.label} className={`admin-signal-row admin-signal-row--${signal.tone}`}>
            <div>
              <p>{signal.label}</p>
              <span>{signal.hint}</span>
            </div>
            <strong>{signal.value}</strong>
          </div>
        ))}
      </div>
    </AdminCard>
  );
};

const AdminCoveragePanel = ({ counts, total }) => {
  const safeTotal = Math.max(total, 1);
  const rows = [
    { label: 'Online', value: counts.online, tone: 'online' },
    { label: 'Busy', value: counts.busy, tone: 'busy' },
    { label: 'Offline', value: counts.offline, tone: 'offline' },
  ];

  return (
    <AdminCard pad={false} className="admin-command-panel">
      <AdminCardHead icon={RadioTower} title="Coverage Mix" action={<AdminBadge tone="brand">{total} drivers</AdminBadge>} />
      <div className="admin-coverage-list">
        {rows.map((row) => (
          <div key={row.label} className="admin-coverage-row">
            <div className="admin-coverage-head">
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
            <div className="admin-coverage-track">
              <span className={`admin-coverage-fill is-${row.tone}`} style={{ width: `${Math.round((row.value / safeTotal) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </AdminCard>
  );
};

const AdminPriorityQueue = ({ trips = [], onViewTrip }) => (
  <AdminCard pad={false} className="admin-command-panel">
    <AdminCardHead icon={BellRing} title="Priority Queue" action={<AdminBadge tone={trips.length ? 'danger' : 'success'}>{trips.length ? `${trips.length} watch` : 'Clear'}</AdminBadge>} />
    <div className="admin-priority-list">
      {trips.slice(0, 5).map((trip, index) => (
        <div key={trip.id || trip.bookingId || index} className="admin-priority-row">
          <div className="admin-priority-rank">{index + 1}</div>
          <div className="min-w-0 flex-1">
            <div className="admin-priority-title">
              <p>{tripTitle(trip)}</p>
              <AdminBadge tone={!trip.driverId || trip.status === 'Unassigned' ? 'danger' : 'warning'}>{trip.status || 'Open'}</AdminBadge>
            </div>
            <span>{tripMeta(trip)}</span>
          </div>
          {onViewTrip && (
            <button type="button" onClick={() => onViewTrip(trip.id || trip.bookingId)} className="admin-mini-link" aria-label="Open trip">
              <ExternalLink size={12} />
            </button>
          )}
        </div>
      ))}
      {trips.length === 0 && <AdminEmpty icon={CheckCircle2} title="No priority items" hint="Open work is currently under control" />}
    </div>
  </AdminCard>
);







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
  role, currentUser, drivers = [], setDrivers, upsertDriverProfile, assignVehicleToDriver, dispatchers = [], setDispatchers,
  addAuditLog, logs = [], trips = [], driverTelemetry = [], timeTrackingDeclarations = [], vehicles = [], setVehicles,
  assignTripToDriver, requestAuthAction, onViewTrip, appSettings = {}, onUpdateAppSettings
}) => {
  const { unreadCount } = useChat({ alerts: true });
  const [activeSection, setActiveSection] = useState('overview');

  const [createUserRole, setCreateUserRole] = useState(null);
  const [createForm, setCreateForm] = useState({ username: '', password: '', phone: '' });
  const [createError, setCreateError] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [vehicleCreateIntent, setVehicleCreateIntent] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [payrollPolicy, setPayrollPolicy] = useState('SMART_MODE');
  const [driverQuery] = useState('');
  const exportRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);



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

    setCreatingUser(true);
    try {
      const createUserFn = httpsCallable(functions, 'createUser');
      const result = await createUserFn({ email: authEmail, username, name: username, password: createForm.password, role: createUserRole, phone: createForm.phone });
      const profileId = result?.data?.profileId;

      addAuditLog(
        createUserRole === 'dispatcher' ? 'Dispatcher Added' : 'Driver Added',
        `${currentUser} created ${createUserRole} account: ${username}`,
        'emerald',
        { entity: createUserRole, id: profileId, diffs: [{ field: 'username', before: null, after: username }] }
      );
      closeCreateUser();
    } catch (err) {
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







  const activeDrivers = useMemo(() => {
    return drivers
      .filter(d => d.name)
      .sort((a, b) => {
        const aActive = trips.some(t => t.driverId === a.id && ['In Progress', 'Navigating Pickup', 'At Pickup', 'In Transit', 'Assigned'].includes(t.status)) ? 0 : 1;
        const bActive = trips.some(t => t.driverId === b.id && ['In Progress', 'Navigating Pickup', 'At Pickup', 'In Transit', 'Assigned'].includes(t.status)) ? 0 : 1;
        return aActive - bActive;
      });
  }, [drivers, trips]);



  const activeTrips = useMemo(() => trips.filter(t => ACTIVE_TRIP_STATUSES.has(t.status)), [trips]);
  const completedTrips = useMemo(() => trips.filter(t => t.status === 'Completed'), [trips]);
  const openTrips = useMemo(() => trips.filter(t => !TERMINAL_TRIP_STATUSES.has(t.status)), [trips]);
  const unassignedTrips = useMemo(() => openTrips.filter(t => !t.driverId || t.status === 'Unassigned'), [openTrips]);
  const attentionTrips = useMemo(() => {
    const ranked = [...openTrips].sort((a, b) => {
      const aNeedsDriver = (!a.driverId || a.status === 'Unassigned') ? 0 : 1;
      const bNeedsDriver = (!b.driverId || b.status === 'Unassigned') ? 0 : 1;
      return aNeedsDriver - bNeedsDriver;
    });
    return ranked.slice(0, 8);
  }, [openTrips]);

  const driverStatusCounts = useMemo(() => {
    let online = 0;
    let busy = 0;
    let offline = 0;
    drivers.forEach((driver) => {
      const label = getDriverLiveStatus(driver).label;
      const tone = liveTone(label);
      if (tone === 'offline') offline += 1;
      else if (tone === 'busy') busy += 1;
      else online += 1;
    });
    return { online, busy, offline };
  }, [drivers]);

  const maintenance = useMemo(
    () => summarizeFleetMaintenance(vehicles, completedTrips, drivers, appSettings.maintenancePolicy),
    [vehicles, completedTrips, drivers, appSettings.maintenancePolicy]
  );

  const filteredDrivers = useMemo(() => {
    const q = driverQuery.trim().toLowerCase();
    if (!q) return activeDrivers;
    return activeDrivers.filter(driver => recordMatchesSearch(driver, q, [
      'name', 'email', 'phone', 'vehicle', 'currentZone',
    ]));
  }, [activeDrivers, driverQuery]);



  const overviewDrivers = filteredDrivers.slice(0, 6);
  const overviewDispatchers = dispatchers.filter(d => d.name).slice(0, 4);

  const sections = [
    { id: 'overview', title: 'Command Center', icon: LayoutDashboard, roles: ['admin', 'dispatcher'],
      content: (
        <div className="admin-dashboard">
          <div className="admin-command-hero">
            <div className="min-w-0">
              <p className="admin-section-eyebrow">Live operations</p>
              <h2>Admin command center</h2>
              <p>Clean overview of people, fleet activity, open trips, system signals, and admin actions.</p>
              <div className="admin-hero-signal-strip">
                <span><CheckCircle2 size={13} /> {completedTrips.length} completed</span>
                <span><BellRing size={13} /> {unassignedTrips.length} needs dispatch</span>
              </div>
            </div>
            <div className="admin-hero-actions">
              <AdminButton variant="primary" onClick={() => openCreateUser('driver')}><UserPlus size={16} /> Add driver</AdminButton>
              {role === 'admin' && <AdminButton variant="ghost" onClick={() => openCreateUser('dispatcher')}><Briefcase size={16} /> Add dispatcher</AdminButton>}
            </div>
          </div>

          <div className="admin-metric-grid">
            <AdminMetricTile icon={Truck} value={drivers.length} label="Drivers" hint={`${driverStatusCounts.online} online`} tone="brand" />
            <AdminMetricTile icon={RadioTower} value={driverStatusCounts.busy} label="Busy now" hint={`${activeTrips.length} active trips`} tone="warning" />
            <AdminMetricTile icon={CircleDot} value={unassignedTrips.length} label="Unassigned" hint="Need attention" tone={unassignedTrips.length ? 'danger' : 'success'} />
            <AdminMetricTile icon={Wrench} value={maintenance.attention} label="Service attention" hint={`${maintenance.overdue + maintenance.due} due · ${maintenance.dueSoon} soon`} tone={maintenance.overdue || maintenance.due ? 'danger' : maintenance.attention ? 'warning' : 'success'} />
          </div>

          <div className="admin-intelligence-grid">
            <AdminSignalPanel
              openTrips={openTrips}
              activeTrips={activeTrips}
              unassignedTrips={unassignedTrips}
              offlineDrivers={driverStatusCounts.offline}
            />
            <AdminCoveragePanel counts={driverStatusCounts} total={drivers.length} />
            <AdminPriorityQueue trips={attentionTrips} onViewTrip={onViewTrip} />
          </div>

          <div className="admin-overview-grid">
            <AdminCard pad={false} className="overflow-hidden">
              <AdminCardHead icon={Truck} title="Fleet Snapshot" action={<AdminBadge tone="brand">{openTrips.length} open trips</AdminBadge>} />
              <div className="admin-live-list">
                {overviewDrivers.map((driver) => {
                  const live = getDriverLiveStatus(driver);
                  const currentTrip = trips.find(t => (t.driverId === driver.id || t.driverName === driver.name) && ACTIVE_TRIP_STATUSES.has(t.status));
                  return (
                    <div key={driver.id || driver.email || driver.name} className="admin-live-row">
                      <AdminAvatar name={driver.name} brand size={42} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-950">{driver.name}</p>
                          <AdminBadge tone={liveTone(live.label)} dot>{live.label}</AdminBadge>
                        </div>
                        <p className="truncate text-xs font-medium text-slate-500">{currentTrip ? `${currentTrip.patient || 'Trip'} - ${currentTrip.status}` : driver.vehicle || 'No vehicle assigned'}</p>
                      </div>
                      <span className="text-xs font-semibold text-slate-400">{driver.currentZone || '--'}</span>
                    </div>
                  );
                })}
                {overviewDrivers.length === 0 && <AdminEmpty icon={Truck} title="No drivers available" />}
              </div>
            </AdminCard>

            <div className="space-y-4">
              <AdminCard pad={false} className="overflow-hidden">
                <AdminCardHead icon={Briefcase} title="Dispatch Desk" action={<AdminBadge tone="info">{overviewDispatchers.length} shown</AdminBadge>} />
                <div className="admin-live-list">
                  {overviewDispatchers.map((dispatcher) => (
                    <div key={dispatcher.id || dispatcher.email || dispatcher.name} className="admin-live-row">
                      <AdminAvatar name={dispatcher.name} size={38} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-950">{dispatcher.name}</p>
                        <p className="truncate text-xs font-medium text-slate-500">{dispatcher.email || 'No email'}</p>
                      </div>
                      <AdminBadge tone={dispatcher.clockedIn ? 'online' : 'muted'} dot>{dispatcher.clockedIn ? 'Online' : 'Ready'}</AdminBadge>
                    </div>
                  ))}
                  {overviewDispatchers.length === 0 && <AdminEmpty icon={Briefcase} title="No dispatchers configured" />}
                </div>
              </AdminCard>
              <CompactActivityFeed logs={logs} onViewTrip={onViewTrip} limit={5} />
            </div>
          </div>
        </div>
      ) },
    { id: 'drivers', title: 'Fleet & Vehicles', icon: Truck, count: drivers.length + (vehicles?.length || 0), roles: ['admin', 'dispatcher'],
      content: (
        <AdminSectionFrame
          eyebrow="Fleet operations"
          title="Fleet board"
          action={(
            <div className="flex items-center gap-2">
              <AdminButton variant="primary" size="sm" onClick={() => openCreateUser('driver')}>
                <Plus size={14} /> Add driver
              </AdminButton>
              <AdminButton variant="ghost" size="sm" onClick={openVehicleCreate}>
                <Plus size={14} /> Add vehicle
              </AdminButton>
            </div>
          )}
        >
          <DriversVehiclesPage
            mode="all"
            role={role} drivers={drivers} setDrivers={setDrivers} upsertDriverProfile={upsertDriverProfile}
            assignVehicleToDriver={assignVehicleToDriver}
            dispatchers={dispatchers}
            addAuditLog={addAuditLog} currentUser={currentUser}
            trips={trips} onAssignTrip={assignTripToDriver}
            requestAuthAction={requestAuthAction}
            vehicles={vehicles} setVehicles={setVehicles}
            appSettings={appSettings} onUpdateAppSettings={onUpdateAppSettings}
            createIntent={vehicleCreateIntent}
            onCreateIntentHandled={() => setVehicleCreateIntent(null)}
          />
        </AdminSectionFrame>
      ) },
    { id: 'people', title: 'People & Access', icon: UserCog, count: allUsers.length, roles: ['admin'],
      content: (
        <AdminSectionFrame
          eyebrow="Access control"
          title="Identity, employment & access"
        >
          <UsersPage
            drivers={drivers} setDrivers={setDrivers}
            dispatchers={dispatchers} setDispatchers={setDispatchers}
            addAuditLog={addAuditLog} currentUser={currentUser}
            role={role} requestAuthAction={requestAuthAction}
            logs={logs} hideActivityFeed hideAiInsights hideRoleCards
          />
        </AdminSectionFrame>
      ) },
    { id: 'time', title: 'Driver Time & Notes', icon: CalendarClock, roles: ['admin', 'dispatcher'],
      content: (
        <AdminSectionFrame eyebrow="Workforce control" title="Driver time, notes & corrections">
          <TimeTrackingAdmin
            drivers={drivers}
            trips={trips}
            driverTelemetry={driverTelemetry}
            timeTrackingDeclarations={timeTrackingDeclarations}
            onUpdateHourlyRate={(driverId, hourlyRate) => upsertDriverProfile?.(driverId, { hourlyRate })}
          />
        </AdminSectionFrame>
      ) },
    { id: 'activity', title: 'Activity', icon: Activity, roles: ['admin', 'dispatcher'],
      content: (
        <AdminSectionFrame
          eyebrow="Audit trail"
          title="System activity"
          action={(
            <div className="relative" ref={exportRef}>
              <AdminButton variant="ghost" size="sm" onClick={() => setExportOpen(v => !v)}>
                <FileDown size={13} /> Export
              </AdminButton>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 w-40 rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                  <button onClick={() => { exportTripsCsv(trips, drivers); setExportOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">Trips CSV</button>
                  <button onClick={() => { exportDriversCsv(drivers); setExportOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">Drivers CSV</button>
                  <button onClick={() => { exportFullJson(trips, drivers, dispatchers, vehicles, logs); setExportOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">Full JSON</button>
                </div>
              )}
            </div>
          )}
        >
          <AdminActivityCenter logs={logs} onViewTrip={onViewTrip} />
        </AdminSectionFrame>
      ) },

    { id: 'system', title: 'System Control', icon: ServerCog, roles: ['admin'],
      content: (
        <AdminSectionFrame eyebrow="Security, compliance & performance" title="System control center">
          <SystemControlCenter trips={trips} drivers={drivers} vehicles={vehicles} logs={logs} appSettings={appSettings} />
        </AdminSectionFrame>
      ) },

    { id: 'payroll', title: 'Payroll', icon: DollarSign, roles: ['admin', 'dispatcher'],
      content: (
        <AdminSectionFrame eyebrow="Finance" title="Payroll report">
          <PayrollReportPage
            drivers={drivers}
            trips={trips}
            driverTelemetry={driverTelemetry}
            timeTrackingDeclarations={timeTrackingDeclarations}
            policyMode={payrollPolicy}
            onPolicyChange={setPayrollPolicy}
          />
        </AdminSectionFrame>
      ) },
    { id: 'chat', title: 'Chat', icon: MessageCircle, roles: ['admin', 'dispatcher'], count: unreadCount || undefined,
      content: (
        <AdminSectionFrame eyebrow="Communication" title="Team Messenger">
          <div className="h-[650px] border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <ChatPage />
          </div>
        </AdminSectionFrame>
      ) },
  ];

  const visibleSections = sections.filter((section) => !section.roles || section.roles.includes(role));

  const nav = [{
    label: 'Command',
    items: visibleSections.map(s => ({
      id: s.id,
      label: s.title,
      icon: s.icon,
      badge: s.count != null ? s.count : undefined,
    })),
  }];

  const mobileNav = visibleSections.map(s => ({ id: s.id, label: s.title, icon: s.icon }));

  const activeSectionConfig = visibleSections.find(s => s.id === activeSection) || visibleSections[0];
  const activeTitle = activeSectionConfig?.title || 'Admin';

  return (
    <AdminShell
      nav={nav}
      active={activeSection}
      onNavigate={setActiveSection}
      mobileNav={mobileNav}
      mobileActive={activeSection}
      onMobileNavigate={setActiveSection}
      title={activeTitle}
      subtitle=""
      eyebrow=""
      hideBrand
      navInline
    >
      {activeSectionConfig?.content}

      {/* Create User Modal */}
      {createUserRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-4">
          <div role="dialog" aria-modal="true" aria-label={`Add ${createUserRole}`} className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-xl sm:rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 sm:px-5 py-3 sm:py-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl sm:rounded-xl text-white ${createUserRole === 'dispatcher' ? 'bg-blue-600' : 'bg-emerald-600'}`}>
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
            <form onSubmit={(e) => { e.preventDefault(); createRoleUser(); }} className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
              {createError && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
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
