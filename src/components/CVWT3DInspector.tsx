import React, { useState, useEffect, useRef } from "react";
import {
  RotateCcw,
  Layers,
  Eye,
  Maximize2,
  Wind,
  ShieldCheck,
  Activity,
  FileText,
  Sliders,
  Sparkles,
} from "lucide-react";
import { CVWT_DEFAULT_SPECS } from "../data/blueprintData";
import { FilterLayer } from "../types";

interface CVWT3DInspectorProps {
  currentRpm: number;
  filterSaturation: number;
  isTrappingActive: boolean;
  onOpenBlueprintModal: () => void;
}

export const CVWT3DInspector: React.FC<CVWT3DInspectorProps> = ({
  currentRpm,
  filterSaturation,
  isTrappingActive,
  onOpenBlueprintModal,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [viewMode, setViewMode] = useState<"3d_exterior" | "section_aa" | "exploded">("3d_exterior");
  const [selectedLayer, setSelectedLayer] = useState<FilterLayer>(CVWT_DEFAULT_SPECS.filterLayers[1]);
  const [showDimensions, setShowDimensions] = useState<boolean>(true);
  const [showAirflowParticles, setShowAirflowParticles] = useState<boolean>(true);
  const [manualRpmOverride, setManualRpmOverride] = useState<number | null>(null);
  const [orbitAngle, setOrbitAngle] = useState<{ yaw: number; pitch: number }>({ yaw: 0.35, pitch: 0.15 });
  const [zoom, setZoom] = useState<number>(1.0);
  const isDraggingRef = useRef<boolean>(false);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const activeRpm = manualRpmOverride !== null ? manualRpmOverride : currentRpm;

  // Animation frame loop for rendering 3D & Section A-A
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let rotationAngle = 0;
    const particles: Array<{
      x: number;
      y: number;
      z: number;
      vx: number;
      vy: number;
      vz: number;
      life: number;
      maxLife: number;
      color: string;
    }> = [];

    // Initialize initial air particles
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: (Math.random() - 0.5) * 220,
        y: (Math.random() - 0.5) * 160 + 20,
        z: (Math.random() - 0.5) * 160,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        vz: (Math.random() - 0.5) * 0.4,
        life: Math.floor(Math.random() * 80),
        maxLife: 80,
        color: Math.random() > 0.4 ? "#f87171" : "#fbbf24", // dirty particle colors
      });
    }

    const render = () => {
      // Handle high-DPI
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * window.devicePixelRatio || canvas.height !== rect.height * window.devicePixelRatio) {
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
      }
      ctx.save();
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

      const w = rect.width;
      const h = rect.height;
      const cx = w / 2;
      const cy = h / 2 + 20;

      // Clear background
      ctx.fillStyle = "#090d16";
      ctx.fillRect(0, 0, w, h);

      // Subtle technical grid
      ctx.strokeStyle = "rgba(30, 41, 59, 0.4)";
      ctx.lineWidth = 1;
      const gridSize = 32;
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Update rotation
      const radPerSec = (activeRpm * 2 * Math.PI) / 60;
      rotationAngle += (radPerSec / 60);

      if (viewMode === "section_aa") {
        // Render Section A-A (1:12 scale) exactly as drawn in Ahmed Abouelezz blueprint
        renderSectionAA(ctx, cx, cy, w, h, showDimensions, filterSaturation);
      } else {
        // Render 3D Canvas Projection (Exterior or Exploded)
        render3DModel(
          ctx,
          cx,
          cy,
          rotationAngle,
          orbitAngle,
          zoom,
          viewMode === "exploded",
          showDimensions,
          filterSaturation
        );
      }

      // Render airflow and particulate suction particles if enabled
      if (showAirflowParticles) {
        renderParticles(ctx, cx, cy, particles, isTrappingActive, viewMode, activeRpm);
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [viewMode, activeRpm, orbitAngle, zoom, showDimensions, showAirflowParticles, filterSaturation, isTrappingActive]);

  // Mouse interaction for 3D rotation
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current || viewMode === "section_aa") return;
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    setOrbitAngle((prev) => ({
      yaw: prev.yaw + dx * 0.008,
      pitch: Math.max(-0.5, Math.min(0.6, prev.pitch + dy * 0.008)),
    }));
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setZoom((prev) => Math.max(0.6, Math.min(1.8, prev - e.deltaY * 0.001)));
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col h-full">
      {/* Header Bar */}
      <div className="bg-slate-950/80 px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wider font-mono">
                CVWT Engineering Inspector
              </h2>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                DWG: Ahmed Abouelezz
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Cross-flow Vertical Wind Turbine (H: 184cm, Rotor: Ø66cm, Base: Ø90cm)
            </p>
          </div>
        </div>

        {/* View Mode Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setViewMode("3d_exterior")}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              viewMode === "3d_exterior"
                ? "bg-emerald-500 text-slate-950 font-semibold shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            3D Rotor
          </button>
          <button
            onClick={() => setViewMode("section_aa")}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              viewMode === "section_aa"
                ? "bg-emerald-500 text-slate-950 font-semibold shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Section A-A (1:12)
          </button>
          <button
            onClick={() => setViewMode("exploded")}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              viewMode === "exploded"
                ? "bg-emerald-500 text-slate-950 font-semibold shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Exploded Core
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowDimensions(!showDimensions)}
            title="Toggle CAD Dimensions"
            className={`p-1.5 rounded-lg border text-xs transition-colors ${
              showDimensions
                ? "bg-sky-500/20 text-sky-300 border-sky-500/40"
                : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
            }`}
          >
            <Sliders className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowAirflowParticles(!showAirflowParticles)}
            title="Toggle Particle & Suction Streamlines"
            className={`p-1.5 rounded-lg border text-xs transition-colors ${
              showAirflowParticles
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
            }`}
          >
            <Wind className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              setOrbitAngle({ yaw: 0.35, pitch: 0.15 });
              setZoom(1.0);
              setManualRpmOverride(null);
            }}
            title="Reset Camera"
            className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 text-xs transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            onClick={onOpenBlueprintModal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs font-medium transition-colors"
          >
            <FileText className="h-3.5 w-3.5 text-emerald-400" />
            <span>Official DWG</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Stage */}
      <div className="relative flex-1 min-h-[380px] w-full">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className="w-full h-full cursor-grab active:cursor-grabbing block"
        />

        {/* Live Telemetry Overlay in Corner */}
        <div className="absolute top-3 left-3 bg-slate-950/85 backdrop-blur-md p-3 rounded-lg border border-slate-800 text-xs space-y-1.5 pointer-events-none shadow-xl">
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-400">Rotor Angular Speed:</span>
            <span className="font-mono font-bold text-emerald-400">{Math.round(activeRpm)} RPM</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-400">Suction Induction:</span>
            <span className="font-mono text-sky-400">
              {(activeRpm * 0.42).toFixed(1)} m³/h CADR
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-400">Trapping Status:</span>
            <span className="flex items-center gap-1 font-mono text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Active Centrifugal Suction
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-400">Filter Differential ΔP:</span>
            <span className="font-mono text-amber-400">
              {(120 + filterSaturation * 0.9).toFixed(0)} Pa
            </span>
          </div>
        </div>

        {/* Blueprint Callout Badge in Top Right */}
        <div className="absolute top-3 right-3 bg-slate-950/85 backdrop-blur-md px-3 py-2 rounded-lg border border-slate-800 text-right pointer-events-none">
          <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
            CAD Section / Spec Ref
          </div>
          <div className="text-xs font-mono font-semibold text-slate-200">
            Ahmed Abouelezz 9/17/2026
          </div>
          <div className="text-[10px] text-emerald-400 font-mono">
            H: 184cm | Rotor Ø: 66cm | Base Ø: 90cm
          </div>
        </div>

        {/* View Mode Description Banner */}
        <div className="absolute bottom-3 left-3 right-3 bg-slate-950/80 backdrop-blur-md px-3 py-2 rounded-lg border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-slate-300">
              {viewMode === "3d_exterior" &&
                "Drag to rotate 3D CVWT. Scroll to zoom. Note aerodynamic blade intake perforations."}
              {viewMode === "section_aa" &&
                "Section A-A (1:12 scale): Air enters perforated blade holes -> drawn through Multilayer Filter inside Hollow Cylinder -> clean air exhausts vertically."}
              {viewMode === "exploded" &&
                "Exploded component stack: Base Ø90cm -> Support Column -> Hollow Suction Cylinder -> Multilayer Filter Core -> Helical Rotor Blades."}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">RPM Slider:</span>
            <input
              type="range"
              min="0"
              max="280"
              value={activeRpm}
              onChange={(e) => setManualRpmOverride(Number(e.target.value))}
              className="w-24 accent-emerald-500 h-1 bg-slate-700 rounded-lg cursor-pointer"
            />
            {manualRpmOverride !== null && (
              <button
                onClick={() => setManualRpmOverride(null)}
                className="text-[10px] text-sky-400 hover:underline"
              >
                Auto
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filter Layer Inspector Tabs */}
      <div className="p-3 bg-slate-950 border-t border-slate-800">
        <div className="text-xs font-mono text-slate-400 mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-semibold text-slate-200">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            INTERNAL MULTILAYER FILTER CORE (Section A-A Detail)
          </span>
          <span className="text-[11px] text-emerald-400">
            Cumulative Trapping Efficiency: 99.8%
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {CVWT_DEFAULT_SPECS.filterLayers.map((layer) => {
            const isSelected = selectedLayer.id === layer.id;
            return (
              <button
                key={layer.id}
                onClick={() => setSelectedLayer(layer)}
                className={`p-2 rounded-lg border text-left transition-all ${
                  isSelected
                    ? "bg-slate-800/90 border-emerald-500/60 shadow-md ring-1 ring-emerald-500/40"
                    : "bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-400"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="text-xs font-semibold truncate"
                    style={{ color: isSelected ? "#ffffff" : layer.color }}
                  >
                    {layer.name}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 font-bold">
                    {layer.efficiencyPercent}%
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 line-clamp-1">
                  Targets: {layer.targetPollutants.join(", ")}
                </div>
                <div className="mt-1.5 w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${layer.currentSaturationPercent + filterSaturation * 0.4}%`,
                      backgroundColor: layer.color,
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* Detailed Selected Layer Explainer */}
        <div className="mt-2.5 p-2 rounded-lg bg-slate-900/80 border border-slate-800 flex items-start gap-3 text-xs">
          <div
            className="w-3 h-3 rounded-full mt-0.5 shrink-0"
            style={{ backgroundColor: selectedLayer.color }}
          />
          <div>
            <span className="font-semibold text-slate-200">{selectedLayer.name}: </span>
            <span className="text-slate-400">{selectedLayer.description}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// RENDER HELPERS: 3D MODEL & SECTION A-A
// ==========================================

function render3DModel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rotationAngle: number,
  orbitAngle: { yaw: number; pitch: number },
  zoom: number,
  isExploded: boolean,
  showDimensions: boolean,
  filterSaturation: number
) {
  const scale = 1.35 * zoom;
  const yaw = orbitAngle.yaw;
  const pitch = orbitAngle.pitch;

  // Coordinate projector
  const project = (x: number, y: number, z: number) => {
    // Rotate Y (yaw)
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const x1 = x * cosY - z * sinY;
    const z1 = x * sinY + z * cosY;

    // Rotate X (pitch)
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    const y2 = y * cosP - z1 * sinP;
    const z2 = y * sinP + z1 * cosP;

    // Perspective factor
    const fov = 600;
    const factor = fov / (fov + z2);
    return {
      x: cx + x1 * scale * factor,
      y: cy + y2 * scale * factor,
      z: z2,
    };
  };

  // Base Plate (Ø90cm from blueprint)
  const baseOffset = isExploded ? 70 : 0;
  const baseY = 120 + baseOffset;
  const baseRadius = 65;

  ctx.beginPath();
  for (let i = 0; i <= 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const pt = project(Math.cos(a) * baseRadius, baseY, Math.sin(a) * baseRadius);
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  }
  ctx.fillStyle = "#334155";
  ctx.fill();
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Green Support Pillar (from drawing: green column)
  const pillarOffset = isExploded ? 40 : 0;
  const pillarTopY = 60 + pillarOffset;
  const pillarBottomY = 120 + baseOffset;
  const pillarRadius = 12;

  ctx.beginPath();
  const ptBottomL = project(-pillarRadius, pillarBottomY, 0);
  const ptBottomR = project(pillarRadius, pillarBottomY, 0);
  const ptTopR = project(pillarRadius, pillarTopY, 0);
  const ptTopL = project(-pillarRadius, pillarTopY, 0);
  ctx.moveTo(ptBottomL.x, ptBottomL.y);
  ctx.lineTo(ptBottomR.x, ptBottomR.y);
  ctx.lineTo(ptTopR.x, ptTopR.y);
  ctx.lineTo(ptTopL.x, ptTopL.y);
  ctx.closePath();
  ctx.fillStyle = "#16a34a"; // Green support pillar as in blueprint
  ctx.fill();
  ctx.strokeStyle = "#22c55e";
  ctx.stroke();

  // Central Hollow Suction Cylinder (shaft containing multilayer filter)
  const cylinderRadius = 18;
  const rotorTopY = -110;
  const rotorBottomY = 55;

  ctx.beginPath();
  const cBottomL = project(-cylinderRadius, rotorBottomY, 0);
  const cBottomR = project(cylinderRadius, rotorBottomY, 0);
  const cTopR = project(cylinderRadius, rotorTopY, 0);
  const cTopL = project(-cylinderRadius, rotorTopY, 0);
  ctx.moveTo(cBottomL.x, cBottomL.y);
  ctx.lineTo(cBottomR.x, cBottomR.y);
  ctx.lineTo(cTopR.x, cTopR.y);
  ctx.lineTo(cTopL.x, cTopL.y);
  ctx.closePath();
  ctx.fillStyle = isExploded ? "#0284c7" : "#1e293b";
  ctx.fill();
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Suction perforations along the central cylinder
  for (let y = rotorBottomY - 10; y > rotorTopY + 10; y -= 20) {
    const holePt = project(0, y, cylinderRadius);
    ctx.beginPath();
    ctx.arc(holePt.x, holePt.y, 2.2 * scale, 0, Math.PI * 2);
    ctx.fillStyle = "#0284c7";
    ctx.fill();
    ctx.strokeStyle = "#38bdf8";
    ctx.stroke();
  }

  // 3 Helical Twisted Rotor Blades (66cm diameter, twisted Darrieus/Savonius geometry)
  const bladeCount = 3;
  const rotorRadius = 48; // corresponds to 66cm
  const twistTotal = Math.PI * 1.1; // 198 degree helical twist from bottom to top
  const bladeSteps = 16;
  const bladeExplodeOffset = isExploded ? 50 : 0;

  for (let b = 0; b < bladeCount; b++) {
    const baseBladeAngle = (b / bladeCount) * Math.PI * 2 + rotationAngle;
    const bladeColor = b === 0 ? "rgba(226, 232, 240, 0.9)" : b === 1 ? "rgba(203, 213, 225, 0.85)" : "rgba(148, 163, 184, 0.8)";
    const bladeExplodeAngle = baseBladeAngle;
    const exX = Math.cos(bladeExplodeAngle) * bladeExplodeOffset;
    const exZ = Math.sin(bladeExplodeAngle) * bladeExplodeOffset;

    // Draw outer curved helical blade ribbon
    ctx.beginPath();
    const ribbonPtsOuter: Array<{ x: number; y: number }> = [];
    const ribbonPtsInner: Array<{ x: number; y: number }> = [];

    for (let step = 0; step <= bladeSteps; step++) {
      const t = step / bladeSteps;
      const y = rotorBottomY + t * (rotorTopY - rotorBottomY);
      const angle = baseBladeAngle + t * twistTotal;

      const outerPt = project(
        Math.cos(angle) * rotorRadius + exX,
        y,
        Math.sin(angle) * rotorRadius + exZ
      );
      const innerPt = project(
        Math.cos(angle) * (rotorRadius * 0.45) + exX,
        y,
        Math.sin(angle) * (rotorRadius * 0.45) + exZ
      );

      ribbonPtsOuter.push(outerPt);
      ribbonPtsInner.push(innerPt);
    }

    // Outer edge down to inner edge
    ctx.moveTo(ribbonPtsOuter[0].x, ribbonPtsOuter[0].y);
    for (let i = 1; i < ribbonPtsOuter.length; i++) {
      ctx.lineTo(ribbonPtsOuter[i].x, ribbonPtsOuter[i].y);
    }
    for (let i = ribbonPtsInner.length - 1; i >= 0; i--) {
      ctx.lineTo(ribbonPtsInner[i].x, ribbonPtsInner[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = bladeColor;
    ctx.fill();
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Render Suction Perforation Holes along the blade leading edge (as shown in blueprint!)
    for (let h = 2; h < bladeSteps - 1; h += 2) {
      const pt = ribbonPtsOuter[h];
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.5 * scale, 0, Math.PI * 2);
      ctx.fillStyle = "#0f172a";
      ctx.fill();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // CAD Dimension Overlays (184cm height, Ø90cm, 66cm)
  if (showDimensions) {
    ctx.strokeStyle = "rgba(56, 189, 248, 0.7)";
    ctx.fillStyle = "#38bdf8";
    ctx.lineWidth = 1;
    ctx.font = "10px JetBrains Mono, monospace";

    // Height Dimension (184 cm)
    const topPt = project(rotorRadius + 28, rotorTopY, 0);
    const bottomPt = project(rotorRadius + 28, baseY, 0);
    ctx.beginPath();
    ctx.moveTo(topPt.x, topPt.y);
    ctx.lineTo(bottomPt.x, bottomPt.y);
    ctx.stroke();

    // Top & Bottom tics
    ctx.beginPath();
    ctx.moveTo(topPt.x - 6, topPt.y);
    ctx.lineTo(topPt.x + 6, topPt.y);
    ctx.moveTo(bottomPt.x - 6, bottomPt.y);
    ctx.lineTo(bottomPt.x + 6, bottomPt.y);
    ctx.stroke();
    ctx.fillText("184 cm", topPt.x + 10, (topPt.y + bottomPt.y) / 2);

    // Diameter Dimension (66 cm)
    const rotorL = project(-rotorRadius, rotorBottomY - 10, 0);
    const rotorR = project(rotorRadius, rotorBottomY - 10, 0);
    ctx.beginPath();
    ctx.moveTo(rotorL.x, rotorL.y + 15);
    ctx.lineTo(rotorR.x, rotorR.y + 15);
    ctx.stroke();
    ctx.fillText("Ø 66 cm", (rotorL.x + rotorR.x) / 2 - 18, rotorL.y + 28);

    // Base Dimension (Ø 90 cm)
    const baseL = project(-baseRadius, baseY + 12, 0);
    const baseR = project(baseRadius, baseY + 12, 0);
    ctx.beginPath();
    ctx.moveTo(baseL.x, baseL.y + 10);
    ctx.lineTo(baseR.x, baseR.y + 10);
    ctx.stroke();
    ctx.fillText("Ø 90 cm (Base)", (baseL.x + baseR.x) / 2 - 35, baseL.y + 24);
  }
}

function renderSectionAA(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  showDimensions: boolean,
  filterSaturation: number
) {
  const scale = 1.3;
  const originY = cy + 20;

  // Title for Section A-A (1:12)
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 15px JetBrains Mono, monospace";
  ctx.fillText("A-A (1:12)", cx - 35, originY - 190);

  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.setLineDash([6, 3]);
  ctx.moveTo(cx, originY - 180);
  ctx.lineTo(cx, originY + 120);
  ctx.stroke();
  ctx.setLineDash([]); // reset

  // Base Plate section
  ctx.beginPath();
  ctx.moveTo(cx - 110 * scale, originY + 100);
  ctx.lineTo(cx + 110 * scale, originY + 100);
  ctx.lineTo(cx + 100 * scale, originY + 110);
  ctx.lineTo(cx - 100 * scale, originY + 110);
  ctx.closePath();
  ctx.fillStyle = "#334155";
  ctx.fill();
  ctx.strokeStyle = "#94a3b8";
  ctx.stroke();

  // Hatching on Base
  ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
  for (let x = cx - 90 * scale; x < cx + 90 * scale; x += 10) {
    ctx.beginPath();
    ctx.moveTo(x, originY + 110);
    ctx.lineTo(x + 10, originY + 100);
    ctx.stroke();
  }

  // Green Support Column
  ctx.fillStyle = "#16a34a";
  ctx.fillRect(cx - 15 * scale, originY + 45, 30 * scale, 55);
  ctx.strokeStyle = "#22c55e";
  ctx.strokeRect(cx - 15 * scale, originY + 45, 30 * scale, 55);

  // Outer Blades in Cross Section (curved wings)
  const drawBladeSection = (side: number) => {
    ctx.beginPath();
    ctx.moveTo(cx + side * 15 * scale, originY - 150);
    ctx.bezierCurveTo(
      cx + side * 75 * scale,
      originY - 90,
      cx + side * 70 * scale,
      originY - 10,
      cx + side * 20 * scale,
      originY + 40
    );
    ctx.bezierCurveTo(
      cx + side * 55 * scale,
      originY - 10,
      cx + side * 60 * scale,
      originY - 90,
      cx + side * 10 * scale,
      originY - 150
    );
    ctx.closePath();
    ctx.fillStyle = "rgba(226, 232, 240, 0.85)";
    ctx.fill();
    ctx.strokeStyle = "#64748b";
    ctx.stroke();

    // Perforations Holes on blade
    for (let y = originY - 130; y < originY + 25; y += 22) {
      ctx.beginPath();
      ctx.arc(cx + side * 52 * scale, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#0f172a";
      ctx.fill();
      ctx.strokeStyle = "#38bdf8";
      ctx.stroke();
    }
  };

  drawBladeSection(-1);
  drawBladeSection(1);

  // Hollow Cylinder Walls
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2;
  // Left wall
  ctx.beginPath();
  ctx.moveTo(cx - 24 * scale, originY - 160);
  ctx.lineTo(cx - 24 * scale, originY + 45);
  ctx.stroke();
  // Right wall
  ctx.beginPath();
  ctx.moveTo(cx + 24 * scale, originY - 160);
  ctx.lineTo(cx + 24 * scale, originY + 45);
  ctx.stroke();

  // Holes in Hollow Cylinder walls
  for (let y = originY - 140; y < originY + 30; y += 22) {
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(cx - 25 * scale, y - 3, 4, 6);
    ctx.fillRect(cx + 21 * scale, y - 3, 4, 6);
  }

  // MULTILAYER FILTER INSIDE HOLLOW CYLINDER
  // 1. Pre-filter outer mesh
  ctx.fillStyle = "#64748b";
  ctx.fillRect(cx - 21 * scale, originY - 150, 4 * scale, 190);
  ctx.fillRect(cx + 17 * scale, originY - 150, 4 * scale, 190);

  // 2. HEPA H13 Pleated Matrix
  ctx.fillStyle = "#38bdf8";
  ctx.fillRect(cx - 17 * scale, originY - 150, 6 * scale, 190);
  ctx.fillRect(cx + 11 * scale, originY - 150, 6 * scale, 190);

  // 3. Activated Carbon Core
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(cx - 11 * scale, originY - 150, 22 * scale, 190);

  // 4. Electrostatic ionizer line in the very center
  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, originY - 150);
  ctx.lineTo(cx, originY + 40);
  ctx.stroke();

  // Annotations matching the blueprint Section A-A exactly
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "11px JetBrains Mono, monospace";

  // "Holes" callout
  drawCallout(ctx, cx + 52 * scale, originY - 110, cx + 110, originY - 120, "Holes");

  // "Hollow Cylinder" callout
  drawCallout(ctx, cx + 24 * scale, originY - 60, cx + 130, originY - 60, "Hollow Cylinder");

  // "Multilayer filter" callout
  drawCallout(ctx, cx + 5 * scale, originY + 10, cx + 130, originY + 10, "Multilayer filter");

  // "Base" callout
  drawCallout(ctx, cx + 70 * scale, originY + 105, cx + 130, originY + 80, "Base");

  // Airflow suction arrows entering holes
  drawAirArrow(ctx, cx - 80 * scale, originY - 80, cx - 55 * scale, originY - 80, "#ef4444");
  drawAirArrow(ctx, cx + 80 * scale, originY - 80, cx + 55 * scale, originY - 80, "#ef4444");
  // Clean scrubbed air exiting top
  drawAirArrow(ctx, cx, originY - 165, cx, originY - 195, "#10b981");
}

function drawCallout(
  ctx: CanvasRenderingContext2D,
  targetX: number,
  targetY: number,
  labelX: number,
  labelY: number,
  text: string
) {
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(targetX, targetY);
  ctx.lineTo(labelX - 10, labelY);
  ctx.lineTo(labelX + 80, labelY);
  ctx.stroke();

  // Target dot
  ctx.fillStyle = "#38bdf8";
  ctx.beginPath();
  ctx.arc(targetX, targetY, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f1f5f9";
  ctx.font = "11px JetBrains Mono, monospace";
  ctx.fillText(text, labelX, labelY - 4);
}

function drawAirArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string
) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  const angle = Math.atan2(toY - fromY, toX - fromX);
  const headLen = 6;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function renderParticles(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  particles: Array<{
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    maxLife: number;
    color: string;
  }>,
  isTrappingActive: boolean,
  viewMode: string,
  activeRpm: number
) {
  const suctionRadius = 140;

  particles.forEach((p) => {
    p.life++;
    if (p.life > p.maxLife) {
      p.life = 0;
      // Respawn near outside boundary
      const side = Math.random() > 0.5 ? 1 : -1;
      p.x = side * (120 + Math.random() * 80);
      p.y = (Math.random() - 0.5) * 160;
      p.z = (Math.random() - 0.5) * 120;
      p.vx = -side * (0.8 + Math.random() * 0.6);
      p.vy = (Math.random() - 0.5) * 0.4;
      p.vz = (Math.random() - 0.5) * 0.4;
      p.color = Math.random() > 0.3 ? "#ef4444" : "#f97316";
    }

    // Suction force towards turbine center
    if (isTrappingActive && activeRpm > 10) {
      const dist = Math.hypot(p.x, p.y);
      if (dist < suctionRadius && dist > 15) {
        const pull = (0.6 * (activeRpm / 100)) / (dist * 0.1);
        p.vx -= (p.x / dist) * pull;
        p.vy -= (p.y / dist) * pull;

        // Centrifugal swirl
        p.vx += (-p.y / dist) * (activeRpm * 0.005);
        p.vy += (p.x / dist) * (activeRpm * 0.005);

        // Trapped in filter core!
        if (dist < 25) {
          p.color = "#10b981"; // turns clean green as it is scrubbed
        }
      }
    }

    p.x += p.vx;
    p.y += p.vy;

    // Draw particle
    const drawX = cx + p.x;
    const drawY = cy + p.y;
    const alpha = Math.sin((p.life / p.maxLife) * Math.PI);

    ctx.beginPath();
    ctx.arc(drawX, drawY, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = alpha;
    ctx.fill();
    ctx.globalAlpha = 1.0;
  });
}
