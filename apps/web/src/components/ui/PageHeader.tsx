import React from 'react';
import { Sparkle } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description: string;
  tag?: string;
  actions?: React.ReactNode;
  motif?: boolean;
}

export function PageHeader({ title, description, tag, actions, motif = true }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-slate-200/80 pb-6">
      <div className="space-y-1.5">
        {/* Sarvam Sovereign Ornate Flourish Tag */}
        {tag && (
          <div className="flex items-center gap-1.5 text-orange-600 mb-1">
            <Sparkle className="h-3.5 w-3.5 fill-orange-500 text-orange-500" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-orange-700">
              {tag}
            </span>
          </div>
        )}
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-950 font-display-serif">
          {title}
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 max-w-2xl leading-relaxed">
          {description}
        </p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3 shrink-0">{actions}</div>}
    </div>
  );
}
