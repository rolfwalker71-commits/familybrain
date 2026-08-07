"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Link2,
  Mail,
  RefreshCw,
  Unlink,
  Sparkles,
  CalendarDays,
  CheckSquare,
  StickyNote,
  Plane,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/layout/page-primitives";
import { pageVisuals } from "@/components/layout/icon-circle";
import { cn } from "@/lib/utils";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import type { MailListFilter, MailListItem, MailMessageDetail } from "@/lib/mail/gmail";
import type { MailAnalysis, MailSuggestion } from "@/lib/mail/mail-action-schema";
import type { MailAnalysisChip } from "@/lib/mail/mail-heuristic";
import { formatMailSuggestionDetail } from "@/lib/mail/format-suggestion";
import { MailTriagePanel } from "@/components/mail/mail-triage-panel";

const FILTERS: { id: MailListFilter; label: string }[] = [
  { id: "today", label: "Heute" },
  { id: "week", label: "Diese Woche" },
  { id: "unread", label: "Ungelesen" },
];

type MailTab = "inbox" | "triage";

type EnrichedMail = MailListItem & {
  analysisChip?: MailAnalysisChip;
  analysisChipLabel?: string | null;
  analysisStatus?: string | null;
  suggestionCount?: number;
  analysisSummary?: string | null;
};

type CalOption = { id: string; name: string; primary: boolean };
type TaskListOption = { id: string; title: string };

