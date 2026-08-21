// Nirnay — Risk index (PRD §6.1)
// Weighted feature index. NOT a trained model — weights are reliability-
// engineering judgment, published on screen. Deliberately not fitted to
// synthetic data, per the PRD's own framing.

import { Asset, TelemetryPoint, RiskBreakdown } from "./types";

export const RISK_WEIGHTS = {
  vibration_slope: 0.28,
  current_drift: 0.20,
  cycles_ratio: 0.18,
  fault_code_rate: 0.14,
  temp_rise: 0.10,
  running_hours_ratio: 0.06,
  failures_90d: 0.04,
} as const;

function clip01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function linregSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) * (i - xMean);
  }
  return den === 0 ? 0 : num / den;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Computes the risk index and its 7 feature contributions for one asset,
 * from its trailing 30-day hourly telemetry.
 *
 * failures_last_90_days is asset master data (not derivable from 30-day
 * telemetry alone in this prototype) and lives on the Asset record.
 */
export function computeRisk(asset: Asset, telemetry: TelemetryPoint[]): RiskBreakdown {
  const sorted = [...telemetry].sort((a, b) => a.ts.localeCompare(b.ts));
  const totalHours = sorted.length; // hourly series
  const last7d = sorted.slice(-168);
  const last24h = sorted.slice(-24);
  const last72h = sorted.slice(-72);
  const baselineWindow = sorted.slice(0, 48); // first 2 days as baseline

  const baselineVibration = baselineWindow.reduce((a, p) => a + p.vibration_rms, 0) / baselineWindow.length;
  const baselineCurrent = baselineWindow.reduce((a, p) => a + p.motor_current, 0) / baselineWindow.length;
  const baselineTemp = baselineWindow.reduce((a, p) => a + p.temp_c, 0) / baselineWindow.length;

  // 1. Vibration RMS slope, 7-day, normalised against baseline
  const vibSlopeRaw = linregSlope(last7d.map((p) => p.vibration_rms));
  const vibSlopePctOverWindow = (vibSlopeRaw * last7d.length) / baselineVibration;
  const vibration_slope = clip01(vibSlopePctOverWindow / 0.5); // 50%+ climb over 7d = maxed out

  // 2. Motor current drift vs asset's own baseline
  const currentNow = last24h.reduce((a, p) => a + p.motor_current, 0) / last24h.length;
  const current_drift = clip01((currentNow - baselineCurrent) / baselineCurrent / 0.15); // 15% drift = maxed

  // 3. Cycles since service ÷ rated interval
  // cycle_count is cumulative since last_service (resets to 0 at service date),
  // so the latest reading is the "cycles since service" figure directly.
  const cyclesSinceService = sorted[sorted.length - 1].cycle_count;
  const cycles_ratio = clip01(cyclesSinceService / asset.rated_interval);

  // 4. Fault code rate 72h vs 30-day median (hourly median)
  const faultRate72h = last72h.reduce((a, p) => a + p.fault_code_count, 0) / last72h.length;
  const hourlyFaultSeries = sorted.map((p) => p.fault_code_count);
  const medianFault = Math.max(median(hourlyFaultSeries), 0.001);
  const fault_code_rate = clip01((faultRate72h / medianFault - 1) / 4); // 5x median = maxed

  // 5. Temperature rise vs baseline
  const tempNow = last24h.reduce((a, p) => a + p.temp_c, 0) / last24h.length;
  const temp_rise = clip01((tempNow - baselineTemp) / 12); // 12°C rise = maxed

  // 6. Running hours ÷ MTBF
  const running_hours_ratio = clip01(totalHours / asset.mtbf_hours);

  // 7. Failures in last 90 days
  const failures_90d = clip01(asset.failures_last_90_days / 5);

  const risk_index =
    RISK_WEIGHTS.vibration_slope * vibration_slope +
    RISK_WEIGHTS.current_drift * current_drift +
    RISK_WEIGHTS.cycles_ratio * cycles_ratio +
    RISK_WEIGHTS.fault_code_rate * fault_code_rate +
    RISK_WEIGHTS.temp_rise * temp_rise +
    RISK_WEIGHTS.running_hours_ratio * running_hours_ratio +
    RISK_WEIGHTS.failures_90d * failures_90d;

  return {
    vibration_slope,
    current_drift,
    cycles_ratio,
    fault_code_rate,
    temp_rise,
    running_hours_ratio,
    failures_90d,
    risk_index: clip01(risk_index),
  };
}
