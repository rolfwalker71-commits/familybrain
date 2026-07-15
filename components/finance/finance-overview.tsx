"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  Building2,
  Tags,
  Wallet,
  Repeat,
  FileText,
  ChevronRight,
  CircleAlert,
  ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DataList,
  DataListRow,
  DataListMain,
  MetaLine,
  VendorText,
} from "@/components/layout/data-list";
import { PageHeader } from "@/components/layout/page-primitives";
import { AddToCalendarButton } from "@/components/calendar/add-to-calendar-button";
import {
  DocumentInfoButton,
  DocumentTitleLink,
} from "@/components/documents/document-link";
import { FinanceStatsToggle } from "@/components/finance/finance-stats-toggle";
import { formatCHF } from "@/lib/utils/format";
import { daysAgo, toSwissDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/utils/ics";

const DUE_VISIBILITY_DAYS = 180;

type AggRow = { label: string; count: number; total: number };

type InvoiceRow = {
  id: number;
  vendor: string | null;
  amount: number | null;
  currency: string | null;
  invoice_date: string | null;
  due_date: string | null;
  category: string | null;
  description: string | null;
  counts_in_stats?: number | boolean | null;
  document_title: string | null;
  document_local_id: number;
};

type Dimension = "year" | "vendor" | "category";

type Props = {
  byYear: AggRow[];
  byVendor: AggRow[];
  byCategory: AggRow[];
  totals: { count: number; total: number };
  recurring: InvoiceRow[];
  topInvoices: InvoiceRow[];
  dueInvoices: InvoiceRow[];
  excludedCount: number;
  unknownVendor: { count: number; total: number };
};

function isCountedInStats(row: InvoiceRow) {
  return row.counts_in_stats !== 0 && row.counts_in_stats !== false;
}

function invoiceDueEvent(row: InvoiceRow): CalendarEvent | null {
  if (!row.due_date) return null;
  const amount =
    row.amount != null
      ? formatCHF(row.amount, row.currency || "CHF")
      : null;
  const parts = [
    amount ? `Betrag: ${amount}` : null,
    row.category ? `Kategorie: ${row.category}` : null,
    row.description || null,
    row.document_title ? `Dokument: ${row.document_title}` : null,
    row.invoice_date
      ? `Rechnungsdatum: ${toSwissDate(row.invoice_date)}`
      : null,
  ].filter(Boolean);

  return {
    uid: `invoice-due-${row.id}@familybrain.local`,
    title: `Zahlung: ${row.vendor || row.document_title || "Rechnung"}`,
    description: parts.join("\n"),
    startDate: row.due_date,
    endDate: row.due_date,
    url:
      typeof window !== "undefined"
        ? `${window.location.origin}/documents/${row.document_local_id}`
        : undefined,
  };
}

function percent(part: number, whole: number) {
  if (!whole || whole <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 1000) / 10);
}

function ShareBar({ value }: { value: number }) {
  return (
    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-[width]"
        style={{ width: `${Math.max(2, value)}%` }}
      />
    </div>
  );
}

function InvoiceListRow({
  row,
  today,
  showDueDate = false,
  showCalendar = false,
}: {
  row: InvoiceRow;
  today?: string;
  showDueDate?: boolean;
  showCalendar?: boolean;
}) {
  const event = showCalendar ? invoiceDueEvent(row) : null;
  const counted = isCountedInStats(row);
  const overdue =
    showDueDate && Boolean(today && row.due_date && row.due_date < today);

  return (
    <DataListRow
      className={cn(!counted && "bg-muted/30 text-muted-foreground")}
    >
      <DataListMain
        title={<VendorText>{row.vendor || "–"}</VendorText>}
        subtitle={
          <span className="tabular-nums font-medium">
            {formatCHF(row.amount, row.currency || "CHF")}
          </span>
        }
        meta={
          <MetaLine>
            {showDueDate ? (
              <span
                className={cn(
                  "tabular-nums",
                  overdue && counted && "font-medium text-amber-800"
                )}
              >
                Fällig {toSwissDate(row.due_date)}
              </span>
            ) : null}
            {overdue ? (
              <Badge
                variant="secondary"
                className="bg-amber-100 text-amber-800"
              >
                Überfällig
              </Badge>
            ) : null}
            {showDueDate && row.invoice_date ? (
              <span>Rechnung {toSwissDate(row.invoice_date)}</span>
            ) : null}
            <DocumentTitleLink
              documentId={row.document_local_id}
              title={row.document_title}
            />
          </MetaLine>
        }
        actions={
          <>
            <FinanceStatsToggle
              key={`${row.id}-${counted ? 1 : 0}`}
              itemId={row.id}
              countsInStats={counted}
            />
            {showCalendar ? (
              event ? (
                <AddToCalendarButton
                  events={[event]}
                  filename={`familybrain-zahlung-${row.id}`}
                />
              ) : null
            ) : null}
            <DocumentInfoButton documentId={row.document_local_id} />
          </>
        }
      />
    </DataListRow>
  );
}

