"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronRight, Filter, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "@/components/layout/data-list";
import { useAnalysis } from "@/components/analysis/analysis-provider";
import { FilterGrid, PageHeader } from "@/components/layout/page-primitives";
import {
  IconCircle,
  knowledgeVisual,
  pageVisuals,
} from "@/components/layout/icon-circle";
import { FilterChip, SoftFab } from "@/components/layout/soft-ui";
import { toSwissDate } from "@/lib/utils/dates";
import {
  DocumentInfoButton,
  DocumentTitleLink,
} from "@/components/documents/document-link";
import Link from "next/link";
import { cn } from "@/lib/utils";

type DocRow = {
  id: number;
  title: string | null;
  created_date: string | null;
  correspondent_name: string | null;
  document_type_name: string | null;
  category?: string | null;
  analysis_status?: string | null;
  sync_status: string | null;
};

type Filters = {
  correspondents: string[];
  documentTypes: string[];
  categories: string[];
};

function statusBadge(status?: string | null) {
  const value = status || "pending";
  const variant =
    value === "completed"
      ? "default"
      : value === "error"
        ? "destructive"
        : "secondary";
  const label =
    value === "completed"
      ? "Analysiert"
      : value === "stale"
        ? "Veraltet"
        : value === "error"
          ? "Fehler"
          : "Ausstehend";
  return <Badge variant={variant}>{label}</Badge>;
}

function toItemsRecord(
  entries: Array<{ value: string; label: string }>
): Record<string, string> {
  return Object.fromEntries(entries.map((e) => [e.value, e.label]));
}

