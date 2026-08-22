"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckSquare,
  FileText,
  HardDrive,
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
import { MicrosoftMailComposeDialog } from "@/components/microsoft/microsoft-mail-compose-dialog";
import { MicrosoftMailQuickActions } from "@/components/microsoft/microsoft-mail-quick-actions";
import { MailHtmlBody } from "@/components/mail/mail-html-body";
import { cn } from "@/lib/utils";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { mailAnalysisChipClass } from "@/lib/ui/soft-tint";
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
  return mailAnalysisChipClass(chip);
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
  const [composeOpen, setComposeOpen] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pdfAttachments, setPdfAttachments] = useState<
    Array<{
      id: string;
      name: string;
      size: number;
      alreadyIngested: boolean;
      documentId: number | null;
    }>
  >([]);
  const [paperlessBusy, setPaperlessBusy] = useState(false);

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
    setPdfAttachments([]);
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
      try {
        const attRes = await fetch(
          `/api/microsoft/mail/${encodeURIComponent(id)}/attachments`
        );
        const attData = await attRes.json();
        if (attRes.ok && Array.isArray(attData.attachments)) {
          setPdfAttachments(attData.attachments);
        }
      } catch {
        /* optional */
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

  async function sendPdfsToPaperless() {
    if (!openId || pdfAttachments.length === 0) return;
    setPaperlessBusy(true);
    setApplyMsg(null);
    try {
      const res = await fetch(
        `/api/microsoft/mail/${encodeURIComponent(openId)}/to-paperless`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Paperless-Upload fehlgeschlagen");
      const results = (data.results || []) as Array<{
        ok: boolean;
        skipped?: string;
        localId?: number;
        filename?: string;
        error?: string;
      }>;
      const neu = results.filter((r) => r.ok && !r.skipped).length;
      const skip = results.filter((r) => r.skipped === "already").length;
      const fail = results.filter((r) => !r.ok).length;
      setApplyMsg(
        `${neu} PDF nach Paperless` +
          (skip ? `, ${skip} schon vorhanden` : "") +
          (fail ? `, ${fail} Fehler` : "") +
          "."
      );
      const attRes = await fetch(
        `/api/microsoft/mail/${encodeURIComponent(openId)}/attachments`
      );
      const attData = await attRes.json();
      if (attRes.ok && Array.isArray(attData.attachments)) {
        setPdfAttachments(attData.attachments);
      }
    } catch (err) {
      setApplyMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setPaperlessBusy(false);
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
              endDate: s.endDate,
              endTime: s.endTime,
              allDay: s.allDay,
              location: s.location,
              dueDate: s.dueDate,
              reference: s.reference,
              vendor: s.vendor,
              amount: s.amount,
              currency: s.currency,
              documentId: s.documentId,
              tripType: s.tripType,
              provider: s.provider,
              bookingReference: s.bookingReference,
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
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-full items-start justify-start gap-3 rounded-2xl bg-card p-3 text-left shadow-[0_2px_10px_rgba(20,32,28,0.04)] ring-1 ring-border/50 hover:bg-muted"
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
                            "break-words text-sm leading-snug",
                            item.unread ? "font-semibold" : "font-medium"
                          )}
                        >
                          {item.subject}
                        </p>
                        {item.analysisChip && item.analysisChip !== "pending" ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[0.625rem]",
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
                  </Button>
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
        <DialogContent className="flex max-h-[90dvh] w-[min(96vw,40rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 px-4 py-3 pr-12 text-left">
            <DialogTitle className="text-base leading-snug">
              {detail?.subject || (detailLoading ? "Lade…" : "Mail")}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {detail
                ? `${detail.fromName} · ${formatMailWhen(detail)}`
                : "Outlook-Nachricht"}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
            {detailLoading ? (
              <p className="text-sm text-muted-foreground">Lade Inhalt…</p>
            ) : detail ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={analyzing}
                    onClick={() => void runAnalyze()}
                    className="gap-1.5"
                  >
                    <Sparkles className="size-3.5" />
                    {analyzing ? "Analysiert…" : "Analysieren"}
                  </Button>
                  {pdfAttachments.length > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={paperlessBusy}
                      onClick={() => void sendPdfsToPaperless()}
                      className="gap-1.5"
                    >
                      <HardDrive className="size-3.5" />
                      {paperlessBusy
                        ? "Lädt nach Paperless…"
                        : `PDF → Paperless (${pdfAttachments.length})`}
                    </Button>
                  ) : null}
                </div>
                {openId ? (
                  <MicrosoftMailQuickActions
                    messageId={openId}
                    unread={detail.unread}
                    folder="inbox"
                    onReply={() => setComposeOpen(true)}
                    onChanged={(action) => {
                      if (action === "archive" || action === "delete") {
                        setOpenId(null);
                      }
                      if (mode === "inbox") void loadInbox();
                      else void loadTriage();
                    }}
                  />
                ) : null}
                {pdfAttachments.length > 0 ? (
                  <ul className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2 text-xs">
                    {pdfAttachments.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-start gap-2 text-muted-foreground"
                      >
                        <FileText className="mt-0.5 size-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 break-words">
                          {a.name}
                          {a.alreadyIngested && a.documentId ? (
                            <>
                              {" · "}
                              <a
                                href={`/documents/${a.documentId}`}
                                className="text-foreground underline-offset-2 hover:underline"
                              >
                                in Buddy
                              </a>
                            </>
                          ) : null}
                        </span>
                      </li>
                    ))}
                    <li className="pt-0.5 text-[0.6875rem] text-muted-foreground">
                      Tags: O365 · ANG · geschäftlich
                    </li>
                  </ul>
                ) : null}
                <MailHtmlBody
                  html={detail.bodyHtml}
                  plainFallback={detail.bodyText || detail.snippet}
                />
                {analysis ? (
                  <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
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
                            className="flex items-start gap-2 rounded-lg border border-border/60 bg-card px-2.5 py-2"
                          >
                            <input
                              type="checkbox"
                              className="mt-1 shrink-0"
                              checked={Boolean(selected[key])}
                              onChange={(e) =>
                                setSelected((prev) => ({
                                  ...prev,
                                  [key]: e.target.checked,
                                }))
                              }
                            />
                            <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1 text-sm">
                              <p className="break-words font-medium">{s.title}</p>
                              <p className="break-words text-xs text-muted-foreground">
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
                {analysis?.replyDraft?.body ? (
                  <div className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3">
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
                      Antwortvorschlag
                    </p>
                    <pre className="whitespace-pre-wrap break-words text-sm">
                      {analysis.replyDraft.body}
                    </pre>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setComposeOpen(true)}
                    >
                      Antworten / senden…
                    </Button>
                  </div>
                ) : null}
                {applyMsg ? (
                  <p className="text-sm text-muted-foreground">{applyMsg}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <MicrosoftMailComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        mode="reply"
        sourceMailId={openId}
        defaultTo={detail?.from || ""}
        defaultSubject={
          detail?.subject
            ? detail.subject.toLowerCase().startsWith("re:")
              ? detail.subject
              : `Re: ${detail.subject}`
            : ""
        }
        defaultBody={analysis?.replyDraft?.body || ""}
        onSent={() => {
          if (mode === "inbox") void loadInbox();
          else void loadTriage();
        }}
      />
    </div>
  );
}
