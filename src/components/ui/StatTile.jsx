import React from 'react';

const TONES = {
  brand: 'bg-gradient-to-br from-blue-50 via-indigo-50/60 to-white border-blue-100',
  success: 'bg-emerald-50/70 border-emerald-100',
  warning: 'bg-amber-50/70 border-amber-100',
  danger: 'bg-rose-50/70 border-rose-100',
  info: 'bg-blue-50/70 border-blue-100',
};

const ICON_TONES = {
  brand: 'bg-blue-600 text-white shadow-sm shadow-blue-600/30',
  success: 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30',
  warning: 'bg-amber-500 text-white shadow-sm shadow-amber-500/30',
  danger: 'bg-rose-600 text-white shadow-sm shadow-rose-600/30',
  info: 'bg-blue-500 text-white shadow-sm shadow-blue-500/30',
};

/** Metric tile: label, value, detail, optional trailing slot (e.g. Sparkline). */
export default function StatTile({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'brand',
  trailing,
  className = '',
  ...props
}) {
  return (
    <article
      className={`rounded-xl border p-4 shadow-sm transition-transform duration-[140ms] ease-out hover:-translate-y-0.5 hover:shadow-md ${TONES[tone] || TONES.brand} ${className}`}
      {...props}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums leading-tight text-slate-900">{value}</p>
          {detail && <p className="mt-0.5 truncate text-xs font-medium text-slate-500">{detail}</p>}
        </div>
        {(Icon || trailing) && (
          <div className="flex shrink-0 flex-col items-end gap-2">
            {trailing}
            {Icon && (
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${ICON_TONES[tone] || ICON_TONES.brand}`}>
                <Icon size={16} aria-hidden="true" />
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
