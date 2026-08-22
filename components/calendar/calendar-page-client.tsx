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
import { filterAgendaItemsBySources } from "@/lib/calendar/agenda-filter";
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
  const [refreshing, setRefreshing] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventDetail, setEventDetail] = useState<AgendaItem | null>(null);
  const enrichGen = useRef(0);
  const loadGen = useRef(0);
  const paintedRef = useRef(false);

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

  const applyPayload = useCallback(
    (data: {
      items?: AgendaItem[];
      sources?: CalendarSource[];
      rangeStart?: string;
      rangeEnd?: string;
    }) => {
      const nextItems = (data.items || []) as AgendaItem[];
      setItems((prev) => {
        if (prev.length === 0) return nextItems;
        const byId = new Map(prev.map((item) => [item.id, item]));
        return nextItems.map((item) => {
          const old = byId.get(item.id);
          if (!old?.weather && !old?.driveLabel) return item;
          return {
            ...item,
            weather: item.weather ?? old.weather,
            coords: item.coords ?? old.coords,
            driveMinutes: item.driveMinutes ?? old.driveMinutes,
            driveLabel: item.driveLabel ?? old.driveLabel,
            mapsUrl: item.mapsUrl ?? old.mapsUrl,
          };
        });
      });
      setSources(data.sources || []);
      setRangeStart(data.rangeStart || "");
      setRangeEnd(data.rangeEnd || "");
      setSelected((prev) => {
        if (prev) return prev;
        if (!Array.isArray(data.sources)) return prev;
        return new Set(
          data.sources.filter((s) => s.enabled).map((s) => s.id)
        );
      });
      return nextItems;
    },
    []
  );

  const loadAgenda = useCallback(
    async (opts?: { skipCache?: boolean }) => {
      const gen = ++loadGen.current;
      setError(null);
      enrichGen.current += 1;
      const params = new URLSearchParams({ range });

      if (!opts?.skipCache) {
        try {
          const res = await fetch(`/api/calendar/agenda?${params.toString()}`);
          const data = await res.json();
          if (gen !== loadGen.current) return;
          if (res.ok) {
            const nextItems = applyPayload(data);
            if (nextItems.length > 0) {
              paintedRef.current = true;
              setLoading(false);
            }
          }
        } catch {
          /* keep skeleton; live refresh follows */
        }
      }

      if (gen !== loadGen.current) return;
      setRefreshing(true);
      try {
        const res = await fetch(
          `/api/calendar/agenda?${params.toString()}&fresh=1`
        );
        const data = await res.json();
        if (gen !== loadGen.current) return;
        if (!res.ok) throw new Error(data.error || "Laden fehlgeschlagen");
        const nextItems = applyPayload(data);
        paintedRef.current = true;
        void enrichItems(nextItems);
      } catch (err) {
        if (gen !== loadGen.current) return;
        if (!paintedRef.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (gen === loadGen.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [range, applyPayload, enrichItems]
  );

  useEffect(() => {
    void loadAgenda();
  }, [range, loadAgenda]);

  const grouped = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    for (const item of filterAgendaItemsBySources(items, selected)) {
      const list = map.get(item.date) || [];
      list.push(item);
      map.set(item.date, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items, selected]);

  function toggleSource(id: string) {
    setSelected((prev) => {
      const base =
        prev ??
        new Set(sources.filter((s) => s.enabled).map((s) => s.id));
      const next = new Set(base);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const activeSelected = selected;

  return (
    <div className="min-w-0 space-y-5 pb-8">
      <PageHeader
        title="Kalender"
        description="Deine ICS-Kalender, Feiertage und Fristen — gefiltert nach Quelle."
        icon={pageVisuals.calendar.icon}
        tone={pageVisuals.calendar.tone}
        titleClassName="text-2xl font-black tracking-tight sm:text-3xl"
        descriptionClassName="text-[0.9375rem]"
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

      <p className="text-[0.8125rem] text-muted-foreground">
        {rangeStart && rangeEnd
          ? `${toSwissDate(rangeStart)} – ${toSwissDate(rangeEnd)}`
          : "…"}
        <Link
          href="/account"
          className="ml-3 font-medium text-[var(--brand-docs)] underline-offset-2 hover:underline"
        >
          Kalender verwalten →
        </Link>
        {refreshing && !enriching ? (
          <span className="ml-3 text-muted-foreground">Aktualisieren…</span>
        ) : null}
        {enriching ? (
          <span className="ml-3 text-muted-foreground">Wetter/Fahrzeit…</span>
        ) : null}
      </p>

      {sources.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {sources.map((s) => {
            const on = activeSelected?.has(s.id) ?? s.enabled;
            return (
              <Button
                key={s.id}
                type="button"
                variant="outline"
                onClick={() => toggleSource(s.id)}
                className={cn(
                  "h-auto max-w-full gap-1.5 rounded-full border-transparent px-2.5 py-1 text-xs leading-snug whitespace-normal",
                  on
                    ? "bg-card text-foreground shadow-sm"
                    : "bg-muted text-muted-foreground line-through opacity-70"
                )}
              >
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                  aria-hidden
                />
                <span className="min-w-0 break-words">{s.name}</span>
                {!s.enabled && s.type !== "holiday" && s.type !== "deadline" ? (
                  <span className="text-[0.5625rem] uppercase tracking-wide opacity-70">
                    aus
                  </span>
                ) : null}
              </Button>
            );
          })}
        </div>
      ) : loading ? (
        <div className="flex flex-wrap gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-5 w-16 animate-pulse rounded-full bg-muted"
            />
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="text-[0.9375rem] text-destructive">{error}</p>
      ) : loading && items.length === 0 ? (
        <AgendaSkeleton />
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-[0.9375rem] text-muted-foreground">
            Keine Termine in diesem Zeitraum.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, dayItems]) => (
            <div key={date} className="space-y-2">
              <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                {weekdayLabel(date)}
              </p>
              <div className="flex w-full flex-col gap-3">
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
        onChanged={() => void loadAgenda({ skipCache: true })}
      />
    </div>
  );
}
