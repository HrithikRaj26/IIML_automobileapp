// Nirnay — seed data generator (PRD Appendix C)
// Fixed seed, always. Buffer/MTTR set by hand, not randomly — these two
// fields produce the exposure inversion the whole demo rests on.
//
// Run: npx tsx scripts/generate-seed.ts

import fs from "fs";
import path from "path";
import { Asset, TelemetryPoint, Job, AssetType } from "../lib/types";
import { computeRisk } from "../lib/scoring";
import { computeExposure } from "../lib/exposure";

// ---- deterministic PRNG (mulberry32), fixed seed ----
const SEED = 20260821;
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);
function gaussian(mean: number, stdev: number): number {
  // Box-Muller, driven by the seeded rng
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z0 * stdev;
}

const HOURS = 30 * 24; // 720 hourly points
const START = new Date("2026-07-23T00:00:00Z"); // 30 days ending "today" of the demo

interface AssetSpec {
  id: string;
  name: string;
  station: string;
  asset_type: AssetType;
  criticality: "high" | "medium" | "low";
  mttr_minutes: number;
  downstream_buffer_minutes: number;
  mtbf_hours: number;
  rated_interval: number;
  cycles_per_hour: number;
  failures_last_90_days: number;
  // telemetry behaviour
  ramp: null | { startDay: number; vibPct: number; currentPct: number; tempC: number };
}

// Type baselines: [vibration_rms mm/s, motor_current A, temp_c]
const TYPE_BASELINE: Record<AssetType, [number, number, number]> = {
  weld_gun: [2.2, 38, 42],
  robot_axis: [3.0, 55, 48],
  conveyor_drive: [1.8, 42, 40],
  sealer_applicator: [1.5, 25, 35],
  press_feeder: [2.6, 60, 45],
  hanger_gantry: [1.7, 30, 38],
  turntable_clamp: [2.0, 33, 40],
};

