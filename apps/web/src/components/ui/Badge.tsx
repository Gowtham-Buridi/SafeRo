import React from 'react';

type BadgeVariant = 'default' | 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'sovereign';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-orange-50 text-orange-700 border-orange-200/80',
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
  warning: 'bg-amber-50 text-amber-800 border-amber-200/80',
  danger: 'bg-rose-50 text-rose-700 border-rose-200/80',
  info: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
  sovereign: 'bg-gradient-to-r from-orange-50 to-indigo-50 text-slate-900 border-orange-200',
};

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-orange-500',
  neutral: 'bg-slate-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  info: 'bg-indigo-500',
  sovereign: 'bg-orange-500',
};

export function Badge({ children, variant = 'default', className = '', dot = false }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-[11px] font-semibold tracking-tight ${variantStyles[variant]} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dotColors[variant]}`} />}
      {children}
    </span>
  );
}
