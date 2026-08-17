"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Check,
  CalendarClock,
  ListChecks,
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
import {
  GmailLogo,
  GoogleLogo,
  GoogleTasksLogo,
} from "@/components/branding/provider-logos";
import { PageHeader } from "@/components/layout/page-primitives";
import { cn } from "@/lib/utils";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { formatTokenUsageLine } from "@/lib/ai/usage-cost";
import type { AiTokenUsage } from "@/lib/ai/usage-cost";
import { toSwissDate } from "@/lib/utils/dates";
import {
  durationMinutesFromHm,
  groupFreeSlotsByDate,
  isSlotDurationPreset,
  SLOT_DURATION_PRESETS,
} from "@/lib/calendar/slot-duration";
import { weekdayLabel } from "@/components/calendar/agenda-row";
import { GoogleMailInboxPanel } from "@/components/google/google-mail-inbox-panel";
import { GoogleTasksPanel } from "@/components/google/google-tasks-panel";
import { MailWorkspaceSubnav, type MailWorkspaceView, mailWorkspacePrimaryBtnClass, mailWorkspaceTabClass } from "@/components/mail/mail-workspace-subnav";
import {
  MailChronikList,
  MailChronikSummary,
  countMailsInRange,
  mergeMailChronik,
} from "@/components/mail/mail-chronik-list";
import { MailAnalysisThreadHint } from "@/components/mail/mail-analysis-thread-hint";
import { MailTagesanalysenList } from "@/components/mail/mail-tagesanalysen-list";
import {
  AnalysisEventDraftCard,
  analysisEventsNeedSlot,
} from "@/components/mail/analysis-event-draft-card";
import { summarizeMailThreadCoverage } from "@/lib/mail/mail-threads";
import type { MailDayCachedSummary } from "@/lib/mail/mail-day-cache-summary";
import type { MsMailItem } from "@/lib/microsoft/mail-day";
import { pageVisuals } from "@/components/layout/icon-circle";
import {
  detectReplyLanguage,
  type ReplyLang,
} from "@/lib/microsoft/reply-language-shared";

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

function mailRangeKey(from: string, to: string): string {
  return `${from}_${to}`;
}

function formatMailRangeLabel(from: string, to: string): string {
  if (from === to) return toSwissDate(from);
  return `${toSwissDate(from)} – ${toSwissDate(to)}`;
}

/** Inclusive max 7 days; clamp Bis ≥ Von and ≤ today. */
function clampMailRange(from: string, to: string): { from: string; to: string } {
  const today = zurichYmdClient();
  let f = from;
  let t = to;
  if (t < f) t = f;
  const maxTo = addDaysYmdClient(f, 6);
  if (t > maxTo) t = maxTo;
  if (t > today) t = today;
  if (f > today) f = today;
  if (t < f) t = f;
  return { from: f, to: t };
}

type Tab = "calendar" | "mail" | "triage" | "tasks";

function parseTab(raw: string | null, openId: string | null): Tab {
  if (openId && (!raw || raw === "inbox" || raw === "mail")) return "triage";
  if (raw === "triage" || raw === "calendar" || raw === "tasks" || raw === "mail") {
    return raw;
  }
  if (raw === "inbox") return "mail";
  if (raw === "day") return "mail";
  return "mail";
}

function parseMailView(raw: string | null, tabRaw: string | null): MailWorkspaceView {
  if (raw === "chronik" || raw === "tagesanalysen") return raw;
  if (tabRaw === "day") return "tagesanalysen";
  return "chronik";
}

type MsMail = MsMailItem;

type GCalEvent = {
  id: string;
  calendarId: string;
  subject: string;
  startHm: string | null;
  endHm: string | null;
  date: string;
  location: string | null;
  isAllDay: boolean;
  done: boolean;
  htmlLink: string | null;
};

type FreeSlot = {
  date: string;
  startHm: string;
  endHm: string;
  durationMinutes: number;
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
  existingTask?: {
    id: string;
    title: string;
    status: "open" | "done";
    doneAt?: string | null;
    href?: string | null;
    match?: "title" | "theme" | "notes";
  } | null;
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
  fromTaskTwin?: boolean;
};

type DayReply = {
  to: string;
  subject: string;
  body: string;
  language?: ReplyLang | null;
  sourceMailId?: string | null;
  company?: string | null;
  theme?: string | null;
  reason?: string;
};

function currentReplyLang(r: DayReply): ReplyLang {
  if (r.language === "en" || r.language === "de") return r.language;
  return detectReplyLanguage(`${r.subject}\n${r.body}`);
}

