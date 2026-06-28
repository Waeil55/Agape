import React from 'react';
import { ChevronRight, Settings, Users, Clock, LogOut, FileText, UserCog, Database, Shield } from 'lucide-react';

const MobileMenuPage = ({ currentUser, role, onSignOut, setSubView }) => {
  const getInitials = (email) => {
    if (!email) return 'U';
    return email.split('@')[0].slice(0, 2).toUpperCase();
  };

  const SECTIONS = [
    {
      title: "Organization",
      items: [
        { id: 'admin', icon: Users, label: 'User Management', desc: 'Dispatchers & Admins', color: 'text-indigo-400', bg: 'bg-indigo-500/20' },
        { id: 'billing', icon: Database, label: 'Billing Codes', desc: 'Manage charge codes', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
      ]
    },
    {
      title: "Data & Records",
      items: [
        { id: 'reports', icon: FileText, label: 'Reports & Export', desc: 'Trip logs and manifests', color: 'text-amber-400', bg: 'bg-amber-500/20' },
        { id: 'archives', icon: Clock, label: 'Archives', desc: 'Past records', color: 'text-rose-400', bg: 'bg-rose-500/20' },
      ]
    },
    {
      title: "Preferences",
      items: [
        { id: 'settings', icon: Settings, label: 'App Settings', desc: 'Theme & notifications', color: 'text-slate-400', bg: 'bg-slate-500/20' },
      ]
    }
  ];

  return (
    <div className="w-full h-full bg-[#0f172a] flex flex-col overflow-y-auto">
      {/* Header Profile Section */}
      <div className="px-6 pt-10 pb-8 bg-slate-800/40 border-b border-slate-700/50">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xl font-black text-white shadow-lg">
            {getInitials(currentUser)}
          </div>
          <div>
            <h2 className="text-xl font-black text-white tracking-wide truncate">{currentUser || 'User'}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Shield size={12} className="text-blue-400" />
              <p className="text-xs font-bold text-blue-300 uppercase tracking-widest">{role === 'admin' ? 'Administrator' : 'Dispatcher'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Menu Links */}
      <div className="px-4 py-6 space-y-6">
        {SECTIONS.map((section, idx) => {
          // Hide admin section if not admin
          if (section.title === "Organization" && role !== "admin") return null;

          return (
            <div key={idx} className="space-y-2">
              <h3 className="px-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{section.title}</h3>
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl overflow-hidden shadow-sm">
                {section.items.map((item, i) => (
                  <button
                    key={item.id}
                    onClick={() => setSubView(item.id)}
                    className={`w-full flex items-center gap-4 px-4 py-3.5 hover:bg-slate-700/30 active:bg-slate-700/50 transition-colors text-left ${i !== section.items.length - 1 ? 'border-b border-slate-700/50' : ''}`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.bg}`}>
                      <item.icon size={18} className={item.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-200">{item.label}</p>
                      <p className="text-[11px] font-semibold text-slate-400 mt-0.5">{item.desc}</p>
                    </div>
                    <ChevronRight size={16} className="text-slate-500 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Logout */}
      <div className="px-4 pb-24">
        <button
          onClick={onSignOut}
          className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl bg-slate-800 border border-rose-500/20 text-rose-400 font-bold hover:bg-rose-500/10 active:scale-95 transition-all"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </div>
  );
};

export default MobileMenuPage;
