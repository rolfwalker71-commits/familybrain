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
  Cake,
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
import type { IcsCalendarType } from "@/lib/calendar/ics-types";

/** Solid accent for left rail (calendar color or kind fallback). */
const KIND_ACCENT_HEX: Record<AgendaKind, string> = {
  invoice: "#0f766e",
  deadline: "#0d9488",
  travel: "#0284c7",
  warranty: "#d97706",
  triage: "#0f766e",
  ledger: "#0f766e",
  hockey: "#e11d48",
  holiday: "#8b5cf6",
  calendar: "#64748b",
};

export function agendaItemAccentColor(item: AgendaItem): string {
  const raw = item.accentColor?.trim();
  if (raw && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return raw;
  if (raw && raw.startsWith("#")) return raw;
  if (raw && !raw.startsWith("var(")) return raw;
  return KIND_ACCENT_HEX[item.kind] || KIND_ACCENT_HEX.calendar;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  if (full.length !== 6) return `rgba(100, 116, 139, ${alpha})`;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return `rgba(100, 116, 139, ${alpha})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Left calendar-color rail with type icon (weather-widget style). */
export function AgendaTypeRail({
  item,
  className,
  iconClassName,
}: {
  item: AgendaItem;
  className?: string;
  iconClassName?: string;
}) {
  const Icon = resolveAgendaItemIcon(item);
  const accent = agendaItemAccentColor(item);
  return (
    <div
      className={cn(
        "flex w-9 shrink-0 flex-col items-center justify-center self-stretch px-1 sm:w-[3.25rem] sm:px-1.5",
        className
      )}
      style={{ backgroundColor: hexToRgba(accent, 0.22) }}
      aria-hidden
    >
      <Icon
        className={cn("size-5 sm:size-6", iconClassName)}
        style={iconClassName ? undefined : { color: accent }}
        strokeWidth={APP_ICON_STROKE}
        absoluteStrokeWidth
      />
    </div>
  );
}

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
  birthday: Cake,
  work: BriefcaseBusiness,
  holiday: Palmtree,
  other: Calendar,
};

export function resolveAgendaItemIcon(item: AgendaItem) {
  if (item.calendarType && CALENDAR_TYPE_ICON[item.calendarType]) {
    return CALENDAR_TYPE_ICON[item.calendarType];
  }
  return KIND_ICON[item.kind];
}

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
          "flex shrink-0 items-center justify-center rounded-full bg-rose-50 text-[11px] font-bold uppercase text-rose-700"
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

function AgendaWeatherLine({ weather }: { weather: AgendaWeatherChip }) {
  return (
    <p className="mt-1 truncate text-[12px] text-muted-foreground">
      <span aria-hidden>{weather.icon}</span>{" "}
      <span className="tabular-nums">{weather.temperatureC}°</span>
      {weather.labelDe?.trim() ? ` · ${weather.labelDe.trim()}` : ""}
    </p>
  );
}

export function AgendaRow({
  item,
  variant = "agenda",
  onOpen,
}: {
  item: AgendaItem;
  /** upcoming: hockey shows date+time / location / Heim|Auswärts on three lines */
  variant?: "agenda" | "upcoming";
  /** When set, click opens detail instead of navigating */
  onOpen?: (item: AgendaItem) => void;
}) {
  const isPaymentPipeline = item.badge === "Zahlung";
  const isHockey = item.kind === "hockey";
  const hasLogos = Boolean(item.logos?.left || item.logos?.right);
  const upcomingHockey = isHockey && hasLogos && variant === "upcoming";
  const weather = item.weather || null;
  const accent = agendaItemAccentColor(item);

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
        "overflow-hidden rounded-xl border border-border/60 bg-card shadow-[0_2px_10px_rgba(20,32,28,0.04)]",
        isPaymentPipeline && "border-sky-300/80"
      )}
    >
      <div className="flex items-stretch">
        <AgendaTypeRail
          item={item}
          className={cn(isPaymentPipeline && "bg-sky-100/80")}
          iconClassName={isPaymentPipeline ? "text-sky-800" : undefined}
        />
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2.5 sm:gap-3 sm:px-3",
            isPaymentPipeline && "bg-sky-50/40"
          )}
        >
          {isHockey && hasLogos ? (
            <div className="flex shrink-0 items-center gap-1" aria-hidden>
              <TeamLogo
                label={item.logos?.leftLabel || "Heim"}
                src={item.logos?.left}
                size="md"
              />
              <span className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                <p className="truncate text-[15px] font-black text-foreground">
                  {upcomingLine1}
                </p>
                {upcomingLine2 ? (
                  <p className="truncate text-[13px] text-muted-foreground">
                    {upcomingLine2}
                  </p>
                ) : null}
                <p className="truncate text-[13px] text-muted-foreground">
                  {upcomingLine3}
                </p>
              </>
            ) : isHockey && hasLogos ? (
              <>
                {item.subtitle ? (
                  <p className="truncate text-[15px] font-black text-foreground">
                    {item.subtitle}
                  </p>
                ) : null}
                <p className="truncate text-[13px] text-muted-foreground">
                  {item.title}
                </p>
              </>
            ) : (
              <>
                <p className="truncate text-[15px] font-black">{item.title}</p>
                {item.subtitle ? (
                  <p className="truncate text-[13px] text-muted-foreground">
                    {item.subtitle}
                  </p>
                ) : null}
                {item.kind === "calendar" && item.time ? (
                  <p className="truncate text-[13px] text-muted-foreground tabular-nums">
                    {item.time}
                  </p>
                ) : null}
              </>
            )}
            {weather ? <AgendaWeatherLine weather={weather} /> : null}
            {isPaymentPipeline ? (
              <p className="mt-1 text-[12px] font-medium text-sky-800">
                Zahlung geplant — noch in der Pipeline
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {item.amount != null ? (
              <span className="text-[15px] font-semibold tabular-nums">
                {formatCHF(item.amount, item.currency || "CHF")}
              </span>
            ) : null}
            <Badge
              variant="secondary"
              className={cn(
                "text-[11px]",
                isPaymentPipeline && "bg-sky-100 text-sky-900",
                isHockey && "bg-rose-50 text-rose-800",
                item.kind === "holiday" && "bg-violet-50 text-violet-900"
              )}
              style={
                item.accentColor && !isHockey
                  ? {
                      backgroundColor: hexToRgba(accent, 0.12),
                      color: accent,
                    }
                  : undefined
              }
            >
              {item.badge}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );

  const linkHref =
    item.href ||
    (item.documentId != null ? `/documents/${item.documentId}` : null);
  if (onOpen) {
    return (
      <button
        type="button"
        className="block w-full cursor-pointer text-left"
        onClick={() => onOpen(item)}
      >
        {inner}
      </button>
    );
  }
  if (linkHref) {
    return (
      <Link href={linkHref} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}
