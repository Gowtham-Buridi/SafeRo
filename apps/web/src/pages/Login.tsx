import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.tsx';
import { LogoMark } from '../components/ui/Logo.tsx';
import {
  Mail,
  Lock,
  User,
  ArrowRight,
  Sparkle,
  Shield,
  Network,
  Zap,
  Eye,
  EyeOff,
  CheckCircle2,
  KeyRound,
} from 'lucide-react';

// ─── Feature card shown on the right panel ─────────────────────
function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="group flex flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white/70 backdrop-blur-sm p-4 hover:shadow-md hover:border-orange-200 transition-all duration-200 cursor-default">
      <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center shadow-sm shadow-orange-200 group-hover:scale-105 transition-transform duration-200">
        <Icon className="h-4.5 w-4.5 text-white" />
      </div>
      <p className="text-sm font-bold text-slate-900">{title}</p>
      <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
    </div>
  );
}

interface LoginProps {
  defaultMode?: 'signin' | 'register';
}

// ─── Main Login & Register Page ────────────────────────────────
export function Login({ defaultMode }: LoginProps) {
  const { isAuthenticated, login, register, loginDemo } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialMode = defaultMode || (searchParams.get('mode') === 'register' ? 'register' : 'signin');
  const [mode, setMode] = useState<'signin' | 'register'>(initialMode);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ fullName?: string; email?: string; password?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Check for session expired redirect
  useEffect(() => {
    const isExpiredParam = searchParams.get('session_expired') === '1';
    let isExpiredStorage = false;
    try {
      isExpiredStorage = sessionStorage.getItem('safero_session_expired') === 'true';
      if (isExpiredStorage) {
        sessionStorage.removeItem('safero_session_expired');
      }
    } catch {}

    if (isExpiredParam || isExpiredStorage) {
      setSessionExpired(true);
    }
  }, [searchParams]);

  // If already authenticated with valid token, redirect to dashboard
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const switchMode = (newMode: 'signin' | 'register') => {
    setMode(newMode);
    setError(null);
    setFieldErrors({});
    setSearchParams(newMode === 'register' ? { mode: 'register' } : {});
  };

  const handleAutofill = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
    setFieldErrors({});
    setMode('signin');
  };

  const validateInputs = (): boolean => {
    const errors: { fullName?: string; email?: string; password?: string } = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (mode === 'register' && !fullName.trim()) {
      errors.fullName = 'Full name is required';
    }

    if (!email.trim()) {
      errors.email = 'Email address is required';
    } else if (!emailRegex.test(email.trim())) {
      errors.email = 'Please enter a valid email address (e.g. analyst@safero.io)';
    }

    if (!password.trim()) {
      errors.password = 'Password is required';
    } else if (mode === 'register' && password.length < 8) {
      errors.password = 'Password must be at least 8 characters long';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateInputs()) {
      return;
    }

    if (mode === 'register') {
      setIsSubmitting(true);
      const result = await register(email, password, fullName);
      setIsSubmitting(false);

      if (result.success) {
        navigate('/dashboard', { replace: true });
      } else {
        setError(result.error || 'Registration failed. Please try again.');
      }
    } else {
      setIsSubmitting(true);
      const result = await login(email, password);
      setIsSubmitting(false);

      if (result.success) {
        navigate('/dashboard', { replace: true });
      } else {
        setError(result.error || 'Login failed. Please verify your credentials.');
      }
    }
  };

  const handleDemo = async () => {
    setError(null);
    setFieldErrors({});
    setIsDemoLoading(true);

    const result = await loginDemo();
    setIsDemoLoading(false);

    if (result.success) {
      navigate('/dashboard', { replace: true });
    } else {
      setError(result.error || 'Demo sign-in failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-[#fbfbfd] flex overflow-hidden relative">
      {/* ── Ambient Background ───────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-[100px] left-[10%] w-[500px] h-[500px] rounded-full bg-gradient-to-br from-orange-400/15 via-amber-300/10 to-transparent blur-[120px] animate-floatBlob1" />
        <div className="absolute top-[20%] right-[5%] w-[400px] h-[400px] rounded-full bg-gradient-to-bl from-indigo-500/12 via-violet-400/8 to-transparent blur-[130px] animate-floatBlob2" />
        <div className="absolute bottom-[10%] left-[30%] w-[600px] h-[300px] rounded-full bg-gradient-to-r from-orange-300/8 via-indigo-300/6 to-transparent blur-[140px] animate-floatBlob3" />
        <div className="absolute inset-0 bg-isometric-grid opacity-50 animate-shimmer" />
      </div>

      {/* ══════════════════════════════════════════════════════
          LEFT PANEL — Auth Form (Login / Register)
      ══════════════════════════════════════════════════════ */}
      <div className="relative z-10 w-full lg:w-[480px] xl:w-[520px] flex flex-col justify-center px-8 sm:px-12 lg:px-16 py-12 shrink-0 overflow-y-auto">
        {/* Logo */}
        <div className="mb-8">
          <a href="/login" className="flex items-center gap-2.5 w-fit select-none">
            <LogoMark className="h-8 w-8" />
            <div className="flex flex-col leading-none">
              <div className="font-display-serif font-black tracking-tight text-2xl">
                <span className="text-slate-950">Safe</span>
                <span className="text-[#ea580c]">Ro</span>
              </div>
              <span className="font-sans font-bold uppercase text-slate-500 text-[8px] tracking-[0.22em] mt-0.5">
                RISK INTELLIGENCE
              </span>
            </div>
          </a>
        </div>

        {/* Headline */}
        <div className="mb-6">
          <div className="flex items-center gap-1.5 text-orange-600 mb-2">
            <Sparkle className="h-3.5 w-3.5 fill-orange-500 text-orange-500" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-orange-700">
              Merchant Risk Platform
            </span>
          </div>
          <h1 className="font-display-serif font-black text-3xl sm:text-4xl text-slate-950 tracking-tight leading-[1.1] mb-2">
            {mode === 'signin' ? (
              <>
                Sign in to<br />your account
              </>
            ) : (
              <>
                Create a new<br />analyst account
              </>
            )}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
            {mode === 'signin'
              ? 'Access real-time fraud detection, abuse ring radar, and AI forensics.'
              : 'Join the SafeRo risk intelligence network with instant analyst credentials.'}
          </p>
        </div>

        {/* Session Expired Banner */}
        {sessionExpired && (
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50/90 p-3.5 text-xs text-amber-900 shadow-xs animate-in fade-in duration-200">
            <div className="h-8 w-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <p className="font-bold text-amber-950">Session Expired</p>
              <p className="text-amber-800 text-[11px]">Your authentication token has expired. Please sign in again to continue.</p>
            </div>
          </div>
        )}

        {/* Tab Mode Switcher */}
        <div className="flex items-center p-1 bg-slate-100/90 rounded-xl mb-5 border border-slate-200/80">
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all duration-150 cursor-pointer ${
              mode === 'signin'
                ? 'bg-white text-slate-950 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all duration-150 cursor-pointer ${
              mode === 'register'
                ? 'bg-white text-slate-950 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* ── Demo Account CTA (in signin mode) ───────────────── */}
        {mode === 'signin' && (
          <>
            <button
              id="demo-login-btn"
              onClick={handleDemo}
              disabled={isDemoLoading || isSubmitting}
              className="group w-full flex items-center justify-between rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 px-4 py-3.5 mb-5 hover:from-orange-100 hover:to-amber-100 hover:border-orange-300 hover:shadow-md hover:shadow-orange-100 transition-all duration-200 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center shadow-sm shadow-orange-300/50 shrink-0 group-hover:scale-105 transition-transform duration-200">
                  {isDemoLoading ? (
                    <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  ) : (
                    <Zap className="h-4.5 w-4.5 text-white fill-white/30" />
                  )}
                </div>
                <div className="text-left">
                  <p className="text-xs sm:text-sm font-bold text-slate-900">Try Demo Account</p>
                  <p className="text-[11px] text-orange-700 font-medium">
                    Instant 1-click access · Seeded telemetry
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-orange-500 group-hover:translate-x-0.5 transition-transform duration-200" />
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-[11px] text-slate-400 font-medium">or enter credentials</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
          </>
        )}

        {/* ── Form ────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
          {/* Full Name (Only in register mode) */}
          {mode === 'register' && (
            <div className="space-y-1">
              <label
                htmlFor="register-fullname"
                className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider"
              >
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  id="register-fullname"
                  type="text"
                  autoComplete="name"
                  placeholder="Risk Analyst Name"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    setError(null);
                    setFieldErrors((prev) => ({ ...prev, fullName: undefined }));
                  }}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all ${
                    fieldErrors.fullName
                      ? 'border-rose-300 bg-rose-50/30 focus:ring-rose-500/30 focus:border-rose-400'
                      : 'border-slate-200 bg-white focus:ring-orange-500/30 focus:border-orange-400'
                  }`}
                />
              </div>
              {fieldErrors.fullName && (
                <p className="text-[11px] text-rose-600 font-medium mt-1 animate-in fade-in duration-150">
                  {fieldErrors.fullName}
                </p>
              )}
            </div>
          )}

          {/* Email */}
          <div className="space-y-1">
            <label
              htmlFor="login-email"
              className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider"
            >
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="analyst@safero.io"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                  setFieldErrors((prev) => ({ ...prev, email: undefined }));
                }}
                className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all ${
                  fieldErrors.email
                    ? 'border-rose-300 bg-rose-50/30 focus:ring-rose-500/30 focus:border-rose-400'
                    : 'border-slate-200 bg-white focus:ring-orange-500/30 focus:border-orange-400'
                }`}
              />
            </div>
            {fieldErrors.email && (
              <p className="text-[11px] text-rose-600 font-medium mt-1 animate-in fade-in duration-150">
                {fieldErrors.email}
              </p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-1">
            <label
              htmlFor="login-password"
              className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider"
            >
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                  setFieldErrors((prev) => ({ ...prev, password: undefined }));
                }}
                className={`w-full pl-10 pr-11 py-2.5 rounded-xl border text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all ${
                  fieldErrors.password
                    ? 'border-rose-300 bg-rose-50/30 focus:ring-rose-500/30 focus:border-rose-400'
                    : 'border-slate-200 bg-white focus:ring-orange-500/30 focus:border-orange-400'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {fieldErrors.password ? (
              <p className="text-[11px] text-rose-600 font-medium mt-1 animate-in fade-in duration-150">
                {fieldErrors.password}
              </p>
            ) : mode === 'register' ? (
              <p className="text-[10px] text-slate-400 mt-0.5">Must be at least 8 characters</p>
            ) : null}
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 font-medium animate-in fade-in duration-200">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
              {error}
            </div>
          )}

          {/* Submit button */}
          <button
            id="login-submit-btn"
            type="submit"
            disabled={isSubmitting || isDemoLoading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-950 text-white py-3 text-sm font-bold hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-950/40 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 mt-2 cursor-pointer shadow-sm"
          >
            {isSubmitting ? (
              <>
                <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                <span>{mode === 'register' ? 'Creating Account…' : 'Signing in…'}</span>
              </>
            ) : (
              <>
                <span>{mode === 'register' ? 'Create Account & Sign In' : 'Sign In'}</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Quick Seeded Credentials Helper */}
        {mode === 'signin' && (
          <div className="mt-5 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 text-[11px] text-slate-600">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700 mb-1.5">
              <KeyRound className="h-3.5 w-3.5 text-orange-600" />
              <span>Quick Seeded Accounts (Click to autofill):</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              <button
                type="button"
                onClick={() => handleAutofill('demo@safero.internal', 'SafeRo#Demo2026!')}
                className="px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-800 hover:border-orange-300 hover:bg-orange-50/50 transition-colors cursor-pointer text-[10px] font-mono"
              >
                demo@safero.internal (SafeRo#Demo2026!)
              </button>
              <button
                type="button"
                onClick={() => handleAutofill('admin@safero.io', 'Admin1234!')}
                className="px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-800 hover:border-orange-300 hover:bg-orange-50/50 transition-colors cursor-pointer text-[10px] font-mono"
              >
                admin@safero.io (Admin1234!)
              </button>
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          SafeRo is a defense-only platform. All data is encrypted in transit.
        </p>
      </div>

      {/* ══════════════════════════════════════════════════════
          RIGHT PANEL — Hero / Features (hidden on mobile)
      ══════════════════════════════════════════════════════ */}
      <div className="relative z-10 hidden lg:flex flex-1 flex-col justify-center px-12 xl:px-16 py-12 border-l border-slate-200/60">
        {/* Tagline */}
        <div className="mb-10">
          <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600 mb-4">
            AI Risk Intelligence
          </p>
          <h2 className="font-display-serif font-black text-5xl xl:text-6xl text-slate-950 leading-[1.02] tracking-tight mb-5">
            See Every Threat.<br />
            <span className="text-[#ea580c]">Before It Strikes.</span>
          </h2>
          <p className="text-base text-slate-500 leading-relaxed max-w-md">
            Coordinated abuse-ring detection, real-time fraud surveillance, and AI-grounded
            investigation — built for Indian merchants.
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-2 gap-3 w-full">
          <FeatureCard
            icon={Network}
            title="Abuse Ring Radar"
            description="Louvain graph community detection over 4 entity types — devices, IPs, cards, customers."
          />
          <FeatureCard
            icon={Shield}
            title="AI Investigation"
            description="Ask natural language questions, get grounded answers backed by deterministic graph evidence."
          />
          <FeatureCard
            icon={Zap}
            title="Fraud Spike Alerts"
            description="Rolling Z-score surveillance across hourly transaction volume and card testing bursts."
          />
          <FeatureCard
            icon={CheckCircle2}
            title="Zero False Positives"
            description="100% precision, 81.8% recall on held-out test. 0.0058 Brier score on calibration."
          />
        </div>

        {/* Bottom badge */}
        <div className="mt-10 flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-700">Live Platform Active</span>
          </div>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs text-slate-400">Zero Paid Dependencies</span>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs text-slate-400">MIT License</span>
        </div>
      </div>
    </div>
  );
}
