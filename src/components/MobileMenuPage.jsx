import React from 'react';
import { ChevronRight, Settings, Users, Clock, LogOut, FileText, Database, Shield, Truck, MapPin } from 'lucide-react';

const MobileMenuPage = ({ currentUser, role, onLogout, setSubView }) => {
  const getInitials = (email) => {
    if (!email) return 'U';
    return email.split('@')[0].slice(0, 2).toUpperCase();
  };

  const SECTIONS = [
    {
      title: "Organization",
      items: [
        { id: 'admin', icon: Users, label: 'User Management', desc: 'Dispatchers & Admins', color: 'text-indigo-600', bg: 'bg-indigo-50' },
        { id: 'fleet', icon: Truck, label: 'Fleet & Drivers', desc: 'Vehicles, schedules, assignments', color: 'text-blue-600', bg: 'bg-blue-50' },
        { id: 'billing', icon: Database, label: 'Billing Codes', desc: 'Manage charge codes', color: 'text-emerald-600', bg: 'bg-emerald-50' },
      ]
    },
    {
      title: "Data & Records",
      items: [
        { id: 'map', icon: MapPin, label: 'Live Map', desc: 'Fleet location and route view', color: 'text-sky-600', bg: 'bg-sky-50' },
        { id: 'reports', icon: FileText, label: 'Reports & Export', desc: 'Trip logs and manifests', color: 'text-amber-600', bg: 'bg-amber-50' },
        { id: 'archives', icon: Clock, label: 'Archives', desc: 'Past records', color: 'text-rose-600', bg: 'bg-rose-50' },
      ]
    },
    {
      title: "Preferences",
      items: [
        { id: 'settings', icon: Settings, label: 'App Settings', desc: 'Theme & notifications', color: 'text-gray-600', bg: 'bg-gray-100' },
      ]
    }
  ];

  return (
    <div className="w-full h-full bg-gray-50 flex flex-col overflow-y-auto overscroll-contain">
      {/* Header Profile Section */}
      <div className="px-6 pt-10 pb-8 bg-white border-b border-gray-200">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center text-xl font-black text-blue-600 shadow-sm border border-blue-100">
            {getInitials(currentUser)}
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-gray-900 tracking-wide truncate">{currentUser || 'User'}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Shield size={12} className="text-[#2b4c7e]" />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{role === 'admin' ? 'Administrator' : 'Dispatcher'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Menu Links */}
      <div className="px-4 py-6 space-y-6">
        {SECTIONS.map((section, idx) => {
          const visibleItems = section.items.filter((item) => role === 'admin' || !['billing'].includes(item.id));
          if (section.title === "Organization" && visibleItems.length === 0) return null;

          return (
            <div key={idx} className="space-y-2">
              <h3 className="px-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">{section.title}</h3>
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                {visibleItems.map((item, i) => (
                  <button
                    key={item.id}
                    onClick={() => setSubView(item.id)}
                    className={`w-full flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left ${i !== visibleItems.length - 1 ? 'border-b border-gray-100' : ''}`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.bg}`}>
                      <item.icon size={18} className={item.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                      <p className="text-[11px] font-semibold text-gray-500 mt-0.5">{item.desc}</p>
                    </div>
                    <ChevronRight size={16} className="text-gray-400 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Logout */}
      <div className="px-4 pb-[calc(7rem+env(safe-area-inset-bottom,0px))] pt-4">
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl bg-white border border-rose-200 text-rose-600 font-bold hover:bg-rose-50 active:scale-95 transition-all shadow-sm"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </div>
  );
};

export default MobileMenuPage;
