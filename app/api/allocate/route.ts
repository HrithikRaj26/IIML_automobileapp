// Nirnay — /api/allocate (PRD §6.3)
//
// Two-stage: a TypeScript knapsack computes an exposure-per-crew-hour
// baseline (optimisation, not AI). Gemini then adjusts that baseline for
// soft constraints a solver can't encode — a spare landing Tuesday, two jobs
// sharing an isolation point, a crew that's seen this gearbox before — and
// returns both selections and rejections with reasons a planner will act on.

import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { loadAssets, loadJobs, getBoardData } from "@/lib/data";
import { computeKnapsackBaseline } from "@/lib/knapsack";
import { getGeminiClient, GEMINI_MODEL, stripJsonFences, repairCommaGroupedNumbers } from "@/lib/gemini";
import type { AllocationResult } from "@/lib/types";

export const maxDuration = 30; // cap generation time — cold start + long output = timeout (PRD §15)

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    selected: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          job_id: { type: Type.STRING },
          asset: { type: Type.STRING },
          crew_hours: { type: Type.NUMBER },
          exposure_protected: { type: Type.NUMBER },
          rationale: { type: Type.STRING },
        },
        required: ["job_id", "asset", "crew_hours", "exposure_protected", "rationale"],
      },
    },
    deferred: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          job_id: { type: Type.STRING },
          asset: { type: Type.STRING },
          reason: { type: Type.STRING },
          exposure_carried: { type: Type.NUMBER },
        },
        required: ["job_id", "asset", "reason", "exposure_carried"],
      },
    },
    batched: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          jobs: { type: Type.ARRAY, items: { type: Type.STRING } },
          shared_isolation: { type: Type.STRING },
          hours_saved: { type: Type.NUMBER },
        },
        required: ["jobs", "shared_isolation", "hours_saved"],
      },
    },
    window_utilisation_pct: { type: Type.NUMBER },
    total_exposure_protected: { type: Type.NUMBER },
    planner_warning: { type: Type.STRING },
    confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
  },
  required: [
    "selected",
    "deferred",
    "batched",
    "window_utilisation_pct",
    "total_exposure_protected",
    "planner_warning",
    "confidence",
  ],
};

function knapsackOnlyFallback(
  baseline: ReturnType<typeof computeKnapsackBaseline>,
  windowCrewHours: number,
  debugError?: string
): AllocationResult & { debug_error?: string } {
  return {
    selected: baseline.selected.map((l) => ({
      job_id: l.job.id,
      asset: l.job.asset_id,
      crew_hours: l.crew_hours,
      exposure_protected: l.exposure_protected,
      rationale: "Optimiser baseline — advisory unavailable, soft constraints not applied.",
    })),
    deferred: baseline.deferred.map((l) => ({
      job_id: l.job.id,
      asset: l.job.asset_id,
      reason: "Did not fit remaining crew-hours in the optimiser baseline.",
      exposure_carried: l.exposure_protected,
    })),
    batched: [],
    window_utilisation_pct: baseline.window_utilisation_pct,
    total_exposure_protected: baseline.total_exposure_protected,
    planner_warning: "",
    confidence: "low",
    source: "knapsack_fallback",
    ...(debugError ? { debug_error: debugError } : {}),
  };
}

