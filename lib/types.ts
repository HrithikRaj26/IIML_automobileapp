// Nirnay — shared types (PRD §8 data tables)

export type AssetType =
  | "weld_gun"
  | "robot_axis"
  | "conveyor_drive"
  | "sealer_applicator"
  | "press_feeder"
  | "hanger_gantry"
  | "turntable_clamp";

export interface Asset {
  id: string;
  name: string;
  station: string;
  asset_type: AssetType;
  criticality: "high" | "medium" | "low";
  mttr_minutes: number;
  downstream_buffer_minutes: number;
  mtbf_hours: number;
  last_service: string; // ISO date
  rated_interval: number; // cycles
  failures_last_90_days: number; // asset master field, not derived from telemetry
}

export interface TelemetryPoint {
  asset_id: string;
  ts: string; // ISO timestamp, hourly
  vibration_rms: number;
  motor_current: number;
  temp_c: number;
  cycle_count: number;
  fault_code_count: number;
}

export type SkillType = "weld_maintenance" | "robot_programming" | "mechanical" | "electrical";
export type SpareStatus = "in_stock" | "in_transit" | "unavailable";

export interface Job {
  id: string;
  asset_id: string;
  description: string;
  est_hours: number;
  crew_required: number;
  skill: SkillType;
  spare_status: SpareStatus;
  spare_eta?: string; // e.g. "Tuesday" — only if in_transit
  isolation_point?: string; // jobs sharing this value can be batched
}

export interface RiskBreakdown {
  vibration_slope: number; // 0-1 normalised
  current_drift: number;
  cycles_ratio: number;
  fault_code_rate: number;
  temp_rise: number;
  running_hours_ratio: number;
  failures_90d: number;
  risk_index: number; // weighted sum, 0-1
}

export interface ExposureResult {
  asset_id: string;
  risk_index: number;
  mttr_minutes: number;
  downstream_buffer_minutes: number;
  buffer_shortfall_min: number;
  expected_stop_min: number;
  exposure_rupees: number;
}

export interface AllocationSelected {
  job_id: string;
  asset: string;
  crew_hours: number;
  exposure_protected: number;
  rationale: string;
}

export interface AllocationDeferred {
  job_id: string;
  asset: string;
  reason: string;
  exposure_carried: number;
}

export interface AllocationBatched {
  jobs: string[];
  shared_isolation: string;
  hours_saved: number;
}

export interface AllocationResult {
  selected: AllocationSelected[];
  deferred: AllocationDeferred[];
  batched: AllocationBatched[];
  window_utilisation_pct: number;
  total_exposure_protected: number;
  planner_warning: string;
  confidence: "high" | "medium" | "low";
  source?: "claude" | "knapsack_fallback"; // added client-side, not part of the LLM contract
}

export interface Decision {
  ts: string;
  window_id: string;
  selected: string[];
  deferred: string[];
  planner_overrides: { job_id: string; reason: string }[];
  reason?: string;
}

export interface Feedback {
  job_id: string;
  technician_note: string;
  classified_mode: string;
  prediction_correct: boolean;
}

export interface ClassificationResult {
  failure_mode: string;
  root_cause: string;
  prediction_was_correct: boolean;
  unlogged_symptom: string;
}

export const FAILURE_MODE_TAXONOMY = [
  "bearing_wear",
  "gearbox_fault",
  "electrical_fault",
  "sensor_drift",
  "lubrication_loss",
  "alignment_drift",
  "controller_fault",
  "weld_tip_wear",
  "hose_seal_leak",
  "software_fault",
  "no_fault_found",
  "other",
] as const;
