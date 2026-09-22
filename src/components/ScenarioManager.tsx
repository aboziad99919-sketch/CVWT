import React, { useState, useEffect } from "react";
import {
  Bookmark,
  BookmarkPlus,
  BookmarkCheck,
  Trash2,
  Play,
  RotateCcw,
  Sparkles,
  GitCompare,
  ArrowRight,
  Check,
  Sliders,
  TrendingUp,
  TrendingDown,
  Info,
  X,
  Plus,
  Layers,
  Activity,
  ArrowRightLeft,
  Wind,
  Car,
  Truck,
  ExternalLink,
} from "lucide-react";
import {
  SimulationScenario,
  SimulationScenarioVariables,
  SimulationScenarioMetrics,
} from "../types";
import {
  getSavedScenarios,
  saveScenarioToStorage,
  deleteScenarioFromStorage,
  resetScenariosStorage,
} from "../utils/scenarioStorage";

export interface ScenarioManagerProps {
  // Current Live State for Saving & Comparison
  currentVariables: SimulationScenarioVariables;
  currentMetrics: SimulationScenarioMetrics;
  onLoadScenario: (scenario: SimulationScenario) => void;
}

export const ScenarioManager: React.FC<ScenarioManagerProps> = ({
  currentVariables,
  currentMetrics,
  onLoadScenario,
}) => {
  const [scenarios, setScenarios] = useState<SimulationScenario[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState("");
  const [newScenarioDesc, setNewScenarioDesc] = useState("");
  const [comparisonScenario, setComparisonScenario] = useState<SimulationScenario | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "info" } | null>(null);

  // Load scenarios from storage on mount
  useEffect(() => {
    const list = getSavedScenarios();
    setScenarios(list);
  }, []);

  const triggerToast = (text: string, type: "success" | "info" = "success") => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 3500);
  };

  const handleStartSave = () => {
    const defaultName = `Config (${currentVariables.laneProximityM.toFixed(1)}m / ${currentVariables.vehicleSpacingM}m / ${currentVariables.targetSpeedKmh}kmh)`;
    setNewScenarioName(defaultName);
    setNewScenarioDesc("");
    setIsSaving(true);
  };

  const handleConfirmSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScenarioName.trim()) return;

    const newScenario: SimulationScenario = {
      id: `scen_${Date.now()}`,
      name: newScenarioName.trim(),
      description: newScenarioDesc.trim() || undefined,
      category: "custom",
      createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isBuiltIn: false,
      variables: { ...currentVariables },
      metrics: { ...currentMetrics },
    };

    const updated = saveScenarioToStorage(newScenario);
    setScenarios(updated);
    setActiveScenarioId(newScenario.id);
    setIsSaving(false);
    triggerToast(`Scenario "${newScenario.name}" saved successfully!`);
  };

  const handleLoad = (scen: SimulationScenario) => {
    onLoadScenario(scen);
    setActiveScenarioId(scen.id);
    triggerToast(`Loaded "${scen.name}" into simulation`);
  };

  const handleDelete = (id: string, name: string) => {
    const updated = deleteScenarioFromStorage(id);
    setScenarios(updated);
    if (activeScenarioId === id) setActiveScenarioId(null);
    if (comparisonScenario?.id === id) setComparisonScenario(null);
    triggerToast(`Deleted scenario "${name}"`, "info");
  };

  const handleResetDefaults = () => {
    const defaults = resetScenariosStorage();
    setScenarios(defaults);
    setActiveScenarioId(null);
    setComparisonScenario(null);
    triggerToast("Reset to benchmark scenarios", "info");
  };

  return (
    <div className="space-y-2.5">
      {/* Header bar with Count and Save Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Bookmark className="h-3.5 w-3.5 text-sky-400" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-300 font-bold">
            Saved Scenarios ({scenarios.length})
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleStartSave}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/50 text-sky-300 text-[10px] font-mono font-semibold transition-all hover:scale-102"
            title="Save current simulation settings as a new scenario"
          >
            <BookmarkPlus className="h-3 w-3" />
            <span>Save Current</span>
          </button>
        </div>
      </div>

      {/* Floating Status Notification */}
      {statusMessage && (
        <div className="px-2.5 py-1.5 rounded-lg bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 text-[10px] font-mono flex items-center justify-between shadow-lg animate-in fade-in duration-200">
          <span className="flex items-center gap-1.5">
            <Check className="h-3 w-3 text-emerald-400" />
            {statusMessage.text}
          </span>
          <button onClick={() => setStatusMessage(null)} className="text-emerald-400 hover:text-white">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Save Scenario Modal / Form */}
      {isSaving && (
        <form
          onSubmit={handleConfirmSave}
          className="p-3 rounded-xl bg-slate-950 border border-sky-500/40 space-y-2.5 text-xs shadow-xl animate-in slide-in-from-top-2 duration-150"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-sky-300 flex items-center gap-1 font-mono">
              <BookmarkPlus className="h-3.5 w-3.5 text-sky-400" />
              Save Scenario Snapshot
            </span>
            <button
              type="button"
              onClick={() => setIsSaving(false)}
              className="text-slate-400 hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 mb-1">Scenario Title:</label>
            <input
              type="text"
              value={newScenarioName}
              onChange={(e) => setNewScenarioName(e.target.value)}
              placeholder="e.g. Optimum Proximity Validation"
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:border-sky-400 focus:outline-none font-sans"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 mb-1">Description / Notes (Optional):</label>
            <input
              type="text"
              value={newScenarioDesc}
              onChange={(e) => setNewScenarioDesc(e.target.value)}
              placeholder="e.g. Evaluated for 95 km/h with 20% diesel fleet"
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:border-sky-400 focus:outline-none font-sans"
            />
          </div>

          {/* Current Values Preview */}
          <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800 text-[10px] grid grid-cols-3 gap-1 font-mono text-slate-300">
            <div>
              <span className="text-slate-500">Prox:</span> {currentVariables.laneProximityM.toFixed(1)}m
            </div>
            <div>
              <span className="text-slate-500">Space:</span> {currentVariables.vehicleSpacingM}m
            </div>
            <div>
              <span className="text-slate-500">Speed:</span> {currentVariables.targetSpeedKmh}km/h
            </div>
            <div>
              <span className="text-slate-500">Turbines:</span> {currentVariables.turbineSpacingM}m
            </div>
            <div>
              <span className="text-slate-500">Trucks:</span> {currentVariables.truckRatio}%
            </div>
            <div>
              <span className="text-slate-500">Effic:</span> {currentMetrics.captureEfficiencyIndex}%
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsSaving(false)}
              className="px-2.5 py-1 rounded-md text-slate-400 hover:text-slate-200 text-[11px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1 rounded-md bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-[11px] font-mono shadow"
            >
              Save Scenario
            </button>
          </div>
        </form>
      )}

      {/* Side-by-Side Comparison Drawer */}
      {comparisonScenario && (
        <div className="p-3 rounded-xl bg-slate-950/95 border border-purple-500/50 shadow-2xl space-y-2.5 text-xs animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
            <div className="flex items-center gap-1.5 text-purple-300 font-mono text-[11px] font-bold">
              <GitCompare className="h-3.5 w-3.5 text-purple-400" />
              <span>Comparing Live vs. "{comparisonScenario.name}"</span>
            </div>
            <button
              onClick={() => setComparisonScenario(null)}
              className="p-1 rounded text-slate-400 hover:text-slate-200"
              title="Close Comparison"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Comparison Matrix Table */}
          <div className="space-y-1.5 text-[10px] font-mono">
            {/* Header */}
            <div className="grid grid-cols-4 text-slate-400 font-bold px-1 pb-1 border-b border-slate-800/60">
              <span>Metric / Var</span>
              <span className="text-center text-sky-400">Current Live</span>
              <span className="text-center text-purple-400">Scenario</span>
              <span className="text-right">Delta</span>
            </div>

            {/* Row 1: Lane Proximity */}
            <div className="grid grid-cols-4 items-center px-1 py-1 rounded bg-slate-900/60 border border-slate-800/60">
              <span className="text-slate-300">Lane Proximity</span>
              <span className="text-center text-slate-100 font-bold">
                {currentVariables.laneProximityM.toFixed(1)} m
              </span>
              <span className="text-center text-slate-300">
                {comparisonScenario.variables.laneProximityM.toFixed(1)} m
              </span>
              <span className="text-right">
                {(() => {
                  const diff = currentVariables.laneProximityM - comparisonScenario.variables.laneProximityM;
                  return (
                    <span className={diff < 0 ? "text-emerald-400 font-bold" : diff > 0 ? "text-amber-400 font-bold" : "text-slate-400"}>
                      {diff > 0 ? `+${diff.toFixed(1)}m` : diff < 0 ? `${diff.toFixed(1)}m` : "0.0m"}
                    </span>
                  );
                })()}
              </span>
            </div>

            {/* Row 2: Vehicle Spacing */}
            <div className="grid grid-cols-4 items-center px-1 py-1 rounded bg-slate-900/60 border border-slate-800/60">
              <span className="text-slate-300">Vehicle Spacing</span>
              <span className="text-center text-slate-100 font-bold">
                {currentVariables.vehicleSpacingM} m
              </span>
              <span className="text-center text-slate-300">
                {comparisonScenario.variables.vehicleSpacingM} m
              </span>
              <span className="text-right">
                {(() => {
                  const diff = currentVariables.vehicleSpacingM - comparisonScenario.variables.vehicleSpacingM;
                  return (
                    <span className={diff < 0 ? "text-emerald-400 font-bold" : diff > 0 ? "text-amber-400 font-bold" : "text-slate-400"}>
                      {diff > 0 ? `+${diff}m` : diff < 0 ? `${diff}m` : "0m"}
                    </span>
                  );
                })()}
              </span>
            </div>

            {/* Row 3: Vehicle Speed */}
            <div className="grid grid-cols-4 items-center px-1 py-1 rounded bg-slate-900/60 border border-slate-800/60">
              <span className="text-slate-300">Speed (km/h)</span>
              <span className="text-center text-slate-100 font-bold">
                {currentVariables.targetSpeedKmh}
              </span>
              <span className="text-center text-slate-300">
                {comparisonScenario.variables.targetSpeedKmh}
              </span>
              <span className="text-right">
                {(() => {
                  const diff = currentVariables.targetSpeedKmh - comparisonScenario.variables.targetSpeedKmh;
                  return (
                    <span className={diff > 0 ? "text-sky-400 font-bold" : diff < 0 ? "text-amber-400 font-bold" : "text-slate-400"}>
                      {diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : "0"}
                    </span>
                  );
                })()}
              </span>
            </div>

            {/* Row 4: Capture Efficiency Index */}
            <div className="grid grid-cols-4 items-center px-1 py-1 rounded bg-slate-900/90 border border-slate-700/80">
              <span className="text-slate-200 font-medium">Capture Effic.</span>
              <span className="text-center text-emerald-400 font-bold">
                {currentMetrics.captureEfficiencyIndex}%
              </span>
              <span className="text-center text-purple-300 font-bold">
                {comparisonScenario.metrics.captureEfficiencyIndex}%
              </span>
              <span className="text-right">
                {(() => {
                  const diff = currentMetrics.captureEfficiencyIndex - comparisonScenario.metrics.captureEfficiencyIndex;
                  return (
                    <span className={`font-bold flex items-center justify-end gap-0.5 ${diff > 0 ? "text-emerald-400" : diff < 0 ? "text-red-400" : "text-slate-400"}`}>
                      {diff > 0 ? <TrendingUp className="h-3 w-3" /> : diff < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                      {diff > 0 ? `+${diff}%` : diff < 0 ? `${diff}%` : "0%"}
                    </span>
                  );
                })()}
              </span>
            </div>

            {/* Row 5: Trapping Rate Flux */}
            <div className="grid grid-cols-4 items-center px-1 py-1 rounded bg-slate-900/60 border border-slate-800/60">
              <span className="text-slate-300">Trapping Flux</span>
              <span className="text-center text-slate-100 font-bold">
                {currentMetrics.trappingRateUgS.toFixed(1)} µg/s
              </span>
              <span className="text-center text-slate-300">
                {comparisonScenario.metrics.trappingRateUgS.toFixed(1)} µg/s
              </span>
              <span className="text-right">
                {(() => {
                  const diff = currentMetrics.trappingRateUgS - comparisonScenario.metrics.trappingRateUgS;
                  return (
                    <span className={diff > 0 ? "text-emerald-400 font-bold" : diff < 0 ? "text-red-400 font-bold" : "text-slate-400"}>
                      {diff > 0 ? `+${diff.toFixed(1)}` : diff < 0 ? `${diff.toFixed(1)}` : "0.0"}
                    </span>
                  );
                })()}
              </span>
            </div>
          </div>

          {/* Quick Action to Adopt or Overwrite */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => handleLoad(comparisonScenario)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-200 text-[10px] font-mono font-medium transition-colors"
            >
              <Play className="h-2.5 w-2.5 fill-current" />
              <span>Load "{comparisonScenario.name}"</span>
            </button>
            <button
              type="button"
              onClick={() => setComparisonScenario(null)}
              className="text-[10px] text-slate-400 hover:text-slate-200"
            >
              Close Comparison
            </button>
          </div>
        </div>
      )}

      {/* List of Saved Scenarios */}
      <div className="space-y-1.5 max-h-[310px] overflow-y-auto pr-0.5">
        {scenarios.map((scen) => {
          const isSelected = activeScenarioId === scen.id;
          const isComparing = comparisonScenario?.id === scen.id;

          return (
            <div
              key={scen.id}
              className={`p-2.5 rounded-xl border text-xs transition-all ${
                isSelected
                  ? "bg-sky-950/40 border-sky-500/60 shadow-md shadow-sky-500/10"
                  : isComparing
                  ? "bg-purple-950/40 border-purple-500/60"
                  : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
              }`}
            >
              {/* Title & Category Tags */}
              <div className="flex items-start justify-between gap-1.5 mb-1">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-100 truncate text-[11px]">
                      {scen.name}
                    </span>
                    {scen.isBuiltIn ? (
                      <span className="px-1.5 py-0.2 rounded text-[8px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        STANDARD
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.2 rounded text-[8px] font-mono bg-sky-500/15 text-sky-300 border border-sky-500/30">
                        SAVED
                      </span>
                    )}
                  </div>
                  {scen.description && (
                    <p className="text-[9px] text-slate-400 truncate mt-0.5 leading-tight">
                      {scen.description}
                    </p>
                  )}
                </div>

                {/* Efficiency Badge */}
                <span
                  className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                    scen.metrics.captureEfficiencyIndex >= 80
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                      : scen.metrics.captureEfficiencyIndex >= 50
                      ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                      : "bg-red-500/15 text-red-300 border-red-500/30"
                  }`}
                >
                  {scen.metrics.captureEfficiencyIndex}% Effic.
                </span>
              </div>

              {/* Variable Chips */}
              <div className="flex flex-wrap items-center gap-1.5 my-1.5 text-[9px] font-mono text-slate-300">
                <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">
                  Prox: <strong className="text-amber-300">{scen.variables.laneProximityM.toFixed(1)}m</strong>
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">
                  Space: <strong className="text-sky-300">{scen.variables.vehicleSpacingM}m</strong>
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">
                  Speed: <strong className="text-slate-200">{scen.variables.targetSpeedKmh}km/h</strong>
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">
                  Flux: <strong className="text-emerald-300">{scen.metrics.trappingRateUgS.toFixed(1)}µg/s</strong>
                </span>
              </div>

              {/* Actions: Load, Compare, Delete */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                <span className="text-[9px] font-mono text-slate-500">
                  {scen.createdAt}
                </span>

                <div className="flex items-center gap-1">
                  {/* Compare Button */}
                  <button
                    onClick={() => setComparisonScenario(isComparing ? null : scen)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors ${
                      isComparing
                        ? "bg-purple-500 text-white font-bold"
                        : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                    }`}
                    title="Compare this scenario side-by-side with live settings"
                  >
                    <GitCompare className="h-2.5 w-2.5" />
                    <span>{isComparing ? "Comparing" : "Compare"}</span>
                  </button>

                  {/* Load Button */}
                  <button
                    onClick={() => handleLoad(scen)}
                    className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 text-[10px] font-mono font-bold transition-colors shadow-sm"
                    title="Load these variable values directly into the active simulation"
                  >
                    <Play className="h-2.5 w-2.5 fill-current" />
                    <span>Load</span>
                  </button>

                  {/* Delete button (only for custom user scenarios) */}
                  {!scen.isBuiltIn && (
                    <button
                      onClick={() => handleDelete(scen.id, scen.name)}
                      className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Delete this saved scenario"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reset to standard benchmarks link */}
      <div className="flex items-center justify-between pt-1 px-1 text-[9px] font-mono text-slate-500">
        <span>Persistent across sessions</span>
        <button
          onClick={handleResetDefaults}
          className="hover:text-slate-300 underline flex items-center gap-1"
          title="Restore original benchmark scenarios"
        >
          <RotateCcw className="h-2.5 w-2.5" />
          <span>Restore Benchmarks</span>
        </button>
      </div>
    </div>
  );
};
