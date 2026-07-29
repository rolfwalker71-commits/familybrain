"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCHF } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import {
  dueUrgency,
  dueUrgencyBadgeClass,
  formatDueRelative,
} from "@/lib/utils/due-urgency";
import { DocumentAiIcon } from "@/components/documents/document-ai-icon";

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
  ai_icon_url?: string | null;
  category?: string | null;
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
  const urgency = invoice.due_date ? dueUrgency(invoice.due_date) : null;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-lg border-2 border-[color-mix(in_oklab,var(--brand-finance)_35%,var(--border))] bg-card",
        "shadow-[0_1px_0_rgba(255,255,255,0.65)_inset,0_2px_3px_rgba(20,32,28,0.08),0_8px_18px_rgba(20,32,28,0.12),0_16px_32px_rgba(20,32,28,0.08)]"
      )}
    >
      <div className="relative aspect-[5/3] bg-muted/40">
        <CardThumb paperlessId={invoice.paperless_id} title={title} />
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-xl shadow-md ring-2 ring-white/80">
          <DocumentAiIcon
            aiIconUrl={invoice.ai_icon_url}
            category={invoice.category}
            size="md"
          />
        </span>
      </div>

      <div className="space-y-0.5 border-b border-border/70 px-2.5 pb-1.5 pt-7">
        <Link
          href={`/documents/${invoice.id}`}
          className="block min-w-0 text-[10px] font-semibold leading-snug text-[var(--brand-docs)] hover:underline sm:text-[11px]"
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
          <p className="text-[10px] font-semibold tabular-nums text-foreground">
            {formatCHF(invoice.amount, invoice.currency || "CHF")}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-1 px-1.5 py-1">
        {invoice.due_date && urgency ? (
          <Badge
            variant="secondary"
            className={cn(
              "max-w-[65%] truncate text-[10px] font-semibold",
              dueUrgencyBadgeClass(urgency)
            )}
          >
            {formatDueRelative(invoice.due_date)}
          </Badge>
        ) : (
          <span />
        )}
        <Link
          href={`/documents/${invoice.id}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-[var(--brand-finance)] hover:bg-muted"
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
