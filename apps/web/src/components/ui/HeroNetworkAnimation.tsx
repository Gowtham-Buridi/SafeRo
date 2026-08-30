import React, { useEffect, useRef } from 'react';

interface Node3D {
  x: number;
  y: number;
  z: number;
  type: 'hub' | 'satellite' | 'lattice' | 'beacon';
  color: string;
  size: number;
  pulseOffset: number;
}

interface Edge3D {
  p1: number;
  p2: number;
  color: string;
  dashed?: boolean;
  opacityMultiplier?: number;
}

export function HeroNetworkAnimation({ className = 'h-[540px] w-full' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof canvas.getContext !== 'function') return;

    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      return;
    }
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.offsetWidth * window.devicePixelRatio || 1200);
    let height = (canvas.height = canvas.offsetHeight * window.devicePixelRatio || 540);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth * window.devicePixelRatio || 1200;
      height = canvas.height = canvas.offsetHeight * window.devicePixelRatio || 540;
    };

    window.addEventListener('resize', handleResize);

    // Mouse parallax tracking
    let rotX = 0.16;
    let rotY = 0;
    let mouseX = 0;
    let mouseY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      mouseX = x * 0.45;
      mouseY = y * 0.35;
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Large Expansive 3D Geodesic & SafeRo Cluster Sphere
    const radius = Math.min(width, height) * 0.52;
    const nodes: Node3D[] = [];
    const edges: Edge3D[] = [];

    // 1. Golden Ratio 12-vertex Icosahedron Base with Subdivided Midpoints
    const phi = (1 + Math.sqrt(5)) / 2;
    const rawVertices = [
      [-1, phi, 0],
      [1, phi, 0],
      [-1, -phi, 0],
      [1, -phi, 0],
      [0, -1, phi],
      [0, 1, phi],
      [0, -1, -phi],
      [0, 1, -phi],
      [phi, 0, -1],
      [phi, 0, 1],
      [-phi, 0, -1],
      [-phi, 0, 1],
    ];

    // Build geodesic sphere vertices
    rawVertices.forEach(([vx, vy, vz], idx) => {
      if (vx === undefined || vy === undefined || vz === undefined) return;
      const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      const nx = (vx / len) * radius;
      const ny = (vy / len) * radius;
      const nz = (vz / len) * radius;

      // Hub nodes placed at prominent vertices
      const isHub = idx % 2 === 0;

      nodes.push({
        x: nx,
        y: ny,
        z: nz,
        type: isHub ? 'hub' : 'lattice',
        color: isHub ? '#0f172a' : '#6366f1',
        size: isHub ? 7 * window.devicePixelRatio : 3.5 * window.devicePixelRatio,
        pulseOffset: Math.random() * Math.PI * 2,
      });

      // Spawn 4 radiating satellite nodes (SafeRo logo signature geometry)
      if (isHub) {
        const hubIndex = nodes.length - 1;
        const spread = radius * 0.28;

        for (let s = 0; s < 4; s++) {
          const angle = (s * Math.PI) / 2 + 0.35;
          const sx = nx + spread * Math.cos(angle);
          const sy = ny + spread * Math.sin(angle);
          const sz = nz + spread * 0.35 * Math.sin(angle * 2);

          const sLen = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
          const satNodeIndex = nodes.length;

          nodes.push({
            x: (sx / sLen) * (radius * 1.08),
            y: (sy / sLen) * (radius * 1.08),
            z: (sz / sLen) * (radius * 1.08),
            type: 'satellite',
            color: s % 2 === 0 ? '#ea580c' : '#f97316',
            size: 4.2 * window.devicePixelRatio,
            pulseOffset: (s * Math.PI) / 2,
          });

          // Connect hub to its 4 satellites with solid orange stems
          edges.push({
            p1: hubIndex,
            p2: satNodeIndex,
            color: '#ea580c',
            opacityMultiplier: 1.2,
          });
        }
      }
    });

    // 2. Add Geodesic Polyhedron Lattice Edges between main nodes
    for (let i = 0; i < nodes.length; i++) {
      const nodeI = nodes[i];
      if (!nodeI || nodeI.type === 'satellite') continue;

      for (let j = i + 1; j < nodes.length; j++) {
        const nodeJ = nodes[j];
        if (!nodeJ || nodeJ.type === 'satellite') continue;

        const dx = nodeI.x - nodeJ.x;
        const dy = nodeI.y - nodeJ.y;
        const dz = nodeI.z - nodeJ.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Connect neighboring vertices across geodesic sphere
        if (dist > radius * 0.65 && dist < radius * 1.35) {
          edges.push({
            p1: i,
            p2: j,
            color: '#6366f1',
            dashed: true,
            opacityMultiplier: 0.6,
          });
        }
      }
    }

    const fov = 520 * window.devicePixelRatio;
    let pulseGlobal = 0;

    const render = () => {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      // Autonomous smooth continuous 3D rotation
      rotY += 0.0028;
      rotX += 0.0009;
      pulseGlobal += 0.03;

      const currentRotX = rotX + mouseY;
      const currentRotY = rotY + mouseX;

      const cosY = Math.cos(currentRotY);
      const sinY = Math.sin(currentRotY);
      const cosX = Math.cos(currentRotX);
      const sinX = Math.sin(currentRotX);

      // ─── 3D Celestial Orbital Rings ───────────────────────────
      const ringRadius = radius * 1.38;
      ctx.save();
      ctx.translate(width / 2, height / 2);

      // Orbital Ring 1 (Tilted warm saffron ellipse)
      ctx.save();
      ctx.rotate(currentRotY * 0.25 + 0.3);
      ctx.beginPath();
      ctx.ellipse(0, 0, ringRadius, ringRadius * 0.38, 0.45, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(234, 88, 12, 0.18)';
      ctx.lineWidth = 1.2 * window.devicePixelRatio;
      ctx.stroke();

      // Orbital Beacon Dot 1 traveling on Ring 1
      const beaconAngle1 = pulseGlobal * 0.6;
      const bx1 = ringRadius * Math.cos(beaconAngle1);
      const by1 = ringRadius * 0.38 * Math.sin(beaconAngle1);
      ctx.beginPath();
      ctx.arc(bx1, by1, 3.5 * window.devicePixelRatio, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(234, 88, 12, 0.85)';
      ctx.shadowColor = '#ea580c';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();

      // Orbital Ring 2 (Counter-tilted sovereign indigo ellipse)
      ctx.save();
      ctx.rotate(-currentRotY * 0.2 - 0.4);
      ctx.beginPath();
      ctx.ellipse(0, 0, ringRadius * 1.15, ringRadius * 0.32, -0.6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.16)';
      ctx.lineWidth = 1.2 * window.devicePixelRatio;
      ctx.stroke();

      // Orbital Beacon Dot 2 traveling on Ring 2
      const beaconAngle2 = -pulseGlobal * 0.5 + 1.5;
      const bx2 = ringRadius * 1.15 * Math.cos(beaconAngle2);
      const by2 = ringRadius * 0.32 * Math.sin(beaconAngle2);
      ctx.beginPath();
      ctx.arc(bx2, by2, 3 * window.devicePixelRatio, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(99, 102, 241, 0.8)';
      ctx.shadowColor = '#6366f1';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();

      ctx.restore();

      // ─── 3D Perspective Projection ────────────────────────────
      const projected = nodes.map((node) => {
        // Rotate around Y
        let x1 = node.x * cosY - node.z * sinY;
        let z1 = node.z * cosY + node.x * sinY;

        // Rotate around X
        let y1 = node.y * cosX - z1 * sinX;
        let z2 = z1 * cosX + node.y * sinX;

        const scale = fov / (fov + z2 + radius * 1.4);
        const projX = x1 * scale + width / 2;
        const projY = y1 * scale + height / 2;
        const depthAlpha = Math.max(0.12, Math.min(0.95, (z2 + radius) / (radius * 2)));

        return {
          ...node,
          projX,
          projY,
          scale,
          alpha: depthAlpha,
          z: z2,
        };
      });

      // Depth sorting
      const sortedIndices = Array.from(nodes.keys()).sort((a, b) => {
        const pA = projected[a];
        const pB = projected[b];
        return (pA?.z || 0) - (pB?.z || 0);
      });

      // ─── Render 3D Edges ─────────────────────────────────────
      edges.forEach((edge) => {
        const p1 = projected[edge.p1];
        const p2 = projected[edge.p2];
        if (!p1 || !p2 || !ctx) return;

        const avgAlpha = (p1.alpha + p2.alpha) / 2;
        const mult = edge.opacityMultiplier || 1.0;

        ctx.beginPath();
        ctx.moveTo(p1.projX, p1.projY);
        ctx.lineTo(p2.projX, p2.projY);

        if (edge.dashed) {
          ctx.setLineDash([5, 7]);
          ctx.strokeStyle = `rgba(99, 102, 241, ${avgAlpha * 0.28 * mult})`;
          ctx.lineWidth = Math.max(0.7, (p1.scale + p2.scale) * 0.75);
        } else {
          ctx.setLineDash([]);
          ctx.strokeStyle = `rgba(234, 88, 12, ${avgAlpha * 0.55 * mult})`;
          ctx.lineWidth = Math.max(1.2, (p1.scale + p2.scale) * 1.4);
        }

        ctx.stroke();
        ctx.setLineDash([]);
      });

      // ─── Render 3D Nodes ─────────────────────────────────────
      sortedIndices.forEach((idx) => {
        const p = projected[idx];
        if (!p || !ctx) return;

        const nodeRadius = Math.max(2.2, p.size * p.scale);
        const pulse = 1 + Math.sin(pulseGlobal + p.pulseOffset) * 0.12;

        if (p.type === 'hub') {
          // Central Core Hub (SafeRo Dark Hub with glowing orange halo)
          ctx.beginPath();
          ctx.arc(p.projX, p.projY, nodeRadius * 2.5 * pulse, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(234, 88, 12, ${p.alpha * 0.28})`;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(p.projX, p.projY, nodeRadius * pulse, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(15, 23, 42, ${Math.max(0.45, p.alpha * 0.98)})`;
          ctx.fill();
          ctx.strokeStyle = `rgba(234, 88, 12, ${p.alpha * 0.95})`;
          ctx.lineWidth = 2.2 * window.devicePixelRatio;
          ctx.stroke();
        } else if (p.type === 'satellite') {
          // Satellite Orange Node (SafeRo Logo Satellites)
          ctx.beginPath();
          ctx.arc(p.projX, p.projY, nodeRadius * 1.8 * pulse, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(249, 115, 22, ${p.alpha * 0.32})`;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(p.projX, p.projY, nodeRadius * pulse, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(234, 88, 12, ${p.alpha * 0.92})`;
          ctx.fill();
        } else {
          // Lattice Geodesic Vertex (Subtle Indigo Micro-Node)
          ctx.beginPath();
          ctx.arc(p.projX, p.projY, nodeRadius * 0.9, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(99, 102, 241, ${p.alpha * 0.85})`;
          ctx.fill();
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center -z-0 select-none ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full opacity-85 transition-opacity duration-1000"
      />
    </div>
  );
}
