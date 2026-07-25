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
  /** Compact — mobile travel/finance cards */
  sm: {
    root: "w-[3.85rem] rounded-md",
    month: "px-1 py-px text-[11px] font-black leading-none",
    body: "gap-px px-1 py-0.5",
    day: "text-[19px] font-black leading-none",
    weekday: "text-[9px] font-semibold leading-none",
    year: "text-[9px] font-bold leading-none",
    time: "text-[8px] leading-none",
  },
  /** Default desktop / roomier cards */
  md: {
    root: "w-[4.5rem] rounded-lg sm:w-[4.75rem]",
    month: "px-1 py-0.5 text-[12px] font-black leading-none sm:text-[13px]",
    body: "gap-0.5 px-1 py-1",
    day: "text-[24px] font-black leading-none sm:text-[26px]",
    weekday: "text-[10px] font-semibold leading-none sm:text-[11px]",
    year: "text-[10px] font-bold leading-none sm:text-[11px]",
    time: "text-[9px] leading-none",
  },
} as const;

export type CalendarDateBadgeSize = keyof typeof SIZE_STYLES;

/**
 * Soft-UI calendar date badge (TravelBuddy / FinanzBuddy).
 * Month strip, large day, weekday, year — compact stack.
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
  /** teal = MyBrain/TravelBuddy; green = FinanzBuddy */
  accent?: "teal" | "green";
  className?: string;
}) {
  const s = SIZE_STYLES[size];
  const monthTone =
    accent === "green"
      ? "bg-[var(--brand-finance-soft)] text-[var(--brand-finance)]"
      : "bg-[var(--brand-docs-soft)] text-[var(--brand-docs)]";
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col overflow-hidden border border-border bg-card",
        "shadow-[0_1px_2px_rgba(20,32,28,0.08),0_4px_10px_rgba(20,32,28,0.06)]",
        s.root,
        className
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
        <div className={cn("tabular-nums text-foreground", s.day)}>
          {dayNumber(isoDate)}
        </div>
        <div className={cn("text-muted-foreground", s.weekday)}>
          {weekdayShortDe(isoDate)}
        </div>
        <div className={cn("tabular-nums text-muted-foreground", s.year)}>
          {yearNumber(isoDate)}
        </div>
        {time ? (
          <div className={cn("tabular-nums text-muted-foreground", s.time)}>
            {time}
          </div>
        ) : null}
      </div>
    </div>
  );
}