// 14 assets. Buffer/MTTR set deliberately (Appendix C) to produce the
// inversion: WG-07 and RB-03 match the PRD §6.2 worked example exactly.
const ASSET_SPECS: AssetSpec[] = [
  {
    id: "WG-07", name: "Weld Gun 07", station: "Framing Station A", asset_type: "weld_gun",
    criticality: "high", mttr_minutes: 45, downstream_buffer_minutes: 40,
    mtbf_hours: 2100, rated_interval: 600000, cycles_per_hour: 340, failures_last_90_days: 2,
    ramp: { startDay: 13, vibPct: 0.95, currentPct: 0.16, tempC: 14 }, // hard ramp -> target risk ~0.81
  },
  {
    id: "RB-03", name: "Robot Axis 03", station: "Underbody Cell B", asset_type: "robot_axis",
    criticality: "high", mttr_minutes: 180, downstream_buffer_minutes: 25,
    mtbf_hours: 3200, rated_interval: 900000, cycles_per_hour: 260, failures_last_90_days: 1,
    ramp: { startDay: 18, vibPct: 0.44, currentPct: 0.09, tempC: 7 }, // moderate ramp -> target risk ~0.58
  },
  {
    id: "WG-02", name: "Weld Gun 02", station: "Framing Station A", asset_type: "weld_gun",
    criticality: "medium", mttr_minutes: 50, downstream_buffer_minutes: 60,
    mtbf_hours: 2200, rated_interval: 600000, cycles_per_hour: 310, failures_last_90_days: 0,
    ramp: null,
  },
  {
    id: "WG-11", name: "Weld Gun 11", station: "Framing Station C", asset_type: "weld_gun",
    criticality: "low", mttr_minutes: 40, downstream_buffer_minutes: 90,
    mtbf_hours: 2400, rated_interval: 600000, cycles_per_hour: 300, failures_last_90_days: 0,
    ramp: null,
  },
  {
    id: "RB-01", name: "Robot Axis 01", station: "Underbody Cell A", asset_type: "robot_axis",
    criticality: "medium", mttr_minutes: 150, downstream_buffer_minutes: 20,
    mtbf_hours: 3400, rated_interval: 900000, cycles_per_hour: 250, failures_last_90_days: 0,
    ramp: null,
  },
  {
    id: "RB-05", name: "Robot Axis 05", station: "Underbody Cell B", asset_type: "robot_axis",
    criticality: "medium", mttr_minutes: 165, downstream_buffer_minutes: 45,
    mtbf_hours: 3100, rated_interval: 900000, cycles_per_hour: 265, failures_last_90_days: 1,
    ramp: { startDay: 20, vibPct: 0.41, currentPct: 0.10, tempC: 7 },
  },
  {
    id: "CV-04", name: "Conveyor Drive 04", station: "Transfer Line", asset_type: "conveyor_drive",
    criticality: "high", mttr_minutes: 90, downstream_buffer_minutes: 85,
    mtbf_hours: 4000, rated_interval: 1200000, cycles_per_hour: 400, failures_last_90_days: 2,
    ramp: { startDay: 14, vibPct: 0.68, currentPct: 0.14, tempC: 11 }, // second hard ramp -> >0.75
  },
  {
    id: "CV-09", name: "Conveyor Drive 09", station: "Transfer Line", asset_type: "conveyor_drive",
    criticality: "low", mttr_minutes: 60, downstream_buffer_minutes: 120,
    mtbf_hours: 4200, rated_interval: 1200000, cycles_per_hour: 380, failures_last_90_days: 0,
    ramp: null,
  },
  {
    id: "SL-02", name: "Sealer Applicator 02", station: "Sealer Booth", asset_type: "sealer_applicator",
    criticality: "low", mttr_minutes: 35, downstream_buffer_minutes: 50,
    mtbf_hours: 2600, rated_interval: 500000, cycles_per_hour: 220, failures_last_90_days: 0,
    ramp: null,
  },
  {
    id: "SL-06", name: "Sealer Applicator 06", station: "Sealer Booth", asset_type: "sealer_applicator",
    criticality: "medium", mttr_minutes: 40, downstream_buffer_minutes: 37,
    mtbf_hours: 2500, rated_interval: 500000, cycles_per_hour: 230, failures_last_90_days: 1,
    ramp: { startDay: 15, vibPct: 0.85, currentPct: 0.15, tempC: 12 }, // high risk, tiny shortfall -> low exposure despite risk
  },
  {
    id: "PR-03", name: "Press Feeder 03", station: "Press Line", asset_type: "press_feeder",
    criticality: "medium", mttr_minutes: 120, downstream_buffer_minutes: 35,
    mtbf_hours: 3600, rated_interval: 800000, cycles_per_hour: 300, failures_last_90_days: 1,
    ramp: null, // flat: moderate risk, but the big shortfall (85min) still drives high exposure
  },
  {
    id: "PR-08", name: "Press Feeder 08", station: "Press Line", asset_type: "press_feeder",
    criticality: "low", mttr_minutes: 70, downstream_buffer_minutes: 80,
    mtbf_hours: 3700, rated_interval: 800000, cycles_per_hour: 295, failures_last_90_days: 0,
    ramp: null,
  },
  {
    id: "HG-01", name: "Hanger Gantry 01", station: "Paint Transfer", asset_type: "hanger_gantry",
    criticality: "low", mttr_minutes: 55, downstream_buffer_minutes: 70,
    mtbf_hours: 2900, rated_interval: 550000, cycles_per_hour: 180, failures_last_90_days: 0,
    ramp: null,
  },
  {
    id: "TC-05", name: "Turntable Clamp 05", station: "Respot Station", asset_type: "turntable_clamp",
    criticality: "medium", mttr_minutes: 95, downstream_buffer_minutes: 15,
    mtbf_hours: 3300, rated_interval: 650000, cycles_per_hour: 210, failures_last_90_days: 0,
    ramp: null,
  },
];

function isoAt(hourIndex: number): string {
  const d = new Date(START.getTime() + hourIndex * 3600 * 1000);
  return d.toISOString();
}

