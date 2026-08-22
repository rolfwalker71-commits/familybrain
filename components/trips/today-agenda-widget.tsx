"use client";

import type { LucideIcon } from "lucide-react";
import {
  BedDouble,
  Bus,
  Car,
  MapPin,
  Plane,
  Ship,
  Ticket,
  TrainFront,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { coerceTripEventType } from "@/lib/trips/constants";
import { toTimeInputValue } from "@/lib/utils/dates";

export type TodayAgendaEvent = {
  id: number;
  event_type: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  provider: string | null;
  flight_number: string | null;
  airline: string | null;
  booking_reference: string | null;
  documents?: unknown[] | null;
  attachments?: unknown[] | null;
};

const AGENDA_ICONS: Record<string, LucideIcon> = {
  Flug: Plane,
  Zugreisen: TrainFront,
  Bahn: TrainFront,
  Mietauto: Car,
  Mietwagen: Car,
  Transfer: Car,
  Hotel: BedDouble,
  Unterkunft: BedDouble,
  Kreuzfahrt: Ship,
  Ausflug: MapPin,
  Aktivität: MapPin,
  Sonstiges: Ticket,
  Bus: Bus,
};

function agendaIcon(type: string): LucideIcon {
  return AGENDA_ICONS[type] || MapPin;
}

function formatDayHeadingDe(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("de-CH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
}

function eventIsBooked(event: TodayAgendaEvent): boolean {
  const docCount =
    (event.documents?.length || 0) + (event.attachments?.length || 0);
  return Boolean(event.booking_reference?.trim()) || docCount > 0;
}

function agendaSubtitle(event: TodayAgendaEvent): string | null {
  const parts: string[] = [];
  if (event.flight_number?.trim()) parts.push(event.flight_number.trim());
  const carrier = (event.airline || event.provider || "").trim();
  if (carrier && !parts.some((p) => p.toLowerCase() === carrier.toLowerCase())) {
    parts.push(carrier);
  }
  if (parts.length === 0) {
    const type = coerceTripEventType(event.event_type);
    if (type) parts.push(type);
  }
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Compact “Was steht heute an” day timeline — mockup: dashed rail, time, pill cards.
 */
export function TodayAgendaWidget({
  iso,
  isToday,
  events,
  onSelectEvent,
  className,
}: {
  iso: string;
  isToday: boolean;
  events: TodayAgendaEvent[];
  onSelectEvent?: (eventId: number, iso: string) => void;
  className?: string;
}) {
  if (events.length === 0) return null;

  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-card px-3 py-3 sm:px-4 sm:py-3.5",
        className
      )}
      aria-label={isToday ? "Was steht heute an" : "Nächster Reisetag"}
    >
      <div className="mb-3">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
          {isToday ? "Was steht heute an" : "Was steht als Nächstes an"}
        </p>
        <h2 className="mt-0.5 text-base font-bold tracking-tight text-foreground sm:text-lg">
          {formatDayHeadingDe(iso)}
        </h2>
      </div>

      <ol className="relative m-0 list-none space-y-2.5 p-0">
        {events.map((event, index) => {
          const type = coerceTripEventType(event.event_type);
          const Icon = agendaIcon(type);
          const time = toTimeInputValue(event.start_time);
          const subtitle = agendaSubtitle(event);
          const booked = eventIsBooked(event);
          const isLast = index === events.length - 1;

          return (
            <li key={event.id} className="relative flex items-stretch gap-2 sm:gap-2.5">
              <div className="relative flex w-3 shrink-0 flex-col items-center">
                <span
                  className="relative z-10 mt-3.5 size-2.5 shrink-0 rounded-full border-2 border-foreground/55 bg-card"
                  aria-hidden
                />
                {!isLast ? (
                  <span
                    className="absolute top-6 bottom-[-0.65rem] left-1/2 w-px -translate-x-1/2 border-l border-dashed border-border"
                    aria-hidden
                  />
                ) : null}
              </div>

              <span className="w-10 shrink-0 pt-3 text-[0.6875rem] font-semibold tabular-nums text-foreground/80 sm:w-11 sm:text-xs">
                {time || "—"}
              </span>

              <Button
                type="button"
                variant="outline"
                className="h-auto min-w-0 flex-1 items-center justify-start gap-2.5 rounded-2xl border-border bg-card px-2.5 py-2 text-left font-normal shadow-none hover:bg-muted/40 sm:gap-3 sm:px-3 sm:py-2.5"
                onClick={() => onSelectEvent?.(event.id, iso)}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground sm:size-10">
                  <Icon className="size-4 sm:size-[1.15rem]" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-bold leading-snug tracking-tight text-foreground sm:text-[0.9375rem]">
                    {event.title}
                  </span>
                  {subtitle ? (
                    <span className="mt-0.5 block truncate text-[0.6875rem] text-muted-foreground sm:text-xs">
                      {subtitle}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-semibold",
                    booked
                      ? "bg-[var(--brand-finance-soft)] text-[var(--brand-finance)]"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {booked ? "Gebucht" : "Geplant"}
                </span>
              </Button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Pick today&apos;s events, or the next day that still has events. */
export function pickAgendaDay<T extends { start_date: string | null; start_time: string | null }>(
  events: T[],
  parseIso: (raw: string | null | undefined) => string | null
): { iso: string; isToday: boolean; events: T[] } | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  const byDay = new Map<string, T[]>();
  for (const event of events) {
    const iso = parseIso(event.start_date);
    if (!iso) continue;
    const list = byDay.get(iso) || [];
    list.push(event);
    byDay.set(iso, list);
  }
  if (byDay.size === 0) return null;

  const sortDay = (list: T[]) =>
    [...list].sort((a, b) =>
      (toTimeInputValue(a.start_time) || "").localeCompare(
        toTimeInputValue(b.start_time) || ""
      )
    );

  if (byDay.has(todayIso)) {
    return { iso: todayIso, isToday: true, events: sortDay(byDay.get(todayIso)!) };
  }

  const upcoming = [...byDay.keys()].filter((iso) => iso >= todayIso).sort();
  if (upcoming[0]) {
    return {
      iso: upcoming[0],
      isToday: false,
      events: sortDay(byDay.get(upcoming[0])!),
    };
  }

  const past = [...byDay.keys()].sort();
  const last = past[past.length - 1];
  if (!last) return null;
  return { iso: last, isToday: false, events: sortDay(byDay.get(last)!) };
}
