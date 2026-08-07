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

type DayTask = {
  title: string;
  notes?: string | null;
  dueDate?: string | null;
  sourceMailId?: string | null;
  sourceSubject?: string | null;
  folder?: "inbox" | "sent" | null;
  company?: string | null;
  counterpartEmail?: string | null;
  theme?: string | null;
  reason?: string;
};

type DayEventSug = {
  title: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  allDay?: boolean;
  location?: string | null;
  notes?: string | null;
  sourceMailId?: string | null;
  sourceSubject?: string | null;
  company?: string | null;
  counterpartEmail?: string | null;
  theme?: string | null;
  reason?: string;
};

type DayReply = {
  to: string;
  subject: string;
  body: string;
  sourceMailId?: string | null;
  company?: string | null;
  theme?: string | null;
  reason?: string;
};

type DayCluster = {
  company: string;
  counterpartEmail?: string | null;
  theme: string;
  summary: string;
  status?: "open" | "waiting" | "done" | "fyi";
  tasks: DayTask[];
  events: DayEventSug[];
  replies: DayReply[];
};

type DayAnalysis = {
  daySummary: string;
  clusters: DayCluster[];
  tasks: DayTask[];
  events: DayEventSug[];
  replies: DayReply[];
};

type PickState = {
  tasks: Record<number, boolean>;
  events: Record<number, boolean>;
  replies: Record<number, boolean>;
};