function generateTelemetryForAsset(spec: AssetSpec): TelemetryPoint[] {
  const [baseVib, baseCurrent, baseTemp] = TYPE_BASELINE[spec.asset_type];
  const points: TelemetryPoint[] = [];
  let cumulativeCycles = 0;

  for (let h = 0; h < HOURS; h++) {
    const day = h / 24;
    let vib = gaussian(baseVib, baseVib * 0.03);
    let current = gaussian(baseCurrent, baseCurrent * 0.03);
    let temp = gaussian(baseTemp, baseTemp * 0.03);
    let faultCodes = rng() < 0.04 ? 1 : 0; // low background nuisance rate

    if (spec.ramp && day >= spec.ramp.startDay) {
      const rampProgress = (day - spec.ramp.startDay) / (30 - spec.ramp.startDay); // 0 -> 1
      const linear = Math.max(0, Math.min(1, rampProgress));
      // Accelerating (quadratic) degradation curve — realistic, and concentrates
      // the rise in the trailing week where the 7-day slope feature looks.
      const accel = linear * linear;
      vib = vib * (1 + spec.ramp.vibPct * accel);
      current = current * (1 + spec.ramp.currentPct * accel);
      temp = temp + spec.ramp.tempC * accel;

      // fault code rate climbs through the final 96 hours (day 26-30)
      if (day >= 26) {
        const finalStretch = (day - 26) / 4;
        faultCodes = rng() < 0.15 + 0.5 * finalStretch ? 1 : faultCodes;
      }
    }

    cumulativeCycles += spec.cycles_per_hour;

    points.push({
      asset_id: spec.id,
      ts: isoAt(h),
      vibration_rms: Number(vib.toFixed(3)),
      motor_current: Number(current.toFixed(2)),
      temp_c: Number(temp.toFixed(1)),
      cycle_count: cumulativeCycles,
      fault_code_count: faultCodes,
    });
  }
  return points;
}

function lastServiceDateFor(spec: AssetSpec): string {
  // last_service is far enough back that rated_interval isn't trivially maxed
  const daysBack = Math.round(spec.rated_interval / spec.cycles_per_hour / 24) - 5;
  const d = new Date(START.getTime() - daysBack * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

const assets: Asset[] = ASSET_SPECS.map((spec) => ({
  id: spec.id,
  name: spec.name,
  station: spec.station,
  asset_type: spec.asset_type,
  criticality: spec.criticality,
  mttr_minutes: spec.mttr_minutes,
  downstream_buffer_minutes: spec.downstream_buffer_minutes,
  mtbf_hours: spec.mtbf_hours,
  last_service: lastServiceDateFor(spec),
  rated_interval: spec.rated_interval,
  failures_last_90_days: spec.failures_last_90_days,
}));

const telemetry: TelemetryPoint[] = ASSET_SPECS.flatMap(generateTelemetryForAsset);

// ---- Jobs list (PRD §6.3, Appendix C) ----
// 12 candidates, ~40 crew-hours total against an 18 crew-hour window (6h x 3 crews).
// Two share an isolation point. One is blocked on a spare arriving Tuesday.
const jobs: Job[] = [
  { id: "J-01", asset_id: "WG-07", description: "Weld tip dress + gun alignment check", est_hours: 2, crew_required: 1, skill: "weld_maintenance", spare_status: "in_stock", isolation_point: "ISO-A" },
  { id: "J-02", asset_id: "RB-03", description: "Gearbox bearing replacement", est_hours: 5, crew_required: 2, skill: "robot_programming", spare_status: "in_stock" },
  { id: "J-03", asset_id: "CV-04", description: "Drive motor bearing + belt tension", est_hours: 4, crew_required: 1, skill: "mechanical", spare_status: "in_stock" },
  { id: "J-04", asset_id: "RB-05", description: "Axis 3 servo inspection", est_hours: 3, crew_required: 1, skill: "robot_programming", spare_status: "in_transit", spare_eta: "Tuesday" },
  { id: "J-05", asset_id: "PR-03", description: "Feeder clutch and sensor recalibration", est_hours: 3, crew_required: 1, skill: "mechanical", spare_status: "in_stock" },
  { id: "J-06", asset_id: "SL-06", description: "Applicator nozzle + seal replacement", est_hours: 2, crew_required: 1, skill: "mechanical", spare_status: "in_stock", isolation_point: "ISO-A" },
  { id: "J-07", asset_id: "WG-02", description: "Routine tip dress", est_hours: 1.5, crew_required: 1, skill: "weld_maintenance", spare_status: "in_stock" },
  { id: "J-08", asset_id: "WG-11", description: "Cable and hose inspection", est_hours: 2, crew_required: 1, skill: "weld_maintenance", spare_status: "in_stock" },
  { id: "J-09", asset_id: "RB-01", description: "Lubrication service, full axis set", est_hours: 3, crew_required: 1, skill: "robot_programming", spare_status: "in_stock" },
  { id: "J-10", asset_id: "CV-09", description: "Roller replacement, section 4", est_hours: 4, crew_required: 1, skill: "mechanical", spare_status: "in_stock" },
  { id: "J-11", asset_id: "PR-08", description: "Feeder alignment check", est_hours: 2.5, crew_required: 1, skill: "mechanical", spare_status: "in_stock" },
  { id: "J-12", asset_id: "TC-05", description: "Clamp actuator seal replacement", est_hours: 3, crew_required: 1, skill: "electrical", spare_status: "in_stock" },
];

// ---- write files ----
const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, "assets.json"), JSON.stringify(assets, null, 2));
fs.writeFileSync(path.join(dataDir, "telemetry.json"), JSON.stringify(telemetry, null, 2));
fs.writeFileSync(path.join(dataDir, "jobs.json"), JSON.stringify(jobs, null, 2));

