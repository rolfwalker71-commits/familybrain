"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import { formatCHF } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import {
  dueUrgency,
  dueUrgencyTextClass,
  formatDueRelative,
} from "@/lib/utils/due-urgency";

export type OpenInvoiceCardModel = {
  id: number;
  paperless_id: number;
  title: string | null;
  correspondent_name?: string | null;
  document_type_name?: string | null;
  created_date?: string | null;
  modified_at?: string | null;
  amount?: number | null;
  currency?: string | null;
  due_date?: string | null;
  vendor?: string | null;
  tags?: string[];
  zu_bezahlen?: number | null;
  bezahlt?: number | null;
};

function CardThumb({
  paperlessId,
  title,
}: {
  paperlessId: number;
  title: string;
}) {
  const [error, setError] = useState(false);
  const src = `/api/paperless/documents/${paperlessId}/file?type=thumb`;
  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted/50 text-muted-foreground">
        <FileText className="size-6 opacity-60" />
        <span className="text-[10px]">PDF</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={title}
      className="h-full w-full object-cover object-top"
      onError={() => setError(true)}
    />
  );
}

export function OpenInvoiceCard({ invoice }: { invoice: OpenInvoiceCardModel }) {
  const title = invoice.title || "Rechnung";
  const correspondent =
    invoice.correspondent_name || invoice.vendor || null;
  const toPay = Number(invoice.zu_bezahlen) === 1;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-lg border-2 border-[color-mix(in_oklab,var(--brand-finance)_35%,var(--border))] bg-card",
        "shadow-[0_1px_0_rgba(255,255,255,0.65)_inset,0_2px_3px_rgba(20,32,28,0.08),0_8px_18px_rgba(20,32,28,0.12),0_16px_32px_rgba(20,32,28,0.08)]"
      )}
    >
      <div className="relative aspect-[5/3] bg-muted/40">
        <CardThumb paperlessId={invoice.paperless_id} title={title} />
        <span
          className={cn(
            "absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm backdrop-blur-sm",
            toPay
              ? "border border-[var(--brand-finance)]/25 bg-[var(--brand-finance-soft)] text-[var(--brand-finance)]"
              : "border border-border/70 bg-background/90 text-muted-foreground"
          )}
        >
          Zu bezahlen: {toPay ? "ja" : "nein"}
        </span>
      </div>

      <div className="space-y-0.5 border-b border-border/70 px-2.5 py-2">
        <Link
          href={`/documents/${invoice.id}`}
          className="block min-w-0 text-xs font-semibold leading-snug text-[var(--brand-docs)] hover:underline sm:text-[13px]"
        >
          {correspondent ? (
            <>
              <span>{correspondent}</span>
              <span className="font-normal text-foreground">: {title}</span>
            </>
          ) : (
            title
          )}
        </Link>
        {invoice.amount != null ? (
          <p className="text-[11px] font-semibold tabular-nums text-foreground">
            {formatCHF(invoice.amount, invoice.currency || "CHF")}
          </p>
        ) : null}
        {invoice.due_date ? (
          <p
            className={cn(
              "text-[11px] font-medium",
              dueUrgencyTextClass(dueUrgency(invoice.due_date))
            )}
          >
            {formatDueRelative(invoice.due_date)}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-1 px-1.5 py-1">
        <Link
          href={`/documents/${invoice.id}`}
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-[var(--brand-finance)] hover:bg-muted"
        >
          Öffnen
          <ExternalLink className="size-3" />
        </Link>
      </div>
    </article>
  );
}

export function OpenInvoiceCardGrid({
  invoices,
  emptyLabel = "Keine offenen Rechnungen (Paperless «Zu bezahlen» / «Bezahlt»).",
}: {
  invoices: OpenInvoiceCardModel[];
  emptyLabel?: string;
}) {
  if (invoices.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
      {invoices.map((invoice) => (
        <OpenInvoiceCard key={invoice.id} invoice={invoice} />
      ))}
    </div>
  );
}
