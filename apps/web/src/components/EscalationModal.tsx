import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  X,
  Sparkle,
  Lock,
  Smartphone,
  Globe,
  Bell,
  Check,
  Loader2,
  AlertTriangle,
  Tag,
  User,
  FileText
} from 'lucide-react';
import { Button } from './ui/Button';

export interface EscalationModalData {
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  typology_tags: string[];
  assigned_to: string;
  notes: string;
  mitigations: {
    device_blocked: boolean;
    customer_held: boolean;
    ip_throttled: boolean;
    merchant_notified: boolean;
  };
}

export interface EscalationTarget {
  type: 'transaction' | 'ring';
  id: string;
  title?: string;
  amount?: number;
  riskScore?: number;
  customerId?: string;
  merchantId?: string;
  deviceId?: string;
  ipId?: string;
  memberCount?: number;
}

interface EscalationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: EscalationModalData) => Promise<void>;
  target: EscalationTarget | null;
  isSubmitting?: boolean;
}

const AVAILABLE_TAGS = [
  '#CardTesting',
  '#AccountTakeover',
  '#AbuseRing',
  '#SyntheticIdentity',
  '#PromoAbuse',
  '#HighVelocity',
  '#ProxyCollision',
  '#ChargebackRisk',
  '#DeviceCollusion'
];

const INVESTIGATORS = [
  { label: 'Unassigned', value: 'Unassigned' },
  { label: 'analyst@safero.io (You)', value: 'analyst@safero.io' },
  { label: 'lead_investigator@safero.internal', value: 'lead_investigator@safero.internal' },
  { label: 'senior_risk_specialist@safero.io', value: 'senior_risk_specialist@safero.io' },
];

