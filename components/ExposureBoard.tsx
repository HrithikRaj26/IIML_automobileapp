"use client";

import { useMemo, useState } from "react";
import type { Asset, RiskBreakdown, ExposureResult } from "@/lib/types";
import type { DailyPoint } from "@/lib/data";
import AssetDrawer from "./AssetDrawer";

export interface BoardRow {
  asset: Asset;
  risk: RiskBreakdown;
  exposure: ExposureResult;
  daily: DailyPoint[];
}

type SortMode = "exposure" | "risk";

function riskBand(risk: number): { label: string; color: string } {
  if (risk >= 0.6) return { label: "High", color: "var(--danger)" };
  if (risk >= 0.35) return { label: "Medium", color: "var(--accent-amber)" };
  return { label: "Low", color: "var(--success)" };
}

function fmtRupee(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export default function ExposureBoard({ rows }: { rows: BoardRow[] }) {
  const [sortMode, setSortMode] = useState<SortMode>("exposure");
  const [selected, setSelected] = useState<BoardRow | null>(null);

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sortMode === "exposure") {
      copy.sort((a, b) => b.exposure.exposure_rupees - a.exposure.exposure_rupees);
    } else {
      copy.sort((a, b) => b.risk.risk_index - a.risk.risk_index);
    }
    return copy;
  }, [rows, sortMode]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">Exposure Board</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            14 body shop assets. Ranked by what each one protects, not just how likely it is to fail.
          </p>
        </div>

        {/* Sort toggle — this is the demo */}
        <div className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-full p-1">
          <ToggleButton active={sortMode === "risk"} onClick={() => setSortMode("risk")}>
            Failure Risk
          </ToggleButton>
          <ToggleButton active={sortMode === "exposure"} onClick={() => setSortMode("exposure")}>
            ₹ Exposure
          </ToggleButton>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--surface)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--text-muted)] text-xs uppercase tracking-wide bg-[var(--surface-raised)]">
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Asset</th>
              <th className="px-4 py-3 font-medium">Risk band</th>
              <th className="px-4 py-3 font-medium text-right">MTTR</th>
              <th className="px-4 py-3 font-medium text-right">Buffer</th>
              <th className="px-4 py-3 font-medium text-right">₹ Exposure</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const band = riskBand(row.risk.risk_index);
              return (
                <tr
                  key={row.asset.id}
                  onClick={() => setSelected(row)}
                  className="border-t border-[var(--border)] hover:bg-[var(--surface-raised)] cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-[family-name:var(--font-mono)] text-[var(--text-muted)]">
                    {i + 1}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.asset.name}</div>
                    <div className="text-xs text-[var(--text-muted)] font-[family-name:var(--font-mono)]">
                      {row.asset.id} · {row.asset.station}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: `${band.color}22`, color: band.color }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: band.color }} />
                      {band.label} · {row.risk.risk_index.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-[family-name:var(--font-mono)]">
                    {row.asset.mttr_minutes}m
                  </td>
                  <td className="px-4 py-3 text-right font-[family-name:var(--font-mono)]">
                    {row.asset.downstream_buffer_minutes}m
                  </td>
                  <td className="px-4 py-3 text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--accent-teal)]">
                    {fmtRupee(row.exposure.exposure_rupees)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[var(--text-muted)] mt-4 leading-relaxed max-w-2xl">
        Exposure = risk index × max(0, MTTR − downstream buffer) × cost per downtime hour. A low-risk
        asset behind a thin buffer can carry more exposure than a high-risk asset a healthy buffer
        protects — click any row to see why.
      </p>

      {selected && (
        <AssetDrawer
          asset={selected.asset}
          risk={selected.risk}
          exposure={selected.exposure}
          daily={selected.daily}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
        active ? "bg-[var(--accent-amber)] text-[#14171a]" : "text-[var(--text-muted)] hover:text-[var(--text)]"
      }`}
    >
      {children}
    </button>
  );
}
