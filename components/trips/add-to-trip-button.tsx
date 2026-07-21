"use client";

import { useEffect, useState } from "react";
import { Luggage } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TripEventDraft } from "@/lib/trips/constants";

type TripOption = { id: number; title: string };

type Props = {
  draft: TripEventDraft;
  onDone?: (message: string) => void;
  onError?: (message: string) => void;
};

export function AddToTripButton({ draft, onDone, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [trips, setTrips] = useState<TripOption[]>([]);
  const [tripId, setTripId] = useState<string>("");
  const [newTitle, setNewTitle] = useState("");
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

  async function submit() {
    setSaving(true);
    try {
      let targetTripId = Number(tripId);
      if (!targetTripId && newTitle.trim()) {
        const createRes = await fetch("/api/trips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle.trim() }),
        });
        const createData = await createRes.json();
        if (!createRes.ok) {
          throw new Error(createData.error || "Reise anlegen fehlgeschlagen");
        }
        targetTripId = createData.trip.id;
      }
      if (!targetTripId) {
        throw new Error("Bitte Reise wählen oder neu anlegen.");
      }

      const res = await fetch(`/api/trips/${targetTripId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: draft.type,
          title: draft.title,
          startDate: draft.start_date ?? null,
          endDate: draft.end_date ?? null,
          startTime: draft.start_time ?? null,
          endTime: draft.end_time ?? null,
          location: draft.location ?? null,
          provider: draft.provider ?? null,
          bookingReference: draft.booking_reference ?? null,
          notes: draft.notes ?? null,
          flightNumber: draft.flight_number ?? null,
          documentId: draft.document_id ?? null,
          travelItemId: draft.travel_item_id ?? null,
          guideId: draft.guide_id ?? null,
          noteId: draft.note_id ?? null,
          sourceExcerpt: draft.source_excerpt ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Hinzufügen fehlgeschlagen");
      setOpen(false);
      setNewTitle("");
      onDone?.(`Zu TravelBrain hinzugefügt.`);
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
        title="Zu TravelBrain hinzufügen"
      >
        <Luggage className="size-3.5" />
        Zur Reise
      </Button>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-lg border border-border/70 bg-background p-2.5 text-xs">
      <div className="font-medium">
        Zur Reise: {draft.type} · {draft.title}
      </div>
      <div className="space-y-1.5">
        <Label>Bestehende Reise</Label>
        <Select
          value={tripId || undefined}
          onValueChange={(value) => {
            if (value == null) return;
            setTripId(value);
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
        <Label>Oder neue Reise</Label>
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Titel der neuen Reise"
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={saving} onClick={() => void submit()}>
          {saving ? "Speichert…" : "Hinzufügen"}
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
