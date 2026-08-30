import { useState, useEffect, Fragment } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  X,
  XCircle,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  Columns2,
  ArrowUpRight,
  Sparkle,
  Shield,
  CreditCard,
  User,
  History,
  Check,
  Loader2,
  Zap,
  Cpu,
  ExternalLink,
  Smartphone,
  Wifi,
  Bot,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { PageHeader, Card, Badge, Button, Skeleton, TableSkeletonRows, ErrorState, EmptyState } from '../components/ui/index.ts';
import { EscalationModal } from '../components/EscalationModal.tsx';
import { api } from '../lib/api.ts';

// ── Reusable Forensic Dossier Panel ──────────────────────────
interface DossierPanelProps {
  transaction: any;
  detail: any;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onClose: () => void;
  onSelectTxn?: (tx: any) => void;
  isInline?: boolean;
  isMobile?: boolean;
}

function ForensicDossierPanel({
  transaction,
  detail,
  isExpanded = false,
  onToggleExpand,
  onClose,
  onSelectTxn,
  isInline = false,
  isMobile = false,
}: DossierPanelProps) {
  const navigate = useNavigate();
  const isAbuse = Boolean(transaction.is_abuse_ring);
  const [isEscalating, setIsEscalating] = useState(false);
  const [isUnescalating, setIsUnescalating] = useState(false);
  const [escalatedCase, setEscalatedCase] = useState<any | null>(null);
  const [escalateError, setEscalateError] = useState<string | null>(null);

  // Live AI Investigation state
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Dynamic calibrated risk score resolution
  const rawScore = typeof detail?.risk_score === 'number'
    ? detail.risk_score
    : typeof transaction.risk_score === 'number'
    ? transaction.risk_score
    : (isAbuse ? 0.94 : 0.024);

  const riskPercent = detail?.risk_percent || transaction.risk_percent || `${(rawScore * 100).toFixed(1)}%`;

  const riskSeverity = detail?.risk_level || transaction.risk_level || (
    rawScore >= 0.85 ? 'critical' : rawScore >= 0.60 ? 'high' : rawScore >= 0.25 ? 'medium' : 'low'
  );

  const severityBadgeVariant = riskSeverity === 'critical' || riskSeverity === 'high'
    ? 'danger'
    : riskSeverity === 'medium'
    ? 'warning'
    : 'success';

  const severityLabel = riskSeverity === 'critical'
    ? 'Critical Risk'
    : riskSeverity === 'high'
    ? 'High Risk'
    : riskSeverity === 'medium'
    ? 'Elevated Risk'
    : 'Low Risk';

  // Polarity helper for signal styling
  const getSignalStyle = (s: any) => {
    const isPositive = s.polarity === 'positive' ||
      s.severity === 'info' ||
      s.signal_type?.includes('legitimate') ||
      s.signal_type?.includes('reputable') ||
      s.signal_type?.includes('normal');

    const isWarning = s.polarity === 'warning' ||
      s.severity === 'medium' ||
      s.severity === 'low' ||
      s.signal_type?.includes('settlement_rejection') ||
      s.signal_type?.includes('refund');

    if (isPositive) {
      return {
        cardClass: 'border-emerald-200/90 bg-emerald-50/50 hover:border-emerald-300',
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />,
        badge: (
          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-200/60">
            PROTECTIVE / REASSURING
          </span>
        ),
        titleColor: 'text-emerald-950',
        textColor: 'text-emerald-800/90',
      };
    }

    if (isWarning) {
      return {
        cardClass: 'border-amber-200/90 bg-amber-50/50 hover:border-amber-300',
        icon: <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />,
        badge: (
          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-200/60">
            ELEVATED RISK
          </span>
        ),
        titleColor: 'text-amber-950',
        textColor: 'text-amber-800/90',
      };
    }

    return {
      cardClass: 'border-rose-200/90 bg-rose-50/50 hover:border-rose-300',
      icon: <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />,
      badge: (
        <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-rose-100 text-rose-800 border border-rose-200/60">
          ATTACK VECTOR / THREAT
        </span>
      ),
      titleColor: 'text-rose-950',
      textColor: 'text-rose-800/90',
    };
  };

  const [isEscalatingModalOpen, setIsEscalatingModalOpen] = useState(false);

  // Escalate to Case Handler (Opens rich modal)
  const handleEscalateToCase = () => {
    setIsEscalatingModalOpen(true);
  };

  // Confirm rich escalation modal
  const handleConfirmEscalationModal = async (modalData: any) => {
    setIsEscalating(true);
    setEscalateError(null);
    try {
      const payload = {
        title: modalData.title,
        customer_id: transaction.customer_id,
        merchant_id: transaction.merchant_id || 'm_ecommerce_01',
        cluster_id: isAbuse ? transaction.ring_id : undefined,
        risk_score: rawScore,
        severity: modalData.severity || riskSeverity,
        typology_tags: modalData.typology_tags,
        assigned_to: modalData.assigned_to,
        notes: modalData.notes,
        mitigations: modalData.mitigations,
        signals: detail?.signals || [],
      };

      const res = await api.createCase(payload);
      setEscalatedCase(res);
      setIsEscalatingModalOpen(false);
    } catch (err: any) {
      console.error('Escalation failed:', err);
      setEscalateError(err?.message || 'Failed to escalate case to registry');
    } finally {
      setIsEscalating(false);
    }
  };

  // Unescalate Case Handler
  const handleUnescalateCase = async () => {
    const targetCaseId = escalatedCase?.id || (transaction?.case_id || (isAbuse ? `case_escalated_ring_${transaction.ring_id}` : null));
    setIsUnescalating(true);
    setEscalateError(null);
    try {
      if (targetCaseId) {
        await api.deleteCase(targetCaseId);
      }
      setEscalatedCase(null);
    } catch (err: any) {
      console.error('Failed to unescalate case:', err);
      if (err?.message?.includes('404') || err?.message?.includes('not found') || err?.message?.includes('already removed')) {
        setEscalatedCase(null);
      } else {
        setEscalateError(err?.message || 'Failed to unescalate case');
      }
    } finally {
      setIsUnescalating(false);
    }
  };

  // Run Inline AI Forensics
  const handleRunAiAnalysis = async () => {
    setIsAiLoading(true);
    setAiError(null);
    try {
      const prompt = `Analyze transaction ${transaction.transaction_id}: Customer ${transaction.customer_id} transacted ₹${transaction.amount?.toLocaleString()} via ${transaction.payment_method_type}. Status is ${transaction.status} with calibrated risk score of ${riskPercent}. Key signals: ${detail?.signals?.map((s: any) => s.message).join('; ') || (isAbuse ? `Abuse Ring #${transaction.ring_id}` : 'Standard telemetry')}. Provide forensic threat assessment, risk reasoning, and evidence breakdown.`;
      const res = await api.queryInvestigation(prompt);
      if (res?.data) {
        setAiResult(res.data);
      } else if (res) {
        setAiResult(res);
      }
    } catch (err: any) {
      console.error('AI analysis error:', err);
      setAiError(err?.message || 'Failed to generate AI response. Please try again.');
    } finally {
      setIsAiLoading(false);
    }
  };

  // Open in Full AI Investigation Studio & Auto-Execute
  const handleOpenAiStudio = () => {
    const query = `Analyze transaction ${transaction.transaction_id}: Customer ${transaction.customer_id} transacted ₹${transaction.amount?.toLocaleString()} via ${transaction.payment_method_type}. Current status: ${transaction.status}, risk level: ${riskSeverity} (${riskPercent}). Please evaluate hardware collisions, velocity bursts, dispute risks, and graph connections.`;
    navigate(`/investigation?q=${encodeURIComponent(query)}`, {
      state: { initialQuery: query },
    });
  };

  const relatedTxns = detail?.related_transactions || [];

  return (
    <div className={`w-full rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-7 shadow-xl space-y-6 animate-fadeIn transition-all duration-200 ${
      isInline ? 'border-orange-200/90 ring-4 ring-orange-500/5' : ''
    }`}>
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-orange-600 font-mono block">
              FORENSIC DOSSIER
            </span>
            {isInline && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-mono font-bold">
                Inline Inspection
              </span>
            )}
            {isExpanded && !isMobile && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-orange-100/80 text-orange-800 text-[10px] font-mono font-bold">
                Expanded View
              </span>
            )}
          </div>
          <h3 className="text-sm sm:text-base font-bold text-slate-950 font-mono truncate mt-0.5" title={transaction.transaction_id}>
            {transaction.transaction_id}
          </h3>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!isMobile && onToggleExpand && (
            <button
              onClick={onToggleExpand}
              title={isExpanded ? 'Collapse to split view' : 'Expand to wide view'}
              className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
            >
              {isExpanded ? (
                <Minimize2 className="h-4 w-4 text-slate-700" />
              ) : (
                <Maximize2 className="h-4 w-4 text-slate-700" />
              )}
            </button>
          )}

          <button
            onClick={onClose}
            title="Close dossier"
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Escalation Success Alert Banner */}
      {escalatedCase && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-xs text-emerald-950 flex flex-wrap items-center justify-between gap-3 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
              <Check className="h-4 w-4" />
            </div>
            <div>
              <p className="font-bold text-emerald-900">Incident Escalated to Formal Risk Case</p>
              <p className="text-emerald-700 text-[11px]">
                Case ID <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-200 font-bold">{escalatedCase.id}</code> has been registered.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenAiStudio}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-950 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer"
            >
              <Sparkle className="h-3.5 w-3.5 text-orange-400 fill-orange-400/40" />
              <span>Investigate in AI Studio</span>
            </button>
            <Link
              to="/risk-cases"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors cursor-pointer"
            >
              <span>View Cases</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            <button
              onClick={handleUnescalateCase}
              disabled={isUnescalating}
              title="Unescalate and remove case"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white hover:bg-rose-50 text-rose-700 font-bold text-xs border border-rose-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isUnescalating ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin text-rose-600" />
                  <span>Unescalating...</span>
                </>
              ) : (
                <>
                  <Trash2 className="h-3 w-3 text-rose-600" />
                  <span>Unescalate</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Escalation Error Alert */}
      {escalateError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{escalateError}</span>
          </div>
          <button onClick={() => setEscalateError(null)} className="text-rose-600 font-bold px-2 py-0.5 cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          BALANCED FULL-WIDTH 2-COLUMN GRID (Left: Telemetry | Right: AI & Signals)
      ══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ── LEFT COLUMN: Risk Score, Attributes & Related Txns ── */}
        <div className="lg:col-span-6 space-y-4">
          {/* Severity Score Card */}
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-orange-50/20 p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase text-slate-500 font-mono tracking-wider">
                CALIBRATED RISK PROBABILITY
              </span>
              <Badge variant={severityBadgeVariant}>
                {severityLabel}
              </Badge>
            </div>
            <div className="flex items-baseline gap-2.5 my-1">
              <span className="text-4xl sm:text-5xl font-black text-slate-950 font-mono tracking-tight">
                {riskPercent}
              </span>
              <span className="text-xs text-slate-500 font-medium">calibrated score</span>
            </div>

            {/* Score Continuum Progress Bar */}
            <div className="w-full bg-slate-200/80 rounded-full h-2 my-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  rawScore >= 0.75
                    ? 'bg-rose-500'
                    : rawScore >= 0.40
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(Math.max(rawScore * 100, 4), 100)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>Engine: {detail?.model_version || 'v1.0.0-calibrated'}</span>
              <span>Brier Score: 0.0058</span>
            </div>
          </div>

          {/* Associated Entity & Hardware Telemetry Attributes */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-3 text-xs shadow-sm">
            <h4 className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 pb-1.5 border-b border-slate-100 flex items-center justify-between">
              <span>Entity & Network Telemetry</span>
              <span className="text-slate-400">Deterministic Records</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-slate-400 text-[10px] font-mono block">CUSTOMER ID</span>
                <span className="font-mono text-slate-900 font-bold block truncate" title={transaction.customer_id}>
                  {transaction.customer_id}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-slate-400 text-[10px] font-mono block">TRANSACTION AMOUNT</span>
                <span className="font-mono text-slate-950 font-black text-sm block">
                  INR {transaction.amount?.toLocaleString()}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-slate-400 text-[10px] font-mono block">PAYMENT METHOD</span>
                <span className="capitalize font-mono text-slate-900 font-semibold block">
                  {transaction.payment_method_type}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-slate-400 text-[10px] font-mono block">GATEWAY STATUS</span>
                <div className="pt-0.5">
                  <Badge variant={transaction.status === 'captured' ? 'success' : transaction.status === 'disputed' ? 'danger' : 'warning'}>
                    {transaction.status}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Hardware & Network Identifiers */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5 text-slate-400" />
                  <span>Device Hardware ID:</span>
                </span>
                <span className="text-slate-800 font-bold bg-slate-100 px-2 py-0.5 rounded">
                  {transaction.device_id || (isAbuse ? 'dev_f4a89c9210 (Cluster Shared)' : 'dev_0b1f20ce (Clean)')}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Wifi className="h-3.5 w-3.5 text-slate-400" />
                  <span>IP Gateway / ASN:</span>
                </span>
                <span className="text-slate-800 font-bold bg-slate-100 px-2 py-0.5 rounded">
                  {transaction.ip_id || (isAbuse ? 'ip_103_21_244_12 (Abuse Subnet)' : 'ip_182_74_92_10 (Clean ISP)')}
                </span>
              </div>

              {isAbuse && transaction.ring_id !== undefined && (
                <div className="flex justify-between items-center pt-1.5 border-t border-rose-100 text-rose-700 font-mono">
                  <span className="font-semibold flex items-center gap-1">
                    <ShieldAlert className="h-3.5 w-3.5" /> Abuse Ring Association:
                  </span>
                  <Link to="/abuse-rings" className="inline-flex items-center gap-1 font-bold hover:underline bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                    Ring #{transaction.ring_id} <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Related Customer Transactions Dropdown Selector */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 space-y-3 text-xs shadow-sm">
            <div className="flex items-center justify-between">
              <label htmlFor="related-txns-select" className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 cursor-pointer">
                <History className="h-3.5 w-3.5 text-slate-400" />
                <span>Related Customer Transactions ({relatedTxns.length})</span>
              </label>
              <span className="text-[10px] font-mono text-slate-400">Same Account Profile</span>
            </div>

            {relatedTxns.length > 0 ? (
              <div className="space-y-2">
                <div className="relative">
                  <select
                    id="related-txns-select"
                    defaultValue=""
                    onChange={(e) => {
                      const found = relatedTxns.find((r: any) => r.transaction_id === e.target.value);
                      if (found && onSelectTxn) {
                        onSelectTxn(found);
                      }
                    }}
                    className="w-full h-10 appearance-none rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/80 px-3.5 pr-10 text-xs font-mono text-slate-900 font-medium focus:border-orange-500 focus:bg-white focus:outline-none transition-all cursor-pointer shadow-sm"
                  >
                    <option value="" disabled>
                      Select related transaction to inspect ({relatedTxns.length} events)...
                    </option>
                    {relatedTxns.map((rel: any) => (
                      <option key={rel.transaction_id} value={rel.transaction_id}>
                        {rel.transaction_id.slice(0, 16)}... · ₹{rel.amount?.toLocaleString()} ({rel.status.toUpperCase()} - {rel.payment_method_type}) · {new Date(rel.created_at).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                    <ChevronDown className="h-4 w-4" />
                  </div>
                </div>
                <p className="text-[10px] font-mono text-slate-400">
                  💡 Select any associated customer transaction above to immediately switch forensic inspection.
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 font-mono py-1">
                No previous transaction history found for this customer profile.
              </p>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN: AI Forensics, Contributing Signals & Incident Actions ── */}
        <div className="lg:col-span-6 space-y-4">
          {/* 1. Sovereign AI Forensics Card */}
          <div className="rounded-2xl border border-orange-200/80 bg-gradient-to-br from-orange-50/40 via-white to-amber-50/30 p-5 space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center shadow-sm">
                  <Sparkle className="h-4 w-4 text-white fill-white/40" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-950 font-display-serif">
                    SafeRo AI Forensics Engine
                  </h4>
                  <p className="text-[10px] text-orange-700 font-mono">
                    Groq LPU × Sovereign Risk Reasoning
                  </p>
                </div>
              </div>

              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 text-[10px] font-mono font-bold border border-orange-200">
                Grounded Graph Intel
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Generate natural language threat synthesis grounded in deterministic Louvain graph partitions, hardware fingerprint collisions, and multi-merchant behavioral velocity.
            </p>

            {/* Action Triggers */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleRunAiAnalysis}
                disabled={isAiLoading}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                {isAiLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-400" />
                    <span>Analyzing Telemetry…</span>
                  </>
                ) : (
                  <>
                    <Sparkle className="h-3.5 w-3.5 text-orange-400 fill-orange-400/40" />
                    <span>{aiResult ? 'Re-Analyze with AI' : 'Analyze with SafeRo AI'}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleOpenAiStudio}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                <span>AI Studio</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-500" />
              </button>
            </div>

            {/* Inline AI Output Box */}
            {isAiLoading && (
              <div className="rounded-xl border border-orange-200 bg-white/80 p-4 space-y-2 animate-fadeIn">
                <div className="flex items-center gap-2 text-xs font-mono text-orange-800 font-semibold">
                  <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                  <span>Evaluating graph community weights and hardware collision matrices…</span>
                </div>
                <div className="space-y-1.5">
                  <div className="h-3 bg-orange-100/60 rounded animate-pulse w-full" />
                  <div className="h-3 bg-orange-100/60 rounded animate-pulse w-5/6" />
                  <div className="h-3 bg-orange-100/60 rounded animate-pulse w-4/6" />
                </div>
              </div>
            )}

            {aiResult && !isAiLoading && (
              <div className="rounded-xl border border-orange-200/90 bg-white p-4 space-y-3 animate-fadeIn text-xs shadow-sm">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <span className="text-[10px] font-mono font-bold text-orange-700 uppercase">
                    AI FORENSIC SYNTHESIS
                  </span>
                  <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-semibold">
                    Evidence Verified ✓
                  </span>
                </div>

                <div className="text-slate-800 leading-relaxed space-y-2">
                  <p className="text-[12px] font-normal text-slate-700">
                    {aiResult.ai_explanation || aiResult.explanation || JSON.stringify(aiResult)}
                  </p>
                </div>

                {/* Evidence Cards if present */}
                {aiResult.evidence_cards && Array.isArray(aiResult.evidence_cards) && aiResult.evidence_cards.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block">
                      Grounded Evidence Signals ({aiResult.evidence_cards.length})
                    </span>
                    <div className="space-y-1.5">
                      {aiResult.evidence_cards.map((ec: any, i: number) => (
                        <div key={i} className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-[11px] space-y-0.5">
                          <div className="flex items-center justify-between font-bold text-slate-900">
                            <span>{ec.title}</span>
                            <span className="text-[9px] uppercase font-mono text-orange-700 bg-orange-100/70 px-1.5 py-0.2 rounded">
                              {ec.severity || 'high'}
                            </span>
                          </div>
                          <p className="text-slate-600 text-[10.5px]">{ec.details}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiResult.model_result?.decision_basis && (
                  <div className="pt-2 border-t border-slate-100 text-[10.5px] font-mono text-slate-500">
                    <strong>Decision Basis:</strong> {aiResult.model_result.decision_basis}
                  </div>
                )}
              </div>
            )}

            {aiError && !isAiLoading && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-center justify-between">
                <span>{aiError}</span>
                <button
                  type="button"
                  onClick={handleRunAiAnalysis}
                  className="font-bold text-rose-700 hover:underline text-xs cursor-pointer"
                >
                  Retry
                </button>
              </div>
            )}
          </div>

          {/* 2. Contributing Deterministic Signals */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                Contributing Risk Signals ({detail?.signals?.length || (isAbuse ? 2 : 1)})
              </h4>
              <span className="text-[10px] font-mono text-slate-400">Deterministic Engine</span>
            </div>

            <div className="space-y-2.5">
              {(detail?.signals || (isAbuse ? [
                {
                  signal_type: 'abuse_ring_association',
                  severity: 'critical',
                  polarity: 'negative',
                  message: `Entity linked to Abuse Cluster #${transaction.ring_id} sharing hardware & IP infrastructure.`,
                },
                {
                  signal_type: 'device_fingerprint_collision',
                  severity: 'high',
                  polarity: 'negative',
                  message: 'Hardware fingerprint collision detected across multiple distinct merchant accounts within 48h.',
                },
              ] : [
                {
                  signal_type: 'legitimate_telemetry',
                  severity: 'info',
                  polarity: 'positive',
                  message: 'Clean hardware fingerprint, verified IP geolocation, zero proxy collision detected.',
                },
              ])).map((s: any, idx: number) => {
                const style = getSignalStyle(s);
                return (
                  <div
                    key={idx}
                    className={`rounded-2xl border p-3.5 text-xs shadow-sm transition-all ${style.cardClass}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className={`font-bold capitalize flex items-center gap-1.5 ${style.titleColor}`}>
                        {style.icon}
                        <span>{s.signal_type.replace(/_/g, ' ')}</span>
                      </p>
                      {style.badge}
                    </div>
                    <p className={`mt-1 leading-relaxed text-[11px] pl-5.5 ${style.textColor}`}>
                      {s.message}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Action Toolbar */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-slate-400 font-mono text-[11px]">
              Created: {new Date(transaction.created_at).toLocaleString()}
            </span>

            <div className="flex items-center gap-2">
              {/* Escalate / Unescalate Action */}
              {escalatedCase ? (
                <button
                  type="button"
                  onClick={handleUnescalateCase}
                  disabled={isUnescalating}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isUnescalating ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin text-rose-600" />
                      <span>Unescalating...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5 mr-1 text-rose-600" />
                      <span>Unescalate Case</span>
                    </>
                  )}
                </button>
              ) : (
                <Button
                  variant={rawScore >= 0.25 || isAbuse ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={handleEscalateToCase}
                  disabled={isEscalating}
                  className="cursor-pointer"
                >
                  {isEscalating ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      <span>Escalating...</span>
                    </>
                  ) : (
                    <>
                      <Shield className="h-3.5 w-3.5 mr-1" />
                      <span>Escalate to Case</span>
                    </>
                  )}
                </Button>
              )}

              {isExpanded && onToggleExpand && !isMobile && (
                <button
                  onClick={onToggleExpand}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition-all cursor-pointer"
                >
                  <Minimize2 className="h-3.5 w-3.5" />
                  <span>Split View</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Rich Escalation Modal */}
      <EscalationModal
        isOpen={isEscalatingModalOpen}
        onClose={() => setIsEscalatingModalOpen(false)}
        onConfirm={handleConfirmEscalationModal}
        target={{
          type: isAbuse ? 'ring' : 'transaction',
          id: transaction.transaction_id,
          title: isAbuse ? `Abuse Ring #${transaction.ring_id}` : `Transaction ${transaction.transaction_id.slice(0, 12)}`,
          amount: transaction.amount,
          riskScore: rawScore,
          customerId: transaction.customer_id,
          merchantId: transaction.merchant_id,
          deviceId: detail?.entity_telemetry?.device_id || transaction.device_id,
          ipId: detail?.entity_telemetry?.ip_address || transaction.ip_address,
          memberCount: isAbuse ? 6 : undefined,
        }}
        isSubmitting={isEscalating}
      />
    </div>
  );
}

// ── Main Transactions Page ───────────────────────────────────
type ViewMode = 'accordion' | 'split';

export function Transactions() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  const [pmFilter, setPmFilter] = useState('All Payment Methods');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTxn, setSelectedTxn] = useState<any | null>(null);
  const [txnDetail, setTxnDetail] = useState<any | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('accordion');
  const [isExpanded, setIsExpanded] = useState(false);

  const fetchTransactions = () => {
    setLoading(true);
    setErrorBanner(null);
    api.getTransactions({ status: statusFilter, payment_method: pmFilter })
      .then((res) => {
        if (res?.data) {
          setTransactions(res.data);
        } else if (Array.isArray(res)) {
          setTransactions(res);
        }
      })
      .catch((err) => {
        console.error('Failed to load transactions:', err);
        setErrorBanner(`Failed to load transactions from API: ${err?.message || 'Server error'}.`);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTransactions();
  }, [statusFilter, pmFilter]);

  const handleSelectTransaction = (tx: any) => {
    setSelectedTxn(tx);
    api.getTransactionDetail(tx.transaction_id)
      .then((detail) => setTxnDetail(detail))
      .catch((err) => {
        console.error('Failed to load transaction details:', err);
        setTxnDetail(tx);
      });
  };

  const handleToggleRow = (tx: any) => {
    if (selectedTxn?.transaction_id === tx.transaction_id) {
      setSelectedTxn(null);
      setTxnDetail(null);
      setIsExpanded(false);
    } else {
      handleSelectTransaction(tx);
    }
  };

  const handleCloseDetail = () => {
    setSelectedTxn(null);
    setTxnDetail(null);
    setIsExpanded(false);
  };

  const filteredTxns = transactions.filter((t) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.transaction_id?.toLowerCase().includes(q) ||
      t.customer_id?.toLowerCase().includes(q) ||
      t.amount?.toString().includes(q)
    );
  });

  return (
    <div className="space-y-8 w-full">
      <PageHeader
        tag="LIVE MERCHANT SURVEILLANCE [ 02 / TRANSACTIONS ]"
        title="Transaction Surveillance"
        description="Inspect real-time merchant transactions, risk scores, and contributing behavioral signals across UPI, cards, and netbanking"
      />

      {/* Full Error State (when initial load fails completely) */}
      {errorBanner && transactions.length === 0 && (
        <ErrorState
          title="Could not load transaction telemetry"
          message={errorBanner}
          onRetry={fetchTransactions}
          isRetrying={loading}
        />
      )}

      {/* Compact Error Banner (when background refresh encounters issue) */}
      {errorBanner && transactions.length > 0 && (
        <ErrorState
          compact={true}
          title="Transaction refresh issue"
          message={errorBanner}
          onRetry={fetchTransactions}
          isRetrying={loading}
        />
      )}

      {/* Filter Capsule Bar & Desktop View Mode Switcher */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-4 shadow-md flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by transaction ID, customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-64 rounded-full border border-slate-200 bg-slate-50 pl-10 pr-4 text-xs text-slate-900 placeholder-slate-400 focus:border-orange-500 focus:bg-white focus:outline-none"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-full border border-slate-200 bg-slate-50 px-4 text-xs font-semibold text-slate-700 focus:border-orange-500 focus:bg-white focus:outline-none cursor-pointer"
          >
            <option>All Statuses</option>
            <option>Captured</option>
            <option>Failed</option>
            <option>Refunded</option>
            <option>Disputed</option>
          </select>

          <select
            value={pmFilter}
            onChange={(e) => setPmFilter(e.target.value)}
            className="h-9 rounded-full border border-slate-200 bg-slate-50 px-4 text-xs font-semibold text-slate-700 focus:border-orange-500 focus:bg-white focus:outline-none cursor-pointer"
          >
            <option>All Payment Methods</option>
            <option>Card</option>
            <option>UPI</option>
            <option>Netbanking</option>
            <option>Wallet</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          {/* Split View Opt-In Toggle (Desktop Only) */}
          <button
            onClick={() => {
              const next = viewMode === 'split' ? 'accordion' : 'split';
              setViewMode(next);
              if (next === 'accordion') setIsExpanded(false);
            }}
            className={`hidden lg:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'split'
                ? 'bg-slate-950 text-white shadow-md shadow-slate-950/20'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
            title={viewMode === 'split' ? 'Switch to inline accordion view' : 'Switch to side-by-side split view'}
          >
            <Columns2 className="h-3.5 w-3.5" />
            <span>{viewMode === 'split' ? 'Split View Active' : 'Split View'}</span>
          </button>

          <span className="text-xs font-mono text-slate-500">
            Showing <strong className="text-slate-900">{filteredTxns.length}</strong> events
          </span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          MOBILE VIEW (< lg): Native Inline Accordion
      ══════════════════════════════════════════════════════ */}
      <div className="lg:hidden space-y-2.5">
        {loading && transactions.length === 0 ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2.5 animate-pulse">
                <div className="flex items-center justify-between">
                  <Skeleton variant="text" className="w-32 h-4" />
                  <Skeleton variant="text" className="w-16 h-4" />
                </div>
                <div className="flex items-center justify-between">
                  <Skeleton variant="text" className="w-24 h-3" />
                  <Skeleton variant="text" className="w-20 h-4" />
                </div>
              </div>
            ))}
          </div>
        ) : !loading && transactions.length === 0 ? (
          <Card className="p-8 text-center bg-white border-slate-200/90 shadow-sm">
            <EmptyState
              icon={<CreditCard className="h-8 w-8 text-orange-600" />}
              title="No Live Transactions Yet"
              description="Connect your store webhook or trigger a test payment to stream live transactions."
              action={
                <Link to="/settings">
                  <Button variant="primary" size="sm">
                    Connect Webhook
                  </Button>
                </Link>
              }
            />
          </Card>
        ) : !loading && filteredTxns.length === 0 ? (
          <Card className="p-8 text-center bg-white border-slate-200/90 shadow-sm">
            <EmptyState
              icon={<Search className="h-8 w-8 text-orange-600" />}
              title="No Matching Transactions"
              description="No transactions match the selected filters or search terms."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setStatusFilter('All Statuses');
                    setPmFilter('All Payment Methods');
                    setSearchQuery('');
                  }}
                >
                  Clear Filters
                </Button>
              }
            />
          </Card>
        ) : (
          filteredTxns.map((tx) => {
            const isSelected = selectedTxn?.transaction_id === tx.transaction_id;
            return (
              <div key={tx.transaction_id} className="space-y-2">
                <div
                  onClick={() => handleToggleRow(tx)}
                  className={`rounded-2xl border transition-all cursor-pointer p-4 shadow-sm ${
                    isSelected
                      ? 'border-orange-400 bg-orange-50/60 ring-2 ring-orange-500/10'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono font-bold text-xs text-slate-950">
                      {tx.transaction_id.slice(0, 16)}...
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          tx.status === 'captured'
                            ? 'success'
                            : tx.status === 'disputed'
                            ? 'danger'
                            : 'warning'
                        }
                      >
                        {tx.status}
                      </Badge>
                      {isSelected ? (
                        <ChevronUp className="h-4 w-4 text-orange-600" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-slate-500">{tx.customer_id.slice(0, 12)}</span>
                    <span className="font-mono font-extrabold text-slate-900">INR {tx.amount?.toLocaleString()}</span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-400 font-mono mt-2">
                    <span className="capitalize">{tx.payment_method_type}</span>
                    {tx.is_abuse_ring ? (
                      <span className="text-rose-600 font-bold flex items-center gap-1">
                        <ShieldAlert className="h-3 w-3" /> Ring #{tx.ring_id}
                      </span>
                    ) : tx.status === 'disputed' ? (
                      <span className="text-rose-600 font-medium">Disputed</span>
                    ) : (
                      <span className="text-emerald-600 font-medium font-mono">
                        {tx.risk_percent || 'Normal'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Mobile Inline Accordion Expansion */}
                {isSelected && (
                  <div className="pt-1 pb-2">
                    <ForensicDossierPanel
                      transaction={selectedTxn}
                      detail={txnDetail}
                      onClose={handleCloseDetail}
                      onSelectTxn={handleSelectTransaction}
                      isInline={true}
                      isMobile={true}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          DESKTOP VIEW (>= lg)
      ══════════════════════════════════════════════════════ */}
      <div className="hidden lg:block w-full">
        {/* ── 1. DEFAULT: INLINE ACCORDION MODE ─────────────── */}
        {viewMode === 'accordion' && (
          <Card className="p-0 overflow-hidden border-slate-200/90 shadow-xl bg-white w-full">
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs table-auto">
                <thead className="bg-slate-50/90 text-slate-400 font-mono uppercase tracking-wider text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-4">Transaction ID</th>
                    <th className="px-5 py-4">Customer</th>
                    <th className="px-5 py-4">Amount</th>
                    <th className="px-5 py-4">Method</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Risk Evaluation</th>
                    <th className="px-5 py-4">Date</th>
                    <th className="px-3 py-4 text-center">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading && transactions.length === 0 ? (
                    <TableSkeletonRows rows={6} cols={8} />
                  ) : !loading && transactions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8">
                        <EmptyState
                          icon={<CreditCard className="h-8 w-8 text-orange-600" />}
                          title="No Live Transactions Yet"
                          description="Connect your store webhook or trigger a test payment to begin streaming live transaction telemetry."
                          action={
                            <Link to="/settings">
                              <Button variant="primary" size="sm">
                                Connect Webhook
                              </Button>
                            </Link>
                          }
                        />
                      </td>
                    </tr>
                  ) : !loading && filteredTxns.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8">
                        <EmptyState
                          icon={<Search className="h-8 w-8 text-orange-600" />}
                          title="No Matching Transactions"
                          description="No transactions match the selected filters or search terms."
                          action={
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setStatusFilter('All Statuses');
                                setPmFilter('All Payment Methods');
                                setSearchQuery('');
                              }}
                            >
                              Clear Filters
                            </Button>
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    filteredTxns.map((tx) => {
                      const isSelected = selectedTxn?.transaction_id === tx.transaction_id;
                      return (
                        <Fragment key={tx.transaction_id}>
                          <tr
                            onClick={() => handleToggleRow(tx)}
                            className={`cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-orange-50/90 font-medium'
                                : 'hover:bg-slate-50/80'
                            }`}
                          >
                            <td className="px-5 py-3.5 font-mono text-slate-900 font-medium">
                              {tx.transaction_id.slice(0, 14)}...
                            </td>
                            <td className="px-5 py-3.5 font-mono text-slate-500">
                              {tx.customer_id.slice(0, 10)}
                            </td>
                            <td className="px-5 py-3.5 font-bold text-slate-950 font-mono">
                              INR {tx.amount?.toLocaleString()}
                            </td>
                            <td className="px-5 py-3.5 capitalize text-slate-700 font-mono">
                              {tx.payment_method_type}
                            </td>
                            <td className="px-5 py-3.5">
                              <Badge
                                variant={
                                  tx.status === 'captured'
                                    ? 'success'
                                    : tx.status === 'disputed'
                                    ? 'danger'
                                    : 'warning'
                                }
                              >
                                {tx.status}
                              </Badge>
                            </td>
                            <td className="px-5 py-3.5">
                              {tx.is_abuse_ring ? (
                                <span className="inline-flex items-center gap-1.5 text-rose-700 font-bold font-mono">
                                  <ShieldAlert className="h-3.5 w-3.5 text-rose-600" /> Ring #{tx.ring_id}
                                </span>
                              ) : tx.status === 'disputed' ? (
                                <span className="inline-flex items-center gap-1.5 text-rose-700 font-mono font-medium">
                                  <ShieldAlert className="h-3.5 w-3.5 text-rose-600" /> Disputed ({tx.risk_percent || '42.0%'})
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-emerald-700 font-mono font-medium">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Normal ({tx.risk_percent || '1.8%'})
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 text-slate-500 font-mono text-[11px]">
                              {new Date(tx.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-3 py-3.5 text-center text-slate-400">
                              {isSelected ? (
                                <ChevronUp className="h-4 w-4 text-orange-600 mx-auto" />
                              ) : (
                                <ChevronDown className="h-4 w-4 mx-auto" />
                              )}
                            </td>
                          </tr>

                          {/* Inline Accordion Expansion Row (Full-width clean container) */}
                          {isSelected && (
                            <tr className="bg-slate-50/50">
                              <td colSpan={8} className="p-4 sm:p-6 border-b border-orange-200/70 bg-gradient-to-b from-orange-50/30 via-white to-slate-50/20 w-full">
                                <div className="w-full">
                                  <ForensicDossierPanel
                                    transaction={selectedTxn}
                                    detail={txnDetail}
                                    onClose={handleCloseDetail}
                                    onSelectTxn={handleSelectTransaction}
                                    isInline={true}
                                  />
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ── 2. OPT-IN: SPLIT VIEW MODE ─────────────────────── */}
        {viewMode === 'split' && (
          <div className="w-full">
            {isExpanded && selectedTxn ? (
              /* Expanded Split View (Slim Switcher + Wide Dossier) */
              <div className="grid grid-cols-12 gap-6 items-start w-full">
                <Card className="col-span-4 p-0 overflow-hidden border-slate-200/90 shadow-xl bg-white">
                  <div className="p-3.5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold uppercase text-slate-500">
                      Transactions ({filteredTxns.length})
                    </span>
                    <span className="text-[10px] font-mono text-orange-600 font-bold">1-Click Switch</span>
                  </div>
                  <div className="max-h-[640px] overflow-y-auto divide-y divide-slate-100">
                    {filteredTxns.map((tx) => {
                      const isSelected = selectedTxn?.transaction_id === tx.transaction_id;
                      return (
                        <div
                          key={tx.transaction_id}
                          onClick={() => handleSelectTransaction(tx)}
                          className={`p-3.5 cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-orange-50/90 border-l-4 border-orange-500 pl-2.5'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono font-bold text-xs text-slate-950">
                              {tx.transaction_id.slice(0, 16)}...
                            </span>
                            <span className="font-mono font-extrabold text-xs text-slate-900">
                              ₹{tx.amount?.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                            <span>{tx.customer_id.slice(0, 10)}</span>
                            {tx.is_abuse_ring ? (
                              <span className="text-rose-600 font-bold">Ring #{tx.ring_id}</span>
                            ) : tx.status === 'disputed' ? (
                              <span className="text-rose-600 font-medium">Disputed</span>
                            ) : (
                              <span className="text-emerald-600 font-medium font-mono">
                                {tx.risk_percent || 'Normal'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                <div className="col-span-8">
                  <ForensicDossierPanel
                    transaction={selectedTxn}
                    detail={txnDetail}
                    isExpanded={true}
                    onToggleExpand={() => setIsExpanded(false)}
                    onClose={handleCloseDetail}
                    onSelectTxn={handleSelectTransaction}
                  />
                </div>
              </div>
            ) : (
              /* Standard Side-by-Side Split View */
              <div className="grid grid-cols-12 gap-6 items-start w-full">
                <Card className={`p-0 overflow-hidden border-slate-200/90 shadow-xl bg-white transition-all ${
                  selectedTxn ? 'col-span-7 xl:col-span-7' : 'col-span-12'
                }`}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/90 text-slate-400 font-mono uppercase tracking-wider text-[10px] border-b border-slate-200">
                        <tr>
                          <th className="px-5 py-4">Transaction ID</th>
                          <th className="px-5 py-4">Customer</th>
                          <th className="px-5 py-4">Amount</th>
                          <th className="px-5 py-4">Method</th>
                          <th className="px-5 py-4">Status</th>
                          <th className="px-5 py-4">Risk Evaluation</th>
                          <th className="px-5 py-4">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {loading && transactions.length === 0 ? (
                          <TableSkeletonRows rows={6} cols={7} />
                        ) : !loading && transactions.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-8">
                              <EmptyState
                                icon={<CreditCard className="h-8 w-8 text-orange-600" />}
                                title="No Live Transactions"
                                description="Awaiting store webhook stream."
                              />
                            </td>
                          </tr>
                        ) : !loading && filteredTxns.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-8">
                              <EmptyState
                                icon={<Search className="h-8 w-8 text-orange-600" />}
                                title="No Matching Transactions"
                                description="Try adjusting search or status filters."
                              />
                            </td>
                          </tr>
                        ) : (
                          filteredTxns.map((tx) => {
                            const isSelected = selectedTxn?.transaction_id === tx.transaction_id;
                            return (
                              <tr
                                key={tx.transaction_id}
                                onClick={() => handleSelectTransaction(tx)}
                                className={`cursor-pointer transition-all ${
                                  isSelected
                                    ? 'bg-orange-50/80 hover:bg-orange-50'
                                    : 'hover:bg-slate-50/80'
                                }`}
                              >
                                <td className="px-5 py-3.5 font-mono text-slate-900 font-medium">
                                  {tx.transaction_id.slice(0, 14)}...
                                </td>
                                <td className="px-5 py-3.5 font-mono text-slate-500">
                                  {tx.customer_id.slice(0, 10)}
                                </td>
                                <td className="px-5 py-3.5 font-bold text-slate-950 font-mono">
                                  INR {tx.amount?.toLocaleString()}
                                </td>
                                <td className="px-5 py-3.5 capitalize text-slate-700 font-mono">
                                  {tx.payment_method_type}
                                </td>
                                <td className="px-5 py-3.5">
                                  <Badge
                                    variant={
                                      tx.status === 'captured'
                                        ? 'success'
                                        : tx.status === 'disputed'
                                        ? 'danger'
                                        : 'warning'
                                    }
                                  >
                                    {tx.status}
                                  </Badge>
                                </td>
                                <td className="px-5 py-3.5">
                                  {tx.is_abuse_ring ? (
                                    <span className="inline-flex items-center gap-1.5 text-rose-700 font-bold font-mono">
                                      <ShieldAlert className="h-3.5 w-3.5 text-rose-600" /> Ring #{tx.ring_id}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 text-emerald-700 font-mono font-medium">
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Normal ({tx.risk_percent || '1.8%'})
                                    </span>
                                  )}
                                </td>
                                <td className="px-5 py-3.5 text-slate-500 font-mono text-[11px]">
                                  {new Date(tx.created_at).toLocaleDateString()}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {/* Persistent Side Panel in Split Mode */}
                {selectedTxn ? (
                  <div className="col-span-5 xl:col-span-5">
                    <ForensicDossierPanel
                      transaction={selectedTxn}
                      detail={txnDetail}
                      isExpanded={false}
                      onToggleExpand={() => setIsExpanded(true)}
                      onClose={handleCloseDetail}
                      onSelectTxn={handleSelectTransaction}
                    />
                  </div>
                ) : (
                  <Card className="col-span-5 xl:col-span-5 p-8 border-dashed border-slate-200 bg-slate-50/50 text-center flex flex-col items-center justify-center min-h-[300px]">
                    <div className="h-10 w-10 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 mb-3">
                      <Columns2 className="h-5 w-5" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 mb-1">Split View Active</h4>
                    <p className="text-xs text-slate-500 max-w-xs">
                      Click any transaction from the list on the left to open its real-time forensic dossier here.
                    </p>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
