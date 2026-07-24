"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toSwissDate } from "@/lib/utils/dates";
import { formatCHF } from "@/lib/utils/format";
import {
  ChevronLeft,
  CheckCircle2,
  ExternalLink,
  FileText,
  Info,
  ListChecks,
  CalendarDays,
  Users,
  Shield,
  Banknote,
  ScrollText,
  FileSearch,
  Plane,
  LayoutDashboard,
  Layers,
  MoreHorizontal,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DocumentPdfPreview } from "@/components/documents/document-pdf-preview";
import {
  DocumentTabNav,
  parseDocumentDetailTab,
  type DocumentDetailTab,
  type DocumentTabItem,
} from "@/components/documents/document-tab-nav";
import {
  IconCircle,
  knowledgeVisual,
} from "@/components/layout/icon-circle";
import { ItineraryCard } from "@/components/travel/itinerary-list";
import { resolveItinerary } from "@/lib/extraction/itinerary";

type DetailProps = {
  detail: {
    document: {
      id: number;
      title: string | null;
      content: string | null;
      created_date: string | null;
      modified_at: string | null;
      correspondent_name: string | null;
      document_type_name: string | null;
      original_file_name: string | null;
      paperless_url: string | null;
      paperless_id: number;
    };
    tags: { tag_id: number | null; tag_name: string | null }[];
    summary: Record<string, unknown> | undefined;
    warranties: unknown[];
    deadlines: unknown[];
    financialItems: unknown[];
    travelItems: unknown[];
  };
};

function parseJsonArray(value: unknown): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

export function DocumentDetailClient({ detail }: DetailProps) {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-muted-foreground">Lade Dokument…</p>
      }
    >
      <DocumentDetailInner detail={detail} />
    </Suspense>
  );
}

