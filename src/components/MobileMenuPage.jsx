import React from 'react';
import { ChevronRight, Settings, Users, Clock, LogOut, FileText, Shield, Truck, MapPin, Activity, CreditCard, RefreshCw } from 'lucide-react';

const MobileMenuPage = ({ currentUser, role, onLogout, setSubView }) => {
  const getInitials = (email) => {
    if (!email) return 'U';
    return email.split('@')[0].slice(0, 2).toUpperCase();
  };

  const SECTIONS = [
    {
      title: "Organization",
      items: [
        { id: 'admin', icon: Users, label: 'User Management', desc: 'Dispatchers & Admins', color: 'text-indigo-600', bg: 'bg-indigo-50', adminOnly: true },
        { id: 'welltrans', icon: RefreshCw, label: 'WellTrans Sync', desc: 'Broker automation center', color: 'text-cyan-700', bg: 'bg-cyan-50', adminOnly: true },
        { id: 'fleet', icon: Truck, label: 'Fleet & Drivers', desc: 'Vehicles, schedules, assignments', color: 'text-blue-600', bg: 'bg-blue-50' },
        { id: 'payroll', icon: CreditCard, label: 'Payroll', desc: 'Earnings & approvals', color: 'text-emerald-600', bg: 'bg-emerald-50' },
      ]
    },
    {
      title: "Data & Records",
      items: [
        { id: 'map', icon: MapPin, label: 'Live Map', desc: 'Fleet location and route view', color: 'text-sky-600', bg: 'bg-sky-50' },
        { id: 'reports', icon: FileText, label: 'Reports & Export', desc: 'Trip logs and manifests', color: 'text-amber-600', bg: 'bg-amber-50' },
        { id: 'archives', icon: Clock, label: 'Archives', desc: 'Past records', color: 'text-rose-600', bg: 'bg-rose-50' },
        { id: 'activity', icon: Activity, label: 'Activity Log', desc: 'Audit trail & changes', color: 'text-violet-600', bg: 'bg-violet-50' },
      ]
    },
    {
      title: "Preferences",
      items: [
        { id: 'settings', icon: Settings, label: 'App Settings', desc: 'Theme & notifications', color: 'text-slate-600', bg: 'bg-slate-100' },
      ]
    }
  ];

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto overscroll-contain bg-slate-50 pb-24 [content-visibility:auto]">
      {/* Header Profile Section */}
      <section className="border-b border-slate-200 bg-white px-4 pb-5 pt-5" aria-label="Signed-in profile">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700">Workspace profile</p>
          <div className="mt-3 flex min-w-0 items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-lg font-semibold text-blue-700">
            {getInitials(currentUser)}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold tracking-tight text-slate-950">{currentUser || 'User'}</h2>
            <div className="mt-1.5 flex items-center gap-2">
              <Shield size={14} className="text-blue-600" aria-hidden="true" />
              <p className="text-xs font-semibold text-slate-600">{role === 'admin' ? 'Administrator access' : 'Dispatcher access'}</p>
            </div>
          </div>
        </div>
        </div>
      </section>

      {/* Menu Links */}
      <div className="space-y-5 px-3 py-5">
        {SECTIONS.map((section, idx) => {
          const visibleItems = section.items.filter((item) => role === 'admin' || !item.adminOnly);
          if (visibleItems.length === 0) return null;

          return (
            <section key={idx} className="space-y-2" aria-labelledby={`mobile-menu-section-${idx}`}>
              <h3 id={`mobile-menu-section-${idx}`} className="px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{section.title}</h3>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {visibleItems.map((item, i) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSubView(item.id)}
                    className={`flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100 ${i !== visibleItems.length - 1 ? 'border-b border-slate-100' : ''}`}
                  >
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.bg}`}>
                      <item.icon size={19} className={item.color} aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                      <p className="mt-0.5 text-xs font-medium leading-snug text-slate-500">{item.desc}</p>
                    </div>
                    <ChevronRight size={18} className="shrink-0 text-slate-400" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* Logout */}
      <div className="px-4 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-2">
        <button
          type="button"
          onClick={onLogout}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm font-bold text-rose-700 shadow-sm transition-colors hover:bg-rose-50"
        >
          <LogOut size={17} aria-hidden="true" />
          Sign Out
        </button>
      </div>
    </div>
  );
};

export default MobileMenuPage;
