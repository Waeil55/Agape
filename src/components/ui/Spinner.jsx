const SIZES = {
  xs: 'w-4 h-4 border-[1.5px]',
  sm: 'w-5 h-5 border-2',
  md: 'w-8 h-8 border-[3px]',
  lg: 'w-12 h-12 border-4',
};

export default function Spinner({ size = 'md', color = 'border-blue-600', trackColor = 'border-blue-100', label = 'Loading…', className = '' }) {
  return (
    <div role="status" aria-label={label} className={`flex items-center justify-center ${className}`}>
      <div className={`${SIZES[size] || SIZES.md} ${trackColor} ${color} border-t-transparent rounded-full animate-spin`} />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function PageSpinner({ label = 'Loading…' }) {
  return (
    <div className="flex-1 flex items-center justify-center py-16">
      <Spinner size="lg" label={label} />
    </div>
  );
}
