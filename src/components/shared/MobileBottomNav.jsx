import React, { useMemo, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, MapPin, FileText, Wrench, Menu, MessageSquare,
  Truck, Users, Settings, Search, Plus, Upload, Route, Map, Bell
} from 'lucide-react';
import { designTokens } from '../../utils/designTokens';

const MOBILE_PRIMARY_NAV = [
  { id: 'trips', label: 'Trips', icon: LayoutDashboard, roles: ['driver', 'dispatcher', 'admin'] },
  { id: 'map', label: 'Map', icon: MapPin, roles: ['dispatcher', 'admin'] },
  { id: 'reports', label: 'Reports', icon: FileText, roles: ['dispatcher', 'admin'] },
  { id: 'tools', label: 'Tools', icon: Wrench, roles: ['dispatcher', 'admin'] },
  { id: 'menu', label: 'More', icon: Menu, roles: ['driver', 'dispatcher', 'admin'] },
];

const MOBILE_DRIVER_NAV = [
  { id: 'driverHome', label: 'Home', icon: LayoutDashboard, roles: ['driver'] },
  { id: 'completed', label: 'Completed', icon: CheckCircle2, roles: ['driver'] },
  { id: 'cancelled', label: 'Cancelled', icon: XCircle, roles: ['driver'] },
  { id: 'settings', label: 'Settings', icon: Settings, roles: ['driver'] },
];

export const MobileBottomNavigation = React.memo(({ 
  currentView, 
  subView, 
  onNavigate, 
  onPreload, 
  role = 'dispatcher',
  unreadCount = 0,
}) => {
  const tokens = designTokens;
  const navItems = useMemo(() => {
    if (role === 'driver') {
      return MOBILE_DRIVER_NAV;
    }
    return MOBILE_PRIMARY_NAV.filter(item => item.roles.includes(role));
  }, [role]);

  const isActive = (itemId) => {
    if (itemId === 'menu') return currentView === 'menu' || Boolean(subView);
    return currentView === itemId && !subView;
  };

  return (
    <nav 
      className="bottom-nav fixed bottom-0 left-0 right-0"
      aria-label="Primary navigation"
      style={{ 
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        zIndex: designTokens.zIndex.sticky,
      }}
    >
      <div className="relative flex h-14 min-h-[56px] items-center justify-around gap-1 px-2 bg-white border-t border-slate-200 shadow-lg">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              onPointerDown={() => onPreload?.(item.id)}
              onFocus={() => onPreload?.(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center rounded-full px-1 py-1.5 transition-colors touch-manipulation ${active ? 'text-blue-600' : 'text-slate-400'}`}
            >
              <span className="relative inline-flex">
                <Icon size={23} strokeWidth={active ? 2 : 1.55} aria-hidden="true" />
                {item.id === 'chat' && unreadCount > 0 && (
                  <span className="absolute -right-3 -top-2 min-w-[18px] rounded-full bg-blue-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </span>
              <span className="mt-1 max-w-full truncate text-[10px] font-semibold leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
});

MobileBottomNavigation.displayName = 'MobileBottomNavigation';

export const NAV_BOTTOM_CLEARANCE = 'calc(56px + 8px + env(safe-area-inset-bottom, 0px))';

export const getActiveViewLabel = (currentView, subView) => {
  if (subView) {
    const labels = {
      route_planner: 'AI Route Planner',
      reports: 'Reports & Export',
      admin: 'User Management',
      archives: 'Reports & Records',
      settings: 'App Settings',
      fleet: 'Fleet Management',
      map: 'Live Map',
      payroll: 'Payroll',
      activity: 'Activity Log',
      welltrans: 'Reports & Records',
    };
    return labels[subView] || 'Details';
  }
  const viewLabels = {
    trips: 'Dispatch Manifest',
    map: 'Live Fleet Tracking',
    reports: 'Reports & Export',
    tools: 'Route Planner & Tools',
    menu: 'Settings & More',
    chat: 'Messages',
    driverHome: 'My Trips',
    completed: 'Completed Trips',
    cancelled: 'Cancelled Trips',
    settings: 'Settings',
  };
  return viewLabels[currentView] || 'Agape Care';
};

export default MobileBottomNavigation;