"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CalendarClock,
  Check,
  FileWarning,
  Inbox,
  Receipt,
  Shield,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  OpenInvoiceCardGrid,
  type OpenInvoiceCardModel,
} from "@/components/finance/open-invoice-cards";
import { DocumentAiIcon } from "@/components/documents/document-ai-icon";
import { formatCHF } from "@/lib/utils/format";
import {
  dueUrgency,
  dueUrgencyTextClass,
  formatDueRelative,
  formatExpiryRelative,
} from "@/lib/utils/due-urgency";

type TriageReason =
  | "invoice"
  | "high_amount"
  | "warranty"
  | "deadline"
  | "travel";

const TRIAGE_LABELS: Record<TriageReason, string> = {
  invoice: "Rechnung",
  high_amount: "Hoher Betrag",
  warranty: "Garantie",
  deadline: "Frist",
  travel: "Reise",
};

type TriageItem = {
  id: number;
  title: string | null;
  correspondent_name: string | null;
  category: string | null;
  short_summary: string | null;
  amount: number | null;
  currency: string | null;
  due_date: string | null;
  vendor: string | null;
  reasons: TriageReason[];
  ai_icon_url: string | null;
};

type InboxPayload = {
  overdueDeadlines: Array<{
    id: number;
    title: string;
    deadline_date: string | null;
    document_local_id: number;
    document_title: string | null;
    ai_icon_url?: string | null;
    category?: string | null;
  }>;
  dueInvoices: Array<{
    id: number;
    vendor: string | null;
    amount: number | null;
    currency: string | null;
    due_date: string;
    document_local_id: number;
    document_title: string | null;
    ai_icon_url?: string | null;
    category?: string | null;
  }>;
  openUnpaidInvoices?: OpenInvoiceCardModel[];
  triagePending?: TriageItem[];
  warrantiesExpiring: Array<{
    id: number;
    product_name: string | null;
    vendor: string | null;
    warranty_until: string | null;
    document_local_id: number;
    ai_icon_url?: string | null;
    category?: string | null;
  }>;
  analysisIssues: {
    pending: number;
    error: number;
    stale: number;
  };
};

