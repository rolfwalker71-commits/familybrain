"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Car,
  Clock3,
  MapPin,
  Video,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  AgendaTypeRail,
  weekdayLabel,
} from "@/components/calendar/agenda-row";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { ICS_TYPE_META } from "@/lib/calendar/ics-types";
import type { AgendaItem } from "@/lib/dashboard/overview";
import { cn } from "@/lib/utils";

function stripIcsDescription(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  let t = raw
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  if (!t) return null;
  return t.slice(0, 4000);
}

function durationLabel(item: AgendaItem): string | null {
  if (!item.time || !item.endTime) return null;
  const [sh, sm] = item.time.split(":").map(Number);
  const [eh, em] = item.endTime.split(":").map(Number);
  if (![sh, sm, eh, em].every((n) => Number.isFinite(n))) return null;
  let mins = eh! * 60 + em! - (sh! * 60 + sm!);
  if (mins <= 0) mins += 24 * 60;
  if (mins < 60) return `${mins} Min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} Std` : `${h} Std ${m} Min`;
}

function typeLabel(item: AgendaItem): string {
  if (item.calendarType && ICS_TYPE_META[item.calendarType]) {
    return ICS_TYPE_META[item.calendarType].label;
  }
  return item.badge || "Termin";
}

import { TripMap } from "@/components/trips/trip-map";
import { isPhysicalAgendaLocation } from "@/lib/dashboard/agenda-location";

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="text-[15px] text-foreground">{children}</div>
    </div>
  );
}

export function AgendaEventDialog({
  item,
  open,
  onOpenChange,
  calendarHref = "/calendar",
}: {
  item: AgendaItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calendarHref?: string;
}) {
  const description = item ? stripIcsDescription(item.description) : null;
  const duration = item ? durationLabel(item) : null;
  const when = item
    ? [
        weekdayLabel(item.date),
        item.time
          ? item.endTime
            ? `${item.time} – ${item.endTime}`
            : item.time
          : "Ganztägig",
      ].join(" · ")
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] w-[min(96vw,28rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        {item ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-stretch border-b border-border/60">
              <AgendaTypeRail item={item} className="w-14" />
              <DialogHeader className="min-w-0 flex-1 space-y-1 px-4 py-3 text-left">
                <DialogTitle className="pr-8 text-[16px] font-black leading-snug">
                  {item.title}
                </DialogTitle>
                <DialogDescription className="text-[13px]">
                  {when}
                </DialogDescription>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Badge variant="secondary" className="text-[11px]">
                    {typeLabel(item)}
                  </Badge>
                  {item.calendarType && item.badge !== typeLabel(item) ? (
                    <Badge variant="outline" className="text-[11px]">
                      {item.badge}
                    </Badge>
                  ) : null}
                </div>
              </DialogHeader>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
              {item.location ? (
                <DetailRow label="Ort">
                  <p className="flex items-start gap-1.5">
                    <MapPin
                      className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                      strokeWidth={APP_ICON_STROKE}
                      absoluteStrokeWidth
                      aria-hidden
                    />
                    <span>{item.location}</span>
                  </p>
                </DetailRow>
              ) : null}

              {item.coords && isPhysicalAgendaLocation(item.location) ? (
                <TripMap
                  points={[
                    {
                      lat: item.coords.lat,
                      lon: item.coords.lon,
                      label: item.coords.label,
                    },
                  ]}
                  heightClassName="h-36"
                  className="rounded-lg"
                  compact
                />
              ) : null}

              {item.time || duration ? (
                <DetailRow label="Zeit">
                  <p className="flex items-center gap-1.5">
                    <Clock3
                      className="size-3.5 shrink-0 text-muted-foreground"
                      strokeWidth={APP_ICON_STROKE}
                      absoluteStrokeWidth
                      aria-hidden
                    />
                    <span>
                      {[
                        item.time && item.endTime
                          ? `${item.time} – ${item.endTime}`
                          : item.time || "Ganztägig",
                        duration ? `(${duration})` : null,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </span>
                  </p>
                </DetailRow>
              ) : null}

              {item.driveLabel ? (
                <DetailRow label="Anfahrt">
                  <p className="flex items-center gap-1.5">
                    <Car
                      className="size-3.5 shrink-0 text-muted-foreground"
                      strokeWidth={APP_ICON_STROKE}
                      absoluteStrokeWidth
                      aria-hidden
                    />
                    {item.driveLabel}
                  </p>
                </DetailRow>
              ) : null}

              {item.weather ? (
                <DetailRow label="Wetter">
                  <p>
                    {item.weather.icon} {item.weather.temperatureC}°
                    {item.weather.labelDe
                      ? ` · ${item.weather.labelDe}`
                      : ""}
                  </p>
                </DetailRow>
              ) : null}

              {item.score ? (
                <DetailRow label="Ergebnis">
                  <p>
                    {item.score}
                    {item.scorers?.length
                      ? ` · ${item.scorers.slice(0, 6).join(", ")}`
                      : ""}
                  </p>
                </DetailRow>
              ) : null}

              {description ? (
                <DetailRow label="Notizen">
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/90">
                    {description}
                  </p>
                </DetailRow>
              ) : null}

              {item.subtitle &&
              item.subtitle !== item.location &&
              item.subtitle !== item.title ? (
                <DetailRow label="Details">
                  <p>{item.subtitle}</p>
                </DetailRow>
              ) : null}

              {!description &&
              !item.location &&
              !item.weather &&
              !item.driveLabel &&
              !item.score ? (
                <p className="text-[13px] text-muted-foreground">
                  Keine weiteren Details in der Quelle.
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border/60 bg-muted/30 px-4 py-3">
              {item.meetUrl ? (
                <a
                  href={item.meetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "gap-1.5"
                  )}
                >
                  <Video className="size-3.5" aria-hidden />
                  Meet
                </a>
              ) : null}
              {item.mapsUrl ? (
                <a
                  href={item.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "gap-1.5"
                  )}
                >
                  <MapPin className="size-3.5" aria-hidden />
                  Route
                </a>
              ) : null}
              <Link
                href={calendarHref}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "gap-1.5"
                )}
              >
                <CalendarDays className="size-3.5" aria-hidden />
                Alle Termine
              </Link>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