async function runAllocation(windowHours: number, crewCount: number, verbose: boolean) {
  const windowCrewHours = windowHours * crewCount;
  const jobs = loadJobs();
  const board = getBoardData();
  const exposureByAsset: Record<string, number> = {};
  for (const row of board) {
    exposureByAsset[row.asset.id] = row.exposure.exposure_rupees;
  }

  const baseline = computeKnapsackBaseline(jobs, exposureByAsset, windowCrewHours);

  if (!process.env.GEMINI_API_KEY) {
    return knapsackOnlyFallback(baseline, windowCrewHours, "GEMINI_API_KEY is not set in this environment");
  }

  const assets = loadAssets();
  const assetById = new Map(assets.map((a) => [a.id, a]));

  const jobContext = jobs.map((j) => {
    const asset = assetById.get(j.asset_id);
    return {
      job_id: j.id,
      asset: j.asset_id,
      station: asset?.station,
      description: j.description,
      est_hours: j.est_hours,
      crew_required: j.crew_required,
      crew_hours: j.est_hours * j.crew_required,
      skill: j.skill,
      spare_status: j.spare_status,
      spare_eta: j.spare_eta ?? null,
      isolation_point: j.isolation_point ?? null,
      exposure_protected: exposureByAsset[j.asset_id] ?? 0,
    };
  });

  const baselineContext = {
    selected: baseline.selected.map((l) => ({ job_id: l.job.id, crew_hours: l.crew_hours, exposure_protected: l.exposure_protected })),
    deferred: baseline.deferred.map((l) => ({ job_id: l.job.id, crew_hours: l.crew_hours, exposure_protected: l.exposure_protected })),
    window_crew_hours: windowCrewHours,
  };

  const prompt = `You are adjusting a shutdown-window job allocation for a maintenance planner at an auto body shop.

A greedy knapsack optimiser already ranked jobs by exposure-protected-per-crew-hour and produced this baseline selection within a ${windowCrewHours}-crew-hour budget:

${JSON.stringify(baselineContext, null, 2)}

Full candidate job list, with details the optimiser could not see:

${JSON.stringify(jobContext, null, 2)}

Adjust the baseline for constraints a solver cannot encode:
1. Any job with spare_status "in_transit" is NOT actually doable this window — the part has not arrived. If such a job is in the baseline selection, move it to deferred with a reason citing the spare ETA, and promote the next-best deferred job into the selection if it fits the remaining crew-hours.
2. If two or more selected jobs share the same isolation_point (and it is not null), report them under "batched" with a realistic hours_saved estimate (typically 0.5-1 hour, reflecting one shared lockout/tagout instead of two). Only report batching for jobs that genuinely share an isolation_point in the data above — never invent one.
3. For every deferred job, give a specific one-sentence reason that cites an actual constraint from the data (crew-hours budget, spare unavailability, or being outranked on exposure-per-crew-hour) — do not invent constraints not present in the input.
4. Recompute window_utilisation_pct and total_exposure_protected to match your final selected set and the ${windowCrewHours}-crew-hour budget.
5. Set planner_warning to a short note only if utilisation is unusually low (<70%) or a high-exposure job had to be deferred; otherwise leave it as an empty string.
6. Set confidence to "high" if the adjustment was straightforward, "medium" if you had to make a judgment call, "low" if the input was ambiguous.

Return only the JSON object matching the required schema. Do not invent job IDs, assets, or constraints that are not present in the data above.`;

  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const text = response.text;
    const finishReason = response.candidates?.[0]?.finishReason;
    const usage = response.usageMetadata;

    if (verbose) {
      return {
        _debug: true,
        finishReason: finishReason ?? null,
        usageMetadata: usage ?? null,
        rawTextLength: text?.length ?? 0,
        rawText: text ?? null,
      };
    }

    if (finishReason === "MAX_TOKENS") {
      return knapsackOnlyFallback(
        baseline,
        windowCrewHours,
        "Gemini response was truncated (hit maxOutputTokens) before finishing valid JSON"
      );
    }
    if (!text) {
      return knapsackOnlyFallback(baseline, windowCrewHours, "Gemini returned an empty response");
    }

    const cleaned = stripJsonFences(text);
    let parsed: AllocationResult;
    try {
      parsed = JSON.parse(cleaned) as AllocationResult;
    } catch {
      try {
        parsed = JSON.parse(repairCommaGroupedNumbers(cleaned)) as AllocationResult;
      } catch (parseErr) {
        const parseMessage = parseErr instanceof Error ? parseErr.message : String(parseErr);
        const snippet = cleaned.slice(0, 1000);
        throw new Error(`JSON parse failed: ${parseMessage} | raw response (first 1000 chars): ${snippet}`);
      }
    }
    parsed.source = "gemini";
    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Gemini allocation failed, falling back to knapsack baseline:", message);
    if (verbose) {
      return { _debug: true, error: message };
    }
    return knapsackOnlyFallback(baseline, windowCrewHours, message);
  }
}

export async function POST(req: NextRequest) {
  let windowHours: number;
  let crewCount: number;
  try {
    const body = await req.json();
    windowHours = Number(body.windowHours);
    crewCount = Number(body.crewCount);
    if (!Number.isFinite(windowHours) || !Number.isFinite(crewCount) || windowHours <= 0 || crewCount <= 0) {
      return NextResponse.json({ error: "windowHours and crewCount must be positive numbers" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const result = await runAllocation(windowHours, crewCount, false);
  return NextResponse.json(result);
}

// TEMPORARY diagnostic endpoint — GET /api/allocate?windowHours=6&crewCount=3&debug=1
// Returns the raw Gemini output directly instead of the parsed/fallback result,
// so the actual failure can be inspected without round-tripping through the UI.
// Remove once the allocation pipeline is confirmed stable.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const windowHours = Number(params.get("windowHours") ?? "6");
  const crewCount = Number(params.get("crewCount") ?? "3");
  const verbose = params.get("debug") === "1";
  const result = await runAllocation(windowHours, crewCount, verbose);
  return NextResponse.json(result);
}
