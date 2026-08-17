"use client";

import { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import {
  groupFreeSlotsByDate,
  SLOT_DURATION_PRESETS,
} from "@/lib/calendar/slot-duration";
import { cn } from "@/lib/utils";
import { weekdayLabel } from "@/components/calendar/agenda-row";

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
  initialTitle,
  initialNotes,
  mariIssueId,
  dialogTitle,
  dialogDescription,
  defaultDurationMinutes = 60,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  /** Prefill when opening (e.g. from Maringo ticket). */
  initialTitle?: string | null;
  initialNotes?: string | null;
  mariIssueId?: number | null;
  dialogTitle?: string;
  dialogDescription?: string;
  defaultDurationMinutes?: number;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [duration, setDuration] = useState(60);
  const [slots, setSlots] = useState<FreeSlot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [providerLabel, setProviderLabel] = useState<string | null>(null);
  /** Outlook/Teams only — ignored for Google. */
  const [teamsMeeting, setTeamsMeeting] = useState(false);

  const isMari = mariIssueId != null && mariIssueId > 0;

  function reset() {
    setTitle("");
    setNotes("");
    setDuration(defaultDurationMinutes);
    setSlots([]);
    setError(null);
    setMsg(null);
    setBusy(false);
    setProviderLabel(null);
    setTeamsMeeting(false);
  }

  useEffect(() => {
    if (!open) return;
    setTitle((initialTitle || "").trim());
    setNotes((initialNotes || "").trim());
    setDuration(defaultDurationMinutes);
    setSlots([]);
    setError(null);
    setMsg(null);
    setBusy(false);
    setProviderLabel(null);
    setTeamsMeeting(Boolean(isMari));
  }, [open, initialTitle, initialNotes, defaultDurationMinutes, mariIssueId, isMari]);

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
      const prov =
        data.provider === "google"
          ? "Google"
          : data.provider === "microsoft"
            ? "Outlook"
            : null;
      setProviderLabel(prov);
      setMsg(
        next.length
          ? `${next.length} freie Slots (heute–+7 Tage, 08–18)${prov ? ` · ${prov}` : ""}.`
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
          mariIssueId: isMari ? mariIssueId : null,
          teamsMeeting,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Termin anlegen fehlgeschlagen");
      }
      const prov =
        data.provider === "google"
          ? "Google"
          : data.provider === "microsoft"
            ? "Outlook"
            : "Kalender";
      const teamsHint =
        data.provider === "microsoft" && data.teamsMeeting
          ? " · Teams-Meeting"
          : "";
      setMsg(
        `Eingetragen (${prov}${teamsHint}): ${trimmed} · ${slot.date} ${slot.startHm}–${slot.endHm}`
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
            {dialogTitle ||
              (isMari
                ? `Termin · Ticket #${mariIssueId}`
                : "Ad-hoc einplanen")}
          </DialogTitle>
          <DialogDescription>
            {dialogDescription ||
              (isMari
                ? "Freien Slot suchen und Termin anlegen — Stempel für Abend-Stundenbuchung."
                : "Aufgabe als Kalender-Termin — Dauer wählen, freien Slot nehmen.")}
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
            <Label htmlFor="adhoc-notes">
              {isMari ? "Beschreibung / Memo" : "Notiz (optional)"}
            </Label>
            {isMari ? (
              <Textarea
                id="adhoc-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ticketzusammenfassung für den Termin"
                maxLength={4000}
                rows={5}
                disabled={busy}
                className="resize-y text-[13px]"
              />
            ) : (
              <Input
                id="adhoc-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Kurzbeschreibung"
                maxLength={500}
                disabled={busy}
              />
            )}
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

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-teal-700"
              checked={teamsMeeting}
              disabled={busy}
              onChange={(e) => setTeamsMeeting(e.target.checked)}
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold">
                Teams-Meeting
              </span>
              <span className="block text-[11px] text-muted-foreground">
                Bei Outlook: Online-Meeting anlegen. Bei Google ohne Wirkung.
              </span>
            </span>
          </label>

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
            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Slot wählen
                {providerLabel ? ` → ${providerLabel}` : ""} ({duration} Min · 7
                Tage)
              </p>
              <div className="max-h-56 space-y-2.5 overflow-y-auto">
                {groupFreeSlotsByDate(slots).map(({ date, slots: daySlots }) => (
                  <div key={date} className="space-y-1">
                    <p className="text-[12px] font-semibold text-foreground">
                      {weekdayLabel(date)} · {date.slice(8)}.{date.slice(5, 7)}.
                    </p>
                    <ul className="flex flex-col gap-1">
                      {daySlots.map((s) => (
                        <li key={`${s.date}-${s.startHm}`}>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void createInSlot(s)}
                            className={cn(
                              "h-auto w-full items-center justify-between gap-2 rounded-md border border-border/50 bg-card px-2.5 py-2 text-left text-[13px] hover:bg-muted/40 disabled:opacity-60"
                            )}
                          >
                            <span className="tabular-nums text-muted-foreground">
                              {s.startHm}–{s.endHm}
                            </span>
                            <span className="text-[11px] font-medium text-foreground">
                              Eintragen
                            </span>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {msg ? <p className="text-xs text-emerald-700">{msg}</p> : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
