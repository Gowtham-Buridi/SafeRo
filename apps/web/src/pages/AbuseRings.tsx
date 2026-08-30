import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Network,
  ShieldAlert,
  Users,
  Server,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Fingerprint,
  Radio,
  Sparkle,
  Download,
  Loader2,
  XCircle,
  Trash2,
  Search,
  Copy,
  Check,
  ShieldCheck,
  Zap,
  RefreshCw,
} from 'lucide-react';
import { PageHeader, Card, Badge, Button, Skeleton, ErrorState, EmptyState } from '../components/ui/index.ts';
import { ForceGraph, GraphNode } from '../components/graph/ForceGraph.tsx';
import { EscalationModal } from '../components/EscalationModal.tsx';
import { api } from '../lib/api.ts';

export function AbuseRings() {
  const navigate = useNavigate();
  const [clusters, setClusters] = useState<any[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState<string>('');
  const [clusterDetail, setClusterDetail] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [isEscalating, setIsEscalating] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'evidence' | 'transactions' | 'actions'>('evidence');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const fetchClustersList = () => {
    return api
      .getClusters()
      .then((data) => {
        setClusters(data);
        if (
          data.length > 0 &&
          (!selectedClusterId || !data.some((c: any) => c.id === selectedClusterId))
        ) {
          setSelectedClusterId(data[0].id);
        }
        return data;
      })
      .catch((err) => {
        console.error('Failed to load clusters:', err);
        setBanner({ type: 'error', message: 'Failed to load abuse rings from server.' });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchClustersList();
  }, []);

  useEffect(() => {
    if (!selectedClusterId) return;
    api
      .getClusterDetail(selectedClusterId)
      .then((detail) => {
        setClusterDetail(detail);
        setSelectedNode(null);
      })
      .catch((err) => {
        console.error('Failed to load cluster details:', err);
        setBanner({
          type: 'error',
          message: `Failed to load details for cluster ${selectedClusterId}`,
        });
      });
  }, [selectedClusterId]);

  const handleRescanRadar = () => {
    setIsScanning(true);
    setBanner(null);
    api
      .rescanGraph()
      .then((res) => {
        return fetchClustersList().then((data) => {
          setBanner({
            type: 'success',
            message:
              res?.data?.message ||
              `Graph scan completed — ${data?.length || 8} active abuse rings detected.`,
          });
          setTimeout(() => setBanner(null), 5000);
        });
      })
      .catch((err) => {
        console.error('Graph rescan failed:', err);
        setBanner({
          type: 'error',
          message: `Graph rescan failed: ${err?.message || 'Server error'}.`,
        });
      })
      .finally(() => {
        setIsScanning(false);
      });
  };

  const [isEscalatingModalOpen, setIsEscalatingModalOpen] = useState(false);

  const handleEscalateToCase = () => {
    if (!clusterDetail || isEscalating) return;
    setIsEscalatingModalOpen(true);
  };

  const handleConfirmEscalationModal = async (modalData: any) => {
    if (!clusterDetail) return;
    setIsEscalating(true);
    setBanner(null);

    try {
      await api.createCase({
        cluster_id: clusterDetail.cluster_id,
        title: modalData.title,
        risk_score: clusterDetail.risk_score,
        severity: modalData.severity || clusterDetail.risk_level,
        typology_tags: modalData.typology_tags,
        assigned_to: modalData.assigned_to,
        notes: modalData.notes,
        mitigations: modalData.mitigations,
      });

      setIsEscalatingModalOpen(false);
      setBanner({
        type: 'success',
        message: `Successfully escalated ${clusterDetail.cluster_name} to Risk Cases. Redirecting...`,
      });
      setTimeout(() => {
        navigate('/risk-cases');
      }, 1000);
    } catch (err: any) {
      console.error('Failed to escalate case:', err);
      setBanner({
        type: 'error',
        message: `Failed to escalate case: ${err?.message || 'Server error'}.`,
      });
    } finally {
      setIsEscalating(false);
    }
  };

  const handleUnescalateCluster = () => {
    if (!clusterDetail || isEscalating) return;
    const clusterRingId =
      clusterDetail.ring_id !== undefined ? clusterDetail.ring_id : clusterDetail.cluster_id;
    const targetCaseId = `case_escalated_ring_${clusterRingId}`;

    api
      .deleteCase(targetCaseId)
      .then(() => {
        setBanner({
          type: 'success',
          message: `Successfully unescalated ${clusterDetail.cluster_name} and removed case from queue.`,
        });
        setTimeout(() => setBanner(null), 4000);
      })
      .catch(() => {
        api
          .deleteCase(`case_ring_${clusterRingId}`)
          .then(() => {
            setBanner({
              type: 'success',
              message: `Successfully unescalated ${clusterDetail.cluster_name} and removed case from queue.`,
            });
            setTimeout(() => setBanner(null), 4000);
          })
          .catch((err2) => {
            setBanner({
              type: 'error',
              message: `Failed to unescalate: ${err2?.message || 'Case not found or already removed'}.`,
            });
          });
      });
  };

  const handleExportForensicPack = () => {
    if (!clusterDetail) return;
    try {
      const pack = {
        dossier_title: `SafeRo Evidence Dossier — ${clusterDetail.cluster_name}`,
        export_date: new Date().toISOString(),
        classification: 'FRAUD_INVESTIGATION_EVIDENCE',
        cluster_summary: {
          ring_id: clusterDetail.cluster_id,
          ring_name: clusterDetail.cluster_name,
          risk_score: clusterDetail.risk_score,
          risk_level: clusterDetail.risk_level,
          member_count: clusterDetail.member_count,
          weight_factors: clusterDetail.weight_factors,
        },
        infrastructure_evidence: clusterDetail.evidence,
        subgraph_topology: clusterDetail.graph,
        associated_transactions: clusterDetail.transactions,
      };

      const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `evidence_dossier_ring_${clusterDetail.cluster_id}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setBanner({
        type: 'success',
        message: `Evidence dossier for ${clusterDetail.cluster_name} downloaded successfully.`,
      });
      setTimeout(() => setBanner(null), 4000);
    } catch (err) {
      console.error('Export failed:', err);
      setBanner({ type: 'error', message: 'Failed to generate evidence dossier file.' });
    }
  };

  const filteredClusters = clusters.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.cluster_name?.toLowerCase().includes(q) ||
      c.id?.toLowerCase().includes(q) ||
      c.risk_level?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* 1. Clear Page Header */}
      <PageHeader
        tag="FRAUD RING DETECTION"
        title="Abuse Rings Radar"
        description="Interactive graph mapping of colluding accounts, shared hardware fingerprints, and suspicious payment networks across your platform."
        actions={
          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-mono text-slate-700 shadow-2xs">
              <span className="h-2 w-2 rounded-full bg-orange-500 animate-ping" />
              <span>{clusters.length} Rings Active</span>
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={handleRescanRadar}
              disabled={isScanning}
              className="cursor-pointer"
            >
              {isScanning ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-400" />
                  <span>Scanning Graph...</span>
                </>
              ) : (
                <>
                  <Radio className="h-3.5 w-3.5 text-orange-400" />
                  <span>Rescan Graph</span>
                </>
              )}
            </Button>
          </div>
        }
      />

      {/* Full Error State (when initial load fails completely) */}
      {banner?.type === 'error' && clusters.length === 0 && (
        <ErrorState
          title="Could not connect to abuse ring radar"
          message={banner.message}
          onRetry={fetchClustersList}
          isRetrying={loading}
        />
      )}

      {/* Compact Error Banner (when background action encounters issue) */}
      {banner?.type === 'error' && clusters.length > 0 && (
        <ErrorState
          compact={true}
          title="Radar action error"
          message={banner.message}
          onRetry={fetchClustersList}
          isRetrying={loading}
        />
      )}

      {/* Success Notification Banner */}
      {banner && banner.type === 'success' && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 flex items-center justify-between shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{banner.message}</span>
          </div>
          <button
            onClick={() => setBanner(null)}
            className="font-bold px-2 py-0.5 cursor-pointer opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main 2-Column Equal-Height Hero Workbench Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
        {/* Left Sidebar (4 cols): Rings Navigator */}
        <div className="lg:col-span-4 rounded-3xl border border-slate-200/90 bg-slate-50/50 p-4 shadow-sm flex flex-col h-[820px]">
          {/* Sidebar Top Area */}
          <div className="space-y-3 pb-3 border-b border-slate-200/80 mb-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-900 font-mono flex items-center gap-1.5">
                <Network className="h-4 w-4 text-orange-600" />
                <span>Detected Rings ({clusters.length})</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400">High Risk Syndicates</span>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search rings or IDs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8 pl-8 pr-3 text-xs rounded-xl border border-slate-200 bg-white focus:bg-white focus:border-orange-500 focus:outline-none"
              />
            </div>
          </div>

          {/* List of Rings with Guaranteed Equal Height Cards */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
            {loading && clusters.length === 0 ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-2xl border border-slate-200 bg-white p-3.5 h-[116px] shadow-xs flex flex-col justify-between animate-pulse">
                    <div className="flex items-center justify-between">
                      <Skeleton variant="text" className="w-28 h-4" />
                      <Skeleton variant="text" className="w-14 h-4" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton variant="text" className="w-20 h-3" />
                      <Skeleton variant="text" className="w-16 h-3" />
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <Skeleton variant="text" className="w-20 h-3" />
                      <Skeleton variant="text" className="w-14 h-3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredClusters.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-slate-200 rounded-2xl bg-white space-y-2">
                <div className="h-9 w-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
                  <ShieldCheck className="h-4.5 w-4.5" />
                </div>
                <p className="text-xs font-bold text-slate-800">No Abuse Rings Detected</p>
                <p className="text-[10px] text-slate-500 leading-relaxed font-sans">
                  {searchQuery ? 'No rings match your search query.' : 'Your store graph is clean. No device sharing or proxy collisions found.'}
                </p>
              </div>
            ) : (
              filteredClusters.map((cluster) => {
                const isSelected = selectedClusterId === cluster.id;
                const riskPercent = Math.round(cluster.risk_score * 100);
                const isCritical = riskPercent >= 90;

                return (
                  <div
                    key={cluster.id}
                    onClick={() => setSelectedClusterId(cluster.id)}
                    className={`cursor-pointer rounded-2xl border p-3.5 transition-all duration-150 flex flex-col justify-between h-[116px] ${
                      isSelected
                        ? 'border-orange-500 bg-gradient-to-br from-orange-50/90 via-white to-amber-50/30 shadow-md shadow-orange-500/10 ring-2 ring-orange-500/20'
                        : 'border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-xs'
                    }`}
                  >
                    {/* Card Header */}
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-sm text-slate-950 font-display-serif">
                        {cluster.cluster_name}
                      </span>
                      <Badge variant={isCritical ? 'danger' : 'warning'}>
                        {isCritical ? 'Critical' : 'High'}
                      </Badge>
                    </div>

                    {/* Threat Indicator Badges */}
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-mono font-medium">
                        📱 Shared Device
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-mono font-medium">
                        🌐 VPN Proxy
                      </span>
                    </div>

                    {/* Card Equal Footer */}
                    <div className="flex items-center justify-between text-xs text-slate-500 font-mono pt-2 border-t border-slate-100/80">
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-slate-400" /> {cluster.member_count} Accounts
                      </span>
                      <span className="font-black text-rose-600">
                        {riskPercent}% Risk
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Stage (8 cols): Hero Graph Radar + Detail Tabs */}
        <div className="lg:col-span-8 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-5 flex flex-col h-[820px] overflow-y-auto">
          {clusters.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 my-auto">
              <div className="relative">
                <div className="h-16 w-16 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center shadow-inner">
                  <Network className="h-8 w-8 text-orange-600" />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-orange-400/40 animate-ping" />
              </div>

              <div className="max-w-md space-y-1.5">
                <h3 className="text-base font-extrabold text-slate-950 font-display-serif">
                  Graph Radar Standby · Store Network Clean
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Live scoring matches incoming transactions against known abuse ring infrastructure in real time. Detecting a <strong>new</strong> coordinated syndicate as it emerges requires running Louvain community detection across historical graph edges.
                </p>
                <div className="rounded-xl border border-slate-200 bg-white/90 p-2.5 text-[11px] text-slate-600 font-mono text-left space-y-1 mt-2">
                  <div className="flex items-center gap-1.5 text-orange-600 font-bold">
                    <Zap className="h-3 w-3" />
                    <span>Real-Time Matching vs. Periodic Re-Clustering</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal font-sans">
                    Webhook scoring evaluates transactions synchronously (&lt;100ms). Full graph community detection executes periodically in batch or on-demand via <strong>Rescan Topology</strong>.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRescanRadar}
                  disabled={isScanning}
                  className="cursor-pointer font-bold"
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isScanning ? 'animate-spin' : ''}`} />
                  <span>Rescan Topology</span>
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Top Header over Graph */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-extrabold text-slate-950 font-display-serif">
                      {clusterDetail?.cluster_name || 'Abuse Ring Topology'}
                    </h2>
                    <Badge variant={clusterDetail?.risk_level === 'critical' ? 'danger' : 'warning'}>
                      {clusterDetail?.risk_level ? `${clusterDetail.risk_level.toUpperCase()} SEVERITY` : 'CRITICAL SEVERITY'}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    {clusterDetail?.member_count || 0} colluding customer accounts connected to shared infrastructure
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-2xl font-black text-rose-600 font-mono">
                      {((clusterDetail?.risk_score ?? 0.88) * 100).toFixed(0)}%
                    </span>
                    <p className="text-[10px] uppercase font-bold text-slate-400 font-mono">
                      Risk Score
                    </p>
                  </div>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleEscalateToCase}
                    disabled={isEscalating || !clusterDetail}
                    className="cursor-pointer shadow-sm"
                  >
                    <ShieldAlert className="h-3.5 w-3.5 mr-1" />
                    <span>Escalate to Case</span>
                  </Button>
                </div>
              </div>

              {/* D3 Force Graph Canvas */}
              {clusterDetail?.graph ? (
                <ForceGraph
                  nodes={clusterDetail.graph.nodes}
                  links={clusterDetail.graph.links}
                  selectedNodeId={selectedNode?.id}
                  onSelectNode={(n) => setSelectedNode(n)}
                  height={440}
                />
              ) : (
                <div className="h-[440px] flex items-center justify-center border border-dashed border-slate-200 rounded-2xl bg-slate-50">
                  <div className="text-center space-y-2">
                    <Loader2 className="h-6 w-6 animate-spin text-orange-500 mx-auto" />
                    <p className="text-xs text-slate-500 font-mono">Loading graph radar topology...</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Interactive Selected Node Inspector Drawer */}
          {selectedNode && (
            <div className="rounded-2xl border border-orange-200 bg-orange-50/90 p-3.5 text-xs flex flex-wrap items-center justify-between gap-3 shadow-sm animate-in fade-in duration-200">
              <div className="flex items-center gap-2.5">
                <div className="h-2.5 w-2.5 rounded-full bg-orange-600 animate-ping" />
                <div>
                  <span className="font-bold text-slate-900 font-mono text-xs">{selectedNode.name}</span>
                  <span className="text-slate-600 ml-2 capitalize font-mono text-[11px]">
                    (Type: {selectedNode.type.replace('_', ' ')})
                  </span>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Entity ID: <code className="bg-white/80 px-1 py-0.5 rounded text-slate-800">{selectedNode.id}</code>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const query = `Inspect entity ${selectedNode.name} (${selectedNode.id}) in Abuse Ring #${clusterDetail?.cluster_id}: What is the risk telemetry, device profile, and transaction history?`;
                    navigate(`/investigation?q=${encodeURIComponent(query)}`, {
                      state: { initialQuery: query },
                    });
                  }}
                  className="px-3 py-1 rounded-full bg-white border border-orange-300 text-orange-950 hover:bg-orange-100 font-bold text-xs flex items-center gap-1 cursor-pointer shadow-2xs"
                >
                  <Sparkle className="h-3 w-3 text-orange-500" />
                  <span>Investigate Entity</span>
                </button>
                <Button variant="secondary" size="sm" onClick={() => setSelectedNode(null)}>
                  Dismiss
                </Button>
              </div>
            </div>
          )}

          {/* Structured Detail Tabs below Graph */}
          <div className="space-y-4 pt-1">
            {/* Tab Selector Navigation */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <div className="flex items-center gap-2">
                {[
                  { id: 'evidence', label: 'Why We Flagged This', icon: ShieldCheck },
                  { id: 'transactions', label: `Linked Transactions (${clusterDetail?.transactions?.length || 0})`, icon: CreditCard },
                  { id: 'actions', label: 'Actions & AI', icon: Sparkle },
                ].map((t) => {
                  const Icon = t.icon;
                  const isActive = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveTab(t.id as any)}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-slate-950 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 text-orange-400" />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
                Ring #{clusterDetail?.cluster_id ?? 0}
              </span>
            </div>

            {/* TAB 1: Evidence & Patterns (Equal Height Cards Guaranteed) */}
            {activeTab === 'evidence' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Evidence Card 1: Shared Device */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 flex flex-col justify-between h-[130px]">
                    <div className="flex items-center justify-between text-emerald-700">
                      <div className="flex items-center gap-1.5">
                        <Fingerprint className="h-4 w-4" />
                        <span className="text-xs font-bold">Shared Device</span>
                      </div>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            clusterDetail?.evidence?.shared_device || 'dev_cc6c9367',
                            'dev'
                          )
                        }
                        title="Copy Device ID"
                        className="text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {copiedKey === 'dev' ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs font-mono font-bold text-slate-800 truncate">
                      {clusterDetail?.evidence?.shared_device
                        ? `dev_${clusterDetail.evidence.shared_device.slice(0, 10)}...`
                        : 'dev_cc6c9367...'}
                    </p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      100% collision rate across {clusterDetail?.member_count || 8} distinct buyer accounts.
                    </p>
                  </div>

                  {/* Evidence Card 2: Shared IP / Proxy */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 flex flex-col justify-between h-[130px]">
                    <div className="flex items-center justify-between text-amber-700">
                      <div className="flex items-center gap-1.5">
                        <Server className="h-4 w-4" />
                        <span className="text-xs font-bold">Shared VPN / Proxy</span>
                      </div>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            clusterDetail?.evidence?.shared_ip || 'ip_68978888',
                            'ip'
                          )
                        }
                        title="Copy IP ID"
                        className="text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {copiedKey === 'ip' ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs font-mono font-bold text-slate-800 truncate">
                      {clusterDetail?.evidence?.shared_ip
                        ? `ip_${clusterDetail.evidence.shared_ip.slice(0, 10)}...`
                        : 'ip_68978888...'}
                    </p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Coordinated burst transactions originating from a single datacenter IP subnet.
                    </p>
                  </div>

                  {/* Evidence Card 3: Payment Nexus */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 flex flex-col justify-between h-[130px]">
                    <div className="flex items-center justify-between text-rose-700">
                      <div className="flex items-center gap-1.5">
                        <CreditCard className="h-4 w-4" />
                        <span className="text-xs font-bold">Shared Payment Token</span>
                      </div>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            clusterDetail?.evidence?.shared_pm || 'pm_37718982',
                            'pm'
                          )
                        }
                        title="Copy Payment Token"
                        className="text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {copiedKey === 'pm' ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs font-mono font-bold text-slate-800 truncate">
                      {clusterDetail?.evidence?.shared_pm
                        ? `pm_${clusterDetail.evidence.shared_pm.slice(0, 10)}...`
                        : 'pm_37718982...'}
                    </p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Payment card token rotated across multiple simulated accounts.
                    </p>
                  </div>
                </div>

                {/* Risk Signal Indicators */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono block mb-2">
                    Network Metrics & Collision Factors
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-100">
                      <span className="text-slate-500">Network Density:</span>
                      <span className="font-mono font-bold text-rose-600">
                        {clusterDetail?.weight_factors?.louvain_centrality ?? 0.85}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-100">
                      <span className="text-slate-500">Device Overlap:</span>
                      <span className="font-mono font-bold text-rose-600">
                        {clusterDetail?.weight_factors?.hardware_collision ?? '4.0x'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-100">
                      <span className="text-slate-500">Transaction Speed:</span>
                      <span className="font-mono font-bold text-amber-600">
                        {clusterDetail?.weight_factors?.burst_velocity ?? 0.65}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Linked Transactions */}
            {activeTab === 'transactions' && (
              <div className="space-y-3 animate-in fade-in duration-150">
                <div className="overflow-x-auto max-h-48 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 font-mono uppercase text-[10px] tracking-wider">
                        <th className="pb-2">Transaction ID</th>
                        <th className="pb-2">Amount</th>
                        <th className="pb-2">Payment Method</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {clusterDetail?.transactions && clusterDetail.transactions.length > 0 ? (
                        clusterDetail.transactions.map((tx: any) => (
                          <tr key={tx.transaction_id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 font-mono text-slate-700 font-medium">
                              {tx.transaction_id.slice(0, 14)}...
                            </td>
                            <td className="py-2.5 font-bold text-slate-900 font-mono">
                              INR {tx.amount.toLocaleString()}
                            </td>
                            <td className="py-2.5 capitalize text-slate-600 font-mono">
                              {tx.payment_method_type}
                            </td>
                            <td className="py-2.5">
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
                            <td className="py-2.5 text-slate-500 font-mono text-[11px]">
                              {new Date(tx.created_at).toLocaleDateString()}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400 font-mono">
                            No transactions recorded for this ring.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 3: Actions & AI Analysis */}
            {activeTab === 'actions' && (
              <div className="space-y-3 animate-in fade-in duration-150">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Action 1: Investigate with AI */}
                  <div className="p-3.5 rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50/80 to-amber-50/30 flex flex-col justify-between h-[130px]">
                    <div>
                      <div className="flex items-center gap-1.5 text-orange-950 font-bold text-xs">
                        <Sparkle className="h-4 w-4 text-orange-500" />
                        <span>Investigate Ring with AI</span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                        Run automated AI analysis to explain the ring's collusive behavior and recommended mitigations.
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full justify-center bg-white hover:bg-orange-100/80 border-orange-200 text-orange-950 font-bold cursor-pointer"
                      onClick={() => {
                        if (!clusterDetail) return;
                        const query = `Analyze Abuse Ring #${clusterDetail.ring_id || clusterDetail.cluster_id} (${clusterDetail.cluster_name}): It comprises ${clusterDetail.member_count} coordinated customer accounts sharing device ${clusterDetail.shared_device_id?.slice(0, 10)} and IP ${clusterDetail.shared_ip_id?.slice(0, 10)}. Please provide forensic risk breakdown and recommended mitigation steps.`;
                        navigate(`/investigation?q=${encodeURIComponent(query)}`, {
                          state: { initialQuery: query },
                        });
                      }}
                      disabled={!clusterDetail}
                    >
                      <Sparkle className="h-3.5 w-3.5 mr-1 text-orange-500" />
                      <span>Launch AI Analysis</span>
                    </Button>
                  </div>

                  {/* Action 2: Escalate */}
                  <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col justify-between h-[130px]">
                    <div>
                      <div className="flex items-center gap-1.5 text-slate-900 font-bold text-xs">
                        <ShieldAlert className="h-4 w-4 text-rose-600" />
                        <span>Escalate to Risk Cases</span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                        Open a formal investigation case with pre-filled risk score, checklist items, and defense buttons.
                      </p>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      className="w-full justify-center cursor-pointer"
                      onClick={handleEscalateToCase}
                      disabled={isEscalating || !clusterDetail}
                    >
                      <ShieldAlert className="h-3.5 w-3.5 mr-1 text-orange-400" />
                      <span>Create Risk Case</span>
                    </Button>
                  </div>

                  {/* Action 3: Download Evidence */}
                  <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col justify-between h-[130px]">
                    <div>
                      <div className="flex items-center gap-1.5 text-slate-900 font-bold text-xs">
                        <Download className="h-4 w-4 text-slate-700" />
                        <span>Download Evidence Dossier</span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                        Export a JSON evidence pack containing graph topology, member IDs, and transactions.
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full justify-center cursor-pointer"
                      onClick={handleExportForensicPack}
                      disabled={!clusterDetail}
                    >
                      <Download className="h-3.5 w-3.5 mr-1" />
                      <span>Download JSON</span>
                    </Button>
                  </div>

                  {/* Action 4: Unescalate */}
                  <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col justify-between h-[130px]">
                    <div>
                      <div className="flex items-center gap-1.5 text-rose-800 font-bold text-xs">
                        <Trash2 className="h-4 w-4 text-rose-600" />
                        <span>Unescalate Case</span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                        Remove the escalated case from active risk cases queue if already handled.
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full justify-center text-rose-700 hover:bg-rose-50 border-rose-200 cursor-pointer"
                      onClick={handleUnescalateCluster}
                      disabled={isEscalating || !clusterDetail}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1 text-rose-600" />
                      <span>Unescalate</span>
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Escalation Modal */}
      <EscalationModal
        isOpen={isEscalatingModalOpen}
        onClose={() => setIsEscalatingModalOpen(false)}
        onConfirm={handleConfirmEscalationModal}
        target={
          clusterDetail
            ? {
                type: 'ring',
                id: (clusterDetail.cluster_id !== undefined
                  ? clusterDetail.cluster_id
                  : clusterDetail.ring_id
                ).toString(),
                title: clusterDetail.cluster_name,
                riskScore: clusterDetail.risk_score,
                memberCount: clusterDetail.member_count,
                deviceId: clusterDetail.shared_device_id,
                ipId: clusterDetail.shared_ip_id,
              }
            : null
        }
        isSubmitting={isEscalating}
      />
    </div>
  );
}
