"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-primitives";
import { pageVisuals } from "@/components/layout/icon-circle";
import { AgendaRow, weekdayLabel } from "@/components/calendar/agenda-row";
import { AgendaEventDialog } from "@/components/calendar/agenda-event-dialog";
import { cn } from "@/lib/utils";
import { toSwissDate } from "@/lib/utils/dates";
import type { AgendaItem } from "@/lib/dashboard/overview";
import type {
  CalendarAgendaRange,
  CalendarSource,
} from "@/lib/calendar/agenda-feed";
import type { AgendaPlaceEnrichment } from "@/lib/dashboard/agenda-weather";

const RANGES: { id: CalendarAgendaRange; label: string }[] = [
  { id: "week", label: "Woche" },
  { id: "14d", label: "14 Tage" },
];

function AgendaSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Lade Termine">
      {[0, 1, 2].map((day) => (
        <div key={day} className="space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="space-y-2">
            {[0, 1].map((row) => (
              <div
                key={row}
                className="h-14 animate-pulse rounded-xl bg-muted/80"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CalendarPageClient() {
  const [range, setRange] = useState<CalendarAgendaRange>("week");
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventDetail, setEventDetail] = useState<AgendaItem | null>(null);
  const enrichGen = useRef(0);

  const enrichItems = useCallback(async (agendaItems: AgendaItem[]) => {
    const payload = agendaItems
      .filter((i) => (i.location || "").trim().length >= 3)
      .map((i) => ({
        id: i.id,
        date: i.date,
        location: i.location || null,
      }));
    if (payload.length === 0) return;

    const gen = ++enrichGen.current;
    setEnriching(true);
    try {
      const res = await fetch("/api/calendar/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload }),
      });
      const data = await res.json();
      if (!res.ok) return;
      if (gen !== enrichGen.current) return;
      const byId = (data.byId || {}) as Record<string, AgendaPlaceEnrichment>;
      setItems((prev) =>
        prev.map((item) => {
          const e = byId[item.id];
          if (!e) return item;
          return {
            ...item,
            weather: e.weather,
            coords: e.coords,
            driveMinutes: e.driveMinutes,
            driveLabel: e.driveLabel,
            mapsUrl: e.mapsUrl,
          };
        })
      );
    } catch {
      /* keep list without enrichment */
    } finally {
      if (gen === enrichGen.current) setEnriching(false);
    }
  }, []);

  const loadAgenda = useCallback(
    async (sourceFilter: Set<string> | null) => {
      setLoading(true);
      setError(null);
      enrichGen.current += 1;
      try {
        const params = new URLSearchParams({ range });
        if (sourceFilter !== null) {
          params.set("sources", [...sourceFilter].join(","));
        }
        const res = await fetch(`/api/calendar/agenda?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Laden fehlgeschlagen");
        const nextItems = (data.items || []) as AgendaItem[];
        setItems(nextItems);
        setSources(data.sources || []);
        setRangeStart(data.rangeStart || "");
        setRangeEnd(data.rangeEnd || "");
        if (sourceFilter === null && Array.isArray(data.sources)) {
          // Default selection — do not re-fetch (avoids double pipeline)
          setSelected(
            new Set(
              (data.sources as CalendarSource[])
                .filter((s) => s.enabled)
                .map((s) => s.id)
            )
          );
        }
        void enrichItems(nextItems);
      } catch (err) {
        setItems([]);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [range, enrichItems]
  );

  useEffect(() => {
    // Range change: reload all enabled sources (or keep filter if already set)
    void loadAgenda(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when range changes; selected toggles call loadAgenda explicitly
  }, [range]);

  const grouped = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    for (const item of items) {
      const list = map.get(item.date) || [];
      list.push(item);
      map.set(item.date, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  function toggleSource(id: string) {
    setSelected((prev) => {
      const base =
        prev ??
        new Set(sources.filter((s) => s.enabled).map((s) => s.id));
      const next = new Set(base);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      void loadAgenda(next);
      return next;
    });
  }

  const activeSelected = selected;

  return (
    <div className="min-w-0 space-y-5 pb-8">
      <PageHeader
        title="Kalender / Termine"
        description="Deine ICS-Kalender, Feiertage und Fristen — gefiltert nach Quelle."
        icon={pageVisuals.calendar.icon}
        tone={pageVisuals.calendar.tone}
        titleClassName="text-[25px] font-black tracking-tight sm:text-[31px]"
        descriptionClassName="text-[15px]"
        actions={
          <div className="flex flex-wrap gap-1.5">
            {RANGES.map((r) => (
              <Button
                key={r.id}
                type="button"
                size="sm"
                variant={range === r.id ? "default" : "outline"}
                className={cn(
                  range === r.id &&
                    "bg-[var(--brand-docs)] text-white hover:bg-[var(--brand-docs)]/90"
                )}
                onClick={() => setRange(r.id)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        }
      />

      <p className="text-[13px] text-muted-foreground">
        {rangeStart && rangeEnd
          ? `${toSwissDate(rangeStart)} – ${toSwissDate(rangeEnd)}`
          : "…"}
        <Link
          href="/account"
          className="ml-3 font-medium text-[var(--brand-docs)] underline-offset-2 hover:underline"
        >
          Kalender verwalten →
        </Link>
        {enriching ? (
          <span className="ml-3 text-muted-foreground">Wetter/Fahrzeit…</span>
        ) : null}
      </p>

      {sources.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {sources.map((s) => {
            const on = activeSelected?.has(s.id) ?? s.enabled;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleSource(s.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[15px] transition-colors",
                  on
                    ? "border-border/80 bg-card shadow-sm"
                    : "border-transparent bg-muted/50 text-muted-foreground line-through opacity-70"
                )}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                  aria-hidden
                />
                {s.name}
                {!s.enabled && s.type !== "holiday" && s.type !== "deadline" ? (
                  <span className="text-[11px] uppercase tracking-wide opacity-70">
                    aus
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : loading ? (
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-8 w-24 animate-pulse rounded-full bg-muted"
            />
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="text-[15px] text-destructive">{error}</p>
      ) : loading && items.length === 0 ? (
        <AgendaSkeleton />
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-[15px] text-muted-foreground">
            Keine Termine in diesem Zeitraum.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, dayItems]) => (
            <div key={date} className="space-y-2">
              <p className="text-[13px] font-black uppercase tracking-wide text-muted-foreground">
                {weekdayLabel(date)}
              </p>
              <div className="space-y-3">
                {dayItems.map((item) => (
                  <AgendaRow
                    key={item.id}
                    item={item}
                    variant={item.kind === "hockey" ? "upcoming" : "agenda"}
                    onOpen={setEventDetail}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <AgendaEventDialog
        item={eventDetail}
        open={Boolean(eventDetail)}
        onOpenChange={(open) => {
          if (!open) setEventDetail(null);
        }}
      />
    </div>
  );
}
