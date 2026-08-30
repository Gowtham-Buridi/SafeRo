import { useNavigate, Link } from 'react-router-dom';
import { Compass, ArrowLeft, ShieldAlert, Home, Search } from 'lucide-react';
import { Button, Logo } from '../components/ui/index.ts';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="relative mb-6">
        {/* Glowing badge container */}
        <div className="h-24 w-24 rounded-3xl bg-gradient-to-tr from-orange-100 via-amber-50 to-rose-100 border border-orange-200/80 flex items-center justify-center shadow-lg shadow-orange-500/10 mx-auto">
          <Compass className="h-12 w-12 text-orange-600 animate-spin-slow" />
        </div>
        <div className="absolute -top-1 -right-1 h-7 w-7 rounded-full bg-rose-600 text-white flex items-center justify-center text-xs font-black font-mono border-2 border-white shadow-xs">
          404
        </div>
      </div>

      <div className="max-w-md space-y-2">
        <span className="text-[11px] font-mono font-extrabold uppercase tracking-widest text-orange-600 bg-orange-50 px-3 py-1 rounded-full border border-orange-200/60">
          Route Not Located
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-950 font-display-serif tracking-tight pt-1">
          Page Not Found
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
          The requested surveillance view or endpoint does not exist or has been relocated within the risk platform.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button
          variant="primary"
          size="md"
          onClick={() => navigate('/dashboard')}
          className="cursor-pointer font-bold shadow-md shadow-orange-600/20"
        >
          <Home className="h-4 w-4 mr-2" />
          <span>Return to Command Center</span>
        </Button>

        <Button
          variant="secondary"
          size="md"
          onClick={() => navigate(-1)}
          className="cursor-pointer font-semibold"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          <span>Go Back</span>
        </Button>
      </div>

      {/* Quick Navigation Links */}
      <div className="mt-12 pt-8 border-t border-slate-200/80 max-w-sm w-full">
        <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-3">
          Quick Navigation
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs font-medium text-slate-600">
          <Link
            to="/transactions"
            className="p-2 rounded-xl bg-slate-50 hover:bg-orange-50 hover:text-orange-700 transition-colors border border-slate-200/60"
          >
            💳 Transactions
          </Link>
          <Link
            to="/abuse-rings"
            className="p-2 rounded-xl bg-slate-50 hover:bg-orange-50 hover:text-orange-700 transition-colors border border-slate-200/60"
          >
            🕸️ Abuse Rings
          </Link>
          <Link
            to="/risk-cases"
            className="p-2 rounded-xl bg-slate-50 hover:bg-orange-50 hover:text-orange-700 transition-colors border border-slate-200/60"
          >
            🛡️ Risk Cases
          </Link>
          <Link
            to="/analytics"
            className="p-2 rounded-xl bg-slate-50 hover:bg-orange-50 hover:text-orange-700 transition-colors border border-slate-200/60"
          >
            📈 Analytics
          </Link>
        </div>
      </div>
    </div>
  );
}