// ---- verification against PRD §6.2 worked example ----
console.log("\n=== Verification against PRD §6.2 ===\n");
for (const id of ["WG-07", "RB-03"]) {
  const asset = assets.find((a) => a.id === id)!;
  const tel = telemetry.filter((t) => t.asset_id === id);
  const risk = computeRisk(asset, tel);
  const exp = computeExposure(asset, risk.risk_index);
  console.log(
    `${id}: risk=${risk.risk_index.toFixed(2)}  MTTR=${asset.mttr_minutes}  buffer=${asset.downstream_buffer_minutes}  ` +
      `shortfall=${exp.buffer_shortfall_min}min  expected_stop=${exp.expected_stop_min.toFixed(1)}min  ` +
      `exposure=₹${Math.round(exp.exposure_rupees).toLocaleString("en-IN")}`
  );
}

console.log("\n=== Full ranking check (risk vs exposure) ===\n");
const results = assets.map((a) => {
  const tel = telemetry.filter((t) => t.asset_id === a.id);
  const risk = computeRisk(a, tel);
  const exp = computeExposure(a, risk.risk_index);
  return { id: a.id, risk: risk.risk_index, exposure: exp.exposure_rupees };
});
const byRisk = [...results].sort((a, b) => b.risk - a.risk);
const byExposure = [...results].sort((a, b) => b.exposure - a.exposure);
console.log("Top 5 by risk:    ", byRisk.slice(0, 5).map((r) => r.id).join(", "));
console.log("Top 5 by exposure:", byExposure.slice(0, 5).map((r) => r.id).join(", "));
const top5RiskIds = new Set(byRisk.slice(0, 5).map((r) => r.id));
const top5ExpIds = new Set(byExposure.slice(0, 5).map((r) => r.id));
const outside = [...top5RiskIds].filter((id) => !top5ExpIds.has(id));
console.log(`Top-5-by-risk assets falling outside top-5-by-exposure: ${outside.length} (${outside.join(", ")})`);

console.log("\nSeed data written to /data — assets.json, telemetry.json, jobs.json\n");
