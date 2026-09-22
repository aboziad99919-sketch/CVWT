import React, { useState, useEffect } from "react";
import {
  Sparkles,
  ShieldCheck,
  Zap,
  Activity,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Cpu,
  Layers,
  ArrowRight,
} from "lucide-react";
import { AIAnalysisResult } from "../types";

interface AIAdvisorModalProps {
  isOpen: boolean;
  onClose: () => void;
  telemetry: {
    rpm: number;
    powerWatts: number;
    trappingRateUgS: number;
    trappedGrams: number;
    cadrM3h: number;
    filterSaturation: number;
  };
}

export const AIAdvisorModal: React.FC<AIAdvisorModalProps> = ({
  isOpen,
  onClose,
  telemetry,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string>("gemini-3.8-flash");

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trafficVolume: 4200,
          avgSpeedKmh: 85,
          heavyVehiclePercent: 22,
          turbineRpm: telemetry.rpm,
          pm25TrappingRate: telemetry.trappingRateUgS,
          cleanAirCadr: telemetry.cadrM3h,
          filterSaturation: telemetry.filterSaturation,
          powerGeneratedWatts: telemetry.powerWatts,
          deploymentLengthKm: 5.2,
          activeTurbineCount: 48,
        }),
      });

      const data = await res.json();
      if (data.success && data.analysis) {
        setAnalysis(data.analysis);
        setSource(data.source || "gemini-3.8-flash");
      } else {
        setError(data.error || "Analysis response format invalid");
      }
    } catch (err: any) {
      setError(err.message || "Failed to contact analysis server");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && !analysis) {
      runAnalysis();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-100 font-mono">
                  Gemini Aerodynamic & Trapping Advisor
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  {source}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Ground-truth assessment of CVWT wake fluid dynamics & Section A-A filtration
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-sm font-semibold p-1"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="h-8 w-8 text-sky-400 animate-spin" />
            <div className="text-sm font-semibold text-slate-300">
              Computing Navier-Stokes wake boundary layers & filtration loading...
            </div>
            <div className="text-xs text-slate-500 font-mono">
              Analyzing telemetry: {Math.round(telemetry.rpm)} RPM | {telemetry.trappingRateUgS.toFixed(1)} µg/s PM2.5
            </div>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-300 space-y-2">
            <div className="flex items-center gap-2 font-bold">
              <AlertCircle className="h-4 w-4" />
              Analysis Error
            </div>
            <div>{error}</div>
            <button
              onClick={runAnalysis}
              className="mt-2 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold"
            >
              Retry Analysis
            </button>
          </div>
        ) : analysis ? (
          <div className="space-y-4 text-xs">
            {/* Executive Summary */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-slate-200 uppercase tracking-wider text-[11px] font-mono">
                <Cpu className="h-3.5 w-3.5 text-sky-400" />
                Executive Fluid & Trapping Summary
              </div>
              <p className="text-slate-300 leading-relaxed">{analysis.executiveSummary}</p>
            </div>

            {/* Aerodynamic Wake & Trapping Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-amber-300 text-[11px] font-mono">
                  <Zap className="h-3.5 w-3.5" />
                  Opposing Wake Aerodynamic Coupling
                </div>
                <p className="text-slate-400 leading-relaxed">{analysis.aerodynamicWakeCoupling}</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-emerald-300 text-[11px] font-mono">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Section A-A Suction & Trapping Rate
                </div>
                <p className="text-slate-400 leading-relaxed">{analysis.trappingEfficiency}</p>
              </div>
            </div>

            {/* Filter Maintenance Schedule */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-purple-300 text-[11px] font-mono">
                <Layers className="h-3.5 w-3.5" />
                Multilayer Filter Diagnostic & Predictive Maintenance
              </div>
              <p className="text-slate-400 leading-relaxed">{analysis.filterStatusAndMaintenance}</p>
            </div>

            {/* Engineering Optimization Recommendations */}
            <div className="space-y-2">
              <div className="text-[11px] font-mono font-semibold text-slate-300 uppercase tracking-wider">
                Engineering Recommendations
              </div>
              <div className="space-y-2">
                {analysis.optimizationRecommendations?.map((rec, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex items-start gap-2.5 text-slate-300"
                  >
                    <ArrowRight className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{rec}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-4">
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Re-analyze Current Telemetry</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg text-xs font-bold transition-colors"
          >
            Close Advisor
          </button>
        </div>
      </div>
    </div>
  );
};
