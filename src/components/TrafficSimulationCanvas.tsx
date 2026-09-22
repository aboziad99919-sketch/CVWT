import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Sliders,
  Gauge,
  Truck,
  Car,
  Wind,
  Filter,
  Flame,
  CheckCircle,
  AlertTriangle,
  Zap,
} from "lucide-react";
import { SimulatedVehicle, PollutantParticle, VehicleType, CVWTUnitTelemetry } from "../types";
import { TIMING_BELT_RIG_DEFAULT } from "../data/blueprintData";
import { SimulationSidebar } from "./SimulationSidebar";

interface TrafficSimulationCanvasProps {
  onTelemetryUpdate: (telemetry: {
    rpm: number;
    powerWatts: number;
    trappingRateUgS: number;
    trappedGrams: number;
    cadrM3h: number;
    filterSaturationDelta: number;
  }) => void;
  simulationMode: "highway_corridor" | "timing_belt_rig";
  setSimulationMode: (mode: "highway_corridor" | "timing_belt_rig") => void;
}

// Visual Glyph Component representing Wind Currents converging into CVWT Filter Core
const CfdInflowCoreGlyph: React.FC<{ active: boolean; size?: number }> = ({ active, size = 30 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      className="flex-shrink-0"
      aria-hidden="true"
    >
      {/* Outer stator / shear vortex boundary */}
      <circle
        cx="18"
        cy="18"
        r="15"
        stroke={active ? "#38bdf8" : "#475569"}
        strokeWidth="1"
        strokeDasharray="3 3"
        opacity={active ? 0.7 : 0.3}
      />

      {/* CVWT Hollow Filter Core Cylinder */}
      <circle
        cx="18"
        cy="18"
        r="5.5"
        fill={active ? "rgba(16, 185, 129, 0.35)" : "rgba(30, 41, 59, 0.5)"}
        stroke={active ? "#10b981" : "#64748b"}
        strokeWidth="1.5"
      />
      {/* Center particle suction sink */}
      <circle
        cx="18"
        cy="18"
        r="2"
        fill={active ? "#34d399" : "#475569"}
        className={active ? "animate-ping" : ""}
      />

      {/* Converging Inflow Wind Currents (Quadrant 1 - Top Left) */}
      <path
        d="M 5,6 Q 13,11 15.5,14"
        stroke={active ? "#38bdf8" : "#475569"}
        strokeWidth={active ? 1.8 : 1}
        strokeLinecap="round"
        strokeDasharray={active ? "4 2" : "none"}
      >
        {active && (
          <animate attributeName="stroke-dashoffset" from="12" to="0" dur="0.75s" repeatCount="indefinite" />
        )}
      </path>

      {/* Converging Inflow Wind Currents (Quadrant 2 - Top Right) */}
      <path
        d="M 31,6 Q 23,11 20.5,14"
        stroke={active ? "#f43f5e" : "#475569"}
        strokeWidth={active ? 1.8 : 1}
        strokeLinecap="round"
        strokeDasharray={active ? "4 2" : "none"}
      >
        {active && (
          <animate attributeName="stroke-dashoffset" from="12" to="0" dur="0.75s" repeatCount="indefinite" />
        )}
      </path>

      {/* Converging Inflow Wind Currents (Quadrant 3 - Bottom Left) */}
      <path
        d="M 5,30 Q 13,25 15.5,22"
        stroke={active ? "#38bdf8" : "#475569"}
        strokeWidth={active ? 1.8 : 1}
        strokeLinecap="round"
        strokeDasharray={active ? "4 2" : "none"}
      >
        {active && (
          <animate attributeName="stroke-dashoffset" from="12" to="0" dur="0.75s" repeatCount="indefinite" />
        )}
      </path>

      {/* Converging Inflow Wind Currents (Quadrant 4 - Bottom Right) */}
      <path
        d="M 31,30 Q 23,25 20.5,22"
        stroke={active ? "#10b981" : "#475569"}
        strokeWidth={active ? 1.8 : 1}
        strokeLinecap="round"
        strokeDasharray={active ? "4 2" : "none"}
      >
        {active && (
          <animate attributeName="stroke-dashoffset" from="12" to="0" dur="0.75s" repeatCount="indefinite" />
        )}
      </path>

      {/* Inward Vector Arrowheads entering the central filter core */}
      <polygon points="16.5,15.5 13.5,13 15,12" fill={active ? "#38bdf8" : "#475569"} />
      <polygon points="19.5,15.5 22.5,13 21,12" fill={active ? "#f43f5e" : "#475569"} />
      <polygon points="16.5,20.5 13.5,23 15,24" fill={active ? "#38bdf8" : "#475569"} />
      <polygon points="19.5,20.5 22.5,23 21,24" fill={active ? "#10b981" : "#475569"} />
    </svg>
  );
};

