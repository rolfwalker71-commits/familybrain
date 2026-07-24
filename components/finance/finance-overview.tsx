"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  LayoutDashboard,
  List,
  PieChart,
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
import { PageHeader, TileTitleBar, MetricTile } from "@/components/layout/page-primitives";
import { IconCircle, pageVisuals, toneSurface, type IconTone } from "@/components/layout/icon-circle";
import { AddToCalendarButton } from "@/components/calendar/add-to-calendar-button";
import {
  DocumentInfoButton,
  DocumentTitleLink,
} from "@/components/documents/document-link";
import { FinanceStatsToggle } from "@/components/finance/finance-stats-toggle";
import { formatCHF } from "@/lib/utils/format";
import { daysAgo, toSwissDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import {
  OverviewTabNav,
  parseOverviewTab,
  type OverviewTab,
  type OverviewTabItem,
} from "@/components/layout/overview-tab-nav";

import type { CalendarEvent } from "@/lib/utils/ics";
import { financeBucket } from "@/lib/extraction/normalize-categories";

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
  detailInvoices: InvoiceRow[];
  excludedCount: number;
  unknownVendor: { count: number; total: number };
};

type DetailGroup = {
  key: string;
  label: string;
  total: number;
  rows: InvoiceRow[];
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
  titleField = "vendor",
}: {
  row: InvoiceRow;
  today?: string;
  showDueDate?: boolean;
  showCalendar?: boolean;
  /** Which value to show as the primary row title. */
  titleField?: "vendor" | "document";
}) {
  const event = showCalendar ? invoiceDueEvent(row) : null;
  const counted = isCountedInStats(row);
  const overdue =
    showDueDate && Boolean(today && row.due_date && row.due_date < today);
  const primaryTitle =
    titleField === "document"
      ? row.document_title || row.description || row.vendor || "–"
      : row.vendor || "–";

  return (
    <DataListRow
      className={cn(!counted && "bg-muted/30 text-muted-foreground")}
    >
      <DataListMain
        title={<VendorText>{primaryTitle}</VendorText>}
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

export function FinanceOverviewClient(props: Parameters<typeof FinanceOverviewClientInner>[0]) {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-muted-foreground">Lädt…</p>
      }
    >
      <FinanceOverviewClientInner {...props} />
    </Suspense>
  );
}

