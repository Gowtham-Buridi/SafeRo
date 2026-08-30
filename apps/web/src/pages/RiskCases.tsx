import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
  Search,
  ChevronRight,
  User,
  UserCheck,
  UserPlus,
  Sparkle,
  Info,
  Check,
  ArrowRight,
  Shield,
  ArrowUpRight,
  Trash2,
  Loader2,
  Tag,
  Smartphone,
  Lock,
  Globe,
  Bell,
  FileText,
  Send,
  History,
  CheckSquare,
  Square,
  ShieldCheck,
  Zap,
  X,
} from 'lucide-react';
import { PageHeader, Card, Button, Badge, Skeleton, ErrorState, EmptyState } from '../components/ui/index.ts';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';

// ── Authoritative Severity Threshold Resolver ─────────────────
export function getCaseSeverity(score: number): {
  label: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  variant: 'danger' | 'warning' | 'success';
} {
  if (score >= 0.75) {
    return { label: 'Critical Risk', severity: 'critical', variant: 'danger' };
  }
  if (score >= 0.50) {
    return { label: 'High Risk', severity: 'high', variant: 'danger' };
  }
  if (score >= 0.25) {
    return { label: 'Medium Risk', severity: 'medium', variant: 'warning' };
  }
  return { label: 'Low Risk', severity: 'low', variant: 'success' };
}

// ── Clean Signal Title Formatter ──────────────────────────────
export function formatSignalTitle(name: string): string {
  if (!name) return '';
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bUpi\b/g, 'UPI')
    .replace(/\bIp\b/g, 'IP')
    .replace(/\bId\b/g, 'ID');
}

// ── Plain English Tooltips for Technical Signal Names ─────────
export function getSignalExplanation(signalType: string): string {
  const norm = signalType?.toLowerCase() || '';
  if (norm.includes('device') || norm.includes('fingerprint')) {
    return 'Multiple distinct user accounts accessing the merchant platform from identical hardware fingerprints.';
  }
  if (norm.includes('ip') || norm.includes('proxy')) {
    return 'Coordinated traffic originating from a shared IP subnet, proxy node, or data center hosting network.';
  }
  if (norm.includes('payment') || norm.includes('nexus') || norm.includes('card') || norm.includes('upi')) {
    return 'Multiple user accounts linked by the same underlying payment instrument (card, UPI VPA, or bank account).';
  }
  if (norm.includes('velocity') || norm.includes('burst')) {
    return 'Transaction volume or frequency deviates sharply from historical baseline over short time intervals.';
  }
  if (norm.includes('heuristic') || norm.includes('stuffing') || norm.includes('anomaly')) {
    return 'Automated traffic pattern matching credential stuffing, brute force testing, or bot script velocity.';
  }
  if (norm.includes('dispute') || norm.includes('chargeback')) {
    return 'Customer contested transaction settlement directly with the card issuing bank.';
  }
  if (norm.includes('legitimate') || norm.includes('clean')) {
    return 'Clean device hardware profile, verified IP geolocation, and zero proxy collision detected.';
  }
  if (norm.includes('reputable') || norm.includes('history')) {
    return 'Customer profile has long-standing verified clean payment settlement history across the network.';
  }
  if (norm.includes('escalat')) {
    return 'Incident formally escalated to human forensic triage from surveillance radar.';
  }
  return 'Forensic behavioral marker identified by the SafeRo deterministic risk engine.';
}

