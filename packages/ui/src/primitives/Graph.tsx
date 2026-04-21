"use client";

import * as React from "react";
import { cx } from "./cx";
import css from "./graph.module.css";

/* ── Public types ─────────────────────────────────────────────────── */

export interface GraphNode {
  id: string;
  label: string;
  /** Circle radius in px (default 8). */
  size?: number;
  /** Fill colour (CSS string). Falls back to --ddp-color-primary. */
  color?: string;
  /** Optional: categorise the node for legend / colouring. */
  type?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  /** Optional label drawn at the midpoint. */
  label?: string;
}

export interface GraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Fires when a node is clicked. Receives the node id. */
  onNodeClick?: (id: string) => void;
  width?: number;
  height?: number;
  className?: string;
}

/* ── Internal simulation types ────────────────────────────────────── */

interface SimNode {
  id: string;
  label: string;
  size: number;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  edgeCount: number;
}

interface SimEdge {
  sourceIdx: number;
  targetIdx: number;
  label?: string;
}

/* ── Physics constants ────────────────────────────────────────────── */

const REPULSION = 4000;
const ATTRACTION = 0.005;
const EDGE_REST_LENGTH = 120;
const FRICTION = 0.88;
const CENTER_GRAVITY = 0.01;
const MAX_VELOCITY = 15;
const INITIAL_TICKS = 120; // warm-up ticks before first paint

/* ── Helpers ──────────────────────────────────────────────────────── */

function clampVec(vx: number, vy: number, max: number): [number, number] {
  const mag = Math.sqrt(vx * vx + vy * vy);
  if (mag > max) {
    const s = max / mag;
    return [vx * s, vy * s];
  }
  return [vx, vy];
}

function hitTest(
  mx: number,
  my: number,
  nodes: SimNode[],
  transform: { x: number; y: number; k: number },
): SimNode | null {
  // iterate in reverse so top-painted nodes get priority
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i]!;
    const sx = n.x * transform.k + transform.x;
    const sy = n.y * transform.k + transform.y;
    const r = Math.max(n.size, 6) * transform.k + 4; // generous touch target
    const dx = mx - sx;
    const dy = my - sy;
    if (dx * dx + dy * dy < r * r) return n;
  }
  return null;
}

/* ── Component ────────────────────────────────────────────────────── */

