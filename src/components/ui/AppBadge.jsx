import React from 'react';

const VARIANTS = {
  default: 'bg-slate-100 text-slate-700',
  blue: 'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
  cyan: 'bg-cyan-100 text-cyan-700',
  amber: 'bg-amber-100 text-amber-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  green: 'bg-green-100 text-green-700',
  rose: 'bg-rose-100 text-rose-700',
  red: 'bg-red-100 text-red-700',
  orange: 'bg-orange-100 text-orange-700',
  fuchsia: 'bg-fuchsia-100 text-fuchsia-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  teal: 'bg-teal-100 text-teal-700',
  sky: 'bg-sky-100 text-sky-700',
};

const SIZES = {
  xs: 'px-1.5 py-0.5 text-xs',
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
  lg: 'px-3 py-1 text-xs',
};

const STATUS_COLORS = {
  'Assigned': 'blue',
  'Accepted': 'purple',
  'En Route': 'cyan',
  'At Pickup': 'amber',
  'Arrived': 'amber',
  'Pickup Complete': 'fuchsia',
  'In Transit': 'teal',
  'Transporting': 'teal',
  'At Dropoff': 'yellow',
  'Arrived Destination': 'yellow',
  'Completed': 'emerald',
  'Cancelled': 'rose',
  'No Show': 'default',
  'Delayed': 'orange',
  'Emergency': 'red',
  'Available': 'emerald',
  'Offline': 'default',
  'On Trip': 'blue',
  'On Break': 'amber',
  'Clocked In': 'emerald',
  'Clocked Out': 'default',
};

export default function AppBadge({
  variant,
  size = 'sm',
  className = '',
  children,
  dot = false,
  status,
  ...props
}) {
  const resolvedVariant = variant || (status ? STATUS_COLORS[status] : null) || 'default';
  const variantClasses = VARIANTS[resolvedVariant] || VARIANTS.default;
  const sizeClasses = SIZES[size] || SIZES.sm;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${
          resolvedVariant === 'emerald' ? 'bg-emerald-500' :
          resolvedVariant === 'blue' ? 'bg-blue-500' :
          resolvedVariant === 'rose' ? 'bg-rose-500' :
          resolvedVariant === 'amber' ? 'bg-amber-500' :
          'bg-slate-400'
        }`} />
      )}
      {children || status}
    </span>
  );
}
