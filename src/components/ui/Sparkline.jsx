import React, { useMemo } from 'react';

/**
 * Dependency-free inline SVG sparkline.
 * data: number[]; renders a smooth polyline + soft area fill.
 */
export default function Sparkline({
  data = [],
  width = 96,
  height = 32,
  stroke = 'var(--brand-primary, #2A52AC)',
  className = '',
  ariaLabel = 'Trend',
}) {
  const gradientId = useMemo(() => `spark-${Math.random().toString(36).slice(2, 8)}`, []);
  const path = useMemo(() => {
    if (!data || data.length < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pad = 2;
    const points = data.map((value, index) => {
      const x = pad + (index / (data.length - 1)) * (width - pad * 2);
      const y = height - pad - ((value - min) / range) * (height - pad * 2);
      return [Number(x.toFixed(2)), Number(y.toFixed(2))];
    });
    const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
    const area = `${line} L${points[points.length - 1][0]},${height - pad} L${points[0][0]},${height - pad} Z`;
    return { line, area };
  }, [data, width, height]);

  if (!path) {
    return <svg width={width} height={height} className={className} aria-hidden="true" />;
  }

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} role="img" aria-label={ariaLabel}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={path.area} fill={`url(#${gradientId})`} />
      <path d={path.line} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
