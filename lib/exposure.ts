// Nirnay — Exposure model (PRD §6.2)
// buffer_shortfall  = max(0, MTTR_minutes − downstream_buffer_minutes)
// expected_stop_min = risk_index × buffer_shortfall
// ₹ exposure        = (expected_stop_min ÷ 60) × cost_per_downtime_hour

import { Asset, ExposureResult } from "./types";

export const COST_PER_DOWNTIME_HOUR = 120000; // ₹1.2L/h, per PRD §6.2 — illustrative, label in deck

export function computeExposure(asset: Asset, riskIndex: number): ExposureResult {
  const buffer_shortfall_min = Math.max(0, asset.mttr_minutes - asset.downstream_buffer_minutes);
  const expected_stop_min = riskIndex * buffer_shortfall_min;
  const exposure_rupees = (expected_stop_min / 60) * COST_PER_DOWNTIME_HOUR;

  return {
    asset_id: asset.id,
    risk_index: riskIndex,
    mttr_minutes: asset.mttr_minutes,
    downstream_buffer_minutes: asset.downstream_buffer_minutes,
    buffer_shortfall_min,
    expected_stop_min,
    exposure_rupees,
  };
}
