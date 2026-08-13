import React from 'react';

const VARIANTS = {
  default: 'rounded-xl border border-slate-200 bg-white shadow-sm',
  flat: 'rounded-xl border border-slate-200 bg-white',
  elevated: 'rounded-xl border border-slate-200 bg-white shadow-md',
  ghost: 'rounded-xl bg-transparent',
  brand: 'rounded-xl border border-blue-100 bg-blue-50/70 shadow-sm',
  success: 'rounded-xl border border-emerald-100 bg-emerald-50/70 shadow-sm',
  warning: 'rounded-xl border border-amber-100 bg-amber-50/70 shadow-sm',
  danger: 'rounded-xl border border-rose-100 bg-rose-50/70 shadow-sm',
};

const PADDINGS = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
  xl: 'p-6',
};

export default function AppCard({
  variant = 'default',
  padding = 'md',
  className = '',
  children,
  onClick,
  hover = false,
  ...props
}) {
  const baseClasses = VARIANTS[variant] || VARIANTS.default;
  const paddingClasses = PADDINGS[padding] || PADDINGS.md;
  const hoverClasses = hover ? 'hover:shadow-md transition-shadow cursor-pointer active:scale-[0.99]' : '';

  return (
    <div
      className={`${baseClasses} ${paddingClasses} ${hoverClasses} ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
}
