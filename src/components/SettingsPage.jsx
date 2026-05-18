import React, { useState } from 'react';
import { LogOut, AlertCircle, Database, Eye, EyeOff, Save, Palette, Navigation, Type, Moon, Sun, Monitor, Route, Phone, ShieldCheck, CheckCircle2, XCircle, TextSelect, Accessibility, Smartphone, Maximize2, Minus, Plus } from 'lucide-react';
import { makeCall } from '../utils/nativeActions';

const FONT_SCALE_OPTIONS = [
  { value: 'sm', label: 'Small', desc: 'Compact view — more content on screen', icon: Minus },
  { value: 'md', label: 'Default', desc: 'Standard readability — recommended', icon: TextSelect },
  { value: 'lg', label: 'Large', desc: 'Larger text — easier to read', icon: Plus },
  { value: 'xl', label: 'Extra Large', desc: 'Maximum readability — reduced eye strain', icon: Maximize2 },
  { value: 'driver', label: 'Driver Mode', desc: 'Ultra-readable — optimized for in-vehicle use', icon: Smartphone },
];

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', desc: 'Clean, bright interface', icon: Sun },
  { value: 'dark', label: 'Dark', desc: 'Easy on the eyes at night', icon: Moon },
  { value: 'system', label: 'Auto', desc: 'Follows your device theme', icon: Monitor },
];

const NAV_OPTIONS = [
  { value: 'google', label: 'Google Maps', icon: Navigation },
  { value: 'waze', label: 'Waze', icon: Navigation },
  { value: 'apple', label: 'Apple Maps', icon: Navigation },
];

