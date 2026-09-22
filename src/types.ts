export interface CVWTSpecs {
  totalHeightCm: number; // 184 cm
  rotorDiameterCm: number; // 66 cm
  baseDiameterCm: number; // 90 cm
  supportPillarHeightCm: number; // 60 cm
  bladeCount: number; // 3 helical twisted blades
  suctionHoleDiameterMm: number; // 8 mm
  filterLayers: FilterLayer[];
  ratedWindSpeedMs: number; // 8.5 m/s
  cutInSpeedMs: number; // 1.8 m/s
  sweptAreaM2: number; // 0.818 m2
}

export interface FilterLayer {
  id: string;
  name: string;
  type: "pre_filter" | "hepa_h13" | "activated_carbon" | "electrostatic";
  description: string;
  targetPollutants: string[];
  efficiencyPercent: number;
  currentSaturationPercent: number; // 0 - 100%
  color: string;
}

export type VehicleType = "sedan" | "suv" | "heavy_truck" | "bus" | "ev";

export type PollutantCategory = "exhaust" | "non_exhaust";
export type PollutantType =
  | "combustion_soot"
  | "tailpipe_pm25"
  | "nox_gas"
  | "brake_wear"
  | "tire_wear"
  | "resuspended_dust";

export type EmissionSource =
  | "tailpipe"
  | "brake_caliper"
  | "tire_contact_patch"
  | "underbody_resuspension";

export interface SimulatedVehicle {
  id: string;
  type: VehicleType;
  direction: "eastbound" | "westbound"; // Lane A vs Lane B
  laneIndex: number; // 0 = inner lane closest to median, 1 = outer lane
  x: number; // position along roadway (meters)
  speedKmh: number;
  lengthM: number;
  widthM: number;
  color: string;
  exhaustEmissionRateUgS: number; // combustion tailpipe PM/NOx
  brakeEmissionRateUgS: number; // non-exhaust brake wear
  tireEmissionRateUgS: number; // non-exhaust tire wear microplastics
  dustResuspensionRateUgS: number; // non-exhaust ground resuspension
  exhaustX: number;
  exhaustY: number;
  wheelPositions: Array<{ x: number; y: number }>;
}

export interface PollutantParticle {
  id: number;
  x: number; // meters in roadway coords
  y: number; // meters across roadway
  z: number; // height (meters)
  vx: number;
  vy: number;
  vz: number;
  category: PollutantCategory; // "exhaust" vs "non_exhaust"
  type: PollutantType;
  emissionSource: EmissionSource;
  aerodynamicDiameterUm: number; // 0.1 to 20 micrometers
  densityGPerCm3: number;
  size: number;
  color: string;
  opacity: number;
  life: number; // remaining life frames
  maxLife: number;
  trappedByTurbineId?: string;
  trappedInCoreStage?: "pre_filter" | "hepa_h13" | "carbon" | "electrostatic";
  status: "active" | "trapped_in_core" | "dispersed";
  distanceToCoreCenter?: number;
}

export interface CoreTrappingMetrics {
  totalTrappedGrams: number;
  exhaustTrappedGrams: number;
  nonExhaustTrappedGrams: number;
  brakeWearTrappedGrams: number;
  tireWearTrappedGrams: number;
  resuspendedDustTrappedGrams: number;
  combustionSootTrappedGrams: number;
  overallCoreEfficiencyPercent: number;
  exhaustEfficiencyPercent: number;
  nonExhaustEfficiencyPercent: number;
  coreSuctionInflowM3h: number;
  coreVortexPressureDeltaPa: number;
  circulationVorticityS1: number;
}

export interface CVWTUnitTelemetry {
  id: string;
  medianMeterPosition: number;
  name: string;
  rpm: number;
  powerWatts: number;
  cadrM3h: number; // Clean Air Delivery Rate
  pm25TrappedCumulativeGrams: number;
  pm10TrappedCumulativeGrams: number;
  instantaneousTrappingRateUgS: number;
  filterSaturationPercent: number;
  differentialPressurePa: number; // Section A-A delta P
  status: "nominal" | "warning_filter" | "optimal";
  airVelocityInducedMs: number;
}

export interface TimingBeltRigSpecs {
  lengthCm: number; // 2520 cm = 25.2 m
  widthCm: number; // 740 cm = 7.4 m
  heightCm: number; // 925 / 830 cm
  sprocketPitchMm: number; // 100-130 mm
  trackSpacingCm: number; // 320 cm / 110 cm
  beltSpeedMs: number;
  driveMotorPowerKw: number;
  carrierModelScale: "1:10" | "1:5" | "1:1";
}

export interface MapStation {
  id: string;
  name: string;
  roadName: string;
  lat: number;
  lng: number;
  cvwtUnitsCount: number;
  aqiBaseline: number; // without CVWT
  aqiCurrent: number; // with active CVWT
  pm25BaselineUgM3: number;
  pm25CurrentUgM3: number;
  trafficVolumeVehiclesHr: number;
  avgSpeedKmh: number;
  status: "optimal" | "monitoring" | "active" | "warning_filter";
}

export interface SimulationTelemetryRecord {
  timeSec: number;
  rpm: number;
  powerWatts: number;
  trappingRateUgS: number;
  cumulativeGrams: number;
  cadrM3h: number;
  avgPm25Roadside: number;
  trafficFlowVehMin: number;
}

export interface AIAnalysisResult {
  executiveSummary: string;
  aerodynamicWakeCoupling: string;
  trappingEfficiency: string;
  filterStatusAndMaintenance: string;
  optimizationRecommendations: string[];
}

export interface SimulationScenarioVariables {
  laneProximityM: number;
  vehicleSpacingM: number;
  turbineSpacingM: number;
  targetSpeedKmh: number;
  trafficDensity: number;
  truckRatio: number;
  ambientCrosswind: number;
  isFilterActive: boolean;
  pollutantFilter: "all" | "exhaust" | "non_exhaust";
  showCfdVectors: boolean;
  showStreamlines: boolean;
  showParticleVectors: boolean;
  showPollutantHeatmap?: boolean;
}

export interface SimulationScenarioMetrics {
  captureEfficiencyIndex: number;
  trappingRateUgS: number;
  arrayCadr: number;
  liveRpm: number;
  powerWatts: number;
  inducedWakeVelocityMs: number;
}

export interface SimulationScenario {
  id: string;
  name: string;
  description?: string;
  category?: "optimal" | "urban" | "highway" | "crosswind" | "custom";
  createdAt: string;
  variables: SimulationScenarioVariables;
  metrics: SimulationScenarioMetrics;
  isBuiltIn?: boolean;
}
