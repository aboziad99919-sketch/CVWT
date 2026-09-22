import React, { useState } from "react";
import {
  Sliders,
  Gauge,
  Wind,
  Filter,
  Car,
  Truck,
  Sparkles,
  ArrowRightLeft,
  X,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Activity,
  Layers,
  Info,
  ChevronRight,
  TrendingUp,
  Bookmark,
  BookmarkPlus,
  BookmarkCheck,
  GitCompare,
  Flame,
} from "lucide-react";
import { ScenarioManager } from "./ScenarioManager";
import {
  SimulationScenario,
  SimulationScenarioVariables,
  SimulationScenarioMetrics,
} from "../types";

export interface SimulationSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  // Core geometric variables
  laneProximityM: number;
  setLaneProximityM: (val: number) => void;
  vehicleSpacingM: number;
  setVehicleSpacingM: (val: number) => void;
  turbineSpacingM: number;
  setTurbineSpacingM: (val: number) => void;

  // Traffic & Environmental variables
  targetSpeedKmh: number;
  setTargetSpeedKmh: (val: number) => void;
  trafficDensity: number;
  setTrafficDensity: (val: number) => void;
  truckRatio: number;
  setTruckRatio: (val: number) => void;
  ambientCrosswind: number;
  setAmbientCrosswind: (val: number) => void;

  // Toggles
  isFilterActive: boolean;
  setIsFilterActive: (val: boolean) => void;
  showCfdVectors: boolean;
  setShowCfdVectors: (val: boolean) => void;
  showStreamlines: boolean;
  setShowStreamlines: (val: boolean) => void;
  showParticleVectors: boolean;
  setShowParticleVectors: (val: boolean) => void;
  showPollutantHeatmap: boolean;
  setShowPollutantHeatmap: (val: boolean) => void;
  pollutantFilter: "all" | "exhaust" | "non_exhaust";
  setPollutantFilter: (val: "all" | "exhaust" | "non_exhaust") => void;

  // Real-time telemetry & performance
  liveRpm: number;
  trappingRateUgS: number;
  trappedTotalGrams: number;
  powerWatts: number;
  turbineCount: number;
}

