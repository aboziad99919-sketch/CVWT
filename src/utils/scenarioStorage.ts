import { SimulationScenario } from "../types";

export const SCENARIO_STORAGE_KEY = "cvwt_simulation_scenarios_v1";

export const DEFAULT_BENCHMARK_SCENARIOS: SimulationScenario[] = [
  {
    id: "scen_abouelezz_optimum",
    name: "Abouelezz Optimal Trapping",
    description: "Peak aerodynamic boundary layer coupling (0.9m proximity, 20m headway, 100 km/h).",
    category: "optimal",
    createdAt: "Benchmark Standard",
    isBuiltIn: true,
    variables: {
      laneProximityM: 0.9,
      vehicleSpacingM: 20,
      turbineSpacingM: 14,
      targetSpeedKmh: 100,
      trafficDensity: 42,
      truckRatio: 18,
      ambientCrosswind: 1.0,
      isFilterActive: true,
      pollutantFilter: "all",
      showCfdVectors: true,
      showStreamlines: true,
      showParticleVectors: true,
    },
    metrics: {
      captureEfficiencyIndex: 94,
      trappingRateUgS: 47.8,
      arrayCadr: 385,
      liveRpm: 198,
      powerWatts: 142,
      inducedWakeVelocityMs: 12.0,
    },
  },
  {
    id: "scen_rush_hour_platoon",
    name: "Rush Hour Tight Platoon",
    description: "High vehicle density with continuous overlapping wakes and elevated diesel emissions.",
    category: "urban",
    createdAt: "Benchmark Standard",
    isBuiltIn: true,
    variables: {
      laneProximityM: 1.0,
      vehicleSpacingM: 12,
      turbineSpacingM: 12,
      targetSpeedKmh: 75,
      trafficDensity: 68,
      truckRatio: 32,
      ambientCrosswind: 0.5,
      isFilterActive: true,
      pollutantFilter: "all",
      showCfdVectors: true,
      showStreamlines: false,
      showParticleVectors: true,
    },
    metrics: {
      captureEfficiencyIndex: 88,
      trappingRateUgS: 54.2,
      arrayCadr: 340,
      liveRpm: 172,
      powerWatts: 110,
      inducedWakeVelocityMs: 10.4,
    },
  },
  {
    id: "scen_open_highway_freeflow",
    name: "Free-Flow Interstate",
    description: "High vehicle speeds (115 km/h) with wider headway spacing and standard shoulder gap.",
    category: "highway",
    createdAt: "Benchmark Standard",
    isBuiltIn: true,
    variables: {
      laneProximityM: 1.4,
      vehicleSpacingM: 32,
      turbineSpacingM: 16,
      targetSpeedKmh: 115,
      trafficDensity: 30,
      truckRatio: 12,
      ambientCrosswind: 1.5,
      isFilterActive: true,
      pollutantFilter: "exhaust",
      showCfdVectors: true,
      showStreamlines: true,
      showParticleVectors: true,
    },
    metrics: {
      captureEfficiencyIndex: 72,
      trappingRateUgS: 36.5,
      arrayCadr: 395,
      liveRpm: 204,
      powerWatts: 155,
      inducedWakeVelocityMs: 12.4,
    },
  },
  {
    id: "scen_wide_shoulder_bypass",
    name: "Wide Shoulder (High Bypass)",
    description: "Excessive lateral distance (2.6m) demonstrating severe wake dispersion and capture degradation.",
    category: "custom",
    createdAt: "Benchmark Standard",
    isBuiltIn: true,
    variables: {
      laneProximityM: 2.6,
      vehicleSpacingM: 45,
      turbineSpacingM: 20,
      targetSpeedKmh: 80,
      trafficDensity: 22,
      truckRatio: 10,
      ambientCrosswind: 2.5,
      isFilterActive: true,
      pollutantFilter: "all",
      showCfdVectors: false,
      showStreamlines: true,
      showParticleVectors: true,
    },
    metrics: {
      captureEfficiencyIndex: 32,
      trappingRateUgS: 14.1,
      arrayCadr: 195,
      liveRpm: 98,
      powerWatts: 28,
      inducedWakeVelocityMs: 5.9,
    },
  },
];

export function getSavedScenarios(): SimulationScenario[] {
  try {
    const raw = localStorage.getItem(SCENARIO_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(DEFAULT_BENCHMARK_SCENARIOS));
      return DEFAULT_BENCHMARK_SCENARIOS;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_BENCHMARK_SCENARIOS;
    }
    return parsed;
  } catch (err) {
    console.warn("Could not load saved simulation scenarios from localStorage:", err);
    return DEFAULT_BENCHMARK_SCENARIOS;
  }
}

export function saveScenarioToStorage(scenario: SimulationScenario): SimulationScenario[] {
  const current = getSavedScenarios();
  const existingIndex = current.findIndex((s) => s.id === scenario.id);
  let updated: SimulationScenario[];
  if (existingIndex >= 0) {
    updated = [...current];
    updated[existingIndex] = scenario;
  } else {
    updated = [scenario, ...current];
  }

  try {
    localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error("Failed to save scenario to localStorage:", err);
  }
  return updated;
}

export function deleteScenarioFromStorage(id: string): SimulationScenario[] {
  const current = getSavedScenarios();
  const filtered = current.filter((s) => s.id !== id);
  try {
    localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error("Failed to delete scenario from localStorage:", err);
  }
  return filtered;
}

export function resetScenariosStorage(): SimulationScenario[] {
  try {
    localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(DEFAULT_BENCHMARK_SCENARIOS));
  } catch (err) {
    console.error("Failed to reset scenarios in localStorage:", err);
  }
  return DEFAULT_BENCHMARK_SCENARIOS;
}
