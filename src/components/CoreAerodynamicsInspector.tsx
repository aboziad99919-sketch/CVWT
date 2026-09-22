import React, { useState, useEffect, useRef } from "react";
import {
  Wind,
  ShieldCheck,
  Activity,
  Layers,
  Sliders,
  Filter,
  Flame,
  Disc,
  CircleDot,
  Compass,
  ArrowRight,
  TrendingUp,
  RotateCcw,
  Zap,
  Info,
  CheckCircle2,
} from "lucide-react";
import { PollutantCategory, PollutantType, FilterLayer } from "../types";
import { CVWT_DEFAULT_SPECS } from "../data/blueprintData";

interface CoreAerodynamicsInspectorProps {
  currentRpm: number;
  filterSaturation: number;
}

export const CoreAerodynamicsInspector: React.FC<CoreAerodynamicsInspectorProps> = ({
  currentRpm,
  filterSaturation,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // User Interactive Controls
  const [selectedCategory, setSelectedCategory] = useState<"all" | "exhaust" | "non_exhaust">("all");
  const [activePollutantHighlight, setActivePollutantHighlight] = useState<PollutantType | "all">("all");
  const [laneSpeedEastKmh, setLaneSpeedEastKmh] = useState<number>(90);
  const [laneSpeedWestKmh, setLaneSpeedWestKmh] = useState<number>(85);
  const [medianClearanceM, setMedianClearanceM] = useState<number>(1.2); // distance from vehicle to CVWT
  const [showPressureField, setShowPressureField] = useState<boolean>(true);
  const [showStreamlines, setShowStreamlines] = useState<boolean>(true);
  const [showVelocityVectors, setShowVelocityVectors] = useState<boolean>(false);
  const [holeIntakeOpenPercent, setHoleIntakeOpenPercent] = useState<number>(18); // blade perforation %
  const [viewAngle, setViewAngle] = useState<"top_cross_section" | "axial_core_cutaway">("top_cross_section");

  // Dynamic Trapping Metrics
  const [exhaustTrappedGrams, setExhaustTrappedGrams] = useState<number>(9.84);
  const [nonExhaustTrappedGrams, setNonExhaustTrappedGrams] = useState<number>(12.46);
  const [brakeWearGrams, setBrakeWearGrams] = useState<number>(5.62);
  const [tireWearGrams, setTireWearGrams] = useState<number>(4.21);
  const [roadDustGrams, setRoadDustGrams] = useState<number>(2.63);
  const [sootGrams, setSootGrams] = useState<number>(7.14);

  // Internal physics particles state
  const particlesRef = useRef<Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    category: PollutantCategory;
    type: PollutantType;
    diameterUm: number;
    size: number;
    color: string;
    life: number;
    maxLife: number;
    trappedInCore: boolean;
    trappedStage?: string;
  }>>([]);

  // Calculate hydrodynamic shear and core suction metrics
  const relShearVelocityMs = ((laneSpeedEastKmh + laneSpeedWestKmh) * 1000) / (3600 * 2);
  const coreVortexDeltaPa = Math.round(35 + (currentRpm / 100) * 85 + (holeIntakeOpenPercent / 20) * 25);
  const coreInflowCadrM3h = Math.round((currentRpm * 0.48 * (holeIntakeOpenPercent / 15)) * 1.8);
  const overallEfficiency = Number((91.2 + (currentRpm > 100 ? 4.2 : 0) - (filterSaturation * 0.08)).toFixed(1));
  const exhaustEfficiency = Number((96.4 - filterSaturation * 0.05).toFixed(1));
  const nonExhaustEfficiency = Number((88.7 - filterSaturation * 0.1).toFixed(1));

  // Initialize and spawn particles for the internal/external aerodynamic canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let lastTime = performance.now();

    // Seed initial particles
    if (particlesRef.current.length === 0) {
      for (let i = 0; i < 90; i++) {
        spawnParticle(canvas.width || 600, canvas.height || 450);
      }
    }

    function spawnParticle(w: number, h: number) {
      const isExhaust = Math.random() < 0.45;
      let type: PollutantType;
      let category: PollutantCategory;
      let diameterUm: number;
      let color: string;

      if (isExhaust) {
        category = "exhaust";
        if (Math.random() < 0.65) {
          type = "combustion_soot";
          diameterUm = 0.3 + Math.random() * 0.8;
          color = "#ef4444"; // Vivid red soot
        } else {
          type = "tailpipe_pm25";
          diameterUm = 1.0 + Math.random() * 1.5;
          color = "#f97316"; // Orange tailpipe PM
        }
      } else {
        category = "non_exhaust";
        const r = Math.random();
        if (r < 0.45) {
          type = "brake_wear";
          diameterUm = 1.2 + Math.random() * 2.5;
          color = "#e2e8f0"; // Metallic silver/white brake dust
        } else if (r < 0.75) {
          type = "tire_wear";
          diameterUm = 4.0 + Math.random() * 8.0;
          color = "#38bdf8"; // Cyan/slate tire microplastic
        } else {
          type = "resuspended_dust";
          diameterUm = 8.0 + Math.random() * 15.0;
          color = "#d97706"; // Amber mineral road dust
        }
      }

      // Spawn in vehicle lanes (Top = Westbound Lane A, Bottom = Eastbound Lane B)
      const isTopLane = Math.random() > 0.5;
      const x = isTopLane ? w - 20 - Math.random() * 80 : 20 + Math.random() * 80;
      const y = isTopLane ? h * 0.22 + (Math.random() - 0.5) * 40 : h * 0.78 + (Math.random() - 0.5) * 40;
      const baseVx = isTopLane ? -((laneSpeedWestKmh * 1000) / 3600) * 0.22 : ((laneSpeedEastKmh * 1000) / 3600) * 0.22;

      particlesRef.current.push({
        x,
        y,
        vx: baseVx + (Math.random() - 0.5) * 0.5,
        vy: (isTopLane ? 1 : -1) * (0.4 + Math.random() * 0.5),
        category,
        type,
        diameterUm,
        size: Math.max(1.8, Math.min(4.5, diameterUm * 0.35)),
        color,
        life: 0,
        maxLife: 140 + Math.floor(Math.random() * 60),
        trappedInCore: false,
      });
    }

    const render = (time: number) => {
      const dt = Math.min(0.1, (time - lastTime) / 1000);
      lastTime = time;

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
      const cy = h / 2;

      // Background
      ctx.fillStyle = "#090d16";
      ctx.fillRect(0, 0, w, h);

      if (viewAngle === "top_cross_section") {
        renderTopCrossSectionAerodynamics(
          ctx,
          cx,
          cy,
          w,
          h,
          currentRpm,
          laneSpeedEastKmh,
          laneSpeedWestKmh,
          showPressureField,
          showStreamlines,
          showVelocityVectors,
          holeIntakeOpenPercent,
          filterSaturation
        );
      } else {
        renderAxialCoreCutaway(
          ctx,
          cx,
          cy,
          w,
          h,
          currentRpm,
          coreVortexDeltaPa,
          holeIntakeOpenPercent,
          filterSaturation,
          showVelocityVectors
        );
      }

      // Update and draw particles with aerodynamics & core suction physics
      updateAndDrawParticles(
        ctx,
        cx,
        cy,
        w,
        h,
        currentRpm,
        selectedCategory,
        activePollutantHighlight,
        particlesRef.current,
        viewAngle,
        holeIntakeOpenPercent
      );

      // Keep particle pool populated
      while (particlesRef.current.length < 110) {
        spawnParticle(w, h);
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [
    currentRpm,
    selectedCategory,
    activePollutantHighlight,
    laneSpeedEastKmh,
    laneSpeedWestKmh,
    showPressureField,
    showStreamlines,
    showVelocityVectors,
    holeIntakeOpenPercent,
    viewAngle,
    filterSaturation,
  ]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col h-full">
      {/* Header Bar */}
      <div className="bg-slate-950/90 px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <CircleDot className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wider font-mono">
                CVWT Core Aerodynamics & Trapping Inspector
              </h2>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                Core Suction Plenum Analysis
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Examining exhausting vs non-exhausting vehicle pollutants drawn into the central hollow cylinder
            </p>
          </div>
        </div>

        {/* View Angle Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setViewAngle("top_cross_section")}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              viewAngle === "top_cross_section"
                ? "bg-purple-500 text-slate-950 font-semibold shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            2D Plan View & Wake Shear
          </button>
          <button
            onClick={() => setViewAngle("axial_core_cutaway")}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              viewAngle === "axial_core_cutaway"
                ? "bg-purple-500 text-slate-950 font-semibold shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Axial Section A-A Core Cutaway
          </button>
        </div>

        {/* Aerodynamic Layer Toggles */}
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setShowVelocityVectors(!showVelocityVectors)}
            className={`px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1.5 ${
              showVelocityVectors
                ? "bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-sm"
                : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
            }`}
            title="Toggle Computational Fluid Dynamics (CFD) Velocity Vectors"
          >
            <Wind className="h-3.5 w-3.5 text-purple-400" />
            <span>CFD Vectors</span>
          </button>
          <button
            onClick={() => setShowPressureField(!showPressureField)}
            className={`px-2.5 py-1 rounded-lg border transition-colors ${
              showPressureField
                ? "bg-sky-500/20 text-sky-300 border-sky-500/40"
                : "bg-slate-800 text-slate-400 border-slate-700"
            }`}
          >
            Pressure ΔP Field
          </button>
          <button
            onClick={() => setShowStreamlines(!showStreamlines)}
            className={`px-2.5 py-1 rounded-lg border transition-colors ${
              showStreamlines
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                : "bg-slate-800 text-slate-400 border-slate-700"
            }`}
          >
            Air Circulation
          </button>
        </div>
      </div>

      {/* Pollutant Classification Filter Strip */}
      <div className="bg-slate-950/80 px-4 py-2 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Category Tabs */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-semibold font-mono text-[11px]">EXAMINE POLLUTANTS:</span>
          <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => {
                setSelectedCategory("all");
                setActivePollutantHighlight("all");
              }}
              className={`px-2.5 py-1 rounded transition-colors ${
                selectedCategory === "all"
                  ? "bg-slate-700 text-slate-100 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All Pollutants
            </button>
            <button
              onClick={() => {
                setSelectedCategory("exhaust");
                setActivePollutantHighlight("all");
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
                selectedCategory === "exhaust"
                  ? "bg-red-500/30 text-red-200 border border-red-500/40 font-semibold"
                  : "text-red-400/80 hover:text-red-300"
              }`}
            >
              <Flame className="h-3 w-3" />
              Exhausting Only
            </button>
            <button
              onClick={() => {
                setSelectedCategory("non_exhaust");
                setActivePollutantHighlight("all");
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
                selectedCategory === "non_exhaust"
                  ? "bg-sky-500/30 text-sky-200 border border-sky-500/40 font-semibold"
                  : "text-sky-400/80 hover:text-sky-300"
              }`}
            >
              <Disc className="h-3 w-3" />
              Non-Exhausting Only
            </button>
          </div>
        </div>

        {/* Specific Pollutant Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-[11px]">
          {/* Exhaust types */}
          <button
            onClick={() => setActivePollutantHighlight("combustion_soot")}
            className={`px-2 py-0.5 rounded-full border transition-all flex items-center gap-1 ${
              activePollutantHighlight === "combustion_soot"
                ? "bg-red-500 text-white font-bold border-red-400"
                : "bg-red-950/30 text-red-300 border-red-800/40 hover:border-red-600"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
            Diesel Soot (0.3µm)
          </button>
          <button
            onClick={() => setActivePollutantHighlight("tailpipe_pm25")}
            className={`px-2 py-0.5 rounded-full border transition-all flex items-center gap-1 ${
              activePollutantHighlight === "tailpipe_pm25"
                ? "bg-orange-500 text-white font-bold border-orange-400"
                : "bg-orange-950/30 text-orange-300 border-orange-800/40 hover:border-orange-600"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
            Tailpipe PM2.5 / NOx
          </button>

          {/* Non-exhaust types */}
          <button
            onClick={() => setActivePollutantHighlight("brake_wear")}
            className={`px-2 py-0.5 rounded-full border transition-all flex items-center gap-1 ${
              activePollutantHighlight === "brake_wear"
                ? "bg-slate-200 text-slate-950 font-bold border-white"
                : "bg-slate-800/60 text-slate-300 border-slate-700 hover:border-slate-500"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
            Brake Caliper Dust (1.5µm)
          </button>
          <button
            onClick={() => setActivePollutantHighlight("tire_wear")}
            className={`px-2 py-0.5 rounded-full border transition-all flex items-center gap-1 ${
              activePollutantHighlight === "tire_wear"
                ? "bg-sky-500 text-slate-950 font-bold border-sky-400"
                : "bg-sky-950/30 text-sky-300 border-sky-800/40 hover:border-sky-600"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            Tire Wear Microplastics (6µm)
          </button>
          <button
            onClick={() => setActivePollutantHighlight("resuspended_dust")}
            className={`px-2 py-0.5 rounded-full border transition-all flex items-center gap-1 ${
              activePollutantHighlight === "resuspended_dust"
                ? "bg-amber-600 text-white font-bold border-amber-400"
                : "bg-amber-950/30 text-amber-300 border-amber-800/40 hover:border-amber-600"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Resuspended Road Dust (12µm)
          </button>
        </div>
      </div>

      {/* Main Fluid Dynamics Stage */}
      <div className="relative flex-1 min-h-[380px] w-full bg-slate-950">
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Live Hydrodynamic Core Telemetry Overlay */}
        <div className="absolute top-3 left-3 bg-slate-950/90 backdrop-blur-md p-3.5 rounded-xl border border-slate-800 text-xs space-y-2 pointer-events-none shadow-2xl max-w-xs">
          <div className="flex items-center justify-between text-[11px] font-mono font-bold text-purple-400 uppercase">
            <span>CVWT Core Center Physics</span>
            <span className="h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-400">Core Vortex ΔP:</span>
            <span className="font-mono font-bold text-amber-400">-{coreVortexDeltaPa} Pa (Suction Sink)</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-400">Core Inflow Rate:</span>
            <span className="font-mono font-bold text-sky-400">{coreInflowCadrM3h} m³/h</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-400">Opposing Wake Shear:</span>
            <span className="font-mono text-emerald-400">ΔV = {relShearVelocityMs.toFixed(1)} m/s</span>
          </div>

          <div className="pt-1.5 border-t border-slate-800 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Exhaust Trapping Eff:</span>
              <span className="font-mono font-bold text-red-400">{exhaustEfficiency}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Non-Exhaust Trapping Eff:</span>
              <span className="font-mono font-bold text-sky-400">{nonExhaustEfficiency}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Overall Core Efficiency:</span>
              <span className="font-mono font-bold text-emerald-400">{overallEfficiency}%</span>
            </div>
          </div>
        </div>

        {/* Fluid Mechanics Callouts on Stage */}
        <div className="absolute top-3 right-3 bg-slate-950/85 backdrop-blur-md p-3 rounded-xl border border-slate-800 text-right text-xs space-y-1 pointer-events-none">
          <div className="font-mono text-[10px] text-slate-500 uppercase tracking-widest">
            AERODYNAMIC BOUNDARY CONDITION
          </div>
          <div className="font-semibold text-slate-200">
            {viewAngle === "top_cross_section"
              ? "Plan View: Opposing Two-Way Slipstream Shear"
              : "Section A-A: Core Hollow Cylinder & Multilayer Filter"}
          </div>
          <div className="text-[11px] text-purple-400 font-mono">
            {viewAngle === "top_cross_section"
              ? "Lane A (Westbound) ◄── [CVWT Rotor] ──► Lane B (Eastbound)"
              : "Intake Perforations ➔ Core Pre-Filter ➔ HEPA ➔ Carbon ➔ Exhaust"}
          </div>
        </div>

        {/* Bottom Trapping Stage Breakdown Ribbon */}
        <div className="absolute bottom-3 left-3 right-3 bg-slate-950/85 backdrop-blur-md p-2.5 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-purple-400" />
            <span className="text-slate-300 font-semibold">Core Center Filtration Stages:</span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              Stage 1 (Pre-filter): <strong>Tire Wear & Road Dust</strong>
            </span>
            <span className="flex items-center gap-1.5 text-sky-400">
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              Stage 2 (HEPA H13): <strong>Brake Dust & PM2.5</strong>
            </span>
            <span className="flex items-center gap-1.5 text-purple-400">
              <span className="h-2 w-2 rounded-full bg-purple-400" />
              Stage 3 (Carbon): <strong>NOx & Exhaust VOCs</strong>
            </span>
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Stage 4 (Electrostatic): <strong>Nanoscale Soot</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Aerodynamic Simulation Sliders Panel */}
      <div className="p-3 bg-slate-950 border-t border-slate-800 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div>
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span>Westbound Lane A Speed:</span>
            <span className="font-mono text-slate-200">{laneSpeedWestKmh} km/h</span>
          </div>
          <input
            type="range"
            min="40"
            max="130"
            value={laneSpeedWestKmh}
            onChange={(e) => setLaneSpeedWestKmh(Number(e.target.value))}
            className="w-full accent-purple-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span>Eastbound Lane B Speed:</span>
            <span className="font-mono text-slate-200">{laneSpeedEastKmh} km/h</span>
          </div>
          <input
            type="range"
            min="40"
            max="130"
            value={laneSpeedEastKmh}
            onChange={(e) => setLaneSpeedEastKmh(Number(e.target.value))}
            className="w-full accent-purple-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span>Blade Perforation Ratio:</span>
            <span className="font-mono text-sky-400">{holeIntakeOpenPercent}% open</span>
          </div>
          <input
            type="range"
            min="8"
            max="30"
            value={holeIntakeOpenPercent}
            onChange={(e) => setHoleIntakeOpenPercent(Number(e.target.value))}
            className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span>Median Clearance:</span>
            <span className="font-mono text-emerald-400">{medianClearanceM.toFixed(1)} m</span>
          </div>
          <input
            type="range"
            min="0.8"
            max="3.0"
            step="0.1"
            value={medianClearanceM}
            onChange={(e) => setMedianClearanceM(Number(e.target.value))}
            className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};

// ========================================================
// RENDERER 1: 2D PLAN VIEW (TOP CROSS-SECTION)
// Shows opposing vehicles, aerodynamic shear layer,
// blade intake holes, and core suction vortex sink
// ========================================================

function renderTopCrossSectionAerodynamics(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  rpm: number,
  laneSpeedEast: number,
  laneSpeedWest: number,
  showPressureField: boolean,
  showStreamlines: boolean,
  showVelocityVectors: boolean,
  holeIntakeOpenPercent: number,
  filterSaturation: number
) {
  // Opposing Highway Lanes
  const topLaneY = cy - 110;
  const bottomLaneY = cy + 110;

  // Road surfaces
  ctx.fillStyle = "rgba(17, 24, 39, 0.7)";
  ctx.fillRect(0, topLaneY - 35, w, 70);
  ctx.fillRect(0, bottomLaneY - 35, w, 70);

  // Road lane markings
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.setLineDash([12, 12]);
  ctx.beginPath();
  ctx.moveTo(0, topLaneY);
  ctx.lineTo(w, topLaneY);
  ctx.moveTo(0, bottomLaneY);
  ctx.lineTo(w, bottomLaneY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Lane Direction Annotations
  ctx.font = "bold 11px JetBrains Mono, monospace";
  ctx.fillStyle = "rgba(239, 68, 68, 0.5)";
  ctx.fillText(`◀ WESTBOUND VEHICLE SLIPSTREAM (${laneSpeedWest} km/h)`, 30, topLaneY - 14);
  ctx.fillStyle = "rgba(56, 189, 248, 0.5)";
  ctx.fillText(`EASTBOUND VEHICLE SLIPSTREAM (${laneSpeedEast} km/h) ▶`, 30, bottomLaneY + 24);

  // Pressure Field Heatmap Around & Inside CVWT
  if (showPressureField) {
    // Center Low-Pressure Suction Sink inside the Hollow Cylinder Core
    const coreGrad = ctx.createRadialGradient(cx, cy, 5, cx, cy, 140);
    coreGrad.addColorStop(0, "rgba(168, 85, 247, 0.45)"); // Deep low pressure purple in core center
    coreGrad.addColorStop(0.3, "rgba(56, 189, 248, 0.25)"); // Inward suction zone
    coreGrad.addColorStop(0.7, "rgba(30, 41, 59, 0.1)");
    coreGrad.addColorStop(1, "rgba(15, 23, 42, 0)");

    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 140, 0, Math.PI * 2);
    ctx.fill();

    // High Pressure Stagnation Points on Blade Advancing Face
    const stagnationGrad = ctx.createRadialGradient(cx + 45, cy - 35, 2, cx + 45, cy - 35, 30);
    stagnationGrad.addColorStop(0, "rgba(239, 68, 68, 0.35)"); // High pressure zone
    stagnationGrad.addColorStop(1, "rgba(239, 68, 68, 0)");
    ctx.fillStyle = stagnationGrad;
    ctx.beginPath();
    ctx.arc(cx + 45, cy - 35, 30, 0, Math.PI * 2);
    ctx.fill();
  }

  // Streamlines Showing Opposing Shear & Suction Flow Lines
  if (showStreamlines) {
    ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
    ctx.lineWidth = 1.2;

    const timeOffset = (performance.now() * 0.002) % 1;

    // Top Westbound Shear Flowlines (Curving towards median)
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      const startY = topLaneY + 20 + i * 10;
      ctx.moveTo(w, startY);
      ctx.bezierCurveTo(
        cx + 120,
        startY,
        cx + 40,
        cy - 40,
        cx,
        cy - 20
      );
      ctx.stroke();
    }

    // Bottom Eastbound Shear Flowlines (Curving towards median)
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      const startY = bottomLaneY - 20 - i * 10;
      ctx.moveTo(0, startY);
      ctx.bezierCurveTo(
        cx - 120,
        startY,
        cx - 40,
        cy + 40,
        cx,
        cy + 20
      );
      ctx.stroke();
    }

    // Swirl Flowlines into Core Center
    ctx.strokeStyle = "rgba(168, 85, 247, 0.4)";
    ctx.lineWidth = 1.5;
    const spiralAngle = (performance.now() * 0.003 * (rpm / 80));
    for (let s = 0; s < 3; s++) {
      ctx.beginPath();
      const a0 = spiralAngle + (s * Math.PI * 2) / 3;
      for (let r = 55; r >= 15; r -= 4) {
        const a = a0 + (55 - r) * 0.12;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (r === 55) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  // CFD (Computational Fluid Dynamics) Airflow Velocity Vectors & Core Trapping Path
  if (showVelocityVectors) {
    drawInspectorCfdVectors(
      ctx,
      cx,
      cy,
      w,
      h,
      topLaneY,
      bottomLaneY,
      laneSpeedEast,
      laneSpeedWest,
      rpm
    );
  }

  // Draw CVWT 66cm Rotor Blades (Top View)
  const outerR = 55; // outer rotor radius (66 cm scaled)
  const coreR = 22; // hollow cylinder radius
  const bladeAngle = (performance.now() * 0.003 * (rpm / 60));

  // Outer Suction Boundary Circle
  ctx.strokeStyle = "rgba(168, 85, 247, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // 3 Twisted Helical Blades with Perforated Intake Holes
  for (let i = 0; i < 3; i++) {
    const a = bladeAngle + (i * Math.PI * 2) / 3;

    // Curved Darrieus/Savonius blade profile
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * (outerR * 0.55), cy + Math.sin(a) * (outerR * 0.55), outerR * 0.55, a, a + Math.PI * 0.75);
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = 4;
    ctx.stroke();

    // Perforated Intake Holes along the blade (Ahmed Abouelezz DWG)
    const holeCount = Math.max(3, Math.round(holeIntakeOpenPercent / 4));
    for (let h = 1; h <= holeCount; h++) {
      const frac = h / (holeCount + 1);
      const ha = a + frac * Math.PI * 0.65;
      const hx = cx + Math.cos(ha) * (outerR * 0.85);
      const hy = cy + Math.sin(ha) * (outerR * 0.85);

      ctx.beginPath();
      ctx.arc(hx, hy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#0284c7";
      ctx.fill();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Central Hollow Cylinder Core & Multilayer Filter Rings
  // Ring 1: Pre-filter mesh
  ctx.beginPath();
  ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
  ctx.fillStyle = "#334155";
  ctx.fill();
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Ring 2: True HEPA H13
  ctx.beginPath();
  ctx.arc(cx, cy, coreR * 0.75, 0, Math.PI * 2);
  ctx.fillStyle = "#0284c7";
  ctx.fill();
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Ring 3: Activated Carbon Core
  ctx.beginPath();
  ctx.arc(cx, cy, coreR * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = "#1e293b";
  ctx.fill();
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Core Center Vortex Sink
  ctx.beginPath();
  ctx.arc(cx, cy, coreR * 0.25, 0, Math.PI * 2);
  ctx.fillStyle = "#a855f7"; // low pressure sink
  ctx.fill();

  // Callout Tags on Canvas
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "10px JetBrains Mono, monospace";
  ctx.fillText("CORE CENTER VORTEX SINK (-ΔP)", cx + 28, cy - 25);
  ctx.fillText("BLADE INTAKE HOLES (Ø8mm)", cx + 55, cy + 35);
}

// ========================================================
// RENDERER 2: AXIAL CORE CUTAWAY (SECTION A-A DETAIL)
// Shows vertical cutaway into the hollow cylinder,
// stage-by-stage multilayer filter, and inward suction flow
// ========================================================

function renderAxialCoreCutaway(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  rpm: number,
  coreDeltaPa: number,
  holeIntakeOpenPercent: number,
  filterSaturation: number,
  showVelocityVectors: boolean
) {
  const coreH = 260;
  const coreW = 120;
  const topY = cy - coreH / 2;
  const bottomY = cy + coreH / 2;

  // Outer Cylinder Walls (Section A-A Hollow Cylinder)
  ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
  ctx.fillRect(cx - coreW / 2, topY, coreW, coreH);
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - coreW / 2, topY, coreW, coreH);

  // Perforated Intake Ports on Cylinder Walls
  for (let y = topY + 25; y < bottomY - 20; y += 22) {
    // Left port
    ctx.fillStyle = "#0284c7";
    ctx.fillRect(cx - coreW / 2 - 5, y - 4, 10, 8);
    // Right port
    ctx.fillRect(cx + coreW / 2 - 5, y - 4, 10, 8);

    // Inward suction arrows entering core center
    drawSmallArrow(ctx, cx - coreW / 2 - 25, y, cx - coreW / 2 + 10, y, "#38bdf8");
    drawSmallArrow(ctx, cx + coreW / 2 + 25, y, cx + coreW / 2 - 10, y, "#38bdf8");
  }

  // Multilayer Filter Layers Inside Core Center (Symmetric Left & Right)
  // Layer 1: Coarse Pre-filter (50µm mesh) - Traps Tire Wear & Road Dust
  const layer1W = 14;
  ctx.fillStyle = "#64748b";
  ctx.fillRect(cx - coreW / 2 + 6, topY + 10, layer1W, coreH - 20);
  ctx.fillRect(cx + coreW / 2 - 6 - layer1W, topY + 10, layer1W, coreH - 20);

  // Layer 2: True HEPA H13 (0.3µm) - Traps Brake Dust & Combustion PM2.5
  const layer2W = 16;
  ctx.fillStyle = "#0284c7";
  ctx.fillRect(cx - coreW / 2 + 6 + layer1W, topY + 10, layer2W, coreH - 20);
  ctx.fillRect(cx + coreW / 2 - 6 - layer1W - layer2W, topY + 10, layer2W, coreH - 20);

  // Layer 3: Activated Carbon Granules - Adsorbs NOx & Toxic VOCs
  const layer3W = 14;
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(cx - coreW / 2 + 6 + layer1W + layer2W, topY + 10, layer3W, coreH - 20);
  ctx.fillRect(cx + coreW / 2 - 6 - layer1W - layer2W - layer3W, topY + 10, layer3W, coreH - 20);

  // Layer 4: Central Clean Air Core Exhaust Plenum (Vertical up-draft)
  const plenumW = coreW - (6 + layer1W + layer2W + layer3W) * 2;
  const plenumX = cx - plenumW / 2;
  ctx.fillStyle = "rgba(16, 185, 129, 0.25)";
  ctx.fillRect(plenumX, topY + 10, plenumW, coreH - 20);
  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 1;
  ctx.strokeRect(plenumX, topY + 10, plenumW, coreH - 20);

  // Vertical Clean Scrubbed Air Exhaust Flow (Upwards)
  for (let y = bottomY - 30; y > topY - 20; y -= 40) {
    const shift = (performance.now() * 0.05) % 40;
    drawSmallArrow(ctx, cx, y - shift, cx, y - shift - 20, "#10b981");
  }

  // CFD Axial Trapping Vectors & Radial Inward Penetration
  if (showVelocityVectors) {
    drawAxialSectionCfdVectors(ctx, cx, cy, coreW, coreH, topY, bottomY, rpm);
  }

  // Annotations & Callouts
  ctx.fillStyle = "#f8fafc";
  ctx.font = "11px JetBrains Mono, monospace";
  ctx.fillText("CLEAN SCRUBBED EXHAUST (CADR)", cx - 85, topY - 30);
  ctx.fillText("PRE-FILTER: Tire Wear (85%)", cx + coreW / 2 + 45, topY + 50);
  ctx.fillText("HEPA H13: Brake Dust (99.7%)", cx + coreW / 2 + 45, topY + 95);
  ctx.fillText("CARBON CORE: NOx Gases (88%)", cx + coreW / 2 + 45, topY + 140);
  ctx.fillText("LOW-PRESSURE SINK (-ΔP)", cx - coreW / 2 - 190, cy);
}

function updateAndDrawParticles(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  rpm: number,
  selectedCategory: string,
  activeHighlight: string,
  particles: any[],
  viewAngle: string,
  holeIntakeOpenPercent: number
) {
  const suctionRadius = 135;
  const coreCenterRadius = 24;

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life++;

    if (p.life > p.maxLife) {
      particles.splice(i, 1);
      continue;
    }

    // Filter visibility
    if (selectedCategory !== "all" && p.category !== selectedCategory) {
      continue;
    }
    if (activeHighlight !== "all" && p.type !== activeHighlight) {
      continue;
    }

    // Physics: Suction towards CVWT Core Center
    const dx = cx - p.x;
    const dy = cy - p.y;
    const dist = Math.hypot(dx, dy);

    if (dist < suctionRadius && dist > 8) {
      // Strong inward pressure gradient force (proportional to rotor RPM and open hole area)
      const suctionStrength = (1.2 * (rpm / 100) * (holeIntakeOpenPercent / 15)) / Math.max(12, dist);
      p.vx += (dx / dist) * suctionStrength * 3.5;
      p.vy += (dy / dist) * suctionStrength * 3.5;

      // Swirl rotation around the helical blades
      const swirlFactor = (rpm * 0.008);
      p.vx += (-dy / dist) * swirlFactor;
      p.vy += (dx / dist) * swirlFactor;

      // Captured in core center!
      if (dist < coreCenterRadius) {
        p.trappedInCore = true;
        // Particle enters vertical exhaust or arrested in filter
        p.vx *= 0.15;
        p.vy *= 0.15;
      }
    }

    p.x += p.vx;
    p.y += p.vy;

    // Draw particle with category/type specific styling
    const alpha = Math.sin((p.life / p.maxLife) * Math.PI);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = p.trappedInCore ? "#10b981" : p.color;
    ctx.globalAlpha = alpha;
    ctx.fill();

    // Halo for highlighted particles
    if (activeHighlight !== "all" && p.type === activeHighlight) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size + 2.5, 0, Math.PI * 2);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.globalAlpha = 1.0;
  }
}

function drawSmallArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string
) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  const angle = Math.atan2(toY - fromY, toX - fromX);
  const headLen = 5;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

// ========================================================
// CFD AIRFLOW VELOCITY VECTOR RENDERERS (CORE INSPECTOR)
// ========================================================

function drawInspectorCfdVectors(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  topLaneY: number,
  bottomLaneY: number,
  laneSpeedEastKmh: number,
  laneSpeedWestKmh: number,
  rpm: number
) {
  const step = 22;
  const time = performance.now() * 0.003;

  for (let x = cx - 220; x <= cx + 220; x += step) {
    if (x < 15 || x > w - 15) continue;
    for (let y = cy - 160; y <= cy + 160; y += step) {
      if (y < 15 || y > h - 15) continue;

      const dx = x - cx;
      const dy = y - cy;
      const r = Math.hypot(dx, dy);

      // 1. Two-way opposing traffic shear
      const shearY = (y - cy) / 30;
      const shearFactor = Math.tanh(shearY);
      const laneU =
        shearFactor < 0
          ? shearFactor * (laneSpeedWestKmh / 20) * 2.2
          : shearFactor * (laneSpeedEastKmh / 20) * 2.2;

      let u = laneU;
      let v = 0;

      let isNearRotor = false;
      let isInsideCore = false;

      // 2. CVWT 66cm Rotor induction & Hollow Core Suction Sink
      if (r < 140) {
        isNearRotor = true;
        // Swirl around Darrieus blades
        const omega = (rpm / 60) * Math.PI * 2;
        const swirlSpeed = Math.min(18, omega * Math.max(12, r * 0.35));
        const swirlU = (-dy / Math.max(5, r)) * swirlSpeed;
        const swirlV = (dx / Math.max(5, r)) * swirlSpeed;

        u = u * 0.35 + swirlU;
        v = v * 0.35 + swirlV;

        // Inward radial suction into hollow cylinder
        const suctionSpeed = Math.min(26, 42 / Math.max(6, r * 0.5));
        const inwardU = (-dx / Math.max(5, r)) * suctionSpeed;
        const inwardV = (-dy / Math.max(5, r)) * suctionSpeed;

        u += inwardU;
        v += inwardV;

        if (r < 24) {
          isInsideCore = true;
        }
      }

      const speed = Math.hypot(u, v);
      if (speed < 0.2) continue;

      let color = "#38bdf8"; // Cyan
      if (speed > 16 || isInsideCore) {
        color = "#a855f7"; // Purple / Core Vortex
      } else if (speed > 11) {
        color = "#f43f5e"; // Rose
      } else if (speed > 6) {
        color = "#10b981"; // Emerald
      }

      const nx = u / speed;
      const ny = v / speed;
      const len = Math.max(7, Math.min(16, speed * 1.1));
      const startX = x - nx * (len * 0.4);
      const startY = y - ny * (len * 0.4);
      const endX = x + nx * (len * 0.6);
      const endY = y + ny * (len * 0.6);

      const pulse = Math.sin(time * 4 - x * 0.04 + y * 0.04) * 0.2 + 0.8;
      const alpha = isNearRotor ? Math.min(0.95, 0.85 * pulse) : Math.min(0.6, 0.4 * pulse);

      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = isNearRotor ? (isInsideCore ? 2.2 : 1.6) : 1.1;

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      const headLen = isNearRotor ? 4.5 : 3.2;
      const angle = Math.atan2(ny, nx);
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - headLen * Math.cos(angle - Math.PI / 6),
        endY - headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        endX - headLen * Math.cos(angle + Math.PI / 6),
        endY - headLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fill();

      if (isInsideCore) {
        ctx.beginPath();
        ctx.arc(endX, endY, 2, 0, Math.PI * 2);
        ctx.fillStyle = "#c084fc";
        ctx.fill();
      }

      ctx.restore();
    }
  }
}

function drawAxialSectionCfdVectors(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  coreW: number,
  coreH: number,
  topY: number,
  bottomY: number,
  rpm: number
) {
  const time = performance.now() * 0.003;
  const leftWall = cx - coreW / 2;
  const rightWall = cx + coreW / 2;

  // 1. Inward lateral vectors entering through perforated side ports
  for (let y = topY + 25; y < bottomY - 20; y += 18) {
    const pulse = Math.sin(time * 4 + y * 0.1) * 0.2 + 0.8;

    // Left intake arrows (moving rightwards into core)
    for (let x = leftWall - 40; x <= leftWall + 25; x += 15) {
      const len = 12;
      ctx.save();
      ctx.strokeStyle = "#38bdf8";
      ctx.fillStyle = "#38bdf8";
      ctx.globalAlpha = 0.75 * pulse;
      ctx.lineWidth = 1.4;

      ctx.beginPath();
      ctx.moveTo(x - len / 2, y);
      ctx.lineTo(x + len / 2, y);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x + len / 2, y);
      ctx.lineTo(x + len / 2 - 4, y - 3);
      ctx.lineTo(x + len / 2 - 4, y + 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Right intake arrows (moving leftwards into core)
    for (let x = rightWall + 40; x >= rightWall - 25; x -= 15) {
      const len = 12;
      ctx.save();
      ctx.strokeStyle = "#38bdf8";
      ctx.fillStyle = "#38bdf8";
      ctx.globalAlpha = 0.75 * pulse;
      ctx.lineWidth = 1.4;

      ctx.beginPath();
      ctx.moveTo(x + len / 2, y);
      ctx.lineTo(x - len / 2, y);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x - len / 2, y);
      ctx.lineTo(x - len / 2 + 4, y - 3);
      ctx.lineTo(x - len / 2 + 4, y + 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // 2. Central Upward Chimney Vectors (Exhausting filtered air vertically)
  for (let y = bottomY - 15; y >= topY - 35; y -= 16) {
    const pulse = Math.sin(time * 5 - y * 0.08) * 0.2 + 0.8;
    const len = 14;

    ctx.save();
    ctx.strokeStyle = "#10b981";
    ctx.fillStyle = "#10b981";
    ctx.globalAlpha = 0.85 * pulse;
    ctx.lineWidth = 1.8;

    ctx.beginPath();
    ctx.moveTo(cx, y + len / 2);
    ctx.lineTo(cx, y - len / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, y - len / 2);
    ctx.lineTo(cx - 3.5, y - len / 2 + 5);
    ctx.lineTo(cx + 3.5, y - len / 2 + 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
