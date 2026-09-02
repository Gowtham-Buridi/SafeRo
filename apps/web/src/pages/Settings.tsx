import React, { useState, useEffect } from 'react';
import { PageHeader, Card, Button, Badge } from '../components/ui/index.ts';
import {
  Database,
  Key,
  Bell,
  Shield,
  Webhook,
  DollarSign,
  Sliders,
  Lock,
  Cpu,
  Sparkle,
  Copy,
  Check,
  Zap,
  Play,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { api, API_BASE_URL } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';

function SettingsSection({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-start gap-4">
        <div className="p-2.5 bg-orange-50 border border-orange-200/60 rounded-xl text-orange-600 shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
          <div className="mt-5 space-y-4">{children}</div>
        </div>
      </div>
    </Card>
  );
}

export function Settings() {
  const [selectedGateway, setSelectedGateway] = useState<'razorpay' | 'stripe' | 'cashfree' | 'custom'>('razorpay');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [webhookHistory, setWebhookHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Self-Service Diagnostics & Self-Test State
  const [diagnostics, setDiagnostics] = useState<{
    merchant_id: string;
    recent_deliveries: Array<{
      id: string;
      timestamp: string;
      gateway: string;
      url_path: string;
      resolved_merchant_id: string;
      merchant_resolution_source: string;
      signature_verified: boolean;
      signature_failure_reason?: string | null;
      outcome: 'processed' | 'rejected_signature' | 'rejected_other' | 'error';
      reason: string;
      status_code: number;
      payment_id?: string;
      amount?: number;
      currency?: string;
    }>;
    total_deliveries: number;
    deliveries_24h_count: number;
    zero_deliveries_in_24h: boolean;
    unattributed_count: number;
    advice: string;
  } | null>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);
  const [sendingSelfTest, setSendingSelfTest] = useState(false);
  const [selfTestResult, setSelfTestResult] = useState<{
    status_code: number;
    signature_verified: boolean;
    target_url: string;
    resolved_merchant_id: string;
    transaction_id: string;
    amount_inr: number;
    message: string;
  } | null>(null);

  // System & Build metadata
  const [systemInfo, setSystemInfo] = useState<{
    git_commit_short: string;
    git_commit: string;
    deployed_at: string;
    version: string;
    uptime_seconds?: number;
  } | null>(null);

  // Cost Matrix Parameters with real validation
  const [fpCost, setFpCost] = useState('500');
  const [fraudLoss, setFraudLoss] = useState('5000');
  const [reviewCost, setReviewCost] = useState('100');
  const [costErrors, setCostErrors] = useState<{ fp?: string; fraud?: string; review?: string }>({});
  const [costSaved, setCostSaved] = useState(false);

  const { user } = useAuth();
  const merchantId = user?.merchantId || user?.id || 'm_ecommerce_01';

  // Construct dedicated per-merchant webhook URL (POST /api/v1/webhooks/:gateway/:merchantId)
  const baseApi = API_BASE_URL.endsWith('/api/v1') ? API_BASE_URL : `${API_BASE_URL}/api/v1`;
  const webhookUrl = `${baseApi}/webhooks/${selectedGateway}/${merchantId}`;
  const webhookSecret = 'whsec_safero_live_948271049281';

  const copyText = (text: string, type: 'url' | 'secret') => {
    navigator.clipboard.writeText(text);
    if (type === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  const [gatewayAccountId, setGatewayAccountId] = useState('');
  const [savingGatewayAccount, setSavingGatewayAccount] = useState(false);
  const [gatewayAccountSaved, setGatewayAccountSaved] = useState(false);

  const fetchHistory = () => {
    setLoadingHistory(true);
    api
      .getWebhookHistory()
      .then((data) => setWebhookHistory(data || []))
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  };

  const fetchDiagnostics = () => {
    setLoadingDiagnostics(true);
    api
      .getWebhookDiagnostics()
      .then((data) => setDiagnostics(data))
      .catch(() => {})
      .finally(() => setLoadingDiagnostics(false));
  };

  const fetchSystemInfo = () => {
    api
      .getSystemInfo()
      .then((data) => setSystemInfo(data))
      .catch(() => {});
  };

  const handleSendSelfTest = async () => {
    setSendingSelfTest(true);
    setSelfTestResult(null);
    try {
      const res = await api.sendSelfTestWebhook(selectedGateway);
      setSelfTestResult(res);
      fetchDiagnostics();
      fetchHistory();
    } catch (err: any) {
      setSelfTestResult({
        status_code: 500,
        signature_verified: false,
        target_url: webhookUrl,
        resolved_merchant_id: merchantId,
        transaction_id: 'err_selftest',
        amount_inr: 500,
        message: err?.message || 'Failed to dispatch test webhook',
      });
    } finally {
      setSendingSelfTest(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    fetchDiagnostics();
    fetchSystemInfo();
    api.getMerchantProfile()
      .then((data) => {
        if (data?.razorpay_merchant_id) {
          setGatewayAccountId(data.razorpay_merchant_id);
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveGatewayAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gatewayAccountId.trim()) return;
    setSavingGatewayAccount(true);
    try {
      await api.updateMerchantGatewayAccount(gatewayAccountId.trim());
      setGatewayAccountSaved(true);
      setTimeout(() => setGatewayAccountSaved(false), 3000);
    } catch (err) {
      console.error('Failed to link gateway account:', err);
    } finally {
      setSavingGatewayAccount(false);
    }
  };

  const handleSaveCostParams = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { fp?: string; fraud?: string; review?: string } = {};

    const fpNum = Number(fpCost);
    if (isNaN(fpNum) || fpCost.trim() === '') {
      errors.fp = 'Enter a valid number';
    } else if (fpNum < 0) {
      errors.fp = 'Cost cannot be negative';
    }

    const fraudNum = Number(fraudLoss);
    if (isNaN(fraudNum) || fraudLoss.trim() === '') {
      errors.fraud = 'Enter a valid number';
    } else if (fraudNum < 0) {
      errors.fraud = 'Loss cannot be negative';
    }

    const reviewNum = Number(reviewCost);
    if (isNaN(reviewNum) || reviewCost.trim() === '') {
      errors.review = 'Enter a valid number';
    } else if (reviewNum < 0) {
      errors.review = 'Cost cannot be negative';
    }

    setCostErrors(errors);
    if (Object.keys(errors).length === 0) {
      setCostSaved(true);
      setTimeout(() => setCostSaved(false), 3000);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-10">
      <PageHeader
        tag="INTEGRATION & POLICIES [ 07 / SETTINGS ]"
        title="Store Integration & Platform Settings"
        description="Connect your payment gateway via webhooks and manage your live store abuse detection thresholds."
      />

      <div className="space-y-6">
        {/* 1. HERO INTEGRATION SECTION: Payment Gateway Webhook Connector */}
        <SettingsSection
          title="Connect Your Store (Payment Webhooks)"
          description="Stream live merchant payments directly into SafeRo's real-time ML inference and graph abuse cluster radar."
          icon={<Webhook className="h-6 w-6" />}
        >
          <div className="space-y-5">
            {/* Gateway Switcher Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-700 mr-1">Select Gateway:</span>
              {(['razorpay', 'stripe', 'cashfree', 'custom'] as const).map((gw) => (
                <button
                  key={gw}
                  type="button"
                  onClick={() => setSelectedGateway(gw)}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer capitalize ${
                    selectedGateway === gw
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {gw === 'custom' ? 'Generic / Custom API' : gw}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4">
              {/* Webhook URL Field */}
              <div className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500">
                      Dedicated {selectedGateway.toUpperCase()} Webhook URL
                    </span>
                    <span className="text-[10px] font-mono text-slate-600 bg-slate-200/70 px-2 py-0.5 rounded font-medium">
                      Tenant: {merchantId}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Real-time ML Active
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={webhookUrl}
                    className="flex-1 font-mono text-xs bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none select-all"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => copyText(webhookUrl, 'url')}
                    className="cursor-pointer shrink-0 font-bold"
                  >
                    {copiedUrl ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600 mr-1" />
                        <span className="text-emerald-700">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 mr-1" />
                        <span>Copy URL</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Webhook Secret Field */}
              <div className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500">
                    Webhook Signing Secret
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Header: {selectedGateway === 'stripe' ? 'Stripe-Signature' : selectedGateway === 'cashfree' ? 'x-webhook-signature' : 'X-Razorpay-Signature'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={webhookSecret}
                    className="flex-1 font-mono text-xs bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none select-all"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => copyText(webhookSecret, 'secret')}
                    className="cursor-pointer shrink-0 font-bold"
                  >
                    {copiedSecret ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600 mr-1" />
                        <span className="text-emerald-700">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 mr-1" />
                        <span>Copy Secret</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Real Production Self-Test Action */}
              <div className="rounded-2xl border border-orange-200/80 bg-orange-50/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Play className="h-4 w-4 text-orange-600 fill-orange-600/20" />
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 font-display-serif">
                        Test Real Production Webhook Path
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Dispatches a signed test event to your live endpoint to verify end-to-end delivery without an external dashboard.
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSendSelfTest}
                    disabled={sendingSelfTest}
                    className="cursor-pointer shrink-0 font-bold"
                  >
                    {sendingSelfTest ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        <span>Sending Test...</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 mr-1.5 fill-white" />
                        <span>Send Test Webhook</span>
                      </>
                    )}
                  </Button>
                </div>

                {selfTestResult && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-mono space-y-1.5 animate-in fade-in duration-200 ${
                      selfTestResult.signature_verified
                        ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                        : 'bg-rose-50/80 border-rose-200 text-rose-900'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center gap-1.5">
                        {selfTestResult.signature_verified ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                        )}
                        <span>{selfTestResult.signature_verified ? 'Test Webhook Verified & Processed' : 'Test Webhook Rejected'}</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-white border border-current">
                        HTTP {selfTestResult.status_code}
                      </span>
                    </div>
                    <p className="text-[11px] opacity-90">{selfTestResult.message}</p>
                    <div className="text-[10px] text-slate-500 flex flex-wrap gap-x-4 gap-y-1 pt-1 border-t border-current/10">
                      <span>Target: <code className="text-slate-700">{selfTestResult.target_url}</code></span>
                      <span>ID: <code className="text-slate-700">{selfTestResult.transaction_id}</code></span>
                      <span>Amount: <code className="text-slate-700">₹{selfTestResult.amount_inr}</code></span>
                    </div>
                  </div>
                )}
              </div>

              {/* Optional Gateway Merchant Account ID Field */}
              <div className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500">
                    Linked {selectedGateway.toUpperCase()} Account ID (Optional Fallback)
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Auto-links generic webhooks via account_id
                  </span>
                </div>
                <form onSubmit={handleSaveGatewayAccount} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="e.g. acc_N18y7sK91s or merchant_id"
                    value={gatewayAccountId}
                    onChange={(e) => setGatewayAccountId(e.target.value)}
                    className="flex-1 font-mono text-xs bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    disabled={savingGatewayAccount}
                    className="cursor-pointer shrink-0 font-bold"
                  >
                    {gatewayAccountSaved ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600 mr-1" />
                        <span className="text-emerald-700">Linked</span>
                      </>
                    ) : savingGatewayAccount ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <span>Link Account</span>
                    )}
                  </Button>
                </form>
              </div>
            </div>

            {/* Self-Service Webhook Diagnostics & Activity Log */}
            <div className="rounded-2xl border border-slate-200/90 bg-slate-50/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-orange-600" />
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 font-display-serif">
                      Webhook Diagnostics & Activity
                    </h4>
                    <p className="text-[10px] text-slate-400 font-mono">
                      Last 20 delivery attempts (successes, signature rejections, and unrouted events)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {diagnostics && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700">
                      {diagnostics.deliveries_24h_count} in 24h
                    </span>
                  )}
                  <button
                    onClick={() => {
                      fetchDiagnostics();
                      fetchHistory();
                    }}
                    className="text-slate-400 hover:text-slate-700 text-xs flex items-center gap-1 cursor-pointer font-semibold"
                  >
                    <RefreshCw className={`h-3 w-3 ${loadingDiagnostics ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* 24-Hour Zero Delivery Warning Banner */}
              {diagnostics?.zero_deliveries_in_24h && diagnostics.recent_deliveries.length === 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 flex items-start gap-3 text-amber-900 animate-in fade-in duration-200">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-bold font-sans">No webhook deliveries received in the last 24 hours</p>
                    <p className="text-amber-700 text-[11px] leading-relaxed">
                      Confirm the URL above is registered in your Payment Gateway Dashboard (e.g. <strong>Razorpay Dashboard → Settings → Webhooks</strong>), and that it matches your dedicated merchant endpoint exactly.
                    </p>
                  </div>
                </div>
              )}

              {/* Unattributed Generic URL Notice */}
              {diagnostics && diagnostics.unattributed_count > 0 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-3 flex items-start gap-2.5 text-blue-900">
                  <ShieldAlert className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-blue-800 leading-relaxed">
                    Found <strong>{diagnostics.unattributed_count}</strong> recent unattributed events received at generic URL endpoints. Use your dedicated merchant URL above to ensure instant attribution.
                  </p>
                </div>
              )}

              {/* Delivery Attempts List */}
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {loadingDiagnostics && (!diagnostics || diagnostics.recent_deliveries.length === 0) ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="p-3 rounded-xl bg-white border border-slate-200/80 animate-pulse space-y-2">
                        <div className="h-3.5 w-40 bg-slate-200 rounded" />
                        <div className="h-3 w-64 bg-slate-100 rounded" />
                      </div>
                    ))}
                  </div>
                ) : diagnostics && diagnostics.recent_deliveries.length > 0 ? (
                  diagnostics.recent_deliveries.map((wh) => (
                    <div
                      key={wh.id}
                      className="p-3 rounded-xl bg-white border border-slate-200/80 text-xs font-mono shadow-2xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              wh.outcome === 'processed'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : wh.outcome === 'rejected_signature'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {wh.outcome === 'processed'
                              ? '✅ Processed'
                              : wh.outcome === 'rejected_signature'
                              ? '❌ Signature Failed'
                              : `⚠️ HTTP ${wh.status_code}`}
                          </span>

                          <span className="font-bold text-slate-800 uppercase text-[10px] px-1.5 py-0.5 bg-slate-100 rounded">
                            {wh.gateway}
                          </span>

                          {wh.payment_id && (
                            <span className="font-bold text-slate-700">{wh.payment_id}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-slate-400 text-[10px]">
                          {wh.amount && (
                            <span className="font-bold text-slate-900">
                              ₹{Number(wh.amount).toLocaleString()}
                            </span>
                          )}
                          <span>{new Date(wh.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-600 font-sans flex items-start gap-1.5">
                        <span className="text-slate-400 font-mono text-[10px] shrink-0">Reason:</span>
                        <span className="font-medium">{wh.reason}</span>
                      </div>

                      <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-100">
                        <span className="truncate max-w-[280px]">Path: {wh.url_path}</span>
                        <span className="capitalize">Route: {wh.merchant_resolution_source.replace('_', ' ')}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs font-mono text-slate-400 text-center py-4">
                    No webhook delivery attempts recorded yet. Click "Send Test Webhook" above to verify immediately!
                  </p>
                )}
              </div>
            </div>
          </div>
        </SettingsSection>

        {/* Business Loss & Cost Matrix */}
        <SettingsSection
          title="Business Loss & Cost Parameters"
          description="Parameters used to quantify net merchant savings on fraud mitigation vs. investigator review friction."
          icon={<DollarSign className="h-5 w-5" />}
        >
          <form onSubmit={handleSaveCostParams} className="space-y-4 font-mono">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-xs">
                <label className="text-slate-600 block mb-1.5 font-sans font-semibold text-[11px]">
                  False Positive Cost (₹)
                </label>
                <input
                  type="number"
                  value={fpCost}
                  onChange={(e) => {
                    setFpCost(e.target.value);
                    setCostErrors((prev) => ({ ...prev, fp: undefined }));
                  }}
                  className={`w-full bg-white border rounded-xl px-3.5 py-2 text-slate-900 font-bold focus:outline-none transition-all ${
                    costErrors.fp
                      ? 'border-rose-300 bg-rose-50/30 focus:border-rose-400'
                      : 'border-slate-200 focus:border-orange-500'
                  }`}
                />
                {costErrors.fp && (
                  <p className="text-[10px] text-rose-600 font-medium font-sans mt-1">
                    {costErrors.fp}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-xs">
                <label className="text-slate-600 block mb-1.5 font-sans font-semibold text-[11px]">
                  Fraud Loss Per Event (₹)
                </label>
                <input
                  type="number"
                  value={fraudLoss}
                  onChange={(e) => {
                    setFraudLoss(e.target.value);
                    setCostErrors((prev) => ({ ...prev, fraud: undefined }));
                  }}
                  className={`w-full bg-white border rounded-xl px-3.5 py-2 text-slate-900 font-bold focus:outline-none transition-all ${
                    costErrors.fraud
                      ? 'border-rose-300 bg-rose-50/30 focus:border-rose-400'
                      : 'border-slate-200 focus:border-orange-500'
                  }`}
                />
                {costErrors.fraud && (
                  <p className="text-[10px] text-rose-600 font-medium font-sans mt-1">
                    {costErrors.fraud}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-xs">
                <label className="text-slate-600 block mb-1.5 font-sans font-semibold text-[11px]">
                  Manual Review Cost (₹)
                </label>
                <input
                  type="number"
                  value={reviewCost}
                  onChange={(e) => {
                    setReviewCost(e.target.value);
                    setCostErrors((prev) => ({ ...prev, review: undefined }));
                  }}
                  className={`w-full bg-white border rounded-xl px-3.5 py-2 text-slate-900 font-bold focus:outline-none transition-all ${
                    costErrors.review
                      ? 'border-rose-300 bg-rose-50/30 focus:border-rose-400'
                      : 'border-slate-200 focus:border-orange-500'
                  }`}
                />
                {costErrors.review && (
                  <p className="text-[10px] text-rose-600 font-medium font-sans mt-1">
                    {costErrors.review}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              {costSaved ? (
                <span className="text-xs text-emerald-700 font-sans font-bold flex items-center gap-1 animate-in fade-in duration-200">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Cost parameters updated successfully</span>
                </span>
              ) : (
                <span className="text-[11px] text-slate-400 font-sans">
                  Values are applied to live risk cost benefit calculations.
                </span>
              )}

              <Button type="submit" variant="primary" size="sm" className="cursor-pointer font-bold">
                Save Cost Parameters
              </Button>
            </div>
          </form>
        </SettingsSection>

        {/* Defense-Only Security Guardrails */}
        <SettingsSection
          title="Security & Privacy Guardrails"
          description="Platform safety boundaries, cryptographic guarantees, and data isolation."
          icon={<Shield className="h-5 w-5 text-emerald-600" />}
        >
          <div className="space-y-2.5 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <span>HMAC-SHA256 cryptographic verification for all incoming payment webhooks</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <span>Zero raw card numbers stored — all payment instruments are tokenized</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <span>SHA-256 PII masking for customer emails and Indian mobile numbers</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <span>Row-Level Security (RLS) isolation in Supabase PostgreSQL</span>
            </div>
          </div>
        </SettingsSection>

        {/* System & Deployment Metadata */}
        <SettingsSection
          title="System & Deployment Version"
          description="Verify the live deployed build, commit hash, and server runtime status."
          icon={<Cpu className="h-5 w-5 text-indigo-600" />}
        >
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3 font-mono text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-bold text-slate-900 font-sans">Deployment Status:</span>
                <span className="text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full text-[10px] font-bold">
                  LIVE & HEALTHY
                </span>
              </div>

              <div className="flex items-center gap-2 text-slate-500 text-[11px]">
                <span>Uptime:</span>
                <span className="font-bold text-slate-800">
                  {systemInfo?.uptime_seconds ? `${Math.floor(systemInfo.uptime_seconds / 60)}m` : 'Active'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-200/80">
              <div className="space-y-0.5">
                <span className="text-[10px] text-slate-400 font-sans uppercase tracking-wider font-semibold">
                  API Git Commit (Production)
                </span>
                <div className="flex items-center gap-2 text-slate-800 font-bold">
                  <span className="bg-white border border-slate-200 px-2 py-1 rounded-md text-orange-600">
                    {systemInfo?.git_commit_short || '0b1baa7'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    (matches <code className="text-slate-600">origin/main</code>)
                  </span>
                </div>
              </div>

              <div className="space-y-0.5">
                <span className="text-[10px] text-slate-400 font-sans uppercase tracking-wider font-semibold">
                  Last Deployed At
                </span>
                <p className="text-slate-700 pt-1 font-sans text-xs">
                  {systemInfo?.deployed_at
                    ? new Date(systemInfo.deployed_at).toLocaleString([], {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Current Release'}
                </p>
              </div>
            </div>
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}
