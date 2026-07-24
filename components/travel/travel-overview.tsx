"use client";

import { Suspense, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  Plane,
  Building2,
  MapPin,
  ChevronRight,
  Ticket,
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
  SoftText,
} from "@/components/layout/data-list";
import { PageHeader, TileTitleBar, MetricTile } from "@/components/layout/page-primitives";
import { IconCircle, pageVisuals, toneSurface, type IconTone } from "@/components/layout/icon-circle";
import { AddToCalendarButton } from "@/components/calendar/add-to-calendar-button";
import { AddToTripButton } from "@/components/trips/add-to-trip-button";
import { LinkBelegToEventButton } from "@/components/trips/link-beleg-to-event-button";
import { travelItemToEventDrafts } from "@/lib/trips/from-travel-item";
import {
  DocumentInfoButton,
  DocumentTitleLink,
} from "@/components/documents/document-link";
import { ItineraryList } from "@/components/travel/itinerary-list";
import { resolveItinerary } from "@/lib/extraction/itinerary";
import { normalizeTravelType, TRAVEL_TYPES } from "@/lib/extraction/normalize-categories";
import { TravelTypeReclassify } from "@/components/travel/travel-type-reclassify";
import { formatCHF } from "@/lib/utils/format";
import { toSwissDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import {
  OverviewTabNav,
  parseOverviewTab,
  type OverviewTab,
  type OverviewTabItem,
} from "@/components/layout/overview-tab-nav";

import type { CalendarEvent } from "@/lib/utils/ics";

export type TravelRow = {
  id: number;
  travel_type: string | null;
  travel_type_override?: string | null;
  provider: string | null;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  origin: string | null;
  destination: string | null;
  booking_reference: string | null;
  price: number | null;
  currency: string | null;
  extracted_data?: string | null;
  document_content?: string | null;
  document_title: string | null;
  document_local_id: number;
  correspondent_name?: string | null;
};

type AggRow = { label: string; count: number; total: number };

type Dimension = "year" | "type" | "provider";

function typeLabel(row: {
  travel_type?: string | null;
  travel_type_override?: string | null;
  title?: string | null;
  provider?: string | null;
  origin?: string | null;
  destination?: string | null;
}) {
  const override = row.travel_type_override?.trim();
  if (override && (TRAVEL_TYPES as readonly string[]).includes(override)) {
    return override;
  }
  return normalizeTravelType(row.travel_type, {
    title: row.title,
    provider: row.provider,
    origin: row.origin,
    destination: row.destination,
  });
}

function learnHintFor(row: {
  provider?: string | null;
  title?: string | null;
}): string | null {
  const provider = row.provider?.trim();
  if (provider && provider.length >= 2 && !/^unbekannt$/i.test(provider)) {
    return `Künftig: Anbieter enthält «${provider}»`;
  }
  const title = row.title?.trim();
  if (title && title.length >= 4) {
    const words = title.split(/\s+/).filter((w) => w.length > 2).slice(0, 3);
    const phrase = words.join(" ") || title.slice(0, 40);
    return `Künftig: Titel enthält «${phrase}»`;
  }
  return null;
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

function travelToCalendarEvent(row: TravelRow): CalendarEvent | null {
  if (!row.start_date) return null;
  const route = [row.origin, row.destination].filter(Boolean).join(" → ");
  const parts = [
    row.correspondent_name
      ? `Korrespondent: ${row.correspondent_name}`
      : null,
    row.provider ? `Anbieter: ${row.provider}` : null,
    row.booking_reference ? `Buchung: ${row.booking_reference}` : null,
    route ? `Route: ${route}` : null,
    row.price != null
      ? `Preis: ${formatCHF(row.price, row.currency || "CHF")}`
      : null,
    row.document_title ? `Dokument: ${row.document_title}` : null,
  ].filter(Boolean);

  return {
    uid: `travel-${row.id}@familybrain.local`,
    title: row.title || typeLabel(row),
    description: parts.join("\n"),
    location: route || row.destination || row.origin || undefined,
    startDate: row.start_date,
    endDate: row.end_date || row.start_date,
    url:
      typeof window !== "undefined"
        ? `${window.location.origin}/documents/${row.document_local_id}`
        : undefined,
  };
}

function aggregate(
  rows: TravelRow[],
  keyFn: (row: TravelRow) => string,
  amountFn: (row: TravelRow) => number
): AggRow[] {
  const map = new Map<string, AggRow>();
  for (const row of rows) {
    const label = keyFn(row);
    const prev = map.get(label) || { label, count: 0, total: 0 };
    prev.count += 1;
    prev.total += amountFn(row);
    map.set(label, prev);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.total - a.total;
  });
}

function TravelListRow({
  row,
  selected,
  onSelect,
}: {
  row: TravelRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const event = travelToCalendarEvent(row);
  const route =
    [row.origin, row.destination].filter(Boolean).join(" → ") || null;
  const party =
    row.correspondent_name &&
    row.provider &&
    row.correspondent_name !== row.provider
      ? `${row.correspondent_name} · ${row.provider}`
      : row.correspondent_name || row.provider || null;
  const softParts = [party, route].filter(Boolean).join(" · ");

  return (
    <DataListRow
      className={cn(selected && "bg-accent/30")}
      onClick={onSelect}
    >
      <DataListMain
        title={row.title || typeLabel(row)}
        subtitle={
          softParts ? (
            <SoftText className="mt-0 text-sm">{softParts}</SoftText>
          ) : undefined
        }
        meta={
          <MetaLine>
            <Badge variant="secondary">{typeLabel(row)}</Badge>
            <span className="tabular-nums">
              {toSwissDate(row.start_date)}
              {row.end_date ? ` – ${toSwissDate(row.end_date)}` : ""}
            </span>
            <span
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <DocumentTitleLink
                documentId={row.document_local_id}
                title={row.document_title}
              />
            </span>
          </MetaLine>
        }
        actions={
          <div
            className="contents"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <DocumentInfoButton documentId={row.document_local_id} />
            <AddToTripButton
              drafts={travelItemToEventDrafts({
                id: row.id,
                travel_type: row.travel_type,
                travel_type_override: row.travel_type_override,
                provider: row.provider,
                title: row.title,
                start_date: row.start_date,
                end_date: row.end_date,
                origin: row.origin,
                destination: row.destination,
                booking_reference: row.booking_reference,
                extracted_data: row.extracted_data,
                document_local_id: row.document_local_id,
              })}
            />
            <LinkBelegToEventButton documentId={row.document_local_id} />
            {event ? (
              <AddToCalendarButton
                events={[event]}
                filename={`familybrain-reise-${row.id}`}
                size="sm"
              />
            ) : (
              <span className="text-xs text-muted-foreground">Kein Datum</span>
            )}
          </div>
        }
      />
    </DataListRow>
  );
}

type Props = {
  items: TravelRow[];
};

export function TravelOverviewClient(props: Parameters<typeof TravelOverviewClientInner>[0]) {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-muted-foreground">Lädt…</p>
      }
    >
      <TravelOverviewClientInner {...props} />
    </Suspense>
  );
}

