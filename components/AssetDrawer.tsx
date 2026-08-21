"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import type { Asset, RiskBreakdown, ExposureResult } from "@/lib/types";
import type { DailyPoint } from "@/lib/data";
import { RISK_WEIGHTS } from "@/lib/scoring";

interface Props {
  asset: Asset;
  risk: RiskBreakdown;
  exposure: ExposureResult;
  daily: DailyPoint[];
  onClose: () => void;
}

const FEATURES: { key: keyof typeof RISK_WEIGHTS; label: string; why: string }[] = [
  { key: "vibration_slope", label: "Vibration RMS slope, 7-day", why: "Leading indicator for bearing and gearbox wear" },
  { key: "current_drift", label: "Motor current drift vs baseline", why: "Mechanical binding, load anomaly" },
  { key: "cycles_ratio", label: "Cycles since service ÷ rated interval", why: "Wear proxy where sensing is thin" },
  { key: "fault_code_rate", label: "Fault code rate 72h vs 30-day median", why: "Nuisance codes cluster ahead of hard failures" },
  { key: "temp_rise", label: "Temperature rise vs baseline", why: "Lubrication loss" },
  { key: "running_hours_ratio", label: "Running hours ÷ MTBF", why: "Age" },
  { key: "failures_90d", label: "Failures in last 90 days", why: "Repeat offenders stay offenders" },
];

function fmtRupee(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export default function AssetDrawer({ asset, risk, exposure, daily, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-[var(--surface)] border-l border-[var(--border)] h-full overflow-y-auto">
        <div className="sticky top-0 bg-[var(--surface)] border-b border-[var(--border)] px-6 py-4 flex items-start justify-between z-10">
          <div>
            <div className="font-[family-name:var(--font-mono)] text-xs text-[var(--text-muted)]">{asset.id}</div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">{asset.name}</h2>
            <div className="text-sm text-[var(--text-muted)]">{asset.station}</div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text)] text-2xl leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* Top-line numbers */}
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Risk index" value={risk.risk_index.toFixed(2)} accent="amber" />
            <Stat label="MTTR / buffer" value={`${asset.mttr_minutes} / ${asset.downstream_buffer_minutes} min`} />
            <Stat label="₹ Exposure" value={fmtRupee(exposure.exposure_rupees)} accent="teal" />
          </div>

          {/* Risk breakdown */}
          <section>
            <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold mb-1">
              Risk index — seven weighted factors
            </h3>
            <p className="text-xs text-[var(--text-muted)] mb-4 leading-relaxed">
              A weighted feature index, not a trained model. Weights are reliability-engineering
              judgment, published here, and falsifiable against real history. A model fitted to
              synthetic data would only rediscover its own generator.
            </p>
            <div className="space-y-3">
              {FEATURES.map((f) => {
                const value = risk[f.key];
                const weight = RISK_WEIGHTS[f.key];
                return (
                  <div key={f.key}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{f.label}</span>
                      <span className="font-[family-name:var(--font-mono)] text-[var(--text-muted)]">
                        w={weight.toFixed(2)} · {(value * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-2 bg-[var(--surface-raised)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--accent-amber)]"
                        style={{ width: `${Math.round(value * 100)}%` }}
                      />
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">{f.why}</div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 30-day sensor trend */}
          <section>
            <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold mb-3">
              Sensor trend — last 30 days
            </h3>
            <div className="h-56 bg-[var(--surface-raised)] rounded-lg p-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="day"
                    stroke="var(--text-muted)"
                    fontSize={11}
                    tickFormatter={(d) => `D${d}`}
                  />
                  <YAxis stroke="var(--text-muted)" fontSize={11} />
                  <Tooltip
                    contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", fontSize: 12 }}
                    labelFormatter={(d) => `Day ${d}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="vibration_rms" name="Vibration (mm/s)" stroke="var(--accent-amber)" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="motor_current" name="Current (A)" stroke="var(--accent-teal)" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="temp_c" name="Temp (°C)" stroke="var(--danger)" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "amber" | "teal" }) {
  const color =
    accent === "amber" ? "var(--accent-amber)" : accent === "teal" ? "var(--accent-teal)" : "var(--text)";
  return (
    <div className="bg-[var(--surface-raised)] rounded-lg px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
      <div className="font-[family-name:var(--font-mono)] text-lg font-medium" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