const STATUS_LABEL: Record<string, string> = {
  open: "Offen",
  waiting: "Wartet",
  done: "Erledigt",
  fyi: "Info",
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
  const [picks, setPicks] = useState<PickState>({
    tasks: {},
    events: {},
    replies: {},
  });
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
      setAnalysis({
        daySummary: a.daySummary || "",
        clusters: a.clusters || [],
        tasks: a.tasks || [],
        events: a.events || [],
        replies: a.replies || [],
      });
      const next: PickState = { tasks: {}, events: {}, replies: {} };
      (a.tasks || []).forEach((_, i) => {
        next.tasks[i] = true;
      });
      (a.events || []).forEach((_, i) => {
        next.events[i] = true;
      });
      (a.replies || []).forEach((_, i) => {
        next.replies[i] = false;
      });
      setPicks(next);
      setStatus("Tagesanalyse fertig.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  }

  async function applySelected() {
    if (!analysis) return;
    const tasks = analysis.tasks.filter((_, i) => picks.tasks[i]);
    const eventsSel = analysis.events.filter((_, i) => picks.events[i]);
    const replies = analysis.replies.filter((_, i) => picks.replies[i]);
    if (tasks.length + eventsSel.length + replies.length === 0) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch("/api/microsoft/mail/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks, events: eventsSel, replies }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Übernehmen fehlgeschlagen");
      const parts = [
        json.taskOk
          ? `${json.taskOk} Aufgabe(n) → ${json.preferGoogleTasks ? "Google Tasks" : "Buddy-Notiz"}`
          : null,
        json.eventOk ? `${json.eventOk} Termin(e) → Outlook` : null,
        json.replyOk ? `${json.replyOk} Entwurf(e) → Outlook` : null,
      ].filter(Boolean);
      setStatus(parts.join(" · ") || `${json.okCount} übernommen`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  }

  const selectedCount = useMemo(() => {
    if (!analysis) return 0;
    return (
      analysis.tasks.filter((_, i) => picks.tasks[i]).length +
      analysis.events.filter((_, i) => picks.events[i]).length +
      analysis.replies.filter((_, i) => picks.replies[i]).length
    );
  }, [analysis, picks]);

  function flatTaskIndex(clusterIdx: number, localIdx: number): number {
    if (!analysis) return -1;
    let n = 0;
    for (let c = 0; c < clusterIdx; c++) n += analysis.clusters[c]?.tasks.length || 0;
    return n + localIdx;
  }
  function flatEventIndex(clusterIdx: number, localIdx: number): number {
    if (!analysis) return -1;
    let n = 0;
    for (let c = 0; c < clusterIdx; c++) n += analysis.clusters[c]?.events.length || 0;
    return n + localIdx;
  }
  function flatReplyIndex(clusterIdx: number, localIdx: number): number {
    if (!analysis) return -1;
    let n = 0;
    for (let c = 0; c < clusterIdx; c++) n += analysis.clusters[c]?.replies.length || 0;
    return n + localIdx;
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

                    {analysis.clusters.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Keine Cluster / Handlungsvorschläge.
                      </p>
                    ) : (
                      <ul className="space-y-3">
                        {analysis.clusters.map((cluster, ci) => (
                          <li
                            key={`${cluster.company}-${cluster.theme}-${ci}`}
                            className="rounded-lg border border-border/60 bg-muted/20 p-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold leading-snug">
                                  {cluster.company}
                                  <span className="font-normal text-muted-foreground">
                                    {" "}
                                    · {cluster.theme}
                                  </span>
                                </p>
                                {cluster.counterpartEmail ? (
                                  <p className="text-[11px] text-muted-foreground">
                                    {cluster.counterpartEmail}
                                  </p>
                                ) : null}
                              </div>
                              {cluster.status ? (
                                <Badge variant="secondary" className="text-[10px]">
                                  {STATUS_LABEL[cluster.status] || cluster.status}
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-1.5 text-sm leading-snug text-foreground/90">
                              {cluster.summary}
                            </p>

                            {cluster.tasks.length > 0 ? (
                              <div className="mt-3 space-y-1.5">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  Aufgaben
                                </p>
                                {cluster.tasks.map((t, li) => {
                                  const i = flatTaskIndex(ci, li);
                                  return (
                                    <label
                                      key={`t-${ci}-${li}`}
                                      className="flex items-start gap-2 rounded-md border border-border/40 bg-background px-2 py-1.5"
                                    >
                                      <input
                                        type="checkbox"
                                        className="mt-1"
                                        checked={Boolean(picks.tasks[i])}
                                        onChange={(e) =>
                                          setPicks((prev) => ({
                                            ...prev,
                                            tasks: {
                                              ...prev.tasks,
                                              [i]: e.target.checked,
                                            },
                                          }))
                                        }
                                      />
                                      <span className="min-w-0">
                                        <span className="block text-sm font-medium">
                                          {t.title}
                                        </span>
                                        <span className="block text-[11px] text-muted-foreground">
                                          {[
                                            t.dueDate
                                              ? `fällig ${toSwissDate(t.dueDate)}`
                                              : null,
                                            t.reason,
                                          ]
                                            .filter(Boolean)
                                            .join(" · ")}
                                        </span>
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            ) : null}

                            {cluster.events.length > 0 ? (
                              <div className="mt-3 space-y-1.5">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  Termine
                                </p>
                                {cluster.events.map((ev, li) => {
                                  const i = flatEventIndex(ci, li);
                                  return (
                                    <label
                                      key={`e-${ci}-${li}`}
                                      className="flex items-start gap-2 rounded-md border border-border/40 bg-background px-2 py-1.5"
                                    >
                                      <input
                                        type="checkbox"
                                        className="mt-1"
                                        checked={Boolean(picks.events[i])}
                                        onChange={(e) =>
                                          setPicks((prev) => ({
                                            ...prev,
                                            events: {
                                              ...prev.events,
                                              [i]: e.target.checked,
                                            },
                                          }))
                                        }
                                      />
                                      <span className="min-w-0">
                                        <span className="block text-sm font-medium">
                                          {ev.title}
                                        </span>
                                        <span className="block text-[11px] text-muted-foreground">
                                          {[
                                            toSwissDate(ev.date),
                                            ev.allDay || !ev.startTime
                                              ? "ganztags"
                                              : `${ev.startTime}${ev.endTime ? `–${ev.endTime}` : ""}`,
                                            ev.location,
                                            ev.reason,
                                          ]
                                            .filter(Boolean)
                                            .join(" · ")}
                                        </span>
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            ) : null}

                            {cluster.replies.length > 0 ? (
                              <div className="mt-3 space-y-1.5">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  Antwort-Entwürfe
                                </p>
                                {cluster.replies.map((r, li) => {
                                  const i = flatReplyIndex(ci, li);
                                  return (
                                    <label
                                      key={`r-${ci}-${li}`}
                                      className="flex items-start gap-2 rounded-md border border-border/40 bg-background px-2 py-1.5"
                                    >
                                      <input
                                        type="checkbox"
                                        className="mt-1"
                                        checked={Boolean(picks.replies[i])}
                                        onChange={(e) =>
                                          setPicks((prev) => ({
                                            ...prev,
                                            replies: {
                                              ...prev.replies,
                                              [i]: e.target.checked,
                                            },
                                          }))
                                        }
                                      />
                                      <span className="min-w-0">
                                        <span className="block text-sm font-medium">
                                          {r.subject}
                                        </span>
                                        <span className="block text-[11px] text-muted-foreground">
                                          An {r.to}
                                          {r.reason ? ` · ${r.reason}` : ""}
                                        </span>
                                        <span className="mt-1 block whitespace-pre-wrap text-xs text-foreground/80">
                                          {r.body}
                                        </span>
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}

                    {selectedCount > 0 ||
                    analysis.tasks.length +
                      analysis.events.length +
                      analysis.replies.length >
                      0 ? (
                      <div className="space-y-2 border-t border-border/50 pt-3">
                        <Button
                          type="button"
                          size="sm"
                          disabled={applying || selectedCount === 0}
                          onClick={() => void applySelected()}
                        >
                          {applying
                            ? "Speichere…"
                            : `Ausgewählte übernehmen (${selectedCount})`}
                        </Button>
                        <p className="text-[11px] text-muted-foreground">
                          Aufgaben → Google Tasks (falls verbunden) oder Buddy-Notiz.
                          Termine & Antwort-Entwürfe → Outlook.
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
