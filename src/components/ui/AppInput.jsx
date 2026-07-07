import React from 'react';

const SIZES = {
  sm: 'h-8 px-3 text-[11px]',
  md: 'h-9 px-3 text-xs',
  lg: 'h-10 px-4 text-sm',
  xl: 'h-11 px-4 text-sm',
};

export default function AppInput({
  size = 'lg',
  label,
  error,
  hint,
  icon: Icon,
  iconRight: IconRight,
  className = '',
  containerClassName = '',
  ...props
}) {
  const sizeClasses = SIZES[size] || SIZES.lg;
  const errorClasses = error ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/15' : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500/15';

  return (
    <div className={containerClassName}>
      {label && (
        <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <Icon size={size === 'sm' ? 14 : size === 'md' ? 15 : 16} />
          </div>
        )}
        <input
          className={`w-full rounded-xl border bg-white font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all ${sizeClasses} ${errorClasses} ${Icon ? 'pl-9' : ''} ${IconRight ? 'pr-9' : ''} ${className}`}
          {...props}
        />
        {IconRight && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
            <IconRight size={size === 'sm' ? 14 : size === 'md' ? 15 : 16} />
          </div>
        )}
      </div>
      {error && (
        <p className="mt-1 text-[10px] font-medium text-rose-600">{error}</p>
      )}
      {hint && !error && (
        <p className="mt-1 text-[10px] font-medium text-slate-400">{hint}</p>
      )}
    </div>
  );
}
