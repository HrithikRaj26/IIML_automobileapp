// Nirnay — data loading and aggregation (server-side only)

import fs from "fs";
import path from "path";
import { Asset, TelemetryPoint, Job, RiskBreakdown, ExposureResult } from "./types";
import { computeRisk } from "./scoring";
import { computeExposure } from "./exposure";

const DATA_DIR = path.join(process.cwd(), "data");

let _assets: Asset[] | null = null;
let _telemetry: TelemetryPoint[] | null = null;
let _jobs: Job[] | null = null;

export function loadAssets(): Asset[] {
  if (!_assets) {
    _assets = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "assets.json"), "utf-8"));
  }
  return _assets!;
}

export function loadTelemetry(): TelemetryPoint[] {
  if (!_telemetry) {
    _telemetry = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "telemetry.json"), "utf-8"));
  }
  return _telemetry!;
}

export function loadJobs(): Job[] {
  if (!_jobs) {
    _jobs = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "jobs.json"), "utf-8"));
  }
  return _jobs!;
}

export function telemetryFor(assetId: string): TelemetryPoint[] {
  return loadTelemetry().filter((t) => t.asset_id === assetId);
}

export interface AssetBoardRow {
  asset: Asset;
  risk: RiskBreakdown;
  exposure: ExposureResult;
}

export function getBoardData(): AssetBoardRow[] {
  const assets = loadAssets();
  return assets.map((asset) => {
    const tel = telemetryFor(asset.id);
    const risk = computeRisk(asset, tel);
    const exposure = computeExposure(asset, risk.risk_index);
    return { asset, risk, exposure };
  });
}

export interface DailyPoint {
  day: number; // 1-30
  date: string;
  vibration_rms: number;
  motor_current: number;
  temp_c: number;
  fault_code_count: number;
}

/** Aggregates one asset's full 30-day hourly telemetry into daily points for charting. */
export function dailySeriesFor(assetId: string): DailyPoint[] {
  const points = telemetryFor(assetId).sort((a, b) => a.ts.localeCompare(b.ts));
  const days: DailyPoint[] = [];
  for (let d = 0; d < 30; d++) {
    const dayPoints = points.slice(d * 24, d * 24 + 24);
    if (dayPoints.length === 0) continue;
    const avg = (key: "vibration_rms" | "motor_current" | "temp_c") =>
      dayPoints.reduce((a, p) => a + p[key], 0) / dayPoints.length;
    const faultSum = dayPoints.reduce((a, p) => a + p.fault_code_count, 0);
    days.push({
      day: d + 1,
      date: dayPoints[0].ts.slice(0, 10),
      vibration_rms: Number(avg("vibration_rms").toFixed(3)),
      motor_current: Number(avg("motor_current").toFixed(2)),
      temp_c: Number(avg("temp_c").toFixed(1)),
      fault_code_count: faultSum,
    });
  }
  return days;
}
