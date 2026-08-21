"use client";

import { useMemo, useState } from "react";
import type { Asset, Job, AllocationResult } from "@/lib/types";

interface Props {
  jobs: Job[];
  assets: Asset[];
}

interface OverrideEntry {
  job_id: string;
  reason: string;
}

function fmtRupee(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

const CONFIDENCE_COLOR: Record<string, string> = {
  high: "var(--success)",
  medium: "var(--accent-amber)",
  low: "var(--danger)",
};

export default function WindowPlanner({ jobs, assets }: Props) {
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  const [windowHours, setWindowHours] = useState(6);
  const [crewCount, setCrewCount] = useState(3);
  const [result, setResult] = useState<AllocationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, OverrideEntry>>({});
  const [overrideDraft, setOverrideDraft] = useState<Record<string, string>>({});

  // Feedback panel state
  const [feedbackJobId, setFeedbackJobId] = useState("");
  const [technicianNote, setTechnicianNote] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackResult, setFeedbackResult] = useState<{
    failure_mode: string;
    root_cause: string;
    prediction_was_correct: boolean;
    unlogged_symptom: string;
  } | null>(null);
  const [precisionCount, setPrecisionCount] = useState({ correct: 0, total: 0 });

  const windowCrewHours = windowHours * crewCount;

  async function handleAllocate() {
    setLoading(true);
    setError(null);
    setResult(null);
    setOverrides({});
    try {
      const res = await fetch("/api/allocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windowHours, crewCount }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data: AllocationResult = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Allocation failed");
    } finally {
      setLoading(false);
    }
  }

  function handleOverride(jobId: string) {
    const reason = overrideDraft[jobId]?.trim();
    if (!reason) return;
    setOverrides((prev) => ({ ...prev, [jobId]: { job_id: jobId, reason } }));
    setOverrideDraft((prev) => ({ ...prev, [jobId]: "" }));
  }

  async function handleClassify() {
    if (!feedbackJobId || !technicianNote.trim()) return;
    setFeedbackLoading(true);
    setFeedbackResult(null);
    try {
      const job = jobs.find((j) => j.id === feedbackJobId);
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset_id: job?.asset_id ?? "", technician_note: technicianNote }),
      });
      const data = await res.json();
      setFeedbackResult(data);
      setPrecisionCount((prev) => ({
        correct: prev.correct + (data.prediction_was_correct ? 1 : 0),
        total: prev.total + 1,
      }));
    } finally {
      setFeedbackLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-10">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">Window Planner</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Set the shutdown window. A knapsack baseline computes the exposure-optimal job set;
          Gemini adjusts it for spare availability, isolation batching, and explains the trade-offs.
        </p>
      </div>

      {/* Window controls */}
      <section className="flex flex-wrap items-end gap-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Window hours</span>
          <input
            type="number"
            min={1}
            max={24}
            value={windowHours}
            onChange={(e) => setWindowHours(Number(e.target.value))}
            className="w-24 bg-[var(--surface-raised)] border border-[var(--border)] rounded-md px-3 py-1.5 font-[family-name:var(--font-mono)]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Crew count</span>
          <input
            type="number"
            min={1}
            max={10}
            value={crewCount}
            onChange={(e) => setCrewCount(Number(e.target.value))}
            className="w-24 bg-[var(--surface-raised)] border border-[var(--border)] rounded-md px-3 py-1.5 font-[family-name:var(--font-mono)]"
          />
        </label>
        <div className="text-sm text-[var(--text-muted)] font-[family-name:var(--font-mono)] pb-2">
          = {windowCrewHours} crew-hours available
        </div>
        <button
          onClick={handleAllocate}
          disabled={loading}
          className="ml-auto px-5 py-2 rounded-md bg-[var(--accent-amber)] text-[#14171a] font-semibold disabled:opacity-50"
        >
          {loading ? "Allocating…" : "Allocate"}
        </button>
      </section>

      {error && (
        <div className="bg-[var(--danger)]/10 border border-[var(--danger)] text-[var(--danger)] rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {result && (
        <>
          {result.source === "knapsack_fallback" && (
            <div className="bg-[var(--accent-amber)]/10 border border-[var(--accent-amber)] text-[var(--accent-amber)] rounded-lg px-4 py-3 text-sm font-medium space-y-1">
              <div>Optimiser only — advisory unavailable. Showing the crew-hour-optimal baseline without soft-constraint adjustment.</div>
              {result.debug_error && (
                <div className="font-[family-name:var(--font-mono)] text-xs opacity-80">{result.debug_error}</div>
              )}
            </div>
          )}

          {/* Summary stats */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Selected" value={String(result.selected.length)} />
            <Stat label="Deferred" value={String(result.deferred.length)} />
            <Stat label="Utilisation" value={`${result.window_utilisation_pct.toFixed(0)}%`} accent="teal" />
            <Stat label="Exposure protected" value={fmtRupee(result.total_exposure_protected)} accent="amber" />
          </section>

          {result.planner_warning && (
            <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm">
              <span className="font-semibold">Note: </span>
              {result.planner_warning}
            </div>
          )}

          <div className="flex items-center gap-4 text-sm flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)]">Source:</span>
              <span
                className="px-2 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: result.source === "gemini" ? "var(--accent-teal)22" : "var(--accent-amber)22",
                  color: result.source === "gemini" ? "var(--accent-teal)" : "var(--accent-amber)",
                }}
              >
                {result.source === "gemini" ? "Gemini-adjusted" : "Optimiser only"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)]">Confidence:</span>
              <span
                className="px-2 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: `${CONFIDENCE_COLOR[result.confidence] ?? "var(--text-muted)"}22`,
                  color: CONFIDENCE_COLOR[result.confidence] ?? "var(--text-muted)",
                }}
              >
                {result.confidence}
              </span>
            </div>
          </div>

          {/* Selected */}
          <section>
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold mb-3">
              Selected — this window
            </h2>
            <div className="space-y-2">
              {result.selected.map((s) => {
                const overridden = overrides[s.job_id];
                return (
                  <div
                    key={s.job_id}
                    className={`bg-[var(--surface)] border rounded-lg px-4 py-3 ${
                      overridden ? "border-[var(--danger)]" : "border-[var(--border)]"
                    }`}
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <div className="font-medium">
                          {assetById.get(s.asset)?.name ?? s.asset}{" "}
                          <span className="text-xs text-[var(--text-muted)] font-[family-name:var(--font-mono)]">
                            {s.job_id}
                          </span>
                        </div>
                        <div className="text-sm text-[var(--text-muted)] mt-0.5">{s.rationale}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-[family-name:var(--font-mono)] text-sm">{s.crew_hours}h</div>
                        <div className="font-[family-name:var(--font-mono)] text-sm text-[var(--accent-teal)]">
                          {fmtRupee(s.exposure_protected)}
                        </div>
                      </div>
                    </div>
                    {overridden ? (
                      <div className="mt-2 text-xs text-[var(--danger)]">
                        Overridden by planner: {overridden.reason}
                      </div>
                    ) : (
                      <div className="mt-2 flex gap-2">
                        <input
                          type="text"
                          placeholder="Override reason…"
                          value={overrideDraft[s.job_id] ?? ""}
                          onChange={(e) => setOverrideDraft((prev) => ({ ...prev, [s.job_id]: e.target.value }))}
                          className="flex-1 bg-[var(--surface-raised)] border border-[var(--border)] rounded-md px-2 py-1 text-xs"
                        />
                        <button
                          onClick={() => handleOverride(s.job_id)}
                          className="px-3 py-1 text-xs rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--danger)]"
                        >
                          Override
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Batched */}
          {result.batched.length > 0 && (
            <section>
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold mb-3">
                Batched — shared isolation
              </h2>
              <div className="space-y-2">
                {result.batched.map((b, i) => (
                  <div key={i} className="bg-[var(--accent-teal)]/10 border border-[var(--accent-teal)] rounded-lg px-4 py-3 text-sm">
                    <span className="font-medium">{b.jobs.join(" + ")}</span> share {b.shared_isolation} — saves{" "}
                    {b.hours_saved}h
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Deferred */}
          <section>
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold mb-3">
              Deferred — carried forward
            </h2>
            <div className="space-y-2">
              {result.deferred.map((d) => (
                <div key={d.job_id} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <div className="font-medium">
                        {assetById.get(d.asset)?.name ?? d.asset}{" "}
                        <span className="text-xs text-[var(--text-muted)] font-[family-name:var(--font-mono)]">
                          {d.job_id}
                        </span>
                      </div>
                      <div className="text-sm text-[var(--text-muted)] mt-0.5">{d.reason}</div>
                    </div>
                    <div className="font-[family-name:var(--font-mono)] text-sm text-[var(--danger)] shrink-0">
                      {fmtRupee(d.exposure_carried)} carried
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Feedback panel */}
      <section className="border-t border-[var(--border)] pt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
            Feedback — technician notes
          </h2>
          <div className="text-sm text-[var(--text-muted)] font-[family-name:var(--font-mono)]">
            Precision: {precisionCount.total > 0 ? `${precisionCount.correct}/${precisionCount.total}` : "—"}
          </div>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-3">
          <select
            value={feedbackJobId}
            onChange={(e) => setFeedbackJobId(e.target.value)}
            className="w-full bg-[var(--surface-raised)] border border-[var(--border)] rounded-md px-3 py-2 text-sm"
          >
            <option value="">Select a completed job…</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.id} — {assetById.get(j.asset_id)?.name ?? j.asset_id}
              </option>
            ))}
          </select>
          <textarea
            value={technicianNote}
            onChange={(e) => setTechnicianNote(e.target.value)}
            placeholder="What did the technician actually find? e.g. 'gearbox noise, replaced bearing'"
            rows={3}
            className="w-full bg-[var(--surface-raised)] border border-[var(--border)] rounded-md px-3 py-2 text-sm resize-none"
          />
          <button
            onClick={handleClassify}
            disabled={feedbackLoading || !feedbackJobId || !technicianNote.trim()}
            className="px-4 py-1.5 rounded-md bg-[var(--accent-teal)] text-[#14171a] font-semibold text-sm disabled:opacity-50"
          >
            {feedbackLoading ? "Classifying…" : "Classify"}
          </button>

          {feedbackResult && (
            <div className="mt-3 bg-[var(--surface-raised)] rounded-lg p-4 text-sm space-y-1">
              <div>
                <span className="text-[var(--text-muted)]">Failure mode: </span>
                <span className="font-[family-name:var(--font-mono)]">{feedbackResult.failure_mode}</span>
              </div>
              <div>
                <span className="text-[var(--text-muted)]">Root cause: </span>
                {feedbackResult.root_cause}
              </div>
              <div>
                <span className="text-[var(--text-muted)]">Prediction was correct: </span>
                <span style={{ color: feedbackResult.prediction_was_correct ? "var(--success)" : "var(--danger)" }}>
                  {feedbackResult.prediction_was_correct ? "Yes" : "No — false positive"}
                </span>
              </div>
              {feedbackResult.unlogged_symptom && (
                <div>
                  <span className="text-[var(--text-muted)]">Unlogged symptom: </span>
                  {feedbackResult.unlogged_symptom}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "amber" | "teal" }) {
  const color = accent === "amber" ? "var(--accent-amber)" : accent === "teal" ? "var(--accent-teal)" : "var(--text)";
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
      <div className="font-[family-name:var(--font-mono)] text-xl font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
