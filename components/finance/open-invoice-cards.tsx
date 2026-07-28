"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckSquare,
  ExternalLink,
  FileText,
  Square,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toSwissDate } from "@/lib/utils/dates";
import { formatCHF } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

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

function FlagRow({
  label,
  checked,
}: {
  label: string;
  checked: boolean;
}) {
  const Icon = checked ? CheckSquare : Square;
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          checked ? "text-[var(--brand-finance)]" : "text-muted-foreground/70"
        )}
      />
      <span>
        {label}:{" "}
        <span className={checked ? "font-medium text-foreground" : undefined}>
          {checked ? "ja" : "nein"}
        </span>
      </span>
    </div>
  );
}

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
        <FileText className="size-8 opacity-60" />
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
  const tags = (invoice.tags || []).slice(0, 6);

  return (
    <article className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_2px_10px_rgba(20,32,28,0.05)]">
      <div className="relative aspect-[4/3] bg-muted/40">
        <CardThumb paperlessId={invoice.paperless_id} title={title} />
        {tags.length > 0 ? (
          <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-wrap justify-end gap-1">
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="max-w-[9rem] truncate bg-background/90 text-[10px] shadow-sm backdrop-blur"
                title={tag}
              >
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-1 border-b border-border/60 px-3 py-2.5">
        <Link
          href={`/documents/${invoice.id}`}
          className="block min-w-0 text-sm font-semibold leading-snug text-[var(--brand-docs)] hover:underline"
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
          <p className="text-xs font-semibold tabular-nums text-foreground">
            {formatCHF(invoice.amount, invoice.currency || "CHF")}
            {invoice.due_date
              ? ` · fällig ${toSwissDate(invoice.due_date)}`
              : ""}
          </p>
        ) : invoice.due_date ? (
          <p className="text-xs text-muted-foreground">
            Fällig {toSwissDate(invoice.due_date)}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5 bg-muted/25 px-3 py-2.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <FileText className="size-3.5 shrink-0" />
          <span className="truncate">
            {invoice.document_type_name || "Dokument"}
          </span>
        </div>
        {invoice.created_date ? (
          <div className="flex items-center gap-2">
            <CalendarDays className="size-3.5 shrink-0" />
            <span>{toSwissDate(invoice.created_date)}</span>
          </div>
        ) : null}
        {invoice.due_date && invoice.due_date !== invoice.created_date ? (
          <div className="flex items-center gap-2">
            <CalendarDays className="size-3.5 shrink-0" />
            <span>Fällig {toSwissDate(invoice.due_date)}</span>
          </div>
        ) : null}
        <FlagRow
          label="Zu bezahlen"
          checked={Number(invoice.zu_bezahlen) === 1}
        />
        <FlagRow label="Bezahlt" checked={Number(invoice.bezahlt) === 1} />
      </div>

      <div className="flex items-center justify-end gap-1 border-t border-border/60 px-2 py-1.5">
        <Link
          href={`/documents/${invoice.id}`}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--brand-finance)] hover:bg-muted"
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {invoices.map((invoice) => (
        <OpenInvoiceCard key={invoice.id} invoice={invoice} />
      ))}
    </div>
  );
}
