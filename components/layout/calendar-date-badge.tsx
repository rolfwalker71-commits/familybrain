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

function weekdayDe(isoDate: string): string {
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
  /** Compact — mobile travel/finance cards */
  sm: {
    root: "w-[3.15rem] rounded-md",
    month: "px-0.5 py-0.5 text-[8px]",
    body: "px-0.5 py-0.5",
    weekday: "text-[8px]",
    day: "mt-0.5 text-[15px]",
    year: "mt-0.5 text-[9px]",
    time: "mt-0.5 text-[8px]",
  },
  /** Default desktop / roomier cards */
  md: {
    root: "w-[4.5rem] rounded-lg sm:w-[4.85rem]",
    month: "px-0.5 py-1 text-[10px] sm:text-[11px]",
    body: "px-0.5 py-1",
    weekday: "text-[10px] sm:text-[11px]",
    day: "mt-0.5 text-[21px] sm:text-[25px]",
    year: "mt-0.5 text-[12px] sm:text-[13px]",
    time: "mt-0.5 text-[10px]",
  },
} as const;

export type CalendarDateBadgeSize = keyof typeof SIZE_STYLES;

/** Calendar-style date badge (TravelBrain / FinanzBrain). */
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
        "flex shrink-0 flex-col overflow-hidden border border-black/10 bg-background",
        "shadow-[0_1px_0_rgba(255,255,255,0.85)_inset,0_1px_2px_rgba(15,23,42,0.08),0_3px_8px_rgba(15,23,42,0.12),0_8px_14px_-6px_rgba(15,23,42,0.18)]",
        "ring-1 ring-black/5",
        s.root,
        className
      )}
    >
      <div
        className={cn(
          "shrink-0 bg-gradient-to-b from-red-500 to-red-700 text-center font-black uppercase leading-none tracking-wide text-white",
          "shadow-[0_1px_0_rgba(255,255,255,0.28)_inset,0_1px_2px_rgba(127,29,29,0.3)]",
          s.month
        )}
      >
        {monthShortDe(isoDate)}
      </div>
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col items-center justify-center bg-gradient-to-b from-white to-slate-100",
          "shadow-[0_1px_0_rgba(255,255,255,0.9)_inset]",
          s.body
        )}
      >
        <div
          className={cn(
            "font-extrabold leading-none text-foreground",
            s.weekday
          )}
        >
          {weekdayDe(isoDate)}
        </div>
        <div
          className={cn(
            "font-black leading-none tabular-nums text-foreground",
            s.day
          )}
        >
          {dayNumber(isoDate)}
        </div>
        <div
          className={cn(
            "font-bold tabular-nums leading-none text-foreground",
            s.year
          )}
        >
          {yearNumber(isoDate)}
        </div>
        {time ? (
          <div
            className={cn(
              "font-bold tabular-nums text-muted-foreground",
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
