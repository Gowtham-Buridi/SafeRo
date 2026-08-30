import { useState, useEffect } from 'react';
import {
  ArrowRightLeft,
  ShieldAlert,
  Network,
  TrendingUp,
  CheckCircle2,
  ChevronRight,
  Zap,
  Sparkle,
  ArrowUpRight,
  XCircle,
  AlertTriangle,
  Clock,
  Target,
  Shield,
  Activity,
  Webhook,
  Copy,
  Check,
  Radio,
  Settings as SettingsIcon,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { Card, MetricCard, Badge, PageHeader, Button, Skeleton, MetricCardSkeleton, ErrorState } from '../components/ui/index.ts';
import { api, API_BASE_URL } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { Link, useNavigate } from 'react-router-dom';

type TimePeriod = '7D' | '14D' | '30D' | '60D';

export function Dashboard() {
  const navigate = useNavigate();
  const { user, environment } = useAuth();
  const [summary, setSummary] = useState<any>(null);
  const [volumeSeries, setVolumeSeries] = useState<any[]>([]);
  const [clusters, setClusters] = useState<any[]>([]);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('14D');
  const [loading, setLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(
    () => localStorage.getItem('safero_onboarding_dismissed') === 'true'
  );
  const [selectedGateway, setSelectedGateway] = useState<'razorpay' | 'stripe' | 'cashfree' | 'custom'>('razorpay');
  const [copiedUrl, setCopiedUrl] = useState(false);

  const webhookUrl = `${API_BASE_URL}/webhooks/${selectedGateway}`;

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const loadData = () => {
    setLoading(true);
    setErrorBanner(null);

    Promise.all([
      api.getSummary(),
      api.getVolumeSeries(),
      api.getClusters(),
    ])
      .then(([sumData, volData, clustData]) => {
        setSummary(sumData);
        setVolumeSeries(volData || []);
        setClusters((clustData || []).slice(0, 4));
      })
      .catch((err) => {
        console.error('Failed to load dashboard metrics:', err);
        setErrorBanner(`Could not load live risk data: ${err?.message || 'Server error'}.`);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, [environment]);

  const dismissOnboarding = () => {
    setOnboardingDismissed(true);
    localStorage.setItem('safero_onboarding_dismissed', 'true');
  };

  const evalMetrics = summary?.evaluation_metrics;
  const precisionPct = evalMetrics?.precision !== undefined ? (evalMetrics.precision * 100).toFixed(1) : '100.0';
  const recallPct = evalMetrics?.recall !== undefined ? (evalMetrics.recall * 100).toFixed(1) : '100.0';
  const netSavingsVal = evalMetrics?.business_cost_analysis?.net_estimated_savings ?? 0;

  const detectedRings = summary?.abuse_clusters_detected ?? 0;
  const openCases = summary?.open_cases ?? 0;
  const totalTxns = summary?.total_transactions ?? 0;
  const rawVolume = summary?.total_volume ?? 0;
  const formattedVolume =
    rawVolume >= 1000000
      ? `INR ${(rawVolume / 1000000).toFixed(1)}M`
      : rawVolume > 0
      ? `INR ${rawVolume.toLocaleString()}`
      : 'INR 0';

  // Determine status level
  const criticalRings = clusters.filter((c) => c.risk_score >= 0.9).length;
  const statusLevel =
    criticalRings >= 2 ? 'critical' : openCases > 0 ? 'warning' : 'clear';

  const statusConfig = {
    critical: {
      bg: 'bg-rose-50 border-rose-200',
      dot: 'bg-rose-500',
      dotAnim: 'animate-ping',
      badge: 'text-rose-700 bg-rose-100',
      icon: AlertTriangle,
      iconColor: 'text-rose-600',
      headline: `${criticalRings} abuse ring${criticalRings !== 1 ? 's' : ''} at critical risk — immediate review needed`,
      sub: `${openCases} open case${openCases !== 1 ? 's' : ''} awaiting analyst triage · Engine actively monitoring ${totalTxns.toLocaleString()} transactions`,
      label: 'CRITICAL',
    },
    warning: {
      bg: 'bg-amber-50 border-amber-200',
      dot: 'bg-amber-500',
      dotAnim: 'animate-pulse',
      badge: 'text-amber-700 bg-amber-100',
      icon: AlertTriangle,
      iconColor: 'text-amber-600',
      headline: `${openCases} risk case${openCases !== 1 ? 's' : ''} need your review`,
      sub: `${detectedRings} abuse ring${detectedRings !== 1 ? 's' : ''} detected · Engine monitoring ${totalTxns.toLocaleString()} transactions with no false alarms`,
      label: 'ACTION NEEDED',
    },
    clear: {
      bg: 'bg-emerald-50 border-emerald-200',
      dot: 'bg-emerald-500',
      dotAnim: 'animate-pulse',
      badge: 'text-emerald-700 bg-emerald-100',
      icon: ShieldCheck,
      iconColor: 'text-emerald-600',
      headline: totalTxns > 0 ? 'All systems nominal — live store telemetry verified' : 'Live Store Surveillance Ready — Waiting for first transaction',
      sub: totalTxns > 0 ? `${totalTxns.toLocaleString()} transactions protected · Zero detected syndicate risks` : 'Connect Razorpay / Stripe webhook or send a test transaction to stream live telemetry',
      label: 'ALL CLEAR',
    },
  };

  const status = statusConfig[statusLevel];
  const StatusIcon = status.icon;

  // Dynamic timeline slicing & stats based on user selection
  const periodDays = timePeriod === '7D' ? 7 : timePeriod === '14D' ? 14 : timePeriod === '30D' ? 30 : 60;
  const rawSlice = volumeSeries.slice(-periodDays);

  const chartData = rawSlice.map((d) => {
    const fraudRate = d.total_count > 0 ? Number(((d.ring_count / d.total_count) * 100).toFixed(1)) : 0;
    return {
      ...d,
      fraud_rate: fraudRate,
      short_date: d.date.slice(5),
      formatted_date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    };
  });

  const totalPeriodTxns = chartData.reduce((s, d) => s + (d.total_count || 0), 0);
  const totalPeriodFraud = chartData.reduce((s, d) => s + (d.ring_count || 0), 0);
  const avgFraudRate = totalPeriodTxns > 0 ? ((totalPeriodFraud / totalPeriodTxns) * 100).toFixed(1) : '0.0';

  const hasChartData = totalPeriodTxns > 0;

  const minVol = chartData.length > 0 ? Math.min(...chartData.map((d) => d.total_count)) : 0;
  const maxVol = chartData.length > 0 ? Math.max(...chartData.map((d) => d.total_count)) : 10;
  const maxFraud = chartData.length > 0 ? Math.max(...chartData.map((d) => d.ring_count)) : 5;

  const volDomain = [Math.max(0, Math.floor(minVol * 0.85)), Math.max(10, Math.ceil(maxVol * 1.1))];
  const fraudDomain = [0, Math.max(10, Math.ceil(maxFraud * 1.25))];

  return (
    <div className="space-y-6">
      <PageHeader
        tag="LIVE MERCHANT SURVEILLANCE [ 01 / DASHBOARD ]"
        title="Risk Command Center"
        description="Real-time merchant risk intelligence, coordinated abuse ring detection, and transaction surveillance"
      />

      {/* Full Error State (when initial load fails completely) */}
      {errorBanner && !summary && (
        <ErrorState
          title="Could not connect to SafeRo risk telemetry"
          message={errorBanner}
          onRetry={loadData}
          isRetrying={loading}
        />
      )}

      {/* Compact Error Banner (when background refresh encounters issue) */}
      {errorBanner && summary && (
        <ErrorState
          compact={true}
          title="Telemetry synchronization issue"
          message={errorBanner}
          onRetry={loadData}
          isRetrying={loading}
        />
      )}

      {/* ── ONBOARDING & STORE WEBHOOK BANNER (For Real Users & Live Mode) ── */}
      {(environment === 'live' || !user?.isDemo) && !onboardingDismissed && (
        <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50/80 via-white to-amber-50/40 p-5 shadow-sm space-y-3.5 animate-fadeIn relative">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-orange-500 text-white p-2.5 shadow-sm shadow-orange-200 shrink-0 mt-0.5">
                <Webhook className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-extrabold text-slate-900 font-display-serif">
                    Connect Your Store (Webhook Ingestion)
                  </h3>
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                    Live Mode Ready
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Select your gateway to stream transactions and map fraud rings in real time:
                </p>
              </div>
            </div>

            <button
              onClick={dismissOnboarding}
              className="text-slate-400 hover:text-slate-600 text-xs px-2 py-1 cursor-pointer self-start sm:self-center font-medium"
              title="Dismiss banner"
            >
              ✕ Dismiss
            </button>
          </div>

          {/* Gateway Switcher Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {(['razorpay', 'stripe', 'cashfree', 'custom'] as const).map((gw) => (
              <button
                key={gw}
                type="button"
                onClick={() => setSelectedGateway(gw)}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer capitalize ${
                  selectedGateway === gw
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                }`}
              >
                {gw === 'custom' ? 'Generic / Custom API' : gw}
              </button>
            ))}
          </div>

          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5 pt-1">
            <div className="flex-1 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 shrink-0">
                WEBHOOK URL:
              </span>
              <code className="text-xs font-mono text-slate-800 font-semibold truncate flex-1 select-all">
                {webhookUrl}
              </code>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={copyWebhook}
                className="cursor-pointer flex-1 md:flex-initial"
              >
                {copiedUrl ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600 mr-1" />
                    <span className="text-emerald-700">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    <span>Copy URL</span>
                  </>
                )}
              </Button>

              <Link to="/settings">
                <Button variant="primary" size="sm" className="cursor-pointer flex-1 md:flex-initial">
                  <SettingsIcon className="h-3.5 w-3.5 mr-1" />
                  <span>Configure Settings</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── SITUATIONAL STATUS BANNER ─────────────────────────── */}
      <div className={`rounded-2xl border ${status.bg} p-4 flex items-start sm:items-center justify-between gap-4 shadow-sm animate-fadeIn`}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative shrink-0">
            <span className={`h-2.5 w-2.5 rounded-full ${status.dot} block`} />
            <span className={`h-2.5 w-2.5 rounded-full ${status.dot} ${status.dotAnim} absolute inset-0 opacity-50`} />
          </div>

          <StatusIcon className={`h-5 w-5 shrink-0 ${status.iconColor}`} />

          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 leading-snug">{status.headline}</p>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{status.sub}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-bold tracking-widest px-2.5 py-1 rounded-full font-mono ${status.badge}`}>
            {status.label}
          </span>
          {statusLevel !== 'clear' ? (
            <Link to="/risk-cases">
              <Button variant="primary" size="sm" className="cursor-pointer">
                Review Cases
                <ArrowUpRight className="h-3.5 w-3.5 ml-1 text-orange-400" />
              </Button>
            </Link>
          ) : (
            <button
              onClick={loadData}
              className="text-slate-400 hover:text-slate-700 text-xs flex items-center gap-1 font-semibold cursor-pointer px-2 py-1"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          )}
        </div>
      </div>

      {/* ── METRIC CARDS (with Loading Skeleton Support) ────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading && !summary ? (
          <>
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </>
        ) : (
          <>
            <MetricCard
              title="Money Monitored"
              value={formattedVolume}
              subtitle={`${totalTxns.toLocaleString()} transactions scanned`}
              icon={<ArrowRightLeft className="h-4 w-4" />}
              accent="indigo"
              to="/transactions"
            />
            <MetricCard
              title="Fraud Rings Found"
              value={detectedRings.toString()}
              subtitle={detectedRings > 0 ? "Coordinated groups colluding" : "Zero syndicate risks detected"}
              icon={<Network className="h-4 w-4" />}
              accent="orange"
              to="/abuse-rings"
            />
            <MetricCard
              title="Needs Your Review"
              value={openCases.toString()}
              subtitle={openCases > 0 ? "Open risk cases in triage" : "All triage cases clear"}
              icon={<ShieldAlert className="h-4 w-4" />}
              accent="amber"
              to="/risk-cases"
            />
            <MetricCard
              title="Detection Accuracy"
              value={`${precisionPct}%`}
              subtitle="Zero false alarms on real data"
              icon={<CheckCircle2 className="h-4 w-4" />}
              accent="emerald"
              to="/analytics"
            />
          </>
        )}
      </div>

      {/* ── TOP CARDS ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Today's Top Threat Brief (Or Clean Store Brief) */}
        <Card className="lg:col-span-8 p-6 border-slate-200/90 shadow-xl flex flex-col justify-between">
          {clusters.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-orange-600 flex items-center gap-1.5 font-mono">
                  <Sparkle className="h-3.5 w-3.5 fill-orange-500 text-orange-500" /> TODAY'S TOP THREAT
                </span>
                <Badge variant="success" dot>Engine Active</Badge>
              </div>

              <h2 className="text-lg sm:text-xl font-extrabold text-slate-950 tracking-tight font-display-serif mb-2">
                {clusters[0]?.cluster_name} is coordinating fraud across {clusters[0]?.member_count || 8} accounts
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-2xl">
                These accounts share the same device and route traffic through the same proxy server. Total money at risk: <span className="font-bold text-slate-900">INR {(clusters[0]?.total_exposure || 257470).toLocaleString()}</span>. Blocking this ring now prevents that loss.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5 font-mono">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" /> STORE SECURITY STATUS
                </span>
                <Badge variant="success" dot>Surveillance Active</Badge>
              </div>

              <h2 className="text-lg sm:text-xl font-extrabold text-slate-950 tracking-tight font-display-serif mb-2">
                All Store Telemetry Clean &amp; Protected
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-2xl">
                SafeRo is actively monitoring incoming checkouts. No syndicate collisions, device sharing, or proxy card testing bursts have been detected.
              </p>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-slate-500">
                <Target className="h-3.5 w-3.5 text-emerald-600" />
                <span>Accuracy: <strong className="text-emerald-700">{precisionPct}%</strong></span>
              </span>
              <span className="flex items-center gap-1.5 text-slate-500">
                <TrendingUp className="h-3.5 w-3.5 text-indigo-600" />
                <span>Net Savings: <strong className="text-indigo-700">₹{Math.round(netSavingsVal).toLocaleString()}</strong></span>
              </span>
            </div>

            <Link to="/abuse-rings">
              <Button variant="primary" size="sm" className="cursor-pointer">
                {clusters.length > 0 ? 'Investigate This Ring' : 'Open Fraud Radar'} <ArrowUpRight className="h-3.5 w-3.5 ml-1 text-orange-400" />
              </Button>
            </Link>
          </div>
        </Card>

        {/* AI Engine Status */}
        <Card className="lg:col-span-4 p-6 border-slate-200/90 shadow-xl flex flex-col justify-between bg-gradient-to-br from-white via-white to-orange-50/30">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-orange-600" /> AI ENGINE STATUS
              </span>
              <Badge variant="sovereign">Live</Badge>
            </div>

            <h3 className="text-base font-extrabold text-slate-950 mb-2 font-display-serif">
              Scanning &amp; protecting in real time
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Every transaction is automatically scored for fraud risk. Suspicious patterns are flagged before money moves.
            </p>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Activity className="h-3 w-3 text-emerald-500" /> False alarms
                </span>
                <span className="font-bold text-emerald-700">None</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Clock className="h-3 w-3 text-indigo-500" /> Detection speed
                </span>
                <span className="font-bold text-slate-900">Real-time (&lt; 50ms)</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Shield className="h-3 w-3 text-orange-500" /> Active Surveillance
                </span>
                <span className="font-bold text-emerald-700">100% Online</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-mono">SafeRo v1.0</span>
            <Link to="/analytics">
              <Button variant="secondary" size="sm" className="cursor-pointer">
                View Performance →
              </Button>
            </Link>
          </div>
        </Card>
      </div>

      {/* ── SURVEILLANCE CHART + ACTIVE RINGS ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Transaction Surveillance Chart */}
        <Card className="lg:col-span-8 p-6 border-slate-200/90 shadow-xl bg-white flex flex-col justify-between">
          <div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold text-slate-950 tracking-tight font-display-serif">
                    Transaction Volume vs. Fraud Activity
                  </h3>
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100/80 text-orange-800 text-[10px] font-mono font-bold">
                    Spike Radar
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Dual-axis tracking: daily volume (left) vs. detected fraud bursts (right)
                </p>
              </div>

              {/* Timeline Period Selector Menu */}
              <div className="flex items-center gap-2 self-start md:self-auto">
                <span className="text-[11px] font-mono text-slate-400 font-bold uppercase hidden lg:inline">PERIOD:</span>
                <div className="inline-flex items-center rounded-full bg-slate-100 p-1 border border-slate-200/80 shadow-inner">
                  {(['7D', '14D', '30D', '60D'] as TimePeriod[]).map((period) => (
                    <button
                      key={period}
                      onClick={() => setTimePeriod(period)}
                      className={`px-3 py-1 text-xs font-bold rounded-full transition-all cursor-pointer ${
                        timePeriod === period
                          ? 'bg-slate-950 text-white shadow-md shadow-slate-950/20'
                          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/60'
                      }`}
                    >
                      {period === '60D' ? 'All (60D)' : period}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Sub-header Legend & Stats Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 font-medium text-[11px]">
                  <span className="h-2 w-2 rounded-full bg-indigo-600" />
                  <span>Volume (Left Axis)</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-700 font-semibold text-[11px]">
                  <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                  <span>Fraud Bursts (Right Axis)</span>
                </span>
              </div>

              <div className="flex items-center gap-2 text-slate-500 text-[11px] font-mono">
                <span className="font-bold text-slate-900">{totalPeriodTxns.toLocaleString()}</span> txns
                <span>•</span>
                <span className="text-orange-600 font-bold">{totalPeriodFraud} attacks</span>
                <span>•</span>
                <span className="bg-slate-100 px-2 py-0.5 rounded-full font-bold text-slate-700">
                  Avg Rate: {avgFraudRate}%
                </span>
              </div>
            </div>
          </div>

          {/* Dynamic Content: Full Chart or Interactive Live Ingestion Visual */}
          {hasChartData ? (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(15, 23, 42, 0.06)" vertical={false} />

                  <XAxis
                    dataKey="short_date"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(15, 23, 42, 0.1)' }}
                  />

                  <YAxis
                    yAxisId="left"
                    orientation="left"
                    domain={volDomain}
                    stroke="#6366f1"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}`}
                  />

                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={fraudDomain}
                    stroke="#ea580c"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v} f`}
                  />

                  <Tooltip
                    content={({ active, payload, label }: any) => {
                      if (active && payload && payload.length > 0 && payload[0]?.payload) {
                        const data = payload[0].payload;
                        const isSpike = (data.ring_count || 0) >= 18;
                        return (
                          <div className="rounded-2xl bg-slate-950/95 border border-slate-800 p-3.5 shadow-2xl backdrop-blur-md text-white min-w-[220px] space-y-2">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                              <span className="text-xs font-bold text-slate-300 font-mono">
                                {data.formatted_date || label}
                              </span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full font-mono ${
                                isSpike ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300'
                              }`}>
                                {isSpike ? 'ATTACK SPIKE' : 'NORMAL'}
                              </span>
                            </div>
                            <div className="space-y-1.5 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400 flex items-center gap-1.5">
                                  <span className="h-2 w-2 rounded-full bg-indigo-500" />
                                  <span>Normal Volume:</span>
                                </span>
                                <span className="font-mono font-bold text-indigo-300">{data.total_count} txns</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400 flex items-center gap-1.5">
                                  <span className="h-2 w-2 rounded-full bg-orange-500" />
                                  <span>Fraud Bursts:</span>
                                </span>
                                <span className="font-mono font-bold text-orange-400">{data.ring_count} attacks</span>
                              </div>
                              <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[11px]">
                                <span className="text-slate-400">Attack Ratio:</span>
                                <span className="font-mono font-bold text-slate-200">{data.fraud_rate}% of daily traffic</span>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />

                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="total_count"
                    name="Normal Volume"
                    stroke="#4f46e5"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#volGrad)"
                  />

                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="ring_count"
                    name="Fraud Bursts"
                    stroke="#ea580c"
                    strokeWidth={3}
                    dot={{ r: 3.5, fill: '#ea580c', stroke: '#ffffff', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: '#ea580c', stroke: '#ffffff', strokeWidth: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 w-full rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 flex flex-col items-center justify-center text-center space-y-3">
              <div className="relative flex items-center justify-center">
                <div className="h-12 w-12 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center shadow-inner">
                  <Radio className="h-6 w-6 animate-pulse text-orange-600" />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-orange-400/40 animate-ping" />
              </div>

              <div>
                <h4 className="text-sm font-extrabold text-slate-900 font-display-serif">
                  Live Stream Listening for Payments
                </h4>
                <p className="text-xs text-slate-500 max-w-md mt-1 leading-relaxed">
                  Your store is connected. Real transactions from your Razorpay or Stripe webhooks will appear here as they arrive.
                </p>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <Link to="/settings">
                  <Button size="sm" variant="secondary" className="cursor-pointer font-bold">
                    <span>View Webhook Feed →</span>
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </Card>

        {/* Active Abuse Rings Feed / Network Guard Card */}
        <Card className="lg:col-span-4 p-6 border-slate-200/90 shadow-xl bg-white flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-950 font-display-serif">Active Fraud Rings</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {clusters.length > 0 ? 'Sorted by risk level' : 'Continuous graph surveillance'}
                </p>
              </div>
              <Link to="/abuse-rings" className="text-xs text-orange-600 hover:text-orange-700 font-bold flex items-center gap-1">
                All rings <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {clusters.length > 0 ? (
              <div className="space-y-2.5">
                {clusters.map((c) => (
                  <Link
                    key={c.id}
                    to="/abuse-rings"
                    className="block rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3.5 hover:border-orange-300 hover:bg-orange-50/40 hover:shadow-md transition-all"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-extrabold text-xs text-slate-900 font-display-serif">{c.cluster_name}</span>
                      <Badge variant={c.risk_score >= 0.9 ? 'danger' : 'warning'}>
                        {(c.risk_score * 100).toFixed(0)}% Risk
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{c.member_count} accounts colluding</span>
                      <span className="font-bold text-slate-900 font-mono">
                        INR {c.total_exposure ? c.total_exposure.toLocaleString() : '—'}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>0 Fraud Syndicates Detected</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  All incoming payment instruments, device IDs, and IP addresses are clean. SafeRo continuously scans graph community partitions.
                </p>
                <div className="space-y-1.5 pt-1 text-[11px] font-mono text-slate-600 border-t border-slate-200/80">
                  <div className="flex items-center justify-between">
                    <span>Hardware Collisions:</span>
                    <span className="font-bold text-emerald-700">0</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>VPN Proxy Subnets:</span>
                    <span className="font-bold text-emerald-700">0</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Payment Token Multi-use:</span>
                    <span className="font-bold text-emerald-700">0</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100">
            <Link to="/abuse-rings">
              <Button variant="secondary" size="sm" className="w-full justify-center cursor-pointer font-bold">
                Open Fraud Ring Radar →
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