export function ActionInbox() {
  const [data, setData] = useState<InboxPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/inbox");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Laden fehlgeschlagen");
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/dashboard/inbox");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Laden fehlgeschlagen");
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    const onInbox = () => {
      void load();
    };
    window.addEventListener("buddy:inbox", onInbox);

    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 45000);
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      window.removeEventListener("buddy:inbox", onInbox);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  async function resolveTriage(
    documentLocalId: number,
    action: "pay" | "ignore" | "done" | "ebill" | "twint" | "card"
  ) {
    setBusyId(documentLocalId);
    setActionError(null);
    try {
      const res = await fetch("/api/dashboard/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentLocalId, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Aktion fehlgeschlagen");
      }
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  if (error) {
    return (
      <Card className="border-border/70">
        <CardContent className="p-4 text-sm text-muted-foreground">
          Action-Inbox konnte nicht geladen werden.
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="border-border/70">
        <CardContent className="p-4 text-sm text-muted-foreground">
          Lade To-dos…
        </CardContent>
      </Card>
    );
  }

  const analysisTotal =
    data.analysisIssues.pending +
    data.analysisIssues.error +
    data.analysisIssues.stale;
  const openUnpaid = data.openUnpaidInvoices || [];
  const triagePending = data.triagePending || [];
  const empty =
    triagePending.length === 0 &&
    data.overdueDeadlines.length === 0 &&
    data.dueInvoices.length === 0 &&
    openUnpaid.length === 0 &&
    data.warrantiesExpiring.length === 0 &&
    analysisTotal === 0;

  /** Half-width sections; last one alone on a row spans full width. */
  const halfKeys = [
    data.overdueDeadlines.length > 0 ? "overdue" : null,
    data.dueInvoices.length > 0 ? "due" : null,
    data.warrantiesExpiring.length > 0 ? "warranties" : null,
    analysisTotal > 0 ? "analysis" : null,
  ].filter((k): k is string => k != null);
  const halfClass = (key: string) => {
    const idx = halfKeys.indexOf(key);
    const alone =
      halfKeys.length % 2 === 1 && idx === halfKeys.length - 1;
    return alone ? "space-y-2 md:col-span-2" : "space-y-2";
  };

  return (
    <Card className="border-border/70 shadow-[0_2px_4px_rgba(20,32,28,0.06),0_10px_28px_rgba(20,32,28,0.08)]">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Was muss ich tun?
          </p>
          <h2 className="mt-0.5 text-base font-bold tracking-tight sm:text-lg">
            Action-Inbox
          </h2>
        </div>

        {actionError ? (
          <p className="text-sm text-destructive">{actionError}</p>
        ) : null}

        {empty ? (
          <p className="text-sm text-muted-foreground">
            Aktuell nichts Dringendes.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {triagePending.length > 0 ? (
              <section className="space-y-2 md:col-span-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Inbox className="size-4 text-[var(--brand-docs)]" />
                  Neue Belege prüfen
                  <Badge variant="secondary" className="text-[10px]">
                    {triagePending.length}
                  </Badge>
                </div>
                <ul className="space-y-2">
                  {triagePending.map((row) => {
                    const needsPay =
                      row.reasons.includes("invoice") ||
                      row.reasons.includes("high_amount");
                    const busy = busyId === row.id;
                    return (
                      <li
                        key={row.id}
                        className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5"
                      >
                        <div className="flex items-start gap-2.5">
                          <Link
                            href={`/documents/${row.id}`}
                            className="flex min-w-0 flex-1 items-start gap-2.5 hover:opacity-90"
                          >
                            <DocumentAiIcon
                              aiIconUrl={row.ai_icon_url}
                              category={row.category}
                              size="xs"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="font-medium">
                                {row.vendor ||
                                  row.correspondent_name ||
                                  row.title ||
                                  "Dokument"}
                              </span>
                              <span className="mt-1 flex flex-wrap gap-1">
                                {row.reasons.map((reason) => (
                                  <Badge
                                    key={reason}
                                    variant="secondary"
                                    className="text-[10px]"
                                  >
                                    {TRIAGE_LABELS[reason] || reason}
                                  </Badge>
                                ))}
                              </span>
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {[
                                  row.amount != null
                                    ? formatCHF(
                                        row.amount,
                                        row.currency || "CHF"
                                      )
                                    : null,
                                  row.due_date
                                    ? formatDueRelative(row.due_date)
                                    : null,
                                  row.short_summary,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </span>
                          </Link>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {needsPay ? (
                            <Button
                              size="sm"
                              className="bg-[var(--brand-finance)] text-white hover:bg-[var(--brand-finance)]/90"
                              disabled={busy}
                              onClick={() => void resolveTriage(row.id, "pay")}
                            >
                              <Check className="size-3.5" />
                              {busy ? "…" : "Muss bezahlt werden"}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void resolveTriage(row.id, "done")}
                            >
                              <Check className="size-3.5" />
                              {busy ? "…" : "Erledigt"}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void resolveTriage(row.id, "ebill")}
                          >
                            {busy ? "…" : "eBill"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void resolveTriage(row.id, "twint")}
                          >
                            {busy ? "…" : "Twint"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void resolveTriage(row.id, "card")}
                          >
                            {busy ? "…" : "Kreditkarte"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void resolveTriage(row.id, "ignore")}
                          >
                            <X className="size-3.5" />
                            Irrelevant
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {openUnpaid.length > 0 ? (
              <section className="space-y-2 md:col-span-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Receipt className="size-4 text-[var(--brand-finance)]" />
                  Offene Rechnungen
                  <Badge variant="secondary" className="text-[10px]">
                    Paperless
                  </Badge>
                  <Link
                    href="/finance"
                    className="ml-auto text-xs font-medium text-[var(--brand-finance)] underline-offset-2 hover:underline"
                  >
                    Finanzen
                  </Link>
                </div>
                <OpenInvoiceCardGrid invoices={openUnpaid} />
              </section>
            ) : null}

            {data.overdueDeadlines.length > 0 ? (
              <section className={halfClass("overdue")}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CalendarClock className="size-4 text-red-600" />
                  Überfällige Fristen
                  <Link
                    href="/deadlines?status=overdue"
                    className="ml-auto text-xs font-medium text-[var(--brand-finance)] underline-offset-2 hover:underline"
                  >
                    Alle
                  </Link>
                </div>
                <ul className="space-y-1.5">
                  {data.overdueDeadlines.map((row) => (
                    <li key={row.id}>
                      <Link
                        href={`/documents/${row.document_local_id}`}
                        className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm hover:bg-muted/40"
                      >
                        <DocumentAiIcon
                          aiIconUrl={row.ai_icon_url}
                          category={row.category}
                          size="xs"
                        />
                        <span className="min-w-0">
                          <span className="font-medium">{row.title}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            <span
                              className={dueUrgencyTextClass(
                                dueUrgency(row.deadline_date)
                              )}
                            >
                              {formatDueRelative(row.deadline_date)}
                            </span>
                            <Badge
                              variant="secondary"
                              className="ml-2 bg-red-100 text-[10px] text-red-800"
                            >
                              Überfällig
                            </Badge>
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {data.dueInvoices.length > 0 ? (
              <section className={halfClass("due")}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Receipt className="size-4 text-[var(--brand-finance)]" />
                  Bald fällig (Extrakt)
                  <Link
                    href="/finance"
                    className="ml-auto text-xs font-medium text-[var(--brand-finance)] underline-offset-2 hover:underline"
                  >
                    Alle
                  </Link>
                </div>
                <ul className="space-y-1.5">
                  {data.dueInvoices.map((row) => (
                    <li key={row.id}>
                      <Link
                        href={`/documents/${row.document_local_id}`}
                        className="flex items-start justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm hover:bg-muted/40"
                      >
                        <span className="flex min-w-0 items-start gap-2.5">
                          <DocumentAiIcon
                            aiIconUrl={row.ai_icon_url}
                            category={row.category}
                            size="xs"
                          />
                          <span className="min-w-0">
                            <span className="font-medium">
                              {row.vendor || row.document_title || "Rechnung"}
                            </span>
                            <span className="mt-0.5 block text-xs">
                              <span
                                className={dueUrgencyTextClass(
                                  dueUrgency(row.due_date)
                                )}
                              >
                                {formatDueRelative(row.due_date)}
                              </span>
                            </span>
                          </span>
                        </span>
                        {row.amount != null ? (
                          <span className="shrink-0 tabular-nums text-xs font-semibold">
                            {formatCHF(row.amount, row.currency || "CHF")}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {data.warrantiesExpiring.length > 0 ? (
              <section className={halfClass("warranties")}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Shield className="size-4 text-orange-600" />
                  Ablaufende Garantien
                  <Link
                    href="/warranties"
                    className="ml-auto text-xs font-medium text-[var(--brand-finance)] underline-offset-2 hover:underline"
                  >
                    Alle
                  </Link>
                </div>
                <ul className="space-y-1.5">
                  {data.warrantiesExpiring.map((row) => (
                    <li key={row.id}>
                      <Link
                        href={`/documents/${row.document_local_id}`}
                        className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm hover:bg-muted/40"
                      >
                        <DocumentAiIcon
                          aiIconUrl={row.ai_icon_url}
                          category={row.category}
                          size="xs"
                        />
                        <span className="min-w-0">
                          <span className="font-medium">
                            {row.product_name || row.vendor || "Garantie"}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            <span
                              className={dueUrgencyTextClass(
                                dueUrgency(row.warranty_until)
                              )}
                            >
                              {formatExpiryRelative(row.warranty_until)}
                            </span>
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {analysisTotal > 0 ? (
              <section className={halfClass("analysis")}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <FileWarning className="size-4 text-amber-600" />
                  Analysen
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.analysisIssues.error > 0 ? (
                    <Link
                      href="/documents?analysisStatus=error"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs font-medium hover:bg-muted/40"
                    >
                      <AlertCircle className="size-3.5 text-red-600" />
                      {data.analysisIssues.error} Fehler
                    </Link>
                  ) : null}
                  {data.analysisIssues.pending > 0 ? (
                    <Link
                      href="/documents?analysisStatus=pending"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs font-medium hover:bg-muted/40"
                    >
                      {data.analysisIssues.pending} ausstehend
                    </Link>
                  ) : null}
                  {data.analysisIssues.stale > 0 ? (
                    <Link
                      href="/documents?analysisStatus=stale"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs font-medium hover:bg-muted/40"
                    >
                      {data.analysisIssues.stale} veraltet
                    </Link>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
