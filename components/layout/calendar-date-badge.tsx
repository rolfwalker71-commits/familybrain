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

/** Full German weekday, e.g. Freitag. */
function weekdayLongDe(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat("de-CH", { weekday: "long" }).format(date);
}

function monthShortDe(isoDate: string): string {
  const month = Number(isoDate.slice(5, 7));
  return MONTH_SHORT_DE[month - 1] ?? "";
}

function dayNumber(isoDate: string): string {
  return String(Number(isoDate.slice(8, 10)));
}

function yearNumber(isoDate: string): string {
  return isoDate.slice(0, 4);
}

/** Normalize to YYYY-MM-DD when possible. */
export function toIsoDateOnly(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

const SIZE_STYLES = {
  /** Narrow but fits «Donnerstag» without clipping */
  sm: {
    root: "w-[4.55rem] rounded-md",
    month: "px-0.5 py-px text-[11px] font-black leading-none",
    body: "gap-px px-0.5 py-0.5",
    weekday: "text-[8.5px] font-semibold leading-none tracking-tight",
    day: "text-[19px] font-black leading-none",
    year: "text-[9px] font-bold leading-none",
    time: "mt-0.5 text-[9px] font-semibold leading-tight",
  },
  /** Desktop — still compact */
  md: {
    root: "w-[5rem] rounded-lg sm:w-[5.25rem]",
    month: "px-0.5 py-0.5 text-[12px] font-black leading-none sm:text-[13px]",
    body: "gap-0.5 px-0.5 py-1",
    weekday: "text-[9px] font-semibold leading-none tracking-tight sm:text-[10px]",
    day: "text-[24px] font-black leading-none sm:text-[26px]",
    year: "text-[10px] font-bold leading-none sm:text-[11px]",
    time: "mt-1 text-[10px] font-semibold leading-tight sm:text-[11px]",
  },
} as const;

export type CalendarDateBadgeSize = keyof typeof SIZE_STYLES;

/**
 * Flat calendar date badge. Order inside badge: month → weekday → day → year.
 * Time (if any) is always rendered below the badge, never inside it.
 */
export function CalendarDateBadge({
  isoDate,
  time,
  size = "sm",
  accent = "teal",
  className,
}: {
  isoDate: string;
  time?: string | null;
  size?: CalendarDateBadgeSize;
  /** teal = TripBook/TravelBuddy; green = FinanzBuddy */
  accent?: "teal" | "green";
  className?: string;
}) {
  const s = SIZE_STYLES[size];
  const monthTone =
    accent === "green"
      ? "bg-[var(--brand-finance-soft)] text-[var(--brand-finance)]"
      : "bg-[var(--brand-docs-soft)] text-[var(--brand-docs)]";
  const timeLabel = time?.trim() || null;
  return (
    <div className={cn("flex shrink-0 flex-col items-center", className)}>
      <div
        className={cn(
          "flex flex-col overflow-hidden border border-border bg-card",
          s.root
        )}
      >
        <div
          className={cn(
            "shrink-0 text-center uppercase tracking-wide",
            monthTone,
            s.month
          )}
        >
          {monthShortDe(isoDate)}
        </div>
        <div
          className={cn(
            "flex flex-col items-center justify-center bg-card",
            s.body
          )}
        >
          <div
            className={cn(
              "w-full text-center text-muted-foreground",
              s.weekday
            )}
          >
            {weekdayLongDe(isoDate)}
          </div>
          <div className={cn("tabular-nums text-foreground", s.day)}>
            {dayNumber(isoDate)}
          </div>
          <div className={cn("tabular-nums text-muted-foreground", s.year)}>
            {yearNumber(isoDate)}
          </div>
        </div>
      </div>
      {timeLabel ? (
        <div
          className={cn(
            "w-full text-center tabular-nums text-muted-foreground",
            s.time
          )}
        >
          {timeLabel}
        </div>
      ) : null}
    </div>
  );
}
