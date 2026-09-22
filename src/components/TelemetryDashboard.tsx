import React, { useState, useEffect, useRef } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  Activity,
  Zap,
  Filter,
  Wind,
  ShieldCheck,
  AlertTriangle,
  Download,
  Calendar,
  Sparkles,
  Layers,
  Clock,
  TrendingUp,
  CircleDot,
  CheckCircle2,
  Flame,
  Disc,
} from "lucide-react";
import { CVWT_DEFAULT_SPECS } from "../data/blueprintData";

interface TelemetryDashboardProps {
  currentRpm: number;
  powerWatts: number;
  trappingRateUgS: number;
  trappedGrams: number;
  cadrM3h: number;
  filterSaturation: number;
  onOpenAiAdvisor: () => void;
}

export const TelemetryDashboard: React.FC<TelemetryDashboardProps> = ({
  currentRpm,
  powerWatts,
  trappingRateUgS,
  trappedGrams,
  cadrM3h,
  filterSaturation,
  onOpenAiAdvisor,
}) => {
  const [historyData, setHistoryData] = useState<Array<{
    time: string;
    rpm: number;
    power: number;
    trappingRate: number;
    cadr: number;
    deltaP: number;
  }>>([]);

  // Dedicated real-time pollutant accumulation trends (PM2.5 vs PM10)
  const [accumulationData, setAccumulationData] = useState<Array<{
    time: string;
    elapsedSeconds: number;
    pm25Mg: number;
    pm10Mg: number;
    totalMg: number;
    pm25Rate: number;
    pm10Rate: number;
    totalRate: number;
  }>>([]);

  const [activeTab, setActiveTab] = useState<"trapping" | "energy" | "cadr" | "filters" | "pm_trends">("trapping");
  const [trendMetricMode, setTrendMetricMode] = useState<"cumulative" | "rate">("cumulative");
  const [timeWindowMode, setTimeWindowMode] = useState<"all" | "recent">("all");
  const simulationStartTimeRef = useRef<number>(Date.now());

  // Keep a scrolling 25-sample telemetry history
  useEffect(() => {
    const now = new Date();
    const timeStr = `${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

    setHistoryData((prev) => {
      const next = [
        ...prev,
        {
          time: timeStr,
          rpm: Math.round(currentRpm),
          power: Math.round(powerWatts),
          trappingRate: Number(trappingRateUgS.toFixed(1)),
          cadr: Math.round(cadrM3h),
          deltaP: Math.round(120 + filterSaturation * 0.9),
        },
      ];
      if (next.length > 25) next.shift();
      return next;
    });
  }, [currentRpm, powerWatts, trappingRateUgS, cadrM3h, filterSaturation]);

  // Track Real-Time PM2.5 vs PM10 Pollutant Accumulation Trends over the current simulation run
  useEffect(() => {
    const now = new Date();
    const timeStr = `${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
    const elapsedSec = Math.round((Date.now() - simulationStartTimeRef.current) / 1000);

    // Total trapped in milligrams (1 g = 1000 mg)
    const totalMg = Number((trappedGrams * 1000).toFixed(2));
    // Fine particulate fraction (exhaust combustion soot + fine brake dust < 2.5µm) = 52%
    const pm25Mg = Number((totalMg * 0.52).toFixed(2));
    // Coarse particulate fraction (tire wear microplastics + brake wear coarse + road dust 2.5-10µm) = 48%
    const pm10Mg = Number((totalMg * 0.48).toFixed(2));

    const pm25Rate = Number((trappingRateUgS * 0.52).toFixed(1));
    const pm10Rate = Number((trappingRateUgS * 0.48).toFixed(1));
    const totalRate = Number(trappingRateUgS.toFixed(1));

    setAccumulationData((prev) => {
      // If simulation was reset (trappedGrams reset to 0), reset session accumulation
      if (trappedGrams === 0 && prev.length > 2 && prev[prev.length - 1].totalMg > 0.05) {
        simulationStartTimeRef.current = Date.now();
        return [
          {
            time: timeStr,
            elapsedSeconds: 0,
            pm25Mg: 0,
            pm10Mg: 0,
            totalMg: 0,
            pm25Rate: 0,
            pm10Rate: 0,
            totalRate: 0,
          },
        ];
      }

      const next = [
        ...prev,
        {
          time: timeStr,
          elapsedSeconds: elapsedSec,
          pm25Mg,
          pm10Mg,
          totalMg,
          pm25Rate,
          pm10Rate,
          totalRate,
        },
      ];
      if (next.length > 60) next.shift();
      return next;
    });
  }, [trappedGrams, trappingRateUgS]);

  const handleExportCsv = () => {
    const headers = "Time,Rotor_RPM,Power_Watts,TrappingRate_ug_s,CADR_m3_h,DeltaP_Pa\n";
    const rows = historyData
      .map((d) => `${d.time},${d.rpm},${d.power},${d.trappingRate},${d.cadr},${d.deltaP}`)
      .join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cvwt_telemetry_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPmCsv = () => {
    const headers =
      "Timestamp,Elapsed_Seconds,PM25_Trapped_mg,PM10_Trapped_mg,Total_Trapped_mg,PM25_Rate_ug_s,PM10_Rate_ug_s,Total_Rate_ug_s\n";
    const rows = accumulationData
      .map(
        (d) =>
          `${d.time},${d.elapsedSeconds},${d.pm25Mg},${d.pm10Mg},${d.totalMg},${d.pm25Rate},${d.pm10Rate},${d.totalRate}`
      )
      .join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cvwt_pm_accumulation_trends_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered dataset for PM Accumulation Chart
  const displayAccumulationData =
    timeWindowMode === "recent" ? accumulationData.slice(-20) : accumulationData;

  const currentPm25Mg = (trappedGrams * 1000 * 0.52).toFixed(2);
  const currentPm10Mg = (trappedGrams * 1000 * 0.48).toFixed(2);
  const currentTotalMg = (trappedGrams * 1000).toFixed(2);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col h-full">
      {/* Header */}
      <div className="bg-slate-950/90 px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wider font-mono">
                Real-Time Telemetry & Environmental Analytics
              </h2>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Live Sensor Feed
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Clean air delivery rate, harvested aerodynamic energy, and filter loading diagnostics
            </p>
          </div>
        </div>

        {/* Chart Selector Tabs & Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab("trapping")}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                activeTab === "trapping"
                  ? "bg-emerald-500 text-slate-950 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              PM Trapping
            </button>
            <button
              onClick={() => setActiveTab("pm_trends")}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1 ${
                activeTab === "pm_trends"
                  ? "bg-rose-500 text-slate-950 font-semibold shadow-sm"
                  : "text-rose-400/80 hover:text-rose-300"
              }`}
            >
              <TrendingUp className="h-3 w-3" />
              <span>PM2.5 vs PM10</span>
            </button>
            <button
              onClick={() => setActiveTab("energy")}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                activeTab === "energy"
                  ? "bg-emerald-500 text-slate-950 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Energy (W)
            </button>
            <button
              onClick={() => setActiveTab("cadr")}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                activeTab === "cadr"
                  ? "bg-emerald-500 text-slate-950 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              CADR & ΔP
            </button>
            <button
              onClick={() => setActiveTab("filters")}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                activeTab === "filters"
                  ? "bg-emerald-500 text-slate-950 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Filter Health
            </button>
          </div>

          <button
            onClick={handleExportCsv}
            title="Export CSV Log"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium transition-colors"
          >
            <Download className="h-3.5 w-3.5 text-emerald-400" />
            <span className="hidden sm:inline">CSV</span>
          </button>

          <button
            onClick={onOpenAiAdvisor}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 text-xs font-semibold transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5 text-sky-400" />
            <span>AI Advisor</span>
          </button>
        </div>
      </div>

      {/* Scrollable Container with KPI Ribbon, Main Chart Stage, and Pollutant Accumulation Section */}
      <div className="overflow-y-auto flex-1 divide-y divide-slate-800/80">
        {/* KPI Metric Summary Ribbon */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-slate-950/60">
          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Trapping Rate</span>
              <Filter className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-bold font-mono text-emerald-400">
              {trappingRateUgS.toFixed(1)} <span className="text-xs text-slate-400">µg/s</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Cumulative: {trappedGrams.toFixed(2)} g soot captured
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Clean Air Delivery (CADR)</span>
              <Wind className="h-3.5 w-3.5 text-sky-400" />
            </div>
            <div className="text-xl font-bold font-mono text-sky-400">
              {Math.round(cadrM3h)} <span className="text-xs text-slate-400">m³/h</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Centrifugal suction across blade holes
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Wake Energy Harvested</span>
              <Zap className="h-3.5 w-3.5 text-amber-400" />
            </div>
            <div className="text-xl font-bold font-mono text-amber-400">
              {Math.round(powerWatts)} <span className="text-xs text-slate-400">W</span>
            </div>
            <div className="text-[11px] text-emerald-400 mt-1">
              Net Energy Positive (Self-sustaining)
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Differential Pressure ΔP</span>
              <ShieldCheck className="h-3.5 w-3.5 text-purple-400" />
            </div>
            <div className="text-xl font-bold font-mono text-purple-400">
              {Math.round(120 + filterSaturation * 0.9)} <span className="text-xs text-slate-400">Pa</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Section A-A core saturation: {Math.round(filterSaturation)}%
            </div>
          </div>
        </div>

        {/* Main Chart Stage */}
        <div className="p-4 min-h-[290px]">
          {activeTab === "trapping" && (
            <div className="flex flex-col">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span className="font-semibold text-slate-200">
                  Pollutant Trapping Flux Rate (µg/s)
                </span>
                <span className="text-emerald-400 font-mono">
                  Real-time Particulate Capture
                </span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={historyData}>
                    <defs>
                      <linearGradient id="trappingGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#090d16",
                        borderColor: "#334155",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="trappingRate"
                      name="Trapping Rate (µg/s)"
                      stroke="#10b981"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#trappingGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {activeTab === "pm_trends" && (
            <div className="flex flex-col">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-200">
                    Filter Core Pollutant Trapping Dynamics (PM2.5 vs PM10)
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/30">
                    Live Accumulation
                  </span>
                </div>
                <span className="text-slate-400 font-mono text-[11px]">
                  Total Trapped: <strong className="text-emerald-400">{currentTotalMg} mg</strong>
                </span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={displayAccumulationData}>
                    <defs>
                      <linearGradient id="pm25TabGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.7} />
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="pm10TabGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.6} />
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
                    <YAxis
                      stroke="#64748b"
                      tick={{ fontSize: 11 }}
                      unit={trendMetricMode === "cumulative" ? " mg" : " µg/s"}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#090d16",
                        borderColor: "#334155",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey={trendMetricMode === "cumulative" ? "pm25Mg" : "pm25Rate"}
                      name="PM2.5 Trapped (Exhaust Soot & Aerosols)"
                      stroke="#f43f5e"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#pm25TabGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey={trendMetricMode === "cumulative" ? "pm10Mg" : "pm10Rate"}
                      name="PM10 Trapped (Brake Debris & Tire Wear)"
                      stroke="#0ea5e9"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#pm10TabGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {activeTab === "energy" && (
            <div className="flex flex-col">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span className="font-semibold text-slate-200">
                  Slipstream Kinetic Energy Harvested (Watts) vs Rotor RPM
                </span>
                <span className="text-amber-400 font-mono">
                  Two-way Traffic Wake Induction
                </span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" stroke="#f59e0b" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" stroke="#38bdf8" tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#090d16",
                        borderColor: "#334155",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="power"
                      name="Power (Watts)"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="rpm"
                      name="Rotor Angular Speed (RPM)"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {activeTab === "cadr" && (
            <div className="flex flex-col">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span className="font-semibold text-slate-200">
                  Clean Air Delivery Rate (CADR m³/h) & Differential ΔP (Pa)
                </span>
                <span className="text-sky-400 font-mono">Air Purification Flow</span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={historyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#090d16",
                        borderColor: "#334155",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="cadr"
                      name="CADR (m³/h)"
                      stroke="#0284c7"
                      fill="#0284c7"
                      fillOpacity={0.3}
                    />
                    <Line
                      type="monotone"
                      dataKey="deltaP"
                      name="ΔP Pressure (Pa)"
                      stroke="#a855f7"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {activeTab === "filters" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-200">
                  Section A-A Multilayer Filter Saturation Breakdown
                </span>
                <span className="text-emerald-400">Maintenance Window: ~14 Days</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {CVWT_DEFAULT_SPECS.filterLayers.map((layer) => {
                  const sat = Math.min(100, Math.round(layer.currentSaturationPercent + filterSaturation * 0.45));
                  const isWarning = sat > 75;
                  return (
                    <div key={layer.id} className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-200">{layer.name}</span>
                        <span
                          className={`font-mono font-bold ${
                            isWarning ? "text-amber-400" : "text-emerald-400"
                          }`}
                        >
                          {sat}% Saturation
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isWarning ? "bg-amber-500" : "bg-emerald-500"
                          }`}
                          style={{ width: `${sat}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>Rated Efficiency: {layer.efficiencyPercent}%</span>
                        <span>Target: {layer.targetPollutants[0]}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* NEW DEDICATED SECTION: REAL-TIME POLLUTANT ACCUMULATION TRENDS (PM2.5 vs PM10) */}
        {/* ========================================================================= */}
        <div className="p-4 bg-slate-950/40 space-y-4">
          {/* Section Header & Interactive Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider font-mono">
                    CVWT Filter Core Accumulation Trends (PM2.5 vs PM10)
                  </h3>
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Active Core Run
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Continuous mass accumulation of fine exhaust soot (PM2.5) vs mechanical abrasion dust (PM10) trapped by internal filters
                </p>
              </div>
            </div>

            {/* Interactive Filters & Controls */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {/* Metric Mode Toggle: Cumulative (mg) vs Trapping Rate (µg/s) */}
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                <button
                  onClick={() => setTrendMetricMode("cumulative")}
                  className={`px-2.5 py-1 rounded font-medium transition-colors ${
                    trendMetricMode === "cumulative"
                      ? "bg-rose-500 text-slate-950 font-bold shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  title="Plot cumulative milligrams trapped over the simulation run"
                >
                  Cumulative Mass (mg)
                </button>
                <button
                  onClick={() => setTrendMetricMode("rate")}
                  className={`px-2.5 py-1 rounded font-medium transition-colors ${
                    trendMetricMode === "rate"
                      ? "bg-rose-500 text-slate-950 font-bold shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  title="Plot instantaneous trapping flux in µg/s"
                >
                  Trapping Flux (µg/s)
                </button>
              </div>

              {/* Time Window Selector */}
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                <button
                  onClick={() => setTimeWindowMode("all")}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    timeWindowMode === "all"
                      ? "bg-slate-700 text-slate-100 font-semibold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Full Run
                </button>
                <button
                  onClick={() => setTimeWindowMode("recent")}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    timeWindowMode === "recent"
                      ? "bg-slate-700 text-slate-100 font-semibold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Rolling 20s
                </button>
              </div>

              {/* Export PM Dataset CSV */}
              <button
                onClick={handleExportPmCsv}
                title="Export PM2.5 vs PM10 Time-Series CSV"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
              >
                <Download className="h-3.5 w-3.5 text-rose-400" />
                <span className="hidden sm:inline">Export PM</span>
              </button>
            </div>
          </div>

          {/* Recharts Area Plot: PM2.5 vs PM10 Trapped Over Current Simulation Run */}
          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 text-rose-400 font-medium">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                  PM2.5: <strong className="font-mono text-rose-300">{currentPm25Mg} mg</strong> ({trendMetricMode === "cumulative" ? "52% mass" : `${(trappingRateUgS * 0.52).toFixed(1)} µg/s`})
                </span>
                <span className="flex items-center gap-1.5 text-sky-400 font-medium">
                  <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                  PM10: <strong className="font-mono text-sky-300">{currentPm10Mg} mg</strong> ({trendMetricMode === "cumulative" ? "48% mass" : `${(trappingRateUgS * 0.48).toFixed(1)} µg/s`})
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                Core Total: <strong className="text-emerald-400 font-bold">{currentTotalMg} mg</strong> ({displayAccumulationData.length} samples)
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={displayAccumulationData}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="sectionPm25Grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.65} />
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.03} />
                    </linearGradient>
                    <linearGradient id="sectionPm10Grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.55} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="time"
                    stroke="#64748b"
                    tick={{ fontSize: 11, fontFamily: "monospace" }}
                  />
                  <YAxis
                    stroke="#64748b"
                    tick={{ fontSize: 11, fontFamily: "monospace" }}
                    unit={trendMetricMode === "cumulative" ? " mg" : " µg/s"}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#090d16",
                      borderColor: "#334155",
                      borderRadius: "10px",
                      fontSize: "12px",
                      boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.5)",
                    }}
                    formatter={(value: any, name: any) => [
                      `${value} ${trendMetricMode === "cumulative" ? "mg" : "µg/s"}`,
                      name,
                    ]}
                    labelFormatter={(label) => `Time: ${label}`}
                  />
                  <Legend
                    verticalAlign="top"
                    height={32}
                    iconType="circle"
                    formatter={(value) => <span className="text-xs text-slate-300 font-medium">{value}</span>}
                  />
                  <Area
                    type="monotone"
                    dataKey={trendMetricMode === "cumulative" ? "pm25Mg" : "pm25Rate"}
                    name="PM2.5 (Fine Exhaust Soot & Sub-micron PM)"
                    stroke="#f43f5e"
                    strokeWidth={2.2}
                    fillOpacity={1}
                    fill="url(#sectionPm25Grad)"
                  />
                  <Area
                    type="monotone"
                    dataKey={trendMetricMode === "cumulative" ? "pm10Mg" : "pm10Rate"}
                    name="PM10 (Coarse Brake Dust, Tire Wear & Aggregate)"
                    stroke="#0ea5e9"
                    strokeWidth={2.2}
                    fillOpacity={1}
                    fill="url(#sectionPm10Grad)"
                  />
                  {trendMetricMode === "cumulative" && (
                    <Line
                      type="monotone"
                      dataKey="totalMg"
                      name="Total Particulate Trapped (mg)"
                      stroke="#10b981"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Granular Pollutant Trapping Classification Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            {/* PM2.5 Card */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                    <Flame className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-xs font-semibold text-slate-200">PM2.5 (Fine Fraction)</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 font-bold">
                  HEPA H13 (99.7%)
                </span>
              </div>
              <div className="flex items-baseline justify-between pt-1">
                <div>
                  <div className="text-lg font-bold font-mono text-rose-400">
                    {currentPm25Mg} <span className="text-xs text-slate-400">mg</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Capture Rate: <span className="text-rose-300 font-mono">{(trappingRateUgS * 0.52).toFixed(1)} µg/s</span>
                  </div>
                </div>
                <div className="text-right text-[11px] text-slate-400">
                  <div className="font-mono font-semibold text-slate-200">52.0% share</div>
                  <div>dp &lt; 2.5 µm</div>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80 leading-relaxed">
                Diesel combustion soot, unburnt hydrocarbons, and sub-micron volatile metal condensates drawn into internal core fiber matrix.
              </p>
            </div>

            {/* PM10 Card */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                    <Disc className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-xs font-semibold text-slate-200">PM10 (Coarse Inhalable)</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20 font-bold">
                  Pre-Filter (85.0%)
                </span>
              </div>
              <div className="flex items-baseline justify-between pt-1">
                <div>
                  <div className="text-lg font-bold font-mono text-sky-400">
                    {currentPm10Mg} <span className="text-xs text-slate-400">mg</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Capture Rate: <span className="text-sky-300 font-mono">{(trappingRateUgS * 0.48).toFixed(1)} µg/s</span>
                  </div>
                </div>
                <div className="text-right text-[11px] text-slate-400">
                  <div className="font-mono font-semibold text-slate-200">48.0% share</div>
                  <div>2.5 µm &lt; dp &lt; 10 µm</div>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80 leading-relaxed">
                Tire abrasion microplastics, brake lining cast-iron filings, and resuspended mineral road aggregate trapped by 50µm cyclonic mesh.
              </p>
            </div>

            {/* Inflow Ratio & Core Dynamics Card */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <ShieldCheck className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-xs font-semibold text-slate-200">Core Trapping Ratio</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                  PM2.5/PM10: 1.08
                </span>
              </div>
              <div className="flex items-baseline justify-between pt-1">
                <div>
                  <div className="text-lg font-bold font-mono text-emerald-400">
                    {currentTotalMg} <span className="text-xs text-slate-400">mg total</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Clean Air Scrubbed: <span className="text-emerald-300 font-mono">{(cadrM3h * (accumulationData.length * 0.5) / 3600).toFixed(2)} m³</span>
                  </div>
                </div>
                <div className="text-right text-[11px] text-slate-400">
                  <div className="font-mono font-semibold text-purple-300">
                    {Math.round(120 + filterSaturation * 0.9)} Pa
                  </div>
                  <div>ΔP Core Inflow</div>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80 leading-relaxed">
                Balanced extraction of exhausting and non-exhausting particulates prevents highway corridor air stagnation along the central median.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
