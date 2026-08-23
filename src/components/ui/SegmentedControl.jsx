import React, { useId } from 'react';

/**
 * iOS-style segmented control. Sliding indicator is transform-based.
 * options: [{ value, label, icon?: Component }]
 */
export default function SegmentedControl({
  options = [],
  value,
  onChange,
  ariaLabel = 'Segmented control',
  className = '',
  size = 'md',
}) {
  const groupId = useId();
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const sizeCls = size === 'sm' ? 'text-[11px] px-2 py-1' : 'text-xs font-semibold px-3 py-1.5';

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`relative inline-flex rounded-full border border-slate-200 bg-slate-100 p-0.5 ${className}`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0.5 left-0 rounded-full bg-white shadow-sm"
        style={{
          width: `calc((100% - 4px) / ${Math.max(1, options.length)})`,
          transform: `translateX(${activeIndex * 100}%)`,
          transition: 'transform var(--dur-base) var(--ease-out-expo)',
        }}
      />
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            id={`${groupId}-tab-${option.value}`}
            aria-selected={active}
            onClick={() => !active && onChange?.(option.value)}
            className={`relative z-10 flex items-center gap-1 rounded-full outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-blue-500 ${sizeCls} ${active ? 'text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {option.icon && <option.icon size={13} aria-hidden="true" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
