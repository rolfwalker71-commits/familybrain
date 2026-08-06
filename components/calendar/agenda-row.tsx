"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  FileText,
  Mail,
  Briefcase,
  Shield,
  Clock3,
  HandCoins,
  Goal,
  PartyPopper,
  GraduationCap,
  Trash2,
  Church,
  Dumbbell,
  Heart,
  BriefcaseBusiness,
  Palmtree,
  Calendar,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCHF } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import type {
  AgendaItem,
  AgendaKind,
  AgendaWeatherChip,
} from "@/lib/dashboard/overview";
import type { IcsCalendarType } from "@/lib/calendar/ics-calendars";

const KIND_ACCENT: Record<AgendaKind, string> = {
  invoice: "border-l-[var(--brand-finance)]",
  deadline: "border-l-teal-600",
  travel: "border-l-sky-600",
  warranty: "border-l-amber-600",
  triage: "border-l-[var(--brand-docs)]",
  ledger: "border-l-[var(--brand-finance)]",
  hockey: "border-l-rose-600",
  holiday: "border-l-violet-600",
  calendar: "border-l-slate-500",
};

const KIND_ICON: Record<AgendaKind, typeof FileText> = {
  invoice: FileText,
  deadline: Clock3,
  travel: Briefcase,
  warranty: Shield,
  triage: Mail,
  ledger: HandCoins,
  hockey: Goal,
  holiday: PartyPopper,
  calendar: CalendarDays,
};

const CALENDAR_TYPE_ICON: Record<IcsCalendarType, typeof FileText> = {
  hockey: Goal,
  school: GraduationCap,
  waste: Trash2,
  church: Church,
  sports: Dumbbell,
  family: Heart,
  work: BriefcaseBusiness,
  holiday: Palmtree,
  other: Calendar,
};

