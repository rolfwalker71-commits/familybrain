"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

const MONTH_SHORT_DE = [
  "JAN",
  "FEB",
  "MÄR",
  "APR",
  "MAI",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OKT",
  "NOV",
  "DEZ",
] as const;

function dayLabel(iso: string): { month: string; day: string; weekday: string } {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return {
    month: MONTH_SHORT_DE[m - 1] ?? "",
    day: String(d),
    weekday: new Intl.DateTimeFormat("de-CH", { weekday: "short" }).format(date),
  };
}

export function uniqueSortedIsoDates(isos: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const raw of isos) {
    if (!raw) continue;
    const m = String(raw).trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) set.add(m[1]);
  }
  return [...set].sort();
}

export function scrollToDateAnchor(anchorId: string) {
  const el = document.getElementById(anchorId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

const accentActive: Record<"finance" | "travel", string> = {
  finance:
    "border-[var(--brand-finance)]/40 bg-[var(--brand-finance-soft)] text-[var(--brand-finance)]",
  travel: "border-sky-500/40 bg-sky-50 text-sky-700",
};

/**
 * Horizontal date chips for quick jump to timeline / expense days.
 */
export function DateTimelineStrip({
  dates,
  anchorIdForDate,
  className,
  activeDate,
  accent = "finance",
}: {
  dates: string[];
  /** Build DOM id for scroll target, e.g. (iso) => `expense-day-${iso}` */
  anchorIdForDate: (isoDate: string) => string;
  className?: string;
  /** Optional highlight (e.g. currently scrolled day). */
  activeDate?: string | null;
  accent?: "finance" | "travel";
}) {
  const items = useMemo(
    () => dates.map((iso) => ({ iso, ...dayLabel(iso) })),
    [dates]
  );

  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        "-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5 pt-0.5 [scrollbar-width:thin]",
        className
      )}
      role="navigation"
      aria-label="Tage"
    >
      {items.map((item) => {
        const active = activeDate === item.iso;
        return (
          <button
            key={item.iso}
            type="button"
            title={`${item.weekday} ${item.day}. ${item.month}`}
            onClick={() => scrollToDateAnchor(anchorIdForDate(item.iso))}
            className={cn(
              "flex shrink-0 flex-col items-center rounded-md border px-2 py-1 text-center transition-colors",
              active
                ? accentActive[accent]
                : "border-border/70 bg-background text-foreground hover:bg-muted/60"
            )}
          >
            <span className="text-[9px] font-bold uppercase leading-none tracking-wide text-muted-foreground">
              {item.month}
            </span>
            <span className="mt-0.5 text-sm font-black tabular-nums leading-none">
              {item.day}
            </span>
            <span className="mt-0.5 text-[9px] font-medium leading-none text-muted-foreground">
              {item.weekday}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Sticky chrome under mobile header / at top of desktop main scroll. */
export function stickyDetailChromeClass(
  enabled: boolean,
  opts?: { belowMobileHeader?: boolean }
): string {
  if (!enabled) return "";
  const belowHeader = opts?.belowMobileHeader !== false;
  return cn(
    "sticky z-20 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90",
    // Desktop: main is the scroll container → top-0
    "lg:top-0",
    // Mobile browser: sit below MobileHeader (min-h-14 + safe area)
    belowHeader
      ? "top-[calc(3.5rem+env(safe-area-inset-top,0px))]"
      : "top-0"
  );
}
