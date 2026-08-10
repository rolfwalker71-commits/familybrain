"use client";

import { useState } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { cn } from "@/lib/utils";
import { weekdayLabel } from "@/components/calendar/agenda-row";
import { SLOT_DURATION_PRESETS } from "@/lib/calendar/slot-duration";

type FreeSlot = {
  date: string;
  startHm: string;
  endHm: string;
  durationMinutes: number;
};

export function AdhocEventDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [duration, setDuration] = useState(60);
  const [slots, setSlots] = useState<FreeSlot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function reset() {
    setTitle("");
    setNotes("");
    setDuration(60);
    setSlots([]);
    setError(null);
    setMsg(null);
    setBusy(false);
  }

  async function suggestSlots() {
    setBusy(true);
    setError(null);
    setMsg(null);
    setSlots([]);
    try {
      const res = await fetch("/api/calendar/adhoc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "suggest_slots",
          durationMinutes: duration,
          rangeDays: 7,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Slots suchen fehlgeschlagen");
      }
      const next = (data.slots || []) as FreeSlot[];
      setSlots(next);
      setMsg(
        next.length
          ? `${next.length} freie Slots (heute–+7 Tage, 08–18).`
          : "Keine freien Slots gefunden."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function createInSlot(slot: FreeSlot) {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Bitte einen Titel angeben.");
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/calendar/adhoc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          title: trimmed,
          date: slot.date,
          startHm: slot.startHm,
          endHm: slot.endHm,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Termin anlegen fehlgeschlagen");
      }
      setMsg(
        `Eingetragen: ${trimmed} · ${slot.date} ${slot.startHm}–${slot.endHm}`
      );
      onCreated?.();
      onOpenChange(false);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus
              className="size-4 text-teal-700"
              strokeWidth={APP_ICON_STROKE}
              absoluteStrokeWidth
              aria-hidden
            />
            Ad-hoc einplanen
          </DialogTitle>
          <DialogDescription>
            Aufgabe als Outlook-Termin — Dauer wählen, freien Slot nehmen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="adhoc-title">Titel</Label>
            <Input
              id="adhoc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z. B. Ticket #1230 nachfassen"
              maxLength={200}
              disabled={busy}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adhoc-notes">Notiz (optional)</Label>
            <Input
              id="adhoc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Kurzbeschreibung"
              maxLength={500}
              disabled={busy}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Dauer</Label>
            <div className="flex flex-wrap gap-1.5">
              {SLOT_DURATION_PRESETS.map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={duration === m ? "default" : "outline"}
                  className="tabular-nums"
                  disabled={busy}
                  onClick={() => {
                    setDuration(m);
                    setSlots([]);
                    setMsg(null);
                  }}
                >
                  {m} Min
                </Button>
              ))}
            </div>
          </div>

          <Button
            type="button"
            disabled={busy || !title.trim()}
            onClick={() => void suggestSlots()}
            className="w-full gap-2"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            Freie Slots suchen
          </Button>

          {slots.length > 0 ? (
            <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Slot wählen → in Outlook speichern
              </p>
              <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                {slots.map((s) => (
                  <li key={`${s.date}-${s.startHm}`}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void createInSlot(s)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md border border-border/50 bg-card px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-muted/40 disabled:opacity-60"
                      )}
                    >
                      <span className="min-w-0 truncate font-medium">
                        {weekdayLabel(s.date)} · {s.date.slice(5)}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {s.startHm}–{s.endHm}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {msg ? <p className="text-xs text-emerald-700">{msg}</p> : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
