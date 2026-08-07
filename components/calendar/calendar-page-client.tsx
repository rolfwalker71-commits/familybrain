"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-primitives";
import { pageVisuals } from "@/components/layout/icon-circle";
import { AgendaRow, weekdayLabel } from "@/components/calendar/agenda-row";
import { cn } from "@/lib/utils";
import { toSwissDate } from "@/lib/utils/dates";
import type { AgendaItem } from "@/lib/dashboard/overview";
import type {
  CalendarAgendaRange,
  CalendarSource,
} from "@/lib/calendar/agenda-feed";

const RANGES: { id: CalendarAgendaRange; label: string }[] = [
  { id: "week", label: "Woche" },
  { id: "14d", label: "14 Tage" },
];

export function CalendarPageClient() {
  const [range, setRange] = useState<CalendarAgendaRange>("week");
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ range });
      if (selected !== null) {
        params.set("sources", [...selected].join(","));
      }
      const res = await fetch(`/api/calendar/agenda?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Laden fehlgeschlagen");
      setItems(data.items || []);
      setSources(data.sources || []);
      setRangeStart(data.rangeStart || "");
      setRangeEnd(data.rangeEnd || "");
      if (selected === null && Array.isArray(data.sources)) {
        // default: all currently enabled ICS + builtins
        setSelected(
          new Set(
            (data.sources as CalendarSource[])
              .filter((s) => s.enabled)
              .map((s) => s.id)
          )
        );
      }
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [range, selected]);

  useEffect(() => {
    void load();
  }, [load]);

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

      {rangeStart && rangeEnd ? (
        <p className="text-xs text-muted-foreground">
          {toSwissDate(rangeStart)} – {toSwissDate(rangeEnd)}
          <Link
            href="/account"
            className="ml-3 font-medium text-[var(--brand-docs)] underline-offset-2 hover:underline"
          >
            Kalender verwalten →
          </Link>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {sources.map((s) => {
          const on = activeSelected?.has(s.id) ?? s.enabled;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggleSource(s.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
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
                <span className="text-[10px] uppercase tracking-wide opacity-70">
                  aus
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Lade Termine…</p>
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Keine Termine in diesem Zeitraum.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, dayItems]) => (
            <div key={date} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {weekdayLabel(date)}
              </p>
              <div className="space-y-2">
                {dayItems.map((item) => (
                  <AgendaRow
                    key={item.id}
                    item={item}
                    variant={item.kind === "hockey" ? "upcoming" : "agenda"}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
