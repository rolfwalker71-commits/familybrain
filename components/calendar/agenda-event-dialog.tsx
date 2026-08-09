"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Car,
  Check,
  Clock3,
  ListTodo,
  MapPin,
  Video,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  AgendaTypeRail,
  weekdayLabel,
} from "@/components/calendar/agenda-row";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { ICS_TYPE_META } from "@/lib/calendar/ics-types";
import type { AgendaItem } from "@/lib/dashboard/overview";
import { cn } from "@/lib/utils";
import { TripMap } from "@/components/trips/trip-map";
import { AgendaAiIconThumb } from "@/components/calendar/agenda-ai-icon-thumb";
import { isPhysicalAgendaLocation } from "@/lib/dashboard/agenda-location";

function stripIcsDescription(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  let t = raw
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  if (!t) return null;
  return t.slice(0, 4000);
}

function durationLabel(item: AgendaItem): string | null {
  if (!item.time || !item.endTime) return null;
  const [sh, sm] = item.time.split(":").map(Number);
  const [eh, em] = item.endTime.split(":").map(Number);
  if (![sh, sm, eh, em].every((n) => Number.isFinite(n))) return null;
  let mins = eh! * 60 + em! - (sh! * 60 + sm!);
  if (mins <= 0) mins += 24 * 60;
  if (mins < 60) return `${mins} Min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} Std` : `${h} Std ${m} Min`;
}

function typeLabel(item: AgendaItem): string {
  if (item.calendarType && ICS_TYPE_META[item.calendarType]) {
    return ICS_TYPE_META[item.calendarType].label;
  }
  return item.badge || "Termin";
}

function isCloudCalendarItem(item: AgendaItem): boolean {
  const id = item.id || "";
  if (id.startsWith("buddy-day-close")) return false;
  return (
    (id.startsWith("gcal-") || id.startsWith("mscal-")) &&
    Boolean(item.calendarId)
  );
}

function isAgendaEventDone(item: AgendaItem): boolean {
  const t = (item.title || "").trim();
  return t.startsWith("✅");
}

type FreeSlot = {
  date: string;
  startHm: string;
  endHm: string;
  durationMinutes: number;
};

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="text-[15px] text-foreground">{children}</div>
    </div>
  );
}

