import React from 'react';

const SIZES = {
  xs: 'h-7 px-2 rounded-lg text-[10px] font-bold',
  sm: 'h-8 px-3 rounded-xl text-[11px] font-bold',
  md: 'h-9 px-4 rounded-xl text-xs font-bold',
  lg: 'h-10 px-5 rounded-xl text-sm font-bold',
  xl: 'h-11 px-6 rounded-xl text-sm font-black',
};

const VARIANTS = {
  primary: 'bg-[#23568E] text-white hover:bg-[#1a4270] active:bg-[#153560]',
  secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800',
  warning: 'bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 active:bg-slate-200',
  outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100',
  brand: 'bg-[#23568E] text-white hover:bg-[#1a4270] active:bg-[#153560]',
};

export default function AppButton({
  size = 'md',
  variant = 'primary',
  className = '',
  children,
  disabled = false,
  loading = false,
  icon: Icon,
  iconRight: IconRight,
  fullWidth = false,
  ...props
}) {
  const sizeClasses = SIZES[size] || SIZES.md;
  const variantClasses = VARIANTS[variant] || VARIANTS.primary;
  const disabledClasses = disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';
  const fullWidthClasses = fullWidth ? 'w-full' : '';

  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 transition-all ${sizeClasses} ${variantClasses} ${disabledClasses} ${fullWidthClasses} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {!loading && Icon && <Icon size={size === 'xs' ? 12 : size === 'sm' ? 14 : 16} />}
      {children}
      {IconRight && <IconRight size={size === 'xs' ? 12 : size === 'sm' ? 14 : 16} />}
    </button>
  );
}
