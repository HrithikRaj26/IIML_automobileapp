// Nirnay — knapsack baseline (PRD §6.3)
// A greedy knapsack on exposure-per-crew-hour. This is optimisation, not AI —
// calling it AI would be the kind of overclaim §3.2 warns against.
//
// Deliberately ignorant of soft constraints (spare ETA, isolation batching,
// crew familiarity) — that adjustment is Claude's job, not this function's.

import { Job, ExposureResult } from "./types";

export interface KnapsackLine {
  job: Job;
  exposure_protected: number;
  crew_hours: number;
  ratio: number;
}

export interface KnapsackResult {
  selected: KnapsackLine[];
  deferred: KnapsackLine[];
  total_crew_hours_used: number;
  total_exposure_protected: number;
  window_utilisation_pct: number;
}

/**
 * exposureByAsset: asset_id -> ₹ exposure (from the risk/exposure model).
 * windowCrewHours: total crew-hours available (e.g. 6h window x 3 crews = 18).
 */
export function computeKnapsackBaseline(
  jobs: Job[],
  exposureByAsset: Record<string, number>,
  windowCrewHours: number
): KnapsackResult {
  const lines: KnapsackLine[] = jobs.map((job) => {
    const exposure_protected = exposureByAsset[job.asset_id] ?? 0;
    const crew_hours = job.est_hours * job.crew_required;
    return {
      job,
      exposure_protected,
      crew_hours,
      ratio: crew_hours > 0 ? exposure_protected / crew_hours : 0,
    };
  });

  const sorted = [...lines].sort((a, b) => b.ratio - a.ratio);

  const selected: KnapsackLine[] = [];
  const deferred: KnapsackLine[] = [];
  let used = 0;

  for (const line of sorted) {
    if (used + line.crew_hours <= windowCrewHours) {
      selected.push(line);
      used += line.crew_hours;
    } else {
      deferred.push(line);
    }
  }

  const total_exposure_protected = selected.reduce((a, l) => a + l.exposure_protected, 0);

  return {
    selected,
    deferred,
    total_crew_hours_used: used,
    total_exposure_protected,
    window_utilisation_pct: (used / windowCrewHours) * 100,
  };
}
