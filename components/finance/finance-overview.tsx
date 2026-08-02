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
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DataList,
  DataListRow,
  DataListMain,
  MetaLine,
  VendorText,
} from "@/components/layout/data-list";
import { PageHeader, TileTitleBar, MetricTile } from "@/components/layout/page-primitives";
import {
  ListSortControl,
  useListSortDir,
} from "@/components/layout/list-sort-control";
import { IconCircle, pageVisuals, toneSurface, type IconTone } from "@/components/layout/icon-circle";
import { AddToCalendarButton } from "@/components/calendar/add-to-calendar-button";
import {
  DocumentInfoButton,
  DocumentTitleLink,
} from "@/components/documents/document-link";
import { FinanceStatsToggle } from "@/components/finance/finance-stats-toggle";
import { formatCHF } from "@/lib/utils/format";
import { daysAgo, toSwissDate } from "@/lib/utils/dates";
import {
  dueUrgency,
  dueUrgencyTextClass,
  formatDueRelative,
} from "@/lib/utils/due-urgency";
import { compareNullableDate } from "@/lib/utils/list-sort";
import { cn } from "@/lib/utils";
import { groupByTimeBucket } from "@/lib/utils/time-buckets";
import Link from "next/link";
import { DocumentAiIcon } from "@/components/documents/document-ai-icon";
import { BRAND } from "@/lib/branding";
import {
  OverviewTabNav,
  parseOverviewTab,
  type OverviewTab,
  type OverviewTabItem,
} from "@/components/layout/overview-tab-nav";

import type { CalendarEvent } from "@/lib/utils/ics";
import { financeBucket } from "@/lib/extraction/normalize-categories";
import { RecipientAvatars } from "@/components/family/recipient-avatars";
import type { RecipientAvatarInfo } from "@/components/family/recipient-avatars";

const DUE_VISIBILITY_DAYS = 180;

type AggRow = { label: string; count: number; total: number };

