import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  hoverable?: boolean;
  dark?: boolean;
}

export function Card({ children, className = '', hoverable = false, dark = false, ...props }: CardProps) {
  return (
    <div
      className={`rounded-3xl transition-all duration-200 ${
        dark
          ? 'sarvam-card-dark text-white p-6'
          : 'sarvam-card text-slate-900'
      } ${
        hoverable ? 'hover:shadow-2xl hover:border-slate-300 hover:-translate-y-0.5' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon?: React.ReactNode;
  change?: string;
  to?: string;
  onClick?: () => void;
  accent?: 'orange' | 'rose' | 'amber' | 'emerald' | 'indigo';
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon,
  change,
  to,
  onClick,
  accent = 'orange',
}: MetricCardProps) {
  const getAccentConfig = () => {
    switch (accent) {
      case 'rose':
        return {
          iconBox: 'bg-rose-50 text-rose-600 border-rose-200/80',
          changeBadge: 'bg-rose-500 text-rose-700 bg-rose-50 border-rose-200',
          hoverBorder: 'hover:border-rose-300 hover:shadow-rose-500/10',
          arrowColor: 'text-rose-500',
        };
      case 'amber':
        return {
          iconBox: 'bg-amber-50 text-amber-600 border-amber-200/80',
          changeBadge: 'bg-amber-500 text-amber-800 bg-amber-50 border-amber-200',
          hoverBorder: 'hover:border-amber-300 hover:shadow-amber-500/10',
          arrowColor: 'text-amber-500',
        };
      case 'emerald':
        return {
          iconBox: 'bg-emerald-50 text-emerald-600 border-emerald-200/80',
          changeBadge: 'bg-emerald-500 text-emerald-800 bg-emerald-50 border-emerald-200',
          hoverBorder: 'hover:border-emerald-300 hover:shadow-emerald-500/10',
          arrowColor: 'text-emerald-500',
        };
      case 'indigo':
        return {
          iconBox: 'bg-indigo-50 text-indigo-600 border-indigo-200/80',
          changeBadge: 'bg-indigo-500 text-indigo-800 bg-indigo-50 border-indigo-200',
          hoverBorder: 'hover:border-indigo-300 hover:shadow-indigo-500/10',
          arrowColor: 'text-indigo-500',
        };
      default:
        return {
          iconBox: 'bg-orange-50 text-orange-600 border-orange-200/80',
          changeBadge: 'bg-orange-500 text-orange-800 bg-orange-50 border-orange-200',
          hoverBorder: 'hover:border-orange-300 hover:shadow-orange-500/10',
          arrowColor: 'text-orange-500',
        };
    }
  };

  const styling = getAccentConfig();

  const cardContent = (
    <div className={`group relative rounded-3xl border border-slate-200/85 bg-white p-5 shadow-sm shadow-slate-900/[0.04] transition-all duration-300 ${
      to || onClick ? `cursor-pointer hover:shadow-xl hover:-translate-y-1 ${styling.hoverBorder}` : ''
    }`}>
      {/* Top row: Title + Icon badge + Navigation arrow */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
          {title}
        </span>
        
        <div className="flex items-center gap-1.5">
          {icon && (
            <div className={`h-8 w-8 rounded-2xl border flex items-center justify-center transition-transform duration-200 group-hover:scale-105 ${styling.iconBox}`}>
              {icon}
            </div>
          )}
          {to && (
            <ArrowUpRight className={`h-4 w-4 opacity-0 -translate-x-1 translate-y-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0 ${styling.arrowColor}`} />
          )}
        </div>
      </div>

      {/* Metric value row */}
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950 font-display-serif">
          {value}
        </span>
        {change && (
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border font-mono ${styling.changeBadge}`}>
            {change}
          </span>
        )}
      </div>

      {/* Subtitle / Context description */}
      {subtitle && (
        <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
          <span>{subtitle}</span>
          {to && (
            <span className="text-[10px] font-mono font-semibold text-slate-400 group-hover:text-slate-700 transition-colors">
              Explore →
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="block select-none focus:outline-none">
        {cardContent}
      </Link>
    );
  }

  if (onClick) {
    return (
      <div onClick={onClick} className="select-none">
        {cardContent}
      </div>
    );
  }

  return cardContent;
}
