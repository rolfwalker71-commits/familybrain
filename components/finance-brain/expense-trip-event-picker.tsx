"use client";

import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateDe } from "@/lib/finance-brain/format";
import { cn } from "@/lib/utils";

export type TripPickerOption = {
  id: number;
  title: string;
};

type TripEventOption = {
  id: number;
  title: string;
  start_date: string | null;
  start_time: string | null;
};

function eventLabel(ev: TripEventOption): string {
  const date = formatDateDe(ev.start_date) || "Ohne Datum";
  const time = ev.start_time?.trim();
  const when = time ? `${date}, ${time}` : date;
  return `${when} · ${ev.title}`;
}

/**
 * Optional trip → activity picker for linking an expense to a TravelBuddy event.
 * When `lockedTripId` is set (ledger already linked), trip select is fixed.
 */
export function ExpenseTripEventPicker({
  trips,
  lockedTripId = null,
  initialTripId = null,
  value,
  onChange,
  className,
  compact,
}: {
  trips: TripPickerOption[];
  lockedTripId?: number | null;
  /** Known trip of the currently linked event (avoids scanning all trips). */
  initialTripId?: number | null;
  value: number | null;
  onChange: (tripEventId: number | null) => void;
  className?: string;
  compact?: boolean;
}) {
  const [tripId, setTripId] = useState<string>(() => {
    if (lockedTripId != null) return String(lockedTripId);
    if (initialTripId != null) return String(initialTripId);
    return "";
  });
  const [events, setEvents] = useState<TripEventOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (lockedTripId != null) {
      setTripId(String(lockedTripId));
      return;
    }
    if (initialTripId != null && !tripId) {
      setTripId(String(initialTripId));
    }
  }, [lockedTripId, initialTripId, tripId]);

  useEffect(() => {
    if (!tripId) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/trips/${tripId}/events`);
        const json = await res.json();
        if (!res.ok || cancelled) return;
        const list = (json.events || []) as TripEventOption[];
        setEvents(
          list.map((e) => ({
            id: e.id,
            title: e.title,
            start_date: e.start_date ?? null,
            start_time: e.start_time ?? null,
          }))
        );
      } catch {
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  const eventItems = useMemo(() => {
    const items: Record<string, string> = { __none__: "Keine Aktivität" };
    for (const ev of events) {
      items[String(ev.id)] = eventLabel(ev);
    }
    return items;
  }, [events]);

  const tripItems = useMemo(() => {
    const items: Record<string, string> = { __none__: "Keine Reise" };
    for (const t of trips) {
      items[String(t.id)] = t.title;
    }
    return items;
  }, [trips]);

  const labelCls = compact ? "text-xs" : undefined;
  const tripLocked = lockedTripId != null;
  const availableTrips = tripLocked
    ? trips.some((t) => t.id === lockedTripId)
      ? trips.filter((t) => t.id === lockedTripId)
      : [{ id: lockedTripId!, title: `Reise #${lockedTripId}` }]
    : trips;

  if (!tripLocked && availableTrips.length === 0) {
    return null;
  }

  return (
    <div className={cn("grid gap-2 sm:grid-cols-2", className)}>
      <div className="space-y-1">
        <Label className={labelCls}>Reise (optional)</Label>
        <Select
          value={tripId || "__none__"}
          disabled={tripLocked}
          onValueChange={(v) => {
            if (v == null || v === "__none__") {
              setTripId("");
              onChange(null);
              return;
            }
            setTripId(v);
            onChange(null);
          }}
          items={tripItems}
        >
          <SelectTrigger>
            <SelectValue placeholder="Reise wählen" />
          </SelectTrigger>
          <SelectContent>
            {!tripLocked ? (
              <SelectItem value="__none__">Keine Reise</SelectItem>
            ) : null}
            {availableTrips.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className={labelCls}>Aktivität (optional)</Label>
        <Select
          value={value != null ? String(value) : "__none__"}
          disabled={!tripId || loading}
          onValueChange={(v) => {
            if (v == null || v === "__none__") {
              onChange(null);
              return;
            }
            onChange(Number(v));
          }}
          items={eventItems}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                loading
                  ? "Lade Aktivitäten…"
                  : tripId
                    ? "Aktivität wählen"
                    : "Zuerst Reise wählen"
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Keine Aktivität</SelectItem>
            {events.map((ev) => (
              <SelectItem key={ev.id} value={String(ev.id)}>
                {eventLabel(ev)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
