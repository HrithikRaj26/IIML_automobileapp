"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Exposure Board", short: "Board" },
  { href: "/window", label: "Window Planner", short: "Planner" },
];

export default function NavHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto max-w-6xl px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2 sm:gap-6">
        <div className="flex items-baseline gap-2 sm:gap-3 min-w-0">
          <span
            className="font-[family-name:var(--font-display)] text-lg sm:text-2xl font-bold tracking-wide text-[var(--accent-amber)] shrink-0"
          >
            NIRNAY
          </span>
          <span className="text-xs text-[var(--text-muted)] font-[family-name:var(--font-mono)] hidden md:inline truncate">
            Tata Motors · Pune PV · Body Shop · Line 2
          </span>
        </div>
        <nav className="flex gap-1 shrink-0">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-2 sm:px-3 py-1.5 text-xs sm:text-sm rounded-md font-medium transition-colors whitespace-nowrap ${
                  active
                    ? "bg-[var(--accent-amber)] text-[#14171a]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-raised)]"
                }`}
              >
                <span className="sm:hidden">{tab.short}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
