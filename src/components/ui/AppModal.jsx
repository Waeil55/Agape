import React, { useEffect } from 'react';
import { X } from 'lucide-react';

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  full: 'max-w-[95vw]',
};

export default function AppModal({
  open,
  onClose,
  title,
  subtitle,
  size = 'md',
  children,
  footer,
  className = '',
  closeOnBackdrop = true,
  showClose = true,
}) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && open) {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const sizeClasses = SIZES[size] || SIZES.md;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div className={`relative w-full ${sizeClasses} bg-white rounded-3xl shadow-2xl border border-white/20 max-h-[90vh] flex flex-col ${className}`}>
        {(title || showClose) && (
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <div>
              {title && (
                <h2 className="text-base font-black text-slate-900">{title}</h2>
              )}
              {subtitle && (
                <p className="text-[11px] font-medium text-slate-500 mt-0.5">{subtitle}</p>
              )}
            </div>
            {showClose && (
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
              >
                <X size={16} className="text-slate-500" />
              </button>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {children}
        </div>
        {footer && (
          <div className="px-6 pb-5 pt-3 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
