import React, { useState, useEffect } from 'react';
import { Plus, Trash2, ShieldCheck, Briefcase, Truck, Save, X, Users, AlertCircle } from 'lucide-react';
import { db, firebaseConfig, collection, getDocs, setDoc, doc, deleteDoc, deleteApp, getAuth, createUserWithEmailAndPassword, signOut as authSignOut } from '../config/firebase';

const UsersPage = ({ drivers = [], setDrivers, dispatchers = [], setDispatchers, addAuditLog, currentUser, role, requestAuthAction }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showAssign, setShowAssign] = useState(null);
  const [form, setForm] = useState({ email: '', password: '', role: 'driver', phone: '' });
  const [formError, setFormError] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list = [];
      snap.forEach(d => list.push({ uid: d.id, ...d.data() }));
      setUsers(list);
    } catch {}
    setLoading(false);
  };

  const createUser = async () => {
    setFormError('');
    if (!form.email || !form.password) { setFormError('Email and password required.'); return; }
    if (form.password.length < 6) { setFormError('Password must be at least 6 characters.'); return; }
    let secondaryApp;
    try {
      // Initialize a secondary app to avoid logging out the admin
      const secondaryAppName = `secondary-${Date.now()}`;
      secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
      const secondaryAuth = getAuth(secondaryApp);
      
      const userCred = await createUserWithEmailAndPassword(secondaryAuth, form.email, form.password);
      await setDoc(doc(db, 'users', userCred.user.uid), { email: form.email, role: form.role, phone: form.phone });
      
      // Cleanup: sign out and delete secondary app
      await authSignOut(secondaryAuth);
      await deleteApp(secondaryApp);
      
      if (form.role === 'dispatcher') {
        const id = `DSP-${String(dispatchers.length + 1).padStart(2, '0')}`;
        setDispatchers(prev => [...prev, { id, name: form.email.split('@')[0], email: form.email }]);
      } else if (form.role === 'driver') {
        const id = `DRV-${String(drivers.length + 1).padStart(3, '0')}`;
        const newDriver = {
          id, name: form.email.split('@')[0], email: form.email, phone: form.phone, status: 'Available', vehicle: 'Pending', dist: '--',
          currentZone: 'TBD', odometer: 0, nextOilChange: 5000,
          assignedTo: '', schedule: [], clockedIn: false
        };
        setDrivers(prev => [...prev, newDriver]);
      }
      
      addAuditLog('User Created', `${currentUser} created ${form.role} account: ${form.email}`, 'emerald');
      await loadUsers();
      setShowForm(false);
      setForm({ email: '', password: '', role: 'driver', phone: '' });
    } catch (err) {
      if (secondaryApp) await deleteApp(secondaryApp);
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
      await deleteDoc(doc(db, 'users', user.uid));
      setDispatchers(prev => prev.filter(d => d.email !== user.email));
      setDrivers(prev => prev.filter(d => d.email !== user.email));
      addAuditLog('User Removed', `${currentUser} removed ${user.role}: ${user.email}`, 'rose');
      setFormError('');
      await loadUsers();
    } catch (err) {
      const msg = err?.message || '';
      if (msg.includes('permission-denied') || msg.includes('Missing or insufficient')) {
        setFormError('Permission denied. Make sure your admin user document exists in Firestore database.');
      } else {
        setFormError('Could not delete user. The Firebase Auth account must be removed from Firebase Console.');
      }
    }
  };

  const assignDriver = (driverId, dispatcherId) => {
    const dispatcher = dispatchers.find(ds => ds.id === dispatcherId);
    setDrivers(prev => prev.map(d => d.id === driverId ? { ...d, assignedTo: dispatcherId } : d));
    addAuditLog('Driver Assigned', `${currentUser} reassigned a driver to ${dispatcher?.name || 'Unassigned'}`, 'blue');
    setShowAssign(null);
  };

  const byRole = (role) => users.filter(u => u.role === role);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
        <h2 className="text-lg sm:text-lg font-bold text-slate-900">User Management</h2>
        <button onClick={() => setShowForm(true)} className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 text-sm">
          <Plus size={18} /> Add User
        </button>
      </div>

      {formError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg flex gap-3 items-start">
          <AlertCircle size={20} className="text-rose-600 shrink-0 mt-0.5" />
          <p className="text-rose-700 text-sm">{formError}</p>
        </div>
      )}

      {/* Role Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {[
          { key: 'admin', bg: 'bg-indigo-50', border: 'border-indigo-200', iconBg: 'bg-indigo-500', Icon: ShieldCheck, label: 'Admin' },
          { key: 'dispatcher', bg: 'bg-blue-50', border: 'border-blue-200', iconBg: 'bg-blue-500', Icon: Briefcase, label: 'Dispatcher' },
          { key: 'driver', bg: 'bg-emerald-50', border: 'border-emerald-200', iconBg: 'bg-emerald-500', Icon: Truck, label: 'Driver' },
        ].map(c => {
          const Icon = c.Icon;
          return (
            <div key={c.key} className={`${c.bg} p-4 sm:p-6 rounded-xl border ${c.border}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-9 sm:w-10 h-9 sm:h-10 rounded-lg ${c.iconBg} text-white flex items-center justify-center`}>
                  <Icon size={18} />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-semibold text-slate-600">{c.label}s</p>
                  <p className="text-lg sm:text-lg font-bold text-slate-900">{users.filter(u => u.role === c.key).length}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* All Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-slate-200">
          <h3 className="text-lg sm:text-lg font-bold text-slate-900 flex items-center gap-2"><Users size={18} /> All Users ({users.length})</h3>
        </div>
        {loading ? (
          <div className="p-8 sm:p-12 text-center text-slate-500 text-sm">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="p-8 sm:p-12 text-center text-slate-500 text-sm">No users found. Add one above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-sm sm:text-sm font-semibold text-slate-600">Email</th>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-sm sm:text-sm font-semibold text-slate-600">Role</th>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-sm sm:text-sm font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => {
                  const roleStyle = user.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : user.role === 'dispatcher' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700';
                  const RoleIcon = user.role === 'admin' ? ShieldCheck : user.role === 'dispatcher' ? Briefcase : Truck;
                  return (
                    <tr key={user.uid} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm font-semibold text-slate-900 truncate max-w-[150px] sm:max-w-none">{user.email}</td>
                      <td className="px-3 sm:px-6 py-2 sm:py-4">
                        <span className={`flex items-center gap-1.5 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-xs font-bold w-fit ${roleStyle}`}>
                          <RoleIcon size={10} /> {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                        </span>
                        {user.phone && <p className="text-xs text-slate-500 font-mono mt-1">{user.phone}</p>}
                      </td>
                      <td className="px-3 sm:px-6 py-2 sm:py-4">
                        {role === 'admin' && user.email !== currentUser && (
                          <button onClick={() => requestAuthAction ? requestAuthAction('Delete User', () => deleteUserAccount(user)) : deleteUserAccount(user)} className="p-1.5 sm:p-2 text-red-600 hover:bg-red-50 rounded-lg transition" title="Remove user">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dispatcher Assignments */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-slate-200">
          <h3 className="text-lg sm:text-lg font-bold text-slate-900">Driver Assignments</h3>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">Assign drivers to dispatchers</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-sm sm:text-sm font-semibold text-slate-600">Driver</th>
                <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-sm sm:text-sm font-semibold text-slate-600">Assigned To</th>
                <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-sm sm:text-sm font-semibold text-slate-600">Actions</th>
                <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-sm sm:text-sm font-semibold text-slate-600">Remove</th>
              </tr>
            </thead>
            <tbody>
              {drivers.length === 0 ? (
                <tr><td colSpan="4" className="px-3 sm:px-6 py-8 sm:py-12 text-center text-slate-500 text-sm">No drivers yet.</td></tr>
              ) : (
                drivers.map(d => {
                  const dispatcher = dispatchers.find(ds => ds.id === d.assignedTo);
                  return (
                    <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm font-semibold text-slate-900">{d.name}</td>
                      <td className="px-3 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm">
                        {showAssign === d.id ? (
                          <div className="flex gap-2">
                            <select
                              value={d.assignedTo || ''}
                              onChange={(e) => assignDriver(d.id, e.target.value)}
                              className="px-2 sm:px-3 py-1 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:border-blue-500 max-w-[120px] sm:max-w-none"
                            >
                              <option value="">Unassigned</option>
                              {dispatchers.map(ds => (
                                <option key={ds.id} value={ds.id}>{ds.name}</option>
                              ))}
                            </select>
                            <button onClick={() => setShowAssign(null)} className="p-1 text-slate-500 hover:text-slate-700"><X size={14} /></button>
                          </div>
                        ) : (
                          <span className="text-slate-600">{dispatcher?.name || <span className="text-slate-400 italic">Unassigned</span>}</span>
                        )}
                      </td>
                      <td className="px-3 sm:px-6 py-2 sm:py-4">
                        <button onClick={() => setShowAssign(showAssign === d.id ? null : d.id)} className="px-2 sm:px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs sm:text-xs font-semibold hover:bg-blue-200">
                          {showAssign === d.id ? 'Cancel' : 'Assign'}
                        </button>
                      </td>
                      <td className="px-3 sm:px-6 py-2 sm:py-4">
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
                        }} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition">
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

      {/* Add User Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-0 sm:mx-4">
            <div className="p-4 sm:p-8">
              <div className="flex justify-between items-center mb-4 sm:mb-6">
                <h3 className="text-lg sm:text-lg font-bold text-slate-900">Create User</h3>
                <button onClick={() => { setShowForm(false); setFormError(''); }} className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); createUser(); }} className="space-y-3 sm:space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
                  <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm" placeholder="user@agapecare.com" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Password</label>
                  <input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm" placeholder="Min 6 characters" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm" placeholder="+1 (555) 000-0000" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Role</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'admin', Icon: ShieldCheck, label: 'Admin', activeBorder: 'border-indigo-500', activeBg: 'bg-indigo-50', text: 'text-indigo-600', textBold: 'text-indigo-700' },
                      { key: 'dispatcher', Icon: Briefcase, label: 'Dispatcher', activeBorder: 'border-blue-500', activeBg: 'bg-blue-50', text: 'text-blue-600', textBold: 'text-blue-700' },
                      { key: 'driver', Icon: Truck, label: 'Driver', activeBorder: 'border-emerald-500', activeBg: 'bg-emerald-50', text: 'text-emerald-600', textBold: 'text-emerald-700' },
                    ].map(c => {
                      const Icon = c.Icon;
                      const isActive = form.role === c.key;
                      return (
                        <button key={c.key} onClick={() => setForm({ ...form, role: c.key })}
                          className={`p-2 sm:p-3 rounded-lg border-2 text-center transition ${isActive ? `${c.activeBorder} ${c.activeBg}` : 'border-slate-200 hover:border-slate-300'}`}>
                          <Icon size={16} className={`mx-auto mb-1 ${c.text}`} />
                          <p className={`text-xs sm:text-xs font-bold ${c.textBold}`}>{c.label}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </form>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mt-4 sm:mt-6">
                <button type="button" onClick={() => { setShowForm(false); setFormError(''); }} className="w-full sm:flex-1 px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 text-sm">Cancel</button>
                <button type="submit" onClick={createUser} className="w-full sm:flex-1 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 text-sm"><Save size={16} /> Create</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