export function DocumentsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { pendingCount, isRunning, refreshStats } = useAnalysis();

  const [docs, setDocs] = useState<DocRow[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<Filters>({
    correspondents: [],
    documentTypes: [],
    categories: [],
  });
  const [searchInput, setSearchInput] = useState(
    searchParams.get("search") || ""
  );
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [category, setCategory] = useState(
    searchParams.get("category") || "all"
  );
  const [correspondent, setCorrespondent] = useState(
    searchParams.get("correspondent") || "all"
  );
  const [documentType, setDocumentType] = useState(
    searchParams.get("documentType") || "all"
  );
  const [analysisStatus, setAnalysisStatus] = useState(
    searchParams.get("analysisStatus") || "all"
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [searchFocus, setSearchFocus] = useState(false);
  const requestIdRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keep filters in sync when navigating from Wissensbereiche (/documents?category=…)
  useEffect(() => {
    setCategory(searchParams.get("category") || "all");
    setCorrespondent(searchParams.get("correspondent") || "all");
    setDocumentType(searchParams.get("documentType") || "all");
    setAnalysisStatus(searchParams.get("analysisStatus") || "all");
    const q = searchParams.get("search") || "";
    setSearchInput(q);
    setSearch(q);
  }, [searchParams]);

  function updateUrl(next: {
    search?: string;
    category?: string;
    correspondent?: string;
    documentType?: string;
    analysisStatus?: string;
  }) {
    const params = new URLSearchParams();
    const s = next.search ?? search;
    const c = next.category ?? category;
    const corr = next.correspondent ?? correspondent;
    const dt = next.documentType ?? documentType;
    const st = next.analysisStatus ?? analysisStatus;
    if (s.trim()) params.set("search", s.trim());
    if (c !== "all") params.set("category", c);
    if (corr !== "all") params.set("correspondent", corr);
    if (dt !== "all") params.set("documentType", dt);
    if (st !== "all") params.set("analysisStatus", st);
    const qs = params.toString();
    router.replace(qs ? `/documents?${qs}` : "/documents", { scroll: false });
  }

  const hasActiveFilters =
    Boolean(search.trim()) ||
    category !== "all" ||
    correspondent !== "all" ||
    documentType !== "all" ||
    analysisStatus !== "all";

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    const q = search.trim();
    if (q) params.set("search", q);
    if (category !== "all") params.set("category", category);
    if (correspondent !== "all") params.set("correspondent", correspondent);
    if (documentType !== "all") params.set("documentType", documentType);
    if (analysisStatus !== "all") params.set("analysisStatus", analysisStatus);
    params.set("limit", "250");

    try {
      const res = await fetch(`/api/documents?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Laden fehlgeschlagen");
      if (requestId !== requestIdRef.current) return;
      setDocs(data.documents || []);
      setTotal(Number(data.total) || 0);
      setFilters({
        correspondents: data.filters?.correspondents || [],
        documentTypes: data.filters?.documentTypes || [],
        categories: data.filters?.categories || [],
      });
      await refreshStats();
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [
    search,
    category,
    correspondent,
    documentType,
    analysisStatus,
    refreshStats,
  ]);

  // Debounce free-text search input → committed search term + URL
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = searchInput.trim();
      setSearch(next);
      const current = searchParams.get("search") || "";
      if (next !== current) {
        updateUrl({ search: next });
      }
    }, 350);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => {
      void load();
    }, 8000);
    return () => window.clearInterval(id);
  }, [isRunning, load]);

  async function analyzeOne(id: number) {
    setAnalyzingId(id);
    setError(null);
    try {
      const res = await fetch("/api/analyze/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Analyse fehlgeschlagen");
      }
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzingId(null);
    }
  }

  function resetFilters() {
    setSearchInput("");
    setSearch("");
    setCategory("all");
    setCorrespondent("all");
    setDocumentType("all");
    setAnalysisStatus("all");
    router.replace("/documents", { scroll: false });
  }

  const categoryItems = useMemo(
    () =>
      toItemsRecord([
        { value: "all", label: "Alle Kategorien" },
        ...filters.categories.map((c) => ({ value: c, label: c })),
        ...(category !== "all" && !filters.categories.includes(category)
          ? [{ value: category, label: category }]
          : []),
      ]),
    [filters.categories, category]
  );

  const correspondentItems = useMemo(
    () =>
      toItemsRecord([
        { value: "all", label: "Alle Korrespondenten" },
        ...filters.correspondents.map((c) => ({ value: c, label: c })),
      ]),
    [filters.correspondents]
  );

  const documentTypeItems = useMemo(
    () =>
      toItemsRecord([
        { value: "all", label: "Alle Typen" },
        ...filters.documentTypes.map((t) => ({ value: t, label: t })),
      ]),
    [filters.documentTypes]
  );

  const statusItems = useMemo(
    () =>
      toItemsRecord([
        { value: "all", label: "Alle Status" },
        { value: "pending", label: "Ausstehend" },
        { value: "completed", label: "Analysiert" },
        { value: "stale", label: "Veraltet" },
        { value: "error", label: "Fehler" },
      ]),
    []
  );

  return (
    <div className="min-w-0 space-y-4 pb-6 md:space-y-6">
      <PageHeader
        title="Dokumente"
        description={
          hasActiveFilters
            ? `${total} Treffer${category !== "all" ? ` · ${category}` : ""} · ${pendingCount} Analysen ausstehend`
            : `${total} Dokumente im lokalen Cache · ${pendingCount} ausstehend`
        }
        icon={pageVisuals.documents.icon}
        tone={pageVisuals.documents.tone}
      />

      {/* Mobile: search + filter trigger + category chips */}
      <div className="space-y-3 md:hidden">
        {(searchFocus || searchInput) && (
          <div className="flex gap-2">
            <Input
              ref={searchInputRef}
              className="min-w-0 flex-1 rounded-xl border-border/70 bg-card"
              placeholder="Suche…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onBlur={() => {
                if (!searchInput.trim()) setSearchFocus(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const next = searchInput.trim();
                  setSearch(next);
                  updateUrl({ search: next });
                }
              }}
            />
            <Button
              type="button"
              variant={hasActiveFilters ? "default" : "outline"}
              size="icon"
              className="rounded-xl"
              aria-label="Filter"
              onClick={() => setFilterOpen(true)}
            >
              <Filter className="size-4" />
            </Button>
          </div>
        )}
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          <FilterChip
            accent="teal"
            active={category === "all"}
            onClick={() => {
              setCategory("all");
              updateUrl({ category: "all" });
            }}
          >
            Alle
          </FilterChip>
          {filters.categories.slice(0, 8).map((c) => {
            const visual = knowledgeVisual(c);
            const Icon = visual.icon;
            return (
              <FilterChip
                key={c}
                accent="teal"
                active={category === c}
                onClick={() => {
                  setCategory(c);
                  updateUrl({ category: c });
                }}
              >
                <Icon className="size-3.5" />
                {c}
              </FilterChip>
            );
          })}
        </div>
      </div>

      <Card className="hidden min-w-0 overflow-hidden border-border/80 shadow-sm md:block">
        <CardContent className="space-y-3 py-4">
          <FilterGrid>
            <div className="min-w-0 xl:col-span-2">
              <Input
                className="w-full"
                placeholder="Suche Titel / Inhalt / Korrespondent…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const next = searchInput.trim();
                    setSearch(next);
                    updateUrl({ search: next });
                  }
                }}
              />
            </div>

            <Select
              value={category}
              onValueChange={(value) => {
                if (value == null) return;
                setCategory(value);
                updateUrl({ category: value });
              }}
              items={categoryItems}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(categoryItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={correspondent}
              onValueChange={(value) => {
                if (value == null) return;
                setCorrespondent(value);
                updateUrl({ correspondent: value });
              }}
              items={correspondentItems}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(correspondentItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={documentType}
              onValueChange={(value) => {
                if (value == null) return;
                setDocumentType(value);
                updateUrl({ documentType: value });
              }}
              items={documentTypeItems}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(documentTypeItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto]">
              <Select
                value={analysisStatus}
                onValueChange={(value) => {
                  if (value == null) return;
                  setAnalysisStatus(value);
                  updateUrl({ analysisStatus: value });
                }}
                items={statusItems}
              >
                <SelectTrigger className="col-span-2 w-full sm:col-span-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(statusItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setSearch(searchInput.trim())}
              >
                Suchen
              </Button>
              {hasActiveFilters ? (
                <Button type="button" variant="outline" onClick={resetFilters}>
                  Reset
                </Button>
              ) : null}
            </div>
          </FilterGrid>

          {hasActiveFilters ? (
            <p className="text-xs text-muted-foreground">
              Filter aktiv
              {search ? ` · Suche: „${search}“` : ""}
              {category !== "all" ? ` · Kategorie: ${category}` : ""}
              {correspondent !== "all"
                ? ` · Korrespondent: ${correspondent}`
                : ""}
              {documentType !== "all" ? ` · Typ: ${documentType}` : ""}
              {analysisStatus !== "all" ? ` · Status: ${analysisStatus}` : ""}
              {total > docs.length
                ? ` · Anzeige der ersten ${docs.length} von ${total}`
                : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Filter</SheetTitle>
            <SheetDescription>
              Dokumente nach Kategorie, Typ und Status eingrenzen.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-6">
            <Select
              value={category}
              onValueChange={(value) => {
                if (value == null) return;
                setCategory(value);
                updateUrl({ category: value });
              }}
              items={categoryItems}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Kategorie" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(categoryItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={correspondent}
              onValueChange={(value) => {
                if (value == null) return;
                setCorrespondent(value);
                updateUrl({ correspondent: value });
              }}
              items={correspondentItems}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Korrespondent" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(correspondentItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={documentType}
              onValueChange={(value) => {
                if (value == null) return;
                setDocumentType(value);
                updateUrl({ documentType: value });
              }}
              items={documentTypeItems}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Typ" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(documentTypeItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={analysisStatus}
              onValueChange={(value) => {
                if (value == null) return;
                setAnalysisStatus(value);
                updateUrl({ analysisStatus: value });
              }}
              items={statusItems}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(statusItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => {
                  setSearch(searchInput.trim());
                  setFilterOpen(false);
                }}
              >
                Anwenden
              </Button>
              {hasActiveFilters ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    resetFilters();
                    setFilterOpen(false);
                  }}
                >
                  Reset
                </Button>
              ) : null}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {error ? (
        <Card className="border-destructive/30">
          <CardContent className="py-4 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <div className="p-8 text-sm text-muted-foreground">
          Lade Dokumente…
        </div>
      ) : docs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            {hasActiveFilters
              ? "Keine Treffer für diese Suche/Filter. Filter zurücksetzen oder anderen Begriff versuchen."
              : "Keine Dokumente gefunden. Starte zuerst den Paperless-Sync."}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile soft cards */}
          <div className="space-y-3 md:hidden">
            {docs.map((doc) => {
              const visual = knowledgeVisual(doc.category || "Sonstiges");
              return (
                <Link
                  key={doc.id}
                  href={`/documents/${doc.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3.5 shadow-[0_4px_16px_rgba(20,32,28,0.05)] transition-colors active:bg-muted/40"
                >
                  <IconCircle
                    icon={visual.icon}
                    tone="teal"
                    size="lg"
                    className="rounded-xl"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-foreground">
                      {doc.title || `Dokument #${doc.id}`}
                    </div>
                    {doc.category ? (
                      <span className="mt-1 inline-flex rounded-full bg-[var(--brand-docs-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--brand-docs)]">
                        {doc.category}
                      </span>
                    ) : null}
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="size-3.5 shrink-0" />
                      <span className="tabular-nums">
                        {toSwissDate(doc.created_date)}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-[var(--brand-docs)]" />
                </Link>
              );
            })}
          </div>

          {/* Desktop list */}
          <Card className="hidden min-w-0 overflow-hidden md:block">
            <CardContent className="p-0">
              <DataList>
                {docs.map((doc) => (
                  <DataListRow key={doc.id}>
                    <DataListMain
                      title={
                        <DocumentTitleLink
                          documentId={doc.id}
                          title={doc.title}
                        />
                      }
                      meta={
                        <MetaLine>
                          <span className="tabular-nums">
                            {toSwissDate(doc.created_date)}
                          </span>
                          {doc.correspondent_name ? (
                            <span>{doc.correspondent_name}</span>
                          ) : null}
                          {doc.document_type_name ? (
                            <span>{doc.document_type_name}</span>
                          ) : null}
                          {doc.category ? <span>{doc.category}</span> : null}
                          {statusBadge(doc.analysis_status)}
                        </MetaLine>
                      }
                      actions={
                        <>
                          <DocumentInfoButton documentId={doc.id} />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={analyzingId === doc.id || isRunning}
                            onClick={() => void analyzeOne(doc.id)}
                          >
                            {analyzingId === doc.id ? "…" : "Analysieren"}
                          </Button>
                        </>
                      }
                    />
                  </DataListRow>
                ))}
              </DataList>
            </CardContent>
          </Card>
        </>
      )}

      <SoftFab
        accent="teal"
        aria-label="Suche"
        onClick={() => {
          setSearchFocus(true);
          window.setTimeout(() => searchInputRef.current?.focus(), 50);
        }}
      >
        <Search className="size-5" />
      </SoftFab>
    </div>
  );
}