const PERMISSION_LABELS = {
  canDeleteTrip: 'Delete Trips',
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
  requestAuthAction,
  hasPermission,
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
      const { updatePassword, auth } = await import('../config/firebase');
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
    { id: 'accessibility', label: 'Accessibility' },
    { id: 'navigation', label: 'Navigation' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'security', label: 'Security' },
    ...(role === 'admin' || role === 'dispatcher' ? [{ id: 'deleted', label: 'Deleted' }] : []),
    ...(role === 'admin' ? [{ id: 'system', label: 'System' }] : []),
    ...(role === 'admin' ? [{ id: 'permissions', label: 'Permissions' }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-1 sm:gap-2 border-b border-slate-200 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 sm:px-6 py-3 sm:py-4 font-bold border-b-2 transition whitespace-nowrap text-sm sm:text-base ${activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-blue-600'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && (
        <div className="card p-5 sm:p-8">
          <h3 className="text-heading text-slate-900 mb-6">Profile</h3>
          <div className="space-y-5 max-w-3xl">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Email</label>
              <input type="email" value={currentUser || ''} readOnly className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-600 text-base" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Role</label>
              <input type="text" value={role || ''} readOnly className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-600 uppercase font-bold text-base" />
            </div>
            {(role === 'admin' || role === 'dispatcher') && (
              <div className="card p-5 space-y-4 bg-blue-50/30 border-blue-100">
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Phone size={16} className="text-blue-600" /> Contact Numbers</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">Routing Phone</label>
                    <div className="flex gap-2">
                      <input type="tel" value={phoneNumbers?.routing || ''} onChange={(e) => onUpdatePhoneNumbers?.({ routing: e.target.value })}
                        className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 font-mono text-base focus:border-blue-500 outline-none" placeholder="8669823983" />
                       <button onClick={() => makeCall(phoneNumbers?.routing || '', 'Routing')} className="px-3 py-2.5 bg-emerald-100 text-emerald-700 rounded-xl hover:bg-emerald-200 transition flex items-center"><Phone size={16} /></button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">Dispatcher Phone</label>
                    <div className="flex gap-2">
                      <input type="tel" value={phoneNumbers?.dispatcher || ''} onChange={(e) => onUpdatePhoneNumbers?.({ dispatcher: e.target.value })}
                        className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 font-mono text-base focus:border-blue-500 outline-none" placeholder="3177777707" />
                       <button onClick={() => makeCall(phoneNumbers?.dispatcher || '', 'Dispatcher')} className="px-3 py-2.5 bg-blue-100 text-blue-700 rounded-xl hover:bg-blue-200 transition flex items-center"><Phone size={16} /></button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {role === 'driver' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="card p-4">
                  <p className="text-micro">Vehicle</p>
                  <p className="text-lg font-bold text-slate-900 mt-2">{driverProfile?.vehicle || 'Not Assigned'}</p>
                </div>
                <div className="card p-4">
                  <p className="text-micro">Current Odometer</p>
                  <div className="flex items-center gap-2 mt-2">
                    <input 
                      type="number" 
                      value={driverProfile?.odometer || 0} 
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val)) onUpdateAppSettings?.({ odometer: val }, true); 
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 font-bold text-slate-900 focus:border-blue-500 outline-none text-base"
                    />
                    <span className="text-sm font-bold text-slate-400">mi</span>
                  </div>
                </div>
              </div>
            )}
            <div className="pt-6 border-t border-slate-200">
              <button onClick={() => onLogout?.()} className="px-6 py-3 border-2 border-red-300 text-red-600 font-bold rounded-xl hover:bg-red-50 transition flex items-center justify-center gap-2 text-base shadow-sm">
                <LogOut size={20} /> Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'appearance' && (
        <div className="card p-5 sm:p-8 space-y-8">
          <div>
            <h3 className="text-heading text-slate-900 mb-2">Appearance</h3>
            <p className="text-body text-slate-500">Choose the theme and reading size that work best for you.</p>
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-4 text-slate-800 font-bold text-base"><Palette size={20} /> Theme</div>
              <div className="grid grid-cols-3 gap-3 max-w-lg">
                {THEME_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const active = appSettings?.theme === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => onUpdateAppSettings?.({ theme: option.value })}
                      className={`card p-4 text-left transition-all ${active ? 'card-active bg-blue-50' : 'hover:bg-slate-50'}`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        <Icon size={20} />
                      </div>
                      <div className="font-bold text-sm text-slate-900">{option.label}</div>
                      <p className="text-xs text-slate-500 mt-0.5">{option.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'accessibility' && (
        <div className="card p-5 sm:p-8 space-y-8">
          <div>
            <h3 className="text-heading text-slate-900 mb-2">Accessibility</h3>
            <p className="text-body text-slate-500">Optimize readability for operational use, especially while driving.</p>
          </div>

          {/* Font Size Control */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-base">
              <Type size={20} /> Font Size
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {FONT_SCALE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = appSettings?.fontScale === option.value;
                const isDriverMode = option.value === 'driver';
                return (
                  <button
                    key={option.value}
                    onClick={() => onUpdateAppSettings?.({ fontScale: option.value })}
                    className={`card p-4 text-left transition-all ${active ? (isDriverMode ? 'ring-2 ring-emerald-500 bg-emerald-50' : 'card-active bg-blue-50') : 'hover:bg-slate-50'}`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${active ? (isDriverMode ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white') : 'bg-slate-100 text-slate-500'}`}>
                      <Icon size={20} />
                    </div>
                    <div className="font-bold text-sm text-slate-900">{option.label}</div>
                    <p className="text-xs text-slate-500 mt-0.5">{option.desc}</p>
                    {active && (
                      <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${isDriverMode ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                        Active
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-600">Preview</h4>
                <div className="flex gap-3 text-xs text-slate-400 px-2 py-1 bg-white rounded-lg border border-slate-200">
                  <span>{appSettings?.fontScale === 'sm' ? 'Compact' : appSettings?.fontScale === 'lg' ? 'Large' : appSettings?.fontScale === 'xl' ? 'X-Large' : appSettings?.fontScale === 'driver' ? 'Driver' : 'Default'}</span>
                </div>
              </div>
              <div className="mt-3 space-y-2 bg-white rounded-xl p-4 border border-slate-200">
                <p className="text-xl font-black text-slate-900 leading-tight">Trip Time</p>
                <p className="text-lg font-bold text-slate-800 leading-snug">Passenger Name</p>
                <p className="text-base font-medium text-slate-600 leading-normal">123 Main Street, Springfield, IL 62701</p>
                <p className="text-sm text-slate-400 leading-relaxed">456 Oak Avenue, Springfield, IL 62702</p>
              </div>
            </div>
          </div>

          {/* Readability Mode */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-base">
              <Accessibility size={20} /> Readability Mode
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
              <button
                onClick={() => onUpdateAppSettings?.({ readability: 'normal' })}
                className={`card p-4 text-left transition-all ${appSettings?.readability !== 'enhanced' ? 'card-active bg-blue-50' : 'hover:bg-slate-50'}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${appSettings?.readability !== 'enhanced' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  <TextSelect size={20} />
                </div>
                <div className="font-bold text-sm text-slate-900">Standard</div>
                <p className="text-xs text-slate-500 mt-0.5">Normal contrast and font weights</p>
                {appSettings?.readability !== 'enhanced' && (
                  <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700">Active</span>
                )}
              </button>
              <button
                onClick={() => onUpdateAppSettings?.({ readability: 'enhanced' })}
                className={`card p-4 text-left transition-all ${appSettings?.readability === 'enhanced' ? 'ring-2 ring-amber-500 bg-amber-50' : 'hover:bg-slate-50'}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${appSettings?.readability === 'enhanced' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  <Eye size={20} />
                </div>
                <div className="font-bold text-sm text-slate-900">Enhanced</div>
                <p className="text-xs text-slate-500 mt-0.5">Bolder text, stronger contrast, better spacing</p>
                {appSettings?.readability === 'enhanced' && (
                  <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700">Active</span>
                )}
              </button>
            </div>
          </div>

          {/* Current Settings Summary */}
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
            <h4 className="font-bold text-sm text-slate-700 mb-3">Current Configuration</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl p-3 border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Font Scale</p>
                <p className="text-sm font-bold text-slate-800 mt-1 capitalize">{appSettings?.fontScale || 'Default'}</p>
              </div>
              <div className="bg-white rounded-xl p-3 border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Readability</p>
                <p className="text-sm font-bold text-slate-800 mt-1 capitalize">{appSettings?.readability || 'Normal'}</p>
              </div>
              <div className="bg-white rounded-xl p-3 border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Theme</p>
                <p className="text-sm font-bold text-slate-800 mt-1 capitalize">{appSettings?.theme || 'Light'}</p>
              </div>
              <div className="bg-white rounded-xl p-3 border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Navigation</p>
                <p className="text-sm font-bold text-slate-800 mt-1 capitalize">{appSettings?.navigationApp || 'Google'}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'navigation' && (
        <div className="card p-5 sm:p-8 space-y-6">
          <div>
            <h3 className="text-heading text-slate-900 mb-2">Navigation</h3>
            <p className="text-body text-slate-500">Choose which GPS app opens first for turn-by-turn directions.</p>
          </div>

          <div className="max-w-3xl">
            <div className="flex items-center gap-2 mb-4 text-slate-800 font-bold text-base"><Route size={20} /> Preferred Navigation App</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {NAV_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = appSettings?.navigationApp === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => onUpdateAppSettings?.({ navigationApp: option.value })}
                    className={`card p-4 text-left transition-all ${active ? 'card-active bg-blue-50' : 'hover:bg-slate-50'}`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      <Icon size={20} />
                    </div>
                    <div className="font-bold text-sm text-slate-900">{option.label}</div>
                    {active && (
                      <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700">Active</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="card p-5 sm:p-8 space-y-6">
          <div>
            <h3 className="text-heading text-slate-900 mb-2">Notifications</h3>
            <p className="text-body text-slate-500">Choose which alerts you receive while on duty.</p>
          </div>
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
                    onUpdateAppSettings?.({ notifications: n });
                  }} className="w-5 h-5 mt-0.5 rounded" />
                  <div>
                    <p className="text-base font-bold text-slate-800">{item.label}</p>
                    <p className="text-sm text-slate-500 mt-0.5">{item.desc}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="card p-5 sm:p-8">
          <h3 className="text-heading text-slate-900 mb-6">Security</h3>
          <div className="space-y-5 max-w-2xl">
            <div>
              <h4 className="font-bold text-slate-900 mb-4 text-base">Change Password</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">New Password</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:border-blue-500 text-base" />
                    <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-slate-600">{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Confirm Password</label>
                  <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:border-blue-500 text-base" />
                </div>
                {pwMsg && <p className={`text-sm font-bold ${pwMsg.includes('successfully') ? 'text-emerald-600' : 'text-rose-600'}`}>{pwMsg}</p>}
                <button onClick={handlePasswordChange} className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition flex items-center justify-center gap-2 text-base shadow-sm"><Save size={18} /> Update Password</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {(role === 'admin' || role === 'dispatcher') && activeTab === 'deleted' && (
        <div className="card p-5 sm:p-8">
          <h3 className="text-heading text-slate-900 mb-6">Deleted Trips</h3>
          {!showDeletedTrips ? (
            <button onClick={() => setShowDeletedTrips(true)} className="px-6 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition flex items-center justify-center gap-2 text-base">
              <Eye size={20} /> View Deleted ({trashedTrips.length})
            </button>
          ) : (
            <div>
              <button onClick={() => setShowDeletedTrips(false)} className="mb-4 px-4 py-2 text-slate-600 hover:text-slate-900 font-bold text-sm">← Hide</button>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 sm:px-6 py-3 text-left text-sm font-bold text-slate-600">Booking ID</th>
                      <th className="px-4 sm:px-6 py-3 text-left text-sm font-bold text-slate-600">Patient</th>
                      <th className="px-4 sm:px-6 py-3 text-left text-sm font-bold text-slate-600 hidden sm:table-cell">Pickup</th>
                      <th className="px-4 sm:px-6 py-3 text-left text-sm font-bold text-slate-600 hidden sm:table-cell">Dropoff</th>
                      <th className="px-4 sm:px-6 py-3 text-left text-sm font-bold text-slate-600">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trashedTrips.length === 0 ? (
                      <tr><td colSpan="5" className="px-4 sm:px-6 py-12 text-center text-slate-500 text-base">No deleted trips.</td></tr>
                    ) : (
                      trashedTrips.map((trip) => (
                        <tr key={trip.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 sm:px-6 py-3 font-mono text-sm text-slate-600">{trip.bookingId || '—'}</td>
                          <td className="px-4 sm:px-6 py-3 text-sm font-bold text-slate-900">{trip.patient}</td>
                          <td className="px-4 sm:px-6 py-3 text-sm text-slate-600 hidden sm:table-cell">{trip.pickup}</td>
                          <td className="px-4 sm:px-6 py-3 text-sm text-slate-600 hidden sm:table-cell">{trip.dropoff}</td>
                          <td className="px-4 sm:px-6 py-3 text-sm text-slate-600">{trip.time}</td>
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
        <div className="card p-5 sm:p-8">
          <h3 className="text-heading text-slate-900 mb-6">System</h3>
          <div className="space-y-5 max-w-2xl">
            <div className="card p-6">
              <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2 text-base"><Database size={20} /> System Logs</h4>
              <p className="text-body text-slate-600 mb-4">View all system logs and user activities.</p>
              <button onClick={() => alert('View system logs from the Dashboard page.')} className="px-6 py-2.5 bg-blue-100 text-blue-700 font-bold rounded-xl hover:bg-blue-200 transition text-base">View System Logs</button>
            </div>

            <div className="card p-6 border-rose-200 bg-rose-50">
              <h4 className="font-bold text-rose-900 mb-2 flex items-center gap-2 text-base"><AlertCircle size={20} /> Master Reset</h4>
              <p className="text-body text-rose-700 mb-4">Warning: This will permanently delete all trips, drivers, and fleet data. This action cannot be undone.</p>
              <button
                onClick={() => { requestAuthAction?.('Master System Reset — This will permanently delete ALL trips, drivers, and fleet data. This action cannot be undone.', () => onResetSystem?.()); }}
                className="px-6 py-2.5 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition text-base shadow-lg shadow-rose-600/20"
              >
                Wipe System Data
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'permissions' && (
        <div className="card p-5 sm:p-8">
          <h3 className="text-heading text-slate-900 mb-2">Roles &amp; Permissions</h3>
          <p className="text-body text-slate-500 mb-6">Capability matrix for every role in the system. Only admins can view this page.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-3 text-left font-bold text-slate-700 whitespace-nowrap">Permission</th>
                  {Object.keys(ROLE_LABELS).map(r => (
                    <th key={r} className="px-3 py-3 text-center font-bold text-slate-700 whitespace-nowrap">{ROLE_LABELS[r]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.keys(PERMISSION_LABELS).map(pkey => (
                  <tr key={pkey} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-3 py-3 font-bold text-slate-800 whitespace-nowrap">{PERMISSION_LABELS[pkey]}</td>
                    {Object.keys(ROLE_LABELS).map(r => {
                      const allowed = hasPermission ? hasPermission(r, pkey) : false;
                      return (
                        <td key={r} className="px-3 py-3 text-center">
                          {allowed ? (
                            <CheckCircle2 size={18} className="inline text-emerald-600" />
                          ) : (
                            <XCircle size={18} className="inline text-slate-300" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