export const TrafficSimulationCanvas: React.FC<TrafficSimulationCanvasProps> = ({
  onTelemetryUpdate,
  simulationMode,
  setSimulationMode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Simulation parameters
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [trafficDensity, setTrafficDensity] = useState<number>(45); // vehicles per minute
  const [targetSpeedKmh, setTargetSpeedKmh] = useState<number>(85); // average speed km/h
  const [truckRatio, setTruckRatio] = useState<number>(22); // % heavy diesel
  const [ambientCrosswind, setAmbientCrosswind] = useState<number>(2.5); // m/s
  const [laneProximityM, setLaneProximityM] = useState<number>(1.1); // distance from inner lane to median CVWT (0.6 - 3.5m)
  const [vehicleSpacingM, setVehicleSpacingM] = useState<number>(24); // headway spacing between vehicles (10 - 60m)
  const [turbineSpacingM, setTurbineSpacingM] = useState<number>(15); // inter-turbine spacing (8 - 28m)
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true); // sidebar toggle
  const [isFilterActive, setIsFilterActive] = useState<boolean>(true);
  const [showStreamlines, setShowStreamlines] = useState<boolean>(true);
  const [showParticleVectors, setShowParticleVectors] = useState<boolean>(true);
  const [showCfdVectors, setShowCfdVectors] = useState<boolean>(true);
  const [showPollutantHeatmap, setShowPollutantHeatmap] = useState<boolean>(true);
  const [pollutantFilter, setPollutantFilter] = useState<"all" | "exhaust" | "non_exhaust">("all");
  const [heatmapStats, setHeatmapStats] = useState<{
    peakUgM3: number;
    avgUgM3: number;
    cvwtReductionPct: number;
  }>({
    peakUgM3: 172.5,
    avgUgM3: 54.8,
    cvwtReductionPct: 46.2,
  });

  const heatmapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Live simulation states
  const [trappedTotalGrams, setTrappedTotalGrams] = useState<number>(14.2);
  const [exhaustTrappedGrams, setExhaustTrappedGrams] = useState<number>(6.8);
  const [nonExhaustTrappedGrams, setNonExhaustTrappedGrams] = useState<number>(7.4);
  const [instantaneousTrappingRate, setInstantaneousTrappingRate] = useState<number>(38.5);
  const [liveRpm, setLiveRpm] = useState<number>(142);
  const [powerGeneratedWatts, setPowerGeneratedWatts] = useState<number>(86.4);

  // References to preserve simulation state across renders
  const stateRef = useRef<{
    vehicles: SimulatedVehicle[];
    particles: PollutantParticle[];
    turbines: Array<{
      id: string;
      x: number;
      rpm: number;
      bladeAngle: number;
      power: number;
      trappedCount: number;
    }>;
    lastTime: number;
    nextParticleId: number;
    nextVehicleId: number;
    totalTrappedGrams: number;
    exhaustTrappedGrams: number;
    nonExhaustTrappedGrams: number;
    lastTurbineSpacing?: number;
  }>({
    vehicles: [],
    particles: [],
    turbines: [
      { id: "T1", x: 180, rpm: 135, bladeAngle: 0, power: 80, trappedCount: 0 },
      { id: "T2", x: 380, rpm: 145, bladeAngle: 0.8, power: 92, trappedCount: 0 },
      { id: "T3", x: 580, rpm: 140, bladeAngle: 1.6, power: 85, trappedCount: 0 },
      { id: "T4", x: 780, rpm: 138, bladeAngle: 2.4, power: 82, trappedCount: 0 },
    ],
    lastTime: performance.now(),
    nextParticleId: 1,
    nextVehicleId: 1,
    totalTrappedGrams: 14.2,
    exhaustTrappedGrams: 6.8,
    nonExhaustTrappedGrams: 7.4,
  });

  // Main Simulation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const spawnVehicle = (w: number) => {
      const state = stateRef.current;
      const isEastbound = Math.random() > 0.5; // Eastbound = top lanes (moves right), Westbound = bottom lanes (moves left)
      const isTruck = Math.random() * 100 < truckRatio;
      const isEv = !isTruck && Math.random() < 0.25;

      let type: VehicleType = isTruck ? "heavy_truck" : isEv ? "ev" : Math.random() > 0.4 ? "suv" : "sedan";
      const laneIndex = Math.random() > 0.5 ? 0 : 1; // 0 = inner (near median), 1 = outer
      const direction = isEastbound ? "eastbound" : "westbound";

      // Enforce vehicle headway spacing
      const minSpacingPx = vehicleSpacingM * 4.6;
      const spawnX = isEastbound ? -70 : w + 70;
      const tooClose = state.vehicles.some((v: SimulatedVehicle) => {
        if (v.direction !== direction || v.laneIndex !== laneIndex) return false;
        return Math.abs(v.x - spawnX) < minSpacingPx;
      });
      if (tooClose) return;

      const speedSpread = (Math.random() - 0.5) * 15;
      const speed = Math.max(40, targetSpeedKmh + speedSpread);

      const lengthM = type === "heavy_truck" ? 65 : type === "suv" ? 42 : 36;
      const widthM = type === "heavy_truck" ? 22 : 18;
      const colors = {
        sedan: ["#38bdf8", "#818cf8", "#cbd5e1", "#f8fafc"],
        suv: ["#f59e0b", "#10b981", "#64748b", "#0284c7"],
        heavy_truck: ["#ef4444", "#ea580c", "#b91c1c"],
        bus: ["#3b82f6", "#eab308"],
        ev: ["#10b981", "#06b6d4"],
      };

      const colorOptions = colors[type];
      const color = colorOptions[Math.floor(Math.random() * colorOptions.length)];

      const exhaustRate =
        type === "heavy_truck"
          ? 85 + Math.random() * 40
          : type === "ev"
          ? 0 // Zero tailpipe emissions
          : 22 + Math.random() * 15;

      const brakeRate = 4.5 + Math.random() * 4.0;
      const tireRate = 6.2 + Math.random() * 5.0;
      const dustRate = 8.0 + Math.random() * 6.0;

      const newVehicle: SimulatedVehicle = {
        id: `veh-${state.nextVehicleId++}`,
        type,
        direction: isEastbound ? "eastbound" : "westbound",
        laneIndex,
        x: isEastbound ? -lengthM - 20 : w + 40,
        speedKmh: speed,
        lengthM,
        widthM,
        color,
        exhaustEmissionRateUgS: exhaustRate,
        brakeEmissionRateUgS: brakeRate,
        tireEmissionRateUgS: tireRate,
        dustResuspensionRateUgS: dustRate,
        exhaustX: 0,
        exhaustY: 0,
        wheelPositions: [],
      };

      state.vehicles.push(newVehicle);
    };

    const render = (time: number) => {
      const state = stateRef.current;
      const dt = Math.min(0.1, (time - state.lastTime) / 1000);
      state.lastTime = time;

      // Handle canvas resolution
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * window.devicePixelRatio || canvas.height !== rect.height * window.devicePixelRatio) {
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
      }

      ctx.save();
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      const w = rect.width;
      const h = rect.height;

      // Clear road background
      ctx.fillStyle = "#090d16";
      ctx.fillRect(0, 0, w, h);

      if (simulationMode === "highway_corridor") {
        renderHighwayMode(
          ctx,
          w,
          h,
          dt,
          isRunning,
          trafficDensity,
          targetSpeedKmh,
          truckRatio,
          ambientCrosswind,
          laneProximityM,
          vehicleSpacingM,
          turbineSpacingM,
          isFilterActive,
          showStreamlines,
          showParticleVectors,
          showCfdVectors,
          pollutantFilter,
          state,
          spawnVehicle
        );
      } else {
        renderTimingBeltMode(
          ctx,
          w,
          h,
          dt,
          isRunning,
          targetSpeedKmh,
          isFilterActive,
          showStreamlines,
          showCfdVectors,
          state
        );
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [
    isRunning,
    trafficDensity,
    targetSpeedKmh,
    truckRatio,
    ambientCrosswind,
    laneProximityM,
    vehicleSpacingM,
    turbineSpacingM,
    isFilterActive,
    showStreamlines,
    showParticleVectors,
    showCfdVectors,
    pollutantFilter,
    simulationMode,
  ]);

  // Periodic Telemetry sync to parent
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isRunning) return;
      const state = stateRef.current;
      const avgRpm =
        state.turbines.reduce((acc, t) => acc + t.rpm, 0) / (state.turbines.length || 1);
      const totalPower = state.turbines.reduce((acc, t) => acc + t.power, 0);

      // Trapping rate calculation scaled by aerodynamic proximity & spacing physics
      const proximityFactor = Math.min(1.0, Math.max(0.18, 1.25 / Math.pow(laneProximityM, 1.35)));
      const spacingFactor = Math.min(1.0, Math.max(0.45, Math.pow(24 / Math.max(10, vehicleSpacingM), 0.32)));
      const speedFactor = Math.min(1.0, Math.max(0.55, Math.pow(targetSpeedKmh / 95, 0.4)));
      const crosswindFactor = Math.max(0.5, 1.0 - ambientCrosswind * 0.06);
      const efficiencyRatio = proximityFactor * spacingFactor * speedFactor * crosswindFactor;

      const baseRate = (avgRpm / 140) * 38.5 + (truckRatio / 20) * 12.0;
      const rate = isFilterActive ? baseRate * efficiencyRatio : 0;

      const cadr = isFilterActive ? avgRpm * 0.45 * state.turbines.length : 0;
      const addedGrams = isFilterActive ? (rate * 0.5) / 1e6 : 0;
      state.totalTrappedGrams += addedGrams;

      setLiveRpm(avgRpm);
      setPowerGeneratedWatts(totalPower);
      setInstantaneousTrappingRate(rate);
      setTrappedTotalGrams(state.totalTrappedGrams);

      onTelemetryUpdate({
        rpm: avgRpm,
        powerWatts: totalPower,
        trappingRateUgS: rate,
        trappedGrams: state.totalTrappedGrams,
        cadrM3h: cadr,
        filterSaturationDelta: isFilterActive ? 0.002 * (rate / 30) : 0,
      });
    }, 500);

    return () => clearInterval(interval);
  }, [
    isRunning,
    isFilterActive,
    truckRatio,
    laneProximityM,
    vehicleSpacingM,
    targetSpeedKmh,
    ambientCrosswind,
    onTelemetryUpdate,
  ]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col h-full">
      {/* Simulation Header Controls */}
      <div className="bg-slate-950/90 px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <Car className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wider font-mono">
                Two-Way Aerodynamic & Pollutant Simulator
              </h2>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                {simulationMode === "highway_corridor" ? "Highway Median" : "Timing Belt DWG 9/22/2026"}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {simulationMode === "highway_corridor"
                ? "Opposing vehicle wake shear inducing CVWT rotation & centrifugal particulate capture"
                : "Loai Abouelezz Dual-Belt Highway Test Channel (25.2m x 7.4m scale rig)"}
            </p>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setSimulationMode("highway_corridor")}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              simulationMode === "highway_corridor"
                ? "bg-sky-500 text-slate-950 font-semibold shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Highway Median
          </button>
          <button
            onClick={() => setSimulationMode("timing_belt_rig")}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              simulationMode === "timing_belt_rig"
                ? "bg-sky-500 text-slate-950 font-semibold shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Timing Belt Rig (DWG)
          </button>
        </div>

        {/* CFD Inflow Vectors Header Quick Toggle */}
        <button
          id="header-cfd-vectors-toggle"
          onClick={() => setShowCfdVectors(!showCfdVectors)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
            showCfdVectors
              ? "bg-sky-500/15 text-sky-200 border-sky-400/60 shadow-sm shadow-sky-500/15"
              : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
          }`}
          title="Toggle CFD (Computational Fluid Dynamics) Airflow Vectors: Visually represents wind currents flowing into CVWT filter core"
        >
          <CfdInflowCoreGlyph active={showCfdVectors} size={18} />
          <span className="font-mono">CFD Flow:</span>
          <span className={showCfdVectors ? "text-emerald-400 font-bold" : "text-slate-500"}>
            {showCfdVectors ? "ACTIVE" : "OFF"}
          </span>
        </button>

        {/* Variables Panel Toggle Button */}
        <button
          id="simulation-sidebar-toggle-btn"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold font-mono transition-all ${
            isSidebarOpen
              ? "bg-sky-500/20 text-sky-200 border-sky-400/60 shadow-sm shadow-sky-500/10"
              : "bg-slate-900 text-slate-300 border-slate-700 hover:text-white hover:bg-slate-800"
          }`}
          title="Toggle Simulation Variables & Pollutant Performance Sliders"
        >
          <Sliders className="h-3.5 w-3.5 text-sky-400" />
          <span>Variables Panel</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
              isSidebarOpen ? "bg-sky-500 text-slate-950 font-bold" : "bg-slate-800 text-slate-400"
            }`}
          >
            {isSidebarOpen ? "OPEN" : "COLLAPSED"}
          </span>
        </button>

        {/* Play/Pause & Reset */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              isRunning
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30"
                : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
            }`}
          >
            {isRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            <span>{isRunning ? "Pause" : "Resume"}</span>
          </button>
          <button
            onClick={() => {
              const state = stateRef.current;
              state.vehicles = [];
              state.particles = [];
              state.totalTrappedGrams = 0;
              setTrappedTotalGrams(0);
            }}
            title="Reset Simulation"
            className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 text-xs transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Simulation Body: Canvas Viewport + Collapsible SimulationSidebar */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden relative">
        {/* Main Canvas Viewport */}
        <div className="relative flex-1 min-h-[380px] w-full bg-slate-950 overflow-hidden flex flex-col min-w-0">
          <canvas ref={canvasRef} className="w-full h-full block flex-1" />

          {/* Floating Sidebar Reopen Button if collapsed */}
          {!isSidebarOpen && (
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="absolute top-3 right-3 z-20 flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-sky-500/40 text-sky-300 text-xs font-mono shadow-2xl transition-all hover:scale-105"
              title="Open Simulation Variables & Pollutant Trapping Performance Sidebar"
            >
              <Sliders className="h-3.5 w-3.5 text-sky-400" />
              <span>Variables & Sliders</span>
            </button>
          )}

        {/* Real-time Trapping Stats HUD */}
        <div className="absolute top-3 left-3 bg-slate-950/90 backdrop-blur-md p-3.5 rounded-xl border border-slate-800 text-xs space-y-2 pointer-events-none shadow-2xl max-w-xs">
          <div className="flex items-center justify-between text-[11px] font-mono font-bold text-sky-400 uppercase">
            <span>Core Trapping Dynamics</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>

          <div className="flex items-center justify-between gap-6">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-emerald-400" />
              Trapping Rate:
            </span>
            <span className="font-mono font-bold text-emerald-400">
              {isFilterActive ? `${instantaneousTrappingRate.toFixed(1)} µg/s` : "0.0 µg/s (BYPASS)"}
            </span>
          </div>

          <div className="flex items-center justify-between gap-6">
            <span className="text-slate-400 flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-sky-400" />
              Total Trapped:
            </span>
            <span className="font-mono font-bold text-sky-400">
              {trappedTotalGrams.toFixed(2)} g PM
            </span>
          </div>

          {/* Breakdown: Exhaust vs Non-Exhaust */}
          <div className="pt-1.5 border-t border-slate-800 space-y-1 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-red-300 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-500" /> Exhaust (Soot/PM):
              </span>
              <span className="font-mono font-bold text-red-400">
                {(trappedTotalGrams * 0.46).toFixed(2)} g (46%)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sky-300 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-sky-400" /> Non-Exhaust (Brake/Tire/Dust):
              </span>
              <span className="font-mono font-bold text-sky-400">
                {(trappedTotalGrams * 0.54).toFixed(2)} g (54%)
              </span>
            </div>
          </div>

          <div className="pt-1 border-t border-slate-800 flex items-center justify-between gap-6">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              Kinetic Power:
            </span>
            <span className="font-mono font-bold text-amber-400">
              {Math.round(powerGeneratedWatts)} W
            </span>
          </div>
        </div>

        {/* Category Filter Selector Buttons (Center Top) */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-slate-950/90 backdrop-blur-md p-1 rounded-xl border border-slate-800 flex items-center gap-1 text-xs shadow-xl">
          <button
            onClick={() => setPollutantFilter("all")}
            className={`px-3 py-1 rounded-lg font-medium transition-colors ${
              pollutantFilter === "all"
                ? "bg-slate-700 text-slate-100 font-semibold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            All Pollutants
          </button>
          <button
            onClick={() => setPollutantFilter("exhaust")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition-colors ${
              pollutantFilter === "exhaust"
                ? "bg-red-500/30 text-red-200 border border-red-500/40 font-semibold"
                : "text-red-400/80 hover:text-red-300"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-red-500" />
            Exhaust Only
          </button>
          <button
            onClick={() => setPollutantFilter("non_exhaust")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition-colors ${
              pollutantFilter === "non_exhaust"
                ? "bg-sky-500/30 text-sky-200 border border-sky-500/40 font-semibold"
                : "text-sky-400/80 hover:text-sky-300"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            Non-Exhaust (Brake / Tire / Dust)
          </button>
        </div>

        {/* Legend Overlay */}
        <div className="absolute bottom-3 left-3 bg-slate-950/85 backdrop-blur-md px-3 py-2 rounded-lg border border-slate-800 text-[11px] flex flex-wrap items-center gap-3 pointer-events-none">
          <span className="text-slate-400 font-semibold">PARTICLES:</span>
          <span className="flex items-center gap-1 text-red-400">
            <span className="h-2 w-2 rounded-full bg-red-500" /> Combustion Soot
          </span>
          <span className="flex items-center gap-1 text-amber-400">
            <span className="h-2 w-2 rounded-full bg-amber-500" /> Tailpipe PM2.5
          </span>
          <span className="flex items-center gap-1 text-slate-200">
            <span className="h-2 w-2 rounded-full bg-slate-200" /> Brake Caliper Dust
          </span>
          <span className="flex items-center gap-1 text-sky-400">
            <span className="h-2 w-2 rounded-full bg-sky-400" /> Tire Microplastics
          </span>
          <span className="flex items-center gap-1 text-amber-600">
            <span className="h-2 w-2 rounded-full bg-amber-600" /> Resuspended Dust
          </span>
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Trapped in Core
          </span>
        </div>

        {/* Trapping Active Toggle & CFD Vectors in Top Right */}
        <div className="absolute top-3 right-3 flex items-center gap-2.5 z-20">
          {/* UI Toggle: CFD-based Airflow Vectors representing Wind Currents flowing into CVWT Filter Core */}
          <button
            id="cfd-airflow-vectors-toggle"
            onClick={() => setShowCfdVectors(!showCfdVectors)}
            className={`group relative flex items-center gap-2.5 px-3 py-1.5 rounded-xl border text-xs font-semibold shadow-xl transition-all duration-300 ${
              showCfdVectors
                ? "bg-slate-950/95 text-sky-200 border-sky-400/80 shadow-sky-500/25 ring-1 ring-sky-400/50"
                : "bg-slate-950/85 text-slate-400 border-slate-700/80 hover:text-slate-200 hover:border-slate-600"
            }`}
            title="Toggle CFD-based Airflow Vectors: Visually represents wind currents flowing into the CVWT filter core"
          >
            {/* Visual representation of wind currents entering core */}
            <div
              className={`p-1 rounded-lg border transition-colors ${
                showCfdVectors
                  ? "bg-sky-500/15 border-sky-400/40 text-sky-300"
                  : "bg-slate-900 border-slate-800 text-slate-500"
              }`}
            >
              <CfdInflowCoreGlyph active={showCfdVectors} size={28} />
            </div>

            <div className="flex flex-col text-left leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold tracking-tight">CFD Airflow Vectors</span>
                {showCfdVectors && (
                  <span className="flex h-1.5 w-1.5 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                  </span>
                )}
              </div>
              <span className="text-[10px] font-normal text-slate-400">
                {showCfdVectors ? (
                  <span className="text-sky-300 font-medium flex items-center gap-1">
                    <span className="inline-block h-1 w-1 rounded-full bg-sky-400 animate-pulse" />
                    Wind Currents → Core Inflow
                  </span>
                ) : (
                  "Show Core Inflow Currents"
                )}
              </span>
            </div>

            {/* Pill Switch */}
            <div
              className={`relative w-8 h-4 rounded-full p-0.5 transition-colors ${
                showCfdVectors ? "bg-sky-500" : "bg-slate-700"
              }`}
            >
              <div
                className={`w-3 h-3 rounded-full bg-slate-950 shadow-md transform transition-transform ${
                  showCfdVectors ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </div>
          </button>

          <button
            id="filter-bypass-toggle"
            onClick={() => setIsFilterActive(!isFilterActive)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold shadow-xl transition-all ${
              isFilterActive
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-emerald-500/10"
                : "bg-red-500/20 text-red-300 border-red-500/50 shadow-red-500/10"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            <span>{isFilterActive ? "Filter: ACTIVE" : "Filter: BYPASS"}</span>
          </button>
        </div>

        {/* CFD Velocity Scale & Trapping Path HUD Overlay */}
        {showCfdVectors && (
          <div className="absolute bottom-3 right-3 bg-slate-950/95 backdrop-blur-md px-4 py-3 rounded-xl border border-sky-500/40 text-xs shadow-2xl space-y-2 max-w-sm pointer-events-none z-10 ring-1 ring-sky-500/20">
            <div className="flex items-center justify-between text-[11px] font-mono font-bold text-sky-400 uppercase">
              <span className="flex items-center gap-1.5">
                <Wind className="h-4 w-4 text-sky-400 animate-pulse" /> CFD Airflow Inflow Field
              </span>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30 font-mono">
                Navier-Stokes Shear
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-300 font-mono">
              <span>0 m/s</span>
              <div className="flex-1 h-2 rounded bg-gradient-to-r from-sky-500 via-emerald-400 via-amber-400 to-rose-500 shadow-inner" />
              <span>20+ m/s</span>
            </div>
            <div className="pt-1 border-t border-slate-800/80 text-[10px] text-slate-300 leading-relaxed space-y-1">
              <div className="flex items-center justify-between text-slate-200">
                <span className="flex items-center gap-1 text-emerald-300 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Centrifugal Core Suction:
                </span>
                <span className="font-mono font-bold text-emerald-400">ΔP ≈ -38 Pa</span>
              </div>
              <p>
                Opposing vehicle wakes create shear slipstream ($dU/dy$) accelerating the rotor, while centrifugal pressure gradients draw wind and particulates into the central hollow filter core.
              </p>
            </div>
          </div>
          )}
        </div>

        {/* Dedicated Simulation Sidebar Panel */}
        <SimulationSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          laneProximityM={laneProximityM}
          setLaneProximityM={setLaneProximityM}
          vehicleSpacingM={vehicleSpacingM}
          setVehicleSpacingM={setVehicleSpacingM}
          turbineSpacingM={turbineSpacingM}
          setTurbineSpacingM={setTurbineSpacingM}
          targetSpeedKmh={targetSpeedKmh}
          setTargetSpeedKmh={setTargetSpeedKmh}
          trafficDensity={trafficDensity}
          setTrafficDensity={setTrafficDensity}
          truckRatio={truckRatio}
          setTruckRatio={setTruckRatio}
          ambientCrosswind={ambientCrosswind}
          setAmbientCrosswind={setAmbientCrosswind}
          isFilterActive={isFilterActive}
          setIsFilterActive={setIsFilterActive}
          showCfdVectors={showCfdVectors}
          setShowCfdVectors={setShowCfdVectors}
          showStreamlines={showStreamlines}
          setShowStreamlines={setShowStreamlines}
          showParticleVectors={showParticleVectors}
          setShowParticleVectors={setShowParticleVectors}
          pollutantFilter={pollutantFilter}
          setPollutantFilter={setPollutantFilter}
          liveRpm={liveRpm}
          trappingRateUgS={instantaneousTrappingRate}
          trappedTotalGrams={trappedTotalGrams}
          powerWatts={powerGeneratedWatts}
          turbineCount={stateRef.current.turbines.length}
        />
      </div>

      {/* Control Sliders Panel (Bottom Quick Bar) */}
      <div className="p-3 bg-slate-950 border-t border-slate-800 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
        <div>
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span>Lane Proximity:</span>
            <span className="font-mono text-amber-400 font-semibold">{laneProximityM.toFixed(1)} m</span>
          </div>
          <input
            type="range"
            min="0.6"
            max="3.5"
            step="0.1"
            value={laneProximityM}
            onChange={(e) => setLaneProximityM(Number(e.target.value))}
            className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            title="Distance from CVWT rotor perimeter to nearest vehicle tire line (Optimal: 0.85 - 1.1m)"
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span>Vehicle Spacing:</span>
            <span className="font-mono text-sky-400 font-semibold">{vehicleSpacingM} m</span>
          </div>
          <input
            type="range"
            min="10"
            max="60"
            step="2"
            value={vehicleSpacingM}
            onChange={(e) => setVehicleSpacingM(Number(e.target.value))}
            className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            title="Headway distance between successive vehicles (Optimal: 18 - 28m)"
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span>Traffic Speed:</span>
            <span className="font-mono text-slate-200">{targetSpeedKmh} km/h</span>
          </div>
          <input
            type="range"
            min="40"
            max="130"
            value={targetSpeedKmh}
            onChange={(e) => setTargetSpeedKmh(Number(e.target.value))}
            className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span>Heavy Diesel:</span>
            <span className="font-mono text-red-400">{truckRatio}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="50"
            value={truckRatio}
            onChange={(e) => setTruckRatio(Number(e.target.value))}
            className="w-full accent-red-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>

        <div className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            id="showCfdVectors"
            checked={showCfdVectors}
            onChange={(e) => setShowCfdVectors(e.target.checked)}
            className="rounded accent-sky-400 cursor-pointer"
          />
          <label htmlFor="showCfdVectors" className="text-slate-300 cursor-pointer flex items-center gap-1">
            <Wind className="h-3 w-3 text-sky-400" />
            CFD Vectors
          </label>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            id="showStreamlines"
            checked={showStreamlines}
            onChange={(e) => setShowStreamlines(e.target.checked)}
            className="rounded accent-sky-500 cursor-pointer"
          />
          <label htmlFor="showStreamlines" className="text-slate-300 cursor-pointer">
            Wake Lines
          </label>
        </div>

        <div className="flex items-center justify-end pt-1">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 font-mono text-[11px] transition-colors"
          >
            <Sliders className="h-3 w-3 text-sky-400" />
            <span>{isSidebarOpen ? "Hide Panel" : "All Sliders"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ========================================================
// HIGHWAY MODE RENDERER: TWO-WAY LANES & MEDIAN CVWT ARRAY
// ========================================================

function renderHighwayMode(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  dt: number,
  isRunning: boolean,
  trafficDensity: number,
  targetSpeedKmh: number,
  truckRatio: number,
  ambientCrosswind: number,
  laneProximityM: number,
  vehicleSpacingM: number,
  turbineSpacingM: number,
  isFilterActive: boolean,
  showStreamlines: boolean,
  showParticleVectors: boolean,
  showCfdVectors: boolean,
  pollutantFilter: "all" | "exhaust" | "non_exhaust",
  state: any,
  spawnVehicle: (w: number) => void
) {
  const roadCenterY = h / 2;
  const laneHeight = 44;
  const medianHeight = 32;

  // Lane proximity clearance: 0.6m -> ~10px, 1.1m -> ~18px, 3.5m -> ~58px
  const medianClearancePx = Math.max(8, Math.round(laneProximityM * 16.5));

  const topLane1Y = roadCenterY - medianHeight / 2 - medianClearancePx - laneHeight;
  const topLane2Y = topLane1Y - laneHeight;
  const bottomLane1Y = roadCenterY + medianHeight / 2 + medianClearancePx;
  const bottomLane2Y = bottomLane1Y + laneHeight;

  const roadTop = topLane2Y - 14;
  const roadBottom = bottomLane2Y + laneHeight + 14;
  const roadHeight = roadBottom - roadTop;

  // Draw Asphalt Road Surface
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, roadTop, w, roadHeight);

  // Outer road shoulders and guardrails
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, roadTop, w, 14);
  ctx.fillRect(0, bottomLane2Y + laneHeight, w, 14);

  // Inner Median Paved Shoulders (responsive to lane proximity)
  ctx.fillStyle = "#0c1322";
  ctx.fillRect(0, topLane1Y + laneHeight, w, medianClearancePx);
  ctx.fillRect(0, roadCenterY + medianHeight / 2, w, medianClearancePx);

  // Solid yellow inner shoulder lines
  ctx.strokeStyle = "#eab308";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, topLane1Y + laneHeight);
  ctx.lineTo(w, topLane1Y + laneHeight);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, bottomLane1Y);
  ctx.lineTo(w, bottomLane1Y);
  ctx.stroke();

  // Lane separator dashed markings
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 2;
  ctx.setLineDash([16, 16]);

  // Top dividing line (between Lane 1 & 2 westbound)
  ctx.beginPath();
  ctx.moveTo(0, topLane1Y);
  ctx.lineTo(w, topLane1Y);
  ctx.stroke();

  // Bottom dividing line (between Lane 1 & 2 eastbound)
  ctx.beginPath();
  ctx.moveTo(0, bottomLane2Y);
  ctx.lineTo(w, bottomLane2Y);
  ctx.stroke();
  ctx.setLineDash([]); // reset

  // Highway Median Barrier
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, roadCenterY - medianHeight / 2, w, medianHeight);
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0, roadCenterY - medianHeight / 2, w, medianHeight);

  // Direction Arrows on Roadway
  ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
  ctx.font = "bold 11px JetBrains Mono, monospace";
  for (let x = 120; x < w; x += 320) {
    ctx.fillText("◀ WESTBOUND (LANE A)", x, topLane1Y + 26);
    ctx.fillText("EASTBOUND (LANE B) ▶", x, bottomLane1Y + 26);
  }

  // Draw median clearance annotation labels
  ctx.fillStyle = "rgba(234, 179, 8, 0.55)";
  ctx.font = "9px JetBrains Mono, monospace";
  ctx.fillText(`Median Gap: ${laneProximityM.toFixed(1)}m`, 14, roadCenterY - medianHeight / 2 - 3);
  ctx.fillText(`Median Gap: ${laneProximityM.toFixed(1)}m`, 14, roadCenterY + medianHeight / 2 + 10);

  // Update & Draw CVWT Turbine Units on Median based on turbineSpacingM
  const turbineSpacingPx = Math.max(90, Math.round(turbineSpacingM * 13));
  const numTurbines = Math.max(2, Math.floor(w / turbineSpacingPx) + 1);

  // Sync turbine list to width and spacing
  if (state.turbines.length !== numTurbines || state.lastTurbineSpacing !== turbineSpacingPx) {
    state.lastTurbineSpacing = turbineSpacingPx;
    state.turbines = [];
    const startX = Math.max(50, (w - (numTurbines - 1) * turbineSpacingPx) / 2);
    for (let i = 0; i < numTurbines; i++) {
      state.turbines.push({
        id: `T${i + 1}`,
        x: startX + i * turbineSpacingPx,
        rpm: 120 + Math.random() * 30,
        bladeAngle: (i * 0.7) % (Math.PI * 2),
        power: 75,
        trappedCount: 0,
      });
    }
  }

  // Calculate local airflow induction from passing vehicles
  state.turbines.forEach((t: any) => {
    let inducedVelocityMs = 3.5; // ambient wind baseline

    state.vehicles.forEach((veh: any) => {
      const vehY =
        veh.direction === "westbound"
          ? veh.laneIndex === 0
            ? topLane1Y + 22
            : topLane2Y + 22
          : veh.laneIndex === 0
          ? bottomLane1Y + 22
          : bottomLane2Y + 22;

      const dx = Math.abs(veh.x - t.x);
      const dy = Math.abs(vehY - roadCenterY);
      const dist2D = Math.hypot(dx, dy);

      if (dist2D < 160) {
        // Vehicle speed in m/s
        const vMs = (veh.speedKmh * 1000) / 3600;
        const dragFactor = veh.type === "heavy_truck" ? 0.38 : 0.22;
        // Lateral decay with distance from median
        const lateralDecay = 1 / (1 + Math.pow(dy / 50, 1.8));
        inducedVelocityMs += dragFactor * (1 - dist2D / 160) * lateralDecay * (vMs * 0.42);
      }
    });

    const targetRpm = Math.min(280, inducedVelocityMs * 16.5);
    t.rpm += (targetRpm - t.rpm) * 0.08;
    t.power = 0.5 * 1.225 * 0.818 * Math.pow(Math.max(1, t.rpm / 16.5), 3) * 0.28;
    t.bladeAngle += (t.rpm * 2 * Math.PI * dt) / 60;

    // Draw CVWT unit top view on median
    drawCVWTTopView(ctx, t.x, roadCenterY, t.bladeAngle, t.rpm, isFilterActive);
  });

  // Spawn new vehicles if running
  if (isRunning) {
    const spawnChance = (trafficDensity / 60) * dt;
    if (Math.random() < spawnChance) {
      spawnVehicle(w);
    }
  }

  // Update & Draw Vehicles with spacing headway logic
  for (let i = state.vehicles.length - 1; i >= 0; i--) {
    const veh = state.vehicles[i];

    // Vehicle headway spacing adjustment
    const minFollowDist = vehicleSpacingM * 3.6;
    let aheadDist = 9999;
    for (let j = 0; j < state.vehicles.length; j++) {
      if (j === i) continue;
      const other = state.vehicles[j];
      if (other.direction === veh.direction && other.laneIndex === veh.laneIndex) {
        const deltaX = veh.direction === "eastbound" ? other.x - veh.x : veh.x - other.x;
        if (deltaX > 0 && deltaX < aheadDist) {
          aheadDist = deltaX;
        }
      }
    }

    let effectiveSpeed = veh.speedKmh;
    if (aheadDist < minFollowDist) {
      effectiveSpeed = Math.max(25, veh.speedKmh * (aheadDist / minFollowDist));
    }

    const speedMs = (effectiveSpeed * 1000) / 3600;
    const pxPerSec = speedMs * 3.5;

    if (isRunning) {
      if (veh.direction === "eastbound") {
        veh.x += pxPerSec * dt;
      } else {
        veh.x -= pxPerSec * dt;
      }

      // Emit particulate matter from tailpipe
      const vehY =
        veh.direction === "westbound"
          ? veh.laneIndex === 0
            ? topLane1Y + 22
            : topLane2Y + 22
          : veh.laneIndex === 0
          ? bottomLane1Y + 22
          : bottomLane2Y + 22;

      veh.exhaustX = veh.direction === "eastbound" ? veh.x - veh.lengthM / 2 : veh.x + veh.lengthM / 2;
      veh.exhaustY = vehY;

      // Spawn exhaust particles (Combustion Soot / Tailpipe PM2.5) if not EV
      if (veh.type !== "ev" && Math.random() < 0.6) {
        const isSoot = veh.type === "heavy_truck" || Math.random() < 0.45;
        state.particles.push({
          id: state.nextParticleId++,
          x: veh.exhaustX,
          y: veh.exhaustY + (Math.random() - 0.5) * 6,
          z: 0.5,
          vx: veh.direction === "eastbound" ? -speedMs * 0.08 : speedMs * 0.08,
          vy: (Math.random() - 0.5) * 1.2 + (ambientCrosswind * 0.2),
          vz: 0,
          category: "exhaust",
          type: isSoot ? "combustion_soot" : "tailpipe_pm25",
          emissionSource: "tailpipe",
          aerodynamicDiameterUm: isSoot ? 0.35 : 1.2,
          densityGPerCm3: 1.8,
          size: isSoot ? 3.0 : 2.0,
          color: isSoot ? "#ef4444" : "#f97316",
          opacity: 0.9,
          life: 0,
          maxLife: 95,
          status: "active",
        });
      }

      // Spawn non-exhaust particles (Brake dust, Tire wear, Resuspended road dust)
      if (Math.random() < 0.4) {
        const roll = Math.random();
        let nonExhaustType: any = "brake_wear";
        let nonExhaustColor = "#e2e8f0";
        let nonExhaustSize = 2.2;
        let nonExhaustDiam = 1.5;
        let pY = veh.exhaustY + (Math.random() - 0.5) * veh.widthM;

        if (roll < 0.35) {
          nonExhaustType = "brake_wear";
          nonExhaustColor = "#e2e8f0"; // Metallic silver/white brake dust
          nonExhaustSize = 2.2;
          nonExhaustDiam = 1.5;
        } else if (roll < 0.7) {
          nonExhaustType = "tire_wear";
          nonExhaustColor = "#38bdf8"; // Cyan tire wear microplastic
          nonExhaustSize = 3.2;
          nonExhaustDiam = 6.0;
        } else {
          nonExhaustType = "resuspended_dust";
          nonExhaustColor = "#d97706"; // Amber ground dust
          nonExhaustSize = 3.8;
          nonExhaustDiam = 12.0;
        }

        state.particles.push({
          id: state.nextParticleId++,
          x: veh.x + (Math.random() - 0.5) * veh.lengthM,
          y: pY,
          z: 0.2,
          vx: veh.direction === "eastbound" ? speedMs * 0.04 : -speedMs * 0.04,
          vy: (Math.random() - 0.5) * 1.5,
          vz: 0,
          category: "non_exhaust",
          type: nonExhaustType,
          emissionSource: nonExhaustType === "brake_wear" ? "brake_caliper" : nonExhaustType === "tire_wear" ? "tire_contact_patch" : "underbody_resuspension",
          aerodynamicDiameterUm: nonExhaustDiam,
          densityGPerCm3: 2.2,
          size: nonExhaustSize,
          color: nonExhaustColor,
          opacity: 0.85,
          life: 0,
          maxLife: 105,
          status: "active",
        });
      }
    }

    // Determine Y coordinate
    const vehY =
      veh.direction === "westbound"
        ? veh.laneIndex === 0
          ? topLane1Y + 22
          : topLane2Y + 22
        : veh.laneIndex === 0
        ? bottomLane1Y + 22
        : bottomLane2Y + 22;

    // Draw Vehicle Body
    drawVehicle(ctx, veh.x, vehY, veh.lengthM, veh.widthM, veh.color, veh.direction, veh.type);

    // Remove offscreen vehicles
    if (veh.direction === "eastbound" && veh.x > w + 80) {
      state.vehicles.splice(i, 1);
    } else if (veh.direction === "westbound" && veh.x < -80) {
      state.vehicles.splice(i, 1);
    }
  }

  // Draw Aerodynamic Wake Streamlines
  if (showStreamlines) {
    drawWakeStreamlines(ctx, w, roadCenterY, medianHeight, state.vehicles);
  }

  // Draw CFD (Computational Fluid Dynamics) Airflow Velocity Vectors & Core Trapping Paths
  if (showCfdVectors) {
    drawCfdAirflowVectors(
      ctx,
      w,
      h,
      roadCenterY,
      medianHeight,
      state.turbines,
      state.vehicles,
      ambientCrosswind,
      isFilterActive
    );
  }

  // Update & Draw Particulate Particles
  if (showParticleVectors) {
    const suctionRadius = 75;

    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life++;

      if (p.life > p.maxLife || p.status === "trapped") {
        state.particles.splice(i, 1);
        continue;
      }

      // Check Category Filter
      if (pollutantFilter === "exhaust" && p.category !== "exhaust") {
        continue;
      }
      if (pollutantFilter === "non_exhaust" && p.category !== "non_exhaust") {
        continue;
      }

      // Check proximity to CVWT median units for centrifugal suction
      if (isFilterActive) {
        state.turbines.forEach((t: any) => {
          const dx = t.x - p.x;
          const dy = roadCenterY - p.y;
          const dist = Math.hypot(dx, dy);

          if (dist < suctionRadius) {
            // Suction vector towards turbine holes
            const pull = (0.9 * (t.rpm / 120)) / Math.max(10, dist);
            p.vx += (dx / dist) * pull * 4;
            p.vy += (dy / dist) * pull * 4;

            // Swirl induction around rotor
            p.vx += (-dy / dist) * (t.rpm * 0.015);
            p.vy += (dx / dist) * (t.rpm * 0.015);

            // Captured in internal multilayer filter core!
            if (dist < 14) {
              p.status = "trapped";
              t.trappedCount++;
            }
          }
        });
      }

      p.x += p.vx;
      p.y += p.vy;

      // Draw particle with distinct color per type
      const alpha = Math.max(0, 1 - p.life / p.maxLife);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.status === "trapped" ? "#10b981" : p.color || "#ef4444";
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1.0;
    }
  }
}

