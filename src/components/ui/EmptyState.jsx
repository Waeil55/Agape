import React from 'react';

/**
 * Consistent empty state: icon in a soft tile, title, description,
 * optional action button. Replaces ad-hoc empty markup everywhere.
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  tone = 'slate',
  className = '',
}) {
  const TILE_TONES = {
    slate: 'from-slate-50 to-slate-100 text-slate-400',
    brand: 'from-blue-50 to-indigo-100 text-blue-500',
    success: 'from-emerald-50 to-emerald-100 text-emerald-500',
    warning: 'from-amber-50 to-amber-100 text-amber-500',
  };

  return (
    <div className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}>
      {Icon && (
        <div className={`mb-4 flex h-16 w-16 items-center justify-center rounded-[1.25rem] bg-gradient-to-br shadow-inner ${TILE_TONES[tone] || TILE_TONES.slate}`}>
          <Icon size={28} aria-hidden="true" />
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-xs text-xs font-medium leading-relaxed text-slate-500">{description}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm shadow-blue-600/30 transition-transform duration-[140ms] ease-out hover:bg-blue-700 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
