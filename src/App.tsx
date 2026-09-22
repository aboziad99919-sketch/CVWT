import React, { useState } from "react";
import {
  Wind,
  Layers,
  Compass,
  Activity,
  FileText,
  Sparkles,
  Zap,
  Car,
  ShieldCheck,
  Filter,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { CVWT3DInspector } from "./components/CVWT3DInspector";
import { TrafficSimulationCanvas } from "./components/TrafficSimulationCanvas";
import { StreetLevelMap } from "./components/StreetLevelMap";
import { TelemetryDashboard } from "./components/TelemetryDashboard";
import { AIAdvisorModal } from "./components/AIAdvisorModal";
import { BlueprintModal } from "./components/BlueprintModal";
import { MapStation } from "./types";

export default function App() {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<
    "overview" | "inspector" | "simulation" | "map" | "telemetry"
  >("overview");

  // Shared simulation state
  const [simulationMode, setSimulationMode] = useState<"highway_corridor" | "timing_belt_rig">("highway_corridor");
  const [currentRpm, setCurrentRpm] = useState<number>(142);
  const [powerWatts, setPowerWatts] = useState<number>(86.4);
  const [trappingRateUgS, setTrappingRateUgS] = useState<number>(38.5);
  const [trappedGrams, setTrappedGrams] = useState<number>(14.2);
  const [cadrM3h, setCadrM3h] = useState<number>(195);
  const [filterSaturation, setFilterSaturation] = useState<number>(28);

  // Modals
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [isBlueprintModalOpen, setIsBlueprintModalOpen] = useState<boolean>(false);

  // Handler for telemetry updates from the simulation
  const handleTelemetryUpdate = (data: {
    rpm: number;
    powerWatts: number;
    trappingRateUgS: number;
    trappedGrams: number;
    cadrM3h: number;
    filterSaturationDelta: number;
  }) => {
    setCurrentRpm(data.rpm);
    setPowerWatts(data.powerWatts);
    setTrappingRateUgS(data.trappingRateUgS);
    setTrappedGrams(data.trappedGrams);
    setCadrM3h(data.cadrM3h);
    setFilterSaturation((prev) => Math.min(100, prev + data.filterSaturationDelta));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Main Navigation Header */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Brand & Project Identity */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10">
              <Wind className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-100 tracking-tight font-mono">
                  CVWT TRAFFIC POLLUTANT TRAPPING & SIMULATION
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold">
                  Ahmed Abouelezz DWG
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Highway Median Cross-flow Vertical Wind Turbine • Two-Way Shear Induction • Real-Time GIS
              </p>
            </div>
          </div>

          {/* Key Live Status Ticker */}
          <div className="hidden lg:flex items-center gap-4 bg-slate-950/80 px-4 py-2 rounded-xl border border-slate-800 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-slate-400">Rotor:</span>
              <span className="text-emerald-400 font-bold">{Math.round(currentRpm)} RPM</span>
            </div>
            <div className="w-px h-4 bg-slate-800" />
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-sky-400" />
              <span className="text-slate-400">Trapping:</span>
              <span className="text-sky-400 font-bold">{trappingRateUgS.toFixed(1)} µg/s</span>
            </div>
            <div className="w-px h-4 bg-slate-800" />
            <div className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-slate-400">Harvested:</span>
              <span className="text-amber-400 font-bold">{Math.round(powerWatts)} W</span>
            </div>
            <div className="w-px h-4 bg-slate-800" />
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-slate-400">Filter Core:</span>
              <span className="text-purple-300 font-bold">{Math.round(filterSaturation)}%</span>
            </div>
          </div>

          {/* Quick Action Tools */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsBlueprintModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs font-medium transition-colors"
            >
              <FileText className="h-3.5 w-3.5 text-emerald-400" />
              <span>CAD Blueprints</span>
            </button>
            <button
              onClick={() => setIsAiModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 text-xs font-semibold shadow-lg shadow-sky-500/10 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5 text-sky-400" />
              <span>Gemini AI Copilot</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation Navigation Bar */}
        <div className="max-w-7xl mx-auto mt-3 flex items-center gap-1 overflow-x-auto pb-1 text-xs">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
              activeTab === "overview"
                ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Integrated Studio</span>
          </button>
          <button
            onClick={() => setActiveTab("inspector")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
              activeTab === "inspector"
                ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Wind className="h-3.5 w-3.5" />
            <span>CVWT 3D & Section A-A</span>
          </button>
          <button
            onClick={() => setActiveTab("simulation")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
              activeTab === "simulation"
                ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Car className="h-3.5 w-3.5" />
            <span>Two-Way Traffic Simulator</span>
          </button>
          <button
            onClick={() => setActiveTab("map")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
              activeTab === "map"
                ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Compass className="h-3.5 w-3.5" />
            <span>Street-Level GIS Map</span>
          </button>
          <button
            onClick={() => setActiveTab("telemetry")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
              activeTab === "telemetry"
                ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>Telemetry & Analytics</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 space-y-4">
        {/* OVERVIEW / INTEGRATED STUDIO TAB */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            {/* Engineering Overview Banner */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1 max-w-3xl">
                <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  TWO-WAY HIGHWAY BOUNDARY LAYER VORTEX HARVESTING
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Vehicles traversing opposing highway lanes generate complementary wake shear along the median.
                  The <strong>Ahmed Abouelezz CVWT</strong> (184cm height, Ø66cm rotor, Ø90cm base) converts this slipstream
                  into rotational torque, while centrifugal suction pulls soot and PM2.5 into the blade perforations and
                  internal <strong>Section A-A multilayer filter core</strong>.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsBlueprintModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium"
                >
                  View CAD Specs
                </button>
                <button
                  onClick={() => setIsAiModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold"
                >
                  Analyze with Gemini
                </button>
              </div>
            </div>

            {/* Split Grid: 3D Inspector + Traffic Simulation */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-6 h-[560px]">
                <CVWT3DInspector
                  currentRpm={currentRpm}
                  filterSaturation={filterSaturation}
                  isTrappingActive={true}
                  onOpenBlueprintModal={() => setIsBlueprintModalOpen(true)}
                />
              </div>
              <div className="lg:col-span-6 h-[560px]">
                <TrafficSimulationCanvas
                  onTelemetryUpdate={handleTelemetryUpdate}
                  simulationMode={simulationMode}
                  setSimulationMode={setSimulationMode}
                />
              </div>
            </div>

            {/* Second Row: Street-Level Map + Live Telemetry */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-6 h-[580px]">
                <StreetLevelMap
                  activeFilterEfficiency={99.8}
                />
              </div>
              <div className="lg:col-span-6 h-[580px]">
                <TelemetryDashboard
                  currentRpm={currentRpm}
                  powerWatts={powerWatts}
                  trappingRateUgS={trappingRateUgS}
                  trappedGrams={trappedGrams}
                  cadrM3h={cadrM3h}
                  filterSaturation={filterSaturation}
                  onOpenAiAdvisor={() => setIsAiModalOpen(true)}
                />
              </div>
            </div>
          </div>
        )}

        {/* DEDICATED CVWT 3D INSPECTOR TAB */}
        {activeTab === "inspector" && (
          <div className="h-[calc(100vh-140px)] min-h-[640px]">
            <CVWT3DInspector
              currentRpm={currentRpm}
              filterSaturation={filterSaturation}
              isTrappingActive={true}
              onOpenBlueprintModal={() => setIsBlueprintModalOpen(true)}
            />
          </div>
        )}

        {/* DEDICATED TRAFFIC SIMULATOR TAB */}
        {activeTab === "simulation" && (
          <div className="h-[calc(100vh-140px)] min-h-[640px]">
            <TrafficSimulationCanvas
              onTelemetryUpdate={handleTelemetryUpdate}
              simulationMode={simulationMode}
              setSimulationMode={setSimulationMode}
            />
          </div>
        )}

        {/* DEDICATED STREET-LEVEL MAP TAB */}
        {activeTab === "map" && (
          <div className="h-[calc(100vh-140px)] min-h-[640px]">
            <StreetLevelMap
              activeFilterEfficiency={99.8}
            />
          </div>
        )}

        {/* DEDICATED TELEMETRY & ANALYTICS TAB */}
        {activeTab === "telemetry" && (
          <div className="h-[calc(100vh-140px)] min-h-[640px]">
            <TelemetryDashboard
              currentRpm={currentRpm}
              powerWatts={powerWatts}
              trappingRateUgS={trappingRateUgS}
              trappedGrams={trappedGrams}
              cadrM3h={cadrM3h}
              filterSaturation={filterSaturation}
              onOpenAiAdvisor={() => setIsAiModalOpen(true)}
            />
          </div>
        )}
      </main>

      {/* Modals */}
      <AIAdvisorModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        telemetry={{
          rpm: currentRpm,
          powerWatts,
          trappingRateUgS,
          trappedGrams,
          cadrM3h,
          filterSaturation,
        }}
      />

      <BlueprintModal
        isOpen={isBlueprintModalOpen}
        onClose={() => setIsBlueprintModalOpen(false)}
      />
    </div>
  );
}
