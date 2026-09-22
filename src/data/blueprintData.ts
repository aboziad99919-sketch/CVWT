import { CVWTSpecs, TimingBeltRigSpecs, MapStation } from "../types";

export const CVWT_DEFAULT_SPECS: CVWTSpecs = {
  totalHeightCm: 184, // From Ahmed Abouelezz blueprint DWG 9/17/2026
  rotorDiameterCm: 66,
  baseDiameterCm: 90,
  supportPillarHeightCm: 60,
  bladeCount: 3,
  suctionHoleDiameterMm: 8,
  ratedWindSpeedMs: 8.5,
  cutInSpeedMs: 1.8,
  sweptAreaM2: 0.818, // 1.24m rotor height * 0.66m diameter
  filterLayers: [
    {
      id: "pre-filter",
      name: "Coarse Particle Pre-Filter Mesh",
      type: "pre_filter",
      description: "Stainless steel 50µm mesh arresting brake dust, tire rubber fragments, and gravel debris before inner stages.",
      targetPollutants: ["Coarse PM10", "Road Dust", "Tire microplastics"],
      efficiencyPercent: 92,
      currentSaturationPercent: 24,
      color: "#94a3b8",
    },
    {
      id: "hepa-h13",
      name: "True HEPA H13 Pleated Core",
      type: "hepa_h13",
      description: "Dense microglass matrix trapping ultrafine combustion particles down to 0.3 micrometers with 99.97% efficiency.",
      targetPollutants: ["PM2.5", "Soot Nanoparticles", "Aerosolized Hydrocarbons"],
      efficiencyPercent: 99.8,
      currentSaturationPercent: 38,
      color: "#38bdf8",
    },
    {
      id: "activated-carbon",
      name: "Granular Activated Carbon + Zeolite Bed",
      type: "activated_carbon",
      description: "High surface-area sorbent bed adsorbing toxic exhaust gases (NO2, SO2, benzene, and unburned fuel VOCs).",
      targetPollutants: ["NOx gases", "Volatile Organic Compounds (VOCs)", "Ozone (O3)"],
      efficiencyPercent: 88,
      currentSaturationPercent: 29,
      color: "#334155",
    },
    {
      id: "electrostatic",
      name: "Electrostatic Ionizer & Dielectric Collector",
      type: "electrostatic",
      description: "Charged corona wires charging airborne submicron particulates for accelerated precipitation on grounded collector plates.",
      targetPollutants: ["Sub-micron PM0.1", "Black Carbon", "Metal Oxide Fumes"],
      efficiencyPercent: 96,
      currentSaturationPercent: 19,
      color: "#10b981",
    },
  ],
};

export const TIMING_BELT_RIG_DEFAULT: TimingBeltRigSpecs = {
  lengthCm: 2520, // 25.2 m from Loai Abouelezz blueprint DWG 9/22/2026
  widthCm: 740, // 7.4 m
  heightCm: 925, // 9.25 m
  sprocketPitchMm: 130,
  trackSpacingCm: 320,
  beltSpeedMs: 16.6, // ~60 km/h equivalent scale velocity
  driveMotorPowerKw: 15.0,
  carrierModelScale: "1:5",
};

export const DEFAULT_MAP_STATIONS: MapStation[] = [
  {
    id: "st-ring-exp",
    name: "Ring Road Sector 4 Highway Median",
    roadName: "Metropolitan Ring Expressway (Km 14.8)",
    lat: 30.0444,
    lng: 31.2357,
    cvwtUnitsCount: 48,
    aqiBaseline: 178, // Unhealthy
    aqiCurrent: 68, // Moderate / Good
    pm25BaselineUgM3: 68.4,
    pm25CurrentUgM3: 18.2,
    trafficVolumeVehiclesHr: 4600,
    avgSpeedKmh: 92,
    status: "optimal",
  },
  {
    id: "st-arterial-south",
    name: "Southbound Boulevard Arterial",
    roadName: "Al-Amal Dual Carriageway Corridor",
    lat: 29.9822,
    lng: 31.2851,
    cvwtUnitsCount: 32,
    aqiBaseline: 162,
    aqiCurrent: 59,
    pm25BaselineUgM3: 61.2,
    pm25CurrentUgM3: 15.8,
    trafficVolumeVehiclesHr: 3400,
    avgSpeedKmh: 75,
    status: "optimal",
  },
  {
    id: "st-freeway-junction",
    name: "Interstate Freeway Interchange",
    roadName: "Western Desert Access Tollway",
    lat: 30.0891,
    lng: 31.1824,
    cvwtUnitsCount: 64,
    aqiBaseline: 195,
    aqiCurrent: 74,
    pm25BaselineUgM3: 79.5,
    pm25CurrentUgM3: 22.1,
    trafficVolumeVehiclesHr: 5800,
    avgSpeedKmh: 105,
    status: "active",
  },
  {
    id: "st-harbor-approach",
    name: "Heavy Freight Transit Corridor",
    roadName: "Port Logistics Bypass (Heavy Diesel Lane)",
    lat: 30.0125,
    lng: 31.3219,
    cvwtUnitsCount: 40,
    aqiBaseline: 220, // Very Unhealthy
    aqiCurrent: 82, // Moderate
    pm25BaselineUgM3: 94.6,
    pm25CurrentUgM3: 26.5,
    trafficVolumeVehiclesHr: 4100,
    avgSpeedKmh: 70,
    status: "warning_filter",
  },
];