export function TeamLogo({
  label,
  src,
  size = "sm",
}: {
  label: string;
  src: string | null | undefined;
  size?: "sm" | "md" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const box =
    size === "lg" ? "size-16" : size === "md" ? "size-11" : "size-8";
  if (!src || failed) {
    return (
      <span
        className={cn(
          box,
          "flex shrink-0 items-center justify-center rounded-full bg-rose-50 text-[10px] font-bold uppercase text-rose-700"
        )}
        aria-hidden
        title={label}
      >
        {label.slice(0, 2)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={label}
      title={label}
      className={cn(box, "shrink-0 rounded-full bg-white object-contain p-0.5")}
      onError={() => setFailed(true)}
    />
  );
}

export function weekdayLabel(iso: string): string {
  try {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString("de-CH", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

function WeatherChip({ weather }: { weather: AgendaWeatherChip }) {
  return (
    <div
      className="pointer-events-none absolute left-2 top-0 z-10 flex -translate-y-1/2 items-center gap-1.5 rounded-full border border-sky-200/90 bg-sky-50 py-0.5 pl-1.5 pr-2.5 shadow-sm ring-2 ring-white"
      title={`${weather.labelDe} · ${weather.placeLabel}`}
    >
      <span className="flex items-center gap-1">
        <span className="text-sm leading-none" aria-hidden>
          {weather.icon}
        </span>
        <span className="text-xs font-bold tabular-nums text-sky-950">
          {weather.temperatureC}°
        </span>
      </span>
      <span className="h-3 w-px shrink-0 bg-sky-200/90" aria-hidden />
      <span className="max-w-[7rem] truncate text-[11px] font-medium text-sky-900/85">
        {weather.placeLabel}
      </span>
    </div>
  );
}

export function AgendaRow({
  item,
  variant = "agenda",
}: {
  item: AgendaItem;
  /** upcoming: hockey shows date+time / location / Heim|Auswärts on three lines */
  variant?: "agenda" | "upcoming";
}) {
  const Icon =
    item.calendarType && CALENDAR_TYPE_ICON[item.calendarType]
      ? CALENDAR_TYPE_ICON[item.calendarType]
      : KIND_ICON[item.kind];
  const isPaymentPipeline = item.badge === "Zahlung";
  const isHockey = item.kind === "hockey";
  const hasLogos = Boolean(item.logos?.left || item.logos?.right);
  const upcomingHockey = isHockey && hasLogos && variant === "upcoming";
  const weather = item.weather || null;
  const accentStyle = item.accentColor
    ? { borderLeftColor: item.accentColor }
    : undefined;

  let hockeyDateLabel = item.date;
  try {
    hockeyDateLabel = new Date(`${item.date}T12:00:00`).toLocaleDateString(
      "de-CH",
      {
        weekday: "short",
        day: "numeric",
        month: "short",
      }
    );
  } catch {
    /* keep iso */
  }

  const upcomingLine1 = [hockeyDateLabel, item.time, item.score]
    .filter(Boolean)
    .join(" · ");
  const upcomingLine2 = item.location || null;
  const upcomingLine3 = item.title;

  const inner = (
    <div
      className={cn(
        "relative flex items-center gap-3 rounded-xl border border-border/60 border-l-4 bg-card px-3 py-2.5 shadow-[0_2px_10px_rgba(20,32,28,0.04)]",
        weather && "mt-3 pt-4",
        isPaymentPipeline
          ? "border-l-sky-500 bg-sky-50/40"
          : !item.accentColor && KIND_ACCENT[item.kind]
      )}
      style={isPaymentPipeline ? undefined : accentStyle}
    >
      {weather ? <WeatherChip weather={weather} /> : null}
      <Icon
        className="size-8 shrink-0 text-muted-foreground"
        strokeWidth={APP_ICON_STROKE}
        absoluteStrokeWidth
        aria-hidden
      />
      {isHockey && hasLogos ? (
        <div className="flex shrink-0 items-center gap-1" aria-hidden>
          <TeamLogo
            label={item.logos?.leftLabel || "Heim"}
            src={item.logos?.left}
            size="md"
          />
          <span className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            vs.
          </span>
          <TeamLogo
            label={item.logos?.rightLabel || "Gast"}
            src={item.logos?.right}
            size="md"
          />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        {upcomingHockey ? (
          <>
            <p className="truncate text-sm font-medium text-foreground">
              {upcomingLine1}
            </p>
            {upcomingLine2 ? (
              <p className="truncate text-xs text-muted-foreground">
                {upcomingLine2}
              </p>
            ) : null}
            <p className="truncate text-xs text-muted-foreground">
              {upcomingLine3}
            </p>
          </>
        ) : isHockey && hasLogos ? (
          <>
            {item.subtitle ? (
              <p className="truncate text-sm font-medium text-foreground">
                {item.subtitle}
              </p>
            ) : null}
            <p className="truncate text-xs text-muted-foreground">{item.title}</p>
          </>
        ) : (
          <>
            <p className="truncate text-sm font-medium">{item.title}</p>
            {item.subtitle ? (
              <p className="truncate text-xs text-muted-foreground">
                {item.subtitle}
              </p>
            ) : null}
            {item.kind === "calendar" && item.time ? (
              <p className="truncate text-xs text-muted-foreground tabular-nums">
                {item.time}
              </p>
            ) : null}
          </>
        )}
        {isPaymentPipeline ? (
          <p className="mt-1 text-[11px] font-medium text-sky-800">
            Zahlung geplant — noch in der Pipeline
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {item.amount != null ? (
          <span className="text-sm font-semibold tabular-nums">
            {formatCHF(item.amount, item.currency || "CHF")}
          </span>
        ) : null}
        <Badge
          variant="secondary"
          className={cn(
            "text-[10px]",
            isPaymentPipeline && "bg-sky-100 text-sky-900",
            isHockey && "bg-rose-50 text-rose-800",
            item.kind === "holiday" && "bg-violet-50 text-violet-900"
          )}
          style={
            item.accentColor && !isHockey
              ? {
                  backgroundColor: `${item.accentColor}18`,
                  color: item.accentColor,
                }
              : undefined
          }
        >
          {item.badge}
        </Badge>
      </div>
    </div>
  );

  const linkHref =
    item.href ||
    (item.documentId != null ? `/documents/${item.documentId}` : null);
  if (linkHref) {
    return (
      <Link href={linkHref} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}