function TravelOverviewClientInner({ items }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [dimension, setDimension] = useState<Dimension | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  const byYear = useMemo(
    () =>
      aggregate(
        items,
        (r) => (r.start_date || "").slice(0, 4) || "Ohne Datum",
        (r) => r.price || 0
      ),
    [items]
  );

  const byType = useMemo(
    () =>
      aggregate(
        items,
        (r) => typeLabel(r),
        (r) => r.price || 0
      ),
    [items]
  );

  const byProvider = useMemo(
    () =>
      aggregate(
        items,
        (r) => r.provider?.trim() || "Unbekannt",
        (r) => r.price || 0
      ),
    [items]
  );

  const totals = useMemo(() => {
    const total = items.reduce((sum, r) => sum + (r.price || 0), 0);
    const withDates = items.filter((r) => r.start_date).length;
    return { count: items.length, total, withDates };
  }, [items]);

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return items
      .filter((r) => r.start_date && r.start_date >= today)
      .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""))
      .slice(0, 8);
  }, [items]);

  const dimensionMeta = {
    year: {
      title: "Nach Jahr",
      icon: CalendarDays,
      tone: "blue" as IconTone,
      items: byYear,
      empty: "Keine Jahresdaten",
      hint: "Reisen mit Startdatum",
    },
    type: {
      title: "Nach Typ",
      icon: Plane,
      tone: "teal" as IconTone,
      items: byType,
      empty: "Keine Typen",
      hint: "Flug, Hotel, Kreuzfahrt …",
    },
    provider: {
      title: "Nach Anbieter",
      icon: Building2,
      tone: "amber" as IconTone,
      items: byProvider,
      empty: "Keine Anbieter",
      hint: "Airlines, Hotels, Buchungsportale",
    },
  } as const;

  const activeItems = dimension ? dimensionMeta[dimension].items : [];

  const selectedRow = useMemo(() => {
    if (!dimension || !selected) return null;
    return activeItems.find((i) => i.label === selected) || null;
  }, [activeItems, dimension, selected]);

  const detailRows = useMemo(() => {
    if (!dimension || !selected) return [];
    return items.filter((row) => {
      if (dimension === "year") {
        return ((row.start_date || "").slice(0, 4) || "Ohne Datum") === selected;
      }
      if (dimension === "type") {
        return typeLabel(row) === selected;
      }
      return (row.provider?.trim() || "Unbekannt") === selected;
    });
  }, [dimension, selected, items]);

  const openDetail = useMemo(
    () => items.find((r) => r.id === detailId) || null,
    [items, detailId]
  );

  const upcomingEvents = upcoming
    .map(travelToCalendarEvent)
    .filter((e): e is CalendarEvent => Boolean(e));

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
    setDetailId(null);
  }

  return (
    <div className="min-w-0 space-y-4 pb-28 md:space-y-6 md:pb-0">
      <PageHeader
        title="Reise-Gedächtnis"
        description="KPIs zuerst – Details per Drilldown, Termine in den Kalender"
        icon={pageVisuals.travel.icon}
        tone={pageVisuals.travel.tone}
        actions={
          upcomingEvents.length > 0 ? (
            <AddToCalendarButton
              events={upcomingEvents}
              filename="familybrain-reisen-kommend"
              label="Kommende exportieren"
            />
          ) : null
        }
      />

      <OverviewTabNav
        items={tabItems}
        active={activeTab}
        onChange={setTab}
        accent="teal"
      />

      {activeTab === "overview" ? (
        <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          title="Reiseeinträge"
          value={totals.count}
          icon={Ticket}
          tone="teal"
        />
        <MetricTile
          title="Mit Termin"
          value={totals.withDates}
          icon={CalendarDays}
          tone="sky"
        />
        <MetricTile
          title="Kommend"
          value={upcoming.length}
          icon={Plane}
          tone="blue"
        />
        <MetricTile
          title="Erkannte Kosten"
          value={formatCHF(totals.total)}
          icon={MapPin}
          tone="amber"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {(Object.keys(dimensionMeta) as Dimension[]).map((key) => {
          const meta = dimensionMeta[key];
          const Icon = meta.icon;
          const active = dimension === key;
          const top = meta.items[0];
          const surface = toneSurface(meta.tone);

          return (
            <button
              key={key}
              type="button"
              onClick={() => openDimension(key)}
              className={cn(
                "min-w-0 overflow-hidden rounded-2xl border text-left shadow-[0_4px_16px_rgba(20,32,28,0.05)] transition-all",
                surface.body,
                active
                  ? "border-[var(--brand-docs)] ring-2 ring-[var(--brand-docs)]/20"
                  : "border-border/60 hover:border-[var(--brand-docs)]/40"
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
                        active && "rotate-90 text-[var(--brand-docs)]"
                      )}
                    />
                  </div>
                }
              >
                {meta.title}
              </TileTitleBar>
              <div className="p-5">
                <p className="text-2xl font-semibold tabular-nums">
                  {meta.items.length}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{meta.hint}</p>
                {top ? (
                  <div className="mt-4 rounded-lg bg-muted px-3 py-2">
                    <p className="text-xs text-muted-foreground">Top</p>
                    <div className="mt-0.5 flex min-w-0 items-center justify-between gap-2">
                      <span className="break-words text-sm font-medium">
                        {top.label}
                      </span>
                      <span className="shrink-0 text-sm tabular-nums">
                        {top.count}×
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
                setDetailId(null);
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
                  const share = percent(item.count, totals.count || 1);
                  const isSelected = selected === item.label;
                  const dimTone = dimensionMeta[dimension].tone;
                  const itemSurface = toneSurface(dimTone);
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        setSelected(isSelected ? null : item.label);
                        setDetailId(null);
                      }}
                      className={cn(
                        "min-w-0 overflow-hidden rounded-2xl border text-left shadow-[0_4px_16px_rgba(20,32,28,0.05)] transition-colors",
                        itemSurface.body,
                        isSelected
                          ? "border-[var(--brand-docs)] ring-2 ring-[var(--brand-docs)]/20"
                          : "border-border/60 hover:border-[var(--brand-docs)]/40"
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
                          {share}% der Einträge
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
                  "overflow-hidden rounded-2xl border border-border/60",
                  toneSurface(dimensionMeta[dimension].tone).body
                )}
              >
                <TileTitleBar
                  tone={dimensionMeta[dimension].tone}
                  interactiveTrailing
                  trailing={
                    <AddToCalendarButton
                      events={detailRows
                        .map(travelToCalendarEvent)
                        .filter((e): e is CalendarEvent => Boolean(e))}
                      filename={`familybrain-reise-${selectedRow.label}`}
                      label="Auswahl in Kalender"
                    />
                  }
                >
                  <div className="min-w-0">
                    <div className="break-words">{selectedRow.label}</div>
                    <p className="mt-0.5 text-xs font-normal opacity-80">
                      {selectedRow.count} Einträge ·{" "}
                      {formatCHF(selectedRow.total)}
                    </p>
                  </div>
                </TileTitleBar>

                <div className="border-t-0">
                  <DataList>
                    {detailRows.map((row) => (
                      <TravelListRow
                        key={row.id}
                        row={row}
                        selected={detailId === row.id}
                        onSelect={() =>
                          setDetailId(detailId === row.id ? null : row.id)
                        }
                      />
                    ))}
                  </DataList>
                </div>

                {openDetail && detailRows.some((r) => r.id === openDetail.id) ? (
                  <div className="grid gap-3 border-t border-border p-4 sm:grid-cols-2">
                    <DetailField label="Titel" value={openDetail.title} />
                    <DetailField
                      label="Typ"
                      value={
                        <TravelTypeReclassify
                          itemId={openDetail.id}
                          currentType={typeLabel(openDetail)}
                          learnHint={learnHintFor(openDetail)}
                        />
                      }
                    />
                    <DetailField
                      label="Korrespondent"
                      value={openDetail.correspondent_name}
                    />
                    <DetailField label="Anbieter" value={openDetail.provider} />
                    <DetailField
                      label="Buchungsnr."
                      value={openDetail.booking_reference}
                    />
                    <DetailField
                      label="Start"
                      value={toSwissDate(openDetail.start_date)}
                    />
                    <DetailField
                      label="Ende"
                      value={toSwissDate(openDetail.end_date)}
                    />
                    <DetailField label="Von" value={openDetail.origin} />
                    <DetailField label="Nach" value={openDetail.destination} />
                    <DetailField
                      label="Preis"
                      value={formatCHF(
                        openDetail.price,
                        openDetail.currency || "CHF"
                      )}
                    />
                    <DetailField
                      label="Dokument"
                      value={
                        <div className="flex flex-wrap items-center gap-2">
                          <DocumentTitleLink
                            documentId={openDetail.document_local_id}
                            title={openDetail.document_title}
                          />
                          <DocumentInfoButton
                            documentId={openDetail.document_local_id}
                          />
                        </div>
                      }
                    />
                    {(() => {
                      const stops = resolveItinerary({
                        travelItems: [openDetail],
                        ocrContent: openDetail.document_content,
                      });
                      if (stops.length === 0) return null;
                      return (
                        <div className="sm:col-span-2 space-y-2">
                          <div className="text-xs font-medium text-muted-foreground">
                            Reiseverlauf / Ports of Call
                          </div>
                          <ItineraryList
                            stops={stops}
                            compact
                            showAllExport
                            calendarFilename={`familybrain-reiseverlauf-${openDetail.id}`}
                          />
                        </div>
                      );
                    })()}
                    <div className="sm:col-span-2">
                      {travelToCalendarEvent(openDetail) ? (
                        <AddToCalendarButton
                          events={[travelToCalendarEvent(openDetail)!]}
                          filename={`familybrain-reise-${openDetail.id}`}
                          label="Diesen Termin in den Kalender"
                        />
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : (
          <Card className="border-border/80 shadow-sm">
            <CardContent className="py-6 text-sm text-muted-foreground">
              Wähle in der Übersicht eine Dimension, um die Aufschlüsselung zu
              sehen.
            </CardContent>
          </Card>
        )
      ) : null}

      {activeTab === "list" ? (
      <Card tone="teal" className="min-w-0 overflow-hidden shadow-sm">
        <CardHeader
          tone="teal"
          className="flex flex-row flex-wrap items-center justify-between gap-3"
        >
          <div className="flex min-w-0 items-start gap-3">
            <IconCircle icon={Plane} tone="teal" size="sm" />
            <div>
              <CardTitle className="text-base">Kommende Reisen</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Klick auf eine Zeile für Details · Kalender-Export pro Eintrag
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="px-6 pb-6 text-sm text-muted-foreground">
              Noch keine Reiseunterlagen erkannt.
            </div>
          ) : upcoming.length === 0 ? (
            <div className="px-6 pb-6 text-sm text-muted-foreground">
              Keine kommenden Reisen mit Startdatum. Nutze den Drilldown für
              alle Einträge.
            </div>
          ) : (
            <DataList>
              {upcoming.map((row) => (
                <TravelListRow
                  key={row.id}
                  row={row}
                  selected={detailId === row.id && !dimension}
                  onSelect={() =>
                    setDetailId(detailId === row.id ? null : row.id)
                  }
                />
              ))}
            </DataList>
          )}

          {openDetail && !dimension ? (
            <div className="border-t border-border bg-muted/20 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailField label="Titel" value={openDetail.title} />
                <DetailField
                  label="Typ"
                  value={
                    <TravelTypeReclassify
                      itemId={openDetail.id}
                      currentType={typeLabel(openDetail)}
                      learnHint={learnHintFor(openDetail)}
                    />
                  }
                />
                <DetailField
                  label="Korrespondent"
                  value={openDetail.correspondent_name}
                />
                <DetailField label="Anbieter" value={openDetail.provider} />
                <DetailField
                  label="Buchungsnr."
                  value={openDetail.booking_reference}
                />
                <DetailField
                  label="Start"
                  value={toSwissDate(openDetail.start_date)}
                />
                <DetailField
                  label="Ende"
                  value={toSwissDate(openDetail.end_date)}
                />
                <DetailField label="Von" value={openDetail.origin} />
                <DetailField label="Nach" value={openDetail.destination} />
                <DetailField
                  label="Preis"
                  value={formatCHF(
                    openDetail.price,
                    openDetail.currency || "CHF"
                  )}
                />
                <DetailField
                  label="Dokument"
                  value={
                    <div className="flex flex-wrap items-center gap-2">
                      <DocumentTitleLink
                        documentId={openDetail.document_local_id}
                        title={openDetail.document_title}
                      />
                      <DocumentInfoButton
                        documentId={openDetail.document_local_id}
                      />
                    </div>
                  }
                />
                {(() => {
                  const stops = resolveItinerary({
                    travelItems: [openDetail],
                    ocrContent: openDetail.document_content,
                  });
                  if (stops.length === 0) return null;
                  return (
                    <div className="sm:col-span-2 space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">
                        Reiseverlauf / Ports of Call
                      </div>
                      <ItineraryList
                        stops={stops}
                        compact
                        showAllExport
                        calendarFilename={`familybrain-reiseverlauf-${openDetail.id}`}
                      />
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
      ) : null}
    </div>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 break-words text-sm font-medium">{value || "–"}</div>
    </div>
  );
}