export function FinanceOverviewClient({
  byYear,
  byVendor,
  byCategory,
  totals,
  recurring,
  topInvoices,
  dueInvoices,
  excludedCount,
  unknownVendor,
}: Props) {
  const [dimension, setDimension] = useState<Dimension | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dueOpen, setDueOpen] = useState(true);
  const [olderDueOpen, setOlderDueOpen] = useState(false);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const dueCutoff = useMemo(() => daysAgo(DUE_VISIBILITY_DAYS), []);

  const sortedDueInvoices = useMemo(() => {
    return [...dueInvoices].sort((a, b) =>
      (b.due_date || "").localeCompare(a.due_date || "")
    );
  }, [dueInvoices]);

  const recentDueInvoices = useMemo(
    () =>
      sortedDueInvoices.filter(
        (r) => r.due_date && r.due_date >= dueCutoff
      ),
    [sortedDueInvoices, dueCutoff]
  );

  const olderDueInvoices = useMemo(
    () =>
      sortedDueInvoices.filter(
        (r) => r.due_date && r.due_date < dueCutoff
      ),
    [sortedDueInvoices, dueCutoff]
  );

  const recentDueTotal = useMemo(
    () => recentDueInvoices.reduce((sum, r) => sum + (r.amount || 0), 0),
    [recentDueInvoices]
  );

  const olderDueTotal = useMemo(
    () => olderDueInvoices.reduce((sum, r) => sum + (r.amount || 0), 0),
    [olderDueInvoices]
  );

  const dueEvents = useMemo(
    () =>
      recentDueInvoices
        .map(invoiceDueEvent)
        .filter((e): e is CalendarEvent => Boolean(e)),
    [recentDueInvoices]
  );

  const olderDueEvents = useMemo(
    () =>
      olderDueInvoices
        .map(invoiceDueEvent)
        .filter((e): e is CalendarEvent => Boolean(e)),
    [olderDueInvoices]
  );

  const dimensionMeta = {
    year: {
      title: "Nach Jahr",
      icon: CalendarDays,
      items: byYear,
      empty: "Keine Jahresdaten",
      hint: "Jahre mit erkannten Beträgen",
    },
    vendor: {
      title: "Nach Lieferant",
      icon: Building2,
      items: byVendor,
      empty: "Keine Lieferanten",
      hint: "Höchste Ausgaben zuerst",
    },
    category: {
      title: "Nach Kategorie",
      icon: Tags,
      items: byCategory,
      empty: "Keine Kategorien",
      hint: "AI-Kategorien aus Analysen",
    },
  } as const;

  const topVendor = useMemo(
    () => byVendor.find((v) => v.label !== "Unbekannt") || byVendor[0] || null,
    [byVendor]
  );

  const activeItems = dimension ? dimensionMeta[dimension].items : [];
  const activeTotal = totals.total;

  const selectedRow = useMemo(() => {
    if (!dimension || !selected) return null;
    return activeItems.find((i) => i.label === selected) || null;
  }, [activeItems, dimension, selected]);

  const detailInvoices = useMemo(() => {
    if (!dimension || !selected) return [];
    return topInvoices
      .filter((row) => {
        if (dimension === "year") {
          const y = (row.invoice_date || "").slice(0, 4);
          return y === selected;
        }
        if (dimension === "vendor") {
          const v = row.vendor?.trim() || "Unbekannt";
          return v === selected;
        }
        const c = row.category?.trim() || "Sonstiges";
        return c === selected;
      })
      .slice(0, 12);
  }, [dimension, selected, topInvoices]);

  function openDimension(next: Dimension) {
    setDimension(next);
    setSelected(null);
  }

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Finanzblick"
        description={
          [
            "KPIs ohne Lieferant «Unbekannt»",
            unknownVendor.count > 0
              ? `${unknownVendor.count} Positionen ohne Lieferant ausgeklammert (${formatCHF(unknownVendor.total)})`
              : null,
            excludedCount > 0
              ? `${excludedCount} manuell ohne Statistik`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")
        }
        actions={
          dueEvents.length > 0 ? (
            <AddToCalendarButton
              events={dueEvents}
              filename="familybrain-zahlungsfristen"
              label="Zahlungsfristen exportieren"
            />
          ) : null
        }
      />

      {recentDueInvoices.length > 0 || olderDueInvoices.length > 0 ? (
        <Card className="min-w-0 overflow-hidden border-amber-200/80 bg-amber-50/40 shadow-sm">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 py-4">
            <button
              type="button"
              onClick={() => setDueOpen((v) => !v)}
              className="flex min-w-0 flex-1 items-start gap-2 text-left"
              aria-expanded={dueOpen}
            >
              <ChevronDown
                className={cn(
                  "mt-1 h-4 w-4 shrink-0 text-amber-700 transition-transform",
                  !dueOpen && "-rotate-90"
                )}
              />
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CircleAlert className="h-4 w-4 text-amber-600" />
                  Rechnungen mit Zahlungsfrist
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {recentDueInvoices.length} aktuell (≤ {DUE_VISIBILITY_DAYS}{" "}
                  Tage) · {formatCHF(recentDueTotal)}
                  {olderDueInvoices.length > 0
                    ? ` · ${olderDueInvoices.length} ältere versteckt`
                    : ""}
                </p>
              </div>
            </button>
            {dueEvents.length > 0 ? (
              <AddToCalendarButton
                events={dueEvents}
                filename="familybrain-zahlungsfristen"
                label="Alle in Kalender"
              />
            ) : null}
          </CardHeader>
          {dueOpen ? (
            <CardContent className="space-y-0 p-0">
              {recentDueInvoices.length === 0 ? (
                <div className="px-6 py-4 text-sm text-muted-foreground">
                  Keine Fälligkeiten aus den letzten {DUE_VISIBILITY_DAYS} Tagen
                  oder in der Zukunft.
                </div>
              ) : (
                <DueInvoiceList rows={recentDueInvoices} today={today} />
              )}

              {olderDueInvoices.length > 0 ? (
                <div className="border-t border-amber-200/70">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setOlderDueOpen((v) => !v)}
                      className="flex min-w-0 items-center gap-2 text-left text-sm"
                      aria-expanded={olderDueOpen}
                    >
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                          !olderDueOpen && "-rotate-90"
                        )}
                      />
                      <span className="font-medium">
                        Älter als {DUE_VISIBILITY_DAYS} Tage
                      </span>
                      <span className="text-muted-foreground">
                        {olderDueInvoices.length} Positionen ·{" "}
                        {formatCHF(olderDueTotal)}
                      </span>
                    </button>
                    {olderDueOpen && olderDueEvents.length > 0 ? (
                      <AddToCalendarButton
                        events={olderDueEvents}
                        filename="familybrain-zahlungsfristen-alt"
                        label="Alte in Kalender"
                      />
                    ) : null}
                  </div>
                  {olderDueOpen ? (
                    <DueInvoiceList rows={olderDueInvoices} today={today} />
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm">
          <CardContent className="flex items-start justify-between gap-3 p-5">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">
                Gesamtausgaben{" "}
                <span className="text-xs">(ohne Unbekannt)</span>
              </p>
              <p className="mt-2 break-words text-2xl font-semibold tabular-nums">
                {formatCHF(totals.total)}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <Wallet className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
        <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm">
          <CardContent className="flex items-start justify-between gap-3 p-5">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">
                Positionen{" "}
                <span className="text-xs">(ohne Unbekannt)</span>
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {totals.count}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <FileText className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
        <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm">
          <CardContent className="flex items-start justify-between gap-3 p-5">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Top-Lieferant</p>
              <p className="mt-2 break-words text-lg font-semibold">
                {topVendor?.label || "–"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {topVendor ? formatCHF(topVendor.total) : "–"}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <Building2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
        <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm">
          <CardContent className="flex items-start justify-between gap-3 p-5">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Wiederkehrend</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {recurring.length}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Repeat className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {(Object.keys(dimensionMeta) as Dimension[]).map((key) => {
          const meta = dimensionMeta[key];
          const Icon = meta.icon;
          const items = meta.items;
          const active = dimension === key;
          const top = items[0];
          const dimTotal = items.reduce((sum, i) => sum + (i.total || 0), 0);

          return (
            <button
              key={key}
              type="button"
              onClick={() => openDimension(key)}
              className={cn(
                "min-w-0 rounded-xl border bg-card p-5 text-left shadow-sm transition-all",
                active
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border/80 hover:border-primary/40 hover:shadow-md"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {meta.title}
                  </div>
                  <p className="mt-3 text-2xl font-semibold tabular-nums">
                    {formatCHF(dimTotal)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {items.length} Einträge · ohne Unbekannt · {meta.hint}
                  </p>
                </div>
                <ChevronRight
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    active && "rotate-90 text-primary"
                  )}
                />
              </div>
              {top ? (
                <div className="mt-4 rounded-lg bg-muted/50 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Top</p>
                  <div className="mt-0.5 flex min-w-0 items-center justify-between gap-2">
                    <span className="break-words text-sm font-medium">
                      {top.label}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums">
                      {formatCHF(top.total)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">{meta.empty}</p>
              )}
            </button>
          );
        })}
      </div>

      {dimension ? (
        <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base">
                {dimensionMeta[dimension].title}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Kachel wählen für Detailansicht
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDimension(null);
                setSelected(null);
              }}
            >
              Schliessen
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {dimensionMeta[dimension].empty}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {activeItems.map((item) => {
                  const share = percent(item.total, activeTotal);
                  const isSelected = selected === item.label;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() =>
                        setSelected(isSelected ? null : item.label)
                      }
                      className={cn(
                        "min-w-0 rounded-xl border p-4 text-left transition-colors",
                        isSelected
                          ? "border-primary bg-accent/40"
                          : "border-border/70 hover:bg-muted/40"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 break-words font-medium">
                          {item.label}
                        </div>
                        <Badge variant="secondary" className="shrink-0">
                          {item.count}
                        </Badge>
                      </div>
                      <div className="mt-2 text-xl font-semibold tabular-nums">
                        {formatCHF(item.total)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {share}% der Gesamtausgaben (ohne Unbekannt)
                      </div>
                      <ShareBar value={share} />
                    </button>
                  );
                })}
              </div>
            )}

            {selectedRow ? (
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-base font-semibold">
                      {selectedRow.label}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedRow.count} Positionen · {formatCHF(selectedRow.total)}
                    </p>
                  </div>
                </div>

                {detailInvoices.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Keine Beispieldokumente in den Top-Rechnungen für diese Auswahl.
                    Öffne die Dokumente über die Suche.
                  </p>
                ) : (
                  <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
                    <DataList>
                      {detailInvoices.map((row) => (
                        <InvoiceListRow
                          key={row.id}
                          row={row}
                          showDueDate
                          showCalendar
                          today={today}
                        />
                      ))}
                    </DataList>
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Wiederkehrende Zahlungen</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recurring.length === 0 ? (
              <div className="px-6 pb-6 text-sm text-muted-foreground">
                Keine wiederkehrenden Zahlungen erkannt.
              </div>
            ) : (
              <DataList>
                {recurring.slice(0, 10).map((row) => (
                  <InvoiceListRow key={row.id} row={row} />
                ))}
              </DataList>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Grösste Einzelbeträge</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {topInvoices.length === 0 ? (
              <div className="px-6 pb-6 text-sm text-muted-foreground">
                Noch keine Rechnungsbeträge.
              </div>
            ) : (
              <DataList>
                {topInvoices.slice(0, 10).map((row) => (
                  <InvoiceListRow key={row.id} row={row} />
                ))}
              </DataList>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DueInvoiceList({
  rows,
  today,
}: {
  rows: InvoiceRow[];
  today: string;
}) {
  return (
    <DataList>
      {rows.map((row) => (
        <InvoiceListRow
          key={row.id}
          row={row}
          today={today}
          showDueDate
          showCalendar
        />
      ))}
    </DataList>
  );
}
