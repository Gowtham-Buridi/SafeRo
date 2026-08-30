import React from 'react';
import { AlertTriangle, RefreshCw, ServerCrash } from 'lucide-react';
import { Button } from './Button.tsx';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  compact?: boolean;
  className?: string;
}

export function ErrorState({
  title = 'Failed to load data',
  message = 'An unexpected server error occurred while retrieving live risk telemetry. Please try again.',
  onRetry,
  isRetrying = false,
  compact = false,
  className = '',
}: ErrorStateProps) {
  if (compact) {
    return (
      <div
        className={`rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-xs text-rose-900 flex items-center justify-between shadow-xs ${className}`}
      >
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
          <div>
            <span className="font-bold">{title}</span>
            {message && <span className="opacity-90 ml-1.5">— {message}</span>}
          </div>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            disabled={isRetrying}
            className="inline-flex items-center gap-1 font-bold text-rose-700 hover:text-rose-900 bg-rose-100/80 hover:bg-rose-200/80 px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-50 shrink-0 ml-3"
          >
            <RefreshCw className={`h-3 w-3 ${isRetrying ? 'animate-spin' : ''}`} />
            <span>{isRetrying ? 'Retrying…' : 'Retry'}</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-3xl border border-rose-200/90 bg-gradient-to-br from-rose-50/70 via-white to-amber-50/30 p-8 text-center shadow-sm flex flex-col items-center justify-center space-y-4 my-6 ${className}`}
    >
      <div className="h-14 w-14 rounded-2xl bg-rose-100 text-rose-600 border border-rose-200 flex items-center justify-center shadow-xs">
        <ServerCrash className="h-7 w-7 text-rose-600" />
      </div>

      <div className="max-w-md space-y-1.5">
        <h3 className="text-base font-extrabold text-slate-900 font-display-serif">
          {title}
        </h3>
        <p className="text-xs text-slate-600 leading-relaxed">
          {message}
        </p>
      </div>

      {onRetry && (
        <div className="pt-2">
          <Button
            variant="primary"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            className="cursor-pointer font-bold shadow-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRetrying ? 'animate-spin' : ''}`} />
            <span>{isRetrying ? 'Retrying Request…' : 'Try Again'}</span>
          </Button>
        </div>
      )}
    </div>
  );
}
