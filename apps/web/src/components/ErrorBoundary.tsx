import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCw, Home, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from './ui/Button.tsx';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('SafeRo Global Error Boundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  private toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  public override render() {
    if (this.state.hasError) {
      const isDev = import.meta.env.DEV;

      return (
        <div className="min-h-screen bg-[#fbfbfd] flex flex-col items-center justify-center p-6 text-center">
          {/* Branded Error Card */}
          <div className="max-w-lg w-full rounded-3xl border border-rose-200/90 bg-white p-8 shadow-xl shadow-slate-200/50 space-y-6">
            <div className="relative mx-auto flex items-center justify-center">
              <div className="h-20 w-20 rounded-3xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center shadow-inner">
                <ShieldAlert className="h-10 w-10 text-rose-600" />
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[11px] font-mono font-extrabold uppercase tracking-widest text-rose-600 bg-rose-50 px-3 py-1 rounded-full border border-rose-200">
                Application Exception
              </span>
              <h1 className="text-2xl font-extrabold text-slate-950 font-display-serif tracking-tight pt-1">
                Something went wrong
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                An unexpected interface exception occurred. Your session and underlying risk surveillance remain secure.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button
                variant="primary"
                size="md"
                onClick={this.handleReload}
                className="cursor-pointer font-bold shadow-md shadow-orange-600/20"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                <span>Reload SafeRo</span>
              </Button>

              <Button
                variant="secondary"
                size="md"
                onClick={this.handleGoHome}
                className="cursor-pointer font-semibold"
              >
                <Home className="h-4 w-4 mr-1.5" />
                <span>Back to Dashboard</span>
              </Button>
            </div>

            {/* Development-only collapsible stack trace */}
            {isDev && this.state.error && (
              <div className="pt-4 border-t border-slate-100 text-left">
                <button
                  onClick={this.toggleDetails}
                  className="flex items-center justify-between w-full text-xs font-mono font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  <span>Technical Diagnostics (Dev Mode)</span>
                  {this.state.showDetails ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>

                {this.state.showDetails && (
                  <div className="mt-3 p-3.5 rounded-xl bg-slate-950 text-slate-200 font-mono text-[11px] overflow-x-auto max-h-56 leading-relaxed">
                    <p className="text-rose-400 font-bold mb-2">
                      {this.state.error.toString()}
                    </p>
                    {this.state.errorInfo?.componentStack && (
                      <pre className="text-slate-400 whitespace-pre-wrap">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
