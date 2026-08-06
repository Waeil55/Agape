import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Truck, Activity, ExternalLink, KeyRound, Trash2,
  UserCog, Loader2, ShieldCheck, AlertTriangle, Plus, Save, X, Briefcase,
  MessageCircle, DollarSign, LayoutDashboard, Users, Search,
  RadioTower, CircleDot, FileDown, UserPlus, BellRing, TrendingUp, CheckCircle2,
  CalendarClock, Wrench,
} from 'lucide-react';
import { sendPasswordResetEmail, auth, functions, httpsCallable } from '../config/firebase';
import AIInsightsBanner from './AIInsightsBanner';
import { aiSecurityAnalysis } from '../config/ai';
import { isInOutTrip } from '../utils/inOutTrips';
import { recordMatchesSearch } from '../utils/search';
import DriversVehiclesPage from './DriversVehiclesPage';
import UsersPage from './UsersPage';
import DriverAvatar from './DriverAvatar';
import DriverPerformanceCard from './DriverPerformanceCard';

import { getDriverLiveStatus } from '../constants/statuses';
import PayrollReportPage from './PayrollReportPage';
import TimeTrackingAdmin from './TimeTrackingAdmin';
import AdminActivityCenter from './admin/AdminActivityCenter';
import { summarizeFleetMaintenance } from '../utils/fleetMaintenance';
import { ChatPage } from './chat/ChatPage';
import { useChat } from '../hooks/useChat';
import {
  AdminShell, AdminCard, AdminButton, AdminBadge,
  AdminAvatar, AdminSearch, AdminEmpty, AdminCardHead,
} from './admin/AdminKit';

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
const displayRef = (trip) => (trip.bookingId || trip.id || '').replace(/^TRIP-/, 'Trip ID: ');
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

const TeamMemberCard = ({ user, role, live, pwResetMsg, onRoleChange, onResetPassword, onDelete }) => (
  <AdminCard className="admin-person-card" pad={false}>
    <div className="admin-person-top">
      <AdminAvatar name={user.name} brand={user._role === 'driver'} size={46} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-slate-950">{user.name || 'Unnamed'}</h3>
          <AdminBadge tone={user._role === 'driver' ? liveTone(live?.label) : 'info'} dot>
            {user._role === 'driver' ? live?.label : 'Dispatcher'}
          </AdminBadge>
        </div>
        <p className="truncate text-xs font-medium text-slate-500">{user.email || 'No email'}</p>
      </div>
    </div>
    <div className="admin-person-body">
      <div>
        <p className="admin-field-label">Role</p>
        <select value={user._role} onChange={(e) => onRoleChange(user, e.target.value)} className="adm-select w-full">
          {role === 'admin' && <option value="admin">Admin</option>}
          <option value="dispatcher">Dispatcher</option>
          <option value="driver">Driver</option>
        </select>
      </div>
      <div>
        <p className="admin-field-label">Contact</p>
        <p className="truncate text-sm font-semibold text-slate-800">{user.phone || user.vehicle || 'Not set'}</p>
      </div>
    </div>
    <div className="admin-person-actions">
      {user.email && (
        <AdminButton variant="ghost" size="sm" onClick={() => onResetPassword(user.email)}>
          <KeyRound size={13} /> Reset
        </AdminButton>
      )}
      <AdminButton variant="danger" size="sm" onClick={() => onDelete(user)}>
        <Trash2 size={13} /> Delete
      </AdminButton>
      {pwResetMsg[user.email] && (
        <span className={`ml-auto text-[11px] font-semibold ${pwResetMsg[user.email] === 'Email sent!' ? 'text-emerald-600' : 'text-rose-600'}`}>
          {pwResetMsg[user.email]}
        </span>
      )}
    </div>
  </AdminCard>
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
  role, currentUser, drivers = [], setDrivers, upsertDriverProfile, assignVehicleToDriver, dispatchers = [], setDispatchers,
  addAuditLog, logs = [], trips = [], driverTelemetry = [], timeTrackingDeclarations = [], vehicles = [], setVehicles,
  assignTripToDriver, requestAuthAction, onViewTrip, appSettings = {}, onUpdateAppSettings
}) => {
  const { unreadCount } = useChat({ alerts: true });
  const [activeSection, setActiveSection] = useState('overview');
  const [pwResetMsg, setPwResetMsg] = useState({});
  const [aiSecurity, setAiSecurity] = useState(null);
  const [aiSecLoading, setAiSecLoading] = useState(false);
  const [createUserRole, setCreateUserRole] = useState(null);
  const [createForm, setCreateForm] = useState({ username: '', password: '', phone: '' });
  const [createError, setCreateError] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [vehicleCreateIntent, setVehicleCreateIntent] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [payrollPolicy, setPayrollPolicy] = useState('SMART_MODE');
  const [driverQuery, setDriverQuery] = useState('');
  const [teamQuery, setTeamQuery] = useState('');
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
    });
  };

  const activeDrivers = useMemo(() => {
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

  const filteredUsers = useMemo(() => {
    const q = teamQuery.trim().toLowerCase();
    const sorted = [...allUsers].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    if (!q) return sorted;
    return sorted.filter(user => recordMatchesSearch(user, q, [
      'name', 'email', 'phone', 'vehicle', '_role',
    ]));
  }, [allUsers, teamQuery]);

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
      {role === 'admin' && aiSecurity && (
        <AIInsightsBanner insights={aiSecurity} loading={aiSecLoading} onClose={() => setAiSecurity(null)} />
      )}
      {activeSectionConfig?.content}

      {/* Create User Modal */}
      {createUserRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-4">
          <div className="w-full max-w-md overflow-hidden rounded-xl sm:rounded-3xl border border-slate-200 bg-white shadow-2xl">
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
            <form onSubmit={(e) => { e.preventDefault(); createRoleUser(); }} className="space-y-4 p-4 sm:p-5">
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
