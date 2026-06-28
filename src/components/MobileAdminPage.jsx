import React, { useState } from 'react';
import { UserCog, Truck, Activity, KeyRound, Trash2, Wifi, WifiOff, Save, X, Plus, Users, Search, Shield, ChevronDown } from 'lucide-react';
import { getDriverLiveStatus } from '../constants/statuses';
import { auth, sendPasswordResetEmail } from '../config/firebase';

const MobileAdminPage = ({ 
  drivers = [], 
  dispatchers = [], 
  vehicles = [], 
  logs = [], 
  setDrivers, 
  setDispatchers, 
  currentUser, 
  role,
  requestAuthAction,
  addAuditLog,
  statusColor
}) => {
  const allUsers = [...dispatchers.map(d => ({...d, _role: 'dispatcher', _source: 'dispatchers'})), ...drivers.map(d => ({...d, _role: 'driver', _source: 'drivers'}))].sort((a,b) => a.name.localeCompare(b.name));
  const [pwResetMsg, setPwResetMsg] = useState({});
  const [filter, setFilter] = useState('all'); // all, driver, dispatcher, admin
  const [search, setSearch] = useState('');

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
    if (addAuditLog) addAuditLog('Role Changed', `${currentUser} changed ${user.name} from ${user._role} to ${newRole}`, 'amber');
  };

  const filteredUsers = allUsers.filter(u => {
    if (filter !== 'all' && u._role !== filter) return false;
    if (search && !u.name.toLowerCase().includes(search.toLowerCase()) && !(u.email||'').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const getInitials = (name) => {
    return (name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  return (
    <div className="w-full h-full bg-[#0f172a] flex flex-col overflow-hidden pb-20">
      
      {/* Search and Filters */}
      <div className="shrink-0 p-4 border-b border-slate-700/50 bg-slate-800/40 space-y-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users by name or email..."
            className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {['all', 'dispatcher', 'driver', 'admin'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all ${filter === f ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* User List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredUsers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <Users size={32} className="mb-4 opacity-50" />
            <p className="font-bold text-sm">No users found</p>
          </div>
        )}

        {filteredUsers.map((user, i) => (
          <div key={user.id || i} className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600 flex items-center justify-center text-sm font-black text-white shrink-0 shadow-inner">
                  {getInitials(user.name)}
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-slate-200 text-sm leading-tight truncate">{user.name}</h4>
                  <p className="text-[11px] font-semibold text-slate-400 truncate">{user.email || 'No email'}</p>
                </div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1.5">
                {user._role === 'driver' ? (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${getDriverLiveStatus(user).color}`}>
                    {getDriverLiveStatus(user).label}
                  </span>
                ) : (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${user.clockedIn ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-700 text-slate-400 border border-slate-600'}`}>
                    {user.clockedIn ? <Wifi size={10} /> : <WifiOff size={10} />}
                    {user.clockedIn ? 'Online' : 'Offline'}
                  </span>
                )}
              </div>
            </div>
            
            <div className="flex items-center justify-between border-t border-slate-700/50 pt-3 mt-1">
              <div className="relative">
                <select
                  value={user._role}
                  onChange={(e) => {
                    const newRole = e.target.value;
                    if (requestAuthAction) {
                      requestAuthAction(`Change role for ${user.name}`, () => handleRoleChange(user, newRole));
                    } else {
                      handleRoleChange(user, newRole);
                    }
                  }}
                  className="appearance-none pl-8 pr-8 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-bold text-slate-300 focus:outline-none focus:border-blue-500/50 transition-colors"
                >
                  <option value="admin">Admin</option>
                  <option value="dispatcher">Dispatcher</option>
                  <option value="driver">Driver</option>
                </select>
                <Shield size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>

              <div className="flex items-center gap-2">
                {user.email && (
                  <button
                    onClick={() => handlePasswordReset(user.email)}
                    className="flex items-center justify-center px-3 py-1.5 bg-slate-700/50 border border-slate-600 hover:bg-slate-600 rounded-lg text-slate-300 transition-colors"
                  >
                    <KeyRound size={12} className="mr-1.5 text-blue-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Reset PW</span>
                  </button>
                )}
              </div>
            </div>
            {pwResetMsg[user.email] && (
              <p className="text-[10px] font-bold text-emerald-400 text-right mt-1">{pwResetMsg[user.email]}</p>
            )}
          </div>
        ))}
      </div>

      {/* FAB to add user */}
      <button className="fixed bottom-24 right-4 w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20 active:scale-95 transition-all z-40 border border-blue-400/30">
        <Plus size={24} className="text-white" />
      </button>

    </div>
  );
};

export default MobileAdminPage;
