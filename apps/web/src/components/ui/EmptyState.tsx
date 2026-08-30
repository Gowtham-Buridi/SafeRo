import React from 'react';
import { Sparkle } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {/* Sarvam Sovereign Starburst Icon Container */}
      <div className="mb-5 relative flex items-center justify-center">
        <div className="h-16 w-16 rounded-full bg-gradient-to-tr from-orange-100 via-amber-50 to-indigo-100 border border-orange-200/60 flex items-center justify-center shadow-lg shadow-orange-500/10">
          {icon || <Sparkle className="h-8 w-8 text-orange-600 fill-orange-500/20" />}
        </div>
      </div>

      <h3 className="text-lg font-bold text-slate-900 tracking-tight font-display-serif">{title}</h3>
      <p className="mt-1.5 max-w-md text-xs sm:text-sm text-slate-500 leading-relaxed">
        {description}
      </p>

      {action && <div className="mt-6 flex items-center gap-3">{action}</div>}
    </div>
  );
}
