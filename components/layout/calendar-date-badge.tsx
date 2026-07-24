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

function weekdayShortDe(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat("de-CH", { weekday: "short" })
    .format(date)
    .replace(/\.$/, "");
}

function monthShortDe(isoDate: string): string {
  const month = Number(isoDate.slice(5, 7));
  return MONTH_SHORT_DE[month - 1] ?? "";
}

function dayNumber(isoDate: string): string {
  return String(Number(isoDate.slice(8, 10)));
}

/** Normalize to YYYY-MM-DD when possible. */
export function toIsoDateOnly(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

const SIZE_STYLES = {
  /** Compact — mobile travel/finance cards */
  sm: {
    root: "w-12 rounded-lg",
    month: "px-1 py-1 text-[9px]",
    body: "px-1 py-1.5",
    day: "text-[17px]",
    weekday: "mt-0.5 text-[10px]",
    time: "mt-0.5 text-[8px]",
  },
  /** Default desktop / roomier cards */
  md: {
    root: "w-14 rounded-lg sm:w-16",
    month: "px-1 py-1.5 text-[10px] sm:text-[11px]",
    body: "px-1 py-2",
    day: "text-[22px] sm:text-[24px]",
    weekday: "mt-0.5 text-[11px] sm:text-[12px]",
    time: "mt-1 text-[10px]",
  },
} as const;

export type CalendarDateBadgeSize = keyof typeof SIZE_STYLES;

/**
 * Soft-UI calendar date badge (TravelBrain / FinanzBrain).
 * Month strip on top, large day, short weekday — sage accent.
 */
export function CalendarDateBadge({
  isoDate,
  time,
  size = "sm",
  className,
}: {
  isoDate: string;
  time?: string | null;
  size?: CalendarDateBadgeSize;
  className?: string;
}) {
  const s = SIZE_STYLES[size];
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col overflow-hidden border border-border/70 bg-card",
        "shadow-[0_1px_2px_rgba(20,32,28,0.06)]",
        s.root,
        className
      )}
    >
      <div
        className={cn(
          "shrink-0 bg-[var(--brand-finance-soft)] text-center font-bold uppercase leading-none tracking-wide text-[var(--brand-finance)]",
          s.month
        )}
      >
        {monthShortDe(isoDate)}
      </div>
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col items-center justify-center bg-card",
          s.body
        )}
      >
        <div
          className={cn(
            "font-bold leading-none tabular-nums text-foreground",
            s.day
          )}
        >
          {dayNumber(isoDate)}
        </div>
        <div
          className={cn(
            "font-medium leading-none text-muted-foreground",
            s.weekday
          )}
        >
          {weekdayShortDe(isoDate)}
        </div>
        {time ? (
          <div
            className={cn(
              "font-medium tabular-nums text-muted-foreground",
              s.time
            )}
          >
            {time}
          </div>
        ) : null}
      </div>
    </div>
  );
}
