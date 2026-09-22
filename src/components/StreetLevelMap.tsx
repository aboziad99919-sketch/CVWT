import React, { useState, useRef, useEffect } from "react";
import {
  MapPin,
  Layers,
  Wind,
  Shield,
  Eye,
  Activity,
  Sliders,
  Sparkles,
  Maximize2,
  Navigation,
  Compass,
  AlertCircle,
  TrendingDown,
  Info,
} from "lucide-react";
import { MapStation } from "../types";
import { DEFAULT_MAP_STATIONS } from "../data/blueprintData";

interface StreetLevelMapProps {
  onSelectStation?: (station: MapStation) => void;
  activeFilterEfficiency: number;
}

export const StreetLevelMap: React.FC<StreetLevelMapProps> = ({
  onSelectStation,
  activeFilterEfficiency,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stations, setStations] = useState<MapStation[]>(DEFAULT_MAP_STATIONS);
  const [selectedStation, setSelectedStation] = useState<MapStation>(DEFAULT_MAP_STATIONS[0]);
  const [activeLayer, setActiveLayer] = useState<"aqi_heatmap" | "pm25_plume" | "wind_vectors">("aqi_heatmap");
  const [comparisonMode, setComparisonMode] = useState<"with_cvwt" | "without_cvwt" | "split_view">("with_cvwt");
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [mapPan, setMapPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isStreetViewModalOpen, setIsStreetViewModalOpen] = useState<boolean>(false);

  const isDraggingRef = useRef<boolean>(false);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Map rendering loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * window.devicePixelRatio || canvas.height !== rect.height * window.devicePixelRatio) {
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
      }

      ctx.save();
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      const w = rect.width;
      const h = rect.height;

      // Draw modern dark vector map background
      ctx.fillStyle = "#090d16";
      ctx.fillRect(0, 0, w, h);

      // Map Grid & Coordinates
      ctx.strokeStyle = "rgba(30, 41, 59, 0.5)";
      ctx.lineWidth = 1;
      const step = 48 * zoomLevel;
      const offsetX = (mapPan.x * zoomLevel) % step;
      const offsetY = (mapPan.y * zoomLevel) % step;

      for (let x = offsetX; x < w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = offsetY; y < h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Draw Highway Corridors & Road Networks
      renderRoadwayNetwork(ctx, w, h, mapPan, zoomLevel);

      // Render Heatmaps (AQI or PM2.5 or Wind Vectors)
      renderEnvironmentalHeatmap(
        ctx,
        w,
        h,
        mapPan,
        zoomLevel,
        stations,
        activeLayer,
        comparisonMode,
        activeFilterEfficiency
      );

      // Render CVWT Station Markers along the median
      renderStationMarkers(
        ctx,
        w,
        h,
        mapPan,
        zoomLevel,
        stations,
        selectedStation,
        comparisonMode
      );

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [stations, selectedStation, activeLayer, comparisonMode, zoomLevel, mapPan, activeFilterEfficiency]);

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    setMapPan((prev) => ({
      x: prev.x + dx / zoomLevel,
      y: prev.y + dy / zoomLevel,
    }));
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Check hit test for station markers
    stations.forEach((st, idx) => {
      const pos = getStationCanvasCoords(st, rect.width, rect.height, mapPan, zoomLevel);
      const dist = Math.hypot(mouseX - pos.x, mouseY - pos.y);
      if (dist < 24) {
        setSelectedStation(st);
        if (onSelectStation) onSelectStation(st);
      }
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col h-full">
      {/* Header Bar */}
      <div className="bg-slate-950/90 px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Compass className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wider font-mono">
                Street-Level Environmental GIS Map
              </h2>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Spatial Diffusion Model
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Corridor pollutant dispersion and median CVWT network trapping telemetry
            </p>
          </div>
        </div>

        {/* Heatmap Layer Selector */}
        <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setActiveLayer("aqi_heatmap")}
            className={`px-2.5 py-1 rounded font-medium transition-colors ${
              activeLayer === "aqi_heatmap"
                ? "bg-emerald-500 text-slate-950 font-semibold shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            AQI Heatmap
          </button>
          <button
            onClick={() => setActiveLayer("pm25_plume")}
            className={`px-2.5 py-1 rounded font-medium transition-colors ${
              activeLayer === "pm25_plume"
                ? "bg-emerald-500 text-slate-950 font-semibold shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            PM2.5 Plume
          </button>
          <button
            onClick={() => setActiveLayer("wind_vectors")}
            className={`px-2.5 py-1 rounded font-medium transition-colors ${
              activeLayer === "wind_vectors"
                ? "bg-emerald-500 text-slate-950 font-semibold shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Wind & Wake
          </button>
        </div>

        {/* Comparison Toggle */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setComparisonMode("with_cvwt")}
            className={`px-2.5 py-1 rounded font-semibold transition-colors ${
              comparisonMode === "with_cvwt"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            With Active CVWT
          </button>
          <button
            onClick={() => setComparisonMode("without_cvwt")}
            className={`px-2.5 py-1 rounded font-semibold transition-colors ${
              comparisonMode === "without_cvwt"
                ? "bg-red-500/20 text-red-300 border border-red-500/40"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            No CVWT (Baseline)
          </button>
        </div>
      </div>

      {/* Main Map Viewport */}
      <div className="relative flex-1 min-h-[380px] w-full bg-slate-950">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleCanvasClick}
          className="w-full h-full block cursor-grab active:cursor-grabbing"
        />

        {/* Map Zoom & Recenter Controls */}
        <div className="absolute top-3 right-3 flex flex-col gap-1.5 bg-slate-950/85 backdrop-blur-md p-1.5 rounded-lg border border-slate-800 shadow-xl">
          <button
            onClick={() => setZoomLevel((z) => Math.min(2.2, z + 0.2))}
            title="Zoom In"
            className="p-1.5 rounded text-slate-300 hover:bg-slate-800 text-xs font-bold"
          >
            +
          </button>
          <button
            onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.2))}
            title="Zoom Out"
            className="p-1.5 rounded text-slate-300 hover:bg-slate-800 text-xs font-bold"
          >
            -
          </button>
          <button
            onClick={() => {
              setMapPan({ x: 0, y: 0 });
              setZoomLevel(1.0);
            }}
            title="Recenter Map"
            className="p-1.5 rounded text-slate-300 hover:bg-slate-800 text-xs"
          >
            <Navigation className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Selected Station Telemetry Card */}
        {selectedStation && (
          <div className="absolute bottom-3 left-3 max-w-sm bg-slate-950/90 backdrop-blur-md p-3.5 rounded-xl border border-slate-800 shadow-2xl text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-100 flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-emerald-400" />
                {selectedStation.name}
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                {selectedStation.cvwtUnitsCount} CVWT Units
              </span>
            </div>
            <div className="text-[11px] text-slate-400">{selectedStation.roadName}</div>

            {/* AQI Delta Badge */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-[10px] text-slate-400">Baseline Exposure</div>
                <div className="text-base font-bold font-mono text-red-400">
                  {selectedStation.aqiBaseline} AQI
                </div>
                <div className="text-[10px] text-slate-400">{selectedStation.pm25BaselineUgM3} µg/m³ PM2.5</div>
              </div>
              <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/30">
                <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <TrendingDown className="h-3 w-3" />
                  With CVWT Active
                </div>
                <div className="text-base font-bold font-mono text-emerald-400">
                  {selectedStation.aqiCurrent} AQI
                </div>
                <div className="text-[10px] text-emerald-300">{selectedStation.pm25CurrentUgM3} µg/m³ PM2.5</div>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
              <span>Traffic Velocity: {selectedStation.avgSpeedKmh} km/h</span>
              <button
                onClick={() => setIsStreetViewModalOpen(true)}
                className="text-sky-400 hover:text-sky-300 font-medium flex items-center gap-1"
              >
                <Eye className="h-3.5 w-3.5" />
                Street-Level POV
              </button>
            </div>
          </div>
        )}

        {/* Legend in Bottom Right */}
        <div className="absolute bottom-3 right-3 bg-slate-950/85 backdrop-blur-md p-2.5 rounded-lg border border-slate-800 text-[11px] space-y-1 pointer-events-none">
          <div className="font-semibold text-slate-300">AQI RISK SCALE</div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-5 rounded bg-emerald-500" />
            <span className="text-slate-300">0 - 50 (Good)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-5 rounded bg-amber-500" />
            <span className="text-slate-300">51 - 100 (Moderate)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-5 rounded bg-orange-500" />
            <span className="text-slate-300">101 - 150 (Unhealthy Sensitive)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-5 rounded bg-red-500" />
            <span className="text-slate-300">151+ (Unhealthy / Hazardous)</span>
          </div>
        </div>
      </div>

      {/* Street View Perspective Modal */}
      {isStreetViewModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-emerald-400" />
                <h3 className="text-base font-semibold text-slate-100 font-mono">
                  Street-Level Perspective: Median CVWT Highway Array
                </h3>
              </div>
              <button
                onClick={() => setIsStreetViewModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <div className="relative h-64 bg-slate-950 rounded-xl border border-slate-800 overflow-hidden flex items-center justify-center">
              <StreetViewGraphic station={selectedStation} />
            </div>

            <div className="text-xs text-slate-300 leading-relaxed space-y-1">
              <p>
                <strong>Highway Median Installation Architecture:</strong> The Ahmed Abouelezz CVWT units
                are anchored directly along the reinforced concrete highway divider at 15-meter intervals.
              </p>
              <p className="text-slate-400">
                As vehicles zip by in opposing directions, their aerodynamic boundary layers funnel directly
                into the helical blades. The continuous suction captures particulate matter (PM2.5, tire dust,
                black soot) right at the emission source before it diffuses into pedestrian sidewalks or adjacent
                residential neighborhoods.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsStreetViewModalOpen(false)}
                className="px-4 py-2 bg-emerald-500 text-slate-950 rounded-lg text-xs font-bold hover:bg-emerald-400 transition-colors"
              >
                Close Perspective
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// MAP RENDER HELPER FUNCTIONS
// ==========================================

function renderRoadwayNetwork(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pan: { x: number; y: number },
  zoom: number
) {
  const cx = w / 2 + pan.x * zoom;
  const cy = h / 2 + pan.y * zoom;

  // Major Highway Corridor 1 (Curved East-West Ring Expressway)
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 36 * zoom;
  ctx.beginPath();
  ctx.moveTo(cx - 380 * zoom, cy - 80 * zoom);
  ctx.bezierCurveTo(cx - 150 * zoom, cy - 120 * zoom, cx + 150 * zoom, cy - 20 * zoom, cx + 420 * zoom, cy - 70 * zoom);
  ctx.stroke();

  // Highway Median line
  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 2 * zoom;
  ctx.beginPath();
  ctx.moveTo(cx - 380 * zoom, cy - 80 * zoom);
  ctx.bezierCurveTo(cx - 150 * zoom, cy - 120 * zoom, cx + 150 * zoom, cy - 20 * zoom, cx + 420 * zoom, cy - 70 * zoom);
  ctx.stroke();

  // Highway Corridor 2 (North-South Arterial Boulevard)
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 28 * zoom;
  ctx.beginPath();
  ctx.moveTo(cx - 50 * zoom, cy - 260 * zoom);
  ctx.bezierCurveTo(cx - 20 * zoom, cy - 60 * zoom, cx + 20 * zoom, cy + 80 * zoom, cx + 80 * zoom, cy + 280 * zoom);
  ctx.stroke();

  // Arterial Median
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2 * zoom;
  ctx.beginPath();
  ctx.moveTo(cx - 50 * zoom, cy - 260 * zoom);
  ctx.bezierCurveTo(cx - 20 * zoom, cy - 60 * zoom, cx + 20 * zoom, cy + 80 * zoom, cx + 80 * zoom, cy + 280 * zoom);
  ctx.stroke();
}

function renderEnvironmentalHeatmap(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pan: { x: number; y: number },
  zoom: number,
  stations: MapStation[],
  activeLayer: string,
  comparisonMode: string,
  activeFilterEfficiency: number
) {
  const isBaseline = comparisonMode === "without_cvwt";

  stations.forEach((st) => {
    const pt = getStationCanvasCoords(st, w, h, pan, zoom);
    const radius = 130 * zoom;

    const grad = ctx.createRadialGradient(pt.x, pt.y, 10 * zoom, pt.x, pt.y, radius);

    if (activeLayer === "aqi_heatmap") {
      if (isBaseline) {
        // High pollution red/orange plume
        grad.addColorStop(0, "rgba(239, 68, 68, 0.45)");
        grad.addColorStop(0.5, "rgba(249, 115, 22, 0.25)");
        grad.addColorStop(1, "rgba(239, 68, 68, 0)");
      } else {
        // With CVWT active: clean green / blue halo
        grad.addColorStop(0, "rgba(16, 185, 129, 0.4)");
        grad.addColorStop(0.5, "rgba(56, 189, 248, 0.2)");
        grad.addColorStop(1, "rgba(16, 185, 129, 0)");
      }
    } else if (activeLayer === "pm25_plume") {
      const pmVal = isBaseline ? st.pm25BaselineUgM3 : st.pm25CurrentUgM3;
      const alpha = Math.min(0.6, pmVal / 120);
      grad.addColorStop(0, `rgba(220, 38, 38, ${alpha})`);
      grad.addColorStop(0.6, `rgba(234, 88, 12, ${alpha * 0.5})`);
      grad.addColorStop(1, "rgba(220, 38, 38, 0)");
    } else {
      // Wind vectors / streamlines
      grad.addColorStop(0, "rgba(56, 189, 248, 0.3)");
      grad.addColorStop(1, "rgba(56, 189, 248, 0)");
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function renderStationMarkers(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pan: { x: number; y: number },
  zoom: number,
  stations: MapStation[],
  selectedStation: MapStation | null,
  comparisonMode: string
) {
  stations.forEach((st) => {
    const pt = getStationCanvasCoords(st, w, h, pan, zoom);
    const isSelected = selectedStation?.id === st.id;

    // Outer glow for selected
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 18 * zoom, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(16, 185, 129, 0.3)";
      ctx.fill();
    }

    // Station Pin
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 9 * zoom, 0, Math.PI * 2);
    ctx.fillStyle = comparisonMode === "without_cvwt" ? "#ef4444" : "#10b981";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Pulse animation ring
    const pulseR = 9 * zoom + (Math.sin(performance.now() * 0.005) + 1) * 4 * zoom;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pulseR, 0, Math.PI * 2);
    ctx.strokeStyle = comparisonMode === "without_cvwt" ? "rgba(239, 68, 68, 0.5)" : "rgba(16, 185, 129, 0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Station Name Label
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 11px JetBrains Mono, monospace";
    ctx.fillText(st.name, pt.x + 14 * zoom, pt.y + 4 * zoom);
  });
}

function getStationCanvasCoords(
  st: MapStation,
  w: number,
  h: number,
  pan: { x: number; y: number },
  zoom: number
) {
  const cx = w / 2 + pan.x * zoom;
  const cy = h / 2 + pan.y * zoom;

  // Map arbitrary coords into canvas space
  const offsets: Record<string, { x: number; y: number }> = {
    "st-ring-exp": { x: -160, y: -90 },
    "st-arterial-south": { x: 30, y: 70 },
    "st-freeway-junction": { x: 180, y: -40 },
    "st-harbor-approach": { x: -110, y: 140 },
  };

  const off = offsets[st.id] || { x: 0, y: 0 };
  return {
    x: cx + off.x * zoom,
    y: cy + off.y * zoom,
  };
}

function StreetViewGraphic({ station }: { station: MapStation }) {
  return (
    <div className="relative w-full h-full flex flex-col justify-end p-4">
      {/* Sky / Horizon */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900" />

      {/* Passing Highway Cars in Background */}
      <div className="relative z-10 flex items-center justify-between w-full mb-4">
        {/* Left lane car */}
        <div className="flex items-center gap-2">
          <div className="h-8 w-16 bg-red-600 rounded-md shadow-lg flex items-center justify-center text-[10px] font-bold text-white">
            100 km/h
          </div>
          <span className="text-[10px] font-mono text-red-400">◄ Opposing Traffic Slipstream</span>
        </div>

        {/* Center CVWT on Median */}
        <div className="flex flex-col items-center">
          <div className="w-12 h-20 border-2 border-emerald-400 bg-emerald-950/60 rounded-lg flex flex-col items-center justify-center shadow-lg shadow-emerald-500/20 animate-pulse">
            <span className="text-[9px] font-mono font-bold text-emerald-300">CVWT</span>
            <span className="text-[8px] font-mono text-sky-400">184cm</span>
          </div>
          <div className="w-4 h-8 bg-green-600" />
          <div className="w-16 h-3 bg-slate-700 rounded-sm" />
          <span className="text-[9px] font-mono text-emerald-400 mt-1">Highway Median</span>
        </div>

        {/* Right lane car */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-sky-400">Forward Traffic Slipstream ►</span>
          <div className="h-8 w-16 bg-sky-600 rounded-md shadow-lg flex items-center justify-center text-[10px] font-bold text-white">
            95 km/h
          </div>
        </div>
      </div>

      {/* Roadway Surface */}
      <div className="relative z-10 w-full h-10 bg-slate-950 border-t border-slate-700 flex items-center justify-center">
        <div className="w-full border-t-2 border-dashed border-amber-400/50" />
      </div>
    </div>
  );
}