function DocumentDetailInner({ detail }: DetailProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [analyzing, setAnalyzing] = useState(false);
  const [showOcr, setShowOcr] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { document, tags, summary } = detail;

  const activeTab = parseDocumentDetailTab(searchParams.get("tab"));
  const tabItems: DocumentTabItem[] = [
    { id: "overview", label: "Übersicht", icon: LayoutDashboard },
    { id: "extracts", label: "Extrakte", icon: Layers },
    { id: "files", label: "Belege", icon: FileText },
    { id: "more", label: "Mehr", icon: MoreHorizontal },
  ];

  function setTab(tab: DocumentDetailTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "overview") params.delete("tab");
    else params.set("tab", tab);
    const q = params.toString();
    router.replace(q ? `?${q}` : "?", { scroll: false });
  }

  const importantPoints = parseJsonArray(summary?.important_points) as string[];
  const importantDates = parseJsonArray(summary?.important_dates) as {
    date?: string;
    label?: string;
    description?: string;
  }[];
  const amounts = parseJsonArray(summary?.amounts) as {
    amount?: number;
    currency?: string;
    label?: string;
  }[];
  const parties = parseJsonArray(summary?.contract_parties) as {
    name?: string;
    role?: string;
  }[];
  const todos = parseJsonArray(summary?.possible_todos) as {
    title?: string;
    due_date?: string;
    priority?: string;
  }[];
  const warrantyInfo = parseJsonObject(summary?.warranty_info);
  const cancellation = parseJsonObject(summary?.cancellation_terms);

  const itinerary = resolveItinerary({
    travelItems: detail.travelItems,
    ocrContent: document.content,
  });

  const travelRows = detail.travelItems as Array<{
    travel_type?: string | null;
    provider?: string | null;
    title?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    origin?: string | null;
    destination?: string | null;
    booking_reference?: string | null;
    price?: number | null;
    currency?: string | null;
  }>;

  const dateKeys = new Set(
    importantDates.map(
      (d) => `${d.date || ""}|${(d.label || "").toLowerCase()}`
    )
  );
  const mergedDates = [...importantDates];
  for (const stop of itinerary) {
    if (!stop.date) continue;
    const label = `Anlaufhafen: ${stop.location}`;
    const key = `${stop.date}|${label.toLowerCase()}`;
    if (dateKeys.has(key)) continue;
    dateKeys.add(key);
    mergedDates.push({
      date: stop.date,
      label,
      description:
        [
          stop.arrive && `Ankunft ${stop.arrive}`,
          stop.depart && `Abfahrt ${stop.depart}`,
        ]
          .filter(Boolean)
          .join(" · ") ||
        stop.note ||
        undefined,
    });
  }
  mergedDates.sort((a, b) =>
    String(a.date || "").localeCompare(String(b.date || ""))
  );

  const categoryName =
    typeof summary?.category === "string" ? summary.category : null;
  const categoryVisual = knowledgeVisual(categoryName || "Sonstiges");

  async function analyze() {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: document.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok)
        throw new Error(data.error || "Analyse fehlgeschlagen");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="space-y-4 pb-28 md:space-y-6 md:pb-0">
      {/* Mobile soft header */}
      <div className="flex items-center gap-2 md:hidden">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          aria-label="Zurück"
        >
          <ChevronLeft className="size-5" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <IconCircle
            icon={categoryVisual.icon}
            tone="teal"
            size="sm"
            className="rounded-xl"
          />
          <h1 className="truncate text-base font-semibold tracking-tight">
            {document.title || `Dokument #${document.id}`}
          </h1>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-10 shrink-0"
                aria-label="Mehr"
              />
            }
          >
            <MoreHorizontal className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {document.paperless_url ? (
              <DropdownMenuItem
                onClick={() =>
                  window.open(document.paperless_url!, "_blank", "noreferrer")
                }
              >
                In Paperless öffnen
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              onClick={() => void analyze()}
              disabled={analyzing}
            >
              {analyzing ? "Analysiert…" : "Neu analysieren"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Desktop header */}
      <div className="hidden flex-wrap items-start justify-between gap-4 md:flex">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => router.back()}
            className="mb-2 text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            ← Zurück
          </button>
          <div className="flex items-start gap-3">
            <IconCircle
              icon={categoryVisual.icon}
              tone={categoryVisual.tone}
              size="lg"
            />
            <div className="min-w-0">
              <h1 className="break-words text-2xl font-semibold tracking-tight">
                {document.title || `Dokument #${document.id}`}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Paperless-ID {document.paperless_id} ·{" "}
                {document.correspondent_name || "–"} ·{" "}
                {toSwissDate(document.created_date)}
              </p>
            </div>
          </div>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto">
          {document.paperless_url ? (
            <a
              href={document.paperless_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
            >
              <ExternalLink className="h-4 w-4" />
              In Paperless öffnen
            </a>
          ) : null}
          <Button onClick={() => void analyze()} disabled={analyzing}>
            {analyzing ? "Analysiert…" : "Neu analysieren"}
          </Button>
        </div>
      </div>

      {error ? (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      ) : null}

      <div className="hidden flex-wrap gap-2 md:flex">
        {tags.map((tag, idx) => (
          <Badge key={`${tag.tag_id}-${idx}`} variant="secondary">
            {tag.tag_name}
          </Badge>
        ))}
        {summary?.category ? <Badge>{String(summary.category)}</Badge> : null}
        <Badge variant="outline">
          {String(summary?.analysis_status || "pending")}
        </Badge>
      </div>

      <DocumentTabNav items={tabItems} active={activeTab} onChange={setTab} />

      {activeTab === "overview" ? (
        <div className="space-y-4">
          {/* Soft UI hero card (mobile-first, also on desktop) */}
          <Card className="overflow-hidden border-border/50 shadow-[0_8px_28px_rgba(20,32,28,0.07)]">
            <CardContent className="space-y-5 p-5">
              <div className="flex gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-docs-soft)] text-[var(--brand-docs)]">
                  <Sparkles className="size-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-semibold text-[var(--brand-docs)]">
                    KI-Zusammenfassung
                  </h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">
                    {String(
                      summary?.detailed_summary ||
                        summary?.short_summary ||
                        "Noch nicht analysiert."
                    )}
                  </p>
                </div>
              </div>

              {importantPoints.length > 0 ? (
                <>
                  <div className="border-t border-border/60" />
                  <div className="flex gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-docs-soft)] text-[var(--brand-docs)]">
                      <CheckCircle2 className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-semibold text-[var(--brand-docs)]">
                        {importantPoints.length} zentrale Punkte
                      </h2>
                      <ul className="mt-2 space-y-2.5">
                        {importantPoints.slice(0, 5).map((p, i) => {
                          const colon = p.indexOf(":");
                          const hasLabel = colon > 0 && colon < 40;
                          const label = hasLabel ? p.slice(0, colon) : null;
                          const body = hasLabel ? p.slice(colon + 1).trim() : p;
                          return (
                            <li key={i} className="text-sm leading-snug">
                              {label ? (
                                <>
                                  <span className="font-semibold text-[var(--brand-docs)]">
                                    {label}
                                  </span>
                                  <span className="text-foreground/80">
                                    {" "}
                                    {body}
                                  </span>
                                </>
                              ) : (
                                <span className="text-foreground/85">{body}</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          <div className="hidden gap-4 sm:grid sm:grid-cols-2 md:grid">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-base">
                  <IconCircle icon={Info} tone="slate" size="sm" />
                  Metadaten
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>Typ: {document.document_type_name || "–"}</div>
                <div>Dateiname: {document.original_file_name || "–"}</div>
                <div>Geändert: {toSwissDate(document.modified_at)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-base">
                  <IconCircle icon={FileSearch} tone="indigo" size="sm" />
                  Kurzfassung
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {String(summary?.short_summary || "Noch nicht analysiert.")}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {activeTab === "extracts" ? (
        <div className="space-y-4">
          {travelRows.length > 0 || itinerary.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {travelRows.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3 text-base">
                      <IconCircle icon={Plane} tone="teal" size="sm" />
                      Reise
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {travelRows.map((t, i) => (
                      <div key={i} className="space-y-1">
                        <div className="font-medium">
                          {t.title || t.travel_type || "Reise"}
                        </div>
                        <div className="text-muted-foreground">
                          {[
                            t.provider,
                            t.booking_reference && `Ref. ${t.booking_reference}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                        <div>
                          {toSwissDate(t.start_date)} – {toSwissDate(t.end_date)}
                        </div>
                        <div>
                          {t.origin || "–"} → {t.destination || "–"}
                        </div>
                        {t.price != null ? (
                          <div>{formatCHF(t.price, t.currency || "CHF")}</div>
                        ) : null}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : null}
              <ItineraryCard
                stops={itinerary}
                calendarFilename={`familybrain-reiseverlauf-${document.id}`}
              />
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-base">
                  <IconCircle icon={Banknote} tone="green" size="sm" />
                  Beträge
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {amounts.length === 0
                  ? "Keine Beträge erkannt."
                  : amounts.map((a, i) => (
                      <div key={i}>
                        {formatCHF(a.amount ?? null, a.currency || "CHF")}
                        {a.label ? ` – ${a.label}` : ""}
                      </div>
                    ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-base">
                  <IconCircle icon={CalendarDays} tone="amber" size="sm" />
                  Wichtige Daten
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {mergedDates.length === 0
                  ? "Keine Daten erkannt."
                  : mergedDates.map((d, i) => (
                      <div key={i}>
                        {toSwissDate(d.date)} – {d.label || "Datum"}
                        {d.description ? `: ${d.description}` : ""}
                      </div>
                    ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-base">
                  <IconCircle icon={CalendarDays} tone="rose" size="sm" />
                  Fristen
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {detail.deadlines.length === 0
                  ? "Keine Fristen."
                  : detail.deadlines.map((raw) => {
                      const d = raw as {
                        id: number;
                        deadline_date?: string | null;
                        title?: string | null;
                      };
                      return (
                        <div key={String(d.id)}>
                          {toSwissDate(String(d.deadline_date || ""))} –{" "}
                          {String(d.title || "")}
                        </div>
                      );
                    })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-base">
                  <IconCircle icon={Users} tone="slate" size="sm" />
                  Vertragsparteien
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {parties.length === 0
                  ? "Keine Parteien erkannt."
                  : parties.map((p, i) => (
                      <div key={i}>
                        {p.name || "–"}
                        {p.role ? ` (${p.role})` : ""}
                      </div>
                    ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-base">
                  <IconCircle icon={Shield} tone="orange" size="sm" />
                  Garantieinfos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {warrantyInfo?.has_warranty ? (
                  <>
                    <div>
                      Produkt: {String(warrantyInfo.product_name || "–")}
                    </div>
                    <div>Händler: {String(warrantyInfo.vendor || "–")}</div>
                    <div>
                      Kaufdatum:{" "}
                      {toSwissDate(String(warrantyInfo.purchase_date || ""))}
                    </div>
                    <div>
                      Garantie bis:{" "}
                      {toSwissDate(String(warrantyInfo.warranty_until || ""))}
                    </div>
                    <div>
                      Seriennr.: {String(warrantyInfo.serial_number || "–")}
                    </div>
                  </>
                ) : (
                  "Keine Garantie erkannt."
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-base">
                  <IconCircle icon={ListChecks} tone="violet" size="sm" />
                  Kündigung / To-dos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {cancellation?.has_cancellation_terms ? (
                  <div>
                    Frist: {String(cancellation.notice_period || "–")} · bis{" "}
                    {toSwissDate(
                      String(cancellation.latest_cancellation_date || "")
                    )}
                  </div>
                ) : (
                  <div>Keine Kündigungsbedingungen erkannt.</div>
                )}
                <div className="space-y-1">
                  {todos.length === 0
                    ? "Keine To-dos."
                    : todos.map((t, i) => (
                        <div key={i}>
                          {t.title}
                          {t.due_date
                            ? ` (bis ${toSwissDate(t.due_date)})`
                            : ""}
                        </div>
                      ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {activeTab === "files" ? (
        <div className="space-y-4">
          <DocumentPdfPreview
            paperlessId={document.paperless_id}
            title={document.title}
          />
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-3 text-base">
                <IconCircle icon={FileText} tone="slate" size="sm" />
                OCR-Text
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowOcr((v) => !v)}
              >
                {showOcr ? "Einklappen" : "Ausklappen"}
              </Button>
            </CardHeader>
            {showOcr ? (
              <CardContent>
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-xs">
                  {document.content || "Kein OCR-Text vorhanden."}
                </pre>
              </CardContent>
            ) : null}
          </Card>
        </div>
      ) : null}

      {activeTab === "more" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-base">
                <IconCircle icon={RefreshCw} tone="slate" size="sm" />
                Aktionen
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button onClick={() => void analyze()} disabled={analyzing}>
                {analyzing ? "Analysiert…" : "Neu analysieren"}
              </Button>
              {document.paperless_url ? (
                <a
                  href={document.paperless_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
                >
                  <ExternalLink className="h-4 w-4" />
                  Paperless
                </a>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sync-Meta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <div>Paperless-ID: {document.paperless_id}</div>
              <div>Analyse: {String(summary?.analysis_status || "pending")}</div>
              <div>Geändert: {toSwissDate(document.modified_at)}</div>
              <div>Dateiname: {document.original_file_name || "–"}</div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
