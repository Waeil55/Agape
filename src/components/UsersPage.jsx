import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Trash2, ShieldCheck, Briefcase, Truck, Save, X, Users, AlertCircle, Edit2, Check, BrainCircuit, Activity } from 'lucide-react';
import { db, firebaseConfig, collection, getDocs, setDoc, doc, deleteDoc, deleteApp, initializeApp, getAuth, createUserWithEmailAndPassword, signOut as authSignOut, functions, httpsCallable } from '../config/firebase';
import { analyzeActivityLogs } from '../config/ai';

const INTERNAL_AUTH_DOMAIN = 'auth.agapecare.local';

const normalizeUsername = (value = '') => String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
const usernameToAuthEmail = (username = '') => {
  const normalized = normalizeUsername(username);
  return normalized ? `${normalized}@${INTERNAL_AUTH_DOMAIN}` : '';
};
const authEmailToUsername = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.endsWith(`@${INTERNAL_AUTH_DOMAIN}`)) return normalized.split('@')[0];
  return normalized.split('@')[0] || normalized;
};

const buildStableProfileId = (role, uid) => {
  const seed = String(uid || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'USER';
  if (role === 'dispatcher') return `DSP-${seed}`;
  if (role === 'driver') return `DRV-${seed}`;
  return null;
};

const UsersPage = ({ drivers = [], setDrivers, dispatchers = [], setDispatchers, addAuditLog, currentUser, role, requestAuthAction, logs = [], children, onSmartNavigate, singleColumn, hideActivityFeed, activityFeedOnly, hideRoleCards, hideAiInsights }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showAssign, setShowAssign] = useState(null);
  const [form, setForm] = useState({ username: '', password: '', role: 'driver', phone: '', hourlyRate: '' });
  const [formError, setFormError] = useState('');
  const [editingDispatcher, setEditingDispatcher] = useState(null);
  const [editName, setEditName] = useState('');
  const [editHourlyRate, setEditHourlyRate] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);
  
  // AI Insights State
  const [aiInsights, setAiInsights] = useState(null);
  const [analyzingLogs, setAnalyzingLogs] = useState(false);

  const fetchInsights = useCallback(async () => {
    if (role !== 'admin' || logs.length === 0) return;
    setAnalyzingLogs(true);
    const result = await analyzeActivityLogs(logs);
    setAiInsights(result);
    setAnalyzingLogs(false);
  }, [logs, role]);

  useEffect(() => {
    if (!activityFeedOnly && role === 'admin' && !aiInsights && !analyzingLogs) {
      fetchInsights();
    }
  }, [role, logs, aiInsights, analyzingLogs, fetchInsights, activityFeedOnly]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list = [];
      snap.forEach(d => list.push({ uid: d.id, ...d.data() }));
      setUsers(list);
    } catch (err) {
      console.error('Failed to load users:', err);
      setFormError('Could not load users. Check your Firestore permissions.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!activityFeedOnly) loadUsers();
  }, [loadUsers, activityFeedOnly]);

  const createUser = async () => {
    setFormError('');
    if (!form.username || !form.password) { setFormError('Username and password required.'); return; }
    if (form.password.length < 6) { setFormError('Password must be at least 6 characters.'); return; }
    const username = normalizeUsername(form.username);
    if (!username) { setFormError('Username can use only letters, numbers, dot, dash, or underscore.'); return; }
    if (users.some((user) => normalizeUsername(user.username || authEmailToUsername(user.email || '')) === username)) {
      setFormError('That username is already in use.');
      return;
    }
    let secondaryApp;
    try {
      // Initialize a secondary app to avoid logging out the admin
      const secondaryAppName = `secondary-${Date.now()}`;
      secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
      const secondaryAuth = getAuth(secondaryApp);
      const authEmail = usernameToAuthEmail(username);
      
      const userCred = await createUserWithEmailAndPassword(secondaryAuth, authEmail, form.password);
      const profileId = buildStableProfileId(form.role, userCred.user.uid);
      await setDoc(doc(db, 'users', userCred.user.uid), { email: authEmail, username, name: username, role: form.role, phone: form.phone, profileId, loginType: 'username' }, { merge: true });
      
      // Cleanup: sign out and delete secondary app
      await authSignOut(secondaryAuth);
      await deleteApp(secondaryApp);
      
      if (form.role === 'dispatcher') {
        const id = profileId;
        setDispatchers(prev => [...prev, { id, name: username, email: authEmail, username, hourlyRate: form.hourlyRate || '' }]);
      } else if (form.role === 'driver') {
        const id = profileId;
        const newDriver = {
          id, name: username, email: authEmail, username, phone: form.phone, status: 'Available', vehicle: 'Pending', dist: '--',
          currentZone: 'TBD', odometer: 0, nextOilChange: 5000,
          assignedTo: '', schedule: [], clockedIn: false, hourlyRate: form.hourlyRate || ''
        };
        setDrivers(prev => [...prev, newDriver]);
      }
      
      addAuditLog('User Created', `${currentUser} created ${form.role} account: ${username}`, 'emerald', { entity: 'user', id: username, diffs: [{ field: 'role', before: null, after: form.role }, { field: 'username', before: null, after: username }] });
      await loadUsers();
      setShowForm(false);
      setForm({ username: '', password: '', role: 'driver', phone: '', hourlyRate: '' });
    } catch (err) {
      if (secondaryApp) await deleteApp(secondaryApp).catch(() => {});
      setFormError(err.message.replace('Firebase: ', ''));
    }
  };

  const deleteUserAccount = async (user) => {
    if (role !== 'admin') return;
    if (user.email === currentUser) {
      setFormError("For security, you cannot delete your own admin account while logged in.");
      return;
    }
    try {
      // 1. Try to delete from Firebase Auth using the Cloud Function
      try {
        const deleteUserFn = httpsCallable(functions, 'deleteUser');
        await deleteUserFn({ uid: user.uid });
      } catch (fnErr) {
        console.warn("Cloud function deleteUser failed (likely IAM issue). Falling back to soft-delete:", fnErr.message);
      }

      // 2. Delete from Firestore database (Soft delete fallback)
      await deleteDoc(doc(db, 'users', user.uid));
      setDispatchers(prev => prev.filter(d => d.email !== user.email));
      setDrivers(prev => prev.filter(d => d.email !== user.email));
      
      addAuditLog('User Removed', `${currentUser} removed ${user.role}: ${user.username || authEmailToUsername(user.email)}`, 'rose', { entity: 'user', id: user.username || user.email, diffs: [{ field: 'role', before: user.role, after: null }, { field: 'username', before: user.username || authEmailToUsername(user.email), after: null }] });
      setFormError('');
      await loadUsers();
    } catch (err) {
      console.error("Delete Error:", err);
      const msg = err?.message || '';
      if (msg.includes('permission-denied') || msg.includes('Missing or insufficient')) {
        setFormError('Permission denied. Make sure your admin user document exists in Firestore database.');
      } else {
        setFormError(`Failed to delete user: ${msg}`);
      }
    }
  };

  const startRenameDispatcher = (dispatcher) => {
    setEditingDispatcher(dispatcher);
    setEditName(dispatcher.name || dispatcher.username || authEmailToUsername(dispatcher.email));
    setEditHourlyRate(dispatcher.hourlyRate || '');
  };

  const saveDispatcherName = () => {
    if (!editName.trim() || !editingDispatcher) return;
    setDispatchers(prev => prev.map(d =>
      d.id === editingDispatcher.id ? { ...d, name: editName.trim(), hourlyRate: editHourlyRate } : d
    ));
    const prevName = editingDispatcher.name || '';
    addAuditLog('Dispatcher Updated', `${currentUser} updated dispatcher "${editName.trim()}"`, 'blue', { entity: 'dispatcher', id: editingDispatcher.id, diffs: [{ field: 'name', before: prevName, after: editName.trim() }] });
    setEditingDispatcher(null);
    setEditName('');
    setEditHourlyRate('');
  };

  const assignDriver = (driverId, dispatcherId) => {
    const dispatcher = dispatchers.find(ds => ds.id === dispatcherId);
    const prev = drivers.find(d => d.id === driverId);
    const beforeAssign = prev?.assignedDispatcher || null;
    setDrivers(prevList => prevList.map(d => d.id === driverId ? { ...d, assignedDispatcher: dispatcherId, assignedTo: dispatcherId } : d));
    addAuditLog('Driver Assigned', `${currentUser} reassigned a driver to ${dispatcher?.name || 'Unassigned'}`, 'blue', { entity: 'driver', id: driverId, diffs: [{ field: 'assignedDispatcher', before: beforeAssign, after: dispatcherId }] });
    setShowAssign(null);
  };

  const visibleLogs = useMemo(() => {
    if (role === 'admin') return logs || [];
    if (role === 'dispatcher') {
      return (logs || []).filter((log) => {
        const actorRole = String(log?.actorRole || '').toLowerCase();
        return actorRole && actorRole !== 'admin';
      });
    }
    return [];
  }, [logs, role]);

  return (
    <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-6 ${activityFeedOnly ? 'h-full' : ''}`}>
      {!activityFeedOnly && (
      <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
        <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900">User Management</h2>
        <button onClick={() => setShowForm(true)} className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-xs">
          <Plus size={18} /> Add User
        </button>
      </div>

      {formError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg flex gap-3 items-start">
          <AlertCircle size={20} className="text-rose-600 shrink-0 mt-0.5" />
          <p className="text-rose-700 text-xs">{formError}</p>
        </div>
      )}
      </>
      )}

      <div className={`flex flex-col ${singleColumn && !activityFeedOnly ? '' : 'xl:flex-row'} gap-6 items-stretch ${activityFeedOnly ? 'h-full' : ''}`}>
        {!activityFeedOnly && (
        // Left Column: Management & Insights
        <div className={`w-full ${singleColumn ? '' : 'xl:w-1/2'} space-y-6 min-w-0 flex flex-col`}>

      {/* Role Summary Cards */}
      {!hideRoleCards && (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {[
          { key: 'admin', bg: 'bg-indigo-50', border: 'border-indigo-200', iconBg: 'bg-indigo-500', Icon: ShieldCheck, label: 'Admin' },
          { key: 'dispatcher', bg: 'bg-blue-50', border: 'border-blue-200', iconBg: 'bg-blue-500', Icon: Briefcase, label: 'Dispatcher' },
          { key: 'driver', bg: 'bg-emerald-50', border: 'border-emerald-200', iconBg: 'bg-emerald-500', Icon: Truck, label: 'Driver' },
        ].map(c => {
          const Icon = c.Icon;
          return (
            <div key={c.key} className={`${c.bg} border ${c.border} rounded-3xl p-4 sm:p-6 shadow-sm overflow-hidden`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-9 sm:w-10 h-9 sm:h-10 rounded-lg ${c.iconBg} text-white flex items-center justify-center`}>
                  <Icon size={18} />
                </div>
                <div>
                  <p className="text-xs sm:text-xs font-semibold text-slate-600">{c.label}s</p>
                  <p className="text-xl sm:text-2xl font-bold text-slate-900">{users.filter(u => u.role === c.key).length}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* AI Activity Insights (Admin Only) */}
      {role === 'admin' && !hideAiInsights && (
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-3xl overflow-hidden shadow-sm">
          <div className="p-4 sm:p-6 border-b border-indigo-100/50 flex items-center justify-between">
            <h3 className="text-lg sm:text-xl font-semibold text-indigo-900 flex items-center gap-2">
              <BrainCircuit size={20} className="text-indigo-600" /> AI Activity Oversight
            </h3>
            {analyzingLogs && (
              <span className="flex items-center gap-2 text-xs font-semibold text-indigo-500">
                <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                Analyzing logs...
              </span>
            )}
          </div>
          <div className="p-4 sm:p-6">
            {!aiInsights ? (
              <p className="text-xs text-indigo-400 font-medium">No insights available right now.</p>
            ) : (
              <div className="space-y-4">
                <div className="bg-white/60 p-4 rounded-2xl border border-white/80">
                  <h4 className="text-xs font-semibold text-indigo-800 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Activity size={14} /> Team Activity Summary</h4>
                  <p className="text-xs text-slate-700 leading-relaxed">{aiInsights.summary}</p>
                </div>
                
                {aiInsights.mistakes && aiInsights.mistakes.length > 0 && (
                  <div className="bg-rose-50/80 p-4 rounded-2xl border border-rose-100/80">
                    <h4 className="text-xs font-semibold text-rose-800 uppercase tracking-wider mb-2 flex items-center gap-1.5"><AlertCircle size={14} /> AI Flagged Issues</h4>
                    <ul className="list-disc pl-4 space-y-1">
                      {aiInsights.mistakes.map((mistake, idx) => (
                        <li key={idx} className="text-xs font-medium text-rose-700">{mistake}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* All Users Table */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-4 sm:p-6 border-b border-slate-200">
          <h3 className="text-lg sm:text-xl font-semibold text-slate-900 flex items-center gap-2"><Users size={18} /> All Users ({users.length})</h3>
        </div>
        {loading ? (
          <div className="p-8 sm:p-12 text-center text-slate-500 text-xs">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="p-8 sm:p-12 text-center text-slate-500 text-xs">No users found. Add one above.</div>
        ) : (
          <>
          <div className="space-y-3 p-3 sm:hidden">
            {users.map(user => {
              const roleStyle = user.role === 'admin' ? 'bg-blue-100 text-blue-700' : user.role === 'dispatcher' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700';
              const RoleIcon = user.role === 'admin' ? ShieldCheck : user.role === 'dispatcher' ? Briefcase : Truck;
              return (
                <div key={user.uid} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-900">{user.username || authEmailToUsername(user.email)}</p>
                      <p className="mt-0.5 break-all text-xs font-medium text-slate-400">{user.email}</p>
                      {user.phone && <p className="mt-1 text-xs font-mono text-slate-500">{user.phone}</p>}
                    </div>
                    <span className={`shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold ${roleStyle}`}>
                      <RoleIcon size={10} /> {String(user?.role || '').charAt(0).toUpperCase() + String(user?.role || '').slice(1)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {user.role === 'dispatcher' && role === 'admin' && (() => {
                      const disp = dispatchers.find(d => d.email === user.email);
                      if (!disp) return null;
                      return (
                        <button onClick={() => startRenameDispatcher(disp)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50" title="Edit dispatcher" aria-label="Edit dispatcher">
                          <Edit2 size={14} />
                        </button>
                      );
                    })()}
                    {role === 'admin' && user.email !== currentUser && (
                      <button onClick={() => requestAuthAction ? requestAuthAction('Delete User', () => deleteUserAccount(user)) : deleteUserAccount(user)} className="rounded-lg p-2 text-red-600 hover:bg-red-50" title="Remove user" aria-label="Remove user">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 sm:px-6 py-1.5 text-left text-xs sm:text-xs font-semibold text-slate-600">Username</th>
                  <th className="px-3 sm:px-6 py-1.5 text-left text-xs sm:text-xs font-semibold text-slate-600">Role</th>
                  <th className="px-3 sm:px-6 py-1.5 text-left text-xs sm:text-xs font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => {
                  const roleStyle = user.role === 'admin' ? 'bg-blue-100 text-blue-700' : user.role === 'dispatcher' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700';
                  const RoleIcon = user.role === 'admin' ? ShieldCheck : user.role === 'dispatcher' ? Briefcase : Truck;
                  return (
                    <tr key={user.uid} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 sm:px-6 py-1.5 text-xs sm:text-xs font-semibold text-slate-900 truncate max-w-[150px] sm:max-w-none">
                        <div>{user.username || authEmailToUsername(user.email)}</div>
                        <div className="text-[11px] font-medium text-slate-400 mt-0.5">{user.email}</div>
                      </td>
                      <td className="px-3 sm:px-6 py-1.5">
                        <span className={`flex items-center gap-1.5 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-xs font-bold w-fit ${roleStyle}`}>
                          <RoleIcon size={10} /> {String(user?.role || '').charAt(0).toUpperCase() + String(user?.role || '').slice(1)}
                        </span>
                        {user.phone && <p className="text-xs text-slate-500 font-mono mt-1">{user.phone}</p>}
                      </td>
                      <td className="px-3 sm:px-6 py-1.5">
                        <div className="flex items-center gap-1">
                          {user.role === 'dispatcher' && role === 'admin' && (() => {
                            const disp = dispatchers.find(d => d.email === user.email);
                            if (!disp) return null;
                            return (
                              <button onClick={() => startRenameDispatcher(disp)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Edit dispatcher" aria-label="Edit dispatcher">
                                <Edit2 size={14} />
                              </button>
                            );
                          })()}
                          {role === 'admin' && user.email !== currentUser && (
                            <button onClick={() => requestAuthAction ? requestAuthAction('Delete User', () => deleteUserAccount(user)) : deleteUserAccount(user)} className="p-1.5 sm:p-2 text-red-600 hover:bg-red-50 rounded-lg transition" title="Remove user" aria-label="Remove user">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {/* Dispatcher Assignments */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-4 sm:p-6 border-b border-slate-200">
          <h3 className="text-lg sm:text-xl font-semibold text-slate-900">Driver Assignments</h3>
          <p className="text-xs sm:text-xs text-slate-500 mt-1">Assign drivers to dispatchers</p>
        </div>
        <div className="space-y-3 p-3 sm:hidden">
          {drivers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">No drivers yet.</div>
          ) : (
            drivers.map(d => {
              const dispatcher = dispatchers.find(ds => ds.id === (d.assignedDispatcher || d.assignedTo));
              return (
                <div key={d.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-900">{d.name}</p>
                      <p className="mt-0.5 text-xs font-medium text-slate-500">{dispatcher?.name || 'Unassigned'}</p>
                    </div>
                    <button onClick={() => {
                      const user = users.find(u => u.email === d.email);
                      if (user) {
                        if (window.confirm(`Are you sure you want to delete ${d.name} from the system?`)) {
                          requestAuthAction('Delete Driver', () => deleteUserAccount(user));
                        }
                      } else {
                        setDrivers(prev => prev.filter(drv => drv.id !== d.id));
                      }
                    }} className="shrink-0 rounded-lg p-2 text-rose-600 hover:bg-rose-50" aria-label="Delete driver">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {showAssign === d.id ? (
                    <div className="mt-3 flex gap-2">
                      <select
                        value={d.assignedDispatcher || d.assignedTo || ''}
                        onChange={(e) => assignDriver(d.id, e.target.value)}
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold focus:outline-none focus:border-blue-500"
                      >
                        <option value="">Unassigned</option>
                        {dispatchers.map(ds => (
                          <option key={ds.id} value={ds.id}>{ds.name}</option>
                        ))}
                      </select>
                      <button onClick={() => setShowAssign(null)} className="rounded-lg p-2 text-slate-500 hover:text-slate-700" aria-label="Close"><X size={14} /></button>
                    </div>
                  ) : (
                    <button onClick={() => setShowAssign(d.id)} className="mt-3 rounded-lg bg-blue-100 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-200">Assign</button>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 sm:px-6 py-1.5 text-left text-xs sm:text-xs font-semibold text-slate-600">Driver</th>
                <th className="px-3 sm:px-6 py-1.5 text-left text-xs sm:text-xs font-semibold text-slate-600">Assigned To</th>
                <th className="px-3 sm:px-6 py-1.5 text-left text-xs sm:text-xs font-semibold text-slate-600">Actions</th>
                <th className="px-3 sm:px-6 py-1.5 text-left text-xs sm:text-xs font-semibold text-slate-600">Remove</th>
              </tr>
            </thead>
            <tbody>
              {drivers.length === 0 ? (
                <tr><td colSpan="4" className="px-3 sm:px-6 py-8 sm:py-12 text-center text-slate-500 text-xs">No drivers yet.</td></tr>
              ) : (
                drivers.map(d => {
                  const dispatcher = dispatchers.find(ds => ds.id === (d.assignedDispatcher || d.assignedTo));
                  return (
                    <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 sm:px-6 py-1.5 text-xs sm:text-xs font-semibold text-slate-900">{d.name}</td>
                      <td className="px-3 sm:px-6 py-1.5 text-xs sm:text-xs">
                        {showAssign === d.id ? (
                          <div className="flex gap-2">
                            <select
                              value={d.assignedDispatcher || d.assignedTo || ''}
                              onChange={(e) => assignDriver(d.id, e.target.value)}
                              className="px-2 sm:px-3 py-1 border border-slate-300 rounded-lg text-xs sm:text-xs focus:outline-none focus:border-blue-500 max-w-[120px] sm:max-w-none"
                            >
                              <option value="">Unassigned</option>
                              {dispatchers.map(ds => (
                                <option key={ds.id} value={ds.id}>{ds.name}</option>
                              ))}
                            </select>
                            <button onClick={() => setShowAssign(null)} className="p-1 text-slate-500 hover:text-slate-700" aria-label="Close"><X size={14} /></button>
                          </div>
                        ) : (
                          <span className="text-slate-600">{dispatcher?.name || <span className="text-slate-400 italic">Unassigned</span>}</span>
                        )}
                      </td>
                      <td className="px-3 sm:px-6 py-1.5">
                        <button onClick={() => setShowAssign(showAssign === d.id ? null : d.id)} className="px-2 sm:px-3 py-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md text-xs sm:text-xs font-bold hover:bg-blue-200">
                          {showAssign === d.id ? 'Cancel' : 'Assign'}
                        </button>
                      </td>
                      <td className="px-3 sm:px-6 py-1.5">
                        <button onClick={() => {
                          const user = users.find(u => u.email === d.email);
                          if (user) {
                            if (window.confirm(`Are you sure you want to delete ${d.name} from the system?`)) {
                              requestAuthAction('Delete Driver', () => deleteUserAccount(user));
                            }
                          } else {
                            // If no user found, just remove from drivers list
                            setDrivers(prev => prev.filter(drv => drv.id !== d.id));
                          }
                        }} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition" aria-label="Delete driver">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Fleet Management injected here */}
      {children}
      
      </div> // End Left Column
      )}

      {/* Right Column: Activity Feed */}
      {!hideActivityFeed && (
      <div className={`w-full ${singleColumn || activityFeedOnly ? '' : 'xl:w-1/2'} shrink-0 flex flex-col ${activityFeedOnly ? 'h-full' : ''}`}>
      {/* System Activity Feed */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm flex flex-col flex-1 min-h-[500px]">
        <div className="p-4 sm:p-6 border-b border-slate-200 shrink-0">
          <h3 className="text-lg sm:text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Activity size={18} /> System Activity Feed
          </h3>
          <p className="text-xs sm:text-xs text-slate-500 mt-1">Real-time log of worker logins, logouts, and actions.</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-3 p-3 sm:hidden">
            {visibleLogs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">No activity recorded yet.</div>
            ) : (
              visibleLogs.map((log, i) => (
                <button key={i} type="button" onClick={() => setSelectedLog(log)} className="block w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold
                      ${log.c === 'emerald' ? 'bg-emerald-100 text-emerald-700' :
                        log.c === 'rose' ? 'bg-rose-100 text-rose-700' :
                        log.c === 'amber' ? 'bg-amber-100 text-amber-700' :
                        'bg-blue-100 text-blue-700'}`}>
                      {log.t}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-slate-400">
                      {log.time ? new Date(log.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : log.timestamp}
                    </span>
                  </div>
                  {log.actorRole && (
                    <span className="mt-2 inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[11px] font-bold uppercase text-slate-600">
                      {log.actorRole}
                    </span>
                  )}
                  <p className="mt-2 line-clamp-3 text-xs font-medium text-slate-700">{log.meta?.summary || log.d}</p>
                </button>
              ))
            )}
          </div>
          <div className="hidden overflow-x-auto sm:block">
          <table className="w-full relative">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="px-3 sm:px-6 py-1.5 text-left text-xs font-semibold text-slate-600">Time</th>
                <th className="px-3 sm:px-6 py-1.5 text-left text-xs font-semibold text-slate-600">Action</th>
                <th className="px-3 sm:px-6 py-1.5 text-left text-xs font-semibold text-slate-600">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(() => {
                if (visibleLogs.length === 0) return <tr><td colSpan="3" className="px-3 sm:px-6 py-8 text-center text-slate-500 text-xs">No activity recorded yet.</td></tr>;
                return visibleLogs.map((log, i) => (
                  <tr key={i} onClick={() => setSelectedLog(log)} className="hover:bg-slate-50 cursor-pointer transition-colors">
                    <td className="px-3 sm:px-6 py-1.5 text-xs text-slate-500 whitespace-nowrap">
                      {log.time ? new Date(log.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : log.timestamp}
                    </td>
                    <td className="px-3 sm:px-6 py-1.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold 
                        ${log.c === 'emerald' ? 'bg-emerald-100 text-emerald-700' :
                          log.c === 'rose' ? 'bg-rose-100 text-rose-700' :
                          log.c === 'amber' ? 'bg-amber-100 text-amber-700' :
                          'bg-blue-100 text-blue-700'}`}>
                        {log.t}
                      </span>
                      {log.actorRole && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-slate-100 text-slate-600">
                          {log.actorRole}
                        </span>
                      )}
                    </td>
                    <td className="px-3 sm:px-6 py-1.5 text-xs text-slate-700 max-w-xs truncate">{log.meta?.summary || log.d}</td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
          </div>
        </div>
      </div>
      </div> /* End Right Column */
      )}
      </div> {/* End Flex Row */}

      {/* Add User Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm max-w-md w-full mx-0 sm:mx-4">
            <div className="p-4 sm:p-8">
              <div className="flex justify-between items-center mb-4 sm:mb-6">
                <h3 className="text-lg sm:text-xl font-semibold text-slate-900">Create User</h3>
                <button onClick={() => { setShowForm(false); setFormError(''); }} className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-lg" aria-label="Close"><X size={18} /></button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); createUser(); }} className="space-y-3 sm:space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Username</label>
                  <input type="text" required autoCapitalize="none" autoCorrect="off" spellCheck="false" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 text-xs" placeholder="driver.waeil" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                  <input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 text-xs" placeholder="Min 6 characters" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 text-xs" placeholder="+1 (555) 000-0000" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Hourly Rate ($)</label>
                  <input type="number" step="0.01" min="0" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 text-xs" placeholder="e.g. 20.00" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Role</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'admin', Icon: ShieldCheck, label: 'Admin', activeBorder: 'border-indigo-500', activeBg: 'bg-indigo-50', text: 'text-indigo-600', textBold: 'text-indigo-700' },
                      { key: 'dispatcher', Icon: Briefcase, label: 'Dispatcher', activeBorder: 'border-blue-500', activeBg: 'bg-blue-50', text: 'text-blue-600', textBold: 'text-blue-700' },
                      { key: 'driver', Icon: Truck, label: 'Driver', activeBorder: 'border-emerald-500', activeBg: 'bg-emerald-50', text: 'text-emerald-600', textBold: 'text-emerald-700' },
                    ].map(c => {
                      const Icon = c.Icon;
                      const isActive = form.role === c.key;
                      return (
                        <button key={c.key} type="button" onClick={() => setForm({ ...form, role: c.key })}
                          className={`p-2 sm:p-3 rounded-lg border-2 text-center transition ${isActive ? `${c.activeBorder} ${c.activeBg}` : 'border-slate-200 hover:border-slate-300'}`}>
                          <Icon size={16} className={`mx-auto mb-1 ${c.text}`} />
                          <p className={`text-xs sm:text-xs font-semibold ${c.textBold}`}>{c.label}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </form>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mt-4 sm:mt-6">
                <button type="button" onClick={() => { setShowForm(false); setFormError(''); }} className="w-full sm:flex-1 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-xs">Cancel</button>
                <button type="submit" onClick={createUser} className="w-full sm:flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-xs"><Save size={16} /> Create</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Dispatcher Modal */}
      {editingDispatcher && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm max-w-sm w-full mx-0 sm:mx-4">
            <div className="p-4 sm:p-8">
              <div className="flex justify-between items-center mb-4 sm:mb-6">
                <h3 className="text-lg sm:text-xl font-semibold text-slate-900">Edit Dispatcher</h3>
                <button onClick={() => setEditingDispatcher(null)} className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-lg" aria-label="Close"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Name</label>
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 text-xs" placeholder="Name" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Hourly Rate ($)</label>
                  <input type="number" step="0.01" min="0" value={editHourlyRate} onChange={(e) => setEditHourlyRate(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 text-xs" placeholder="e.g. 25.00" />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mt-6">
                <button type="button" onClick={() => setEditingDispatcher(null)} className="w-full sm:flex-1 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-xs">Cancel</button>
                <button type="button" onClick={saveDispatcherName} className="w-full sm:flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-xs"><Save size={16} /> Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Log Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedLog(null)}>
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl w-full max-w-md animate-zoom-in" onClick={e => e.stopPropagation()}>
            <div className={`p-6 border-b ${
              selectedLog.c === 'emerald' ? 'bg-emerald-50 border-emerald-100' :
              selectedLog.c === 'rose' ? 'bg-rose-50 border-rose-100' :
              selectedLog.c === 'amber' ? 'bg-amber-50 border-amber-100' :
              'bg-blue-50 border-blue-100'
            }`}>
              <div className="flex justify-between items-start mb-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                  selectedLog.c === 'emerald' ? 'bg-emerald-200 text-emerald-700' :
                  selectedLog.c === 'rose' ? 'bg-rose-200 text-rose-700' :
                  selectedLog.c === 'amber' ? 'bg-amber-200 text-amber-700' :
                  'bg-blue-200 text-blue-700'
                }`}>
                  <Activity size={24} />
                </div>
                <button onClick={() => setSelectedLog(null)} className="p-2 rounded-full hover:bg-white/50 text-slate-500 transition-colors">
                  <X size={18} />
                </button>
              </div>
              <h3 className={`text-xl font-black ${
                selectedLog.c === 'emerald' ? 'text-emerald-900' :
                selectedLog.c === 'rose' ? 'text-rose-900' :
                selectedLog.c === 'amber' ? 'text-amber-900' :
                'text-blue-900'
              }`}>{selectedLog.t}</h3>
              <p className="text-xs font-semibold opacity-70 mt-1">
                {selectedLog.time ? new Date(selectedLog.time).toLocaleString([], { dateStyle: 'full', timeStyle: 'medium' }) : selectedLog.timestamp}
              </p>
            </div>
            
            <div className="p-6 bg-white">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Activity Details</h4>
              <p className="text-slate-800 leading-relaxed text-base bg-slate-50 p-4 rounded-2xl border border-slate-100">
                {selectedLog.d}
              </p>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Actor</p>
                  <p className="text-xs font-semibold text-slate-800 break-all">{selectedLog.actor || 'System'}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Role</p>
                  <p className="text-xs font-semibold text-slate-800 uppercase">{selectedLog.actorRole || 'system'}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Target</p>
                  <p className="text-xs font-semibold text-slate-800">
                    {selectedLog.meta?.entity ? `${selectedLog.meta.entity}${selectedLog.meta?.id ? ` · ${selectedLog.meta.id}` : ''}` : 'General'}
                  </p>
                </div>
              </div>

              {selectedLog.meta && selectedLog.meta.diffs && selectedLog.meta.diffs.length > 0 && (
                <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                  <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Changes</h5>
                  <div className="space-y-3">
                    {selectedLog.meta.diffs.map((dd, idx) => (
                      <div key={idx} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3">
                        <div className="text-xs font-semibold text-slate-500 w-28 shrink-0">{dd.field}</div>
                        <div className="flex-1 grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-rose-50 rounded-lg p-2 border border-rose-100">
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-rose-500 block mb-0.5">Before</span>
                            <span className="font-mono text-slate-700 break-all">{dd.before ?? '—'}</span>
                          </div>
                          <div className="bg-emerald-50 rounded-lg p-2 border border-emerald-100">
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-500 block mb-0.5">After</span>
                            <span className="font-mono text-slate-700 break-all">{dd.after ?? '—'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Smart Contextual Links */}
              {(() => {
                const links = [];
                const text = selectedLog.d || '';
                const title = selectedLog.t || '';

                // 1. Check for Trip ID patterns like TRP-XXX or BK-XXX
                const tripIdMatches = text.match(/(?:TRP|BK)-\d+/gi);
                if (tripIdMatches) {
                  tripIdMatches.forEach(id => {
                    const cleanId = id.toUpperCase();
                    if (!links.some(l => l.query === cleanId)) {
                      links.push({ label: `See Trip ${cleanId}`, query: cleanId, icon: <Activity size={14} /> });
                    }
                  });
                }

                // 2. Check for Patient Name in common patterns
                // e.g. "assigned John Doe's trip"
                const patientAssignMatch = text.match(/assigned (.*?)'s trip/i);
                if (patientAssignMatch && patientAssignMatch[1]) {
                  const patient = patientAssignMatch[1].trim();
                  if (!links.some(l => l.query === patient)) {
                    links.push({ label: `Search Patient "${patient}"`, query: patient, icon: <Activity size={14} /> });
                  }
                }
                // e.g. "modified trip TRP-101 (John Doe)"
                const patientParenMatch = text.match(/\((.*?)\)/);
                if (patientParenMatch && patientParenMatch[1] && !patientParenMatch[1].includes(':')) {
                  const patient = patientParenMatch[1].trim();
                  if (patient.length > 2 && !patient.startsWith('TRP-') && !patient.startsWith('DRV-') && !patient.includes('mi')) {
                    if (!links.some(l => l.query === patient)) {
                      links.push({ label: `Search Patient "${patient}"`, query: patient, icon: <Activity size={14} /> });
                    }
                  }
                }
                // e.g. "added trip for John Doe"
                const patientAddedMatch = text.match(/added trip for (.*?)(?:\s+\(|\.|$)/i);
                if (patientAddedMatch && patientAddedMatch[1]) {
                  const patient = patientAddedMatch[1].trim();
                  if (!links.some(l => l.query === patient)) {
                    links.push({ label: `Search Patient "${patient}"`, query: patient, icon: <Activity size={14} /> });
                  }
                }

                // 3. Scan for Driver Names
                if (drivers && drivers.length > 0) {
                  drivers.forEach(drv => {
                    if (drv.name && text.toLowerCase().includes(drv.name.toLowerCase())) {
                      if (!links.some(l => l.query === drv.name)) {
                        links.push({ label: `See Driver "${drv.name}"`, query: drv.name, icon: <Users size={14} /> });
                      }
                    }
                  });
                }

                // 4. Scan for Dispatcher Names
                if (dispatchers && dispatchers.length > 0) {
                  dispatchers.forEach(disp => {
                    if (disp.name && text.toLowerCase().includes(disp.name.toLowerCase())) {
                      if (!links.some(l => l.query === disp.name)) {
                        links.push({ label: `See Dispatcher "${disp.name}"`, query: disp.name, icon: <Briefcase size={14} /> });
                      }
                    }
                  });
                }

                if (links.length > 0 && onSmartNavigate) {
                  return (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Suggested Actions</h4>
                      <div className="flex flex-col gap-2">
                        {links.map((link, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              onSmartNavigate(link.query);
                              setSelectedLog(null);
                            }}
                            className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-bold transition-colors w-full text-left"
                          >
                            {link.icon} {link.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button 
                onClick={() => setSelectedLog(null)}
                className="px-6 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
