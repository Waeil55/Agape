import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { ChevronLeft } from 'lucide-react';
import { designTokens } from '../../utils/designTokens';

const HeaderContext = createContext(null);

export const HeaderProvider = ({ children }) => {
  const [headerConfig, setHeaderConfig] = useState({
    title: '',
    subtitle: '',
    showBack: false,
    onBack: null,
    rightActions: [],
    role: null,
    largeTitle: false,
  });

  const setHeader = useCallback((config) => {
    setHeaderConfig((prev) => ({ ...prev, ...config }));
  }, []);

  const clearHeader = useCallback(() => {
    setHeaderConfig({
      title: '',
      subtitle: '',
      showBack: false,
      onBack: null,
      rightActions: [],
      role: null,
      largeTitle: false,
    });
  }, []);

  const value = useMemo(() => ({ headerConfig, setHeader, clearHeader }), [headerConfig, setHeader, clearHeader]);

  return <HeaderContext.Provider value={value}>{children}</HeaderContext.Provider>;
};

export const useHeader = () => {
  const context = useContext(HeaderContext);
  if (!context) {
    // Fail-safe fallback so components never crash when rendered outside a
    // HeaderProvider (e.g. lazy shells, embedded previews, tests).
    return useHeaderFallback;
  }
  return context;
};

export const useHeaderFallback = {
  headerConfig: {
    title: '',
    subtitle: '',
    showBack: false,
    onBack: null,
    rightActions: [],
    role: null,
    largeTitle: false,
  },
  setHeader: () => {},
  clearHeader: () => {},
};

const AppHeader = ({ 
  title, 
  subtitle, 
  showBack = false, 
  onBack, 
  rightActions = [], 
  role = null,
  largeTitle = false,
  className = '',
}) => {
  const tokens = designTokens;
  const roleTokens = role ? tokens.colors.role[role] || tokens.colors.role.driver : null;

  return (
    <header className={`shrink-0 ${tokens.elevation.sm} ${tokens.colors.border.hairline} ${tokens.colors.background.secondary} ${className}`} style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="px-3 py-2.5 flex items-center gap-3">
        {showBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="flex min-h-11 min-w-11 items-center justify-center -ml-1.5 text-slate-500 hover:text-slate-800 rounded-full bg-slate-100/50 touch-manipulation transition-colors"
          >
            <ChevronLeft size={20} strokeWidth={2} />
          </button>
        )}
        
        <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
          <img src="/agape.png" alt="Agape Care" className="w-8 h-8 object-contain" />
        </div>
        
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <p className={`truncate ${largeTitle ? tokens.typography.title3 : tokens.typography.headline} ${tokens.colors.foreground.primary} leading-none tracking-tight`}>
              {title || (role === 'admin' ? 'Agape Care Admin' : role === 'dispatcher' ? 'Agape Care Dispatch' : 'Agape Care')}
            </p>
            {roleTokens && (
              <span className={`shrink-0 px-2 py-0.5 ${tokens.typography.caption2Upper} ${roleTokens.bg} ${roleTokens.text} ${roleTokens.border}`}>
                {role === 'admin' ? 'Admin' : role === 'dispatcher' ? 'Dispatch' : 'Driver'}
              </span>
            )}
          </div>
          {subtitle && (
            <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
              <p className={`truncate ${tokens.typography.caption1} ${tokens.colors.foreground.secondary}`}>{subtitle}</p>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-1.5 shrink-0">
          {rightActions.map((action, index) => (
            <button
              key={action.id || index}
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              aria-label={action.ariaLabel}
              className={`flex min-h-11 min-w-11 items-center justify-center rounded-xl transition-colors touch-manipulation ${action.variant === 'primary' 
                ? 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800' 
                : action.variant === 'danger'
                ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 active:bg-rose-200'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 active:bg-slate-100'
              } ${action.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {action.icon && <action.icon size={action.iconSize || 19} />}
              {action.label && <span className={`hidden sm:inline ${tokens.typography.caption2}`}>{action.label}</span>}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
};

export const useHeaderContext = () => useContext(HeaderContext);

export default AppHeader;