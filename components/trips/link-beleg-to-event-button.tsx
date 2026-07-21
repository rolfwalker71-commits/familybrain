"use client";

import { useEffect, useState } from "react";
import { FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TripOption = { id: number; title: string };
type EventOption = {
  id: number;
  title: string;
  event_type: string;
  start_date: string | null;
};

type Props = {
  documentId: number;
  onDone?: (message: string) => void;
  onError?: (message: string) => void;
};

export function LinkBelegToEventButton({
  documentId,
  onDone,
  onError,
}: Props) {
  const [open, setOpen] = useState(false);
  const [trips, setTrips] = useState<TripOption[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [tripId, setTripId] = useState("");
  const [eventId, setEventId] = useState("");
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const res = await fetch("/api/trips");
      const data = await res.json();
      if (res.ok) {
        setTrips(
          (data.trips || []).map((t: { id: number; title: string }) => ({
            id: t.id,
            title: t.title,
          }))
        );
      }
    })();
  }, [open]);

  useEffect(() => {
    if (!open || !tripId) {
      setEvents([]);
      setEventId("");
      return;
    }
    let cancelled = false;
    setLoadingEvents(true);
    void (async () => {
      try {
        const res = await fetch(`/api/trips/${tripId}/events`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || "Ereignisse laden fehlgeschlagen");
        setEvents(
          (data.events || []).map(
            (e: {
              id: number;
              title: string;
              event_type: string;
              start_date: string | null;
            }) => ({
              id: e.id,
              title: e.title,
              event_type: e.event_type,
              start_date: e.start_date,
            })
          )
        );
      } catch (err) {
        if (!cancelled) {
          onError?.(err instanceof Error ? err.message : String(err));
          setEvents([]);
        }
      } finally {
        if (!cancelled) setLoadingEvents(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tripId, onError]);

  async function submit() {
    const tid = Number(tripId);
    const eid = Number(eventId);
    if (!tid || !eid) {
      onError?.("Bitte Reise und Aktivität wählen.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/trips/${tid}/events/${eid}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verlinken fehlgeschlagen");
      setOpen(false);
      setTripId("");
      setEventId("");
      onDone?.("Beleg mit Aktivität verknüpft.");
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        onClick={() => setOpen(true)}
        title="Als Beleg an bestehende Aktivität hängen"
      >
        <FilePlus2 className="size-3.5" />
        Beleg dazufügen
      </Button>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-lg border border-border/70 bg-background p-2.5 text-xs">
      <div className="font-medium">Beleg an Aktivität verknüpfen</div>
      <div className="space-y-1.5">
        <Label>Reise</Label>
        <Select
          value={tripId || undefined}
          onValueChange={(value) => {
            if (value == null) return;
            setTripId(value);
            setEventId("");
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Reise wählen…" />
          </SelectTrigger>
          <SelectContent>
            {trips.map((trip) => (
              <SelectItem key={trip.id} value={String(trip.id)}>
                {trip.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Aktivität</Label>
        <Select
          value={eventId || undefined}
          onValueChange={(value) => {
            if (value == null) return;
            setEventId(value);
          }}
          disabled={!tripId || loadingEvents || events.length === 0}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                !tripId
                  ? "Zuerst Reise wählen…"
                  : loadingEvents
                    ? "Lädt…"
                    : events.length === 0
                      ? "Keine Aktivitäten"
                      : "Aktivität wählen…"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {events.map((event) => (
              <SelectItem key={event.id} value={String(event.id)}>
                {event.event_type}: {event.title}
                {event.start_date ? ` (${event.start_date})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={saving || !tripId || !eventId}
          onClick={() => void submit()}
        >
          {saving ? "Speichert…" : "Verknüpfen"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={saving}
          onClick={() => setOpen(false)}
        >
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