export function Graph({
  nodes: inputNodes,
  edges: inputEdges,
  onNodeClick,
  width = 800,
  height = 600,
  className,
}: GraphProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const rafRef = React.useRef<number>(0);
  const simRef = React.useRef<{ nodes: SimNode[]; edges: SimEdge[] }>({
    nodes: [],
    edges: [],
  });
  const transformRef = React.useRef({ x: 0, y: 0, k: 1 });
  const [hovered, setHovered] = React.useState<SimNode | null>(null);
  const [tooltipPos, setTooltipPos] = React.useState<{ x: number; y: number } | null>(null);
  const dragRef = React.useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startTx: number;
    startTy: number;
  }>({ active: false, startX: 0, startY: 0, startTx: 0, startTy: 0 });

  /* ── Build simulation data ─────────────────────────────────────── */

  React.useEffect(() => {
    const idxMap = new Map<string, number>();
    const edgeCounts = new Map<string, number>();

    // Count edges per node
    for (const e of inputEdges) {
      edgeCounts.set(e.source, (edgeCounts.get(e.source) ?? 0) + 1);
      edgeCounts.set(e.target, (edgeCounts.get(e.target) ?? 0) + 1);
    }

    const simNodes: SimNode[] = inputNodes.map((n, i) => {
      idxMap.set(n.id, i);
      // Spread nodes in a circle initially
      const angle = (i / inputNodes.length) * 2 * Math.PI;
      const radius = Math.min(width, height) * 0.35;
      return {
        id: n.id,
        label: n.label,
        size: n.size ?? 8,
        color: n.color ?? "var(--ddp-color-primary)",
        x: Math.cos(angle) * radius + (Math.random() - 0.5) * 20,
        y: Math.sin(angle) * radius + (Math.random() - 0.5) * 20,
        vx: 0,
        vy: 0,
        edgeCount: edgeCounts.get(n.id) ?? 0,
      };
    });

    const simEdges: SimEdge[] = [];
    for (const e of inputEdges) {
      const si = idxMap.get(e.source);
      const ti = idxMap.get(e.target);
      if (si !== undefined && ti !== undefined) {
        simEdges.push({ sourceIdx: si, targetIdx: ti, label: e.label });
      }
    }

    // Warm-up: run physics without rendering
    for (let tick = 0; tick < INITIAL_TICKS; tick++) {
      stepPhysics(simNodes, simEdges, width, height);
    }

    simRef.current = { nodes: simNodes, edges: simEdges };

    // Center transform
    transformRef.current = { x: width / 2, y: height / 2, k: 1 };
    if (simNodes.length > 0) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const n of simNodes) {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
      }
      const graphW = maxX - minX || 1;
      const graphH = maxY - minY || 1;
      const k = Math.min(1, (width - 80) / graphW, (height - 80) / graphH);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      transformRef.current = { x: width / 2 - cx * k, y: height / 2 - cy * k, k };
    }
  }, [inputNodes, inputEdges, width, height]);

  /* ── Animation loop ────────────────────────────────────────────── */

  React.useEffect(() => {
    let running = true;
    let tickCount = 0;

    function loop() {
      if (!running) return;
      const { nodes, edges } = simRef.current;

      // Continue physics for a while, then slow down
      if (tickCount < 600) {
        stepPhysics(nodes, edges, width, height);
        tickCount++;
      } else if (tickCount % 10 === 0) {
        // Occasional tick to keep layout alive
        stepPhysics(nodes, edges, width, height);
      }
      tickCount++;

      draw();
      rafRef.current = requestAnimationFrame(loop);
    }

    function draw() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
      }

      const { nodes, edges } = simRef.current;
      const t = transformRef.current;

      ctx.clearRect(0, 0, width, height);

      const hoveredId = hovered?.id ?? null;
      const connectedToHovered = new Set<string>();
      const hoveredEdgeIndices = new Set<number>();

      if (hoveredId) {
        for (let i = 0; i < edges.length; i++) {
          const e = edges[i]!;
          const srcId = nodes[e.sourceIdx]!.id;
          const tgtId = nodes[e.targetIdx]!.id;
          if (srcId === hoveredId || tgtId === hoveredId) {
            connectedToHovered.add(srcId);
            connectedToHovered.add(tgtId);
            hoveredEdgeIndices.add(i);
          }
        }
      }

      // Draw edges
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i]!;
        const s = nodes[e.sourceIdx]!;
        const tgt = nodes[e.targetIdx]!;
        const sx = s.x * t.k + t.x;
        const sy = s.y * t.k + t.y;
        const tx = tgt.x * t.k + t.x;
        const ty = tgt.y * t.k + t.y;

        const isHighlit = hoveredEdgeIndices.has(i);
        const dimmed = hoveredId !== null && !isHighlit;

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
        ctx.strokeStyle = dimmed
          ? "rgba(130, 117, 104, 0.08)"
          : isHighlit
          ? "rgba(122, 79, 1, 0.7)"
          : "rgba(130, 117, 104, 0.2)";
        ctx.lineWidth = isHighlit ? 2 : 1;
        ctx.stroke();

        // Arrowhead
        if (t.k > 0.3) {
          const angle = Math.atan2(ty - sy, tx - sx);
          const targetR = (tgt.size ?? 8) * t.k;
          const ax = tx - Math.cos(angle) * (targetR + 4);
          const ay = ty - Math.sin(angle) * (targetR + 4);
          const arrowLen = isHighlit ? 8 : 6;
          const arrowW = isHighlit ? 4 : 3;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(
            ax - Math.cos(angle - 0.3) * arrowLen,
            ay - Math.sin(angle - 0.3) * arrowLen,
          );
          ctx.moveTo(ax, ay);
          ctx.lineTo(
            ax - Math.cos(angle + 0.3) * arrowLen,
            ay - Math.sin(angle + 0.3) * arrowLen,
          );
          ctx.strokeStyle = dimmed
            ? "rgba(130, 117, 104, 0.08)"
            : isHighlit
            ? "rgba(122, 79, 1, 0.7)"
            : "rgba(130, 117, 104, 0.25)";
          ctx.lineWidth = isHighlit ? 2 : 1;
          ctx.stroke();
        }

        // Edge label
        if (e.label && t.k > 0.5 && (isHighlit || !hoveredId)) {
          const mx = (sx + tx) / 2;
          const my = (sy + ty) / 2;
          ctx.font = `${Math.max(9, 10 * t.k)}px Inter, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillStyle = dimmed
            ? "rgba(130, 117, 104, 0.15)"
            : "rgba(79, 69, 55, 0.6)";
          ctx.fillText(e.label, mx, my - 3);
        }
      }

      // Draw nodes
      for (const n of nodes) {
        const nx = n.x * t.k + t.x;
        const ny = n.y * t.k + t.y;
        const r = n.size * t.k;

        const isHovered = n.id === hoveredId;
        const isConnected = connectedToHovered.has(n.id);
        const dimmed = hoveredId !== null && !isHovered && !isConnected;

        // Glow for hovered node
        if (isHovered) {
          ctx.beginPath();
          ctx.arc(nx, ny, r + 6, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(122, 79, 1, 0.15)";
          ctx.fill();
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(nx, ny, r, 0, Math.PI * 2);
        ctx.fillStyle = dimmed ? "rgba(130, 117, 104, 0.15)" : n.color;
        ctx.fill();

        if (isHovered || isConnected) {
          ctx.strokeStyle = isHovered ? "#7a4f01" : "rgba(122, 79, 1, 0.4)";
          ctx.lineWidth = isHovered ? 2.5 : 1.5;
          ctx.stroke();
        }

        // Label
        if (t.k > 0.35 && r > 3) {
          const fontSize = Math.max(9, Math.min(13, r * 1.2));
          ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle = dimmed
            ? "rgba(31, 27, 22, 0.12)"
            : isHovered
            ? "#1f1b16"
            : "rgba(31, 27, 22, 0.72)";
          ctx.fillText(n.label, nx, ny + r + 3, 100);
        }
      }
    }

    loop();
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
    // Re-run if hovered changes, to update highlight rendering
  }, [width, height, hovered]);

  /* ── Interaction handlers ──────────────────────────────────────── */

  const handleMouseMove = React.useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (dragRef.current.active) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        transformRef.current.x = dragRef.current.startTx + dx;
        transformRef.current.y = dragRef.current.startTy + dy;
        return;
      }

      const node = hitTest(mx, my, simRef.current.nodes, transformRef.current);
      setHovered(node);
      setTooltipPos(node ? { x: mx, y: my } : null);
    },
    [],
  );

  const handleMouseDown = React.useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      dragRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        startTx: transformRef.current.x,
        startTy: transformRef.current.y,
      };
    },
    [],
  );

  const handleMouseUp = React.useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const wasDrag =
        Math.abs(e.clientX - dragRef.current.startX) > 4 ||
        Math.abs(e.clientY - dragRef.current.startY) > 4;
      dragRef.current.active = false;

      if (!wasDrag && onNodeClick) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const node = hitTest(mx, my, simRef.current.nodes, transformRef.current);
        if (node) onNodeClick(node.id);
      }
    },
    [onNodeClick],
  );

  const handleMouseLeave = React.useCallback(() => {
    dragRef.current.active = false;
    setHovered(null);
    setTooltipPos(null);
  }, []);

  const handleWheel = React.useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const t = transformRef.current;
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      const newK = Math.max(0.05, Math.min(5, t.k * factor));

      // zoom towards cursor
      t.x = mx - (mx - t.x) * (newK / t.k);
      t.y = my - (my - t.y) * (newK / t.k);
      t.k = newK;
    },
    [],
  );

  const zoomIn = React.useCallback(() => {
    const t = transformRef.current;
    const factor = 1.3;
    const cx = width / 2;
    const cy = height / 2;
    const newK = Math.min(5, t.k * factor);
    t.x = cx - (cx - t.x) * (newK / t.k);
    t.y = cy - (cy - t.y) * (newK / t.k);
    t.k = newK;
  }, [width, height]);

  const zoomOut = React.useCallback(() => {
    const t = transformRef.current;
    const factor = 1 / 1.3;
    const cx = width / 2;
    const cy = height / 2;
    const newK = Math.max(0.05, t.k * factor);
    t.x = cx - (cx - t.x) * (newK / t.k);
    t.y = cy - (cy - t.y) * (newK / t.k);
    t.k = newK;
  }, [width, height]);

  const resetView = React.useCallback(() => {
    const nodes = simRef.current.nodes;
    if (nodes.length === 0) {
      transformRef.current = { x: width / 2, y: height / 2, k: 1 };
      return;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    const graphW = maxX - minX || 1;
    const graphH = maxY - minY || 1;
    const k = Math.min(1, (width - 80) / graphW, (height - 80) / graphH);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    transformRef.current = { x: width / 2 - cx * k, y: height / 2 - cy * k, k };
  }, [width, height]);

  /* ── Render ────────────────────────────────────────────────────── */

  return (
    <div className={cx(css.root, className)} style={{ width, height }}>
      <canvas
        ref={canvasRef}
        className={css.canvas}
        width={width}
        height={height}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      />

      {/* Tooltip */}
      {hovered && tooltipPos && (
        <div
          className={cx(css.tooltip, css.tooltipVisible)}
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          {hovered.label}
          {hovered.edgeCount > 0 && (
            <span style={{ opacity: 0.6 }}> ({hovered.edgeCount} connections)</span>
          )}
        </div>
      )}

      {/* Controls */}
      <div className={css.controls}>
        <button className={css.controlBtn} onClick={zoomIn} title="Zoom in">
          +
        </button>
        <button className={css.controlBtn} onClick={zoomOut} title="Zoom out">
          &minus;
        </button>
        <button className={css.controlBtn} onClick={resetView} title="Reset view" style={{ fontSize: 13 }}>
          &#8634;
        </button>
      </div>
    </div>
  );
}

/* ── Physics step ─────────────────────────────────────────────────── */

function stepPhysics(
  nodes: SimNode[],
  edges: SimEdge[],
  _width: number,
  _height: number,
) {
  const n = nodes.length;

  // Repulsion (all pairs — use Barnes-Hut for 1000+ if needed,
  // but quadratic is fine for ~200)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      const distSq = dx * dx + dy * dy;
      const minDist = 1;
      const dist = Math.max(Math.sqrt(distSq), minDist);
      const force = REPULSION / (dist * dist);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
  }

  // Attraction along edges (spring)
  for (const e of edges) {
    const s = nodes[e.sourceIdx]!;
    const t = nodes[e.targetIdx]!;
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const displacement = dist - EDGE_REST_LENGTH;
    const force = ATTRACTION * displacement;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    s.vx += fx;
    s.vy += fy;
    t.vx -= fx;
    t.vy -= fy;
  }

  // Center gravity — pull toward origin
  for (let i = 0; i < n; i++) {
    const nd = nodes[i]!;
    nd.vx -= nd.x * CENTER_GRAVITY;
    nd.vy -= nd.y * CENTER_GRAVITY;
  }

  // Integrate + friction
  for (let i = 0; i < n; i++) {
    const nd = nodes[i]!;
    nd.vx *= FRICTION;
    nd.vy *= FRICTION;
    [nd.vx, nd.vy] = clampVec(nd.vx, nd.vy, MAX_VELOCITY);
    nd.x += nd.vx;
    nd.y += nd.vy;
  }
}
