import React, { useMemo } from 'react';
import { AppHeader, useHeader, HeaderProvider, MobileBottomNavigation, NAV_BOTTOM_CLEARANCE, getActiveViewLabel } from './index';
import { designTokens } from '../../utils/designTokens';

export const MobileLayout = ({ 
  children, 
  currentView = 'trips',
  subView = null,
  role = 'dispatcher',
  onNavigate,
  onPreload,
  unreadCount = 0,
  showBottomNav = true,
  headerConfig = {},
}) => {
  const tokens = designTokens;
  const { headerConfig: contextConfig, setHeader, clearHeader } = useHeader();
  
  const mergedConfig = useMemo(() => {
    const base = {
      title: '',
      subtitle: '',
      showBack: false,
      onBack: null,
      rightActions: [],
      role,
      largeTitle: false,
      ...headerConfig,
    };
    if (contextConfig && (contextConfig.title || contextConfig.showBack || contextConfig.onBack)) {
      return {
        ...base,
        ...contextConfig,
      };
    }
    return base;
  }, [contextConfig, headerConfig, role]);

  const activeViewLabel = getActiveViewLabel(currentView, subView);

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-slate-50 relative">
      <AppHeader
        title={mergedConfig.title || activeViewLabel}
        subtitle={mergedConfig.subtitle}
        showBack={mergedConfig.showBack}
        onBack={mergedConfig.onBack}
        rightActions={mergedConfig.rightActions}
        role={mergedConfig.role}
        largeTitle={mergedConfig.largeTitle}
        className="relative z-40"
      />
      
      <div 
        className="flex-1 overflow-hidden"
        style={{ 
          paddingBottom: showBottomNav ? NAV_BOTTOM_CLEARANCE : undefined 
        }}
      >
        {children}
      </div>

      {showBottomNav && (
        <MobileBottomNavigation
          currentView={currentView}
          subView={subView}
          onNavigate={onNavigate}
          onPreload={onPreload}
          role={role}
          unreadCount={unreadCount}
        />
      )}
    </div>
  );
};

export const DesktopLayout = ({ 
  children, 
  title = 'Agape Care',
  role = 'dispatcher',
  headerConfig = {},
}) => {
  const tokens = designTokens;
  const { headerConfig: contextConfig, setHeader, clearHeader } = useHeader();
  
  return (
    <div className="flex h-full flex-col bg-slate-50">
      <header className={`shrink-0 ${tokens.elevation.sm} ${tokens.colors.border.hairline} ${tokens.colors.background.secondary} px-4 py-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
              <img src="/agape.png" alt="Agape Care" className="w-8 h-8 object-contain" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900">{title}</p>
              <p className="text-xs text-slate-500">
                {role === 'admin' ? 'Admin Portal' : role === 'dispatcher' ? 'Dispatcher Portal' : 'Driver Portal'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {headerConfig.rightActions?.map((action, i) => (
              <button
                key={i}
                type="button"
                onClick={action.onClick}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50"
              >
                {action.icon && <action.icon size={16} className="mr-1" />}
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
};

export const PageLayout = ({ 
  children, 
  isMobile = false,
  ...props 
}) => {
  return isMobile ? (
    <MobileLayout {...props}>{children}</MobileLayout>
  ) : (
    <DesktopLayout {...props}>{children}</DesktopLayout>
  );
};

export default MobileLayout;