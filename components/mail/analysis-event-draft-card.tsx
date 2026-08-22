"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  groupFreeSlotsByDate,
  SLOT_DURATION_PRESETS,
} from "@/lib/calendar/slot-duration";
import { weekdayLabel } from "@/components/calendar/agenda-row";
import { toSwissDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

export type AnalysisDraftEvent = {
  title: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  allDay?: boolean;
  location?: string | null;
  notes?: string | null;
  fromTaskTwin?: boolean;
  reason?: string;
};

type FreeSlot = {
  date: string;
  startHm: string;
  endHm: string;
  durationMinutes: number;
};

export function AnalysisEventDraftCard({
  event,
  calendarLabel,
  slotProvider,
  disabled,
  onChange,
}: {
  event: AnalysisDraftEvent;
  calendarLabel: string;
  /** Prefer calendar provider for slot search. */
  slotProvider: "microsoft" | "google";
  disabled?: boolean;
  onChange: (next: AnalysisDraftEvent) => void;
}) {
  const needsSlot = Boolean(event.fromTaskTwin);
  const [duration, setDuration] = useState(30);
  const [slots, setSlots] = useState<FreeSlot[]>([]);
  const [slotBusy, setSlotBusy] = useState(false);
  const [slotMsg, setSlotMsg] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);

  async function suggestSlots(nextDuration = duration) {
    setSlotBusy(true);
    setSlotError(null);
    setSlotMsg(null);
    setSlots([]);
    try {
      const res = await fetch("/api/calendar/adhoc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "suggest_slots",
          durationMinutes: nextDuration,
          rangeDays: 7,
          provider: slotProvider,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Slots suchen fehlgeschlagen");
      }
      const next = (data.slots || []) as FreeSlot[];
      setSlots(next);
      setSlotMsg(
        next.length
          ? `${next.length} freie Slots (heute–+7 Tage, 08–18).`
          : "Keine freien Slots gefunden."
      );
    } catch (err) {
      setSlotError(err instanceof Error ? err.message : String(err));
    } finally {
      setSlotBusy(false);
    }
  }

  function pickSlot(slot: FreeSlot) {
    onChange({
      ...event,
      date: slot.date,
      startTime: slot.startHm,
      endTime: slot.endHm,
      allDay: false,
    });
    setSlotMsg(
      `Gewählt: ${toSwissDate(slot.date)} ${slot.startHm}–${slot.endHm}`
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border/60 p-3">
      <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
        Termin · {calendarLabel}
        {needsSlot ? " · aus Aufgabe" : ""}
      </p>
      <div className="space-y-1">
        <Label>Titel</Label>
        <Input
          value={event.title}
          disabled={disabled}
          onChange={(e) => onChange({ ...event, title: e.target.value })}
        />
      </div>

      {needsSlot ? (
        <div className="space-y-2 rounded-md border border-dashed border-border/70 bg-muted/20 p-2.5">
          <p className="text-xs text-muted-foreground">
            Dauer wählen und freien Slot suchen — erst dann wird der Termin
            angelegt.
          </p>
          <div className="space-y-1.5">
            <Label>Dauer</Label>
            <div className="flex flex-wrap gap-1.5">
              {SLOT_DURATION_PRESETS.map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || slotBusy}
                  className={cn(
                    "h-auto rounded-md px-2 py-1 text-xs font-medium",
                    duration === m
                      ? "border-foreground bg-background"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => {
                    setDuration(m);
                    void suggestSlots(m);
                  }}
                >
                  {m} Min
                </Button>
              ))}
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || slotBusy}
            onClick={() => void suggestSlots()}
          >
            {slotBusy ? "Suche…" : "Freie Slots suchen"}
          </Button>
          {slotError ? (
            <p className="text-xs text-rose-700">{slotError}</p>
          ) : null}
          {slotMsg ? (
            <p className="text-xs text-muted-foreground">{slotMsg}</p>
          ) : null}
          {event.startTime && event.endTime ? (
            <p className="text-xs font-medium text-emerald-800">
              Slot: {toSwissDate(event.date)} {event.startTime}–{event.endTime}
            </p>
          ) : null}
          {slots.length > 0 ? (
            <div className="space-y-2">
              {groupFreeSlotsByDate(slots).map((day) => (
                <div key={day.date} className="space-y-1">
                  <p className="text-[0.6875rem] font-semibold text-muted-foreground">
                    {weekdayLabel(day.date)} · {toSwissDate(day.date)}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {day.slots.map((s) => {
                      const selected =
                        event.date === s.date &&
                        event.startTime === s.startHm &&
                        event.endTime === s.endHm;
                      return (
                        <Button
                          key={`${s.date}-${s.startHm}`}
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={disabled || slotBusy}
                          className={cn(
                            "h-auto rounded-md px-2 py-1 text-xs tabular-nums",
                            selected
                              ? "border-emerald-700 bg-emerald-50 text-emerald-950 dark:border-emerald-400/50 dark:bg-emerald-500/15 dark:text-emerald-100"
                              : "border-border/60 hover:bg-muted"
                          )}
                          onClick={() => pickSlot(s)}
                        >
                          {s.startHm}–{s.endHm}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label>Datum</Label>
            <Input
              type="date"
              value={event.date}
              disabled={disabled}
              onChange={(e) => onChange({ ...event, date: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Start</Label>
            <Input
              type="time"
              value={event.startTime || ""}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...event,
                  startTime: e.target.value || null,
                  allDay: !e.target.value,
                })
              }
            />
          </div>
        </div>
      )}

      <div className="space-y-1">
        <Label>Notizen</Label>
        <Textarea
          rows={2}
          value={event.notes || ""}
          disabled={disabled}
          onChange={(e) => onChange({ ...event, notes: e.target.value })}
        />
      </div>
    </div>
  );
}

export function analysisEventsNeedSlot(
  events: Array<{ fromTaskTwin?: boolean; startTime?: string | null }>
): boolean {
  return events.some((e) => e.fromTaskTwin && !e.startTime);
}