export const SimulationSidebar: React.FC<SimulationSidebarProps> = ({
  isOpen,
  onClose,
  laneProximityM,
  setLaneProximityM,
  vehicleSpacingM,
  setVehicleSpacingM,
  turbineSpacingM,
  setTurbineSpacingM,
  targetSpeedKmh,
  setTargetSpeedKmh,
  trafficDensity,
  setTrafficDensity,
  truckRatio,
  setTruckRatio,
  ambientCrosswind,
  setAmbientCrosswind,
  isFilterActive,
  setIsFilterActive,
  showCfdVectors,
  setShowCfdVectors,
  showStreamlines,
  setShowStreamlines,
  showParticleVectors,
  setShowParticleVectors,
  showPollutantHeatmap,
  setShowPollutantHeatmap,
  pollutantFilter,
  setPollutantFilter,
  liveRpm,
  trappingRateUgS,
  trappedTotalGrams,
  powerWatts,
  turbineCount,
}) => {
  if (!isOpen) return null;

  // AERODYNAMIC TRAPPING PERFORMANCE MODEL CALCULATIONS
  // 1. Proximity score: decays with distance from vehicle passing line to CVWT rotor perimeter
  const proximityFactor = Math.min(1.0, Math.max(0.18, 1.25 / Math.pow(laneProximityM, 1.35)));

  // 2. Headway/Spacing score: closer spacing produces overlapping wakes that sustain continuous rotor RPM
  const spacingFactor = Math.min(1.0, Math.max(0.45, Math.pow(24 / Math.max(10, vehicleSpacingM), 0.32)));

  // 3. Vehicle speed score: higher speed generates stronger slipstream shear
  const speedFactor = Math.min(1.0, Math.max(0.55, Math.pow(targetSpeedKmh / 95, 0.4)));

  // 4. Crosswind penalty: lateral wind blows particulate plume away from median barrier
  const crosswindFactor = Math.max(0.5, 1.0 - ambientCrosswind * 0.06);

  // 5. Overall Trapping Efficiency
  const trappingEfficiencyPct = isFilterActive
    ? Math.min(96, Math.max(12, Math.round(proximityFactor * spacingFactor * speedFactor * crosswindFactor * 94)))
    : 0;

  // Performance Readouts
  const inducedWakeVelocityMs = ((liveRpm / 17.0) * 0.92).toFixed(1);
  const coreDeltaP = isFilterActive ? -Math.round(18 + Math.pow(liveRpm / 130, 2) * 28) : 0;
  const cadrPerUnit = isFilterActive ? Math.round(liveRpm * 4.9) : 0;
  const totalCadr = cadrPerUnit * Math.max(1, turbineCount);

  // Apply Presets
  const applyPreset = (preset: "optimal" | "congested" | "freeflow" | "wide_shoulder") => {
    if (preset === "optimal") {
      setLaneProximityM(0.9);
      setVehicleSpacingM(20);
      setTurbineSpacingM(14);
      setTargetSpeedKmh(95);
      setTruckRatio(24);
      setAmbientCrosswind(1.5);
      setIsFilterActive(true);
    } else if (preset === "congested") {
      setLaneProximityM(1.0);
      setVehicleSpacingM(12);
      setTurbineSpacingM(15);
      setTargetSpeedKmh(50);
      setTruckRatio(30);
      setAmbientCrosswind(2.0);
      setIsFilterActive(true);
    } else if (preset === "freeflow") {
      setLaneProximityM(1.2);
      setVehicleSpacingM(30);
      setTurbineSpacingM(15);
      setTargetSpeedKmh(110);
      setTruckRatio(18);
      setAmbientCrosswind(2.5);
      setIsFilterActive(true);
    } else if (preset === "wide_shoulder") {
      setLaneProximityM(2.8);
      setVehicleSpacingM(45);
      setTurbineSpacingM(18);
      setTargetSpeedKmh(105);
      setTruckRatio(15);
      setAmbientCrosswind(3.5);
      setIsFilterActive(true);
    }
  };

  const [activeSidebarTab, setActiveSidebarTab] = useState<"variables" | "scenarios">("variables");

  const currentVariables: SimulationScenarioVariables = {
    laneProximityM,
    vehicleSpacingM,
    turbineSpacingM,
    targetSpeedKmh,
    trafficDensity,
    truckRatio,
    ambientCrosswind,
    isFilterActive,
    pollutantFilter,
    showCfdVectors,
    showStreamlines,
    showParticleVectors,
    showPollutantHeatmap,
  };

  const currentMetrics: SimulationScenarioMetrics = {
    captureEfficiencyIndex: trappingEfficiencyPct,
    trappingRateUgS,
    arrayCadr: totalCadr,
    liveRpm,
    powerWatts,
    inducedWakeVelocityMs: parseFloat(inducedWakeVelocityMs),
  };

  const handleLoadScenario = (scen: SimulationScenario) => {
    setLaneProximityM(scen.variables.laneProximityM);
    setVehicleSpacingM(scen.variables.vehicleSpacingM);
    setTurbineSpacingM(scen.variables.turbineSpacingM);
    setTargetSpeedKmh(scen.variables.targetSpeedKmh);
    setTrafficDensity(scen.variables.trafficDensity);
    setTruckRatio(scen.variables.truckRatio);
    setAmbientCrosswind(scen.variables.ambientCrosswind);
    setIsFilterActive(scen.variables.isFilterActive);
    setPollutantFilter(scen.variables.pollutantFilter);
    setShowCfdVectors(scen.variables.showCfdVectors);
    setShowStreamlines(scen.variables.showStreamlines);
    setShowParticleVectors(scen.variables.showParticleVectors);
    if (scen.variables.showPollutantHeatmap !== undefined) {
      setShowPollutantHeatmap(scen.variables.showPollutantHeatmap);
    }
  };

  return (
    <aside
      id="simulation-variables-sidebar"
      className="w-full lg:w-84 xl:w-96 bg-slate-950/98 backdrop-blur-xl border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col h-full max-h-[600px] lg:max-h-none overflow-hidden z-20 flex-shrink-0 shadow-2xl"
      aria-label="Simulation Variables and Pollutant Trapping Performance Panel"
    >
      {/* Sidebar Header */}
      <div className="p-3.5 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <Sliders className="h-3.5 w-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-100 font-mono tracking-tight uppercase">
              Simulation Controls
            </h3>
            <p className="text-[10px] text-slate-400">
              Geometric & Trapping Variables
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          title="Collapse Sidebar"
          aria-label="Collapse Sidebar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tab Switcher: Variables & Sliders vs Simulation Scenarios */}
      <div className="flex border-b border-slate-800 bg-slate-950 p-1.5 gap-1 text-[11px] font-mono">
        <button
          onClick={() => setActiveSidebarTab("variables")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-semibold transition-all ${
            activeSidebarTab === "variables"
              ? "bg-sky-500/20 text-sky-200 border border-sky-500/40 shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          <Sliders className="h-3.5 w-3.5 text-sky-400" />
          <span>Variables & Sliders</span>
        </button>
        <button
          onClick={() => setActiveSidebarTab("scenarios")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-semibold transition-all ${
            activeSidebarTab === "scenarios"
              ? "bg-purple-500/20 text-purple-200 border border-purple-500/40 shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          <Bookmark className="h-3.5 w-3.5 text-purple-400" />
          <span>Scenarios & Compare</span>
        </button>
      </div>

      {/* Main Content Area Based on Active Tab */}
      {activeSidebarTab === "scenarios" ? (
        <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs font-sans">
          <ScenarioManager
            currentVariables={currentVariables}
            currentMetrics={currentMetrics}
            onLoadScenario={handleLoadScenario}
          />
        </div>
      ) : (
        /* Scrollable Controls Body for Variables */
        <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs font-sans">
          {/* Quick Scenario Banner */}
          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px]">
            <span className="text-slate-300 font-mono text-[10px] flex items-center gap-1.5">
              <Bookmark className="h-3 w-3 text-purple-400" />
              <span>Simulation Scenarios</span>
            </span>
            <button
              onClick={() => setActiveSidebarTab("scenarios")}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 transition-colors"
            >
              <span>Manage & Compare</span>
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          {/* REAL-TIME TRAPPING PERFORMANCE CARD */}
          <section
            id="realtime-trapping-performance-card"
            className="bg-slate-900/90 rounded-xl p-3 border border-slate-800/90 shadow-lg space-y-2.5"
          >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-emerald-400" />
              Trapping Performance
            </span>
            <span
              className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full border ${
                trappingEfficiencyPct >= 80
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                  : trappingEfficiencyPct >= 55
                  ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                  : "bg-red-500/15 text-red-300 border-red-500/30"
              }`}
            >
              {trappingEfficiencyPct >= 80
                ? "OPTIMAL ZONE"
                : trappingEfficiencyPct >= 55
                ? "MODERATE INTERCEPTION"
                : "HIGH BYPASS"}
            </span>
          </div>

          {/* Efficiency Gauge Bar */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-300 font-medium">Capture Efficiency Index:</span>
              <span
                className={`font-mono font-bold text-sm ${
                  trappingEfficiencyPct >= 80
                    ? "text-emerald-400"
                    : trappingEfficiencyPct >= 55
                    ? "text-amber-400"
                    : "text-red-400"
                }`}
              >
                {trappingEfficiencyPct}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden relative">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  trappingEfficiencyPct >= 80
                    ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                    : trappingEfficiencyPct >= 55
                    ? "bg-gradient-to-r from-amber-500 to-yellow-400"
                    : "bg-gradient-to-r from-red-500 to-rose-400"
                }`}
                style={{ width: `${trappingEfficiencyPct}%` }}
              />
            </div>
          </div>

          {/* 4-Metric Diagnostic Grid */}
          <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
            <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/80">
              <div className="text-[10px] text-slate-400">Trapping Flux:</div>
              <div className="text-xs font-bold text-sky-400">
                {trappingRateUgS.toFixed(1)} <span className="text-[9px] font-normal text-slate-400">µg/s</span>
              </div>
            </div>
            <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/80">
              <div className="text-[10px] text-slate-400">Wake Velocity:</div>
              <div className="text-xs font-bold text-emerald-400">
                {inducedWakeVelocityMs} <span className="text-[9px] font-normal text-slate-400">m/s</span>
              </div>
            </div>
            <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/80">
              <div className="text-[10px] text-slate-400">Core Suction ΔP:</div>
              <div className="text-xs font-bold text-purple-400">
                {coreDeltaP} <span className="text-[9px] font-normal text-slate-400">Pa</span>
              </div>
            </div>
            <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/80">
              <div className="text-[10px] text-slate-400">Array CADR:</div>
              <div className="text-xs font-bold text-slate-200">
                {totalCadr} <span className="text-[9px] font-normal text-slate-400">m³/h</span>
              </div>
            </div>
          </div>

          {/* Dynamic Aerodynamic Insight Callout */}
          <div className="p-2 rounded-lg bg-slate-950/90 border border-slate-800/60 text-[10px] leading-relaxed text-slate-300">
            {laneProximityM <= 1.0 ? (
              <span className="text-emerald-300">
                ✓ <strong>Close Lane Proximity ({laneProximityM}m):</strong> Vehicles pass inside the 78px centrifugal suction envelope. Peak particulate impaction across the CVWT core.
              </span>
            ) : laneProximityM <= 1.8 ? (
              <span className="text-slate-300">
                ℹ <strong>Standard Clearance ({laneProximityM}m):</strong> Balanced wake shear induction. Particulates entrained through intermediate two-way shear layer.
              </span>
            ) : (
              <span className="text-red-300">
                ⚠ <strong>Wide Lane Shoulder ({laneProximityM}m):</strong> Vehicle wake expands and decelerates by &gt;50% before reaching the median. Many particles bypass the filter core.
              </span>
            )}
          </div>
        </section>

        {/* QUICK SCENARIO PRESETS */}
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
            <span>Scenario Presets:</span>
            <RotateCcw className="h-3 w-3 text-slate-500" />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => applyPreset("optimal")}
              className="text-left px-2.5 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-[11px] font-medium transition-colors"
            >
              <div className="font-bold flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-emerald-400" /> Optimal Abouelezz
              </div>
              <div className="text-[9px] text-slate-400">0.9m prox • 20m space</div>
            </button>

            <button
              onClick={() => applyPreset("congested")}
              className="text-left px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800/70 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition-colors"
            >
              <div className="font-bold">Peak Rush Hour</div>
              <div className="text-[9px] text-slate-400">1.0m prox • 12m space</div>
            </button>

            <button
              onClick={() => applyPreset("freeflow")}
              className="text-left px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800/70 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition-colors"
            >
              <div className="font-bold">Free-Flow Highway</div>
              <div className="text-[9px] text-slate-400">1.2m prox • 30m space</div>
            </button>

            <button
              onClick={() => applyPreset("wide_shoulder")}
              className="text-left px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800/70 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition-colors"
            >
              <div className="font-bold">Wide Shoulder</div>
              <div className="text-[9px] text-slate-400">2.8m prox • 45m space</div>
            </button>
          </div>
        </div>

        {/* PRIMARY VARIABLE SLIDERS */}
        <div className="space-y-3.5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 border-b border-slate-800/80 pb-1">
            Geometric & Traffic Sliders
          </div>

          {/* 1. LANE PROXIMITY SLIDER */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-200 font-medium flex items-center gap-1.5">
                <ArrowRightLeft className="h-3.5 w-3.5 text-sky-400" />
                Lane Proximity (Clearance):
              </span>
              <span
                className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                  laneProximityM <= 1.0
                    ? "bg-emerald-500/20 text-emerald-300"
                    : laneProximityM <= 1.8
                    ? "bg-sky-500/20 text-sky-300"
                    : "bg-red-500/20 text-red-300"
                }`}
              >
                {laneProximityM.toFixed(1)} m
              </span>
            </div>
            <input
              type="range"
              min="0.6"
              max="3.5"
              step="0.1"
              value={laneProximityM}
              onChange={(e) => setLaneProximityM(Number(e.target.value))}
              className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-500 font-mono">
              <span>0.6m (Hugs Median)</span>
              <span>1.2m (Default)</span>
              <span>3.5m (Wide Shoulder)</span>
            </div>
            <p className="text-[9px] text-slate-400 leading-tight">
              Distance between inner vehicle travel line and CVWT rotor perimeter. Closer proximity maximizes wake velocity and injects pollutants directly into core suction.
            </p>
          </div>

          {/* 2. VEHICLE SPACING SLIDER */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-200 font-medium flex items-center gap-1.5">
                <Car className="h-3.5 w-3.5 text-emerald-400" />
                Vehicle Spacing (Headway):
              </span>
              <span
                className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                  vehicleSpacingM <= 22
                    ? "bg-emerald-500/20 text-emerald-300"
                    : vehicleSpacingM <= 38
                    ? "bg-sky-500/20 text-sky-300"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                {vehicleSpacingM} m
                <span className="text-[9px] font-normal text-slate-400 ml-1">
                  ({(vehicleSpacingM / Math.max(10, (targetSpeedKmh * 1000) / 3600)).toFixed(1)}s)
                </span>
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="60"
              step="1"
              value={vehicleSpacingM}
              onChange={(e) => setVehicleSpacingM(Number(e.target.value))}
              className="w-full accent-emerald-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-500 font-mono">
              <span>10m (Dense Platoon)</span>
              <span>25m (Highway)</span>
              <span>60m (Isolated)</span>
            </div>
            <p className="text-[9px] text-slate-400 leading-tight">
              Longitudinal spacing between successive vehicles. Tight headway generates overlapping wake vortices that sustain continuous rotor RPM without deceleration transients.
            </p>
          </div>

          {/* 3. CVWT INTER-UNIT SPACING SLIDER */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-200 font-medium flex items-center gap-1.5">
                <Wind className="h-3.5 w-3.5 text-purple-400" />
                CVWT Unit Spacing:
              </span>
              <span className="font-mono font-bold px-1.5 py-0.5 rounded text-[11px] bg-purple-500/20 text-purple-300">
                {turbineSpacingM} m <span className="text-[9px] text-slate-400">({Math.round(turbineSpacingM / 0.66)} D)</span>
              </span>
            </div>
            <input
              type="range"
              min="8"
              max="28"
              step="1"
              value={turbineSpacingM}
              onChange={(e) => setTurbineSpacingM(Number(e.target.value))}
              className="w-full accent-purple-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-500 font-mono">
              <span>8m (Dense Array)</span>
              <span>15m (Optimal ~23D)</span>
              <span>28m (Wide Pitch)</span>
            </div>
            <p className="text-[9px] text-slate-400 leading-tight">
              Distance between adjacent CVWT turbines along the median barrier. 12–15m allows aerodynamic wake recovery without leaving unscrubbed bypass corridors.
            </p>
          </div>

          {/* 4. VEHICLE SPEED SLIDER */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Vehicle Speed:</span>
              <span className="font-mono text-slate-200 font-bold">{targetSpeedKmh} km/h</span>
            </div>
            <input
              type="range"
              min="40"
              max="130"
              step="5"
              value={targetSpeedKmh}
              onChange={(e) => setTargetSpeedKmh(Number(e.target.value))}
              className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* 5. HEAVY DIESEL TRUCKS SLIDER */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 flex items-center gap-1">
                <Truck className="h-3 w-3 text-red-400" /> Heavy Diesel Trucks:
              </span>
              <span className="font-mono text-red-400 font-bold">{truckRatio}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              step="1"
              value={truckRatio}
              onChange={(e) => setTruckRatio(Number(e.target.value))}
              className="w-full accent-red-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* 6. AMBIENT CROSSWIND SLIDER */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Ambient Crosswind:</span>
              <span className="font-mono text-slate-200 font-bold">{ambientCrosswind.toFixed(1)} m/s</span>
            </div>
            <input
              type="range"
              min="0"
              max="8"
              step="0.5"
              value={ambientCrosswind}
              onChange={(e) => setAmbientCrosswind(Number(e.target.value))}
              className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>

        {/* VISUAL LAYERS & FILTERS */}
        <div className="pt-2 border-t border-slate-800/80 space-y-2">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
            Visual Layers & Filters
          </div>

          {/* Pollutant Filter Selector */}
          <div className="grid grid-cols-3 gap-1">
            <button
              onClick={() => setPollutantFilter("all")}
              className={`py-1 rounded text-[10px] font-mono font-medium transition-colors ${
                pollutantFilter === "all"
                  ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                  : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200"
              }`}
            >
              All PM
            </button>
            <button
              onClick={() => setPollutantFilter("exhaust")}
              className={`py-1 rounded text-[10px] font-mono font-medium transition-colors ${
                pollutantFilter === "exhaust"
                  ? "bg-red-500/20 text-red-300 border border-red-500/40"
                  : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200"
              }`}
            >
              Exhaust (PM2.5)
            </button>
            <button
              onClick={() => setPollutantFilter("non_exhaust")}
              className={`py-1 rounded text-[10px] font-mono font-medium transition-colors ${
                pollutantFilter === "non_exhaust"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200"
              }`}
            >
              Brake/Tire (PM10)
            </button>
          </div>

          {/* Quick Checkbox Toggles */}
          <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={showCfdVectors}
                onChange={(e) => setShowCfdVectors(e.target.checked)}
                className="rounded accent-sky-400"
              />
              <span>CFD Airflow</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={showStreamlines}
                onChange={(e) => setShowStreamlines(e.target.checked)}
                className="rounded accent-sky-500"
              />
              <span>Wake Streams</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={showParticleVectors}
                onChange={(e) => setShowParticleVectors(e.target.checked)}
                className="rounded accent-emerald-500"
              />
              <span>Particulates</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={showPollutantHeatmap}
                onChange={(e) => setShowPollutantHeatmap(e.target.checked)}
                className="rounded accent-rose-500"
              />
              <span className="flex items-center gap-1">
                <Flame className="h-3 w-3 text-rose-400" />
                Heat Map
              </span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={isFilterActive}
                onChange={(e) => setIsFilterActive(e.target.checked)}
                className="rounded accent-emerald-400"
              />
              <span>Filter Core</span>
            </label>
          </div>
        </div>
      </div>
      )}
    </aside>
  );
};