export const EscalationModal: React.FC<EscalationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  target,
  isSubmitting = false,
}) => {
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('high');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [assignedTo, setAssignedTo] = useState('analyst@safero.io');
  const [notes, setNotes] = useState('');
  const [mitigations, setMitigations] = useState({
    device_blocked: true,
    customer_held: false,
    ip_throttled: false,
    merchant_notified: true,
  });

  useEffect(() => {
    if (target && isOpen) {
      const defaultTitle = target.type === 'ring'
        ? `Escalated Ring #${target.id} (${target.memberCount || 6} Coordinated Accounts)`
        : `Forensic Escalation: Transaction ${target.id.slice(0, 12)} (${target.customerId ? target.customerId.slice(0, 8) : 'Direct'})`;
      
      setTitle(defaultTitle);
      
      const defaultSev = (target.riskScore && target.riskScore >= 0.75) || target.type === 'ring' ? 'critical'
        : (target.riskScore && target.riskScore >= 0.5) ? 'high'
        : (target.riskScore && target.riskScore >= 0.25) ? 'medium'
        : 'low';
      setSeverity(defaultSev);

      setSelectedTags(
        target.type === 'ring'
          ? ['#AbuseRing', '#DeviceCollusion', '#HighVelocity']
          : ['#HighVelocity', '#CardTesting']
      );

      setMitigations({
        device_blocked: Boolean(target.deviceId || target.type === 'ring'),
        customer_held: Boolean(target.customerId),
        ip_throttled: Boolean(target.ipId),
        merchant_notified: true,
      });

      setNotes('');
    }
  }, [target, isOpen]);

  if (!isOpen || !target) return null;

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const toggleMitigation = (key: keyof typeof mitigations) => {
    setMitigations(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirm({
      title: title.trim() || target.title || `Case ${target.id}`,
      severity,
      typology_tags: selectedTags,
      assigned_to: assignedTo,
      notes: notes.trim(),
      mitigations,
    });
  };

  const severityStyles = {
    critical: 'border-rose-500 bg-rose-50 text-rose-800 ring-2 ring-rose-500/20',
    high: 'border-orange-500 bg-orange-50 text-orange-800 ring-2 ring-orange-500/20',
    medium: 'border-amber-500 bg-amber-50 text-amber-800 ring-2 ring-amber-500/20',
    low: 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner">
              <ShieldAlert className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-tight font-display-serif">
                Escalate Incident to Formal Risk Case
              </h3>
              <p className="text-[11px] text-orange-100 font-mono">
                SafeRo Sovereign Triage & Active Response
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-slate-700">
          {/* Target Metadata Banner */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-wrap items-center justify-between gap-2 font-mono">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-800 text-[10px] font-bold uppercase">
                {target.type === 'ring' ? 'Abuse Ring' : 'Transaction'}
              </span>
              <span className="font-bold text-slate-900 truncate max-w-[240px]">
                {target.id}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              {target.amount !== undefined && (
                <span className="text-slate-950 font-extrabold">
                  ₹{target.amount.toLocaleString()}
                </span>
              )}
              {target.riskScore !== undefined && (
                <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-900 font-extrabold text-[10px]">
                  {(target.riskScore * 100).toFixed(1)}% Risk
                </span>
              )}
              {target.memberCount !== undefined && (
                <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-900 font-extrabold text-[10px]">
                  {target.memberCount} Linked Accounts
                </span>
              )}
            </div>
          </div>

          {/* Case Title Input */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500">
              Case Title / Incident Docket
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Coordinated Syndicate Surge #004"
              className="w-full h-10 px-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-orange-500 focus:outline-none font-medium text-slate-900 transition-all text-xs"
            />
          </div>

          {/* Severity & Assignee Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Severity Picker */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500">
                Priority & Severity
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['critical', 'high', 'medium', 'low'] as const).map((sev) => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setSeverity(sev)}
                    className={`py-2 px-3 rounded-xl border font-bold uppercase text-[10px] tracking-wider transition-all cursor-pointer flex items-center justify-between ${
                      severity === sev
                        ? severityStyles[sev]
                        : 'border-slate-200 bg-slate-50/70 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span>{sev}</span>
                    {severity === sev && <Check className="h-3.5 w-3.5" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Assignee Selector */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <User className="h-3.5 w-3.5 text-slate-400" />
                <span>Assign Lead Investigator</span>
              </label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-orange-500 focus:outline-none font-mono text-xs text-slate-800 cursor-pointer"
              >
                {INVESTIGATORS.map((inv) => (
                  <option key={inv.value} value={inv.value}>
                    {inv.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Fraud Typology Tags */}
          <div className="space-y-2">
            <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-slate-400" />
              <span>Fraud Typology Tags ({selectedTags.length} selected)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_TAGS.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-mono transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-orange-500 text-white border-orange-600 shadow-sm font-bold'
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200/80'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Mitigation Rules */}
          <div className="p-4 rounded-2xl border border-orange-200/90 bg-gradient-to-br from-orange-50/40 via-amber-50/20 to-white space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-mono font-bold uppercase tracking-wider text-orange-950 flex items-center gap-1.5">
                <Sparkle className="h-3.5 w-3.5 text-orange-500" />
                <span>Instant Mitigation & Active Defense Rules</span>
              </h4>
              <span className="text-[10px] font-mono text-orange-700 font-semibold">Zero-Latency Enforcement</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Block Device */}
              <label
                onClick={() => toggleMitigation('device_blocked')}
                className={`p-2.5 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                  mitigations.device_blocked
                    ? 'border-orange-300 bg-white shadow-sm ring-1 ring-orange-400/30'
                    : 'border-slate-200/80 bg-slate-50/60 opacity-75'
                }`}
              >
                <input
                  type="checkbox"
                  checked={mitigations.device_blocked}
                  onChange={() => {}}
                  className="mt-0.5 rounded text-orange-600 focus:ring-orange-500"
                />
                <div className="min-w-0">
                  <p className="font-bold text-[11px] text-slate-900 flex items-center gap-1">
                    <Smartphone className="h-3 w-3 text-orange-600" />
                    <span>Block Device Fingerprint</span>
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono truncate">
                    {target.deviceId ? `Node: ${target.deviceId.slice(0, 8)}...` : 'Block hardware hash'}
                  </p>
                </div>
              </label>

              {/* Customer Hold */}
              <label
                onClick={() => toggleMitigation('customer_held')}
                className={`p-2.5 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                  mitigations.customer_held
                    ? 'border-orange-300 bg-white shadow-sm ring-1 ring-orange-400/30'
                    : 'border-slate-200/80 bg-slate-50/60 opacity-75'
                }`}
              >
                <input
                  type="checkbox"
                  checked={mitigations.customer_held}
                  onChange={() => {}}
                  className="mt-0.5 rounded text-orange-600 focus:ring-orange-500"
                />
                <div className="min-w-0">
                  <p className="font-bold text-[11px] text-slate-900 flex items-center gap-1">
                    <Lock className="h-3 w-3 text-rose-600" />
                    <span>Hold Settlement & 3DS</span>
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono truncate">
                    Freeze customer wallet & force 3DS
                  </p>
                </div>
              </label>

              {/* Throttle IP */}
              <label
                onClick={() => toggleMitigation('ip_throttled')}
                className={`p-2.5 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                  mitigations.ip_throttled
                    ? 'border-orange-300 bg-white shadow-sm ring-1 ring-orange-400/30'
                    : 'border-slate-200/80 bg-slate-50/60 opacity-75'
                }`}
              >
                <input
                  type="checkbox"
                  checked={mitigations.ip_throttled}
                  onChange={() => {}}
                  className="mt-0.5 rounded text-orange-600 focus:ring-orange-500"
                />
                <div className="min-w-0">
                  <p className="font-bold text-[11px] text-slate-900 flex items-center gap-1">
                    <Globe className="h-3 w-3 text-amber-600" />
                    <span>Throttle IP Subnet</span>
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono truncate">
                    Enforce strict velocity limits
                  </p>
                </div>
              </label>

              {/* Dispatch Webhook */}
              <label
                onClick={() => toggleMitigation('merchant_notified')}
                className={`p-2.5 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                  mitigations.merchant_notified
                    ? 'border-orange-300 bg-white shadow-sm ring-1 ring-orange-400/30'
                    : 'border-slate-200/80 bg-slate-50/60 opacity-75'
                }`}
              >
                <input
                  type="checkbox"
                  checked={mitigations.merchant_notified}
                  onChange={() => {}}
                  className="mt-0.5 rounded text-orange-600 focus:ring-orange-500"
                />
                <div className="min-w-0">
                  <p className="font-bold text-[11px] text-slate-900 flex items-center gap-1">
                    <Bell className="h-3 w-3 text-blue-600" />
                    <span>Dispatch Merchant Webhook</span>
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono truncate">
                    Push alert to merchant webhook
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Analyst Notes */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <FileText className="h-3.5 w-3.5 text-slate-400" />
              <span>Analyst Rationale & Investigation Notes</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Provide investigation context, suspicious patterns, or compliance reasons..."
              className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-orange-500 focus:outline-none font-sans text-xs text-slate-900 transition-all resize-none"
            />
          </div>

          {/* Modal Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 transition-all text-xs cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>

            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting}
              className="px-5 py-2.5 font-bold shadow-lg shadow-orange-500/20 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  <span>Escalating Case...</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="h-4 w-4 mr-1.5" />
                  <span>Confirm & Escalate Case</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
