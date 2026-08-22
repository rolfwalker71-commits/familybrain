"use client";

import { useId, useMemo, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconCircle } from "@/components/layout/icon-circle";
import { UserAvatar } from "@/components/users/user-avatar";
import { formatMoney } from "@/lib/finance-brain/format";
import { expenseVisualFromLabel } from "@/lib/finance-brain/expense-category";
import type { NamedAmountBucket } from "@/lib/finance-brain/overview-dashboard";
import { cn } from "@/lib/utils";

/** Settle-Up-ähnliche Palette: Grün/Teal/Sand/Schiefer — ohne Lila. */
export const FINANCE_PIE_COLORS = [
  "#3f6b52",
  "#5a8f9c",
  "#c4a35a",
  "#6b7c8f",
  "#8b6b5c",
  "#4a7c6f",
  "#a67c52",
  "#7a8f6b",
  "#5c6b7a",
  "#9a7b5c",
] as const;

export type FinancePieLegendVisual = "swatch" | "category" | "avatar";

type Slice = NamedAmountBucket & {
  color: string;
  startAngle: number;
  endAngle: number;
};

function shortLabel(label: string): string {
  const first = label.trim().split(/\s+/)[0] || label;
  return first.length > 10 ? `${first.slice(0, 9)}…` : first;
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polar(cx, cy, r, endAngle);
  const end = polar(cx, cy, r, startAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}

function buildSlices(buckets: NamedAmountBucket[]): Slice[] {
  const total = buckets.reduce((s, b) => s + b.amountBase, 0);
  if (total <= 0) return [];
  let angle = 0;
  return buckets.map((b, i) => {
    const span = (b.amountBase / total) * 360;
    const startAngle = angle;
    const endAngle = i === buckets.length - 1 ? 360 : angle + span;
    angle = endAngle;
    return {
      ...b,
      color: FINANCE_PIE_COLORS[i % FINANCE_PIE_COLORS.length]!,
      startAngle,
      endAngle,
    };
  });
}

function PieChart({
  slices,
  size = 128,
}: {
  slices: Slice[];
  size?: number;
}) {
  const gradId = useId();
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;

  if (slices.length === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={cx} cy={cy} r={r} fill="#d4d8d6" />
      </svg>
    );
  }

  if (slices.length === 1) {
    const s = slices[0]!;
    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={s.label}
      >
        <circle cx={cx} cy={cy} r={r} fill={s.color} />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#fff"
          fontSize={Math.max(10, size * 0.09)}
          fontWeight={700}
        >
          {shortLabel(s.label)}
        </text>
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Kreisdiagramm"
    >
      <defs>
        <filter id={`${gradId}-soft`} x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow
            dx="0"
            dy="1"
            stdDeviation="1.5"
            floodColor="#14201c"
            floodOpacity="0.12"
          />
        </filter>
      </defs>
      <g filter={`url(#${gradId}-soft)`}>
        {slices.map((s) => {
          const mid = (s.startAngle + s.endAngle) / 2;
          const span = s.endAngle - s.startAngle;
          const labelPos = polar(cx, cy, r * 0.55, mid);
          const showLabel = span >= 28;
          return (
            <g key={s.key}>
              <path
                d={describeArc(cx, cy, r, s.startAngle, s.endAngle)}
                fill={s.color}
                stroke="#fff"
                strokeWidth={1.5}
              />
              {showLabel ? (
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#fff"
                  fontSize={Math.max(9, size * 0.075)}
                  fontWeight={700}
                  style={{ pointerEvents: "none" }}
                >
                  {shortLabel(s.label)}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function LegendMark({
  slice,
  visual,
}: {
  slice: Slice;
  visual: FinancePieLegendVisual;
}) {
  if (visual === "category") {
    const cat = expenseVisualFromLabel(slice.label);
    return (
      <IconCircle
        icon={cat.icon}
        tone={cat.tone}
        size="sm"
        className="shrink-0"
      />
    );
  }
  if (visual === "avatar") {
    return (
      <span className="relative shrink-0">
        <UserAvatar name={slice.label} src={slice.avatarUrl} size="xs" />
        <span
          className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-1 ring-white"
          style={{ backgroundColor: slice.color }}
          aria-hidden
        />
      </span>
    );
  }
  return (
    <span
      className="size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: slice.color }}
      aria-hidden
    />
  );
}

export function FinancePieCard({
  title,
  icon: Icon,
  buckets,
  baseCurrency,
  legendVisual = "swatch",
  emptyText = "Noch keine Ausgaben.",
  headerAction,
}: {
  title: string;
  icon: LucideIcon;
  buckets: NamedAmountBucket[];
  baseCurrency: string;
  legendVisual?: FinancePieLegendVisual;
  emptyText?: string;
  headerAction?: ReactNode;
}) {
  const slices = useMemo(() => buildSlices(buckets), [buckets]);

  return (
    <Card
      size="sm"
      tone="green"
      className="overflow-hidden border-border/60 shadow-[0_4px_16px_rgba(20,32,28,0.05)]"
    >
      <CardHeader
        tone="green"
        className="flex flex-row items-center justify-between gap-2 py-1.5"
      >
        <CardTitle className="flex min-w-0 items-center gap-2 text-[0.9375rem]! text-[var(--brand-finance)]">
          <IconCircle icon={Icon} tone="green" size="sm" />
          <span className="truncate">{title}</span>
        </CardTitle>
        {headerAction}
      </CardHeader>
      <CardContent>
        {slices.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="shrink-0">
              <PieChart slices={slices} size={118} />
            </div>
            <ul className="min-w-0 flex-1 space-y-1.5">
              {slices.map((s) => (
                <li
                  key={s.key}
                  className="flex items-center justify-between gap-2 text-sm leading-snug"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <LegendMark slice={s} visual={legendVisual} />
                    <span className="truncate font-medium">{s.label}</span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums text-muted-foreground"
                    )}
                  >
                    {formatMoney(s.amountBase, baseCurrency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