export function AgendaEventDialog({
  item,
  open,
  onOpenChange,
  calendarHref = "/calendar",
  onChanged,
}: {
  item: AgendaItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calendarHref?: string;
  onChanged?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [slots, setSlots] = useState<FreeSlot[]>([]);
  const [localDone, setLocalDone] = useState(false);

  const description = item ? stripIcsDescription(item.description) : null;
  const duration = item ? durationLabel(item) : null;
  const when = item
    ? [
        weekdayLabel(item.date),
        item.time
          ? item.endTime
            ? `${item.time} – ${item.endTime}`
            : item.time
          : "Ganztägig",
      ].join(" · ")
    : "";
  const cloud = item ? isCloudCalendarItem(item) : false;
  const done = localDone || (item ? isAgendaEventDone(item) : false);

  async function runAction(
    body: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!item?.calendarId) throw new Error("Kein Kalender verknüpft.");
    const res = await fetch("/api/calendar/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...body,
        agendaItemId: item.id,
        calendarSourceId: item.calendarId,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        (json as { error?: string }).error || "Aktion fehlgeschlagen"
      );
    }
    return json as Record<string, unknown>;
  }

  async function markDone() {
    setBusy(true);
    setActionError(null);
    setActionMsg(null);
    try {
      await runAction({ action: "done" });
      setLocalDone(true);
      setSlots([]);
      setActionMsg("Als erledigt markiert.");
      onChanged?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function loadSlots() {
    setBusy(true);
    setActionError(null);
    setActionMsg(null);
    try {
      const json = await runAction({ action: "suggest_slots" });
      const next = (json.slots || []) as FreeSlot[];
      setSlots(next);
      setActionMsg(
        next.length
          ? `${next.length} freie Slots (nächste 7 Tage, 08–18).`
          : "Keine freien Slots gefunden."
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function reschedule(slot: FreeSlot) {
    setBusy(true);
    setActionError(null);
    setActionMsg(null);
    try {
      await runAction({
        action: "reschedule",
        date: slot.date,
        startHm: slot.startHm,
        endHm: slot.endHm,
      });
      setSlots([]);
      setActionMsg(
        `Verschoben auf ${slot.date} ${slot.startHm}–${slot.endHm}.`
      );
      onChanged?.();
      onOpenChange(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function followUpTask() {
    setBusy(true);
    setActionError(null);
    setActionMsg(null);
    try {
      const json = await runAction({ action: "follow_up_task" });
      const task = json.task as { title?: string } | undefined;
      setActionMsg(
        task?.title
          ? `Aufgabe angelegt: ${task.title}`
          : "Folge-Aufgabe angelegt."
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setSlots([]);
          setActionMsg(null);
          setActionError(null);
          setLocalDone(false);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[85dvh] w-[min(96vw,28rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        {item ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-stretch border-b border-border/60">
              <AgendaTypeRail item={item} className="w-14" />
              <DialogHeader className="min-w-0 flex-1 space-y-1 px-4 py-3 text-left">
                <DialogTitle className="pr-8 text-[16px] font-black leading-snug">
                  {item.title}
                </DialogTitle>
                <DialogDescription className="text-[13px]">
                  {when}
                </DialogDescription>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Badge variant="secondary" className="text-[11px]">
                    {typeLabel(item)}
                  </Badge>
                  {item.calendarType && item.badge !== typeLabel(item) ? (
                    <Badge variant="outline" className="text-[11px]">
                      {item.badge}
                    </Badge>
                  ) : null}
                  {done ? (
                    <Badge variant="secondary" className="text-[11px]">
                      Erledigt
                    </Badge>
                  ) : null}
                </div>
              </DialogHeader>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
              {item.kind === "calendar" ||
              item.kind === "hockey" ||
              item.kind === "holiday" ||
              item.aiIconKey ||
              item.aiIconUrl ? (
                <DetailRow label="Motiv">
                  <AgendaAiIconThumb
                    itemId={item.id}
                    title={item.title}
                    location={item.location}
                    description={item.description}
                    calendarType={item.calendarType}
                    calendarName={item.calendarName}
                    kind={item.kind}
                    meetUrl={item.meetUrl}
                    time={item.time}
                    endTime={item.endTime}
                    driveMinutes={item.driveMinutes}
                    distanceKm={item.distanceKm}
                    coords={
                      item.coords
                        ? { lat: item.coords.lat, lon: item.coords.lon }
                        : null
                    }
                    aiIconKey={item.aiIconKey}
                    aiIconUrl={item.aiIconUrl}
                    className="w-full max-w-[14rem]"
                    imgClassName="aspect-square w-full"
                  />
                </DetailRow>
              ) : null}

              {item.location ? (
                <DetailRow label="Ort">
                  <p className="flex items-start gap-1.5">
                    <MapPin
                      className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                      strokeWidth={APP_ICON_STROKE}
                      absoluteStrokeWidth
                      aria-hidden
                    />
                    <span>{item.location}</span>
                  </p>
                </DetailRow>
              ) : null}

              {item.coords && isPhysicalAgendaLocation(item.location) ? (
                <TripMap
                  points={[
                    {
                      lat: item.coords.lat,
                      lon: item.coords.lon,
                      label: item.coords.label,
                    },
                  ]}
                  heightClassName="h-36"
                  className="rounded-lg"
                  compact
                />
              ) : null}

              {item.time || duration ? (
                <DetailRow label="Zeit">
                  <p className="flex items-center gap-1.5">
                    <Clock3
                      className="size-3.5 shrink-0 text-muted-foreground"
                      strokeWidth={APP_ICON_STROKE}
                      absoluteStrokeWidth
                      aria-hidden
                    />
                    <span>
                      {[
                        item.time && item.endTime
                          ? `${item.time} – ${item.endTime}`
                          : item.time || "Ganztägig",
                        duration ? `(${duration})` : null,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </span>
                  </p>
                </DetailRow>
              ) : null}

              {item.driveLabel ? (
                <DetailRow label="Anfahrt">
                  <p className="flex items-center gap-1.5">
                    <Car
                      className="size-3.5 shrink-0 text-muted-foreground"
                      strokeWidth={APP_ICON_STROKE}
                      absoluteStrokeWidth
                      aria-hidden
                    />
                    {item.driveLabel}
                  </p>
                </DetailRow>
              ) : null}

              {item.weather ? (
                <DetailRow label="Wetter">
                  <p>
                    {item.weather.icon} {item.weather.temperatureC}°
                    {item.weather.labelDe
                      ? ` · ${item.weather.labelDe}`
                      : ""}
                  </p>
                </DetailRow>
              ) : null}

              {item.score ? (
                <DetailRow label="Ergebnis">
                  <p>
                    {item.score}
                    {item.scorers?.length
                      ? ` · ${item.scorers.slice(0, 6).join(", ")}`
                      : ""}
                  </p>
                </DetailRow>
              ) : null}

              {description ? (
                <DetailRow label="Notizen">
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/90">
                    {description}
                  </p>
                </DetailRow>
              ) : null}

              {item.subtitle &&
              item.subtitle !== item.location &&
              item.subtitle !== item.title ? (
                <DetailRow label="Details">
                  <p>{item.subtitle}</p>
                </DetailRow>
              ) : null}

              {item.id.startsWith("buddy-day-close") ? (
                <DetailRow label="Tagesabschluss">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href="/google?tab=calendar"
                      className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
                    >
                      Google · Kalender
                    </Link>
                    <Link
                      href="/google?tab=mail&view=tagesanalysen"
                      className={cn(
                        buttonVariants({ size: "sm", variant: "outline" }),
                        "gap-1.5"
                      )}
                    >
                      Gmail-Tagesanalyse
                    </Link>
                    <Link
                      href="/microsoft?tab=calendar"
                      className={cn(
                        buttonVariants({ size: "sm", variant: "outline" }),
                        "gap-1.5"
                      )}
                    >
                      Microsoft · Kalender
                    </Link>
                    <Link
                      href="/microsoft?tab=mail&view=tagesanalysen"
                      className={cn(
                        buttonVariants({ size: "sm", variant: "outline" }),
                        "gap-1.5"
                      )}
                    >
                      Outlook-Tagesanalyse
                    </Link>
                  </div>
                </DetailRow>
              ) : null}

              {cloud ? (
                <DetailRow label="Buddy-Aktionen">
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {!done ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy}
                            onClick={() => void markDone()}
                          >
                            <Check className="size-3.5" />
                            Erledigt
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy || !item.time}
                            onClick={() => void loadSlots()}
                          >
                            Freien Slot suchen
                          </Button>
                        </>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void followUpTask()}
                      >
                        <ListTodo className="size-3.5" />
                        Folge-Task
                      </Button>
                    </div>
                    {slots.length > 0 ? (
                      <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Verschieben nach
                        </p>
                        <ul className="flex flex-wrap gap-1.5">
                          {slots.map((s) => (
                            <li key={`${s.date}-${s.startHm}`}>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={busy}
                                onClick={() => void reschedule(s)}
                              >
                                {s.date.slice(5)} {s.startHm}
                              </Button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {actionMsg ? (
                      <p className="text-xs text-emerald-700">{actionMsg}</p>
                    ) : null}
                    {actionError ? (
                      <p className="text-xs text-destructive">{actionError}</p>
                    ) : null}
                  </div>
                </DetailRow>
              ) : null}

              {!description &&
              !item.location &&
              !item.weather &&
              !item.driveLabel &&
              !item.score &&
              !item.aiIconKey &&
              !item.aiIconUrl &&
              !cloud ? (
                <p className="text-[13px] text-muted-foreground">
                  Keine weiteren Details in der Quelle.
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border/60 bg-muted/30 px-4 py-3">
              {item.meetUrl ? (
                <a
                  href={item.meetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "gap-1.5"
                  )}
                >
                  <Video className="size-3.5" aria-hidden />
                  Meet
                </a>
              ) : null}
              {item.mapsUrl ? (
                <a
                  href={item.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "gap-1.5"
                  )}
                >
                  <MapPin className="size-3.5" aria-hidden />
                  Route
                </a>
              ) : null}
              <Link
                href={calendarHref}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "gap-1.5"
                )}
              >
                <CalendarDays className="size-3.5" aria-hidden />
                Alle Termine
              </Link>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
