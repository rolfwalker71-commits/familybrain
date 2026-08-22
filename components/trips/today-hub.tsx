"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckSquare,
  FileText,
  Luggage,
  ArrowRight,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  TodayAgendaWidget,
  type TodayAgendaEvent,
} from "@/components/trips/today-agenda-widget";
import { cn } from "@/lib/utils";
import { toSwissDate } from "@/lib/utils/dates";

type AgendaDay = {
  iso: string;
  isToday: boolean;
  events: Array<
    TodayAgendaEvent & {
      trip_id: number;
      trip_title: string;
    }
  >;
};

type AgendaPayload = {
  activeTrip: {
    id: number;
    title: string;
    status: string;
    start_date: string | null;
    end_date: string | null;
    destination: string | null;
    cover_url?: string | null;
  } | null;
  days: AgendaDay[];
};

const STATUS_LABEL: Record<string, string> = {
  planned: "Geplant",
  active: "Unterwegs",
  done: "Abgeschlossen",
  cancelled: "Abgesagt",
};

function eventHref(tripId: number, eventId: number) {
  return `/trips/${tripId}?event=${eventId}`;
}

export function TodayHub() {
  const [data, setData] = useState<AgendaPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/home/agenda");
      const text = await res.text();
      let json: { error?: string } & Partial<AgendaPayload> = {};
      try {
        json = text ? (JSON.parse(text) as typeof json) : {};
      } catch {
        throw new Error(
          res.ok
            ? "Ungültige Antwort der Heute-API"
            : `Heute-API nicht erreichbar (${res.status}). App neu starten/deployen?`
        );
      }
      if (!res.ok) {
        throw new Error(json.error || `Laden fehlgeschlagen (${res.status})`);
      }
      setData(json as AgendaPayload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const nextEvent = useMemo(() => {
    if (!data) return null;
    for (const day of data.days) {
      if (day.events[0]) {
        return { day, event: day.events[0] };
      }
    }
    return null;
  }, [data]);

  if (loading && !data) {
    return (
      <Card className="border-border/70">
        <CardContent className="p-4 text-sm text-muted-foreground">
          Lade Heute-Übersicht…
        </CardContent>
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card className="border-border/70">
        <CardContent className="space-y-2 p-4 text-sm">
          <p className="font-medium text-foreground">
            Heute-Übersicht konnte nicht geladen werden.
          </p>
          <p className="text-muted-foreground">{error}</p>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-xs font-medium text-[var(--brand-finance)]"
            onClick={() => void load()}
          >
            Erneut versuchen
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const hasAgenda = data.days.some((d) => d.events.length > 0);

  if (!data.activeTrip && !hasAgenda) {
    return (
      <Card className="border-border/70 bg-muted/20">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <CalendarDays className="size-5 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              Nichts Dringendes heute
            </p>
            <p className="text-xs text-muted-foreground">
              Sobald eine Reise aktiv ist oder Termine anstehen, erscheinen sie
              hier.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {nextEvent ? (
        <Card className="border-[var(--brand-finance)]/35 bg-[var(--brand-finance-soft)]/40">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--brand-finance)]">
                Nächster Termin
                {nextEvent.day.isToday ? " · heute" : ""}
              </p>
              <p className="break-words text-base font-bold leading-snug tracking-tight">
                {nextEvent.event.title}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[
                  nextEvent.event.trip_title,
                  nextEvent.event.start_time,
                  toSwissDate(nextEvent.day.iso),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <Link
              href={eventHref(nextEvent.event.trip_id, nextEvent.event.id)}
              className={cn(
                buttonVariants({ size: "sm" }),
                "gap-1.5 bg-[var(--brand-finance)] text-white hover:bg-[var(--brand-finance)]/90"
              )}
            >
              Öffnen
              <ArrowRight className="size-3.5" />
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {data.activeTrip ? (
        <Card className="overflow-hidden border-border/70 shadow-[0_2px_4px_rgba(20,32,28,0.06),0_10px_28px_rgba(20,32,28,0.08)]">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-finance-soft)] text-[var(--brand-finance)]">
                <Luggage className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  Aktuelle Reise
                </p>
                <Link
                  href={`/trips/${data.activeTrip.id}`}
                  className="block break-words text-base font-bold leading-snug tracking-tight text-foreground underline-offset-2 hover:underline"
                >
                  {data.activeTrip.title}
                </Link>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[
                    data.activeTrip.destination,
                    STATUS_LABEL[data.activeTrip.status] ||
                      data.activeTrip.status,
                    data.activeTrip.start_date
                      ? toSwissDate(data.activeTrip.start_date)
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Link
                href={`/trips/${data.activeTrip.id}`}
                className={cn(
                  buttonVariants({ size: "sm", variant: "outline" })
                )}
              >
                Öffnen
              </Link>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
              <p className="mb-1.5 flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
                <CheckSquare className="size-3.5" />
                Reise-Check
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li className="flex flex-wrap items-center justify-between gap-2">
                  <span>Tickets & Buchungen im Ablauf prüfen</span>
                  <Link
                    href={`/trips/${data.activeTrip.id}`}
                    className="font-medium text-[var(--brand-finance)] underline-offset-2 hover:underline"
                  >
                    Ablauf
                  </Link>
                </li>
                <li className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1">
                    <FileText className="size-3" />
                    Belege offline griffbereit?
                  </span>
                  <Link
                    href={`/trips/${data.activeTrip.id}?tab=dokumente`}
                    className="font-medium text-[var(--brand-finance)] underline-offset-2 hover:underline"
                  >
                    Dokumente
                  </Link>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {data.days.map((day) => (
        <TodayAgendaWidget
          key={day.iso}
          iso={day.iso}
          isToday={day.isToday}
          events={day.events}
          onSelectEvent={(eventId) => {
            const match = day.events.find((e) => e.id === eventId);
            if (!match) return;
            window.location.assign(eventHref(match.trip_id, eventId));
          }}
        />
      ))}
    </div>
  );
}
