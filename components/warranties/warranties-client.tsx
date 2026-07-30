"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DataList,
  DataListRow,
  DataListMain,
  MetaLine,
  SoftText,
  VendorText,
} from "@/components/layout/data-list";
import { TimeBucketSection } from "@/components/layout/time-bucket-section";
import { PageHeader } from "@/components/layout/page-primitives";
import {
  ListSortControl,
  useListSortDir,
} from "@/components/layout/list-sort-control";
import { pageVisuals } from "@/components/layout/icon-circle";
import { AddToCalendarButton } from "@/components/calendar/add-to-calendar-button";
import {
  DocumentInfoButton,
  DocumentTitleLink,
} from "@/components/documents/document-link";
import { DocumentAiIcon } from "@/components/documents/document-ai-icon";
import { RecipientAvatars } from "@/components/family/recipient-avatars";
import { toSwissDate } from "@/lib/utils/dates";
import { compareNullableDate } from "@/lib/utils/list-sort";
import { formatCHF } from "@/lib/utils/format";
import { groupByTimeBucket } from "@/lib/utils/time-buckets";
import {
  resolveTemporalStatus,
  temporalStatusBadgeClass,
  type TemporalStatus,
  warrantyStatusLabel,
} from "@/lib/utils/temporal-status";
import type { CalendarEvent } from "@/lib/utils/ics";
import type { RecipientAvatarInfo } from "@/components/family/recipient-avatars";

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
  ai_icon_url?: string | null;
  category?: string | null;
  recipients?: RecipientAvatarInfo;
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

function todayIso(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function matchesWarranty(row: WarrantyRow, q: string): boolean {
  if (!q) return true;
  const hay = [
    row.product_name,
    row.manufacturer,
    row.vendor,
    row.correspondent_name,
    row.serial_number,
    row.document_title,
    row.category,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function WarrantiesClient({ rows }: { rows: WarrantyRow[] }) {
  const [sortDir, setSortDir] = useListSortDir("warranties", "desc");
  const [search, setSearch] = useState("");
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        compareNullableDate(a.warranty_until, b.warranty_until, sortDir)
      ),
    [rows, sortDir]
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((row) => matchesWarranty(row, q));
  }, [sorted, search]);
  const today = todayIso();
  const searching = search.trim().length > 0;
  const buckets = useMemo(
    () =>
      groupByTimeBucket(
        filtered,
        (r) => r.warranty_until,
        today,
        "warranties"
      ).map((b) => (searching ? { ...b, defaultOpen: true } : b)),
    [filtered, today, searching]
  );
  const exportable = filtered
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
          <div className="flex flex-wrap gap-2">
            <ListSortControl
              storageKey="warranties"
              label="Garantie bis"
              defaultDir="desc"
              dir={sortDir}
              onDirChange={setSortDir}
            />
            {exportable.length > 0 ? (
              <AddToCalendarButton
                events={exportable}
                filename="familybrain-garantien"
                label="Garantien exportieren"
              />
            ) : null}
          </div>
        }
      />

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Gerät, Hersteller, Händler, Seriennr. …"
          className="pl-9"
          aria-label="Garantien durchsuchen"
        />
      </div>

      <Card className="min-w-0 gap-0 overflow-visible border-0 bg-transparent p-0 shadow-none md:overflow-hidden md:border md:border-border/60 md:bg-card md:shadow-[0_4px_16px_rgba(20,32,28,0.05)]">
        <CardContent className="p-0">
          {sorted.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-card p-8 text-sm text-muted-foreground shadow-[0_4px_16px_rgba(20,32,28,0.05)] md:rounded-none md:border-0 md:bg-transparent md:shadow-none">
              Noch keine Garantien erkannt. Analysiere Kaufbelege und
              Gerätedokumente.
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-card p-8 text-sm text-muted-foreground shadow-[0_4px_16px_rgba(20,32,28,0.05)] md:rounded-none md:border-0 md:bg-transparent md:shadow-none">
              Keine Treffer für «{search.trim()}».
            </div>
          ) : (
            <div>
              {buckets.map((bucket) => (
                <TimeBucketSection
                  key={`${bucket.id}-${searching ? "s" : "n"}`}
                  title={bucket.title}
                  accent={bucket.accent}
                  defaultOpen={bucket.defaultOpen}
                  countLabel={`${bucket.rows.length} ${
                    bucket.rows.length === 1 ? "Gerät" : "Geräte"
                  }`}
                >
                  <DataList>
                    {bucket.rows.map((row) => {
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
                            leading={
                              <DocumentAiIcon
                                aiIconUrl={row.ai_icon_url}
                                category={row.category}
                                size="md"
                              />
                            }
                            title={row.product_name || "–"}
                            subtitle={
                              <div className="space-y-1">
                                {manufacturerLine ? (
                                  <SoftText className="mt-0">
                                    {manufacturerLine}
                                  </SoftText>
                                ) : null}
                                <VendorText className="text-sm">
                                  {row.vendor ||
                                    row.correspondent_name ||
                                    "–"}
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
                                <RecipientAvatars recipients={row.recipients} />
                                <span>
                                  Kauf {toSwissDate(row.purchase_date)}
                                </span>
                                <span className="font-semibold">
                                  Garantie bis{" "}
                                  {toSwissDate(row.warranty_until)}
                                </span>
                                <span className="tabular-nums">
                                  {formatCHF(
                                    row.price,
                                    row.currency || "CHF"
                                  )}
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
                </TimeBucketSection>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
