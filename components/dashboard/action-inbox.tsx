"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CalendarClock,
  FileWarning,
  Receipt,
  Shield,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  OpenInvoiceCardGrid,
  type OpenInvoiceCardModel,
} from "@/components/finance/open-invoice-cards";
import { formatCHF } from "@/lib/utils/format";
import {
  dueUrgency,
  dueUrgencyTextClass,
  formatDueRelative,
  formatExpiryRelative,
} from "@/lib/utils/due-urgency";

type InboxPayload = {
  overdueDeadlines: Array<{
    id: number;
    title: string;
    deadline_date: string | null;
    document_local_id: number;
    document_title: string | null;
  }>;
  dueInvoices: Array<{
    id: number;
    vendor: string | null;
    amount: number | null;
    currency: string | null;
    due_date: string;
    document_local_id: number;
    document_title: string | null;
  }>;
  openUnpaidInvoices?: OpenInvoiceCardModel[];
  warrantiesExpiring: Array<{
    id: number;
    product_name: string | null;
    vendor: string | null;
    warranty_until: string | null;
    document_local_id: number;
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

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/dashboard/inbox");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Laden fehlgeschlagen");
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

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
  const empty =
    data.overdueDeadlines.length === 0 &&
    data.dueInvoices.length === 0 &&
    openUnpaid.length === 0 &&
    data.warrantiesExpiring.length === 0 &&
    analysisTotal === 0;

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

        {empty ? (
          <p className="text-sm text-muted-foreground">
            Aktuell nichts Dringendes.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
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
              <section className="space-y-2">
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
                        className="block rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm hover:bg-muted/40"
                      >
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
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {data.dueInvoices.length > 0 ? (
              <section className="space-y-2">
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
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Shield className="size-4 text-orange-600" />
                  Garantien bald ab
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
                        className="block rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm hover:bg-muted/40"
                      >
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
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {analysisTotal > 0 ? (
              <section className="space-y-2">
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