function ReplyLangToggle({
  lang,
  busy,
  onChange,
}: {
  lang: ReplyLang;
  busy: boolean;
  onChange: (lang: ReplyLang) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border border-border/60 p-0.5"
      onClick={(e) => e.preventDefault()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {(["de", "en"] as const).map((code) => (
        <Button
          key={code}
          type="button"
          variant="ghost"
          size="xs"
          disabled={busy}
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
            lang === code
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange(code);
          }}
        >
          {code}
        </Button>
      ))}
    </div>
  );
}

type DayCluster = {
  company: string;
  counterpartEmail?: string | null;
  theme: string;
  summary: string;
  status?: "open" | "waiting" | "done" | "fyi";
  /** false = nur Info / Chip «keine Aktion». */
  actionNeeded?: boolean;
  tasks: DayTask[];
  events: DayEventSug[];
  replies: DayReply[];
};

function clusterNeedsAction(cluster: DayCluster): boolean {
  if (typeof cluster.actionNeeded === "boolean") return cluster.actionNeeded;
  if (
    cluster.tasks.length > 0 ||
    cluster.events.length > 0 ||
    cluster.replies.length > 0
  ) {
    return true;
  }
  if (cluster.status === "open" || cluster.status === "waiting") return true;
  return false;
}

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