function formatMailWhen(item: MailListItem): string {
  if (item.internalDate) {
    const d = new Date(Number(item.internalDate));
    if (Number.isFinite(d.getTime())) {
      return d.toLocaleString("de-CH", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  return item.date || "";
}

function suggestionKey(s: MailSuggestion, index: number): string {
  return `${s.kind}-${index}-${s.title}`;
}

function chipClass(chip: MailAnalysisChip): string {
  if (chip === "suggestion") {
    return "bg-amber-100 text-amber-900 border-amber-200";
  }
  if (chip === "applied") {
    return "bg-emerald-100 text-emerald-900 border-emerald-200";
  }
  if (chip === "dismissed") {
    return "bg-muted text-muted-foreground";
  }
  if (chip === "skipped") {
    return "bg-stone-100 text-stone-700 border-stone-200";
  }
  if (chip === "error") {
    return "bg-rose-100 text-rose-900 border-rose-200";
  }
  if (chip === "pending") {
    return "bg-muted/80 text-muted-foreground border-border/70";
  }
  if (chip === "none") {
    return "bg-slate-100 text-slate-700 border-slate-200";
  }
  return "bg-sky-50 text-sky-900 border-sky-200";
}

export function MailPageClient() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<MailTab>("inbox");
  const [filter, setFilter] = useState<MailListFilter>("today");
  const [items, setItems] = useState<EnrichedMail[]>([]);
  const [pendingTriage, setPendingTriage] = useState(0);
  const [connected, setConnected] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [hasGmailModify, setHasGmailModify] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MailMessageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [analysis, setAnalysis] = useState<MailAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [titleDraft, setTitleDraft] = useState<Record<string, string>>({});
  const [calendarId, setCalendarId] = useState("");
  const [calendars, setCalendars] = useState<CalOption[]>([]);
  const [tasklistId, setTasklistId] = useState("");
  const [tasklists, setTasklists] = useState<TaskListOption[]>([]);
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  const openMail = useCallback(async (id: string) => {
    setOpenId(id);
    setDetail(null);
    setAnalysis(null);
    setSelected({});
    setNotesDraft({});
    setApplyMsg(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/mail/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Laden fehlgeschlagen");
      setDetail(data.message as MailMessageDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setOpenId(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const g = searchParams.get("google");
    if (g === "connected") {
      setBanner("Google-Konto verbunden.");
    } else if (g === "error") {
      setBanner(
        `Google-Verbindung fehlgeschlagen: ${searchParams.get("reason") || "unbekannt"}`
      );
    }
    if (searchParams.get("tab") === "triage") {
      setTab("triage");
    }
    const open = searchParams.get("open");
    if (open) {
      void openMail(open);
    }
  }, [searchParams, openMail]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/mail/list?filter=${encodeURIComponent(filter)}&limit=30&refresh=1`
      );
      const data = await res.json();
      if (!res.ok && data.error) {
        throw new Error(data.error);
      }
      setConfigured(Boolean(data.configured));
      setConnected(Boolean(data.connected));
      setHasGmailModify(Boolean(data.hasGmailModify));
      setConnectedEmail(data.connectedEmail || null);
      setItems((data.items || []) as EnrichedMail[]);
      setPendingTriage(Number(data.pendingTriage) || 0);
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function disconnect() {
    if (!window.confirm("Google-Konto trennen?")) return;
    await fetch("/api/google/oauth/disconnect", { method: "POST" });
    setBanner("Google-Konto getrennt.");
    await load();
  }

  async function loadTargets() {
    try {
      const [calRes, taskRes] = await Promise.all([
        fetch("/api/google/calendars"),
        fetch("/api/google/tasks"),
      ]);
      const calJson = await calRes.json();
      const taskJson = await taskRes.json();
      const cals = (calJson.calendars || []) as Array<{
        id: string;
        name: string;
        primary: boolean;
        accessRole?: string | null;
      }>;
      const writable = cals.filter((c) => {
        const role = (c.accessRole || "").toLowerCase();
        return !role || role === "owner" || role === "writer";
      });
      const pool = writable.length > 0 ? writable : cals;
      const options = pool.map((c) => ({
        id: c.id,
        name: c.name,
        primary: c.primary,
      }));
      setCalendars(options);
      const primary = options.find((c) => c.primary) || options[0];
      if (primary) setCalendarId((prev) => prev || primary.id);

      const lists = (taskJson.lists || []) as TaskListOption[];
      setTasklists(lists);
      if (lists[0]) setTasklistId((prev) => prev || lists[0]!.id);
    } catch {
      /* optional */
    }
  }

  async function runAnalyze() {
    if (!openId) return;
    setAnalyzing(true);
    setApplyMsg(null);
    setError(null);
    try {
      await loadTargets();
      const res = await fetch(
        `/api/mail/${encodeURIComponent(openId)}/analyze`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analyse fehlgeschlagen");
      const a = data.analysis as MailAnalysis;
      setAnalysis(a);
      const next: Record<string, boolean> = {};
      const drafts: Record<string, string> = {};
      const titles: Record<string, string> = {};
      a.suggestions.forEach((s, i) => {
        const key = suggestionKey(s, i);
        next[key] = true;
        drafts[key] = s.notes?.trim() || "";
        titles[key] = s.title;
      });
      setSelected(next);
      setNotesDraft(drafts);
      setTitleDraft(titles);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  }

  const selectedSuggestions = useMemo(() => {
    if (!analysis) return [] as Array<{ s: MailSuggestion; i: number }>;
    return analysis.suggestions
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => selected[suggestionKey(s, i)]);
  }, [analysis, selected]);

  async function applySelected(opts?: { confirmDuplicates?: boolean }) {
    if (!openId || selectedSuggestions.length === 0) return;
    setApplying(true);
    setApplyMsg(null);
    try {
      const actions = selectedSuggestions.map(({ s, i }) => ({
        kind: s.kind,
        title: (titleDraft[suggestionKey(s, i)] ?? s.title).trim() || s.title,
        notes: notesDraft[suggestionKey(s, i)] ?? s.notes ?? null,
        startDate: s.startDate ?? null,
        startTime: s.startTime ?? null,
        endDate: s.endDate ?? null,
        endTime: s.endTime ?? null,
        allDay: s.allDay ?? !s.startTime,
        location: s.location ?? null,
        dueDate: s.dueDate ?? null,
        reference: s.reference ?? null,
        calendarId:
          s.kind === "event" ? s.calendarId || calendarId || null : null,
        tasklistId: s.kind === "task" ? tasklistId || null : null,
        patchEventId: s.patchEventId ?? null,
        tripType: s.tripType ?? null,
        provider: s.provider ?? null,
        bookingReference: s.bookingReference ?? null,
        newTripTitle: s.kind === "trip" ? s.title : null,
      }));
      const res = await fetch(
        `/api/mail/${encodeURIComponent(openId)}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actions,
            confirmDuplicates: opts?.confirmDuplicates === true,
          }),
        }
      );
      const data = await res.json();
      if (
        res.status === 422 &&
        data.needsConfirm &&
        Array.isArray(data.warnings) &&
        !opts?.confirmDuplicates
      ) {
        const ok = window.confirm(
          `Hinweise:\n${(data.warnings as Array<{ message: string }>).map((w) => `• ${w.message}`).join("\n")}\n\nTrotzdem übernehmen?`
        );
        if (!ok) {
          setApplyMsg("Übernehmen abgebrochen.");
          return;
        }
        const retry = await fetch(
          `/api/mail/${encodeURIComponent(openId)}/actions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              actions,
              confirmDuplicates: true,
            }),
          }
        );
        const retryData = await retry.json();
        if (!retry.ok) {
          throw new Error(retryData.error || "Speichern fehlgeschlagen");
        }
        Object.assign(data, retryData);
      } else if (!res.ok) {
        throw new Error(data.error || "Speichern fehlgeschlagen");
      }
      const fails = (data.created || []).filter(
        (c: { ok: boolean }) => !c.ok
      ) as Array<{ title: string; error?: string }>;
      if (data.okCount > 0 && fails.length === 0) {
        setApplyMsg(`${data.okCount} Eintrag(e) angelegt.`);
      } else if (data.okCount > 0) {
        setApplyMsg(
          `${data.okCount} ok, ${fails.length} fehlgeschlagen: ${fails.map((f) => f.error || f.title).join("; ")}`
        );
      } else {
        throw new Error(
          fails.map((f) => f.error || f.title).join("; ") || "Nichts angelegt"
        );
      }
      await load();
    } catch (err) {
      setApplyMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="min-w-0 space-y-5 pb-8">
      <PageHeader
        title="Mail"
        description="Neue Mails werden automatisch geprüft — Vorschläge in der Triage."
        icon={pageVisuals.mail.icon}
        tone={pageVisuals.mail.tone}
        actions={
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={tab === "inbox" ? "default" : "outline"}
              className={cn(
                tab === "inbox" &&
                  "bg-[var(--brand-docs)] text-white hover:bg-[var(--brand-docs)]/90"
              )}
              onClick={() => setTab("inbox")}
            >
              Posteingang
            </Button>
            <Button
              type="button"
              size="sm"
              variant={tab === "triage" ? "default" : "outline"}
              className={cn(
                tab === "triage" &&
                  "bg-[var(--brand-docs)] text-white hover:bg-[var(--brand-docs)]/90"
              )}
              onClick={() => setTab("triage")}
            >
              Vorschläge
              {pendingTriage > 0 ? (
                <Badge variant="secondary" className="ml-1 text-[10px]">
                  {pendingTriage}
                </Badge>
              ) : null}
            </Button>
            {tab === "inbox"
              ? FILTERS.map((f) => (
                  <Button
                    key={f.id}
                    type="button"
                    size="sm"
                    variant={filter === f.id ? "default" : "outline"}
                    className={cn(
                      filter === f.id &&
                        "bg-[var(--brand-docs)] text-white hover:bg-[var(--brand-docs)]/90"
                    )}
                    onClick={() => setFilter(f.id)}
                  >
                    {f.label}
                  </Button>
                ))
              : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={() => void load()}
            >
              <RefreshCw className="size-3.5" />
              Aktualisieren
            </Button>
          </div>
        }
      />

      {banner ? (
        <p className="text-sm text-emerald-800" role="status">
          {banner}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {!configured ? (
        <Card>
          <CardContent className="space-y-3 p-6 text-sm">
            <p>
              Google OAuth ist noch nicht konfiguriert. Unter{" "}
              <a
                href="/settings?tab=calendars"
                className="font-medium text-[var(--brand-docs)] underline-offset-2 hover:underline"
              >
                Einstellungen → Kalender
              </a>{" "}
              Client-ID und Secret hinterlegen.
            </p>
          </CardContent>
        </Card>
      ) : !connected ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
            <p className="text-sm text-muted-foreground">
              Noch kein Google-Konto verbunden.
            </p>
            <a
              href="/api/google/oauth/start"
              className={cn(buttonVariants(), "gap-1.5")}
            >
              <Link2 className="size-3.5" />
              Google verbinden
            </a>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              Verbunden als{" "}
              <span className="font-medium text-foreground">
                {connectedEmail || "Google"}
              </span>
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void disconnect()}
            >
              <Unlink className="size-3.5" />
              Trennen
            </Button>
          </div>
          {!hasGmailModify ? (
            <p className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">
              Gmail-Labels brauchen die Berechtigung «ändern». Bitte{" "}
              <a
                href="/api/google/oauth/start"
                className="font-medium underline underline-offset-2"
              >
                Google neu verbinden
              </a>
              , damit Buddy Status-Labels (BUDDY - Zur Triage, …) zurückschreibt.
            </p>
          ) : null}
        </div>
      )}

      {connected && tab === "triage" ? (
        <MailTriagePanel
          onChanged={() => {
            void load();
          }}
        />
      ) : null}

      {connected && tab === "inbox" ? (
        loading ? (
          <p className="text-sm text-muted-foreground">
            Lade Mails und prüfe neue Eingänge…
          </p>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Keine Mails in diesem Filter.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5 text-left shadow-[0_2px_10px_rgba(20,32,28,0.04)] hover:bg-muted/30"
                  onClick={() => void openMail(item.id)}
                >
                  <Mail
                    className="mt-0.5 size-8 shrink-0 text-muted-foreground"
                    strokeWidth={APP_ICON_STROKE}
                    absoluteStrokeWidth
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.unread ? (
                        <span
                          className="size-2 shrink-0 rounded-full bg-[var(--brand-docs)]"
                          aria-label="Ungelesen"
                        />
                      ) : null}
                      <p className="truncate text-sm font-medium">
                        {item.fromName}
                      </p>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {formatMailWhen(item)}
                      </span>
                      {item.analysisChipLabel ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            chipClass(item.analysisChip || "pending")
                          )}
                          title={item.analysisSummary || undefined}
                        >
                          {item.analysisChipLabel}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="truncate text-sm text-foreground">
                      {item.subject}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.snippet}
                    </p>
                  </div>
                  {item.unread ? (
                    <Badge variant="secondary" className="text-[10px]">
                      Neu
                    </Badge>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}

      <Dialog
        open={openId != null}
        onOpenChange={(open) => {
          if (!open) {
            setOpenId(null);
            setDetail(null);
            setAnalysis(null);
            setApplyMsg(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[90dvh] w-[min(96vw,40rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-3">
            <DialogTitle className="pr-8 text-base leading-snug">
              {detail?.subject || (detailLoading ? "Lade…" : "Mail")}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {detail
                ? `${detail.fromName}${detail.from ? ` <${detail.from}>` : ""}`
                : "Mail-Inhalt"}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm">
            {detailLoading ? (
              <p className="text-muted-foreground">Lade Inhalt…</p>
            ) : detail ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-muted-foreground">
                    {formatMailWhen(detail)}
                    {detail.to ? ` · An: ${detail.to}` : ""}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={analyzing}
                    onClick={() => void runAnalyze()}
                    className="ml-auto gap-1.5"
                  >
                    <Sparkles className="size-3.5" />
                    {analyzing ? "Prüfe…" : "Erneut prüfen"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setOpenId(null);
                      setDetail(null);
                      setTab("triage");
                    }}
                  >
                    Zur Triage
                  </Button>
                </div>

                {analysis ? (
                  <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Buddy · {analysis.relevance}
                      </p>
                      <p className="text-sm">{analysis.summary}</p>
                      {analysis.suggestedMember ? (
                        <p className="text-xs font-medium text-violet-800/90">
                          Person: {analysis.suggestedMember.displayName}
                        </p>
                      ) : null}
                    </div>
                    {analysis.suggestions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Nichts Speichernswertes erkannt.
                      </p>
                    ) : (
                      <>
                        <ul className="space-y-2">
                          {analysis.suggestions.map((s, i) => {
                            const key = suggestionKey(s, i);
                            return (
                              <li
                                key={key}
                                className="flex items-start gap-2 rounded-lg border border-border/50 bg-card px-2.5 py-2"
                              >
                                <input
                                  type="checkbox"
                                  className="mt-1"
                                  checked={Boolean(selected[key])}
                                  onChange={(e) =>
                                    setSelected((prev) => ({
                                      ...prev,
                                      [key]: e.target.checked,
                                    }))
                                  }
                                />
                                <div className="min-w-0 flex-1 space-y-1.5">
                                  <div className="flex items-start gap-1.5">
                                    {s.kind === "event" ? (
                                      <CalendarDays
                                        className="mt-1.5 size-3.5 shrink-0 text-emerald-700"
                                        aria-hidden
                                      />
                                    ) : s.kind === "note" ? (
                                      <StickyNote
                                        className="mt-1.5 size-3.5 shrink-0 text-amber-700"
                                        aria-hidden
                                      />
                                    ) : s.kind === "trip" ? (
                                      <Plane
                                        className="mt-1.5 size-3.5 shrink-0 text-violet-700"
                                        aria-hidden
                                      />
                                    ) : (
                                      <CheckSquare
                                        className="mt-1.5 size-3.5 shrink-0 text-sky-700"
                                        aria-hidden
                                      />
                                    )}
                                    <label className="min-w-0 flex-1 space-y-0.5">
                                      <span className="sr-only">Titel</span>
                                      <input
                                        type="text"
                                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm font-medium"
                                        value={titleDraft[key] ?? s.title}
                                        disabled={applying}
                                        onChange={(e) =>
                                          setTitleDraft((prev) => ({
                                            ...prev,
                                            [key]: e.target.value,
                                          }))
                                        }
                                        placeholder="Titel"
                                      />
                                    </label>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground">
                                    {formatMailSuggestionDetail(s)}
                                    {s.reason ? ` · ${s.reason}` : ""}
                                  </p>
                                  <label className="block space-y-0.5">
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                      Beschreibung
                                    </span>
                                    <textarea
                                      className="min-h-[2.75rem] w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-xs leading-snug"
                                      rows={2}
                                      value={notesDraft[key] ?? s.notes ?? ""}
                                      disabled={applying}
                                      onChange={(e) =>
                                        setNotesDraft((prev) => ({
                                          ...prev,
                                          [key]: e.target.value,
                                        }))
                                      }
                                      placeholder="Beschreibung für Kalender / Aufgabe / Reise / Notiz"
                                    />
                                  </label>
                                </div>
                              </li>
                            );
                          })}
                        </ul>

                        {selectedSuggestions.some(({ s }) => s.kind === "event") ? (
                          <label className="block space-y-1 text-xs">
                            <span className="font-medium text-muted-foreground">
                              Kalender für Termine
                            </span>
                            <select
                              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                              value={calendarId}
                              onChange={(e) => setCalendarId(e.target.value)}
                            >
                              {calendars.length === 0 ? (
                                <option value="">— Kalender laden —</option>
                              ) : (
                                calendars.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                    {c.primary ? " (primär)" : ""}
                                  </option>
                                ))
                              )}
                            </select>
                          </label>
                        ) : null}

                        {selectedSuggestions.some(({ s }) => s.kind === "task") ? (
                          <label className="block space-y-1 text-xs">
                            <span className="font-medium text-muted-foreground">
                              Taskliste
                            </span>
                            <select
                              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                              value={tasklistId}
                              onChange={(e) => setTasklistId(e.target.value)}
                            >
                              {tasklists.length === 0 ? (
                                <option value="">
                                  — Standard / Tasks verbinden —
                                </option>
                              ) : (
                                tasklists.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.title}
                                  </option>
                                ))
                              )}
                            </select>
                          </label>
                        ) : null}

                        <Button
                          type="button"
                          size="sm"
                          disabled={
                            applying || selectedSuggestions.length === 0
                          }
                          onClick={() => void applySelected()}
                        >
                          {applying
                            ? "Speichere…"
                            : `${selectedSuggestions.length} übernehmen`}
                        </Button>
                        {applyMsg ? (
                          <p className="text-xs text-muted-foreground" role="status">
                            {applyMsg}
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}

                {detail.bodyHtml ? (
                  <div
                    className="prose prose-sm max-w-none break-words dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: detail.bodyHtml }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {detail.bodyText || detail.snippet || "Kein Text."}
                  </pre>
                )}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
