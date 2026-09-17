import React from 'react';
import { openNavigation } from '../../utils/nativeActions';

export const AppleMapsIcon = ({ size = 20, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <rect width="24" height="24" rx="6" fill="#1C1C1E" />
    <circle cx="12" cy="12" r="7.5" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" />
    <polygon points="12,5.5 14.5,12 12,11 9.5,12" fill="#FF453A" />
    <polygon points="12,18.5 14.5,12 12,13 9.5,12" fill="#FFFFFF" />
    <circle cx="12" cy="12" r="1.2" fill="#1C1C1E" />
  </svg>
);

export const GoogleMapsIcon = ({ size = 20, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path d="M12 2C7.58 2 4 5.58 4 10C4 16 12 22 12 22C12 22 20 16 20 10C20 5.58 16.42 2 12 2Z" fill="#EA4335" />
    <path d="M12 2C7.58 2 4 5.58 4 10C4 11.54 4.44 12.98 5.2 14.21L12 6V2Z" fill="#4285F4" />
    <path d="M12 6L5.2 14.21C6.23 15.86 7.6 17.51 9.07 19.26L12 13V6Z" fill="#FBBC04" />
    <path d="M12 13L9.07 19.26C10.12 20.5 11.13 21.5 12 22V13Z" fill="#34A853" />
    <circle cx="12" cy="10" r="3.2" fill="#FFFFFF" />
    <circle cx="12" cy="10" r="1.8" fill="#1A73E8" />
  </svg>
);

export const WazeIcon = ({ size = 20, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <rect width="24" height="24" rx="6" fill="#33CCFF" />
    <path d="M16.5 10C16.5 7.51 14.49 5.5 12 5.5C9.51 5.5 7.5 7.51 7.5 10C7.5 10.87 7.75 11.68 8.18 12.37L7.5 14.5L9.67 14C10.37 14.32 11.16 14.5 12 14.5C14.49 14.5 16.5 12.49 16.5 10Z" fill="#FFFFFF" />
    <circle cx="10.2" cy="9.8" r="1" fill="#1C1C1E" />
    <circle cx="13.8" cy="9.8" r="1" fill="#1C1C1E" />
    <path d="M10.5 12C11 12.6 12 12.8 13 12.3" stroke="#1C1C1E" strokeWidth="0.9" strokeLinecap="round" />
    <circle cx="9.2" cy="15.2" r="1" fill="#1C1C1E" />
    <circle cx="14.8" cy="15.2" r="1" fill="#1C1C1E" />
  </svg>
);

export const DestinationNavButtons = React.memo(({ address, origin, onOpen, className = '', buttonClassName = '' }) => {
  if (!address) return null;

  const handleClick = (e, app) => {
    e.stopPropagation();
    if (onOpen) {
      onOpen(address, app);
    } else {
      openNavigation(address, app, origin);
    }
  };

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={(e) => handleClick(e, 'apple')}
        className={`flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-90 transition-all border border-slate-200/80 shadow-xs cursor-pointer touch-manipulation ${buttonClassName}`}
        title="Check destination in Apple Maps"
        aria-label="Check destination in Apple Maps"
      >
        <AppleMapsIcon size={20} />
      </button>
      <button
        type="button"
        onClick={(e) => handleClick(e, 'google')}
        className={`flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-90 transition-all border border-slate-200/80 shadow-xs cursor-pointer touch-manipulation ${buttonClassName}`}
        title="Check destination in Google Maps"
        aria-label="Check destination in Google Maps"
      >
        <GoogleMapsIcon size={20} />
      </button>
      <button
        type="button"
        onClick={(e) => handleClick(e, 'waze')}
        className={`flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-90 transition-all border border-slate-200/80 shadow-xs cursor-pointer touch-manipulation ${buttonClassName}`}
        title="Check destination in Waze"
        aria-label="Check destination in Waze"
      >
        <WazeIcon size={20} />
      </button>
    </div>
  );
});

DestinationNavButtons.displayName = 'DestinationNavButtons';

export default DestinationNavButtons;