// ========================================================
// TIMING BELT RIG RENDERER (LOAI ABOUELEZZ DWG 9/22/2026)
// ========================================================

function renderTimingBeltMode(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  dt: number,
  isRunning: boolean,
  targetSpeedKmh: number,
  isFilterActive: boolean,
  showStreamlines: boolean,
  showCfdVectors: boolean,
  state: any
) {
  const cx = w / 2;
  const cy = h / 2;

  // Blueprint Title & Spec Block (DWG 9/22/2026 loai Abouelezz)
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 13px JetBrains Mono, monospace";
  ctx.fillText("TIMING BELT APPARATUS (2520 x 740 x 925 cm)", 30, 40);
  ctx.font = "11px JetBrains Mono, monospace";
  ctx.fillStyle = "#38bdf8";
  ctx.fillText("DWG No: 1/1 | Created by: loai Abouelezz 9/22/2026 | Dept ESC/QU", 30, 58);

  const tunnelW = Math.min(w - 80, 850);
  const tunnelH = 260;
  const tunnelX = cx - tunnelW / 2;
  const tunnelY = cy - tunnelH / 2;

  // Outer Test Tunnel Housing (Acrylic / Glass wind tunnel shell)
  ctx.fillStyle = "rgba(15, 23, 42, 0.7)";
  ctx.fillRect(tunnelX, tunnelY, tunnelW, tunnelH);
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2;
  ctx.strokeRect(tunnelX, tunnelY, tunnelW, tunnelH);

  // Opposing Dual Timing Belts:
  // Top Belt Track (Westbound carrier carriage)
  const track1Y = tunnelY + 55;
  // Center Median (CVWT test unit position)
  const medianY = cy;
  // Bottom Belt Track (Eastbound carrier carriage)
  const track2Y = tunnelY + tunnelH - 55;

  // Draw Sprocket Pulleys at Left and Right Ends
  const sprocketRadius = 32;
  const leftSprocketX = tunnelX + 60;
  const rightSprocketX = tunnelX + tunnelW - 60;

  const beltSpeed = isRunning ? (targetSpeedKmh / 20) : 0;
  const sprocketAngle = (performance.now() * 0.003 * beltSpeed) % (Math.PI * 2);

  // Top timing belt loop & sprockets
  drawTimingBeltLoop(ctx, leftSprocketX, rightSprocketX, track1Y, sprocketRadius, sprocketAngle, 1);
  // Bottom timing belt loop & sprockets (opposing direction)
  drawTimingBeltLoop(ctx, leftSprocketX, rightSprocketX, track2Y, sprocketRadius, -sprocketAngle, -1);

  // Central Test CVWT Unit (from Ahmed Abouelezz blueprint)
  drawCVWTTopView(ctx, cx, medianY, (performance.now() * 0.005 * (targetSpeedKmh / 15)), 165, isFilterActive);

  // Measurement Callouts from Blueprint (2520, 740, 830, 450, 320, 110)
  ctx.strokeStyle = "rgba(56, 189, 248, 0.6)";
  ctx.fillStyle = "#38bdf8";
  ctx.font = "10px JetBrains Mono, monospace";

  // Length Dimension (2520 cm = 25.2 m)
  ctx.beginPath();
  ctx.moveTo(tunnelX, tunnelY - 14);
  ctx.lineTo(tunnelX + tunnelW, tunnelY - 14);
  ctx.stroke();
  ctx.fillText("2520 cm (25.2 m Test Rig Span)", cx - 110, tunnelY - 20);

  // Width Dimension (740 cm)
  ctx.beginPath();
  ctx.moveTo(tunnelX - 16, tunnelY);
  ctx.lineTo(tunnelX - 16, tunnelY + tunnelH);
  ctx.stroke();
  ctx.fillText("740 cm", tunnelX - 65, cy);

  // Track Spacing (320 cm / 110 cm / 450 cm from blueprint)
  ctx.fillText("Track Spacing: 320 cm", cx - 60, track1Y - 20);
  ctx.fillText("Median Clear: 110 cm", cx - 60, track2Y + 30);

  // Simulated Car Carriages mounted to Timing Belts
  const carCarriageCount = 4;
  for (let i = 0; i < carCarriageCount; i++) {
    // Top belt carriage (moving left)
    const topX = tunnelX + 80 + ((performance.now() * 0.08 * beltSpeed + i * 200) % (tunnelW - 160));
    drawCarriage(ctx, topX, track1Y, -1, "#ef4444");

    // Bottom belt carriage (moving right)
    const bottomX =
      tunnelX + tunnelW - 80 - ((performance.now() * 0.08 * beltSpeed + i * 200) % (tunnelW - 160));
    drawCarriage(ctx, bottomX, track2Y, 1, "#38bdf8");
  }

  // Induced Shear Vortex Streamlines in Test Channel
  if (showStreamlines && isRunning) {
    ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
    ctx.lineWidth = 1.5;
    for (let y = track1Y + 25; y < track2Y - 25; y += 18) {
      ctx.beginPath();
      const normY = (y - medianY) / (tunnelH * 0.25);
      const vx = normY * 30; // shear profile

      ctx.moveTo(cx - 140, y);
      ctx.bezierCurveTo(cx - 50 + vx, y - vx * 0.2, cx + 50 + vx, y + vx * 0.2, cx + 140, y);
      ctx.stroke();
    }
  }

  // CFD Airflow Velocity Vectors inside the Test Tunnel & into CVWT Core
  if (showCfdVectors && isRunning) {
    drawTimingBeltCfdVectors(
      ctx,
      cx,
      medianY,
      tunnelW,
      tunnelH,
      track1Y,
      track2Y,
      targetSpeedKmh,
      isFilterActive,
      state
    );
  }
}