export function GoogleWorkspaceClient() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() =>
    parseTab(searchParams.get("tab"), searchParams.get("open"))
  );
  const [mailView, setMailView] = useState<MailWorkspaceView>(() =>
    parseMailView(searchParams.get("view"), searchParams.get("tab"))
  );
  const [openMailId, setOpenMailId] = useState<string | null>(
    () => searchParams.get("open")
  );
  const [inboxPending, setInboxPending] = useState(0);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [oauthBanner, setOauthBanner] = useState<string | null>(null);

  const [events, setEvents] = useState<GCalEvent[]>([]);
  const [calLoading, setCalLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [slotsByEvent, setSlotsByEvent] = useState<Record<string, FreeSlot[]>>(
    {}
  );
  const [slotDurationByEvent, setSlotDurationByEvent] = useState<
    Record<string, number>
  >({});

  const [inbox, setInbox] = useState<MsMail[]>([]);
  const [sent, setSent] = useState<MsMail[]>([]);
  const [mailFrom, setMailFrom] = useState(() => zurichYmdClient());
  const [mailTo, setMailTo] = useState(() => zurichYmdClient());
  const [mailLoading, setMailLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeNotice, setAnalyzeNotice] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<DayAnalysis | null>(null);
  const [showAllThreads, setShowAllThreads] = useState(false);
  const [cachedDays, setCachedDays] = useState<string[]>([]);
  const [cachedEntries, setCachedEntries] = useState<MailDayCachedSummary[]>(
    []
  );
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
  const [translatingReply, setTranslatingReply] = useState<string | null>(
    null
  );
  const pollRef = useRef<number | null>(null);

  const loadConnection = useCallback(async () => {
    try {
      const res = await fetch("/api/google/connection");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Status fehlgeschlagen");
      setConnected(Boolean(json.connected));
      setConnectedEmail(json.connectedEmail || null);
    } catch (err) {
      setConnected(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const loadTriagePending = useCallback(async () => {
    try {
      const res = await fetch("/api/mail/triage");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setInboxPending(Number(json.pendingCount) || 0);
    } catch {
      /* Badge optional */
    }
  }, []);

  const loadCalendar = useCallback(async () => {
    setCalLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/google/calendar/today");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Kalender laden fehlgeschlagen");
      setEvents((json.events || []) as GCalEvent[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCalLoading(false);
    }
  }, []);

  const loadMail = useCallback(async (from?: string, to?: string) => {
    const clamped = clampMailRange(from || mailFrom, to || mailTo);
    setMailLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        from: clamped.from,
        to: clamped.to,
      });
      const res = await fetch(`/api/google/mail/today?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Mails laden fehlgeschlagen");
      setInbox((json.inbox || []) as MsMail[]);
      setSent((json.sent || []) as MsMail[]);
      if (json.fromYmd) setMailFrom(json.fromYmd);
      if (json.toYmd) setMailTo(json.toYmd);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMailLoading(false);
    }
  }, [mailFrom, mailTo]);

  useEffect(() => {
    void loadConnection();
  }, [loadConnection]);

  useEffect(() => {
    const g = searchParams.get("google");
    if (g === "connected") {
      setOauthBanner("Google-Konto verbunden.");
    } else if (g === "error") {
      setOauthBanner(
        `Google-Verbindung fehlgeschlagen: ${
          searchParams.get("reason") || "unbekannt"
        }`
      );
    }
    const t = searchParams.get("tab");
    if (t) setTab(parseTab(t, searchParams.get("open")));
    setMailView(parseMailView(searchParams.get("view"), t));
  }, [searchParams]);

  useEffect(() => {
    if (connected) {
      void loadCalendar();
      void loadMail(mailFrom, mailTo);
      void loadTriagePending();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load when connected
  }, [connected]);

  const openEvents = useMemo(
    () => events.filter((e) => !e.done),
    [events]
  );

  const mailThreadCoverage = useMemo(
    () => summarizeMailThreadCoverage(inbox, sent),
    [inbox, sent]
  );

  async function markDone(event: GCalEvent) {
    setBusyId(event.id);
    setError(null);
    try {
      const res = await fetch("/api/google/calendar/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "done",
          eventId: event.id,
          calendarId: event.calendarId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Markieren fehlgeschlagen");
      setStatus("Als erledigt markiert (Titel-Präfix ✅).");
      await loadCalendar();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  function slotDurationFor(e: GCalEvent): number {
    return (
      slotDurationByEvent[e.id] ??
      durationMinutesFromHm(e.startHm, e.endHm)
    );
  }

  async function suggestSlots(event: GCalEvent, durationMinutes?: number) {
    const duration = durationMinutes ?? slotDurationFor(event);
    setSlotDurationByEvent((prev) => ({ ...prev, [event.id]: duration }));
    setBusyId(event.id);
    setError(null);
    try {
      const res = await fetch("/api/google/calendar/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "suggest_slots",
          eventId: event.id,
          calendarId: event.calendarId,
          durationMinutes: duration,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Slots fehlgeschlagen");
      setSlotsByEvent((prev) => ({
        ...prev,
        [event.id]: (json.slots || []) as FreeSlot[],
      }));
      if (!(json.slots || []).length) {
        setStatus(
          `Keine freien Slots à ${duration} Min in den nächsten 7 Tagen (08–18).`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function reschedule(event: GCalEvent, slot: FreeSlot) {
    setBusyId(event.id);
    setError(null);
    try {
      const res = await fetch("/api/google/calendar/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reschedule",
          eventId: event.id,
          calendarId: event.calendarId,
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
        delete next[event.id];
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
      setShowAllThreads(false);
      const next: PickState = { tasks: {}, events: {}, replies: {} };
      (a.tasks || []).forEach((t, i) => {
        next.tasks[i] = !t.existingTask?.id;
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
      setMailView("tagesanalysen");
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
        fromYmd?: string;
        toYmd?: string;
        rangeKey?: string;
        finishedAt?: string | null;
        error?: string | null;
        mail?: { inbox?: MsMail[]; sent?: MsMail[]; dayIso?: string } | null;
        analysis?: DayAnalysis | null;
      },
      opts?: { syncDay?: boolean; fromCache?: boolean }
    ) => {
      const syncDay = Boolean(opts?.syncDay);
      const fromYmd = job.fromYmd || job.dayIso;
      const toYmd = job.toYmd || job.dayIso;
      const label = formatMailRangeLabel(fromYmd, toYmd);
      if (job.mail) {
        setInbox((job.mail.inbox || []) as MsMail[]);
        setSent((job.mail.sent || []) as MsMail[]);
      }
      if (job.status === "running") {
        setAnalyzing(true);
        setAnalysisFromCache(false);
        setAnalyzeNotice(`Analyse für ${label} läuft im Hintergrund (inkl. vollständiger Threads)…`);
        if (syncDay && fromYmd && toYmd) {
          setMailFrom(fromYmd);
          setMailTo(toYmd);
        }
        return;
      }
      if (job.status === "done" && job.analysis) {
        setAnalyzing(false);
        if (syncDay && fromYmd && toYmd) {
          setMailFrom(fromYmd);
          setMailTo(toYmd);
        }
        applyAnalysisPayload(job.analysis, label, job.finishedAt, {
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
    const key = mailRangeKey(mailFrom, mailTo);
    try {
      const qs = new URLSearchParams({ from: mailFrom, to: mailTo });
      const res = await fetch(`/api/google/mail/analyze?${qs}`);
      const json = await res.json();
      if (!res.ok) return json.status as string | undefined;
      if (Array.isArray(json.cachedDays)) setCachedDays(json.cachedDays);
        if (Array.isArray(json.cachedEntries)) {
          setCachedEntries(json.cachedEntries as MailDayCachedSummary[]);
        }
      if (json.job) {
        const jobKey =
          json.job.rangeKey ||
          mailRangeKey(json.job.fromYmd || json.job.dayIso, json.job.toYmd || json.job.dayIso);
        hydrateFromJob(json.job, {
          syncDay: jobKey === key || json.status === "running",
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
  }, [hydrateFromJob, mailFrom, mailTo, stopPoll]);

  const startPolling = useCallback(() => {
    stopPoll();
    void pollJobOnce();
    pollRef.current = window.setInterval(() => {
      void pollJobOnce();
    }, 2500);
  }, [pollJobOnce, stopPoll]);

  const loadAnalysisForRange = useCallback(
    async (from: string, to: string) => {
      const clamped = clampMailRange(from, to);
      const key = mailRangeKey(clamped.from, clamped.to);
      try {
        const qs = new URLSearchParams({
          from: clamped.from,
          to: clamped.to,
        });
        const res = await fetch(`/api/google/mail/analyze?${qs}`);
        const json = await res.json();
        if (!res.ok) return;
        if (Array.isArray(json.cachedDays)) setCachedDays(json.cachedDays);
        if (Array.isArray(json.cachedEntries)) {
          setCachedEntries(json.cachedEntries as MailDayCachedSummary[]);
        }

        if (json.status === "running") {
          const jobKey =
            json.job?.rangeKey ||
            (json.job?.dayIso
              ? mailRangeKey(
                  json.job.fromYmd || json.job.dayIso,
                  json.job.toYmd || json.job.dayIso
                )
              : null);
          if (jobKey === key) {
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
            `Analyse für ${formatMailRangeLabel(
              json.job?.fromYmd || json.job?.dayIso || "",
              json.job?.toYmd || json.job?.dayIso || ""
            )} läuft noch — dieser Zeitraum hat keine gespeicherte Analyse.`
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

  // Einmalig nach Connect: letzten Job wiederherstellen
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/google/mail/analyze");
        const json = await res.json();
        if (cancelled || !res.ok) return;
        if (Array.isArray(json.cachedDays)) setCachedDays(json.cachedDays);
        if (Array.isArray(json.cachedEntries)) {
          setCachedEntries(json.cachedEntries as MailDayCachedSummary[]);
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  function startAnalyze() {
    const clamped = clampMailRange(mailFrom, mailTo);
    setMailFrom(clamped.from);
    setMailTo(clamped.to);
    setError(null);
    setStatus(null);
    setAnalyzing(true);
    setAnalyzeNotice(
      `Analyse für ${formatMailRangeLabel(clamped.from, clamped.to)} läuft im Hintergrund (inkl. vollständiger Threads)…`
    );
    void (async () => {
      try {
        const res = await fetch("/api/google/mail/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from: clamped.from, to: clamped.to }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Analyse starten fehlgeschlagen");
        if (Array.isArray(json.cachedDays)) setCachedDays(json.cachedDays);
        if (Array.isArray(json.cachedEntries)) {
          setCachedEntries(json.cachedEntries as MailDayCachedSummary[]);
        }
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
    if (analysisEventsNeedSlot(draftEvents)) {
      setError(
        "Für Termine aus Aufgaben zuerst Dauer und freien Slot wählen."
      );
      return;
    }
    setApplying(true);
    setError(null);
    try {
      const res = await fetch("/api/google/mail/apply", {
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
        json.taskOk ? `${json.taskOk} Aufgabe(n) → Google Tasks` : null,
        json.eventOk ? `${json.eventOk} Termin(e) → Google Kalender` : null,
        json.replyOk ? `${json.replyOk} Entwurf(e) → Gmail` : null,
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

  const clusterView = useMemo(() => {
    if (!analysis) {
      return {
        actionable: [] as { cluster: DayCluster; ci: number }[],
        rest: [] as { cluster: DayCluster; ci: number }[],
        visible: [] as { cluster: DayCluster; ci: number }[],
      };
    }
    const all = analysis.clusters.map((cluster, ci) => ({ cluster, ci }));
    const actionable = all.filter(({ cluster }) => clusterNeedsAction(cluster));
    const rest = all.filter(({ cluster }) => !clusterNeedsAction(cluster));
    return {
      actionable,
      rest,
      visible: showAllThreads ? all : actionable,
    };
  }, [analysis, showAllThreads]);

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

  async function translateReplyFields(
    reply: DayReply,
    targetLang: ReplyLang
  ): Promise<DayReply> {
    if (currentReplyLang(reply) === targetLang) return reply;
    const res = await fetch("/api/google/mail/translate-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: reply.subject,
        body: reply.body,
        targetLang,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Übersetzung fehlgeschlagen (${res.status})`);
    }
    return {
      ...reply,
      subject: String(data.subject || reply.subject),
      body: String(data.body || reply.body),
      language: data.language === "en" ? "en" : "de",
    };
  }

  async function changeAnalysisReplyLanguage(
    flatIndex: number,
    targetLang: ReplyLang
  ) {
    if (!analysis) return;
    const reply = analysis.replies[flatIndex];
    if (!reply) return;
    if (currentReplyLang(reply) === targetLang) return;
    const key = `a-${flatIndex}`;
    setTranslatingReply(key);
    setError(null);
    try {
      const next = await translateReplyFields(reply, targetLang);
      setAnalysis((prev) => {
        if (!prev) return prev;
        let n = 0;
        const clusters = prev.clusters.map((c) => ({
          ...c,
          replies: c.replies.map((r) => {
            const idx = n++;
            return idx === flatIndex ? { ...r, ...next } : r;
          }),
        }));
        const replies = prev.replies.map((r, i) =>
          i === flatIndex ? { ...r, ...next } : r
        );
        return { ...prev, clusters, replies };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTranslatingReply(null);
    }
  }

  async function changeDraftReplyLanguage(
    draftIndex: number,
    targetLang: ReplyLang
  ) {
    const reply = draftReplies[draftIndex];
    if (!reply) return;
    if (currentReplyLang(reply) === targetLang) return;
    const key = `d-${draftIndex}`;
    setTranslatingReply(key);
    setError(null);
    try {
      const next = await translateReplyFields(reply, targetLang);
      setDraftReplies((prev) =>
        prev.map((r, i) => (i === draftIndex ? { ...r, ...next } : r))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTranslatingReply(null);
    }
  }

  return (
    <div className="min-w-0 space-y-5 pb-10">
      <PageHeader
        title="Google Workspace"
        description="Gmail-Chronik, Triage, Kalender und Tagesanalysen — plus Slot-Suche."
        logo={<GoogleLogo className="size-8" />}
        tone={pageVisuals.google.tone}
      />

      {connected === false ? (
        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="text-sm text-muted-foreground">
              Noch kein Google-Konto verbunden. Bitte unter Konto verbinden.
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-teal-800">
              Verbunden als{" "}
              <span className="font-semibold">
                {connectedEmail || "Google"}
              </span>
            </p>
            <nav
              className="flex flex-wrap gap-1 rounded-xl bg-muted/50 p-1"
              aria-label="Google Workspace Bereiche"
            >
              <Button
                type="button"
                variant="ghost"
                className={mailWorkspaceTabClass(tab === "mail", "google")}
                onClick={() => setTab("mail")}
              >
                <GmailLogo className="size-3.5 shrink-0" />
                Mails
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={mailWorkspaceTabClass(tab === "triage", "google")}
                onClick={() => setTab("triage")}
              >
                <ListChecks className="size-3.5 shrink-0" strokeWidth={APP_ICON_STROKE} />
                Triage
                {inboxPending > 0 ? (
                  <Badge variant="secondary" className="text-[10px]">
                    {inboxPending}
                  </Badge>
                ) : null}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={mailWorkspaceTabClass(tab === "calendar", "google")}
                onClick={() => setTab("calendar")}
              >
                <CalendarClock className="size-3.5 shrink-0" strokeWidth={APP_ICON_STROKE} />
                Kalender
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={mailWorkspaceTabClass(tab === "tasks", "google")}
                onClick={() => setTab("tasks")}
              >
                <GoogleTasksLogo className="size-3.5 shrink-0" />
                Tasks
              </Button>
            </nav>
          </div>

          {tab === "mail" ? (
            <MailWorkspaceSubnav
              view={mailView}
              onChange={setMailView}
              accent="google"
            />
          ) : null}

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
                  ? "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-100"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-100"
              )}
              role="status"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p>{analyzeNotice}</p>
                  {analyzing ? (
                    <p className="mt-0.5 text-[11px] opacity-80">
                      Läuft serverseitig inkl. vollständiger Mail-Threads — du
                      kannst die Seite verlassen. Bei Rückkehr erscheinen die
                      Resultate automatisch; zusätzlich Toast und
                      Push-Benachrichtigung wenn fertig.
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
          {oauthBanner ? (
            <p className="text-sm text-emerald-800" role="status">
              {oauthBanner}
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
                  Keine Google-Termine für heute.
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
                            <div className="space-y-2">
                              <div className="space-y-1">
                                <p className="text-[11px] text-muted-foreground">
                                  Dauer für Slot-Suche (kürzer = engere Lücken)
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {SLOT_DURATION_PRESETS.map((m) => (
                                    <Button
                                      key={m}
                                      type="button"
                                      size="sm"
                                      variant={
                                        slotDurationFor(e) === m
                                          ? "default"
                                          : "outline"
                                      }
                                      className="h-7 tabular-nums"
                                      disabled={busyId === e.id}
                                      onClick={() => {
                                        setSlotDurationByEvent((prev) => ({
                                          ...prev,
                                          [e.id]: m,
                                        }));
                                        setSlotsByEvent((prev) => {
                                          const next = { ...prev };
                                          delete next[e.id];
                                          return next;
                                        });
                                      }}
                                    >
                                      {m} Min
                                    </Button>
                                  ))}
                                  {!isSlotDurationPreset(slotDurationFor(e)) ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="default"
                                      className="h-7 tabular-nums"
                                      disabled={busyId === e.id}
                                    >
                                      {slotDurationFor(e)} Min
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={busyId === e.id}
                                  onClick={() => void markDone(e)}
                                >
                                  <Check className="size-3.5" />
                                  Erledigt
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={busyId === e.id}
                                  onClick={() => void suggestSlots(e)}
                                >
                                  Freien Slot suchen
                                </Button>
                                {e.htmlLink ? (
                                  <a
                                    href={e.htmlLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={cn(
                                      buttonVariants({
                                        variant: "ghost",
                                        size: "sm",
                                      })
                                    )}
                                  >
                                    In Google
                                  </a>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                          {slotsByEvent[e.id]?.length ? (
                            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Vorschläge à {slotDurationFor(e)} Min (7 Tage,
                                08–18)
                              </p>
                              <div className="max-h-64 space-y-2.5 overflow-y-auto">
                                {groupFreeSlotsByDate(slotsByEvent[e.id]!).map(
                                  ({ date, slots: daySlots }) => (
                                    <div key={date} className="space-y-1">
                                      <p className="text-[12px] font-semibold text-foreground">
                                        {weekdayLabel(date)} ·{" "}
                                        {toSwissDate(date)}
                                      </p>
                                      <ul className="flex flex-wrap gap-1.5">
                                        {daySlots.map((s) => (
                                          <li key={`${s.date}-${s.startHm}`}>
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="outline"
                                              disabled={busyId === e.id}
                                              onClick={() =>
                                                void reschedule(e, s)
                                              }
                                            >
                                              {s.startHm}–{s.endHm}
                                            </Button>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          ) : null}
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : tab === "triage" ? (
            <GoogleMailInboxPanel
              mode="triage"
              openMessageId={openMailId}
              onPendingChange={setInboxPending}
              onRequestTriageTab={() => setTab("triage")}
            />
          ) : tab === "tasks" ? (
            <GoogleTasksPanel />
          ) : tab === "mail" && mailView === "chronik" ? (
            <section className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-border/60 bg-card px-3.5 py-3 shadow-[0_4px_18px_rgba(15,23,42,0.05)]">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="g-mail-from" className="text-xs text-muted-foreground">
                      Von
                    </Label>
                    <Input
                      id="g-mail-from"
                      type="date"
                      className="h-9 w-auto min-w-[9.5rem]"
                      value={mailFrom}
                      max={zurichYmdClient()}
                      onValueChange={(v) => {
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
                        const next = clampMailRange(v, mailTo);
                        if (next.from === mailFrom && next.to === mailTo) return;
                        setMailFrom(next.from);
                        setMailTo(next.to);
                        void loadMail(next.from, next.to);
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="g-mail-to" className="text-xs text-muted-foreground">
                      Bis
                    </Label>
                    <Input
                      id="g-mail-to"
                      type="date"
                      className="h-9 w-auto min-w-[9.5rem]"
                      value={mailTo}
                      min={mailFrom}
                      max={zurichYmdClient()}
                      onValueChange={(v) => {
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
                        const next = clampMailRange(mailFrom, v);
                        if (next.from === mailFrom && next.to === mailTo) return;
                        setMailFrom(next.from);
                        setMailTo(next.to);
                        void loadMail(next.from, next.to);
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className={cn("h-9", mailWorkspacePrimaryBtnClass("google"))}
                    disabled={mailLoading}
                    onClick={() => void loadMail(mailFrom, mailTo)}
                  >
                    <RefreshCw
                      className={cn("size-3.5", mailLoading && "animate-spin")}
                    />
                    Mails laden
                  </Button>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9"
                  disabled={mailLoading}
                  onClick={() => void loadMail(mailFrom, mailTo)}
                >
                  <RefreshCw
                    className={cn("size-3.5", mailLoading && "animate-spin")}
                  />
                  Aktualisieren
                </Button>
              </div>
              <MailChronikSummary
                rangeLabel={formatMailRangeLabel(mailFrom, mailTo)}
                inboxCount={countMailsInRange(inbox, "inbox")}
                sentCount={countMailsInRange(sent, "sent")}
              />
              <MailChronikList
                items={mergeMailChronik(inbox, sent)}
                loading={mailLoading}
                provider="google"
              />
              <p className="text-[12px] text-muted-foreground">
                Gleiche Struktur auch unter Microsoft 365
              </p>
            </section>
          ) : (
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                  <h2 className="text-[22px] font-semibold tracking-tight text-foreground">
                    Tagesanalysen
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <Label
                      htmlFor="g-day-from"
                      className="text-xs text-muted-foreground"
                    >
                      Von
                    </Label>
                    <Input
                      id="g-day-from"
                      type="date"
                      className="h-9 w-auto min-w-[9.5rem]"
                      value={mailFrom}
                      max={zurichYmdClient()}
                      onValueChange={(v) => {
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
                        const next = clampMailRange(v, mailTo);
                        if (next.from === mailFrom && next.to === mailTo) return;
                        setMailFrom(next.from);
                        setMailTo(next.to);
                        setAnalysis(null);
                        setAnalyzeNotice(null);
                        setAnalysisFromCache(false);
                        setPicks({ tasks: {}, events: {}, replies: {} });
                        void loadMail(next.from, next.to);
                        void loadAnalysisForRange(next.from, next.to);
                      }}
                    />
                    <Label
                      htmlFor="g-day-to"
                      className="text-xs text-muted-foreground"
                    >
                      Bis
                    </Label>
                    <Input
                      id="g-day-to"
                      type="date"
                      className="h-9 w-auto min-w-[9.5rem]"
                      value={mailTo}
                      min={mailFrom}
                      max={zurichYmdClient()}
                      onValueChange={(v) => {
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
                        const next = clampMailRange(mailFrom, v);
                        if (next.from === mailFrom && next.to === mailTo) return;
                        setMailFrom(next.from);
                        setMailTo(next.to);
                        setAnalysis(null);
                        setAnalyzeNotice(null);
                        setAnalysisFromCache(false);
                        setPicks({ tasks: {}, events: {}, replies: {} });
                        void loadMail(next.from, next.to);
                        void loadAnalysisForRange(next.from, next.to);
                      }}
                    />
                    {cachedDays.includes(mailRangeKey(mailFrom, mailTo)) ? (
                      <span className="text-[11px] text-muted-foreground">
                        Analyse gespeichert
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9"
                    disabled={mailLoading}
                    onClick={() => void loadMail(mailFrom, mailTo)}
                  >
                    <RefreshCw
                      className={cn("size-3.5", mailLoading && "animate-spin")}
                    />
                    Aktualisieren
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className={cn("h-9", mailWorkspacePrimaryBtnClass("google"))}
                    disabled={analyzing}
                    onClick={() => startAnalyze()}
                  >
                    <Sparkles
                      className={cn("size-3.5", analyzing && "animate-pulse")}
                    />
                    {analyzing
                      ? "Analyse läuft…"
                      : analysis &&
                          cachedDays.includes(mailRangeKey(mailFrom, mailTo))
                        ? "Neu analysieren"
                        : "Neue AI Tagesanalyse"}
                  </Button>
                </div>
              </div>
              <MailAnalysisThreadHint
                coverage={mailThreadCoverage}
                clusterCount={analysis?.clusters.length ?? null}
              />
              <MailTagesanalysenList
                entries={cachedEntries}
                selectedKey={mailRangeKey(mailFrom, mailTo)}
                accent="google"
                onSelect={(entry) => {
                  setMailFrom(entry.fromYmd);
                  setMailTo(entry.toYmd);
                  setPicks({ tasks: {}, events: {}, replies: {} });
                  void loadMail(entry.fromYmd, entry.toYmd);
                  void loadAnalysisForRange(entry.fromYmd, entry.toYmd);
                }}
              />

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
                    <MailAnalysisThreadHint
                      coverage={mailThreadCoverage}
                      clusterCount={analysis.clusters.length}
                      compact
                      className="mt-1"
                    />
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
                      <div className="space-y-3">
                        {clusterView.visible.length === 0 &&
                        !showAllThreads &&
                        clusterView.rest.length > 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Keine offenen Handlungen — nur Info-/FYI-Threads.
                          </p>
                        ) : null}
                        <ul className="space-y-3">
                        {clusterView.visible.map(({ cluster, ci }) => (
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
                              <div className="flex flex-wrap items-center justify-end gap-1.5">
                                {!clusterNeedsAction(cluster) ? (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-normal"
                                  >
                                    Thread erfordert keine Aktion
                                  </Badge>
                                ) : null}
                                {cluster.status ? (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px]"
                                  >
                                    {STATUS_LABEL[cluster.status] ||
                                      cluster.status}
                                  </Badge>
                                ) : null}
                              </div>
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
                                  const existing = t.existingTask;
                                  const matched = Boolean(existing?.id);
                                  return (
                                    <label
                                      key={`t-${ci}-${li}`}
                                      className="flex items-start gap-2 rounded-md border border-border/40 bg-background px-2 py-1.5"
                                    >
                                      <input
                                        type="checkbox"
                                        className="mt-1"
                                        disabled={matched}
                                        checked={
                                          matched
                                            ? false
                                            : Boolean(picks.tasks[i])
                                        }
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
                                        {existing ? (
                                          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                                            <Badge
                                              variant={
                                                existing.status === "done"
                                                  ? "secondary"
                                                  : "outline"
                                              }
                                              className="text-[10px]"
                                            >
                                              {existing.status === "done"
                                                ? "Erledigt in Tasks"
                                                : "Offen in Tasks"}
                                            </Badge>
                                            <span className="text-muted-foreground">
                                              {existing.title}
                                            </span>
                                            {existing.href ? (
                                              <a
                                                href={existing.href}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-primary underline-offset-2 hover:underline"
                                                onClick={(e) =>
                                                  e.stopPropagation()
                                                }
                                              >
                                                öffnen
                                              </a>
                                            ) : null}
                                          </span>
                                        ) : (
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
                                        )}
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
                                            ev.fromTaskTwin
                                              ? "aus Aufgabe"
                                              : null,
                                            toSwissDate(ev.date),
                                            ev.fromTaskTwin && !ev.startTime
                                              ? "Zeit wählen beim Übernehmen"
                                              : ev.allDay || !ev.startTime
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
                                  const lang = currentReplyLang(r);
                                  const busy = translatingReply === `a-${i}`;
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
                                      <span className="min-w-0 flex-1">
                                        <span className="flex flex-wrap items-start justify-between gap-2">
                                          <span className="block text-sm font-medium">
                                            {r.subject}
                                          </span>
                                          <ReplyLangToggle
                                            lang={lang}
                                            busy={busy}
                                            onChange={(next) =>
                                              void changeAnalysisReplyLanguage(
                                                i,
                                                next
                                              )
                                            }
                                          />
                                        </span>
                                        <span className="block text-[11px] text-muted-foreground">
                                          An {r.to}
                                          {r.reason ? ` · ${r.reason}` : ""}
                                          {busy ? " · übersetzt…" : ""}
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
                        {clusterView.rest.length > 0 ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowAllThreads((v) => !v)}
                          >
                            {showAllThreads
                              ? `Nur offene Threads (${clusterView.actionable.length})`
                              : `Alle Threads zeigen (${clusterView.rest.length} weitere)`}
                          </Button>
                        ) : null}
                      </div>
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
                          Alles über Google: Aufgaben → Tasks, Termine →
                          Kalender, Antworten → Entwürfe. Vor dem Anlegen kannst
                          du Texte noch anpassen.
                        </p>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}

              <p className="text-[12px] text-muted-foreground">
                Spiegelbild unter Microsoft 365 · Outlook
              </p>
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
              Texte und Daten bei Bedarf anpassen, dann in Google anlegen.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
            {draftTasks.map((t, i) => (
              <div key={`dt-${i}`} className="space-y-2 rounded-lg border border-border/60 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Aufgabe · Google Tasks
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
              <AnalysisEventDraftCard
                key={`de-${i}`}
                event={ev}
                calendarLabel="Google Kalender"
                slotProvider="google"
                disabled={applying}
                onChange={(next) =>
                  setDraftEvents((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, ...next } : x))
                  )
                }
              />
            ))}
            {draftReplies.map((r, i) => {
              const lang = currentReplyLang(r);
              const busy = translatingReply === `d-${i}`;
              return (
              <div key={`dr-${i}`} className="space-y-2 rounded-lg border border-border/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Antwort · Gmail Entwurf
                    {busy ? " · übersetzt…" : ""}
                  </p>
                  <ReplyLangToggle
                    lang={lang}
                    busy={busy || applying}
                    onChange={(next) => void changeDraftReplyLanguage(i, next)}
                  />
                </div>
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
              );
            })}
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
                  0 ||
                analysisEventsNeedSlot(draftEvents)
              }
              onClick={() => void applyConfirmed()}
            >
              {applying ? "Lege an…" : "In Google anlegen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-[12px] text-muted-foreground">
        OAuth und Status unter{" "}
        <Link href="/account" className="underline underline-offset-2">
          Konto
        </Link>
        . Für Aufgaben ggf. Google neu verbinden (Tasks-Recht).
      </p>
    </div>
  );
}
