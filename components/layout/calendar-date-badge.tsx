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

/** Normalize to YYYY-MM-DD when possible. */
export function toIsoDateOnly(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

/** Calendar-style date badge (TravelBrain / FinanzBrain). */
export function CalendarDateBadge({
  isoDate,
  time,
  className,
}: {
  isoDate: string;
  time?: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-[4rem] shrink-0 flex-col overflow-hidden rounded-lg border border-black/10 bg-background sm:w-[4.35rem]",
        "shadow-[0_1px_0_rgba(255,255,255,0.85)_inset,0_1px_2px_rgba(15,23,42,0.08),0_3px_8px_rgba(15,23,42,0.12),0_8px_14px_-6px_rgba(15,23,42,0.18)]",
        "ring-1 ring-black/5",
        className
      )}
    >
      <div
        className={cn(
          "bg-gradient-to-b from-red-500 to-red-700 px-0.5 py-1 text-center text-[9px] font-extrabold uppercase leading-none tracking-wide text-white sm:text-[10px]",
          "shadow-[0_1px_0_rgba(255,255,255,0.28)_inset,0_1px_2px_rgba(127,29,29,0.3)]"
        )}
      >
        {monthShortDe(isoDate)}
      </div>
      <div
        className={cn(
          "flex flex-col items-center bg-gradient-to-b from-white to-slate-100 px-0.5 pb-1 pt-1",
          "shadow-[0_1px_0_rgba(255,255,255,0.9)_inset]"
        )}
      >
        <div className="text-[9px] font-extrabold leading-none text-foreground sm:text-[10px]">
          {weekdayDe(isoDate)}
        </div>
        <div className="mt-0.5 text-xl font-extrabold leading-none tabular-nums text-foreground sm:text-2xl">
          {dayNumber(isoDate)}
        </div>
        {time ? (
          <div className="mt-0.5 text-[9px] font-bold tabular-nums text-muted-foreground">
            {time}
          </div>
        ) : null}
      </div>
    </div>
  );
}
