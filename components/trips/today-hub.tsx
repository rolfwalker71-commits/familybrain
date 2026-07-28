"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Luggage, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  TodayAgendaWidget,
  type TodayAgendaEvent,
} from "@/components/trips/today-agenda-widget";
import { cn } from "@/lib/utils";
import { formatCHF } from "@/lib/utils/format";
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

type DueInvoice = {
  id: number;
  vendor: string | null;
  amount: number | null;
  currency: string | null;
  due_date: string;
  description: string | null;
  document_local_id: number;
  document_title: string | null;
  overdue: boolean;
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
  dueInvoices: DueInvoice[];
};

const STATUS_LABEL: Record<string, string> = {
  planned: "Geplant",
  active: "Unterwegs",
  done: "Abgeschlossen",
  cancelled: "Abgesagt",
};

export function TodayHub({ isAdmin }: { isAdmin: boolean }) {
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
          <button
            type="button"
            className="text-xs font-medium text-[var(--brand-finance)] underline-offset-2 hover:underline"
            onClick={() => void load()}
          >
            Erneut versuchen
          </button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const hasAgenda = data.days.some((d) => d.events.length > 0);
  const hasDue = isAdmin && data.dueInvoices.length > 0;

  if (!data.activeTrip && !hasAgenda && !hasDue) {
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
      {data.activeTrip ? (
        <Card className="overflow-hidden border-border/70 shadow-[0_2px_4px_rgba(20,32,28,0.06),0_10px_28px_rgba(20,32,28,0.08)]">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-finance-soft)] text-[var(--brand-finance)]">
              <Luggage className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Aktuelle Reise
              </p>
              <Link
                href={`/trips/${data.activeTrip.id}`}
                className="block truncate text-base font-bold tracking-tight text-foreground underline-offset-2 hover:underline"
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
              className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
            >
              Öffnen
            </Link>
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
            window.location.assign(
              `/trips/${match.trip_id}?event=${eventId}`
            );
          }}
        />
      ))}

      {hasDue ? (
        <Card className="border-border/70">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Receipt className="size-4 text-[var(--brand-finance)]" />
              <p className="text-sm font-semibold text-foreground">
                Fällige Rechnungen
              </p>
              <Link
                href="/finance"
                className="ml-auto text-xs font-medium text-[var(--brand-finance)] underline-offset-2 hover:underline"
              >
                Finanzen
              </Link>
            </div>
            <ul className="space-y-2">
              {data.dueInvoices.map((inv) => (
                <li key={inv.id}>
                  <Link
                    href={`/documents/${inv.document_local_id}`}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {inv.vendor ||
                          inv.document_title ||
                          inv.description ||
                          "Rechnung"}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Fällig {toSwissDate(inv.due_date)}
                        {inv.overdue ? " · überfällig" : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {inv.amount != null ? (
                        <span className="tabular-nums text-xs font-semibold">
                          {inv.currency === "CHF" || !inv.currency
                            ? formatCHF(inv.amount)
                            : `${inv.amount.toFixed(2)} ${inv.currency}`}
                        </span>
                      ) : null}
                      {inv.overdue ? (
                        <Badge
                          variant="secondary"
                          className="bg-amber-100 text-[10px] text-amber-900"
                        >
                          Überfällig
                        </Badge>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
