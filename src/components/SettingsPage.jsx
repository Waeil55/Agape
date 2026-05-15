import React, { useState } from 'react';
import { LogOut, AlertCircle, Database, Eye, EyeOff, Save, Palette, Navigation, Type, Moon, Sun, Route, Phone } from 'lucide-react';
import { updatePassword } from 'firebase/auth';
import { auth } from '../config/firebase';

const SETTINGS_GROUPS = {
  theme: [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
  ],
  fontScale: [
    { value: 'sm', label: 'Compact' },
    { value: 'md', label: 'Standard' },
    { value: 'lg', label: 'Large' },
  ],
  navigationApp: [
    { value: 'google', label: 'Google Maps' },
    { value: 'waze', label: 'Waze' },
    { value: 'apple', label: 'Apple Maps (iOS)' },
  ],
};

const SettingsPage = ({
  currentUser,
  role,
  onLogout,
  onResetSystem,
  trashedTrips = [],
  appSettings,
  onUpdateAppSettings,
  driverProfile,
  phoneNumbers,
  onUpdatePhoneNumbers,
}) => {
  const [activeTab, setActiveTab] = useState('profile');
  const [showDeletedTrips, setShowDeletedTrips] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');

  const handlePasswordChange = async () => {
    setPwMsg('');
    if (newPw.length < 6) {
      setPwMsg('Password must be at least 6 characters.');
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg('Passwords do not match.');
      return;
    }
    try {
      await updatePassword(auth.currentUser, newPw);
      setPwMsg('Password updated successfully.');
      setNewPw('');
      setConfirmPw('');
    } catch (err) {
      setPwMsg(err.message.replace('Firebase: ', ''));
    }
  };

  const tabs = [
    { id: 'profile', label: 'Profile' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'navigation', label: 'Navigation' },
    { id: 'security', label: 'Security' },
    ...(role === 'admin' || role === 'dispatcher' ? [{ id: 'deleted', label: 'Deleted' }] : []),
    ...(role === 'admin' ? [{ id: 'system', label: 'System' }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-1 sm:gap-2 border-b border-slate-200 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 sm:px-6 py-2.5 sm:py-3 font-semibold border-b-2 transition whitespace-nowrap text-xs sm:text-sm ${activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-600 hover:text-blue-600'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-8">
          <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-4 sm:mb-6">Profile</h3>
          <div className="space-y-4 sm:space-y-6 max-w-3xl">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Email</label>
              <input type="email" value={currentUser || ''} readOnly className="w-full px-4 py-2.5 sm:py-3 bg-slate-50 border border-slate-300 rounded-lg text-slate-600 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Role</label>
              <input type="text" value={role || ''} readOnly className="w-full px-4 py-2.5 sm:py-3 bg-slate-50 border border-slate-300 rounded-lg text-slate-600 uppercase font-semibold text-sm" />
            </div>
            {(role === 'admin' || role === 'dispatcher') && (
              <div className="border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4 bg-blue-50/30">
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Phone size={16} className="text-blue-600" /> Contact Numbers</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Routing Phone</label>
                    <div className="flex gap-2">
                      <input type="tel" value={phoneNumbers?.routing || ''} onChange={(e) => onUpdatePhoneNumbers?.({ routing: e.target.value })}
                        className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 font-mono text-sm focus:border-blue-500 outline-none" placeholder="8669823983" />
                      <a href={`tel:${(phoneNumbers?.routing || '').replace(/[^0-9]/g, '')}`} className="px-3 py-2 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition"><Phone size={16} /></a>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Dispatcher Phone</label>
                    <div className="flex gap-2">
                      <input type="tel" value={phoneNumbers?.dispatcher || ''} onChange={(e) => onUpdatePhoneNumbers?.({ dispatcher: e.target.value })}
                        className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 font-mono text-sm focus:border-blue-500 outline-none" placeholder="3177777707" />
                      <a href={`tel:${(phoneNumbers?.dispatcher || '').replace(/[^0-9]/g, '')}`} className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition"><Phone size={16} /></a>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {role === 'driver' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 border border-slate-200 rounded-xl bg-slate-50">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Vehicle</p>
                  <p className="text-sm font-bold text-slate-900 mt-2">{driverProfile?.vehicle || 'Not Assigned'}</p>
                </div>
                <div className="p-4 border border-slate-200 rounded-xl bg-slate-50">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Current Odometer</p>
                  <div className="flex items-center gap-2 mt-2">
                    <input 
                      type="number" 
                      value={driverProfile?.odometer || 0} 
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val)) onUpdateAppSettings?.({ odometer: val }, true); 
                      }}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1 font-bold text-slate-900 focus:border-blue-500 outline-none"
                    />
                    <span className="text-xs font-bold text-slate-400">mi</span>
                  </div>
                </div>
              </div>
            )}
            <div className="pt-4 sm:pt-6 border-t border-slate-200">
              <button onClick={onLogout} className="w-full sm:w-auto px-6 py-3 border border-red-300 text-red-600 font-semibold rounded-lg hover:bg-red-50 transition flex items-center justify-center gap-2 text-sm">
                <LogOut size={18} /> Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'appearance' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-8 space-y-6">
          <div>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">Appearance</h3>
            <p className="text-sm text-slate-500">Choose the theme and reading size that work best in the field.</p>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-3 text-slate-800 font-semibold"><Palette size={18} /> Theme</div>
              <div className="grid grid-cols-2 gap-3 max-w-md">
                {SETTINGS_GROUPS.theme.map((option) => {
                  const Icon = option.icon;
                  const active = appSettings?.theme === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => onUpdateAppSettings?.({ theme: option.value })}
                      className={`p-4 rounded-xl border text-left transition ${active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 hover:border-slate-300 text-slate-700'}`}
                    >
                      <div className="flex items-center gap-2 font-bold"><Icon size={16} /> {option.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3 text-slate-800 font-semibold"><Type size={18} /> Font Size</div>
              <div className="grid grid-cols-3 gap-3 max-w-lg">
                {SETTINGS_GROUPS.fontScale.map((option) => {
                  const active = appSettings?.fontScale === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => onUpdateAppSettings?.({ fontScale: option.value })}
                      className={`p-4 rounded-xl border font-bold transition ${active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 hover:border-slate-300 text-slate-700'}`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'navigation' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-8 space-y-6">
          <div>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">Navigation</h3>
            <p className="text-sm text-slate-500">Choose which GPS app opens first for turn-by-turn navigation.</p>
          </div>

          <div className="space-y-6 max-w-3xl">
            <div>
              <div className="flex items-center gap-2 mb-3 text-slate-800 font-semibold"><Route size={18} /> Preferred Navigation App</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SETTINGS_GROUPS.navigationApp.map((option) => {
                  const active = appSettings?.navigationApp === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => onUpdateAppSettings?.({ navigationApp: option.value })}
                      className={`p-4 rounded-xl border text-left transition ${active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 hover:border-slate-300 text-slate-700'}`}
                    >
                      <div className="flex items-center gap-2 font-bold"><Navigation size={16} /> {option.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-8">
          <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-4 sm:mb-6">Security</h3>
          <div className="space-y-4 sm:space-y-6 max-w-2xl">
            <div>
              <h4 className="font-semibold text-slate-900 mb-4">Change Password</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">New Password</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="w-full px-4 py-2.5 sm:py-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm" />
                    <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-slate-600">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Confirm Password</label>
                  <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className="w-full px-4 py-2.5 sm:py-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm" />
                </div>
                {pwMsg && <p className={`text-sm font-semibold ${pwMsg.includes('successfully') ? 'text-emerald-600' : 'text-rose-600'}`}>{pwMsg}</p>}
                <button onClick={handlePasswordChange} className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2 text-sm"><Save size={16} /> Update Password</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {(role === 'admin' || role === 'dispatcher') && activeTab === 'deleted' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-8">
          <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-4 sm:mb-6">Deleted Trips</h3>
          {!showDeletedTrips ? (
            <button onClick={() => setShowDeletedTrips(true)} className="w-full sm:w-auto px-6 py-3 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200 transition flex items-center justify-center gap-2 text-sm">
              <Eye size={18} /> View Deleted ({trashedTrips.length})
            </button>
          ) : (
            <div>
              <button onClick={() => setShowDeletedTrips(false)} className="mb-4 px-4 py-2 text-slate-600 hover:text-slate-900 font-semibold text-sm">← Hide</button>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600">Booking ID</th>
                      <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600">Patient</th>
                      <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600 hidden sm:table-cell">Pickup</th>
                      <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600 hidden sm:table-cell">Dropoff</th>
                      <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trashedTrips.length === 0 ? (
                      <tr><td colSpan="5" className="px-3 sm:px-6 py-8 sm:py-12 text-center text-slate-500 text-sm">No deleted trips.</td></tr>
                    ) : (
                      trashedTrips.map((trip) => (
                        <tr key={trip.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-3 sm:px-6 py-2 sm:py-4 font-mono text-[11px] sm:text-sm text-slate-600">{trip.bookingId || '—'}</td>
                          <td className="px-3 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm font-semibold text-slate-900">{trip.patient}</td>
                          <td className="px-3 sm:px-6 py-2 sm:py-4 text-[11px] sm:text-sm text-slate-600 hidden sm:table-cell">{trip.pickup}</td>
                          <td className="px-3 sm:px-6 py-2 sm:py-4 text-[11px] sm:text-sm text-slate-600 hidden sm:table-cell">{trip.dropoff}</td>
                          <td className="px-3 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm text-slate-600">{trip.time}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {role === 'admin' && activeTab === 'system' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-8">
          <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-4 sm:mb-6">System</h3>
          <div className="space-y-4 sm:space-y-6 max-w-2xl">
            <div className="p-4 sm:p-6 border border-slate-200 rounded-lg">
              <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2"><Database size={20} /> System Logs</h4>
              <p className="text-sm text-slate-600 mb-4">View all system logs and user activities.</p>
              <button className="w-full sm:w-auto px-6 py-2 bg-blue-100 text-blue-700 font-semibold rounded-lg hover:bg-blue-200 transition text-sm">View System Logs</button>
            </div>

            <div className="p-4 sm:p-6 border border-rose-200 bg-rose-50 rounded-lg">
              <h4 className="font-bold text-rose-900 mb-2 flex items-center gap-2"><AlertCircle size={20} /> Master Reset</h4>
              <p className="text-sm text-rose-700 mb-4">Warning: This will permanently delete all trips, drivers, and fleet data. This action cannot be undone.</p>
              <button
                onClick={() => { if (window.confirm('Are you absolutely sure? This will wipe the entire system.')) onResetSystem?.(); }}
                className="w-full sm:w-auto px-6 py-2 bg-rose-600 text-white font-bold rounded-lg hover:bg-rose-700 transition text-sm shadow-lg shadow-rose-600/20"
              >
                Wipe System Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