// ── Signal Card Polarity Resolver ─────────────────────────────
export function getSignalStyle(s: any) {
  const norm = s.signal_type?.toLowerCase() || '';
  const isPositive = s.polarity === 'positive' ||
    s.severity === 'info' ||
    norm.includes('legitimate') ||
    norm.includes('reputable') ||
    norm.includes('clean') ||
    norm.includes('normal');

  if (isPositive) {
    return {
      cardClass: 'border-emerald-200/90 bg-emerald-50/50 hover:border-emerald-300',
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />,
      badge: (
        <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-200/60">
          Normal
        </span>
      ),
      titleColor: 'text-emerald-950',
      textColor: 'text-emerald-800/90',
    };
  }

  const isMedium = s.severity === 'medium' ||
    s.severity === 'warning' ||
    norm.includes('heuristic') ||
    norm.includes('anomaly') ||
    norm.includes('medium');

  if (isMedium) {
    return {
      cardClass: 'border-amber-200/90 bg-amber-50/50 hover:border-amber-300',
      icon: <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />,
      badge: (
        <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-200/60">
          Warning
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
        High Risk
      </span>
    ),
    titleColor: 'text-rose-950',
    textColor: 'text-rose-800/90',
  };
}

const WORKFLOW_STAGES = [
  { id: 'open', label: 'Open', tooltip: 'Needs first human review & initial triage' },
  { id: 'investigating', label: 'Investigating', tooltip: 'Active evidence review & forensic inquiry underway' },
  { id: 'confirmed', label: 'Confirmed', tooltip: 'Verified as real fraud / malicious coordinated ring' },
  { id: 'resolved', label: 'Resolved', tooltip: 'Mitigation enacted & case formally closed' },
];

export function RiskCases() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cases, setCases] = useState<any[]>([]);
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCase, setActiveCase] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [assigningUser, setAssigningUser] = useState(false);
  const [isUnescalating, setIsUnescalating] = useState(false);

  // Notes & Checklist & Mitigation states
  const [newNoteText, setNewNoteText] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isTogglingChecklist, setIsTogglingChecklist] = useState<string | null>(null);
  const [isTogglingMitigation, setIsTogglingMitigation] = useState<string | null>(null);
  const [isClearingAudit, setIsClearingAudit] = useState(false);

  const fetchCases = () => {
    setLoading(true);
    setErrorBanner(null);
    api.getCases(selectedStatus)
      .then((data) => {
        setCases(data);
        if (data.length > 0 && activeCase) {
          const current = data.find((c: any) => c.id === activeCase.id);
          if (current) setActiveCase(current);
          else setActiveCase(null);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch cases:', err);
        setErrorBanner('Failed to load risk cases from API server: ' + (err?.message || 'Server error'));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCases();
  }, [selectedStatus]);

  const handleStatusChange = (newStatus: string) => {
    if (!activeCase || updatingStatus) return;
    setErrorBanner(null);
    setUpdatingStatus(true);

    api.updateCaseStatus(activeCase.id, newStatus)
      .then((res) => {
        const updated = res || { ...activeCase, status: newStatus };
        setActiveCase(updated);
        setSuccessBanner(`Case status updated to ${newStatus.toUpperCase()}`);
        setTimeout(() => setSuccessBanner(null), 4000);
        fetchCases();
      })
      .catch((err) => {
        console.error('Failed to update case status:', err);
        setErrorBanner(`Failed to update case status: ${err?.message || 'Server error'}. Status remains ${activeCase.status}.`);
      })
      .finally(() => {
        setUpdatingStatus(false);
      });
  };

  const handleAssignToMe = () => {
    if (!activeCase || assigningUser) return;
    const assigneeEmail = user?.email || 'analyst@safero.io';
    setAssigningUser(true);
    setErrorBanner(null);

    api.updateCase(activeCase.id, { assigned_to: assigneeEmail })
      .then((res) => {
        const updated = res || { ...activeCase, assigned_to: assigneeEmail };
        setActiveCase(updated);
        setSuccessBanner(`Case successfully assigned to ${assigneeEmail}`);
        setTimeout(() => setSuccessBanner(null), 4000);
        fetchCases();
      })
      .catch((err) => {
        console.error('Failed to assign case:', err);
        setErrorBanner(`Failed to assign case: ${err?.message || 'Server error'}`);
      })
      .finally(() => {
        setAssigningUser(false);
      });
  };

  const handleUnescalateCase = async (caseToUnescalate?: any) => {
    const target = caseToUnescalate || activeCase;
    if (!target || !target.id || isUnescalating) return;
    setIsUnescalating(true);
    setErrorBanner(null);

    const targetId = target.id;
    const targetTitle = target.title || targetId;

    try {
      await api.deleteCase(targetId);
      setSuccessBanner(`Case "${targetTitle}" successfully unescalated and removed from queue.`);
      setTimeout(() => setSuccessBanner(null), 4000);

      // Optimistic update of local state immediately
      setCases((prevCases) => {
        const next = prevCases.filter((c) => c.id !== targetId);
        if (activeCase?.id === targetId) {
          setActiveCase(next.length > 0 ? next[0] : null);
        }
        return next;
      });

      // Background re-fetch to ensure complete sync
      fetchCases();
    } catch (err: any) {
      console.error('Failed to unescalate case:', err);
      if (err?.message?.includes('404') || err?.message?.includes('not found') || err?.message?.includes('already removed')) {
        setCases((prevCases) => {
          const next = prevCases.filter((c) => c.id !== targetId);
          if (activeCase?.id === targetId) {
            setActiveCase(next.length > 0 ? next[0] : null);
          }
          return next;
        });
        setSuccessBanner(`Case "${targetTitle}" removed from active cases.`);
        setTimeout(() => setSuccessBanner(null), 4000);
      } else {
        setErrorBanner(`Failed to unescalate case: ${err?.message || 'Server error'}`);
      }
    } finally {
      setIsUnescalating(false);
    }
  };

  // Toggle Checklist Item
  const handleToggleChecklist = async (checklistId: string, currentCompleted: boolean) => {
    if (!activeCase || isTogglingChecklist) return;
    setIsTogglingChecklist(checklistId);
    setErrorBanner(null);

    const newCompleted = !currentCompleted;

    // Optimistic update
    const updatedChecklist = (activeCase.action_checklist || []).map((chk: any) =>
      chk.id === checklistId ? { ...chk, completed: newCompleted } : chk
    );
    const optimisticCase = { ...activeCase, action_checklist: updatedChecklist };
    setActiveCase(optimisticCase);

    try {
      const res = await api.toggleChecklistItem(activeCase.id, checklistId, newCompleted);
      if (res) setActiveCase(res);
      setSuccessBanner(newCompleted ? 'Action item marked completed' : 'Action item reopened');
      setTimeout(() => setSuccessBanner(null), 3000);
      fetchCases();
    } catch (err: any) {
      console.error('Failed to toggle checklist item:', err);
      setErrorBanner(`Failed to update checklist: ${err?.message || 'Server error'}`);
      fetchCases();
    } finally {
      setIsTogglingChecklist(null);
    }
  };

  // Toggle Active Mitigation (Block Device, Hold Customer, Throttle IP, Webhook)
  const handleToggleMitigation = async (mitigationType: string, currentActive: boolean) => {
    if (!activeCase || isTogglingMitigation) return;
    setIsTogglingMitigation(mitigationType);
    setErrorBanner(null);

    const newActive = !currentActive;

    // Optimistic update
    const optimisticCase = {
      ...activeCase,
      mitigations: {
        ...(activeCase.mitigations || {}),
        [mitigationType]: newActive,
      },
    };
    setActiveCase(optimisticCase);

    try {
      const res = await api.applyMitigation(activeCase.id, mitigationType, newActive);
      if (res) setActiveCase(res);
      setSuccessBanner(`Defense rule "${mitigationType.replace(/_/g, ' ')}" ${newActive ? 'enforced' : 'deactivated'}`);
      setTimeout(() => setSuccessBanner(null), 4000);
      fetchCases();
    } catch (err: any) {
      console.error('Failed to apply mitigation:', err);
      setErrorBanner(`Failed to update mitigation: ${err?.message || 'Server error'}`);
      fetchCases();
    } finally {
      setIsTogglingMitigation(null);
    }
  };

  // Add Analyst Note to Case Audit Trail
  const handleAddCaseNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) {
      setNoteError('Please enter a note before posting.');
      return;
    }
    if (!activeCase || isAddingNote) return;

    setIsAddingNote(true);
    setNoteError(null);
    setErrorBanner(null);

    try {
      const res = await api.addCaseNote(activeCase.id, newNoteText.trim());
      if (res) setActiveCase(res);
      setNewNoteText('');
      setSuccessBanner('Analyst note appended to case audit trail');
      setTimeout(() => setSuccessBanner(null), 3000);
      fetchCases();
    } catch (err: any) {
      console.error('Failed to add note:', err);
      setErrorBanner(`Failed to add note: ${err?.message || 'Server error'}`);
    } finally {
      setIsAddingNote(false);
    }
  };

  // Clear Case Audit Trail
  const handleClearAuditTrail = async () => {
    if (!activeCase || isClearingAudit) return;
    setIsClearingAudit(true);
    setErrorBanner(null);

    try {
      const res = await api.clearCaseAudit(activeCase.id);
      if (res) {
        setActiveCase(res);
      } else {
        setActiveCase((prev: any) => ({ ...prev, audit_trail: [] }));
      }
      setSuccessBanner('Incident activity trail and audit log cleared');
      setTimeout(() => setSuccessBanner(null), 3000);
      fetchCases();
    } catch (err: any) {
      console.error('Failed to clear audit trail:', err);
      setErrorBanner(`Failed to clear audit trail: ${err?.message || 'Server error'}`);
    } finally {
      setIsClearingAudit(false);
    }
  };

  const filteredCases = cases.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.id?.toLowerCase().includes(q) ||
      c.title?.toLowerCase().includes(q) ||
      c.assigned_to?.toLowerCase().includes(q) ||
      c.typology_tags?.some((t: string) => t.toLowerCase().includes(q))
    );
  });

  const activeCaseSeverity = activeCase ? getCaseSeverity(activeCase.risk_score) : null;
  const currentStageIndex = activeCase
    ? WORKFLOW_STAGES.findIndex((s) => s.id === activeCase.status?.toLowerCase())
    : -1;

  const isAssignedToCurrentUser =
    user?.email &&
    activeCase?.assigned_to?.toLowerCase() === user.email.toLowerCase();

  const renderCaseCard = (c: any, isSelected: boolean) => {
    const sev = getCaseSeverity(c.risk_score);
    const hasMitigations = c.mitigations && Object.values(c.mitigations).some(Boolean);

    return (
      <div
        key={c.id}
        onClick={() => setActiveCase(c)}
        className={`cursor-pointer rounded-3xl border p-5 transition-all duration-200 ${
          isSelected
            ? 'border-orange-500/80 bg-gradient-to-br from-orange-50/90 via-white to-orange-50/40 shadow-xl shadow-orange-500/10 -translate-y-0.5'
            : 'border-slate-200/80 bg-white hover:border-orange-400 hover:shadow-md hover:-translate-y-0.5'
        }`}
      >
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <span className="font-extrabold text-sm text-slate-950 font-display-serif">
            {c.title}
          </span>
          <Badge variant={sev.variant}>
            {sev.label}
          </Badge>
        </div>

        {/* Typology Tag Pills */}
        {c.typology_tags && c.typology_tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {c.typology_tags.slice(0, 3).map((t: string) => (
              <span
                key={t}
                className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200/70 text-slate-600 text-[10px] font-mono font-semibold"
              >
                {t}
              </span>
            ))}
            {c.typology_tags.length > 3 && (
              <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-mono">
                +{c.typology_tags.length - 3}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 capitalize">
              <Clock className="h-3.5 w-3.5 text-slate-400" /> {c.status}
            </span>
            {hasMitigations && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[9px] border border-emerald-200">
                <ShieldCheck className="h-2.5 w-2.5" />
                <span>Defenses Active</span>
              </span>
            )}
          </div>
          <span className="font-extrabold text-slate-900">
            {(c.risk_score * 100).toFixed(1)}% Risk
          </span>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-2.5 mt-2.5 border-t border-slate-100">
          {c.assigned_to && c.assigned_to !== 'Unassigned' ? (
            <span className="truncate max-w-[150px] text-slate-600 font-medium">
              👤 {c.assigned_to}
            </span>
          ) : (
            <span className="text-slate-400">
              ID: {c.id.slice(0, 14)}
            </span>
          )}
          <div className="flex items-center gap-2">
            <span>{new Date(c.created_at).toLocaleDateString()}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleUnescalateCase(c);
              }}
              title="Unescalate case"
              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* 1. Clear One-Line Purpose Statement */}
      <PageHeader
        tag="RISK CASES"
        title="Risk Cases"
        description="Review evidence, take quick actions to stop fraud, and manage cases from open to resolved."
      />

      {/* Full Error State (when initial load fails completely) */}
      {errorBanner && cases.length === 0 && (
        <ErrorState
          title="Could not connect to risk case repository"
          message={errorBanner}
          onRetry={fetchCases}
          isRetrying={loading}
        />
      )}

      {/* Compact Error Banner (when action encounters issue) */}
      {errorBanner && cases.length > 0 && (
        <ErrorState
          compact={true}
          title="Case action error"
          message={errorBanner}
          onRetry={fetchCases}
          isRetrying={loading}
        />
      )}

      {/* Success Notification Banner */}
      {successBanner && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 flex items-center justify-between shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{successBanner}</span>
          </div>
          <button
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-600 font-bold hover:underline ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Status Filter Bar & Search */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200/80 bg-white/70 backdrop-blur-md p-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          {['All', 'Open', 'Investigating', 'Confirmed', 'Resolved'].map((tab) => (
            <button
              key={tab}
              onClick={() => setSelectedStatus(tab)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                selectedStatus === tab
                  ? 'bg-slate-950 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-950 hover:bg-white/60'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search cases, titles, assignees, tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-64 rounded-full border border-slate-200 bg-slate-50 pl-10 pr-4 text-xs text-slate-900 placeholder-slate-400 focus:border-orange-500 focus:bg-white focus:outline-none"
            />
          </div>
          <span className="text-xs font-mono text-slate-500">
            <strong>{filteredCases.length}</strong> active cases
          </span>
        </div>
      </div>

      {/* Master Detail / Full Width Cases Grid */}
      {loading && cases.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs space-y-3 animate-pulse">
              <div className="flex items-center justify-between">
                <Skeleton variant="text" className="w-36 h-4" />
                <Skeleton variant="text" className="w-16 h-4" />
              </div>
              <Skeleton variant="text" className="w-48 h-3" />
              <div className="flex items-center gap-2 pt-2">
                <Skeleton variant="text" className="w-20 h-4" />
                <Skeleton variant="text" className="w-20 h-4" />
              </div>
            </div>
          ))}
        </div>
      ) : activeCase && activeCaseSeverity ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch h-[calc(100vh-210px)] min-h-[640px]">
          {/* Cases List in Split View (5 cols) */}
          <div className="lg:col-span-5 h-full overflow-y-auto space-y-3 pr-2">
            {filteredCases.map((c) => renderCaseCard(c, activeCase.id === c.id))}

            {filteredCases.length === 0 && (
              <Card className="p-8 text-center border-dashed border-slate-200 bg-slate-50/50">
                <p className="text-xs font-mono text-slate-500">No cases matching current filter or search.</p>
              </Card>
            )}
          </div>

          {/* Case Dossier Detail (7 cols) - Equal length with internal scroll down */}
          <Card className="lg:col-span-7 h-full overflow-y-auto p-6 sm:p-7 border-slate-200/90 shadow-2xl bg-white space-y-6">
            {/* Dossier Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100 gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-orange-600 font-mono block mb-1">
                  Case Detail
                </span>
                <h2 className="text-xl font-extrabold text-slate-950 font-display-serif tracking-tight">
                  {activeCase.title}
                </h2>
                <div className="flex flex-wrap items-center gap-2.5 mt-1.5">
                  <p className="text-xs text-slate-400 font-mono">ID: {activeCase.id}</p>
                  <button
                    onClick={() => {
                      const query = `Analyze Risk Case ${activeCase.id} (${activeCase.title}): Status is ${activeCase.status} with risk score ${(activeCase.risk_score * 100).toFixed(1)}%. Typology tags: ${activeCase.typology_tags?.join(', ') || 'N/A'}. Key signals: ${activeCase.signals?.map((s: any) => s.message).join('; ') || 'Standard telemetry'}. Please provide root-cause forensic breakdown and triage recommendations.`;
                      navigate(`/investigation?q=${encodeURIComponent(query)}`, {
                        state: { initialQuery: query },
                      });
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 text-orange-950 hover:bg-orange-100/80 font-bold text-[11px] transition-all cursor-pointer shadow-sm"
                  >
                    <Sparkle className="h-3 w-3 text-orange-500 fill-orange-500/40" />
                    <span>Investigate with AI</span>
                    <ArrowUpRight className="h-3 w-3 text-orange-600" />
                  </button>

                  {/* Unescalate Action Button */}
                  <button
                    onClick={() => handleUnescalateCase(activeCase)}
                    disabled={isUnescalating}
                    title="Unescalate case and remove from active registry"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 font-bold text-[11px] transition-all cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    {isUnescalating ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin text-rose-600" />
                        <span>Unescalating...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-3 w-3 text-rose-600" />
                        <span>Unescalate Case</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="text-right shrink-0 flex items-start gap-2">
                <div>
                  <Badge variant={activeCaseSeverity.variant}>
                    {activeCaseSeverity.label}
                  </Badge>
                  <div className="font-mono font-black text-xl text-slate-950 mt-1">
                    {(activeCase.risk_score * 100).toFixed(1)}%
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveCase(null)}
                  title="Close Case Dossier"
                  className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer ml-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* 2. Visual Status Workflow Progress Indicator */}
            <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-500 font-mono tracking-wider">
                  Case Progress
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  Current: <strong className="capitalize text-slate-900">{activeCase.status}</strong>
                </span>
              </div>

              {/* Progress Line & Nodes */}
              <div className="relative pt-2 pb-1">
                <div className="absolute top-6 left-6 right-6 h-1 bg-slate-200 rounded-full z-0" />
                <div
                  className="absolute top-6 left-6 h-1 bg-orange-500 rounded-full transition-all duration-300 z-0"
                  style={{
                    width: currentStageIndex <= 0 ? '0%' : `${(currentStageIndex / (WORKFLOW_STAGES.length - 1)) * 100}%`,
                  }}
                />

                <div className="relative grid grid-cols-4 gap-2 z-10">
                  {WORKFLOW_STAGES.map((stage, idx) => {
                    const isPassed = idx <= currentStageIndex;
                    const isCurrent = stage.id === activeCase.status?.toLowerCase();
                    return (
                      <div
                        key={stage.id}
                        className="group relative flex flex-col items-center text-center cursor-pointer"
                        onClick={() => handleStatusChange(stage.id)}
                      >
                        <div
                          className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs transition-all duration-200 shadow-sm ${
                            isCurrent
                              ? 'bg-slate-950 text-white ring-4 ring-orange-500/30 scale-110'
                              : isPassed
                              ? 'bg-orange-500 text-white'
                              : 'bg-white text-slate-400 border-2 border-slate-200 hover:border-slate-400'
                          }`}
                        >
                          {isPassed && !isCurrent ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <span>{idx + 1}</span>
                          )}
                        </div>

                        <span
                          className={`mt-2 text-xs font-semibold capitalize transition-colors ${
                            isCurrent ? 'text-slate-950 font-bold' : isPassed ? 'text-slate-800' : 'text-slate-400'
                          }`}
                        >
                          {stage.label}
                        </span>

                        <div className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 w-48 rounded-lg bg-slate-900 text-white p-2 text-[10px] text-center shadow-xl z-20">
                          {stage.tooltip}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Explicit Status Action Buttons */}
              <div className="pt-3 mt-1 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-2.5">
                <span className="text-[11px] font-mono font-bold text-slate-500 flex items-center gap-1.5">
                  <span>Update Status:</span>
                </span>

                <div className="flex flex-wrap items-center gap-1.5">
                  {WORKFLOW_STAGES.map((st) => {
                    const isCurrent = st.id === activeCase.status?.toLowerCase();
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => handleStatusChange(st.id)}
                        disabled={updatingStatus || isCurrent}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          isCurrent
                            ? 'bg-slate-950 text-white shadow-xs cursor-default'
                            : 'bg-white hover:bg-orange-50 hover:text-orange-950 text-slate-700 border border-slate-200 shadow-2xs hover:border-orange-300'
                        }`}
                      >
                        {updatingStatus && isCurrent ? (
                          <Loader2 className="h-3 w-3 animate-spin text-orange-400" />
                        ) : isCurrent ? (
                          <Check className="h-3.5 w-3.5 text-orange-400" />
                        ) : null}
                        <span>{st.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 3. One-Click Active Defense Mitigations */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-3.5 shadow-sm">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                <h3 className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-orange-500" />
                  <span>Quick Actions</span>
                </h3>
                <span className="text-[10px] font-mono text-slate-400">Live</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Device Block Toggle */}
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-orange-600" />
                    <div>
                      <p className="text-xs font-bold text-slate-900">Device Block</p>
                      <p className="text-[10px] font-mono text-slate-500">
                        {activeCase.mitigations?.device_blocked ? '🔒 Blacklisted' : 'Permitted'}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={activeCase.mitigations?.device_blocked ? 'danger' : 'secondary'}
                    onClick={() => handleToggleMitigation('device_blocked', Boolean(activeCase.mitigations?.device_blocked))}
                    disabled={isTogglingMitigation === 'device_blocked'}
                    className="cursor-pointer"
                  >
                    {isTogglingMitigation === 'device_blocked' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : activeCase.mitigations?.device_blocked ? (
                      'Unblock'
                    ) : (
                      'Block Node'
                    )}
                  </Button>
                </div>

                {/* Customer Hold Toggle */}
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-rose-600" />
                    <div>
                      <p className="text-xs font-bold text-slate-900">Customer 3DS Hold</p>
                      <p className="text-[10px] font-mono text-slate-500">
                        {activeCase.mitigations?.customer_held ? '⚠️ 48h Hold' : 'Normal'}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={activeCase.mitigations?.customer_held ? 'danger' : 'secondary'}
                    onClick={() => handleToggleMitigation('customer_held', Boolean(activeCase.mitigations?.customer_held))}
                    disabled={isTogglingMitigation === 'customer_held'}
                    className="cursor-pointer"
                  >
                    {isTogglingMitigation === 'customer_held' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : activeCase.mitigations?.customer_held ? (
                      'Release Hold'
                    ) : (
                      'Hold Settlement'
                    )}
                  </Button>
                </div>

                {/* IP Throttle Toggle */}
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-amber-600" />
                    <div>
                      <p className="text-xs font-bold text-slate-900">IP Subnet Throttle</p>
                      <p className="text-[10px] font-mono text-slate-500">
                        {activeCase.mitigations?.ip_throttled ? '⚡ Throttled' : 'Unthrottled'}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={activeCase.mitigations?.ip_throttled ? 'danger' : 'secondary'}
                    onClick={() => handleToggleMitigation('ip_throttled', Boolean(activeCase.mitigations?.ip_throttled))}
                    disabled={isTogglingMitigation === 'ip_throttled'}
                    className="cursor-pointer"
                  >
                    {isTogglingMitigation === 'ip_throttled' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : activeCase.mitigations?.ip_throttled ? (
                      'Remove Limit'
                    ) : (
                      'Throttle Velocity'
                    )}
                  </Button>
                </div>

                {/* Merchant Webhook Alert */}
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-blue-600" />
                    <div>
                      <p className="text-xs font-bold text-slate-900">Merchant Webhook</p>
                      <p className="text-[10px] font-mono text-slate-500">
                        {activeCase.mitigations?.merchant_notified ? '✓ Dispatched' : 'Pending'}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={activeCase.mitigations?.merchant_notified ? 'secondary' : 'primary'}
                    onClick={() => handleToggleMitigation('merchant_notified', Boolean(activeCase.mitigations?.merchant_notified))}
                    disabled={isTogglingMitigation === 'merchant_notified'}
                    className="cursor-pointer"
                  >
                    {isTogglingMitigation === 'merchant_notified' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : activeCase.mitigations?.merchant_notified ? (
                      'Resend Alert'
                    ) : (
                      'Push Webhook'
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* 5. Detected Forensic Signals with (i) Tooltips and Polarity Colors */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                  Why We Flagged This ({activeCase.signals?.length || 0})
                </h3>
                <span className="text-[10px] font-mono text-slate-400">Auto-detected</span>
              </div>

              <div className="space-y-3">
                {activeCase.signals?.map((s: any, idx: number) => {
                  const style = getSignalStyle(s);
                  const formattedTitle = formatSignalTitle(s.signal_type);
                  const explanation = getSignalExplanation(s.signal_type);

                  return (
                    <div
                      key={idx}
                      className={`rounded-2xl border p-4 text-xs shadow-sm transition-all ${style.cardClass}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5">
                          {style.icon}
                          <span className={`font-bold ${style.titleColor}`}>
                            {formattedTitle}
                          </span>

                          <div className="group relative inline-flex items-center cursor-help">
                            <Info className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 transition-colors" />
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 w-64 rounded-xl bg-slate-900 text-white p-2.5 text-[11px] leading-relaxed shadow-2xl z-30">
                              {explanation}
                              <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900" />
                            </div>
                          </div>
                        </div>

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

            {/* 6. Chronological Incident Audit Trail & Activity Log */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 gap-2">
                <h3 className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5 text-slate-400" />
                  <span>Activity Log</span>
                </h3>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-400">
                    {activeCase.audit_trail?.length || 0} Recorded Events
                  </span>

                  {(activeCase.audit_trail?.length || 0) > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAuditTrail}
                      disabled={isClearingAudit}
                      title="Clear all recorded events in this case audit trail"
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-700 border border-slate-200 hover:border-rose-200 text-[10px] font-mono font-bold transition-all cursor-pointer disabled:opacity-50 shadow-xs"
                    >
                      {isClearingAudit ? (
                        <Loader2 className="h-3 w-3 animate-spin text-rose-600" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                      <span>Clear Log</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Add Note Input Form */}
              <div className="space-y-1">
                <form onSubmit={handleAddCaseNote} className="flex gap-2">
                  <input
                    type="text"
                    value={newNoteText}
                    onChange={(e) => {
                      setNewNoteText(e.target.value);
                      if (noteError) setNoteError(null);
                    }}
                    placeholder="Add analyst note or investigation update..."
                    className={`flex-1 h-9 px-3 rounded-xl border text-xs text-slate-900 focus:outline-none transition-all ${
                      noteError
                        ? 'border-rose-300 bg-rose-50/30 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20'
                        : 'border-slate-200 bg-slate-50 focus:bg-white focus:border-orange-500'
                    }`}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    disabled={isAddingNote}
                    className="cursor-pointer font-bold"
                  >
                    {isAddingNote ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5 mr-1" />
                        <span>Post Note</span>
                      </>
                    )}
                  </Button>
                </form>
                {noteError && (
                  <p className="text-[11px] text-rose-600 font-medium animate-in fade-in duration-150">
                    {noteError}
                  </p>
                )}
              </div>

              {/* Timeline List */}
              <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                {activeCase.audit_trail && activeCase.audit_trail.length > 0 ? (
                  activeCase.audit_trail.map((entry: any) => (
                    <div
                      key={entry.id}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                        <span className="font-bold text-slate-900 flex items-center gap-1">
                          👤 {entry.actor} · <span className="text-orange-600">{entry.action}</span>
                        </span>
                        <span className="text-slate-400 text-[10px]">
                          {new Date(entry.timestamp).toLocaleString()}
                        </span>
                      </div>
                      {entry.details && (
                        <p className="text-[11px] text-slate-700 font-sans leading-relaxed">
                          {entry.details}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-slate-400 font-mono italic py-1">
                    No activity records logged yet.
                  </p>
                )}
              </div>
            </div>

            {/* Case Dossier Footer */}
            <div className="pt-4 border-t border-slate-100 text-xs flex flex-wrap items-center justify-between gap-3 text-slate-500 font-mono">
              {activeCase.assigned_to && activeCase.assigned_to !== 'Unassigned' ? (
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <span>
                    Assigned to:{' '}
                    <strong className="text-slate-900 font-bold">
                      {isAssignedToCurrentUser ? `${user?.email} (You)` : activeCase.assigned_to}
                    </strong>
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Case Active</span>
                </div>
              )}

              <span>Opened: {new Date(activeCase.created_at).toLocaleDateString()}</span>
            </div>
          </Card>
        </div>
      ) : (
        /* Full-Width Grid: Cases cover up to the right side across all columns */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCases.map((c) => renderCaseCard(c, false))}

          {filteredCases.length === 0 && (
            <Card className="col-span-full p-12 text-center border border-dashed border-slate-200 bg-slate-50/70 rounded-3xl space-y-4">
              <div className="relative mx-auto flex items-center justify-center">
                <div className="h-16 w-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-inner">
                  <ShieldCheck className="h-8 w-8 text-emerald-600" />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-emerald-400/40 animate-ping" />
              </div>

              <div className="max-w-md mx-auto space-y-1.5">
                <h3 className="text-base font-extrabold text-slate-950 font-display-serif">
                  Triage Queue Clear · 0 Risk Cases
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Your store has zero open fraud cases. SafeRo continuously monitors incoming checkouts and will automatically open a forensic case here whenever an abuse syndicate or suspicious pattern triggers the risk threshold.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Link to="/settings">
                  <Button variant="secondary" size="sm" className="cursor-pointer font-bold">
                    <span>Store Webhook Settings →</span>
                  </Button>
                </Link>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
