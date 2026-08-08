"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckSquare,
  Mail,
  RefreshCw,
  Sparkles,
  StickyNote,
  Wallet,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import type { MailListFilter, MailListItem, MailMessageDetail } from "@/lib/mail/gmail";
import type { MailAnalysis, MailSuggestion } from "@/lib/mail/mail-action-schema";
import type { MailAnalysisChip, StoredMailAnalysis } from "@/lib/mail/mail-heuristic";
import { formatMailSuggestionDetail } from "@/lib/mail/format-suggestion";

const FILTERS: { id: MailListFilter; label: string }[] = [
  { id: "today", label: "Heute" },
  { id: "week", label: "Diese Woche" },
  { id: "unread", label: "Ungelesen" },
];

type EnrichedMail = MailListItem & {
  analysisChip?: MailAnalysisChip;
  analysisChipLabel?: string | null;
  analysisStatus?: string | null;
  suggestionCount?: number;
  analysisSummary?: string | null;
};

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

function kindIcon(kind: string) {
  if (kind === "event") return CalendarDays;
  if (kind === "task") return CheckSquare;
  if (kind === "finance") return Wallet;
  if (kind === "note") return StickyNote;
  return Sparkles;
}

export function MicrosoftMailInboxPanel({
  mode,
  openMessageId,
  onPendingChange,
}: {
  mode: "inbox" | "triage";
  openMessageId?: string | null;
  onPendingChange?: (n: number) => void;
}) {
  const [filter, setFilter] = useState<MailListFilter>("today");
  const [items, setItems] = useState<EnrichedMail[]>([]);
  const [pending, setPending] = useState<StoredMailAnalysis[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MailMessageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [analysis, setAnalysis] = useState<MailAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/microsoft/mail/list?filter=${encodeURIComponent(filter)}&limit=30`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Laden fehlgeschlagen");
      setItems((data.items || []) as EnrichedMail[]);
      const n = Number(data.pendingTriage) || 0;
      setPendingCount(n);
      onPendingChange?.(n);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [filter, onPendingChange]);

  const loadTriage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/microsoft/mail/triage");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Triage laden fehlgeschlagen");
      setPending((data.pending || []) as StoredMailAnalysis[]);
      const n = Number(data.pendingCount) || 0;
      setPendingCount(n);
      onPendingChange?.(n);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [onPendingChange]);

  useEffect(() => {
    if (mode === "inbox") void loadInbox();
    else void loadTriage();
  }, [mode, loadInbox, loadTriage]);

  const openMail = useCallback(async (id: string) => {
    setOpenId(id);
    setDetail(null);
    setAnalysis(null);
    setSelected({});
    setApplyMsg(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/microsoft/mail/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Laden fehlgeschlagen");
      setDetail(data.message as MailMessageDetail);
      if (data.analysis) {
        setAnalysis(data.analysis as MailAnalysis);
        const init: Record<string, boolean> = {};
        (data.analysis as MailAnalysis).suggestions.forEach((_, i) => {
          init[String(i)] = true;
        });
        setSelected(init);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setOpenId(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (openMessageId) void openMail(openMessageId);
  }, [openMessageId, openMail]);

  async function runAnalyze() {
    if (!openId) return;
    setAnalyzing(true);
    setApplyMsg(null);
    try {
      const res = await fetch(
        `/api/microsoft/mail/${encodeURIComponent(openId)}/analyze`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analyse fehlgeschlagen");
      const a = data.analysis as MailAnalysis;
      setAnalysis(a);
      const init: Record<string, boolean> = {};
      a.suggestions.forEach((_, i) => {
        init[String(i)] = true;
      });
      setSelected(init);
      if (mode === "inbox") await loadInbox();
      else await loadTriage();
    } catch (err) {
      setApplyMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  }

  const selectedSuggestions = useMemo(() => {
    if (!analysis) return [] as Array<{ s: MailSuggestion; i: number }>;
    return analysis.suggestions
      .map((s, i) => ({ s, i }))
      .filter(({ i }) => selected[String(i)]);
  }, [analysis, selected]);

  async function applySelected(messageId: string, suggestions: MailSuggestion[]) {
    setApplying(true);
    setBusyId(messageId);
    setApplyMsg(null);
    try {
      const res = await fetch(
        `/api/microsoft/mail/${encodeURIComponent(messageId)}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actions: suggestions.map((s) => ({
              kind: s.kind,
              title: s.title,
              notes: s.notes,
              startDate: s.startDate,
              startTime: s.startTime,
              endTime: s.endTime,
              allDay: s.allDay,
              location: s.location,
              dueDate: s.dueDate,
              reference: s.reference,
            })),
            confirmDuplicates: true,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Übernehmen fehlgeschlagen");
      setApplyMsg(
        data.okCount > 0
          ? `${data.okCount} Vorschlag übernommen.`
          : "Nichts übernommen."
      );
      if (mode === "inbox") await loadInbox();
      else await loadTriage();
    } catch (err) {
      setApplyMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
      setBusyId(null);
    }
  }

  async function dismiss(messageId: string) {
    setBusyId(messageId);
    try {
      const res = await fetch("/api/microsoft/mail/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, action: "dismiss" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verwerfen fehlgeschlagen");
      await loadTriage();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {mode === "inbox" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <Button
                key={f.id}
                type="button"
                size="sm"
                variant={filter === f.id ? "default" : "outline"}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={() => void loadInbox()}
            >
              <RefreshCw
                className={cn("size-3.5", loading && "animate-spin")}
                strokeWidth={APP_ICON_STROKE}
              />
              Aktualisieren
            </Button>
            {pendingCount > 0 ? (
              <Badge variant="secondary">{pendingCount} in Triage</Badge>
            ) : null}
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Lade Posteingang…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine Mails in diesem Filter.
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 rounded-xl border border-border/70 bg-card p-3 text-left hover:bg-muted/40"
                    onClick={() => void openMail(item.id)}
                  >
                    <Mail
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      strokeWidth={APP_ICON_STROKE}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className={cn(
                            "truncate text-sm",
                            item.unread ? "font-semibold" : "font-medium"
                          )}
                        >
                          {item.subject}
                        </p>
                        {item.analysisChip && item.analysisChip !== "pending" ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px]",
                              chipClass(item.analysisChip)
                            )}
                          >
                            {item.analysisChipLabel || item.analysisChip}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.fromName} · {formatMailWhen(item)}
                      </p>
                      {item.snippet ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground/90">
                          {item.snippet}
                        </p>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          {loading ? (
            <p className="text-sm text-muted-foreground">Lade Triage…</p>
          ) : pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine offenen O365-Vorschläge.
            </p>
          ) : (
            <ul className="space-y-3">
              {pending.map((row) => {
                const suggestions = row.analysis?.suggestions || [];
                return (
                  <li key={row.messageId}>
                    <Card>
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium">{row.subject}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.fromName || row.fromEmail}
                            </p>
                            {row.summary ? (
                              <p className="mt-1 text-sm text-muted-foreground">
                                {row.summary}
                              </p>
                            ) : null}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busyId === row.messageId}
                            onClick={() => void dismiss(row.messageId)}
                            aria-label="Verwerfen"
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                        <ul className="space-y-2">
                          {suggestions.map((s, i) => {
                            const Icon = kindIcon(s.kind);
                            return (
                              <li
                                key={suggestionKey(s, i)}
                                className="flex items-start gap-2 rounded-lg border border-border/60 px-2.5 py-2 text-sm"
                              >
                                <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                                <div className="min-w-0">
                                  <p className="font-medium">{s.title}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatMailSuggestionDetail(s)}
                                  </p>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={
                              busyId === row.messageId || suggestions.length === 0
                            }
                            onClick={() =>
                              void applySelected(row.messageId, suggestions)
                            }
                          >
                            Alle übernehmen
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void openMail(row.messageId)}
                          >
                            Öffnen
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <Dialog
        open={Boolean(openId)}
        onOpenChange={(o) => {
          if (!o) setOpenId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {detail?.subject || (detailLoading ? "Lade…" : "Mail")}
            </DialogTitle>
            <DialogDescription>
              {detail
                ? `${detail.fromName} · ${formatMailWhen(detail)}`
                : "Outlook-Nachricht"}
            </DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <p className="text-sm text-muted-foreground">Lade Inhalt…</p>
          ) : detail ? (
            <div className="space-y-4">
              <pre className="max-h-48 whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-xs">
                {detail.bodyText || detail.snippet || "(kein Text)"}
              </pre>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={analyzing}
                  onClick={() => void runAnalyze()}
                >
                  <Sparkles className="size-3.5" />
                  {analyzing ? "Analysiert…" : "Analysieren"}
                </Button>
              </div>
              {analysis ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {analysis.summary}
                  </p>
                  <ul className="space-y-2">
                    {analysis.suggestions.map((s, i) => {
                      const Icon = kindIcon(s.kind);
                      const key = String(i);
                      return (
                        <li
                          key={suggestionKey(s, i)}
                          className="flex items-start gap-2 rounded-lg border border-border/60 px-2.5 py-2"
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
                          <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 text-sm">
                            <p className="font-medium">{s.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatMailSuggestionDetail(s)}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {analysis.suggestions.length > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={applying || selectedSuggestions.length === 0}
                      onClick={() =>
                        openId &&
                        void applySelected(
                          openId,
                          selectedSuggestions.map(({ s }) => s)
                        )
                      }
                    >
                      Ausgewählte übernehmen
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Keine Vorschläge.
                    </p>
                  )}
                </div>
              ) : null}
              {applyMsg ? (
                <p className="text-sm text-muted-foreground">{applyMsg}</p>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
