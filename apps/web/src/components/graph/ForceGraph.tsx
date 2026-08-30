import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import {
  RotateCcw,
  ZoomIn,
  ZoomOut,
  ChevronRight,
  Sparkle,
  Users,
  Smartphone,
  Globe,
  CreditCard,
  Layers,
} from 'lucide-react';

export interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  type: 'customer' | 'device' | 'ip' | 'payment_method';
  risk: number;
}

export interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  relationship: string;
  weight: number;
}

interface ForceGraphProps {
  nodes: GraphNode[];
  links: GraphLink[];
  onSelectNode?: (node: GraphNode | null) => void;
  selectedNodeId?: string | null;
  height?: number;
}

export function ForceGraph({
  nodes,
  links,
  onSelectNode,
  selectedNodeId,
  height = 460,
}: ForceGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 800, height });

  // Entity Type Filter States
  const [activeFilters, setActiveFilters] = useState<Record<string, boolean>>({
    customer: true,
    device: true,
    ip: true,
    payment_method: true,
  });

  const toggleFilter = (type: string) => {
    setActiveFilters((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  const getNodeColor = (type: string) => {
    switch (type) {
      case 'customer':
        return '#6366f1'; // Indigo
      case 'device':
        return '#10b981'; // Emerald
      case 'ip':
        return '#f59e0b'; // Amber
      case 'payment_method':
        return '#f43f5e'; // Rose
      default:
        return '#94a3b8';
    }
  };

  const getNodeSize = (type: string) => {
    switch (type) {
      case 'device':
        return 18;
      case 'ip':
        return 17;
      case 'payment_method':
        return 16;
      case 'customer':
      default:
        return 13;
    }
  };

  // Resize observer to ensure responsive graph canvas
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setDimensions({
            width: entry.contentRect.width,
            height: height,
          });
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [height]);

  // Filter nodes & links based on active filter toggles
  const filteredNodes = useMemo(() => {
    return nodes.filter((n) => activeFilters[n.type] !== false);
  }, [nodes, activeFilters]);

  const filteredLinks = useMemo(() => {
    const validNodeIds = new Set(filteredNodes.map((n) => n.id));
    return links.filter((l) => {
      const srcId = typeof l.source === 'object' ? (l.source as any).id : l.source;
      const tgtId = typeof l.target === 'object' ? (l.target as any).id : l.target;
      return validNodeIds.has(srcId) && validNodeIds.has(tgtId);
    });
  }, [links, filteredNodes]);

  // Build connection lookup set for instant highlight
  const connectedNodeIds = useMemo(() => {
    const activeId = hoveredNodeId || selectedNodeId;
    if (!activeId) return null;

    const set = new Set<string>([activeId]);
    for (const l of filteredLinks) {
      const srcId = typeof l.source === 'object' ? (l.source as any).id : l.source;
      const tgtId = typeof l.target === 'object' ? (l.target as any).id : l.target;
      if (srcId === activeId) set.add(tgtId);
      if (tgtId === activeId) set.add(srcId);
    }
    return set;
  }, [hoveredNodeId, selectedNodeId, filteredLinks]);

  useEffect(() => {
    if (!svgRef.current || filteredNodes.length === 0) return;

    const width = dimensions.width || 800;
    const currentHeight = dimensions.height || height;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Defs for glowing filters
    const defs = svg.append('defs');
    const filter = defs
      .append('filter')
      .attr('id', 'radar-glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
    filter.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    const g = svg.append('g');

    // Concentric Radar Grid Rings for subtle high-tech aesthetic
    const radar = g.append('g').attr('class', 'radar-grid').attr('opacity', 0.12);
    [90, 180, 270, 360, 450].forEach((r) => {
      radar
        .append('circle')
        .attr('cx', width / 2)
        .attr('cy', currentHeight / 2)
        .attr('r', r)
        .attr('fill', 'none')
        .attr('stroke', '#6366f1')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3 6');
    });

    // Zoom setup with initial center view
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 3.5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    zoomBehaviorRef.current = zoom;
    svg.call(zoom);

    // Deep clone data to avoid mutation issues across simulation ticks
    const nodesCopy: GraphNode[] = filteredNodes.map((d) => ({ ...d }));
    const linksCopy: GraphLink[] = filteredLinks.map((d) => ({ ...d }));

    // Calibrated, smooth physics simulation with expansive radius
    const simulation = d3
      .forceSimulation<GraphNode>(nodesCopy)
      .force(
        'link',
        d3
          .forceLink<GraphNode, GraphLink>(linksCopy)
          .id((d) => d.id)
          .distance((d) => (d.relationship === 'shares_card' ? 140 : 175))
          .strength(0.5),
      )
      .force('charge', d3.forceManyBody().strength(-340))
      .force('center', d3.forceCenter(width / 2, currentHeight / 2).strength(0.06))
      .force('collision', d3.forceCollide().radius(52).strength(0.95))
      .alphaDecay(0.038)
      .velocityDecay(0.36);

    // Links container
    const link = g
      .append('g')
      .attr('class', 'links-layer')
      .selectAll('line')
      .data(linksCopy)
      .join('line')
      .attr('stroke', (d) => (d.relationship === 'shares_card' ? '#f43f5e' : '#4338ca'))
      .attr('stroke-opacity', 0.55)
      .attr('stroke-width', (d) => Math.max(1.8, Math.min(3.8, d.weight * 1.5)))
      .attr('stroke-dasharray', (d) => (d.relationship === 'shares_card' ? '4 4' : 'none'));

    // Nodes container
    const node = g
      .append('g')
      .attr('class', 'nodes-layer')
      .selectAll('g')
      .data(nodesCopy)
      .join('g')
      .attr('cursor', 'pointer')
      .call(
        d3
          .drag<any, any>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.2).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      );

    // Outer glow aura circle
    node
      .append('circle')
      .attr('class', 'node-aura')
      .attr('r', (d) => getNodeSize(d.type) + 7)
      .attr('fill', (d) => getNodeColor(d.type))
      .attr('fill-opacity', 0.22)
      .attr('filter', 'url(#radar-glow)');

    // Selection Indicator Ring
    node
      .append('circle')
      .attr('class', 'node-select-ring')
      .attr('r', (d) => getNodeSize(d.type) + 4)
      .attr('fill', 'none')
      .attr('stroke', (d) => (d.id === selectedNodeId ? '#f97316' : 'transparent'))
      .attr('stroke-width', 2.5)
      .attr('stroke-dasharray', '3 3');

    // Core circle
    node
      .append('circle')
      .attr('class', 'node-core')
      .attr('r', (d) => getNodeSize(d.type))
      .attr('fill', (d) => getNodeColor(d.type))
      .attr('stroke', (d) => (d.id === selectedNodeId ? '#ffffff' : '#070a14'))
      .attr('stroke-width', (d) => (d.id === selectedNodeId ? 3.5 : 2.5))
      .attr('class', 'transition-all duration-150');

    // Label pill background
    const labelGroup = node
      .append('g')
      .attr('class', 'node-label')
      .attr('transform', (d) => `translate(${getNodeSize(d.type) + 6}, -9)`);

    labelGroup
      .append('rect')
      .attr('rx', 4)
      .attr('ry', 4)
      .attr('fill', '#090d1a')
      .attr('fill-opacity', 0.92)
      .attr('stroke', (d) => (d.id === selectedNodeId ? '#f97316' : '#1e293b'))
      .attr('stroke-width', 1)
      .attr('height', 18)
      .attr('y', -1)
      .attr('width', (d) => Math.max(54, d.name.length * 6.8 + 12));

    labelGroup
      .append('text')
      .text((d) => d.name)
      .attr('x', 6)
      .attr('y', 11.5)
      .attr('fill', (d) => (d.id === selectedNodeId ? '#ffedd5' : '#e2e8f0'))
      .attr('font-size', '10.5px')
      .attr('font-weight', '600')
      .attr('font-family', 'ui-monospace, SFMono-Regular, monospace')
      .attr('pointer-events', 'none');

    // Interaction events
    node
      .on('mouseenter', (_event, d) => {
        setHoveredNodeId(d.id);
      })
      .on('mouseleave', () => {
        setHoveredNodeId(null);
      })
      .on('click', (_event, d) => {
        if (onSelectNode) {
          onSelectNode(d.id === selectedNodeId ? null : d);
        }
      });

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as GraphNode).x!)
        .attr('y1', (d) => (d.source as GraphNode).y!)
        .attr('x2', (d) => (d.target as GraphNode).x!)
        .attr('y2', (d) => (d.target as GraphNode).y!);

      node.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [filteredNodes, filteredLinks, selectedNodeId, dimensions, height]);

  // Update Highlight: Keep all nodes clearly visible, highlight active and connected paths
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);

    if (!connectedNodeIds) {
      // Default state: all nodes 100% visible, links normal
      svg.selectAll('.nodes-layer > g').style('opacity', 1);
      svg.selectAll('.links-layer > line')
        .style('opacity', 0.55)
        .attr('stroke-width', (d: any) => Math.max(1.8, Math.min(3.8, d.weight * 1.5)));
      return;
    }

    // Active state: all nodes stay clearly visible (0.75 for background, 1.0 for connected)
    svg.selectAll('.nodes-layer > g').style('opacity', (d: any) =>
      connectedNodeIds.has(d?.id) ? 1 : 0.7
    );

    // Links: highlight active connected links in bright glowing stroke, keep others visible
    svg
      .selectAll('.links-layer > line')
      .style('opacity', (d: any) => {
        const srcId = typeof d.source === 'object' ? d.source.id : d.source;
        const tgtId = typeof d.target === 'object' ? d.target.id : d.target;
        const activeId = hoveredNodeId || selectedNodeId;
        return srcId === activeId || tgtId === activeId ? 1 : 0.35;
      })
      .attr('stroke', (d: any) => {
        const srcId = typeof d.source === 'object' ? d.source.id : d.source;
        const tgtId = typeof d.target === 'object' ? d.target.id : d.target;
        const activeId = hoveredNodeId || selectedNodeId;
        if (srcId === activeId || tgtId === activeId) {
          return '#f97316'; // Vibrant glowing orange for active connections
        }
        return d.relationship === 'shares_card' ? '#f43f5e' : '#4338ca';
      })
      .attr('stroke-width', (d: any) => {
        const srcId = typeof d.source === 'object' ? d.source.id : d.source;
        const tgtId = typeof d.target === 'object' ? d.target.id : d.target;
        const activeId = hoveredNodeId || selectedNodeId;
        return srcId === activeId || tgtId === activeId ? 3.5 : 1.8;
      });
  }, [connectedNodeIds, hoveredNodeId, selectedNodeId]);

  // Zoom Action Helpers
  const handleZoom = (factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.transition().duration(300).call(zoomBehaviorRef.current.scaleBy as any, factor);
  };

  const handleResetZoom = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.transition().duration(500).call(zoomBehaviorRef.current.transform as any, d3.zoomIdentity);
  };

  const hoveredNode = useMemo(() => {
    if (!hoveredNodeId) return null;
    return nodes.find((n) => n.id === hoveredNodeId) || null;
  }, [hoveredNodeId, nodes]);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-2xl border border-slate-900 bg-[#070b16] shadow-xl select-none"
      style={{ minHeight: height }}
    >
      {/* Background Ambient Glow */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-950/20 via-transparent to-transparent opacity-80" />

      {/* Top Left: Canvas Controls & Zoom Actions */}
      <div className="absolute top-3.5 left-3.5 z-20 flex flex-wrap items-center gap-2">
        <button
          onClick={handleResetZoom}
          title="Reset graph view"
          className="flex items-center gap-1.5 rounded-full border border-white/15 bg-slate-950/80 px-3 py-1 text-xs font-medium text-slate-200 backdrop-blur-md hover:bg-slate-900 hover:border-white/30 transition-all cursor-pointer shadow-md"
        >
          <RotateCcw className="h-3 w-3 text-orange-400" />
          <span>Reset View</span>
        </button>

        <div className="flex items-center rounded-full border border-white/15 bg-slate-950/80 backdrop-blur-md p-0.5 shadow-md">
          <button
            onClick={() => handleZoom(1.3)}
            title="Zoom in"
            className="p-1 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => handleZoom(0.7)}
            title="Zoom out"
            className="p-1 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Top Right: Entity Type Toggle Filters */}
      <div className="absolute top-3.5 right-3.5 z-20 hidden md:flex items-center gap-1 rounded-full border border-white/15 bg-slate-950/80 p-1 backdrop-blur-md shadow-md">
        {[
          { type: 'customer', label: 'Customers', color: 'bg-indigo-500' },
          { type: 'device', label: 'Devices', color: 'bg-emerald-500' },
          { type: 'ip', label: 'IPs', color: 'bg-amber-500' },
          { type: 'payment_method', label: 'Cards', color: 'bg-rose-500' },
        ].map((item) => {
          const isActive = activeFilters[item.type];
          return (
            <button
              key={item.type}
              onClick={() => toggleFilter(item.type)}
              className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium transition-all cursor-pointer ${
                isActive
                  ? 'bg-white/15 text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/5 opacity-50'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${item.color}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Bottom Left: Collapsible Legend Drawer */}
      <div className="absolute bottom-3.5 left-3.5 z-20">
        <div className="rounded-xl border border-white/15 bg-slate-950/90 p-2 backdrop-blur-xl shadow-xl">
          <button
            onClick={() => setLegendOpen(!legendOpen)}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-200 px-1.5 py-0.5 hover:text-white cursor-pointer"
          >
            <ChevronRight
              className={`h-3 w-3 text-orange-400 transition-transform ${
                legendOpen ? 'rotate-90' : ''
              }`}
            />
            <span>Radar Legend</span>
          </button>

          {legendOpen && (
            <div className="mt-1.5 pt-1.5 border-t border-white/10 space-y-1 px-1.5 pb-0.5 text-[10px] text-slate-300 font-mono">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-indigo-500" />
                <span>Customer Account</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>Shared Device</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span>Shared IP / VPN</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                <span>Shared Payment Card</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Hover Card (Bottom Right) */}
      {hoveredNode && !selectedNodeId && (
        <div className="absolute bottom-3.5 right-3.5 z-20 rounded-xl border border-white/20 bg-slate-950/95 p-3 text-xs backdrop-blur-xl shadow-2xl animate-in fade-in duration-150 max-w-xs">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: getNodeColor(hoveredNode.type) }}
            />
            <p className="font-bold text-white font-mono text-xs">{hoveredNode.name}</p>
          </div>
          <p className="text-[10px] text-slate-400 capitalize">
            Type: {hoveredNode.type.replace('_', ' ')}
          </p>
          <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-1.5 text-[10px]">
            <span className="text-slate-400">Threat Level:</span>
            <span className="font-bold text-rose-400 font-mono">
              {(hoveredNode.risk * 100).toFixed(0)}% Risk
            </span>
          </div>
        </div>
      )}

      {/* Interactive D3 Canvas */}
      <svg ref={svgRef} className="w-full" style={{ height: dimensions.height }} />
    </div>
  );
}
