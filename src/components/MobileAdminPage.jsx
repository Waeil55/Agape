import React, { useState } from 'react';
import { UserCog, Truck, Activity, KeyRound, Trash2, Wifi, WifiOff, Save, X, Plus } from 'lucide-react';
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

  return (
    <div className="w-full flex-1 flex flex-col bg-gray-50 pb-16">
      <div className="p-4 space-y-4">
        {allUsers.map((user, i) => (
          <div key={user.id || i} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-black text-gray-700 uppercase shrink-0">
                  {(user.name || '?')[0]}
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 text-sm leading-tight">{user.name}</h4>
                  <p className="text-xs text-gray-500 truncate">{user.email || 'No email'}</p>
                </div>
              </div>
              {user._role === 'driver' ? (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${getDriverLiveStatus(user).color}`}>
                  {getDriverLiveStatus(user).label}
                </span>
              ) : (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${statusColor ? statusColor(user.clockedIn ? 'online' : 'offline') : 'bg-gray-200 text-gray-700'}`}>
                  {user.clockedIn ? <Wifi size={10} /> : <WifiOff size={10} />}
                  {user.clockedIn ? 'Online' : 'Offline'}
                </span>
              )}
            </div>
            
            <div className="flex items-center justify-between border-t border-gray-100 pt-3 mt-1">
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
                className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#2b4c7e]/20"
              >
                <option value="admin">Admin</option>
                <option value="dispatcher">Dispatcher</option>
                <option value="driver">Driver</option>
              </select>

              <div className="flex items-center gap-2">
                {user.email && (
                  <button
                    onClick={() => handlePasswordReset(user.email)}
                    className="flex items-center justify-center p-2 bg-gray-50 border border-gray-200 hover:bg-gray-100 rounded-xl text-gray-600 transition-colors"
                  >
                    <KeyRound size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MobileAdminPage;
