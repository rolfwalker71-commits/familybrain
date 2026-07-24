"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DataList,
  DataListRow,
  DataListMain,
  MetaLine,
  SoftText,
  VendorText,
} from "@/components/layout/data-list";
import { PageHeader } from "@/components/layout/page-primitives";
import { pageVisuals } from "@/components/layout/icon-circle";
import { AddToCalendarButton } from "@/components/calendar/add-to-calendar-button";
import {
  DocumentInfoButton,
  DocumentTitleLink,
} from "@/components/documents/document-link";
import { toSwissDate } from "@/lib/utils/dates";
import { formatCHF } from "@/lib/utils/format";
import {
  resolveTemporalStatus,
  temporalStatusBadgeClass,
  type TemporalStatus,
  warrantyStatusLabel,
} from "@/lib/utils/temporal-status";
import type { CalendarEvent } from "@/lib/utils/ics";

export type WarrantyRow = {
  id: number;
  product_name: string | null;
  manufacturer: string | null;
  vendor: string | null;
  purchase_date: string | null;
  price: number | null;
  currency: string | null;
  serial_number: string | null;
  warranty_until: string | null;
  status: string | null;
  document_title: string | null;
  document_local_id: number;
  correspondent_name: string | null;
};

function warrantyToEvent(row: WarrantyRow): CalendarEvent | null {
  if (!row.warranty_until) return null;
  const parts = [
    row.manufacturer ? `Hersteller: ${row.manufacturer}` : null,
    row.vendor ? `Händler: ${row.vendor}` : null,
    row.correspondent_name
      ? `Korrespondent: ${row.correspondent_name}`
      : null,
    row.serial_number ? `SN: ${row.serial_number}` : null,
    row.purchase_date
      ? `Kaufdatum: ${toSwissDate(row.purchase_date)}`
      : null,
    row.price != null
      ? `Preis: ${formatCHF(row.price, row.currency || "CHF")}`
      : null,
    row.document_title ? `Dokument: ${row.document_title}` : null,
  ].filter(Boolean);

  return {
    uid: `warranty-${row.id}@familybrain.local`,
    title: `Garantie endet: ${row.product_name || "Gerät"}`,
    description: parts.join("\n"),
    startDate: row.warranty_until,
    endDate: row.warranty_until,
    url:
      typeof window !== "undefined"
        ? `${window.location.origin}/documents/${row.document_local_id}`
        : undefined,
  };
}

function asTemporalStatus(status: string | null | undefined): TemporalStatus {
  if (
    status === "active" ||
    status === "expiring_soon" ||
    status === "expired"
  ) {
    return status;
  }
  return "unknown";
}

export function WarrantiesClient({ rows }: { rows: WarrantyRow[] }) {
  const exportable = rows
    .map(warrantyToEvent)
    .filter((e): e is CalendarEvent => Boolean(e));

  return (
    <div className="min-w-0 space-y-4 pb-6 md:space-y-6">
      <PageHeader
        title="Geräte & Garantien"
        description="Extrahierte Geräte und Garantielaufzeiten"
        icon={pageVisuals.warranties.icon}
        tone={pageVisuals.warranties.tone}
        actions={
          exportable.length > 0 ? (
            <AddToCalendarButton
              events={exportable}
              filename="familybrain-garantien"
              label="Garantien exportieren"
            />
          ) : null
        }
      />

      <Card className="min-w-0 gap-0 overflow-visible border-0 bg-transparent p-0 shadow-none md:overflow-hidden md:border md:border-border/60 md:bg-card md:shadow-[0_4px_16px_rgba(20,32,28,0.05)]">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-card p-8 text-sm text-muted-foreground shadow-[0_4px_16px_rgba(20,32,28,0.05)] md:rounded-none md:border-0 md:bg-transparent md:shadow-none">
              Noch keine Garantien erkannt. Analysiere Kaufbelege und
              Gerätedokumente.
            </div>
          ) : (
            <DataList>
              {rows.map((row) => {
                const event = warrantyToEvent(row);
                const status: TemporalStatus =
                  row.status && row.status !== "unknown"
                    ? asTemporalStatus(row.status)
                    : resolveTemporalStatus(row.warranty_until);
                const manufacturerLine = [
                  row.manufacturer || null,
                  row.serial_number ? `SN ${row.serial_number}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <DataListRow key={row.id}>
                    <DataListMain
                      title={row.product_name || "–"}
                      subtitle={
                        <div className="space-y-1">
                          {manufacturerLine ? (
                            <SoftText className="mt-0">{manufacturerLine}</SoftText>
                          ) : null}
                          <VendorText className="text-sm">
                            {row.vendor || row.correspondent_name || "–"}
                          </VendorText>
                          {row.correspondent_name &&
                          row.vendor &&
                          row.correspondent_name !== row.vendor ? (
                            <SoftText className="mt-0">
                              Korrespondent: {row.correspondent_name}
                            </SoftText>
                          ) : null}
                        </div>
                      }
                      meta={
                        <MetaLine>
                          <span>
                            Kauf {toSwissDate(row.purchase_date)}
                          </span>
                          <span className="font-semibold">
                            Garantie bis {toSwissDate(row.warranty_until)}
                          </span>
                          <span className="tabular-nums">
                            {formatCHF(row.price, row.currency || "CHF")}
                          </span>
                          <Badge
                            variant="secondary"
                            className={temporalStatusBadgeClass(status)}
                          >
                            {warrantyStatusLabel(status)}
                          </Badge>
                          <DocumentTitleLink
                            documentId={row.document_local_id}
                            title={row.document_title}
                          />
                        </MetaLine>
                      }
                      actions={
                        <>
                          {event ? (
                            <AddToCalendarButton
                              events={[event]}
                              filename={`familybrain-garantie-${row.id}`}
                            />
                          ) : null}
                          <DocumentInfoButton
                            documentId={row.document_local_id}
                          />
                        </>
                      }
                    />
                  </DataListRow>
                );
              })}
            </DataList>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
