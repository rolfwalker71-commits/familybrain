"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  CalendarClock,
  Cloud,
  Mail,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/layout/page-primitives";
import { cn } from "@/lib/utils";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { formatTokenUsageLine } from "@/lib/ai/usage-cost";
import type { AiTokenUsage } from "@/lib/ai/usage-cost";
import { toSwissDate } from "@/lib/utils/dates";

function zurichYmdClient(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** ISO → `TT.MM.JJJJ, HH:MM` in Europe/Zurich. */
function toSwissDateTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return toSwissDate(iso);
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function addDaysYmdClient(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

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
  senderInitials?: string | null;
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
  usage?: AiTokenUsage | null;
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
  const [mailDay, setMailDay] = useState(() => zurichYmdClient());
  const [mailLoading, setMailLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeNotice, setAnalyzeNotice] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<DayAnalysis | null>(null);
  const [cachedDays, setCachedDays] = useState<string[]>([]);
  const [analysisFromCache, setAnalysisFromCache] = useState(false);
  const [picks, setPicks] = useState<PickState>({
    tasks: {},
    events: {},
    replies: {},
  });
  const [applying, setApplying] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [draftTasks, setDraftTasks] = useState<DayTask[]>([]);
  const [draftEvents, setDraftEvents] = useState<DayEventSug[]>([]);
  const [draftReplies, setDraftReplies] = useState<DayReply[]>([]);
  const pollRef = useRef<number | null>(null);

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

  const loadMail = useCallback(async (day?: string) => {
    const target = day || mailDay;
    setMailLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/microsoft/mail/today?date=${encodeURIComponent(target)}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Mails laden fehlgeschlagen");
      setInbox((json.inbox || []) as MsMail[]);
      setSent((json.sent || []) as MsMail[]);
      if (json.dayIso) setMailDay(json.dayIso);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMailLoading(false);
    }
  }, [mailDay]);

  useEffect(() => {
    void loadConnection();
  }, [loadConnection]);

  useEffect(() => {
    if (connected) {
      void loadCalendar();
      void loadMail(mailDay);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load when connected
  }, [connected]);

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

  const applyAnalysisPayload = useCallback(
    (
      a: DayAnalysis,
      dayLabel: string,
      finishedAt?: string | null,
      opts?: { fromCache?: boolean }
    ) => {
      setAnalysis({
        daySummary: a.daySummary || "",
        clusters: a.clusters || [],
        tasks: a.tasks || [],
        events: a.events || [],
        replies: a.replies || [],
        usage: a.usage || null,
      });
      const next: PickState = { tasks: {}, events: {}, replies: {} };
      (a.tasks || []).forEach((_, i) => {
        next.tasks[i] = true;
      });
      (a.events || []).forEach((_, i) => {
        next.events[i] = true;
      });
      (a.replies || []).forEach((_, i) => {
        next.replies[i] = true;
      });
      setPicks(next);
      setAnalysisFromCache(Boolean(opts?.fromCache));
      const when = finishedAt
        ? toSwissDateTime(finishedAt)
        : toSwissDate(dayLabel);
      const usageLine = formatTokenUsageLine(a.usage);
      const prefix = opts?.fromCache
        ? `Gespeicherte Analyse (${when})`
        : `Analyse fertig (${when})`;
      setAnalyzeNotice(
        [
          `${prefix}: ${(a.clusters || []).length} Cluster, ${(a.tasks || []).length} Aufgabe(n), ${(a.replies || []).length} Antwort(en).`,
          usageLine,
        ]
          .filter(Boolean)
          .join(" ")
      );
      setTab("mail");
    },
    []
  );

  const stopPoll = useCallback(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const hydrateFromJob = useCallback(
    (
      job: {
        status: string;
        dayIso: string;
        finishedAt?: string | null;
        error?: string | null;
        mail?: { inbox?: MsMail[]; sent?: MsMail[]; dayIso?: string } | null;
        analysis?: DayAnalysis | null;
      },
      opts?: { syncDay?: boolean; fromCache?: boolean }
    ) => {
      const syncDay = Boolean(opts?.syncDay);
      if (job.mail) {
        setInbox((job.mail.inbox || []) as MsMail[]);
        setSent((job.mail.sent || []) as MsMail[]);
      }
      if (job.status === "running") {
        setAnalyzing(true);
        setAnalysisFromCache(false);
        setAnalyzeNotice(
          `Analyse für ${toSwissDate(job.dayIso)} läuft im Hintergrund…`
        );
        if (syncDay && job.dayIso) setMailDay(job.dayIso);
        return;
      }
      if (job.status === "done" && job.analysis) {
        setAnalyzing(false);
        if (syncDay && job.dayIso) setMailDay(job.dayIso);
        applyAnalysisPayload(job.analysis, job.dayIso, job.finishedAt, {
          fromCache: opts?.fromCache,
        });
        return;
      }
      if (job.status === "error") {
        setAnalyzing(false);
        setAnalysisFromCache(false);
        setError(job.error || "Analyse fehlgeschlagen");
        setAnalyzeNotice(null);
      }
    },
    [applyAnalysisPayload]
  );

  const pollJobOnce = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/microsoft/mail/analyze?date=${encodeURIComponent(mailDay)}`
      );
      const json = await res.json();
      if (!res.ok) return json.status as string | undefined;
      if (Array.isArray(json.cachedDays)) setCachedDays(json.cachedDays);
      if (json.job) {
        // Während/nach dem Lauf Tag nur syncen, wenn er zum gestarteten Job gehört
        hydrateFromJob(json.job, {
          syncDay: json.job.dayIso === mailDay || json.status === "running",
          fromCache: false,
        });
      }
      if (json.status === "done" || json.status === "error" || json.status === "idle") {
        stopPoll();
        if (json.status !== "running") setAnalyzing(false);
      }
      return json.status as string;
    } catch {
      return undefined;
    }
  }, [hydrateFromJob, mailDay, stopPoll]);

  const startPolling = useCallback(() => {
    stopPoll();
    void pollJobOnce();
    pollRef.current = window.setInterval(() => {
      void pollJobOnce();
    }, 2500);
  }, [pollJobOnce, stopPoll]);

  const loadAnalysisForDay = useCallback(
    async (day: string) => {
      try {
        const res = await fetch(
          `/api/microsoft/mail/analyze?date=${encodeURIComponent(day)}`
        );
        const json = await res.json();
        if (!res.ok) return;
        if (Array.isArray(json.cachedDays)) setCachedDays(json.cachedDays);

        if (json.status === "running") {
          if (json.job?.dayIso === day) {
            hydrateFromJob(json.job, { syncDay: false });
            startPolling();
            return;
          }
          if (json.cachedJob?.analysis) {
            hydrateFromJob(json.cachedJob, {
              syncDay: false,
              fromCache: true,
            });
            return;
          }
          setAnalysis(null);
          setAnalyzeNotice(
            `Analyse für ${toSwissDate(json.job?.dayIso || "")} läuft noch — dieser Tag hat keine gespeicherte Analyse.`
          );
          setAnalysisFromCache(false);
          setPicks({ tasks: {}, events: {}, replies: {} });
          return;
        }

        if (json.status === "done" && json.job?.analysis) {
          hydrateFromJob(json.job, {
            syncDay: false,
            fromCache: Boolean(json.fromCache),
          });
          return;
        }

        setAnalysis(null);
        setAnalyzeNotice(null);
        setAnalysisFromCache(false);
        setPicks({ tasks: {}, events: {}, replies: {} });
      } catch {
        /* ignore */
      }
    },
    [hydrateFromJob, startPolling]
  );

  useEffect(() => {
    return () => stopPoll();
  }, [stopPoll]);

  // Einmalig nach Connect: letzten Job wiederherstellen — darf den Picker später
  // nicht erneut auf job.dayIso zurücksetzen (startPolling ändert sich mit mailDay).
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/microsoft/mail/analyze");
        const json = await res.json();
        if (cancelled || !res.ok) return;
        if (Array.isArray(json.cachedDays)) setCachedDays(json.cachedDays);
        if (!json.job) return;
        hydrateFromJob(json.job, {
          syncDay: true,
          fromCache: Boolean(json.fromCache),
        });
        if (json.status === "running") startPolling();
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur bei Connect
  }, [connected]);

  function startAnalyze() {
    setError(null);
    setStatus(null);
    setAnalyzing(true);
    setAnalyzeNotice(
      `Analyse für ${toSwissDate(mailDay)} läuft im Hintergrund…`
    );
    void (async () => {
      try {
        const res = await fetch("/api/microsoft/mail/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: mailDay }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Analyse starten fehlgeschlagen");
        if (Array.isArray(json.cachedDays)) setCachedDays(json.cachedDays);
        if (json.job) hydrateFromJob(json.job, { fromCache: false });
        startPolling();
      } catch (err) {
        setAnalyzing(false);
        setAnalyzeNotice(null);
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }

  function openConfirm() {
    if (!analysis) return;
    const tasks = analysis.tasks.filter((_, i) => picks.tasks[i]);
    const eventsSel = analysis.events.filter((_, i) => picks.events[i]);
    const replies = analysis.replies.filter((_, i) => picks.replies[i]);
    if (tasks.length + eventsSel.length + replies.length === 0) return;
    const tomorrow = addDaysYmdClient(zurichYmdClient(), 1);
    setDraftTasks(
      tasks.map((t) => ({
        ...t,
        dueDate: t.dueDate || tomorrow,
      }))
    );
    setDraftEvents(eventsSel.map((e) => ({ ...e })));
    setDraftReplies(replies.map((r) => ({ ...r })));
    setConfirmOpen(true);
  }

  async function applyConfirmed() {
    if (
      draftTasks.length + draftEvents.length + draftReplies.length ===
      0
    ) {
      return;
    }
    setApplying(true);
    setError(null);
    try {
      const res = await fetch("/api/microsoft/mail/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: draftTasks,
          events: draftEvents,
          replies: draftReplies,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Übernehmen fehlgeschlagen");
      if (json.failCount > 0 && json.okCount === 0) {
        throw new Error(
          (json.errors || []).join(" · ") || "Übernehmen fehlgeschlagen"
        );
      }
      const parts = [
        json.taskOk ? `${json.taskOk} Aufgabe(n) → Outlook To Do` : null,
        json.eventOk ? `${json.eventOk} Termin(e) → Outlook` : null,
        json.replyOk ? `${json.replyOk} Entwurf(e) → Outlook` : null,
      ].filter(Boolean);
      setStatus(
        [
          parts.join(" · ") || `${json.okCount} übernommen`,
          json.failCount
            ? `(${json.failCount} fehlgeschlagen: ${(json.errors || []).join("; ")})`
            : null,
        ]
          .filter(Boolean)
          .join(" ")
      );
      setPicks({ tasks: {}, events: {}, replies: {} });
      setConfirmOpen(false);
      setDraftTasks([]);
      setDraftEvents([]);
      setDraftReplies([]);
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
    for (let c = 0; c < clusterIdx; c++)
      n += analysis.clusters[c]?.tasks.length || 0;
    return n + localIdx;
  }
  function flatEventIndex(clusterIdx: number, localIdx: number): number {
    if (!analysis) return -1;
    let n = 0;
    for (let c = 0; c < clusterIdx; c++)
      n += analysis.clusters[c]?.events.length || 0;
    return n + localIdx;
  }
  function flatReplyIndex(clusterIdx: number, localIdx: number): number {
    if (!analysis) return -1;
    let n = 0;
    for (let c = 0; c < clusterIdx; c++)
      n += analysis.clusters[c]?.replies.length || 0;
    return n + localIdx;
  }

  return (
    <div className="min-w-0 space-y-5 pb-10">
      <PageHeader
        title="Microsoft 365"
        description="Abend-Review für Outlook-Termine und Tages-Mails (Posteingang + Gesendet)."
        icon={Cloud}
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
          {analyzeNotice ? (
            <div
              className={cn(
                "rounded-lg border px-3 py-2 text-sm",
                analyzing
                  ? "border-sky-200 bg-sky-50 text-sky-950"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900"
              )}
              role="status"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p>{analyzeNotice}</p>
                  {analyzing ? (
                    <p className="mt-0.5 text-[11px] opacity-80">
                      Läuft serverseitig — du kannst die Seite verlassen. Bei
                      Rückkehr erscheinen die Resultate automatisch; zusätzlich
                      Toast und Push-Benachrichtigung wenn fertig.
                    </p>
                  ) : null}
                </div>
                {!analyzing ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setAnalyzeNotice(null)}
                  >
                    Schliessen
                  </Button>
                ) : null}
              </div>
            </div>
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
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="space-y-1.5">
                  <h2 className="text-[15px] font-semibold">
                    {toSwissDate(mailDay)} · {inbox.length} Posteingang ·{" "}
                    {sent.length} Gesendet
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor="ms-mail-day" className="text-xs text-muted-foreground">
                      Analysedatum
                    </Label>
                    <Input
                      id="ms-mail-day"
                      type="date"
                      className="h-8 w-auto min-w-[9.5rem]"
                      value={mailDay}
                      max={zurichYmdClient()}
                      onValueChange={(v) => {
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v === mailDay) return;
                        setMailDay(v);
                        setAnalysis(null);
                        setAnalyzeNotice(null);
                        setAnalysisFromCache(false);
                        setPicks({ tasks: {}, events: {}, replies: {} });
                        void loadMail(v);
                        void loadAnalysisForDay(v);
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={mailLoading}
                      onClick={() => void loadMail(mailDay)}
                    >
                      Mails laden
                    </Button>
                    {cachedDays.includes(mailDay) ? (
                      <span className="text-[11px] text-muted-foreground">
                        Analyse gespeichert
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={mailLoading}
                    onClick={() => void loadMail(mailDay)}
                  >
                    <RefreshCw
                      className={cn("size-3.5", mailLoading && "animate-spin")}
                    />
                    Aktualisieren
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={analyzing}
                    onClick={() => startAnalyze()}
                  >
                    <Sparkles
                      className={cn("size-3.5", analyzing && "animate-pulse")}
                    />
                    {analyzing
                      ? "Analyse läuft…"
                      : analysis && cachedDays.includes(mailDay)
                        ? "Neu analysieren"
                        : "AI Tagesanalyse"}
                  </Button>
                </div>
              </div>

              {analysis ? (
                <Card className="border-border/70">
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                      AI · Tagesbild
                      {analysisFromCache ? (
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          gespeichert
                        </Badge>
                      ) : null}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm leading-relaxed">{analysis.daySummary}</p>
                    {formatTokenUsageLine(analysis.usage) ? (
                      <p className="text-[11px] text-muted-foreground">
                        Tokens · {formatTokenUsageLine(analysis.usage)}
                      </p>
                    ) : null}

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
                          onClick={() => openConfirm()}
                        >
                          {`Ausgewählte prüfen (${selectedCount})`}
                        </Button>
                        <p className="text-[11px] text-muted-foreground">
                          Alles über Outlook: Aufgaben → To Do, Termine →
                          Kalender, Antworten → Entwürfe. Vor dem Anlegen kannst
                          du Texte noch anpassen.
                        </p>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}

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

            </section>
          )}
        </>
      ) : connected === null ? (
        <p className="text-sm text-muted-foreground">Lade…</p>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="flex max-h-[90dvh] w-[min(96vw,36rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="border-b border-border/60 px-4 py-3">
            <DialogTitle>Übernehmen bestätigen</DialogTitle>
            <DialogDescription>
              Texte und Daten bei Bedarf anpassen, dann in Outlook anlegen.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
            {draftTasks.map((t, i) => (
              <div key={`dt-${i}`} className="space-y-2 rounded-lg border border-border/60 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Aufgabe · Outlook To Do
                </p>
                <div className="space-y-1">
                  <Label>Titel</Label>
                  <Input
                    value={t.title}
                    onChange={(e) =>
                      setDraftTasks((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, title: e.target.value } : x
                        )
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Fällig</Label>
                  <Input
                    type="date"
                    value={t.dueDate || ""}
                    onChange={(e) =>
                      setDraftTasks((prev) =>
                        prev.map((x, j) =>
                          j === i
                            ? { ...x, dueDate: e.target.value || null }
                            : x
                        )
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Notizen</Label>
                  <Textarea
                    rows={3}
                    value={t.notes || ""}
                    onChange={(e) =>
                      setDraftTasks((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, notes: e.target.value } : x
                        )
                      )
                    }
                  />
                </div>
              </div>
            ))}
            {draftEvents.map((ev, i) => (
              <div key={`de-${i}`} className="space-y-2 rounded-lg border border-border/60 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Termin · Outlook Kalender
                </p>
                <div className="space-y-1">
                  <Label>Titel</Label>
                  <Input
                    value={ev.title}
                    onChange={(e) =>
                      setDraftEvents((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, title: e.target.value } : x
                        )
                      )
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Datum</Label>
                    <Input
                      type="date"
                      value={ev.date}
                      onChange={(e) =>
                        setDraftEvents((prev) =>
                          prev.map((x, j) =>
                            j === i ? { ...x, date: e.target.value } : x
                          )
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Start</Label>
                    <Input
                      type="time"
                      value={ev.startTime || ""}
                      onChange={(e) =>
                        setDraftEvents((prev) =>
                          prev.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  startTime: e.target.value || null,
                                  allDay: !e.target.value,
                                }
                              : x
                          )
                        )
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Notizen</Label>
                  <Textarea
                    rows={2}
                    value={ev.notes || ""}
                    onChange={(e) =>
                      setDraftEvents((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, notes: e.target.value } : x
                        )
                      )
                    }
                  />
                </div>
              </div>
            ))}
            {draftReplies.map((r, i) => (
              <div key={`dr-${i}`} className="space-y-2 rounded-lg border border-border/60 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Antwort · Outlook Entwurf
                </p>
                <div className="space-y-1">
                  <Label>An</Label>
                  <Input
                    value={r.to}
                    onChange={(e) =>
                      setDraftReplies((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, to: e.target.value } : x
                        )
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Betreff</Label>
                  <Input
                    value={r.subject}
                    onChange={(e) =>
                      setDraftReplies((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, subject: e.target.value } : x
                        )
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Text</Label>
                  <Textarea
                    rows={5}
                    value={r.body}
                    onChange={(e) =>
                      setDraftReplies((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, body: e.target.value } : x
                        )
                      )
                    }
                  />
                </div>
              </div>
            ))}
          </div>
          <DialogFooter className="border-t border-border/60 px-4 py-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={applying}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              disabled={
                applying ||
                draftTasks.length + draftEvents.length + draftReplies.length ===
                  0
              }
              onClick={() => void applyConfirmed()}
            >
              {applying ? "Lege an…" : "In Outlook anlegen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-[12px] text-muted-foreground">
        OAuth und Status unter{" "}
        <Link href="/account" className="underline underline-offset-2">
          Konto
        </Link>
        . Für Aufgaben ggf. Microsoft 365 neu verbinden (To Do / Tasks.ReadWrite).
      </p>
    </div>
  );
}