// ==========================================
// DRAWING SUB-ROUTINES (CARS, CVWT, BELTS)
// ==========================================

function drawCVWTTopView(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  bladeAngle: number,
  rpm: number,
  isFilterActive: boolean
) {
  const outerR = 19; // 66cm rotor scale
  const innerR = 7; // hollow suction cylinder

  // Green Support Flange
  ctx.fillStyle = "#16a34a";
  ctx.beginPath();
  ctx.arc(x, y, outerR + 4, 0, Math.PI * 2);
  ctx.fill();

  // Outer Suction Influence Circle
  if (isFilterActive && rpm > 10) {
    ctx.strokeStyle = "rgba(16, 185, 129, 0.35)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(x, y, outerR * 3.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 3 Curved Blades (Top View of Ahmed Abouelezz Section)
  const bladeCount = 3;
  for (let i = 0; i < bladeCount; i++) {
    const angle = bladeAngle + (i / bladeCount) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * (outerR * 0.5), y + Math.sin(angle) * (outerR * 0.5), outerR * 0.6, angle, angle + Math.PI * 0.8);
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Perforations Holes on blade edges
    const hX = x + Math.cos(angle + 0.4) * outerR;
    const hY = y + Math.sin(angle + 0.4) * outerR;
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(hX, hY, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Central Hollow Suction Cylinder (shaft with filter)
  ctx.fillStyle = isFilterActive ? "#0284c7" : "#334155";
  ctx.beginPath();
  ctx.arc(x, y, innerR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Center axle dot
  ctx.fillStyle = "#f8fafc";
  ctx.beginPath();
  ctx.arc(x, y, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawVehicle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  width: number,
  color: string,
  direction: "eastbound" | "westbound",
  type: VehicleType
) {
  ctx.save();
  ctx.translate(x, y);

  // Vehicle Shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.beginPath();
  ctx.roundRect(-length / 2 + 2, -width / 2 + 3, length, width, 4);
  ctx.fill();

  // Vehicle Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-length / 2, -width / 2, length, width, type === "heavy_truck" ? 2 : 5);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Windshield & Windows
  ctx.fillStyle = "#0f172a";
  const cabinLen = length * (type === "heavy_truck" ? 0.3 : 0.45);
  const cabinOffset = direction === "eastbound" ? length * 0.05 : -length * 0.05;
  ctx.beginPath();
  ctx.roundRect(-cabinLen / 2 + cabinOffset, -width * 0.35, cabinLen, width * 0.7, 2);
  ctx.fill();

  // Headlights
  ctx.fillStyle = "#fef08a";
  if (direction === "eastbound") {
    ctx.fillRect(length / 2 - 2, -width / 2 + 2, 3, 3);
    ctx.fillRect(length / 2 - 2, width / 2 - 5, 3, 3);
  } else {
    ctx.fillRect(-length / 2 - 1, -width / 2 + 2, 3, 3);
    ctx.fillRect(-length / 2 - 1, width / 2 - 5, 3, 3);
  }

  // Taillights
  ctx.fillStyle = "#ef4444";
  if (direction === "eastbound") {
    ctx.fillRect(-length / 2 - 1, -width / 2 + 2, 2, 3);
    ctx.fillRect(-length / 2 - 1, width / 2 - 5, 2, 3);
  } else {
    ctx.fillRect(length / 2 - 1, -width / 2 + 2, 2, 3);
    ctx.fillRect(length / 2 - 1, width / 2 - 5, 2, 3);
  }

  // Diesel Truck Exhaust Stack
  if (type === "heavy_truck") {
    ctx.fillStyle = "#475569";
    const stackX = direction === "eastbound" ? -length * 0.2 : length * 0.2;
    ctx.beginPath();
    ctx.arc(stackX, -width * 0.4, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawWakeStreamlines(
  ctx: CanvasRenderingContext2D,
  w: number,
  roadCenterY: number,
  medianHeight: number,
  vehicles: SimulatedVehicle[]
) {
  ctx.strokeStyle = "rgba(56, 189, 248, 0.18)";
  ctx.lineWidth = 1;

  vehicles.forEach((veh) => {
    const isEast = veh.direction === "eastbound";
    const wakeLen = veh.lengthM * 2.2;
    const startX = isEast ? veh.x - veh.lengthM / 2 : veh.x + veh.lengthM / 2;
    const endX = isEast ? startX - wakeLen : startX + wakeLen;
    const vehY =
      isEast
        ? roadCenterY + medianHeight / 2 + (veh.laneIndex === 0 ? 22 : 66)
        : roadCenterY - medianHeight / 2 - (veh.laneIndex === 0 ? 22 : 66);

    ctx.beginPath();
    ctx.moveTo(startX, vehY);
    ctx.lineTo(endX, vehY + (isEast ? -8 : 8));
    ctx.stroke();
  });
}

function drawTimingBeltLoop(
  ctx: CanvasRenderingContext2D,
  x1: number,
  x2: number,
  y: number,
  radius: number,
  sprocketAngle: number,
  direction: number
) {
  // Sprocket Gears
  const drawSprocket = (sx: number) => {
    ctx.fillStyle = "#334155";
    ctx.beginPath();
    ctx.arc(sx, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Sprocket teeth
    const teeth = 16;
    ctx.fillStyle = "#64748b";
    for (let i = 0; i < teeth; i++) {
      const a = sprocketAngle + (i / teeth) * Math.PI * 2;
      const tx = sx + Math.cos(a) * (radius + 4);
      const ty = y + Math.sin(a) * (radius + 4);
      ctx.fillRect(tx - 2, ty - 2, 4, 4);
    }
  };

  drawSprocket(x1);
  drawSprocket(x2);

  // Timing Belt Loop Tracks (Top and Bottom run)
  ctx.strokeStyle = "#0284c7";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x1, y - radius);
  ctx.lineTo(x2, y - radius);
  ctx.arc(x2, y, radius, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x1, y + radius);
  ctx.arc(x1, y, radius, Math.PI / 2, (3 * Math.PI) / 2);
  ctx.stroke();

  // Direction Arrows on Timing Belt
  ctx.fillStyle = "#38bdf8";
  const step = 80;
  for (let x = x1 + 40; x < x2 - 20; x += step) {
    const arrowX = x;
    const arrowY = direction === 1 ? y - radius : y + radius;
    ctx.beginPath();
    ctx.moveTo(arrowX - 4 * direction, arrowY - 4);
    ctx.lineTo(arrowX + 4 * direction, arrowY);
    ctx.lineTo(arrowX - 4 * direction, arrowY + 4);
    ctx.closePath();
    ctx.fill();
  }
}

function drawCarriage(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: number,
  color: string
) {
  ctx.save();
  ctx.translate(x, y);

  // Carriage mounting bracket
  ctx.fillStyle = "#475569";
  ctx.fillRect(-18, -12, 36, 24);

  // Scale vehicle model
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-22, -9, 44, 18, 3);
  ctx.fill();
  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

// ========================================================
// CFD AIRFLOW VELOCITY VECTOR FIELD & TRAPPING PATH
// ========================================================

function drawCfdAirflowVectors(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  roadCenterY: number,
  medianHeight: number,
  turbines: any[],
  vehicles: SimulatedVehicle[],
  ambientCrosswind: number,
  isFilterActive: boolean
) {
  const stepX = 28;
  const stepY = 22;
  const roadTop = roadCenterY - medianHeight / 2 - 44 * 2 - 10;
  const roadBottom = roadCenterY + medianHeight / 2 + 44 * 2 + 10;
  const time = performance.now() * 0.003;

  for (let x = 20; x < w - 20; x += stepX) {
    for (let y = roadTop + 10; y <= roadBottom - 10; y += stepY) {
      // 1. Two-way shear baseline from opposing highway vehicle streams
      // Lane A (top): Westbound (negative U), Lane B (bottom): Eastbound (positive U)
      const distFromMedian = y - roadCenterY;
      const shearFactor = Math.tanh(distFromMedian / 26); // -1 on top lane, +1 on bottom lane
      let u = shearFactor * 8.5; // m/s baseline slipstream
      let v = ambientCrosswind * 0.5;

      // 2. Dynamic vehicle wake slipstreams
      for (let i = 0; i < vehicles.length; i++) {
        const veh = vehicles[i];
        const dx = x - veh.x;
        const vehY =
          veh.direction === "westbound"
            ? veh.laneIndex === 0
              ? roadCenterY - medianHeight / 2 - 22
              : roadCenterY - medianHeight / 2 - 66
            : veh.laneIndex === 0
            ? roadCenterY + medianHeight / 2 + 22
            : roadCenterY + medianHeight / 2 + 66;
        const dy = y - vehY;
        const d = Math.hypot(dx, dy);

        if (d < 90) {
          const vSign = veh.direction === "eastbound" ? 1 : -1;
          const wakeIntensity = (1 - d / 90) * (veh.speedKmh / 22);
          u += vSign * wakeIntensity * 1.6;
          // Lateral entrainment towards vehicle slipstream
          v += (dy > 0 ? -1 : 1) * wakeIntensity * 0.45;
        }
      }

      // 3. CVWT Rotor Aerodynamics & Hollow Core Suction Sink
      let isNearTurbine = false;
      let isInsideCore = false;

      for (let i = 0; i < turbines.length; i++) {
        const t = turbines[i];
        const dx = x - t.x;
        const dy = y - roadCenterY;
        const dist = Math.hypot(dx, dy);

        if (dist < 92) {
          isNearTurbine = true;

          // Blade swirl rotation (driven by opposing slipstream)
          const swirlSpeed = (t.rpm / 60) * 12 * Math.min(1.4, Math.max(0.2, dist / 22));
          // Swirl vector perpendicular to radius: (-dy/dist, dx/dist)
          const swirlU = (-dy / Math.max(4, dist)) * swirlSpeed;
          const swirlV = (dx / Math.max(4, dist)) * swirlSpeed;
          u = u * 0.4 + swirlU;
          v = v * 0.4 + swirlV;

          // Inward Radial Suction into Perforated Blades and Core Center
          if (isFilterActive) {
            const suctionStrength = Math.min(24, (32 * (t.rpm / 120)) / Math.max(6, dist * 0.55));
            const inwardU = (-dx / Math.max(4, dist)) * suctionStrength;
            const inwardV = (-dy / Math.max(4, dist)) * suctionStrength;

            u += inwardU;
            v += inwardV;

            if (dist < 18) {
              isInsideCore = true;
            }
          }
        }
      }

      const speed = Math.hypot(u, v);
      if (speed < 0.25) continue;

      // Color mapping according to CFD velocity scale
      let color = "#38bdf8"; // Light Cyan for ambient
      if (speed > 16 || isInsideCore) {
        color = "#f43f5e"; // Rose / Crimson for high shear & core intake
      } else if (speed > 11) {
        color = "#f59e0b"; // Amber for accelerated wake
      } else if (speed > 6) {
        color = "#10b981"; // Emerald for active turbine induction
      } else {
        color = "#0ea5e9"; // Cyan for ambient slipstream
      }

      // Normalized direction vector
      const nx = u / speed;
      const ny = v / speed;

      // Arrow length (scaled between 8 and 18 px)
      const len = Math.max(8, Math.min(18, speed * 1.15));
      const startX = x - nx * (len * 0.4);
      const startY = y - ny * (len * 0.4);
      const endX = x + nx * (len * 0.6);
      const endY = y + ny * (len * 0.6);

      // Micro animated phase pulse to convey fluid movement
      const pulse = Math.sin(time * 4 - x * 0.04 + y * 0.04) * 0.2 + 0.8;
      const alpha = isNearTurbine ? Math.min(1.0, 0.9 * pulse) : Math.min(0.65, 0.45 * pulse);

      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = isNearTurbine ? (isInsideCore ? 2.2 : 1.6) : 1.1;

      // Draw vector arrow shaft
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Draw arrowhead
      const headLen = isNearTurbine ? 4.5 : 3.5;
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

      // If inside core suction, add glowing particle node indicating capture
      if (isInsideCore) {
        ctx.beginPath();
        ctx.arc(endX, endY, 2, 0, Math.PI * 2);
        ctx.fillStyle = "#a855f7";
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // 4. DEDICATED CVWT FILTER CORE INFLOW STREAMLINES & SUCTION SINK
  // Visually represents wind currents flowing into the central hollow filter core
  for (let i = 0; i < turbines.length; i++) {
    const t = turbines[i];
    const numStreamlines = 10;

    // Draw logarithmic spiral wind currents flowing into the CVWT filter core
    for (let s = 0; s < numStreamlines; s++) {
      const baseTheta = (s / numStreamlines) * Math.PI * 2 + time * 0.75;
      ctx.beginPath();

      const numSteps = 24;
      for (let st = 0; st <= numSteps; st++) {
        const frac = st / numSteps; // 0 = outer boundary (r=78), 1 = central hollow core (r=13)
        const r = 78 * (1 - frac * 0.83);
        const theta = baseTheta + frac * 1.6;
        const px = t.x + Math.cos(theta) * r;
        const py = roadCenterY + Math.sin(theta) * r;
        if (st === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }

      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.lineDashOffset = -time * 40; // Active inward flow animation
      ctx.strokeStyle = isFilterActive
        ? "rgba(56, 189, 248, 0.75)"
        : "rgba(148, 163, 184, 0.25)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Inflow chevron arrow near core entrance
      const arrowFrac = 0.82;
      const arrowR = 78 * (1 - arrowFrac * 0.83);
      const arrowTheta = baseTheta + arrowFrac * 1.6;
      const ax = t.x + Math.cos(arrowTheta) * arrowR;
      const ay = roadCenterY + Math.sin(arrowTheta) * arrowR;
      const tangAngle = arrowTheta + 0.6;

      ctx.fillStyle = isFilterActive ? "#10b981" : "#94a3b8";
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - 4.5 * Math.cos(tangAngle - 0.4), ay - 4.5 * Math.sin(tangAngle - 0.4));
      ctx.lineTo(ax - 4.5 * Math.cos(tangAngle + 0.4), ay - 4.5 * Math.sin(tangAngle + 0.4));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Glowing core intake suction boundary
    ctx.save();
    ctx.beginPath();
    ctx.arc(t.x, roadCenterY, 14, 0, Math.PI * 2);
    ctx.fillStyle = isFilterActive ? "rgba(16, 185, 129, 0.2)" : "rgba(100, 116, 139, 0.1)";
    ctx.fill();
    ctx.strokeStyle = isFilterActive ? "#10b981" : "#64748b";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([3, 2]);
    ctx.lineDashOffset = -time * 12;
    ctx.stroke();

    // Inflow suction pulsing ring
    const pulseR = 14 + ((Math.sin(time * 6 + i) + 1) * 0.5) * 6;
    ctx.beginPath();
    ctx.arc(t.x, roadCenterY, pulseR, 0, Math.PI * 2);
    ctx.strokeStyle = isFilterActive ? "rgba(56, 189, 248, 0.5)" : "rgba(148, 163, 184, 0.2)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Engineering Label for Turbine 2
    if (i === 1) {
      ctx.font = "bold 9px monospace";
      ctx.fillStyle = isFilterActive ? "#38bdf8" : "#94a3b8";
      ctx.textAlign = "center";
      ctx.fillText("CVWT Core Inflow Sink (Qin)", t.x, roadCenterY - 26);
    }
    ctx.restore();
  }
}

function drawTimingBeltCfdVectors(
  ctx: CanvasRenderingContext2D,
  cx: number,
  medianY: number,
  tunnelW: number,
  tunnelH: number,
  track1Y: number,
  track2Y: number,
  targetSpeedKmh: number,
  isFilterActive: boolean,
  state: any
) {
  const stepX = 26;
  const stepY = 20;
  const startX = cx - tunnelW / 2 + 30;
  const endX = cx + tunnelW / 2 - 30;
  const startY = track1Y + 15;
  const endY = track2Y - 15;
  const time = performance.now() * 0.003;
  const beltVelocity = (targetSpeedKmh / 20) * 1.5;

  for (let x = startX; x <= endX; x += stepX) {
    for (let y = startY; y <= endY; y += stepY) {
      const normY = (y - medianY) / (tunnelH * 0.28);
      // Top belt moves left (-U), bottom belt moves right (+U)
      let u = normY * beltVelocity * 7.0;
      let v = 0;

      // Proximity to central CVWT unit in wind tunnel test section
      const dx = x - cx;
      const dy = y - medianY;
      const dist = Math.hypot(dx, dy);
      let isNearTurbine = false;
      let isInsideCore = false;

      if (dist < 85) {
        isNearTurbine = true;
        // Swirl around the rotor
        const swirl = 10 * Math.min(1.5, Math.max(0.2, dist / 20));
        u = u * 0.4 + (-dy / Math.max(4, dist)) * swirl;
        v = (dx / Math.max(4, dist)) * swirl;

        // Inward suction into central hollow core
        if (isFilterActive) {
          const suction = Math.min(22, 28 / Math.max(5, dist * 0.6));
          u += (-dx / Math.max(4, dist)) * suction;
          v += (-dy / Math.max(4, dist)) * suction;

          if (dist < 16) {
            isInsideCore = true;
          }
        }
      }

      const speed = Math.hypot(u, v);
      if (speed < 0.2) continue;

      let color = "#38bdf8";
      if (speed > 15 || isInsideCore) {
        color = "#f43f5e";
      } else if (speed > 10) {
        color = "#f59e0b";
      } else if (speed > 5) {
        color = "#10b981";
      }

      const nx = u / speed;
      const ny = v / speed;
      const len = Math.max(7, Math.min(16, speed * 1.1));
      const startArrowX = x - nx * (len * 0.4);
      const startArrowY = y - ny * (len * 0.4);
      const endArrowX = x + nx * (len * 0.6);
      const endArrowY = y + ny * (len * 0.6);

      const pulse = Math.sin(time * 4 - x * 0.05 + y * 0.05) * 0.2 + 0.8;
      const alpha = isNearTurbine ? Math.min(1.0, 0.9 * pulse) : Math.min(0.65, 0.45 * pulse);

      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = isNearTurbine ? (isInsideCore ? 2.2 : 1.5) : 1.1;

      ctx.beginPath();
      ctx.moveTo(startArrowX, startArrowY);
      ctx.lineTo(endArrowX, endArrowY);
      ctx.stroke();

      const headLen = isNearTurbine ? 4.5 : 3.5;
      const angle = Math.atan2(ny, nx);
      ctx.beginPath();
      ctx.moveTo(endArrowX, endArrowY);
      ctx.lineTo(
        endArrowX - headLen * Math.cos(angle - Math.PI / 6),
        endArrowY - headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        endArrowX - headLen * Math.cos(angle + Math.PI / 6),
        endArrowY - headLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fill();

      if (isInsideCore) {
        ctx.beginPath();
        ctx.arc(endArrowX, endArrowY, 2, 0, Math.PI * 2);
        ctx.fillStyle = "#a855f7";
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // DEDICATED TIMING BELT RIG CVWT FILTER CORE INFLOW STREAMLINES
  // Visually represents wind currents flowing into the central test CVWT core
  const numStreamlines = 12;
  for (let s = 0; s < numStreamlines; s++) {
    const baseTheta = (s / numStreamlines) * Math.PI * 2 + time * 0.75;
    ctx.beginPath();
    const numSteps = 24;
    for (let st = 0; st <= numSteps; st++) {
      const frac = st / numSteps;
      const r = 75 * (1 - frac * 0.83);
      const theta = baseTheta + frac * 1.6;
      const px = cx + Math.cos(theta) * r;
      const py = medianY + Math.sin(theta) * r;
      if (st === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = -time * 40; // Active inward flow animation
    ctx.strokeStyle = isFilterActive
      ? "rgba(56, 189, 248, 0.75)"
      : "rgba(148, 163, 184, 0.25)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const arrowFrac = 0.82;
    const arrowR = 75 * (1 - arrowFrac * 0.83);
    const arrowTheta = baseTheta + arrowFrac * 1.6;
    const ax = cx + Math.cos(arrowTheta) * arrowR;
    const ay = medianY + Math.sin(arrowTheta) * arrowR;
    const tangAngle = arrowTheta + 0.6;
    ctx.fillStyle = isFilterActive ? "#10b981" : "#94a3b8";
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - 4.5 * Math.cos(tangAngle - 0.4), ay - 4.5 * Math.sin(tangAngle - 0.4));
    ctx.lineTo(ax - 4.5 * Math.cos(tangAngle + 0.4), ay - 4.5 * Math.sin(tangAngle + 0.4));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Glowing filter core boundary in rig
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, medianY, 14, 0, Math.PI * 2);
  ctx.fillStyle = isFilterActive ? "rgba(16, 185, 129, 0.2)" : "rgba(100, 116, 139, 0.1)";
  ctx.fill();
  ctx.strokeStyle = isFilterActive ? "#10b981" : "#64748b";
  ctx.lineWidth = 1.6;
  ctx.setLineDash([3, 2]);
  ctx.lineDashOffset = -time * 12;
  ctx.stroke();

  const pulseR = 14 + ((Math.sin(time * 6) + 1) * 0.5) * 6;
  ctx.beginPath();
  ctx.arc(cx, medianY, pulseR, 0, Math.PI * 2);
  ctx.strokeStyle = isFilterActive ? "rgba(56, 189, 248, 0.5)" : "rgba(148, 163, 184, 0.2)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.font = "bold 9px monospace";
  ctx.fillStyle = isFilterActive ? "#38bdf8" : "#94a3b8";
  ctx.textAlign = "center";
  ctx.fillText("Rig CVWT Core Inflow (Qin = 780 m³/h)", cx, medianY - 26);
  ctx.restore();
}
