"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Slim one-row orientation strip under trip hero / finance chrome.
 * Stacks on narrow PWA screens; stays a single calm band on desktop.
 */
export function StatusStrip({
  accent = "finance",
  primary,
  secondary,
  className,
}: {
  accent?: "travel" | "finance";
  primary: ReactNode;
  secondary?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3",
        accent === "travel"
          ? "border-sky-500/20 bg-sky-50/80 text-sky-950"
          : "border-[var(--brand-finance)]/20 bg-[var(--brand-finance-soft)] text-foreground",
        className
      )}
      role="status"
    >
      <div className="min-w-0 leading-snug">{primary}</div>
      {secondary ? (
        <>
          <span
            className="hidden h-4 w-px shrink-0 bg-current/15 sm:block"
            aria-hidden
          />
          <div className="min-w-0 shrink-0 text-xs font-medium leading-snug text-current/80 sm:text-right sm:text-sm">
            {secondary}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function daysUntilIso(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const m = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function formatCountdownDe(days: number | null): string | null {
  if (days == null) return null;
  if (days === 0) return "heute";
  if (days === 1) return "morgen";
  if (days === -1) return "gestern";
  if (days > 1) return `in ${days} Tagen`;
  return `vor ${Math.abs(days)} Tagen`;
}
