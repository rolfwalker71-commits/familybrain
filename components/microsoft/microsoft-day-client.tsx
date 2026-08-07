"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Check,
  CalendarClock,
  Mail,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-primitives";
import { cn } from "@/lib/utils";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { toSwissDate } from "@/lib/utils/dates";

type Tab = "calendar" | "mail";

type MsEvent = {
  id: string;
  subject: string;
  startHm: string | null;
  endHm: string | null;
  date: string;
  location: string | null;
  isAllDay: boolean;
  done: boolean;
  webLink: string | null;
};

type FreeSlot = {
  date: string;
  startHm: string;
  endHm: string;
  durationMinutes: number;
};

type MsMail = {
  id: string;
  folder: "inbox" | "sent";
  subject: string;
  from: string;
  preview: string;
  receivedOrSentAt: string | null;
};

type DayAnalysis = {
  daySummary: string;
  highlights: string[];
  openLoops: string[];
  tasks: Array<{
    title: string;
    notes?: string | null;
    dueDate?: string | null;
    sourceMailId?: string | null;
    sourceSubject?: string | null;
    folder?: "inbox" | "sent" | null;
    reason?: string;
  }>;
};

export function MicrosoftDayClient() {
  const [tab, setTab] = useState<Tab>("calendar");
  const [connected, setConnected] = useState<boolean | null>(null);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [events, setEvents] = useState<MsEvent[]>([]);
  const [calLoading, setCalLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [slotsByEvent, setSlotsByEvent] = useState<Record<string, FreeSlot[]>>(
    {}
  );

  const [inbox, setInbox] = useState<MsMail[]>([]);
  const [sent, setSent] = useState<MsMail[]>([]);
  const [mailLoading, setMailLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<DayAnalysis | null>(null);
  const [taskPick, setTaskPick] = useState<Record<number, boolean>>({});
  const [applying, setApplying] = useState(false);

  const loadConnection = useCallback(async () => {
    try {
      const res = await fetch("/api/microsoft/connection");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Status fehlgeschlagen");
      setConnected(Boolean(json.connected));
      setConnectedEmail(json.connectedEmail || null);
    } catch (err) {
      setConnected(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const loadCalendar = useCallback(async () => {
    setCalLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/microsoft/calendar/today");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Kalender laden fehlgeschlagen");
      setEvents((json.events || []) as MsEvent[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCalLoading(false);
    }
  }, []);

  const loadMail = useCallback(async () => {
    setMailLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/microsoft/mail/today");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Mails laden fehlgeschlagen");
      setInbox((json.inbox || []) as MsMail[]);
      setSent((json.sent || []) as MsMail[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConnection();
  }, [loadConnection]);

  useEffect(() => {
    if (connected) {
      void loadCalendar();
      void loadMail();
    }
  }, [connected, loadCalendar, loadMail]);

  const openEvents = useMemo(
    () => events.filter((e) => !e.done),
    [events]
  );

  async function markDone(eventId: string) {
    setBusyId(eventId);
    setError(null);
    try {
      const res = await fetch("/api/microsoft/calendar/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "done", eventId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Markieren fehlgeschlagen");
      setStatus("Als erledigt markiert (Kategorie Buddy/Erledigt).");
      await loadCalendar();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function suggestSlots(eventId: string) {
    setBusyId(eventId);
    setError(null);
    try {
      const res = await fetch("/api/microsoft/calendar/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "suggest_slots", eventId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Slots fehlgeschlagen");
      setSlotsByEvent((prev) => ({
        ...prev,
        [eventId]: (json.slots || []) as FreeSlot[],
      }));
      if (!(json.slots || []).length) {
        setStatus("Keine freien Slots in den nächsten 7 Werktagen (08–18).");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function reschedule(eventId: string, slot: FreeSlot) {
    setBusyId(eventId);
    setError(null);
    try {
      const res = await fetch("/api/microsoft/calendar/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reschedule",
          eventId,
          date: slot.date,
          startHm: slot.startHm,
          endHm: slot.endHm,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Verschieben fehlgeschlagen");
      setStatus(
        `Verschoben auf ${toSwissDate(slot.date)} ${slot.startHm}–${slot.endHm}`
      );
      setSlotsByEvent((prev) => {
        const next = { ...prev };
        delete next[eventId];
        return next;
      });
      await loadCalendar();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function runAnalyze() {
    setAnalyzing(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/microsoft/mail/analyze", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Analyse fehlgeschlagen");
      if (json.mail) {
        setInbox((json.mail.inbox || []) as MsMail[]);
        setSent((json.mail.sent || []) as MsMail[]);
      }
      const a = json.analysis as DayAnalysis;
      setAnalysis(a);
      const picks: Record<number, boolean> = {};
      (a.tasks || []).forEach((_, i) => {
        picks[i] = true;
      });
      setTaskPick(picks);
      setStatus("Tagesanalyse fertig.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  }

  async function applyTasks() {
    if (!analysis) return;
    const tasks = analysis.tasks.filter((_, i) => taskPick[i]);
    if (tasks.length === 0) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch("/api/microsoft/mail/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Übernehmen fehlgeschlagen");
      const target = json.preferGoogleTasks
        ? "Google Tasks"
        : "Buddy-Notizen";
      setStatus(`${json.okCount} Aufgabe(n) → ${target}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="min-w-0 space-y-5 pb-10">
      <PageHeader
        title="Microsoft 365"
        description="Abend-Review für Outlook-Termine und Tages-Mails (Posteingang + Gesendet)."
        icon={Building2}
        tone="blue"
      />

      {connected === false ? (
        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="text-sm text-muted-foreground">
              Noch nicht verbunden. Unter Konto mit{" "}
              <span className="font-medium text-foreground">
                rolf.walker@an-group.one
              </span>{" "}
              verbinden.
            </p>
            <Link
              href="/account"
              className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
            >
              Zu Konto
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {connected ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">
              Verbunden als{" "}
              <span className="font-medium text-foreground">
                {connectedEmail || "Microsoft 365"}
              </span>
            </p>
            <div className="flex gap-1 rounded-lg border border-border/70 p-0.5">
              <button
                type="button"
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium",
                  tab === "calendar"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground"
                )}
                onClick={() => setTab("calendar")}
              >
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                  Kalender-Review
                </span>
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium",
                  tab === "mail"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground"
                )}
                onClick={() => setTab("mail")}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                  Mail-Tag
                </span>
              </button>
            </div>
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {status ? (
            <p className="text-sm text-emerald-700" role="status">
              {status}
            </p>
          ) : null}

          {tab === "calendar" ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[15px] font-semibold">
                  Heute · {openEvents.length} offen /{" "}
                  {events.filter((e) => e.done).length} erledigt
                </h2>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={calLoading}
                  onClick={() => void loadCalendar()}
                >
                  <RefreshCw
                    className={cn("size-3.5", calLoading && "animate-spin")}
                  />
                  Aktualisieren
                </Button>
              </div>

              {calLoading && events.length === 0 ? (
                <p className="text-sm text-muted-foreground">Lade Termine…</p>
              ) : events.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Keine Outlook-Termine für heute.
                </p>
              ) : (
                <ul className="space-y-2">
                  {events.map((e) => (
                    <li key={e.id}>
                      <Card
                        className={cn(
                          "border-border/70",
                          e.done && "opacity-70"
                        )}
                      >
                        <CardContent className="space-y-2 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold">
                                {e.isAllDay
                                  ? "Ganztägig"
                                  : [e.startHm, e.endHm]
                                      .filter(Boolean)
                                      .join("–")}{" "}
                                · {e.subject}
                              </p>
                              {e.location ? (
                                <p className="text-xs text-muted-foreground">
                                  {e.location}
                                </p>
                              ) : null}
                            </div>
                            {e.done ? (
                              <Badge variant="secondary">Erledigt</Badge>
                            ) : null}
                          </div>
                          {!e.done ? (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                disabled={busyId === e.id}
                                onClick={() => void markDone(e.id)}
                              >
                                <Check className="size-3.5" />
                                Erledigt
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={busyId === e.id}
                                onClick={() => void suggestSlots(e.id)}
                              >
                                Freien Slot suchen
                              </Button>
                              {e.webLink ? (
                                <a
                                  href={e.webLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={cn(
                                    buttonVariants({
                                      variant: "ghost",
                                      size: "sm",
                                    })
                                  )}
                                >
                                  In Outlook
                                </a>
                              ) : null}
                            </div>
                          ) : null}
                          {slotsByEvent[e.id]?.length ? (
                            <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Vorschläge (nächste 7 Tage, 08–18)
                              </p>
                              <ul className="flex flex-wrap gap-1.5">
                                {slotsByEvent[e.id]!.map((s) => (
                                  <li key={`${s.date}-${s.startHm}`}>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={busyId === e.id}
                                      onClick={() => void reschedule(e.id, s)}
                                    >
                                      {toSwissDate(s.date)} {s.startHm}–
                                      {s.endHm}
                                    </Button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[15px] font-semibold">
                  Heute · {inbox.length} Posteingang · {sent.length} Gesendet
                </h2>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={mailLoading}
                    onClick={() => void loadMail()}
                  >
                    <RefreshCw
                      className={cn("size-3.5", mailLoading && "animate-spin")}
                    />
                    Aktualisieren
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={analyzing || (inbox.length === 0 && sent.length === 0)}
                    onClick={() => void runAnalyze()}
                  >
                    <Sparkles
                      className={cn("size-3.5", analyzing && "animate-pulse")}
                    />
                    {analyzing ? "Analysiere…" : "AI Tagesanalyse"}
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Card className="border-border/70">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Posteingang</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {inbox.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Keine.</p>
                    ) : (
                      inbox.slice(0, 12).map((m) => (
                        <div key={m.id} className="border-b border-border/40 pb-2 last:border-0">
                          <p className="text-sm font-medium leading-snug">
                            {m.subject}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {m.from}
                          </p>
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {m.preview}
                          </p>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
                <Card className="border-border/70">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Gesendet</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {sent.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Keine.</p>
                    ) : (
                      sent.slice(0, 10).map((m) => (
                        <div key={m.id} className="border-b border-border/40 pb-2 last:border-0">
                          <p className="text-sm font-medium leading-snug">
                            {m.subject}
                          </p>
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {m.preview}
                          </p>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              {analysis ? (
                <Card className="border-border/70">
                  <CardHeader>
                    <CardTitle className="text-sm">AI · Tagesbild</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm leading-relaxed">{analysis.daySummary}</p>
                    {analysis.highlights.length > 0 ? (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Highlights
                        </p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
                          {analysis.highlights.map((h) => (
                            <li key={h}>{h}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {analysis.openLoops.length > 0 ? (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Offene Schleifen
                        </p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
                          {analysis.openLoops.map((h) => (
                            <li key={h}>{h}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {analysis.tasks.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Aufgaben-Vorschläge
                        </p>
                        <ul className="space-y-2">
                          {analysis.tasks.map((t, i) => (
                            <li
                              key={`${t.title}-${i}`}
                              className="flex items-start gap-2 rounded-lg border border-border/50 px-2.5 py-2"
                            >
                              <input
                                type="checkbox"
                                className="mt-1"
                                checked={Boolean(taskPick[i])}
                                onChange={(e) =>
                                  setTaskPick((prev) => ({
                                    ...prev,
                                    [i]: e.target.checked,
                                  }))
                                }
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-medium">{t.title}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {[
                                    t.dueDate
                                      ? `fällig ${toSwissDate(t.dueDate)}`
                                      : null,
                                    t.sourceSubject,
                                    t.reason,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ul>
                        <Button
                          type="button"
                          size="sm"
                          disabled={
                            applying ||
                            !analysis.tasks.some((_, i) => taskPick[i])
                          }
                          onClick={() => void applyTasks()}
                        >
                          {applying
                            ? "Speichere…"
                            : "Ausgewählte übernehmen"}
                        </Button>
                        <p className="text-[11px] text-muted-foreground">
                          Ziel: Google Tasks falls verbunden, sonst Buddy-Notiz.
                        </p>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}
            </section>
          )}
        </>
      ) : connected === null ? (
        <p className="text-sm text-muted-foreground">Lade…</p>
      ) : null}

      <p className="text-[12px] text-muted-foreground">
        OAuth und Status unter{" "}
        <Link href="/account" className="underline underline-offset-2">
          Konto
        </Link>
        .
      </p>
    </div>
  );
}
