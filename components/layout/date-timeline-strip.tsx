"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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

export function uniqueSortedIsoDates(
  isos: Array<string | null | undefined>,
  order: "asc" | "desc" = "asc"
): string[] {
  const set = new Set<string>();
  for (const raw of isos) {
    if (!raw) continue;
    const m = String(raw).trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) set.add(m[1]);
  }
  const sorted = [...set].sort();
  return order === "desc" ? sorted.reverse() : sorted;
}

export function scrollToDateAnchor(anchorId: string) {
  const el = document.getElementById(anchorId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

const accentActive: Record<"finance" | "travel", string> = {
  finance:
    "border-[var(--brand-finance)]/45 bg-[var(--brand-finance-soft)] text-[var(--brand-finance)] shadow-sm",
  travel: "border-sky-500/45 bg-sky-50 text-sky-700 shadow-sm",
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
  const scrollerRef = useRef<HTMLDivElement>(null);
  const items = useMemo(
    () => dates.map((iso) => ({ iso, ...dayLabel(iso) })),
    [dates]
  );

  useEffect(() => {
    if (!activeDate || !scrollerRef.current) return;
    const btn = scrollerRef.current.querySelector<HTMLElement>(
      `[data-date="${activeDate}"]`
    );
    if (!btn) return;
    btn.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [activeDate]);

  if (items.length === 0) return null;

  return (
    <div
      ref={scrollerRef}
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
          <Button
            key={item.iso}
            type="button"
            variant="outline"
            data-date={item.iso}
            aria-current={active ? "date" : undefined}
            title={`${item.weekday} ${item.day}. ${item.month}`}
            onClick={() => scrollToDateAnchor(anchorIdForDate(item.iso))}
            className={cn(
              "flex h-auto w-auto shrink-0 flex-col items-center rounded-md px-2 py-1 text-center transition-colors",
              active
                ? accentActive[accent]
                : "border-border/70 bg-background text-foreground hover:bg-muted/60"
            )}
          >
            <span
              className={cn(
                "text-[0.5625rem] font-bold uppercase leading-none tracking-wide",
                active ? "opacity-80" : "text-muted-foreground"
              )}
            >
              {item.month}
            </span>
            <span className="mt-0.5 text-sm font-black tabular-nums leading-none">
              {item.day}
            </span>
            <span
              className={cn(
                "mt-0.5 text-[0.5625rem] font-medium leading-none",
                active ? "opacity-80" : "text-muted-foreground"
              )}
            >
              {item.weekday}
            </span>
          </Button>
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
    // Keep top in one class string so lg: reliably overrides the mobile offset.
    belowHeader
      ? "top-[calc(3.5rem+env(safe-area-inset-top,0px))] lg:top-0"
      : "top-0"
  );
}

/**
 * Always-sticky class for the date timeline strip alone (used in PWA mode
 * where the full chrome isn't sticky but the strip should still follow scroll).
 *
 * - belowChrome: true  → strip sits below an already-sticky chrome element
 *                        (adds extra offset for its approximate height ~56 px on mobile)
 * - belowChrome: false → strip is the only sticky element, sits below MobileHeader
 */
export function stickyStripClass(opts?: {
  belowMobileHeader?: boolean;
  belowChrome?: boolean;
}): string {
  const belowHeader = opts?.belowMobileHeader !== false;
  const belowChrome = opts?.belowChrome === true;

  // Desktop: main scrolls → top-0 (or below chrome ~48 px)
  const lgTop = belowChrome ? "lg:top-12" : "lg:top-0";

  // Mobile: below MobileHeader (3.5 rem + safe-area), optionally + chrome (~3.5 rem)
  const mobileTop = belowHeader
    ? belowChrome
      ? "top-[calc(7rem+env(safe-area-inset-top,0px))]"
      : "top-[calc(3.5rem+env(safe-area-inset-top,0px))]"
    : belowChrome
      ? "top-14"
      : "top-0";

  return cn(
    "sticky z-[19] border-b border-border/40 bg-background/95 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-background/90",
    lgTop,
    mobileTop
  );
}
