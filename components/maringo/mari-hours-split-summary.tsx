"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

const BILLABLE_COLOR = "#047857";
const NON_BILLABLE_COLOR = "#94a3b8";

function formatHours(n: number): string {
  return n.toLocaleString("de-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeDonutSlice(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number
): string {
  const large = endAngle - startAngle > 180 ? 1 : 0;
  const oStart = polar(cx, cy, rOuter, endAngle);
  const oEnd = polar(cx, cy, rOuter, startAngle);
  const iStart = polar(cx, cy, rInner, startAngle);
  const iEnd = polar(cx, cy, rInner, endAngle);
  return [
    `M ${oStart.x} ${oStart.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 0 ${oEnd.x} ${oEnd.y}`,
    `L ${iStart.x} ${iStart.y}`,
    `A ${rInner} ${rInner} 0 ${large} 1 ${iEnd.x} ${iEnd.y}`,
    "Z",
  ].join(" ");
}

function Donut({
  billable,
  nonBillable,
  size = 64,
}: {
  billable: number;
  nonBillable: number;
  size?: number;
}) {
  const gradId = useId();
  const total = billable + nonBillable;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 1;
  const rInner = rOuter * 0.58;

  if (total <= 0) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
      >
        <circle
          cx={cx}
          cy={cy}
          r={(rOuter + rInner) / 2}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={rOuter - rInner}
        />
      </svg>
    );
  }

  if (billable <= 0 || nonBillable <= 0) {
    const color = billable > 0 ? BILLABLE_COLOR : NON_BILLABLE_COLOR;
    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={
          billable > 0
            ? "Nur verrechenbare Stunden"
            : "Nur nicht verrechenbare Stunden"
        }
      >
        <circle
          cx={cx}
          cy={cy}
          r={(rOuter + rInner) / 2}
          fill="none"
          stroke={color}
          strokeWidth={rOuter - rInner}
        />
      </svg>
    );
  }

  const billableSpan = (billable / total) * 360;
  const slices = [
    {
      color: BILLABLE_COLOR,
      start: 0,
      end: billableSpan,
    },
    {
      color: NON_BILLABLE_COLOR,
      start: billableSpan,
      end: 360,
    },
  ];

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Verrechenbar ${formatHours(billable)} h, nicht verrechenbar ${formatHours(nonBillable)} h`}
    >
      <defs>
        <filter id={`${gradId}-soft`} x="-8%" y="-8%" width="116%" height="116%">
          <feDropShadow
            dx="0"
            dy="1"
            stdDeviation="1"
            floodColor="#0f172a"
            floodOpacity="0.1"
          />
        </filter>
      </defs>
      <g filter={`url(#${gradId}-soft)`}>
        {slices.map((s) => (
          <path
            key={s.color}
            d={describeDonutSlice(cx, cy, rOuter, rInner, s.start, s.end)}
            fill={s.color}
          />
        ))}
      </g>
    </svg>
  );
}

export function MariHoursSplitSummary({
  totalHours,
  billableHours,
  nonBillableHours,
  lineCount,
  footnote,
  totalHint = "Zeitraum",
  className,
}: {
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  lineCount?: number;
  /** Überschreibt den Standard-Hinweis unter den KPIs. */
  footnote?: string;
  /** Untertitel unter «Gesamt erfasst». */
  totalHint?: string | null;
  className?: string;
}) {
  const billablePct =
    totalHours > 0
      ? Math.round((billableHours / totalHours) * 100)
      : 0;
  const nonBillablePct =
    totalHours > 0 ? Math.max(0, 100 - billablePct) : 0;

  const hint =
    footnote ??
    (lineCount != null
      ? `${lineCount} Buchung${lineCount === 1 ? "" : "en"} auf diesem Ticket`
      : null);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2",
        className
      )}
    >
      <div className="relative shrink-0">
        <Donut billable={billableHours} nonBillable={nonBillableHours} />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] font-black tabular-nums leading-none tracking-tight">
            {formatHours(totalHours)}
          </span>
          <span className="mt-px text-[8px] font-medium text-muted-foreground">
            h
          </span>
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          <div className="rounded-md border border-emerald-200/70 bg-emerald-50/60 px-1.5 py-1 dark:border-emerald-400/30 dark:bg-emerald-500/12">
            <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-emerald-900/80">
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: BILLABLE_COLOR }}
                aria-hidden
              />
              Verrechenbar
            </p>
            <p className="mt-0.5 text-[13px] font-black tabular-nums leading-none text-emerald-950">
              {formatHours(billableHours)}
              <span className="ml-0.5 text-[10px] font-semibold text-emerald-800/80">
                h
              </span>
            </p>
            <p className="mt-px text-[9px] tabular-nums text-emerald-900/65">
              {billablePct}%
            </p>
          </div>
          <div className="rounded-md border border-border/60 bg-background/80 px-1.5 py-1">
            <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: NON_BILLABLE_COLOR }}
                aria-hidden
              />
              Nicht verr.
            </p>
            <p className="mt-0.5 text-[13px] font-black tabular-nums leading-none text-foreground">
              {formatHours(nonBillableHours)}
              <span className="ml-0.5 text-[10px] font-semibold text-muted-foreground">
                h
              </span>
            </p>
            <p className="mt-px text-[9px] tabular-nums text-muted-foreground">
              {nonBillablePct}%
            </p>
          </div>
          <div className="col-span-2 rounded-md border border-border/60 bg-background/80 px-1.5 py-1 sm:col-span-1">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              Gesamt erfasst
            </p>
            <p className="mt-0.5 text-[13px] font-black tabular-nums leading-none text-foreground">
              {formatHours(totalHours)}
              <span className="ml-0.5 text-[10px] font-semibold text-muted-foreground">
                h
              </span>
            </p>
            {totalHint ? (
              <p className="mt-px text-[9px] text-muted-foreground">{totalHint}</p>
            ) : null}
          </div>
        </div>
        {hint ? (
          <p className="text-[10px] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}
