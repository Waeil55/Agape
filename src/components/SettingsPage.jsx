import { useState, useEffect, lazy, Suspense } from 'react';
import { LogOut, AlertCircle, Database, Eye, EyeOff, Save, Navigation, Type, Route, Phone, CheckCircle2, XCircle, TextSelect, Accessibility, Smartphone, Maximize2, Minus, Plus, Users, Activity, User, Bell, KeyRound, Truck, RefreshCw, Trash2, RotateCcw } from 'lucide-react';
import { makeCall } from '../utils/nativeActions';
import { auth, db, doc, setDoc, onSnapshot, updatePassword } from '../config/firebase';

const LazySystemHealth = lazy(() => import('./SystemHealthDashboard'));
const LazyAutomatedAlerts = lazy(() => import('./AutomatedAlertsPanel'));
const LazyDocumentTracker = lazy(() => import('./DocumentExpirationTracker'));
const LazyFleetUtilization = lazy(() => import('./FleetUtilizationReport'));

const ActivityRow = ({ log }) => {
  const [open, setOpen] = useState(false);
  const colorClass = log.c === 'rose' ? 'bg-rose-500' : log.c === 'emerald' ? 'bg-emerald-500' : log.c === 'blue' ? 'bg-blue-500' : log.c === 'amber' ? 'bg-amber-500' : 'bg-slate-400';
  return (
    <div className="px-3 sm:px-4 py-1.5 hover:bg-slate-50">
      <div className="flex items-start gap-3 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${colorClass}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900">{log.t}</p>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{log.d}</p>
          {open && log.meta && log.meta.diffs && (
            <div className="mt-3 p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-700">
              <div className="mb-2 font-semibold text-slate-800">Changes</div>
              <div className="space-y-2">
                {log.meta.diffs.map((dd, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="w-32 text-slate-500">{dd.field}</div>
                    <div className="flex-1">
                      <div className="text-[13px] text-slate-600"><span className="font-semibold">Before:</span> <span className="font-mono text-slate-700">{dd.before ?? '—'}</span></div>
                      <div className="text-[13px] text-slate-600 mt-0.5"><span className="font-semibold">After:</span> <span className="font-mono text-slate-700">{dd.after ?? '—'}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <span className="text-[10px] font-semibold text-slate-400 flex-shrink-0">{log.timestamp}</span>
      </div>
    </div>
  );
};

const FONT_SCALE_OPTIONS = [
  { value: 'sm', label: 'Small', desc: 'Compact view — more content on screen', icon: Minus },
  { value: 'md', label: 'Default', desc: 'Standard readability — recommended', icon: TextSelect },
  { value: 'lg', label: 'Large', desc: 'Larger text — easier to read', icon: Plus },
  { value: 'xl', label: 'Extra Large', desc: 'Maximum readability — reduced eye strain', icon: Maximize2 },
  { value: 'driver', label: 'Driver Mode', desc: 'Ultra-readable — optimized for in-vehicle use', icon: Smartphone },
];

const NAV_OPTIONS = [
  { value: 'google', label: 'Google Maps', icon: Navigation },
  { value: 'waze', label: 'Waze', icon: Navigation },
  { value: 'apple', label: 'Apple Maps', icon: Navigation },
];

const PERMISSION_LABELS = {
  canDeleteTrip: 'Archive Trips',
  canAssignTrip: 'Assign Trips',
  canManageUsers: 'Manage Users',
  canViewReports: 'View Reports',
  canEditFleet: 'Edit Fleet',
  canViewLiveMap: 'View Live Map',
  canOptimizeFleet: 'Optimize Fleet',
  canResetSystem: 'System Reset',
};

const ROLE_LABELS = {
  admin: 'Admin',
  dispatcher: 'Dispatcher',
  driver: 'Driver',
  billing: 'Billing',
  qa_auditor: 'QA Auditor',
  fleet_manager: 'Fleet Manager',
  supervisor: 'Supervisor',
};

const ROLE_COLORS = {
  admin: 'bg-rose-100 text-rose-800',
  dispatcher: 'bg-blue-100 text-blue-800',
  driver: 'bg-emerald-100 text-emerald-800',
  billing: 'bg-purple-100 text-purple-800',
  qa_auditor: 'bg-amber-100 text-amber-800',
  fleet_manager: 'bg-cyan-100 text-cyan-800',
  supervisor: 'bg-indigo-100 text-indigo-800',
};

const SettingsPage = ({
  currentUser,
  role,
  onLogout,
  onResetSystem,
  trashedTrips = [],
  restoreTrip,
  deleteTrashedTrip,
  appSettings,
  onUpdateAppSettings,
  updateAppSettings: updateAppSettingsAlias,
  driverProfile,
  phoneNumbers,
  onUpdatePhoneNumbers,
  setPhoneNumbers: setPhoneNumbersAlias,
  requestAuthAction,
  hasPermission,
  trips = [],
  drivers = [],
  dispatchers = [],
  vehicles = [],
  logs = [],
  initialSection,
  persistState,
}) => {
  const _updateSettings = onUpdateAppSettings || updateAppSettingsAlias;
  const _updatePhone = onUpdatePhoneNumbers || ((updates) => { setPhoneNumbersAlias?.(prev => ({ ...prev, ...updates })); persistState?.(); });
  const userKey = (currentUser || 'anon').replace(/[^a-zA-Z0-9]/g, '_');
  const personalSectionIds = ['profile', 'appearance', 'accessibility', 'navigation', 'notifications', 'security'];
  if (role === 'dispatcher') personalSectionIds.unshift('activity');
  const resolvedInitialSection = personalSectionIds.includes(initialSection) ? initialSection : 'profile';
  const [activeSection, setActiveSection] = useState(() => {
    const stored = localStorage.getItem(`agape_settingsSection_${userKey}`);
    return initialSection ? resolvedInitialSection : (personalSectionIds.includes(stored) ? stored : 'profile');
  });
  const [showArchivedTrips, setShowArchivedTrips] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    if (resolvedInitialSection && resolvedInitialSection !== activeSection) {
      setActiveSection(resolvedInitialSection);
    }
  }, [resolvedInitialSection, userKey]);

  useEffect(() => {
    localStorage.setItem(`agape_settingsSection_${userKey}`, activeSection);
  }, [activeSection, userKey]);
  const [showPassword, setShowPassword] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [deleteConfirmTrip, setDeleteConfirmTrip] = useState(null);
  const [chatRetention, setChatRetention] = useState({ enabled: false, legalHold: false, retentionDays: 365 });
  const [chatPolicyStatus, setChatPolicyStatus] = useState('');

  const saveSettings = async (updates, driverOnly = false) => {
    if (!_updateSettings) {
      setSaveStatus('Settings service is unavailable for this account.');
      return false;
    }
    setSaveStatus('Saving changes...');
    try {
      await Promise.resolve(_updateSettings(updates, driverOnly));
      setSaveStatus('All changes saved.');
      window.setTimeout(() => setSaveStatus(''), 2400);
      return true;
    } catch (error) {
      setSaveStatus(error?.message || 'Changes could not be saved.');
      return false;
    }
  };

  useEffect(() => {
    if (role !== 'admin') return undefined;
    return onSnapshot(doc(db, 'systemConfig', 'chatRetention'), snapshot => {
      if (snapshot.exists()) setChatRetention(current => ({ ...current, ...snapshot.data() }));
    });
  }, [role]);

  const handlePasswordChange = async () => {
    setPwMsg('');
    if (newPw.length < 6) { setPwMsg('Password must be at least 6 characters.'); return; }
    if (newPw !== confirmPw) { setPwMsg('Passwords do not match.'); return; }
    try {
      await updatePassword(auth.currentUser, newPw);
      setPwMsg('Password updated successfully.');
      setNewPw(''); setConfirmPw('');
    } catch (err) { setPwMsg(err.message.replace('Firebase: ', '')); }
  };

  const personalNav = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'accessibility', label: 'Accessibility', icon: Accessibility },
    { id: 'navigation', label: 'Navigation', icon: Route },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: KeyRound },
  ];

  // Make System Activity available to dispatchers as a personal section (they will be filtered)
  if (role === 'dispatcher' && !personalNav.find(p => p.id === 'activity')) {
    personalNav.unshift({ id: 'activity', label: 'System Activity', icon: Activity });
  }

  const navItems = [
    { group: 'Account & preferences', items: personalNav },
  ];
  const mobileNavItems = navItems.flatMap((group) => group.items);

  const sectionContent = () => {
    switch (activeSection) {
      // ===== OVERVIEW =====
      case 'overview':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-heading text-slate-900 mb-1">Overview</h3>
              <p className="text-body text-slate-500">System-wide statistics and quick actions.</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Active Trips', value: trips.filter(t => !['Cancelled', 'No Show', 'Completed'].includes(t.status)).length, icon: Truck, color: 'bg-blue-600' },
                { label: 'Total Drivers', value: drivers.length, icon: Users, color: 'bg-emerald-600' },
                { label: 'Dispatchers', value: dispatchers.length, icon: User, color: 'bg-purple-600' },
                { label: 'Total Trips', value: trips.length, icon: Activity, color: 'bg-cyan-600' },
                { label: 'Vehicles', value: vehicles.length, icon: Truck, color: 'bg-indigo-600' },
                { label: 'Cancelled / No Show', value: trips.filter(t => ['Cancelled', 'No Show'].includes(t.status)).length, icon: XCircle, color: 'bg-rose-600' },
                { label: 'Completed Today', value: trips.filter(t => t.status === 'Completed').length, icon: CheckCircle2, color: 'bg-emerald-600' },
              ].map((stat, i) => {
                const Icon = stat.icon;
                return (
                  <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                    <div className={`w-9 h-9 rounded-xl ${stat.color} flex items-center justify-center mb-3`}>
                      <Icon size={16} className="text-white" />
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                    <p className="text-xs font-semibold text-slate-500 mt-0.5">{stat.label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        );

      // ===== USER MANAGEMENT =====
      case 'users':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-heading text-slate-900 mb-1">User Management</h3>
              <p className="text-body text-slate-500">All registered drivers and dispatchers.</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="app-table-frame">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-slate-600">Name</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-slate-600">Email</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-slate-600">Role</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dispatchers.map((d) => (
                      <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-1.5 font-semibold text-slate-900">{d.name || '—'}</td>
                        <td className="px-3 py-1.5 text-slate-600 font-mono text-xs">{d.email || '—'}</td>
                        <td className="px-3 py-1.5"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_COLORS[d.role] || 'bg-slate-100 text-slate-600'}`}>{ROLE_LABELS[d.role] || d.role}</span></td>
                        <td className="px-3 py-1.5"><span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><span className="w-2 h-2 rounded-full bg-emerald-500" />Active</span></td>
                      </tr>
                    ))}
                    {drivers.map((d) => (
                      <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-1.5 font-semibold text-slate-900">{d.name || '—'}</td>
                        <td className="px-3 py-1.5 text-slate-600 font-mono text-xs">{d.email || '—'}</td>
                        <td className="px-3 py-1.5"><span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">Driver</span></td>
                        <td className="px-3 py-1.5"><span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><span className="w-2 h-2 rounded-full bg-emerald-500" />Active</span></td>
                      </tr>
                    ))}
                    {(dispatchers.length + drivers.length) === 0 && (
                      <tr><td colSpan="4" className="px-4 py-12 text-center text-slate-500">No users found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      // ===== SYSTEM ACTIVITY =====
      case 'activity':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-heading text-slate-900 mb-1">System Activity</h3>
              <p className="text-body text-slate-500">Audit log of all user actions and system events.</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                {(() => {
                  const displayedLogs = role === 'dispatcher' ? (logs || []).filter(l => (l.actorRole || '') !== 'admin') : (logs || []);
                  return displayedLogs.length === 0 ? (
                    <div className="px-6 py-12 text-center text-slate-500">No activity recorded yet.</div>
                  ) : (
                    displayedLogs.map((log, i) => (
                      <ActivityRow key={i} index={i} log={log} isDispatcher={role === 'dispatcher'} />
                    ))
                  );
                })()}
              </div>
            </div>
          </div>
        );

      // ===== PERMISSIONS =====
      case 'permissions':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-heading text-slate-900 mb-1">Roles &amp; Permissions</h3>
              <p className="text-body text-slate-500">Capability matrix for every role in the system.</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm p-5 sm:p-8">
              <div className="app-table-frame">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-slate-700 whitespace-nowrap">Permission</th>
                      {Object.keys(ROLE_LABELS).map(r => (
                        <th key={r} className="px-3 py-1.5 text-center text-xs font-semibold text-slate-700 whitespace-nowrap">{ROLE_LABELS[r]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(PERMISSION_LABELS).map(pkey => (
                      <tr key={pkey} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="px-3 py-1.5 font-semibold text-slate-800 whitespace-nowrap">{PERMISSION_LABELS[pkey]}</td>
                        {Object.keys(ROLE_LABELS).map(r => {
                          const allowed = hasPermission ? hasPermission(r, pkey) : false;
                          return (
                            <td key={r} className="px-3 py-1.5 text-center">
                              {allowed ? <CheckCircle2 size={18} className="inline text-emerald-600" /> : <XCircle size={18} className="inline text-slate-300" />}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      // ===== ARCHIVED TRIPS =====
      case 'archived':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-heading text-slate-900 mb-1">Archived Trips</h3>
              <p className="text-body text-slate-500">Trips that have been archived from operations. Restore to reactivate or permanently delete.</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm p-5 sm:p-8">
              {!showArchivedTrips ? (
                <button onClick={() => setShowArchivedTrips(true)} className="px-6 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold transition flex items-center justify-center gap-2 text-base">
                  <Eye size={20} /> View Archived ({trashedTrips.length})
                </button>
              ) : (
                <div>
                  <button onClick={() => setShowArchivedTrips(false)} className="mb-4 px-4 py-2 text-slate-600 hover:text-slate-900 font-semibold text-sm">← Hide</button>
                  <div className="app-table-frame">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 sm:px-4 py-1.5 text-left text-xs font-semibold text-slate-600">Booking ID</th>
                          <th className="px-3 sm:px-4 py-1.5 text-left text-xs font-semibold text-slate-600">Patient</th>
                          <th className="px-3 sm:px-4 py-1.5 text-left text-xs font-semibold text-slate-600 hidden sm:table-cell">Pickup</th>
                          <th className="px-3 sm:px-4 py-1.5 text-left text-xs font-semibold text-slate-600 hidden sm:table-cell">Dropoff</th>
                          <th className="px-3 sm:px-4 py-1.5 text-left text-xs font-semibold text-slate-600">Time</th>
                          <th className="px-3 sm:px-4 py-1.5 text-right text-xs font-semibold text-slate-600">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trashedTrips.length === 0 ? (
                          <tr><td colSpan="6" className="px-4 sm:px-6 py-12 text-center text-slate-500 text-base">No archived trips.</td></tr>
                        ) : (
                          trashedTrips.map((trip) => (
                            <tr key={trip.id} className="border-b border-slate-100 hover:bg-slate-50">
                              <td className="px-3 sm:px-4 py-1.5 font-mono text-xs text-slate-600">{trip.bookingId || '—'}</td>
                              <td className="px-3 sm:px-4 py-1.5 text-xs font-semibold text-slate-900">{trip.patient}</td>
                              <td className="px-3 sm:px-4 py-1.5 text-xs text-emerald-600 hidden sm:table-cell">{trip.pickup}</td>
                              <td className="px-3 sm:px-4 py-1.5 text-xs text-rose-600 hidden sm:table-cell">{trip.dropoff}</td>
                              <td className="px-3 sm:px-4 py-1.5 text-xs text-slate-600">{trip.time}</td>
                              <td className="px-3 sm:px-4 py-1.5 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button onClick={() => restoreTrip?.(trip.id)} className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-200 transition flex items-center gap-1" title="Restore trip">
                                    <RotateCcw size={12} /> Restore
                                  </button>
                                  <button onClick={() => setDeleteConfirmTrip(trip)} className="px-2.5 py-1 bg-rose-100 text-rose-700 rounded-lg text-xs font-bold hover:bg-rose-200 transition flex items-center gap-1" title="Permanently delete">
                                    <Trash2 size={12} /> Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      // ===== SYSTEM HEALTH =====
      case 'health':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-heading text-slate-900 mb-1">System Health</h3>
              <p className="text-body text-slate-500">Real-time system status and performance metrics.</p>
            </div>
            <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}>
              <LazySystemHealth trips={trips} drivers={drivers} logs={logs} appSettings={appSettings} />
            </Suspense>
          </div>
        );

      // ===== AUTOMATED ALERTS =====
      case 'alerts':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-heading text-slate-900 mb-1">Automated Alerts</h3>
              <p className="text-body text-slate-500">Monitor late trips, missed pickups, and driver status alerts.</p>
            </div>
            <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}>
              <LazyAutomatedAlerts trips={trips} drivers={drivers} vehicles={vehicles} />
            </Suspense>
          </div>
        );

      // ===== DOCUMENT EXPIRATION =====
      case 'documents':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-heading text-slate-900 mb-1">Document Expiration Tracker</h3>
              <p className="text-body text-slate-500">Track driver licenses, insurance, and vehicle registration expirations.</p>
            </div>
            <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}>
              <LazyDocumentTracker drivers={drivers} vehicles={vehicles} />
            </Suspense>
          </div>
        );

      // ===== FLEET UTILIZATION =====
      case 'fleet':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-heading text-slate-900 mb-1">Fleet Utilization Report</h3>
              <p className="text-body text-slate-500">Vehicle usage, driver performance, and fleet efficiency metrics.</p>
            </div>
            <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}>
              <LazyFleetUtilization trips={trips} drivers={drivers} vehicles={vehicles} />
            </Suspense>
          </div>
        );

      // ===== SYSTEM =====
      case 'system':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-heading text-slate-900 mb-1">System Settings</h3>
              <p className="text-body text-slate-500">Global system controls and data management.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-2 text-slate-800 font-semibold text-base mb-1"><Database size={18} /> System Logs</div>
                <p className="text-sm text-slate-500 mb-4">View all system logs and user activities from the dashboard audit panel.</p>
                <button onClick={() => setActiveSection('activity')} className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold transition text-sm flex items-center gap-2"><Eye size={16} /> View Logs</button>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-2 text-slate-800 font-semibold text-base mb-1"><RefreshCw size={18} /> Data Sync Status</div>
                <p className="text-sm text-slate-500 mb-4">Firestore real-time sync is active. Data is synchronized across all connected clients.</p>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-semibold"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Live</div>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm border-rose-200 bg-rose-50">
              <h4 className="font-semibold text-rose-900 mb-2 flex items-center gap-2 text-base"><AlertCircle size={20} /> Master Reset</h4>
              <p className="text-sm text-rose-700 mb-4">Warning: This will permanently delete all trips, drivers, and fleet data. This action cannot be undone.</p>
              <button onClick={() => { requestAuthAction?.('Master System Reset — This will permanently delete ALL trips, drivers, and fleet data. This action cannot be undone.', () => onResetSystem?.()); }} className="px-5 py-2.5 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition text-sm shadow-lg shadow-rose-600/20">
                Wipe System Data
              </button>
            </div>
          </div>
        );

      // ===== PROFILE =====
      case 'profile':
        return (
          <div className="space-y-6">
            <div><h3 className="text-heading text-slate-900 mb-1">Profile</h3><p className="text-body text-slate-500">Your account details and contact numbers.</p></div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm p-5 sm:p-8">
              <div className="space-y-5 max-w-3xl">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Username</label>
                  <input type="text" value={String(currentUser || '').replace(/@auth\.agapecare\.local$/i, '')} readOnly className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-600 text-base" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Role</label>
                  <input type="text" value={role || ''} readOnly className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-600 uppercase font-semibold text-base" />
                </div>
                {(role === 'admin' || role === 'dispatcher') && (
                  <div className="bg-blue-50/30 border border-blue-100 rounded-xl p-5 space-y-4">
                    <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Phone size={16} className="text-blue-600" /> Contact Numbers</h4>
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Dispatcher Phone</label>
                        <div className="flex gap-2">
                          <input type="tel" value={phoneNumbers?.dispatcher || ''} onChange={(e) => _updatePhone?.({ dispatcher: e.target.value })} className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 font-mono text-base focus:border-blue-500 outline-none" placeholder="3177777707" />
                          <button onClick={() => makeCall(phoneNumbers?.dispatcher || '', 'Dispatcher')} className="px-3 py-2.5 bg-blue-100 text-blue-700 rounded-xl hover:bg-blue-200 transition flex items-center" aria-label="Call dispatcher"><Phone size={16} /></button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Routing Phone</label>
                        <div className="flex gap-2">
                          <input type="tel" value={phoneNumbers?.routing || ''} onChange={(e) => _updatePhone?.({ routing: e.target.value })} className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 font-mono text-base focus:border-blue-500 outline-none" placeholder="3177777708" />
                          <button onClick={() => makeCall(phoneNumbers?.routing || '', 'Routing')} className="px-3 py-2.5 bg-indigo-100 text-indigo-700 rounded-xl hover:bg-indigo-200 transition flex items-center" aria-label="Call routing"><Phone size={16} /></button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {role === 'driver' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                      <p className="text-micro">Vehicle</p>
                      <p className="text-lg font-semibold text-slate-900 mt-2">{driverProfile?.vehicle || 'Not Assigned'}</p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                      <p className="text-micro">Current Odometer</p>
                      <div className="flex items-center gap-2 mt-2">
                        <input type="number" value={driverProfile?.odometer || 0} onChange={(e) => { const val = parseInt(e.target.value); if (!isNaN(val)) saveSettings({ odometer: val }, true); }} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 font-semibold text-slate-900 focus:border-blue-500 outline-none text-base" />
                        <span className="text-sm font-semibold text-slate-400">mi</span>
                      </div>
                    </div>
                  </div>
                )}
                <div className="pt-6 border-t border-slate-200">
                  <button onClick={() => onLogout?.()} className="px-6 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold transition flex items-center justify-center gap-2 text-base">
                    <LogOut size={20} /> Sign Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      // ===== ACCESSIBILITY =====
      case 'accessibility':
        return (
          <div className="space-y-6">
            <div><h3 className="text-heading text-slate-900 mb-1">Accessibility</h3><p className="text-body text-slate-500">Optimize readability for operational use, especially while driving.</p></div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm p-5 sm:p-8 space-y-8">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-800 font-semibold text-base"><Type size={20} /> Font Size</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {FONT_SCALE_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const active = appSettings?.fontScale === option.value;
                    const isDriverMode = option.value === 'driver';
                    return (
                      <button key={option.value} onClick={() => saveSettings({ fontScale: option.value })} className={`bg-white border border-slate-200 rounded-xl p-4 text-left transition-all ${active ? (isDriverMode ? 'ring-2 ring-emerald-500 bg-emerald-50' : 'card-active bg-blue-50') : 'hover:bg-slate-50'}`}>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${active ? (isDriverMode ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white') : 'bg-slate-100 text-slate-500'}`}><Icon size={20} /></div>
                        <div className="font-semibold text-sm text-slate-900">{option.label}</div>
                        <p className="text-xs text-slate-500 mt-0.5">{option.desc}</p>
                        {active && <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${isDriverMode ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>Active</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-800 font-semibold text-base"><Accessibility size={20} /> Readability Mode</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
                  <button onClick={() => saveSettings({ readability: 'normal' })} className={`bg-white border border-slate-200 rounded-xl p-4 text-left transition-all ${appSettings?.readability !== 'enhanced' ? 'card-active bg-blue-50' : 'hover:bg-slate-50'}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${appSettings?.readability !== 'enhanced' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}><TextSelect size={20} /></div>
                    <div className="font-semibold text-sm text-slate-900">Standard</div>
                    <p className="text-xs text-slate-500 mt-0.5">Normal contrast and font weights</p>
                    {appSettings?.readability !== 'enhanced' && <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-blue-100 text-blue-700">Active</span>}
                  </button>
                  <button onClick={() => saveSettings({ readability: 'enhanced' })} className={`bg-white border border-slate-200 rounded-xl p-4 text-left transition-all ${appSettings?.readability === 'enhanced' ? 'ring-2 ring-amber-500 bg-amber-50' : 'hover:bg-slate-50'}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${appSettings?.readability === 'enhanced' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Eye size={20} /></div>
                    <div className="font-semibold text-sm text-slate-900">Enhanced</div>
                    <p className="text-xs text-slate-500 mt-0.5">Bolder text, stronger contrast, better spacing</p>
                    {appSettings?.readability === 'enhanced' && <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-amber-100 text-amber-700">Active</span>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      // ===== NAVIGATION =====
      case 'navigation':
        return (
          <div className="space-y-6">
            <div><h3 className="text-heading text-slate-900 mb-1">Navigation</h3><p className="text-body text-slate-500">Choose which GPS app opens for directions. Single-trip vs Route Plan can use different apps.</p></div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm p-5 sm:p-8">
              <div className="max-w-3xl">
                <div className="flex items-center gap-2 mb-4 text-slate-800 font-semibold text-base"><Route size={20} /> Preferred Navigation App</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {NAV_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const active = appSettings?.navigationApp === option.value;
                    return (
                      <button key={option.value} onClick={() => saveSettings({ navigationApp: option.value })} className={`bg-white border border-slate-200 rounded-xl p-4 text-left transition-all ${active ? 'card-active bg-blue-50' : 'hover:bg-slate-50'}`}>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Icon size={20} /></div>
                        <div className="font-semibold text-sm text-slate-900">{option.label}</div>
                        {active && <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-blue-100 text-blue-700">Active</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm p-5 sm:p-8">
              <div className="max-w-3xl">
                <div className="flex items-center gap-2 mb-4 text-slate-800 font-semibold text-base"><Route size={20} /> Route Plan Navigation</div>
                <p className="text-sm text-slate-500 mb-3">GPS app for multi-stop Route Plan tool (Navigate All). Separate from single-trip navigation above.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {NAV_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const active = appSettings?.routePlanNavApp === option.value;
                    return (
                      <button key={option.value} onClick={() => saveSettings({ routePlanNavApp: option.value })} className={`bg-white border border-slate-200 rounded-xl p-4 text-left transition-all ${active ? 'card-active bg-blue-50' : 'hover:bg-slate-50'}`}>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Icon size={20} /></div>
                        <div className="font-semibold text-sm text-slate-900">{option.label}</div>
                        {active && <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-blue-100 text-blue-700">Active</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );

      // ===== NOTIFICATIONS =====
      case 'chat-governance':
        return (
          <div className="space-y-6">
            <div><h3 className="text-heading text-slate-900 mb-1">Chat Governance</h3><p className="text-body text-slate-500">Retention and legal-hold controls for enterprise messaging.</p></div>
            <div className="max-w-2xl space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <label className="flex items-center justify-between gap-4"><div><p className="text-sm font-bold text-slate-900">Automated retention</p><p className="text-xs text-slate-500">Permanently remove eligible messages after the configured period.</p></div><input type="checkbox" checked={chatRetention.enabled} onChange={event => setChatRetention(value => ({ ...value, enabled: event.target.checked }))} /></label>
              <label className="block"><span className="text-xs font-bold text-slate-700">Retention period (30–3650 days)</span><input type="number" min="30" max="3650" value={chatRetention.retentionDays} onChange={event => setChatRetention(value => ({ ...value, retentionDays: Math.min(3650, Math.max(30, Number(event.target.value) || 30)) }))} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold" /></label>
              <label className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><div><p className="text-sm font-bold text-amber-950">Organization legal hold</p><p className="text-xs text-amber-800">Immediately suspends all automated chat deletion.</p></div><input type="checkbox" checked={chatRetention.legalHold} onChange={event => setChatRetention(value => ({ ...value, legalHold: event.target.checked }))} /></label>
              <button onClick={async () => { setChatPolicyStatus('Saving…'); await setDoc(doc(db, 'systemConfig', 'chatRetention'), { ...chatRetention, updatedAt: new Date().toISOString(), updatedBy: auth.currentUser?.uid || '' }, { merge: true }); setChatPolicyStatus('Policy saved and auditable.'); }} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white">Save governance policy</button>
              {chatPolicyStatus && <p className="text-xs font-bold text-emerald-700">{chatPolicyStatus}</p>}
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-6">
            <div><h3 className="text-heading text-slate-900 mb-1">Notifications</h3><p className="text-body text-slate-500">Choose which alerts you receive while on duty.</p></div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm p-5 sm:p-8">
              <div className="space-y-4 max-w-lg">
                {[
                  { key: 'tripUpdates', label: 'Trip Updates', desc: 'New assignments, status changes, and cancellations' },
                  { key: 'dispatcherMessages', label: 'Dispatcher Messages', desc: 'Direct messages and urgent instructions' },
                  { key: 'scheduleChanges', label: 'Schedule Changes', desc: 'Urgent schedule changes and route updates' },
                ].map((item) => {
                  const checked = appSettings?.notifications?.[item.key] !== false;
                  return (
                    <label key={item.key} className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer border border-slate-100">
                      <input type="checkbox" checked={checked} onChange={(e) => {
                        const n = { ...(appSettings?.notifications || {}), [item.key]: e.target.checked };
                        saveSettings({ notifications: n });
                      }} className="w-5 h-5 mt-0.5 rounded" />
                      <div>
                        <p className="text-base font-semibold text-slate-800">{item.label}</p>
                        <p className="text-sm text-slate-500 mt-0.5">{item.desc}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        );

      // ===== SECURITY =====
      case 'security':
        return (
          <div className="space-y-6">
            <div><h3 className="text-heading text-slate-900 mb-1">Security</h3><p className="text-body text-slate-500">Manage your password and account security.</p></div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm p-5 sm:p-8">
              <div className="space-y-5 max-w-2xl">
                <div>
                  <h4 className="font-semibold text-slate-900 mb-4 text-base">Change Password</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">New Password</label>
                      <div className="relative">
                        <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="w-full px-3 py-1.5 border border-slate-300 rounded-xl focus:outline-none focus:border-blue-500 text-base" />
                        <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-slate-600" aria-label="Toggle password visibility">{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Confirm Password</label>
                      <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className="w-full px-3 py-1.5 border border-slate-300 rounded-xl focus:outline-none focus:border-blue-500 text-base" />
                    </div>
                    {pwMsg && <p className={`text-sm font-semibold ${pwMsg.includes('successfully') ? 'text-emerald-600' : 'text-rose-600'}`}>{pwMsg}</p>}
                    <button onClick={handlePasswordChange} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-base"><Save size={18} /> Update Password</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      default: return null;
    }
  };

  return (
    <div aria-label="Settings workspace" className="flex min-h-0 w-full flex-col gap-3 lg:flex-row lg:gap-6 lg:overflow-y-auto lg:overscroll-contain">
      {/* Sidebar */}
      <nav aria-label="Settings sections" className="w-56 flex-shrink-0 hidden lg:block">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm sticky top-4">
          {navItems.map((group, gi) => (
            <div key={gi}>
              <div className="px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{group.group}</div>
              {group.items.map(item => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-all text-sm ${isActive ? 'bg-blue-50 text-blue-700 font-semibold border-r-2 border-blue-600' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'}`}
                  >
                    <Icon size={15} className={isActive ? 'text-blue-600' : 'text-slate-400'} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
              {gi < navItems.length - 1 && <div className="mx-4 my-1 border-t border-slate-100" />}
            </div>
          ))}
        </div>
      </nav>

      {/* Mobile nav */}
      <div className="app-filter-bar -mx-1 w-full px-1 pb-2 touch-manipulation lg:hidden">
        <div className="flex flex-wrap gap-1.5">
          {mobileNavItems.map(item => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button key={item.id} onClick={() => setActiveSection(item.id)} className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl whitespace-nowrap text-xs font-semibold transition-all active:scale-[0.97] touch-manipulation ${isActive ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 active:bg-slate-300'}`}>
                <Icon size={14} /> {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="w-full flex-1 min-w-0">
        {saveStatus && <div role="status" className={`mb-3 flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-bold ${saveStatus === 'All changes saved.' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : saveStatus.includes('Saving') ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{saveStatus.includes('Saving') ? <RefreshCw size={14} className="animate-spin" /> : saveStatus === 'All changes saved.' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}{saveStatus}</div>}
        {sectionContent()}
      </div>
      {deleteConfirmTrip && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setDeleteConfirmTrip(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Trash2 size={16} className="text-rose-600" /> Permanently Delete Trip
              </h3>
              <p className="text-sm text-slate-500 mt-2">
                This will permanently delete the archived trip{' '}
                <span className="font-semibold text-slate-700">{deleteConfirmTrip.patient || deleteConfirmTrip.pickup || deleteConfirmTrip.id}</span>.
                This action cannot be undone.
              </p>
            </div>
            <div className="p-4 flex items-center justify-end gap-2 bg-slate-50">
              <button onClick={() => setDeleteConfirmTrip(null)} className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition">Cancel</button>
              <button
                onClick={() => { if (deleteTrashedTrip) deleteTrashedTrip(deleteConfirmTrip.id); setDeleteConfirmTrip(null); }}
                className="px-4 py-2 text-sm font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
