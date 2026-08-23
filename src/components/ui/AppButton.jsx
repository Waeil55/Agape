import React from 'react';

const SIZES = {
  xs: 'h-7 px-2 rounded-lg text-[10px] font-bold',
  sm: 'h-8 px-3 rounded-xl text-[11px] font-bold',
  md: 'h-9 px-4 rounded-xl text-xs font-bold',
  lg: 'h-10 px-5 rounded-xl text-sm font-bold',
  xl: 'h-11 px-6 rounded-xl text-sm font-black',
};

const VARIANTS = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm shadow-blue-600/15',
  secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800',
  warning: 'bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 active:bg-slate-200',
  outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100',
  brand: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm shadow-blue-600/15',
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
      className={`inline-flex items-center justify-center gap-1.5 transition-[color,background-color,border-color,box-shadow,transform] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 active:scale-[0.98] ${sizeClasses} ${variantClasses} ${disabledClasses} ${fullWidthClasses} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
      )}
      {!loading && Icon && <Icon size={size === 'xs' ? 12 : size === 'sm' ? 14 : 16} />}
      {children}
      {IconRight && <IconRight size={size === 'xs' ? 12 : size === 'sm' ? 14 : 16} />}
    </button>
  );
}