function FinanceOverviewClientInner({
  byYear,
  byVendor,
  byCategory,
  totals,
  recurring,
  topInvoices,
  dueInvoices,
  detailInvoices: allInvoices,
  excludedCount,
  unknownVendor,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

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
      tone: "blue" as IconTone,
      items: byYear,
      empty: "Keine Jahresdaten",
      hint: "Jahre mit erkannten Beträgen",
    },
    vendor: {
      title: "Nach Lieferant",
      icon: Building2,
      tone: "amber" as IconTone,
      items: byVendor,
      empty: "Keine Lieferanten",
      hint: "Höchste Ausgaben zuerst",
    },
    category: {
      title: "Nach Kategorie",
      icon: Tags,
      tone: "violet" as IconTone,
      items: byCategory,
      empty: "Keine Kategorien",
      hint: "Semantisch gruppiert",
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

  // Rows belonging to the current selection (full set, not just top 80).
  const selectedInvoices = useMemo(() => {
    if (!dimension || !selected) return [];
    return allInvoices.filter((row) => {
      if (dimension === "year") {
        const y = (row.invoice_date || row.due_date || "").slice(0, 4);
        return y === selected;
      }
      if (dimension === "vendor") {
        const v = row.vendor?.trim() || "Unbekannt";
        return v === selected;
      }
      return financeBucket(row.category) === selected;
    });
  }, [dimension, selected, allInvoices]);

  // How the receipts are grouped inside the detail panel:
  //  - vendor  → grouped by year (newest first)
  //  - year    → grouped by vendor (highest total first)
  //  - category→ grouped by vendor (highest total first)
  const detailGroupBy: "year" | "vendor" =
    dimension === "vendor" ? "year" : "vendor";

  const detailGroups = useMemo<DetailGroup[]>(() => {
    if (selectedInvoices.length === 0) return [];
    const map = new Map<string, DetailGroup>();
    for (const row of selectedInvoices) {
      let key: string;
      let label: string;
      if (detailGroupBy === "year") {
        key = (row.invoice_date || row.due_date || "").slice(0, 4) || "0000";
        label = key === "0000" ? "Ohne Datum" : key;
      } else {
        label = row.vendor?.trim() || "Unbekannt";
        key = label;
      }
      const prev =
        map.get(key) || ({ key, label, total: 0, rows: [] } as DetailGroup);
      prev.total += row.amount || 0;
      prev.rows.push(row);
      map.set(key, prev);
    }
    const groups = [...map.values()];
    for (const g of groups) {
      g.rows.sort((a, b) => (b.amount || 0) - (a.amount || 0));
    }
    if (detailGroupBy === "year") {
      groups.sort((a, b) => b.key.localeCompare(a.key));
    } else {
      groups.sort((a, b) => b.total - a.total);
    }
    return groups;
  }, [selectedInvoices, detailGroupBy]);

  const activeTab = parseOverviewTab(searchParams.get("tab"));
  const tabItems: OverviewTabItem[] = [
    { id: "overview", label: "Übersicht", icon: LayoutDashboard },
    { id: "list", label: "Liste", icon: List },
    { id: "breakdown", label: "Details", icon: PieChart },
  ];

  function setTab(tab: OverviewTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "overview") params.delete("tab");
    else params.set("tab", tab);
    const q = params.toString();
    router.replace(q ? `?${q}` : "?", { scroll: false });
  }

  function openDimension(next: Dimension) {
    setDimension((prev) => {
      const nextDim = prev === next ? null : next;
      if (nextDim) setTab("breakdown");
      return nextDim;
    });
    setSelected(null);
  }

  return (
    <div className="min-w-0 space-y-4 pb-24 md:space-y-6 md:pb-0">
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
        icon={pageVisuals.finance.icon}
        tone={pageVisuals.finance.tone}
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

      <OverviewTabNav items={tabItems} active={activeTab} onChange={setTab} />

      {activeTab === "overview" ? (
        <>
      {recentDueInvoices.length > 0 || olderDueInvoices.length > 0 ? (
        <Card
          tone="amber"
          className="min-w-0 overflow-hidden border-amber-300 p-0 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_4px_14px_rgba(15,23,42,0.08)] [--card-spacing:0px]"
        >
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 border-b px-4 py-1.5",
              toneSurface("amber").title
            )}
          >
            <button
              type="button"
              onClick={() => setDueOpen((v) => !v)}
              className="flex min-w-0 flex-1 items-start gap-2 text-left"
              aria-expanded={dueOpen}
            >
              <ChevronDown
                className={cn(
                  "mt-1.5 h-4 w-4 shrink-0 text-amber-700 transition-transform",
                  !dueOpen && "-rotate-90"
                )}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[16px] font-bold">
                  <IconCircle icon={CircleAlert} tone="amber" size="sm" />
                  Rechnungen mit Zahlungsfrist
                </div>
                <p className="mt-1 text-sm opacity-80">
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
          </div>
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
                <div className="border-t border-border">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/70 px-4 py-3">
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
                      <span className="font-bold">
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
        <MetricTile
          title={
            <>
              Gesamtausgaben{" "}
              <span className="text-sm font-normal opacity-70">
                (ohne Unbekannt)
              </span>
            </>
          }
          value={formatCHF(totals.total)}
          icon={Wallet}
          tone="green"
        />
        <MetricTile
          title={
            <>
              Positionen{" "}
              <span className="text-sm font-normal opacity-70">
                (ohne Unbekannt)
              </span>
            </>
          }
          value={totals.count}
          icon={FileText}
          tone="sky"
        />
        <MetricTile
          title="Top-Lieferant"
          value={topVendor?.label || "–"}
          subtitle={topVendor ? formatCHF(topVendor.total) : undefined}
          icon={Building2}
          tone="amber"
        />
        <MetricTile
          title="Wiederkehrend"
          value={recurring.length}
          icon={Repeat}
          tone="teal"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {(Object.keys(dimensionMeta) as Dimension[]).map((key) => {
          const meta = dimensionMeta[key];
          const Icon = meta.icon;
          const items = meta.items;
          const active = dimension === key;
          const top = items[0];
          const dimTotal = items.reduce((sum, i) => sum + (i.total || 0), 0);
          const surface = toneSurface(meta.tone);

          return (
            <button
              key={key}
              type="button"
              onClick={() => openDimension(key)}
              className={cn(
                "min-w-0 overflow-hidden rounded-xl border-2 text-left shadow-[0_1px_2px_rgba(15,23,42,0.06),0_4px_14px_rgba(15,23,42,0.08)] transition-all",
                surface.body,
                active
                  ? "border-primary ring-2 ring-primary/20"
                  : "hover:border-primary/40"
              )}
            >
              <TileTitleBar
                tone={meta.tone}
                trailing={
                  <div className="flex items-center gap-2">
                    <IconCircle icon={Icon} tone={meta.tone} size="sm" />
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        active && "rotate-90 text-primary"
                      )}
                    />
                  </div>
                }
              >
                {meta.title}
              </TileTitleBar>
              <div className="p-5">
                <p className="text-2xl font-semibold tabular-nums">
                  {formatCHF(dimTotal)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {items.length} Einträge · ohne Unbekannt · {meta.hint}
                </p>
                {top ? (
                  <div className="mt-4 rounded-lg bg-muted px-3 py-2">
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
              </div>
            </button>
          );
        })}
      </div>
        </>
      ) : null}

      {activeTab === "breakdown" ? (
        dimension ? (
        <Card
          tone={dimensionMeta[dimension].tone}
          className="min-w-0 overflow-hidden shadow-sm"
        >
          <CardHeader
            tone={dimensionMeta[dimension].tone}
            className="flex flex-row flex-wrap items-center justify-between gap-3"
          >
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
                  const dimTone = dimensionMeta[dimension].tone;
                  const itemSurface = toneSurface(dimTone);
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() =>
                        setSelected(isSelected ? null : item.label)
                      }
                      className={cn(
                        "min-w-0 overflow-hidden rounded-xl border-2 text-left shadow-[0_1px_2px_rgba(15,23,42,0.06),0_4px_14px_rgba(15,23,42,0.08)] transition-colors",
                        itemSurface.body,
                        isSelected
                          ? "border-primary ring-2 ring-primary/20"
                          : "hover:border-primary/40"
                      )}
                    >
                      <TileTitleBar
                        tone={dimTone}
                        trailing={
                          <Badge variant="secondary" className="shrink-0">
                            {item.count}
                          </Badge>
                        }
                      >
                        <span className="break-words">{item.label}</span>
                      </TileTitleBar>
                      <div className="p-4">
                        <div className="text-xl font-semibold tabular-nums">
                          {formatCHF(item.total)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {share}% der Gesamtausgaben (ohne Unbekannt)
                        </div>
                        <ShareBar value={share} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedRow ? (
              <div
                className={cn(
                  "overflow-hidden rounded-xl border-2",
                  toneSurface(dimensionMeta[dimension].tone).body
                )}
              >
                <TileTitleBar tone={dimensionMeta[dimension].tone}>
                  <div className="min-w-0">
                    <div className="break-words">{selectedRow.label}</div>
                    <p className="mt-0.5 text-xs font-normal opacity-80">
                      {selectedRow.count} Positionen ·{" "}
                      {formatCHF(selectedRow.total)} ·{" "}
                      {detailGroupBy === "year"
                        ? "nach Jahr"
                        : "nach Lieferant"}
                    </p>
                  </div>
                </TileTitleBar>

                {detailGroups.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    Keine Positionen für diese Auswahl.
                  </p>
                ) : (
                  <div className="space-y-3 p-4">
                    {detailGroups.map((group) => (
                      <div
                        key={group.key}
                        className={cn(
                          "overflow-hidden rounded-lg border-2",
                          toneSurface(dimensionMeta[dimension].tone).body
                        )}
                      >
                        <TileTitleBar
                          tone={dimensionMeta[dimension].tone}
                          trailing={
                            <>
                              <Badge variant="secondary" className="shrink-0">
                                {group.rows.length}
                              </Badge>
                              <span className="text-sm font-semibold tabular-nums">
                                {formatCHF(group.total)}
                              </span>
                            </>
                          }
                        >
                          <span className="break-words">{group.label}</span>
                        </TileTitleBar>
                        <DataList>
                          {group.rows.map((row) => (
                            <InvoiceListRow
                              key={row.id}
                              row={row}
                              showDueDate
                              showCalendar
                              today={today}
                              titleField={
                                detailGroupBy === "vendor"
                                  ? "document"
                                  : "vendor"
                              }
                            />
                          ))}
                        </DataList>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : (
          <Card className="border-border/80 shadow-sm">
            <CardContent className="py-6 text-sm text-muted-foreground">
              Wähle in der Übersicht eine Dimension (Lieferant, Kategorie, …), um
              die Aufschlüsselung zu sehen.
            </CardContent>
          </Card>
        )
      ) : null}

      {activeTab === "list" ? (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card tone="green" className="min-w-0 overflow-hidden shadow-sm">
          <CardHeader tone="green">
            <CardTitle className="flex items-center gap-3 text-base">
              <IconCircle icon={Repeat} tone="green" size="sm" />
              Wiederkehrende Zahlungen
            </CardTitle>
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

        <Card tone="green" className="min-w-0 overflow-hidden shadow-sm">
          <CardHeader tone="green">
            <CardTitle className="flex items-center gap-3 text-base">
              <IconCircle icon={Wallet} tone="green" size="sm" />
              Grösste Einzelbeträge
            </CardTitle>
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
      ) : null}
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
