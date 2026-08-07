"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toSwissDate } from "@/lib/utils/dates";
import { formatCHF } from "@/lib/utils/format";
import {
  normalizeLineItem,
  resolveInvoiceTotal,
} from "@/lib/extraction/line-items";
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
  Pencil,
  History,
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
import { ActivityLogPanel } from "@/components/activity/activity-log-panel";
import {
  IconCircle,
  knowledgeVisual,
} from "@/components/layout/icon-circle";
import { AiImageZoom } from "@/components/layout/ai-image-zoom";
import { ItineraryCard } from "@/components/travel/itinerary-list";
import { resolveItinerary } from "@/lib/extraction/itinerary";
import {
  displayImportantDateLabel,
  importantDateKey,
  itineraryStopLabel,
} from "@/lib/extraction/itinerary-labels";
import {
  ExtractDeadlinesEditor,
  ExtractFinanceEditor,
  ExtractWarrantyEditor,
} from "@/components/documents/extract-editors";
import {
  TRIAGE_STATUS_LABELS,
  type TriageStatus,
} from "@/lib/documents/triage-shared";
import { UserAvatar } from "@/components/users/user-avatar";
import { UNKNOWN_RECIPIENT_LABEL } from "@/lib/family/constants";

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
      ai_icon_path?: string | null;
      ai_icon_url?: string | null;
      zu_bezahlen?: number | null;
      bezahlt?: number | null;
      triage_status?: string | null;
      triage_at?: string | null;
      recipient_member_ids?: string | null;
      recipient_status?: string | null;
    };
    recipients?: {
      status: "matched" | "unknown" | null;
      label: string | null;
      memberIds?: number[];
      members: Array<{
        id: number;
        display_name: string;
        avatar_url: string | null;
      }>;
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
  const [, startTransition] = useTransition();
  const { document, tags, summary, recipients: initialRecipients } = detail;
  const [recipients, setRecipients] = useState(initialRecipients);
  const [familyOptions, setFamilyOptions] = useState<
    Array<{
      id: number;
      display_name: string;
      avatar_url: string | null;
    }>
  >([]);
  const [recipientEdit, setRecipientEdit] = useState(false);
  const [recipientDraft, setRecipientDraft] = useState<number[]>(
    initialRecipients?.memberIds || []
  );
  const [recipientBusy, setRecipientBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [showOcr, setShowOcr] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buddyReviewed, setBuddyReviewed] = useState(false);
  const [taxRelevant, setTaxRelevant] = useState(false);
  const [invoicePaid, setInvoicePaid] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [aiIconUrl, setAiIconUrl] = useState<string | null>(
    document.ai_icon_url ?? null
  );
  const [iconBusy, setIconBusy] = useState(false);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState(document.title || "");
  const [editingTitle, setEditingTitle] = useState(false);
  const [metaBusy, setMetaBusy] = useState(false);
  const [displayTitle, setDisplayTitle] = useState(document.title || "");
  const [displayCategory, setDisplayCategory] = useState<string | null>(
    typeof summary?.category === "string" ? summary.category : null
  );
  const [sourceLinks, setSourceLinks] = useState<
    Array<{
      sourceKind: string;
      url: string | null;
      label: string | null;
      role: string;
    }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/buddy/source-links?entityType=document&entityId=${document.id}`
        );
        const data = await res.json();
        if (!cancelled && res.ok && Array.isArray(data.links)) {
          setSourceLinks(data.links);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [document.id]);

  const driveLink = sourceLinks.find((l) => l.sourceKind === "drive_file");
  const [knowledgeAreas, setKnowledgeAreas] = useState<string[]>([]);

  const activeTab = parseDocumentDetailTab(searchParams.get("tab"));
  const tabItems: DocumentTabItem[] = [
    { id: "overview", label: "Übersicht", icon: LayoutDashboard },
    { id: "extracts", label: "Extrakte", icon: Layers },
    { id: "files", label: "OCR", icon: FileText },
    { id: "activity", label: "Log", icon: History },
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
  const rawLineItems = parseJsonArray(summary?.line_items) as {
    description?: string;
    amount?: number | null;
    currency?: string | null;
    quantity?: number | null;
    unit?: string | null;
  }[];
  const lineItems = rawLineItems.map(normalizeLineItem);
  const importantDates = (
    parseJsonArray(summary?.important_dates) as {
      date?: string;
      label?: string;
      description?: string;
    }[]
  ).map((d) => ({
    ...d,
    label: displayImportantDateLabel(d.label) || d.label,
  }));
  const amounts = parseJsonArray(summary?.amounts) as {
    amount?: number;
    currency?: string;
    label?: string;
  }[];
  const invoiceTotal = resolveInvoiceTotal({
    amounts,
    financialItems: detail.financialItems as Array<{
      amount?: number | null;
      currency?: string | null;
    }>,
  });
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
    importantDates.map((d) => importantDateKey(d.date, d.label))
  );
  const mergedDates = [...importantDates];
  for (const stop of itinerary) {
    if (!stop.date) continue;
    const label = itineraryStopLabel(stop.location);
    const key = importantDateKey(stop.date, label);
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

  const categoryName = displayCategory;
  const categoryVisual = knowledgeVisual(categoryName || "Sonstiges");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/knowledge/areas");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return;
        const names = Array.isArray(data.areas)
          ? data.areas
              .map((a: { name?: string }) => a.name)
              .filter((n: unknown): n is string => typeof n === "string")
          : [];
        setKnowledgeAreas(names);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  async function saveTitle() {
    const next = titleDraft.trim();
    if (!next || next === displayTitle || metaBusy) {
      setEditingTitle(false);
      setTitleDraft(displayTitle);
      return;
    }
    setMetaBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Titel speichern fehlgeschlagen");
      setDisplayTitle(typeof data.title === "string" ? data.title : next);
      setEditingTitle(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMetaBusy(false);
    }
  }

  async function saveCategory(next: string) {
    if (!next || next === displayCategory || metaBusy) return;
    setMetaBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Rubrik speichern fehlgeschlagen");
      setDisplayCategory(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMetaBusy(false);
    }
  }

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

  useEffect(() => {
    let cancelled = false;
    // Seed from local sync columns while Paperless metadata loads
    setInvoicePaid(Number(document.bezahlt) === 1);
    setInvoiceOpen(Number(document.zu_bezahlen) === 1);
    void (async () => {
      try {
        const res = await fetch(
          `/api/paperless/document-status?documentLocalId=${document.id}`
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        setBuddyReviewed(data.buddyReviewed === true);
        setTaxRelevant(data.taxRelevant === true);
        if (typeof data.bezahlt === "boolean") {
          setInvoicePaid(data.bezahlt);
        }
        if (typeof data.zuBezahlen === "boolean") {
          setInvoiceOpen(data.zuBezahlen);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setStatusLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [document.id, document.bezahlt, document.zu_bezahlen]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/family");
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const members = (data.members || []) as Array<{
          id: number;
          display_name: string;
          avatar_url: string | null;
          active: number;
        }>;
        setFamilyOptions(
          members
            .filter((m) => m.active === 1)
            .map((m) => ({
              id: m.id,
              display_name: m.display_name,
              avatar_url: m.avatar_url,
            }))
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveRecipients() {
    setRecipientBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${document.id}/recipients`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberIds: recipientDraft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Empfänger speichern fehlgeschlagen");
      }
      setRecipients(data.recipients);
      setRecipientEdit(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRecipientBusy(false);
    }
  }

  async function patchStatus(next: {
    buddyReviewed?: boolean;
    taxRelevant?: boolean;
    bezahlt?: boolean;
    zuBezahlen?: boolean;
  }) {
    setStatusBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/paperless/document-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentLocalId: document.id,
          ...next,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Status speichern fehlgeschlagen");
      }
      if (next.buddyReviewed !== undefined) {
        setBuddyReviewed(next.buddyReviewed);
      }
      if (next.taxRelevant !== undefined) {
        setTaxRelevant(next.taxRelevant);
        startTransition(() => router.refresh());
      }
      if (next.bezahlt !== undefined) {
        setInvoicePaid(next.bezahlt);
      }
      if (next.zuBezahlen !== undefined) {
        setInvoiceOpen(next.zuBezahlen);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStatusBusy(false);
    }
  }

  async function patchInvoiceFlags(next: {
    bezahlt?: boolean;
    zuBezahlen?: boolean;
  }) {
    // Mutual exclusivity when checking one side (like Finance «als bezahlt»)
    if (next.bezahlt === true) {
      await patchStatus({ bezahlt: true, zuBezahlen: false });
      return;
    }
    if (next.zuBezahlen === true) {
      await patchStatus({ zuBezahlen: true, bezahlt: false });
      return;
    }
    await patchStatus(next);
  }

  async function generateIcon() {
    setIconBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${document.id}/ai-icon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Icon-Generierung fehlgeschlagen");
      }
      const url =
        typeof data.aiIconUrl === "string" ? data.aiIconUrl : null;
      // Bust cache so the new image shows immediately
      setAiIconUrl(url ? `${url}?t=${Date.now()}` : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIconBusy(false);
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
          {editingTitle ? (
            <input
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm font-semibold"
              value={titleDraft}
              disabled={metaBusy}
              autoFocus
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => void saveTitle()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveTitle();
                if (e.key === "Escape") {
                  setEditingTitle(false);
                  setTitleDraft(displayTitle);
                }
              }}
            />
          ) : (
            <h1 className="truncate text-base font-semibold tracking-tight">
              {displayTitle || `Dokument #${document.id}`}
            </h1>
          )}
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
              onClick={() => {
                setTitleDraft(displayTitle);
                setEditingTitle(true);
              }}
            >
              Titel ändern
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void analyze()}
              disabled={analyzing}
            >
              {analyzing ? "Analysiert…" : "Neu analysieren"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void generateIcon()}
              disabled={iconBusy}
            >
              {iconBusy
                ? "Generierung…"
                : aiIconUrl
                  ? "AI-Icon neu erzeugen"
                  : "AI-Icon erzeugen"}
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
          <div className="min-w-0">
            {editingTitle ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-lg font-semibold"
                  value={titleDraft}
                  disabled={metaBusy}
                  autoFocus
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveTitle();
                    if (e.key === "Escape") {
                      setEditingTitle(false);
                      setTitleDraft(displayTitle);
                    }
                  }}
                />
                <Button
                  size="sm"
                  disabled={metaBusy}
                  onClick={() => void saveTitle()}
                >
                  {metaBusy ? "…" : "Speichern"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={metaBusy}
                  onClick={() => {
                    setEditingTitle(false);
                    setTitleDraft(displayTitle);
                  }}
                >
                  Abbrechen
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-start gap-2">
                <h1 className="break-words text-2xl font-semibold tracking-tight">
                  {displayTitle || `Dokument #${document.id}`}
                </h1>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-1 shrink-0"
                  title="Titel ändern"
                  onClick={() => {
                    setTitleDraft(displayTitle);
                    setEditingTitle(true);
                  }}
                >
                  <Pencil className="size-3.5" />
                </Button>
              </div>
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              Paperless-ID {document.paperless_id} ·{" "}
              {document.correspondent_name || "–"} ·{" "}
              {toSwissDate(document.created_date)}
            </p>
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
          {driveLink?.url ? (
            <a
              href={driveLink.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
            >
              <ExternalLink className="h-4 w-4" />
              In Drive öffnen
            </a>
          ) : null}
          <Button
            variant="outline"
            disabled={iconBusy}
            onClick={() => void generateIcon()}
          >
            <Sparkles className="h-4 w-4" />
            {iconBusy
              ? "Generierung…"
              : aiIconUrl
                ? "AI-Icon neu"
                : "AI-Icon"}
          </Button>
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

      <div className="flex flex-wrap items-center gap-2 md:hidden">
        <select
          className="h-8 max-w-[14rem] rounded-lg border border-border bg-background px-2 text-sm disabled:opacity-50"
          disabled={metaBusy || knowledgeAreas.length === 0}
          value={categoryName || ""}
          onChange={(e) => {
            const next = e.target.value;
            if (next) void saveCategory(next);
          }}
          aria-label="Rubrik"
        >
          <option value="" disabled>
            Rubrik wählen…
          </option>
          {knowledgeAreas.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="hidden flex-wrap items-center gap-2 md:flex">
        {sourceLinks.map((link) => (
          <Badge
            key={`${link.sourceKind}-${link.role}`}
            variant="outline"
            className="text-[11px]"
          >
            {link.label || link.sourceKind}
            {link.role === "mirror" ? " · Spiegel" : ""}
            {link.role === "primary" ? " · Primär" : ""}
          </Badge>
        ))}
        {tags.map((tag, idx) => (
          <Badge key={`${tag.tag_id}-${idx}`} variant="secondary">
            {tag.tag_name}
          </Badge>
        ))}
        {categoryName ? <Badge>{categoryName}</Badge> : null}
        <select
          className="h-8 max-w-[14rem] rounded-lg border border-border bg-background px-2 text-sm disabled:opacity-50"
          disabled={metaBusy || knowledgeAreas.length === 0}
          value={categoryName || ""}
          onChange={(e) => {
            const next = e.target.value;
            if (next) void saveCategory(next);
          }}
          aria-label="Rubrik"
        >
          <option value="" disabled>
            Rubrik wählen…
          </option>
          {knowledgeAreas.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <Badge variant="outline">
          {String(summary?.analysis_status || "pending")}
        </Badge>
      </div>

      <DocumentTabNav items={tabItems} active={activeTab} onChange={setTab} />

      {activeTab === "overview" ? (
        <div className="space-y-4">
          <Card className="border-border/50 bg-[var(--brand-docs-soft)]/40">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-3 text-base">
                <IconCircle icon={FileSearch} tone="teal" size="sm" />
                Übersicht
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm leading-relaxed text-foreground/90">
                {String(
                  summary?.short_summary ||
                    "Noch nicht analysiert — starte die Analyse, damit Buddy Kategorie, Fristen und Beträge erkennt."
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {String(summary?.analysis_status || "pending") !==
                "completed" ? (
                  <Button
                    size="sm"
                    className="bg-[var(--brand-docs)] text-white hover:bg-[var(--brand-docs)]/90"
                    onClick={() => setTab("more")}
                  >
                    Analyse starten (Mehr)
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTab("extracts")}
                >
                  Extrakte ansehen
                </Button>
                <Link
                  href="/dashboard"
                  className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-accent"
                >
                  Zur Action-Inbox
                </Link>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-[minmax(7.5rem,10rem)_1fr] items-stretch gap-3 sm:grid-cols-[minmax(9rem,12rem)_1fr] sm:gap-4">
            <div className="relative h-full min-h-[7.5rem] overflow-hidden rounded-xl border border-border/50 bg-muted/30 shadow-sm">
              {aiIconUrl ? (
                <button
                  type="button"
                  title="Tippen zum Vergrössern"
                  className="absolute inset-0 block h-full w-full cursor-zoom-in"
                  onClick={() => {
                    if (!iconBusy) setZoomUrl(aiIconUrl);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={aiIconUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <IconCircle
                    icon={categoryVisual.icon}
                    tone={categoryVisual.tone}
                    size="lg"
                  />
                </div>
              )}
              {iconBusy ? (
                <span className="absolute inset-0 z-10 flex items-center justify-center bg-black/65 px-2 text-center text-xs font-semibold text-white">
                  Generierung…
                </span>
              ) : null}
            </div>
            <div className="grid h-full min-h-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <Card className="h-full border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-3 text-base">
                    <IconCircle icon={Shield} tone="teal" size="sm" />
                    Buddy-Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-lg border border-border/60 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">Empfänger</p>
                      {!recipientEdit ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setRecipientDraft(recipients?.memberIds || []);
                            setRecipientEdit(true);
                          }}
                        >
                          Ändern
                        </Button>
                      ) : null}
                    </div>
                    {recipientEdit ? (
                      <div className="mt-2 space-y-2">
                        {familyOptions.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Keine Familienmitglieder — unter Einstellungen →
                            Familie anlegen.
                          </p>
                        ) : (
                          familyOptions.map((m) => {
                            const checked = recipientDraft.includes(m.id);
                            return (
                              <label
                                key={m.id}
                                className="flex cursor-pointer items-center gap-2 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  className="size-4 accent-[var(--brand-docs)]"
                                  checked={checked}
                                  disabled={recipientBusy}
                                  onChange={() => {
                                    setRecipientDraft((prev) =>
                                      checked
                                        ? prev.filter((id) => id !== m.id)
                                        : [...prev, m.id]
                                    );
                                  }}
                                />
                                <UserAvatar
                                  name={m.display_name}
                                  src={m.avatar_url}
                                  size="sm"
                                />
                                <span>{m.display_name}</span>
                              </label>
                            );
                          })
                        )}
                        <p className="text-[11px] text-muted-foreground">
                          Keine Auswahl = Empfänger unbekannt.
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button
                            type="button"
                            size="sm"
                            disabled={recipientBusy}
                            onClick={() => void saveRecipients()}
                          >
                            {recipientBusy ? "…" : "Speichern"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={recipientBusy}
                            onClick={() => {
                              setRecipientDraft(recipients?.memberIds || []);
                              setRecipientEdit(false);
                            }}
                          >
                            Abbrechen
                          </Button>
                        </div>
                      </div>
                    ) : recipients?.status === "matched" &&
                      recipients.members.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {recipients.members.map((m) => (
                          <span
                            key={m.id}
                            className="inline-flex items-center gap-1.5"
                          >
                            <UserAvatar
                              name={m.display_name}
                              src={m.avatar_url}
                              size="sm"
                            />
                            <span className="text-sm font-medium">
                              {m.display_name}
                            </span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <Badge
                        variant="outline"
                        className="mt-1.5 font-medium text-muted-foreground"
                      >
                        {recipients?.label || UNKNOWN_RECIPIENT_LABEL}
                      </Badge>
                    )}
                  </div>
                  {(() => {
                    const raw = document.triage_status;
                    const known =
                      raw && raw in TRIAGE_STATUS_LABELS
                        ? (raw as TriageStatus)
                        : null;
                    const label = known
                      ? TRIAGE_STATUS_LABELS[known]
                      : "Noch nicht geprüft";
                    const status = known;
                    const tone =
                      status === "pending"
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100"
                        : status === "pay"
                          ? "border-[var(--brand-finance)]/40 bg-[var(--brand-finance)]/10 text-[var(--brand-finance)]"
                          : status === "ignored"
                            ? "border-border bg-muted text-muted-foreground"
                            : status === "skipped"
                              ? "border-border bg-muted/40 text-muted-foreground"
                              : status === "ebill" ||
                                  status === "twint" ||
                                  status === "card"
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100"
                                : status
                                  ? "border-border bg-muted/60 text-foreground"
                                  : "border-dashed border-border bg-transparent text-muted-foreground";
                    return (
                      <div className="rounded-lg border border-border/60 px-3 py-2">
                        <p className="text-xs text-muted-foreground">
                          Beleg-Triage
                        </p>
                        <Badge
                          variant="outline"
                          className={`mt-1.5 font-medium ${tone}`}
                        >
                          {label}
                        </Badge>
                      </div>
                    );
                  })()}
                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-[var(--brand-docs)]"
                      checked={buddyReviewed}
                      disabled={!statusLoaded || statusBusy}
                      onChange={(e) =>
                        void patchStatus({ buddyReviewed: e.target.checked })
                      }
                    />
                    <span>
                      <span className="font-medium">Geprüft</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Schreibt «Buddy geprüft» nach Paperless.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-[var(--brand-docs)]"
                      checked={taxRelevant}
                      disabled={!statusLoaded || statusBusy}
                      onChange={(e) =>
                        void patchStatus({ taxRelevant: e.target.checked })
                      }
                    />
                    <span>
                      <span className="font-medium">Steuer relevant</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Steuert Wissensrubrik Steuern und den Paperless-Filter.
                      </span>
                    </span>
                  </label>
                </CardContent>
              </Card>

              <Card className="h-full border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-3 text-base">
                    <IconCircle icon={Banknote} tone="green" size="sm" />
                    Rechnungsfelder
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-[var(--brand-docs)]"
                      checked={invoicePaid}
                      disabled={!statusLoaded || statusBusy}
                      onChange={(e) =>
                        void patchInvoiceFlags({ bezahlt: e.target.checked })
                      }
                    />
                    <span>
                      <span className="font-medium">Rechnung Bezahlt</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Paperless «Bezahlt» — schreibt zurück.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-[var(--brand-docs)]"
                      checked={invoiceOpen}
                      disabled={!statusLoaded || statusBusy}
                      onChange={(e) =>
                        void patchInvoiceFlags({
                          zuBezahlen: e.target.checked,
                        })
                      }
                    />
                    <span>
                      <span className="font-medium">Rechnung Offen</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Paperless «Zu bezahlen» — schreibt zurück.
                      </span>
                    </span>
                  </label>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Summary + PDF preview side by side (equal height on md+) */}
          <div className="grid items-stretch gap-4 md:grid-cols-2">
            <Card className="h-full overflow-hidden border-border/50 shadow-[0_8px_28px_rgba(20,32,28,0.07)]">
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
                            const body = hasLabel
                              ? p.slice(colon + 1).trim()
                              : p;
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
                                  <span className="text-foreground/85">
                                    {body}
                                  </span>
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

            <DocumentPdfPreview
              paperlessId={document.paperless_id}
              title={document.title}
              fillHeight
              className="border-border/50 shadow-[0_8px_28px_rgba(20,32,28,0.07)]"
            />
          </div>

          <div className="hidden gap-4 sm:grid sm:grid-cols-2 md:grid">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-base">
                  <IconCircle icon={Info} tone="teal" size="sm" />
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
                  <IconCircle icon={FileSearch} tone="teal" size="sm" />
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
              <CardContent className="space-y-3 text-sm">
                {amounts.length === 0
                  ? null
                  : amounts.map((a, i) => (
                      <div key={i}>
                        {formatCHF(a.amount ?? null, a.currency || "CHF")}
                        {a.label ? ` – ${a.label}` : ""}
                      </div>
                    ))}
                <ExtractFinanceEditor
                  rows={detail.financialItems as Array<{
                    id: number;
                    vendor?: string | null;
                    amount?: number | null;
                    currency?: string | null;
                    due_date?: string | null;
                    invoice_date?: string | null;
                    manual_override?: number | null;
                  }>}
                  onSaved={() => router.refresh()}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-base">
                  <IconCircle icon={CalendarDays} tone="teal" size="sm" />
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-base">
                <IconCircle icon={ListChecks} tone="teal" size="sm" />
                Positionen
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {lineItems.length === 0 ? (
                <p className="text-muted-foreground">
                  Keine Einzelpositionen erkannt (Rechnung / Lieferschein /
                  Leistungsauflistung). Neu analysieren, um Positionen aus dem
                  Beleg zu extrahieren.
                </p>
              ) : (
                <>
                  <ul className="divide-y divide-border/60">
                    {lineItems.map((item, i) => (
                      <li
                        key={i}
                        className="grid grid-cols-[minmax(0,1fr)_3.25rem_minmax(6.5rem,auto)] items-baseline gap-x-3 py-2 first:pt-0 last:pb-0"
                      >
                        <span className="min-w-0 text-foreground/90">
                          {item.description}
                        </span>
                        <span className="text-right tabular-nums text-muted-foreground">
                          {item.quantity != null
                            ? Number.isInteger(item.quantity)
                              ? item.quantity
                              : String(item.quantity)
                            : ""}
                        </span>
                        <span className="text-right tabular-nums font-medium">
                          {item.amount != null
                            ? formatCHF(item.amount, item.currency || "CHF")
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {invoiceTotal ? (
                    <div className="grid grid-cols-[minmax(0,1fr)_3.25rem_minmax(6.5rem,auto)] items-baseline gap-x-3 border-t border-border/60 pt-3 text-sm font-bold">
                      <span>Gesamtbetrag</span>
                      <span />
                      <span className="text-right tabular-nums">
                        {formatCHF(
                          invoiceTotal.amount,
                          invoiceTotal.currency
                        )}
                      </span>
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-base">
                  <IconCircle icon={CalendarDays} tone="teal" size="sm" />
                  Fristen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ExtractDeadlinesEditor
                  rows={detail.deadlines as Array<{
                    id: number;
                    title?: string | null;
                    deadline_date?: string | null;
                    manual_override?: number | null;
                  }>}
                  onSaved={() => router.refresh()}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-base">
                  <IconCircle icon={Users} tone="teal" size="sm" />
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
                  <IconCircle icon={Shield} tone="teal" size="sm" />
                  Garantieinfos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ExtractWarrantyEditor
                  rows={detail.warranties as Array<{
                    id: number;
                    product_name?: string | null;
                    vendor?: string | null;
                    manufacturer?: string | null;
                    warranty_until?: string | null;
                    manual_override?: number | null;
                  }>}
                  onSaved={() => router.refresh()}
                  summaryFallback={
                    warrantyInfo?.has_warranty ? (
                      <div className="space-y-1 text-sm">
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
                      </div>
                    ) : undefined
                  }
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-base">
                  <IconCircle icon={ListChecks} tone="teal" size="sm" />
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
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-3 text-base">
                <IconCircle icon={FileText} tone="teal" size="sm" />
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

      {activeTab === "activity" ? (
        <ActivityLogPanel entityType="document" entityId={document.id} />
      ) : null}

      {activeTab === "more" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-base">
                <IconCircle icon={RefreshCw} tone="teal" size="sm" />
                Aktionen
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button onClick={() => void analyze()} disabled={analyzing}>
                {analyzing ? "Analysiert…" : "Neu analysieren"}
              </Button>
              <Button
                variant="outline"
                disabled={iconBusy}
                onClick={() => void generateIcon()}
              >
                {iconBusy
                  ? "Generierung…"
                  : aiIconUrl
                    ? "AI-Icon neu erzeugen"
                    : "AI-Icon erzeugen"}
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

      {zoomUrl ? (
        <AiImageZoom src={zoomUrl} onClose={() => setZoomUrl(null)} />
      ) : null}
    </div>
  );
}
