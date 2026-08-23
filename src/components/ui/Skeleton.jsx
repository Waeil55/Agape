import React from 'react';

const SHAPES = {
  text: 'h-3.5 rounded-md',
  title: 'h-5 w-2/3 rounded-lg',
  block: 'rounded-xl',
  circle: 'rounded-full aspect-square w-10',
};

export default function Skeleton({ shape = 'text', className = '', style, ...props }) {
  const shapeClass = SHAPES[shape] || SHAPES.text;
  return (
    <div
      aria-hidden="true"
      className={`ui-skeleton ${shapeClass} ${className}`}
      style={style}
      {...props}
    />
  );
}

export function SkeletonTripCard() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <Skeleton shape="circle" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton shape="title" />
          <Skeleton className="w-1/2" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="w-4/5" />
        <Skeleton className="w-3/5" />
      </div>
    </div>
  );
}