type InvoiceRow = {
  id: number;
  /** Real financial_items.id when present; null if only the Paperless doc is open. */
  financial_item_id?: number | null;
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
  paperless_id?: number | null;
  ai_icon_url?: string | null;
  recipients?: RecipientAvatarInfo;
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
            <RecipientAvatars recipients={row.recipients} />
            {showDueDate ? (
              <span
                className={cn(
                  "font-medium",
                  dueUrgencyTextClass(dueUrgency(row.due_date, today))
                )}
              >
                {formatDueRelative(row.due_date, today)}
              </span>
            ) : null}
            {overdue ? (
              <Badge
                variant="secondary"
                className="bg-red-100 text-red-800"
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
              aiIconUrl={row.ai_icon_url}
              category={row.category}
              showIcon
              iconSize="xs"
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
  const [breakdownSearch, setBreakdownSearch] = useState("");
  const [breakdownSort, setBreakdownSort] = useState<"amount" | "name">(
    "amount"
  );
  const [dueOpen, setDueOpen] = useState(true);
  const [olderDueOpen, setOlderDueOpen] = useState(false);
  const [sortDir, setSortDir] = useListSortDir("finance-due", "desc");
  const [selectedDocIds, setSelectedDocIds] = useState<Set<number>>(
    () => new Set()
  );
  const [markPending, setMarkPending] = useState(false);
  const [markMessage, setMarkMessage] = useState<string | null>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const dueCutoff = useMemo(() => daysAgo(DUE_VISIBILITY_DAYS), []);

  const sortedDueInvoices = useMemo(() => {
    return [...dueInvoices].sort((a, b) =>
      compareNullableDate(a.due_date, b.due_date, sortDir)
    );
  }, [dueInvoices, sortDir]);

  const recentDueInvoices = useMemo(
    () =>
      sortedDueInvoices.filter(
        (r) => !r.due_date || r.due_date >= dueCutoff
      ),
    [sortedDueInvoices, dueCutoff]
  );

  const olderDueInvoices = useMemo(
    () =>
      sortedDueInvoices.filter(
        (r) => Boolean(r.due_date) && r.due_date! < dueCutoff
      ),
    [sortedDueInvoices, dueCutoff]
  );

  const dueBuckets = useMemo(
    () =>
      groupByTimeBucket(recentDueInvoices, (r) => r.due_date, today).map(
        (b) =>
          b.id === "none"
            ? { ...b, title: "Ohne Fälligkeit", defaultOpen: true }
            : b
      ),
    [recentDueInvoices, today]
  );

  const sumAmount = (rows: InvoiceRow[]) =>
    rows.reduce((sum, r) => sum + (r.amount || 0), 0);

  const recentDueTotal = useMemo(
    () => sumAmount(recentDueInvoices),
    [recentDueInvoices]
  );

  const olderDueTotal = useMemo(
    () => sumAmount(olderDueInvoices),
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
      tone: "green" as IconTone,
      items: byYear,
      empty: "Keine Jahresdaten",
      hint: "Jahre mit erkannten Beträgen",
    },
    vendor: {
      title: "Nach Lieferant",
      icon: Building2,
      tone: "green" as IconTone,
      items: byVendor,
      empty: "Keine Lieferanten",
      hint: "Höchste Ausgaben zuerst",
    },
    category: {
      title: "Nach Kategorie",
      icon: Tags,
      tone: "green" as IconTone,
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

  const filteredBreakdownItems = useMemo(() => {
    const q = breakdownSearch.trim().toLowerCase();
    let rows = activeItems;
    if (q) {
      rows = rows.filter((item) => item.label.toLowerCase().includes(q));
    }
    const sorted = [...rows];
    if (breakdownSort === "name") {
      sorted.sort((a, b) =>
        a.label.localeCompare(b.label, "de-CH", { sensitivity: "base" })
      );
    } else {
      sorted.sort((a, b) => b.total - a.total);
    }
    return sorted;
  }, [activeItems, breakdownSearch, breakdownSort]);

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

  function toggleDocSelected(documentLocalId: number) {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(documentLocalId)) next.delete(documentLocalId);
      else next.add(documentLocalId);
      return next;
    });
  }

  function selectDocs(ids: number[]) {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedDocIds(new Set());
  }

  async function markSelectedPaid() {
    const ids = [...selectedDocIds];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `${ids.length} Rechnung${ids.length === 1 ? "" : "en"} als beglichen markieren?`
      )
    ) {
      return;
    }
    setMarkPending(true);
    setMarkMessage(null);
    try {
      const res = await fetch("/api/finance/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentLocalIds: ids }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        markedLocal?: number;
        writtenPaperless?: number;
        errors?: Array<{ documentLocalId: number; error: string }>;
        error?: string;
      };
      if (!res.ok && res.status !== 207) {
        throw new Error(data.error || "Markieren fehlgeschlagen");
      }
      const written = data.writtenPaperless ?? 0;
      const local = data.markedLocal ?? 0;
      const errCount = data.errors?.length ?? 0;
      setMarkMessage(
        errCount > 0
          ? [
              `${local} lokal beglichen, ${written} in Paperless · ${errCount} Hinweis(e)`,
              ...data.errors!.map(
                ({ documentLocalId, error }) => `Beleg ${documentLocalId}: ${error}`
              ),
            ].join("\n")
          : `${local} Rechnung(en) als beglichen markiert (${written} in Paperless)`
      );
      clearSelection();
      router.refresh();
    } catch (err) {
      setMarkMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setMarkPending(false);
    }
  }

  const selectableDueIds = useMemo(() => {
    const ids = new Set<number>();
    for (const row of recentDueInvoices) ids.add(row.document_local_id);
    return [...ids];
  }, [recentDueInvoices]);

  function openDimension(next: Dimension) {
    setDimension((prev) => {
      const nextDim = prev === next ? null : next;
      if (nextDim) setTab("breakdown");
      return nextDim;
    });
    setSelected(null);
    setBreakdownSearch("");
    setBreakdownSort("amount");
  }

  return (
    <div className="min-w-0 space-y-4 pb-28 md:space-y-6 md:pb-0">
      <PageHeader
        title="Finanzblick"
        description={[
          "Paperless-Finanzblick in Buddy",
          "KPIs ohne Lieferant «Unbekannt»",
          unknownVendor.count > 0
            ? `${unknownVendor.count} Positionen ohne Lieferant ausgeklammert (${formatCHF(unknownVendor.total)})`
            : null,
          excludedCount > 0 ? `${excludedCount} manuell ohne Statistik` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        icon={pageVisuals.finance.icon}
        tone={pageVisuals.finance.tone}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/finance-brain"
              className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-accent"
            >
              {BRAND.finance}
            </Link>
            <ListSortControl
              storageKey="finance-due"
              label="Fälligkeit"
              defaultDir="desc"
              dir={sortDir}
              onDirChange={setSortDir}
            />
            {dueEvents.length > 0 ? (
              <AddToCalendarButton
                events={dueEvents}
                filename="familybrain-zahlungsfristen"
                label="Zahlungsfristen exportieren"
              />
            ) : null}
          </div>
        }
      />

      <OverviewTabNav
        items={tabItems}
        active={activeTab}
        onChange={setTab}
        accent="green"
      />

      {activeTab === "overview" ? (
        <>
      {recentDueInvoices.length > 0 || olderDueInvoices.length > 0 ? (
        <Card
          tone="amber"
          className="min-w-0 overflow-hidden border-amber-300/80 p-0 shadow-[0_4px_16px_rgba(20,32,28,0.05)] [--card-spacing:0px]"
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
                  Offene Rechnungen (Zu bezahlen)
                </div>
                <p className="mt-1 text-sm opacity-80">
                  Paperless «Zu bezahlen» und nicht «Bezahlt» ·{" "}
                  {recentDueInvoices.length} offen
                  {recentDueInvoices.length !== sortedDueInvoices.length
                    ? ` von ${sortedDueInvoices.length}`
                    : ""}{" "}
                  · {formatCHF(recentDueTotal)}
                  {olderDueInvoices.length > 0
                    ? ` · ${olderDueInvoices.length} ältere versteckt`
                    : ""}
                </p>
              </div>
            </button>
            <div className="flex flex-wrap items-center gap-2">
              {selectableDueIds.length > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-amber-400/80 bg-white/70"
                  onClick={() => selectDocs(selectableDueIds)}
                >
                  Alle auswählen
                </Button>
              ) : null}
              {dueEvents.length > 0 ? (
                <AddToCalendarButton
                  events={dueEvents}
                  filename="familybrain-zahlungsfristen"
                  label="Alle in Kalender"
                />
              ) : null}
            </div>
          </div>
          {selectedDocIds.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-amber-200/80 bg-amber-50/90 px-4 py-2.5">
              <span className="text-sm font-medium text-amber-950">
                {selectedDocIds.size} ausgewählt
              </span>
              <Button
                type="button"
                size="sm"
                disabled={markPending}
                onClick={() => void markSelectedPaid()}
                className="bg-[var(--brand-finance)] text-white hover:bg-[var(--brand-finance)]/90"
              >
                {markPending ? "Markiere…" : "Als beglichen markieren"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={markPending}
                onClick={clearSelection}
              >
                Auswahl aufheben
              </Button>
              <span className="text-xs text-muted-foreground">
                Schreibt «Bezahlt» nach Paperless
              </span>
            </div>
          ) : null}
          {markMessage ? (
            <p className="whitespace-pre-line border-b border-border/60 px-4 py-2 text-xs text-muted-foreground">
              {markMessage}
            </p>
          ) : null}
          {dueOpen ? (
            <CardContent className="space-y-0 p-0">
              {recentDueInvoices.length === 0 ? (
                <div className="px-6 py-4 text-sm text-muted-foreground">
                  Keine offenen Rechnungen (Paperless «Zu bezahlen» / nicht
                  «Bezahlt»).
                </div>
              ) : (
                <div className="space-y-4 p-4">
                  {dueBuckets.map((bucket) => (
                    <DueBucketSection
                      key={bucket.id}
                      title={bucket.title}
                      rows={bucket.rows}
                      total={sumAmount(bucket.rows)}
                      today={today}
                      accent={bucket.accent}
                      defaultOpen={bucket.defaultOpen}
                      selectedDocIds={selectedDocIds}
                      onToggleDoc={toggleDocSelected}
                    />
                  ))}
                </div>
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
          tone="green"
        />
        <MetricTile
          title="Top-Lieferant"
          value={topVendor?.label || "–"}
          subtitle={topVendor ? formatCHF(topVendor.total) : undefined}
          icon={Building2}
          tone="green"
        />
        <MetricTile
          title="Wiederkehrend"
          value={recurring.length}
          icon={Repeat}
          tone="green"
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
                "min-w-0 overflow-hidden rounded-xl border text-left shadow-[0_4px_16px_rgba(20,32,28,0.05)] transition-all",
                surface.body,
                active
                  ? "border-[var(--brand-finance)] ring-2 ring-[var(--brand-finance)]/20"
                  : "border-border/60 hover:border-[var(--brand-finance)]/40"
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
                        active && "rotate-90 text-[var(--brand-finance)]"
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
        <>
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
                Tippen öffnet die Details im Seitenpanel — Suche findet Einträge
                sofort.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDimension(null);
                setSelected(null);
                setBreakdownSearch("");
              }}
            >
              Schliessen
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {dimensionMeta[dimension].empty}
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={breakdownSearch}
                      onChange={(e) => setBreakdownSearch(e.target.value)}
                      placeholder={
                        dimension === "vendor"
                          ? "Lieferant suchen…"
                          : dimension === "year"
                            ? "Jahr suchen…"
                            : "Kategorie suchen…"
                      }
                      className="rounded-xl pl-9"
                      aria-label="Suchen"
                    />
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={
                        breakdownSort === "amount" ? "default" : "outline"
                      }
                      className={
                        breakdownSort === "amount"
                          ? "bg-[var(--brand-finance)] text-white hover:bg-[var(--brand-finance)]/90"
                          : undefined
                      }
                      onClick={() => setBreakdownSort("amount")}
                    >
                      Betrag
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={breakdownSort === "name" ? "default" : "outline"}
                      className={
                        breakdownSort === "name"
                          ? "bg-[var(--brand-finance)] text-white hover:bg-[var(--brand-finance)]/90"
                          : undefined
                      }
                      onClick={() => setBreakdownSort("name")}
                    >
                      A–Z
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  {filteredBreakdownItems.length} von {activeItems.length} ·{" "}
                  {dimensionMeta[dimension].hint}
                </p>

                {filteredBreakdownItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Keine Treffer für «{breakdownSearch.trim()}».
                  </p>
                ) : (
                  <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
                    {filteredBreakdownItems.map((item) => {
                      const share = percent(item.total, activeTotal);
                      const isSelected = selected === item.label;
                      return (
                        <li key={item.label}>
                          <button
                            type="button"
                            onClick={() => setSelected(item.label)}
                            className={cn(
                              "flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--brand-finance-soft)]/50",
                              isSelected && "bg-[var(--brand-finance-soft)]/70"
                            )}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-foreground">
                                {item.label}
                              </span>
                              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                {item.count} Positionen · {share}%
                              </span>
                            </span>
                            <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                              {formatCHF(item.total)}
                            </span>
                            <ChevronRight className="size-4 shrink-0 text-[var(--brand-finance)]" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Sheet
          open={Boolean(selected)}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
        >
          <SheetContent
            side="right"
            className="w-full max-w-[min(100%,36rem)] gap-0 overflow-hidden p-0 data-[side=right]:w-full data-[side=right]:max-w-[min(100%,36rem)]"
          >
            <SheetHeader className="shrink-0 border-b border-border/60 pr-12 text-left">
              <SheetTitle className="wrap-break-word">
                {selectedRow?.label || "Details"}
              </SheetTitle>
              <SheetDescription className="wrap-break-word">
                {selectedRow
                  ? `${selectedRow.count} Positionen · ${formatCHF(selectedRow.total)} · ${
                      detailGroupBy === "year" ? "nach Jahr" : "nach Lieferant"
                    }`
                  : "Belege zur Auswahl"}
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
              {!selectedRow || detailGroups.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  Keine Positionen für diese Auswahl.
                </p>
              ) : (
                <div className="w-full min-w-0 space-y-3 p-4">
                  {detailGroups.map((group) => (
                    <div
                      key={group.key}
                      className={cn(
                        "w-full min-w-0 overflow-hidden rounded-xl border border-border/60",
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
                        <span className="wrap-break-word">{group.label}</span>
                      </TileTitleBar>
                      <DataList className="w-full min-w-0">
                        {group.rows.map((row) => (
                          <InvoiceListRow
                            key={row.id}
                            row={row}
                            showDueDate
                            showCalendar
                            today={today}
                            titleField={
                              detailGroupBy === "vendor" ? "document" : "vendor"
                            }
                          />
                        ))}
                      </DataList>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
        </>
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

function DueInvoiceCard({
  row,
  today,
  selected,
  onToggle,
}: {
  row: InvoiceRow;
  today: string;
  selected: boolean;
  onToggle: (documentLocalId: number) => void;
}) {
  const urgency = dueUrgency(row.due_date, today);
  const vendor = row.vendor?.trim() || "Unbekannt";
  const subtitle =
    row.description || row.document_title || row.category || null;

  return (
    <article
      className={cn(
        "relative flex min-w-0 flex-col gap-1.5 rounded-xl border border-border/70 bg-card p-3.5 shadow-[0_4px_16px_rgba(20,32,28,0.05)]",
        !isCountedInStats(row) && "opacity-60",
        selected && "border-[var(--brand-finance)] ring-2 ring-[var(--brand-finance)]/25"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            className="mt-1 size-4 shrink-0 accent-[var(--brand-finance)]"
            checked={selected}
            onChange={() => onToggle(row.document_local_id)}
            aria-label={`${vendor} auswählen`}
          />
          <Link
            href={`/documents/${row.document_local_id}`}
            className="min-w-0 flex-1"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="truncate text-sm font-semibold hover:underline">
              {vendor}
            </p>
            <p className="mt-0.5 text-base font-bold tabular-nums tracking-tight">
              {formatCHF(row.amount, row.currency || "CHF")}
            </p>
          </Link>
        </label>
        <DocumentInfoButton documentId={row.document_local_id} size="icon-sm" />
      </div>
      <p
        className={cn(
          "text-xs font-semibold",
          dueUrgencyTextClass(urgency)
        )}
      >
        {formatDueRelative(row.due_date, today)}
      </p>
      {subtitle ? (
        <p className="line-clamp-2 text-xs text-muted-foreground">{subtitle}</p>
      ) : null}
      <div className="mt-auto flex items-end justify-between gap-2 pt-1">
        <DocumentAiIcon
          aiIconUrl={row.ai_icon_url}
          category={row.category}
          size="md"
        />
        {row.financial_item_id != null ? (
          <FinanceStatsToggle
            key={`${row.financial_item_id}-${isCountedInStats(row) ? 1 : 0}`}
            itemId={row.financial_item_id}
            countsInStats={isCountedInStats(row)}
          />
        ) : (
          <span className="text-[10px] text-muted-foreground">
            Kein Extrakt
          </span>
        )}
      </div>
    </article>
  );
}

function DueBucketSection({
  title,
  rows,
  total,
  today,
  accent,
  defaultOpen,
  selectedDocIds,
  onToggleDoc,
}: {
  title: string;
  rows: InvoiceRow[];
  total: number;
  today: string;
  accent: "red" | "orange" | "amber" | "muted";
  defaultOpen: boolean;
  selectedDocIds: Set<number>;
  onToggleDoc: (documentLocalId: number) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (rows.length === 0) return null;

  const accentClass =
    accent === "red"
      ? "text-red-800"
      : accent === "orange"
        ? "text-orange-800"
        : accent === "amber"
          ? "text-amber-900"
          : "text-foreground";

  return (
    <section className="min-w-0 rounded-xl border border-border/60 bg-background/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            !open && "-rotate-90"
          )}
        />
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-bold", accentClass)}>{title}</p>
          <p className="text-xs text-muted-foreground">
            {rows.length}{" "}
            {rows.length === 1 ? "Rechnung" : "Rechnungen"} · {formatCHF(total)}
          </p>
        </div>
      </button>
      {open ? (
        <div className="grid grid-cols-1 gap-2.5 border-t border-border/50 p-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <DueInvoiceCard
              key={`doc-${row.document_local_id}`}
              row={row}
              today={today}
              selected={selectedDocIds.has(row.document_local_id)}
              onToggle={onToggleDoc}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
