"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Exposure Board" },
  { href: "/window", label: "Window Planner" },
];

export default function NavHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between gap-6">
        <div className="flex items-baseline gap-3">
          <span
            className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-wide text-[var(--accent-amber)]"
          >
            NIRNAY
          </span>
          <span className="text-xs text-[var(--text-muted)] font-[family-name:var(--font-mono)] hidden sm:inline">
            Tata Motors · Pune PV · Body Shop · Line 2
          </span>
        </div>
        <nav className="flex gap-1">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                  active
                    ? "bg-[var(--accent-amber)] text-[#14171a]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-raised)]"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
