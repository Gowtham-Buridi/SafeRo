import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'rectangular' | 'circular' | 'text';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({
  variant = 'rectangular',
  width,
  height,
  className = '',
  style,
  ...props
}: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-slate-200/80 dark:bg-slate-700/50 transition-colors';
  const variantClasses = {
    rectangular: 'rounded-2xl',
    circular: 'rounded-full',
    text: 'rounded-md h-4',
  }[variant];

  const inlineStyles: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    ...style,
  };

  return (
    <div
      className={`${baseClasses} ${variantClasses} ${className}`}
      style={inlineStyles}
      {...props}
    />
  );
}

export function TableSkeletonRows({
  rows = 5,
  cols = 6,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rIdx) => (
        <tr key={rIdx} className="border-b border-slate-100/80 animate-pulse">
          {Array.from({ length: cols }).map((_, cIdx) => (
            <td key={cIdx} className="py-4 px-4">
              <Skeleton
                variant="text"
                className={`h-4 ${
                  cIdx === 0 ? 'w-24' : cIdx === 1 ? 'w-16' : cIdx === cols - 1 ? 'w-20' : 'w-28'
                }`}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function MetricCardSkeleton() {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs animate-pulse space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton variant="text" className="w-28 h-3.5" />
        <Skeleton variant="circular" className="h-8 w-8" />
      </div>
      <Skeleton variant="text" className="w-36 h-7" />
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
        <Skeleton variant="text" className="w-24 h-3" />
        <Skeleton variant="text" className="w-14 h-3" />
      </div>
    </div>
  );
}
