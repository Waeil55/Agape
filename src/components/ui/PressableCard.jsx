import React from 'react';

/**
 * Card with press-scale micro-interaction and elevation lift on hover.
 * Transform/opacity only — never animates layout.
 */
export default function PressableCard({
  as: Tag = 'div',
  variant = 'default',
  padding = 'md',
  className = '',
  children,
  onClick,
  disabled = false,
  ...props
}) {
  const VARIANTS = {
    default: 'rounded-xl border border-slate-200 bg-white shadow-sm',
    flat: 'rounded-xl border border-slate-200 bg-white',
    brand: 'rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 via-indigo-50/60 to-white shadow-sm',
    navy: 'rounded-xl text-white border-0 shadow-md',
  };
  const PADDINGS = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-5' };
  const interactive = Boolean(onClick) && !disabled;

  return (
    <Tag
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-disabled={disabled || undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={interactive ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick(event);
        }
      } : undefined}
      style={variant === 'navy' ? { background: 'var(--gradient-hero)' } : undefined}
      className={[
        VARIANTS[variant] || VARIANTS.default,
        PADDINGS[padding] || PADDINGS.md,
        interactive ? 'agape-pressable cursor-pointer transition-transform duration-[140ms] ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-[0.985]' : '',
        disabled ? 'opacity-60' : '',
        className,
      ].join(' ').trim()}
      {...props}
    >
      {children}
    </Tag>
  );
}
