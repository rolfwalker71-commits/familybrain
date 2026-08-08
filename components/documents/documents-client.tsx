"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, CalendarDays, ChevronRight, Filter, MoreHorizontal, Search, Sparkles, Trash2 } from "lucide-react";
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
import { PageHeader } from "@/components/layout/page-primitives";
import {
  IconCircle,
  knowledgeVisual,
  pageVisuals,
} from "@/components/layout/icon-circle";
import { AiImagePreview } from "@/components/layout/ai-image-preview";
import { AiImageZoom } from "@/components/layout/ai-image-zoom";
import { FilterChip, SoftFab } from "@/components/layout/soft-ui";
import { UserAvatar } from "@/components/users/user-avatar";
import { toSwissDate } from "@/lib/utils/dates";
import { readNdjsonStream } from "@/lib/utils/stream";
import { withTriageMassPause } from "@/lib/documents/triage-mass-pause-client";
import { useListSortDir } from "@/components/layout/list-sort-control";
import {
  documentSortByLabel,
  readDocumentSortBy,
  type DocumentSortBy,
  writeDocumentSortBy,
} from "@/lib/utils/list-sort";
import {
  DocumentInfoButton,
  DocumentTitleLink,
} from "@/components/documents/document-link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";

type DocRow = {
  id: number;
  title: string | null;
  created_date: string | null;
  added_at?: string | null;
  created_at?: string | null;
  correspondent_name: string | null;
  document_type_name: string | null;
  category?: string | null;
  analysis_status?: string | null;
  sync_status: string | null;
  ai_icon_url?: string | null;
  is_business?: boolean;
  recipients?: {
    status: "matched" | "unknown" | null;
    label: string | null;
    members: Array<{
      id: number;
      display_name: string;
      avatar_url: string | null;
    }>;
  };
};

type Filters = {
  correspondents: string[];
  documentTypes: string[];
  categories: string[];
  recipients: Array<{
    value: string;
    label: string;
    avatar_url: string | null;
  }>;
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

function docSortDate(doc: DocRow, sortBy: DocumentSortBy): string {
  if (sortBy === "created") {
    return toSwissDate(doc.added_at || doc.created_at);
  }
  return toSwissDate(doc.created_date);
}

function docSortDateLabel(sortBy: DocumentSortBy): string {
  return sortBy === "created" ? "Angelegt" : "Dokumentdatum";
}

export function DocumentsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { pendingCount, errorCount, isRunning, refreshStats, startAnalysis, hasOpenAIKey, stopAnalysis } =
    useAnalysis();
  const [sortDir, setSortDir] = useListSortDir("documents", "desc");
  const [sortBy, setSortByState] = useState<DocumentSortBy>("created");
  const [retryingErrors, setRetryingErrors] = useState(false);

  useEffect(() => {
    setSortByState(readDocumentSortBy("documents", "created"));
  }, []);

  function setSortBy(next: DocumentSortBy) {
    writeDocumentSortBy("documents", next);
    setSortByState(next);
  }

  const [docs, setDocs] = useState<DocRow[]>([]);
  const [total, setTotal] = useState(0);
  const [documentAiIconsEnabled, setDocumentAiIconsEnabled] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    correspondents: [],
    documentTypes: [],
    categories: [],
    recipients: [],
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
  const [recipient, setRecipient] = useState(
    searchParams.get("recipient") || "all"
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [analyzeBusy, setAnalyzeBusy] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<string | null>(null);
  const [searchFocus, setSearchFocus] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [knowledgeAreas, setKnowledgeAreas] = useState<string[]>([]);
  const [bulkCategoryBusy, setBulkCategoryBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [missingAiIcons, setMissingAiIcons] = useState(0);
  const [iconBusy, setIconBusy] = useState(false);
  const [iconProgress, setIconProgress] = useState<string | null>(null);
  const [generatingIconId, setGeneratingIconId] = useState<number | null>(null);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keep filters in sync when navigating from Wissensbereiche (/documents?category=…)
  useEffect(() => {
    setCategory(searchParams.get("category") || "all");
    setCorrespondent(searchParams.get("correspondent") || "all");
    setDocumentType(searchParams.get("documentType") || "all");
    setAnalysisStatus(searchParams.get("analysisStatus") || "all");
    setRecipient(searchParams.get("recipient") || "all");
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
    recipient?: string;
  }) {
    const params = new URLSearchParams();
    const s = next.search ?? search;
    const c = next.category ?? category;
    const corr = next.correspondent ?? correspondent;
    const dt = next.documentType ?? documentType;
    const st = next.analysisStatus ?? analysisStatus;
    const rec = next.recipient ?? recipient;
    if (s.trim()) params.set("search", s.trim());
    if (c !== "all") params.set("category", c);
    if (corr !== "all") params.set("correspondent", corr);
    if (dt !== "all") params.set("documentType", dt);
    if (st !== "all") params.set("analysisStatus", st);
    if (rec !== "all") params.set("recipient", rec);
    const qs = params.toString();
    router.replace(qs ? `/documents?${qs}` : "/documents", { scroll: false });
  }

  const hasActiveFilters =
    Boolean(search.trim()) ||
    category !== "all" ||
    correspondent !== "all" ||
    documentType !== "all" ||
    analysisStatus !== "all" ||
    recipient !== "all";

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
    if (recipient !== "all") params.set("recipient", recipient);
    params.set("limit", "250");
    params.set("sortDir", sortDir);
    params.set("sortBy", sortBy);

    try {
      const res = await fetch(`/api/documents?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Laden fehlgeschlagen");
      if (requestId !== requestIdRef.current) return;
      setDocs(data.documents || []);
      setTotal(Number(data.total) || 0);
      setMissingAiIcons(Number(data.missingAiIcons) || 0);
      setFilters({
        correspondents: data.filters?.correspondents || [],
        documentTypes: data.filters?.documentTypes || [],
        categories: data.filters?.categories || [],
        recipients: data.filters?.recipients || [],
      });
      try {
        const settingsRes = await fetch("/api/settings", { cache: "no-store" });
        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          setDocumentAiIconsEnabled(Boolean(settings.documentAiIconsEnabled));
        }
      } catch {
        /* ignore */
      }
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
    recipient,
    sortDir,
    sortBy,
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

  async function runBulkCategory(nextCategory: string) {
    if (!nextCategory || selectedIds.size === 0 || bulkCategoryBusy) return;
    setBulkCategoryBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/documents/category/batch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentIds: Array.from(selectedIds),
          category: nextCategory,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Umklassifizierung fehlgeschlagen");
      }
      setSelectedIds(new Set());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBulkCategoryBusy(false);
    }
  }

  async function deleteDocuments(ids: number[]) {
    if (ids.length === 0 || deleteBusy) return;
    const label =
      ids.length === 1
        ? "Dieses Dokument wirklich löschen?"
        : `${ids.length} Dokumente wirklich löschen?`;
    const ok = window.confirm(
      `${label}\n\nEs wird in Paperless und in Buddy gelöscht. Das lässt sich nicht rückgängig machen.`
    );
    if (!ok) return;

    setDeleteBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/documents/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds: ids, confirm: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "Löschen fehlgeschlagen");
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleteBusy(false);
    }
  }

  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => {
      void load();
    }, 8000);
    return () => window.clearInterval(id);
  }, [isRunning, load]);

  async function analyzeOne(id: number) {
    if (isRunning || analyzeBusy) {
      setError(
        "Batch-Analyse läuft noch. Oben «Analyse stoppen», dann erneut «Analysieren»."
      );
      return;
    }
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

  async function runSelectedAnalyzeBatch() {
    if (!hasOpenAIKey) {
      setError("OpenAI-Key fehlt.");
      return;
    }
    if (isRunning || analyzeBusy || iconBusy) {
      setError("Ein anderer Lauf ist noch aktiv.");
      return;
    }
    const documentIds = Array.from(selectedIds);
    if (documentIds.length === 0) {
      setError("Bitte zuerst Dokumente auswählen.");
      return;
    }

    setAnalyzeBusy(true);
    setError(null);
    setAnalyzeProgress(
      `Neuanalyse… (${documentIds.length} ausgewählt)`
    );
    setAnalyzingId(documentIds[0] ?? null);
    try {
      await withTriageMassPause(documentIds.length, async () => {
        let afterId = 0;
        let totalSucceeded = 0;
        let totalFailed = 0;
        let done = false;

        while (!done) {
          const res = await fetch("/api/analyze/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              limit: Math.min(documentIds.length, 10),
              afterId,
              documentIds,
            }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Analyse-Batch fehlgeschlagen");
          }

          let batchDone = true;
          let nextAfterId = afterId;
          let streamError: string | null = null;

          await readNdjsonStream(res, (event) => {
            if (event.type === "progress") {
              const currentId =
                typeof event.currentDocumentId === "number"
                  ? event.currentDocumentId
                  : null;
              if (currentId != null) setAnalyzingId(currentId);
              setAnalyzeProgress(
                `Neuanalyse… ${Number(event.succeeded || 0) + totalSucceeded} ok` +
                  (Number(event.failed || 0) + totalFailed > 0
                    ? `, ${Number(event.failed || 0) + totalFailed} Fehler`
                    : "") +
                  (currentId != null ? ` · Dokument #${currentId}` : "")
              );
            } else if (event.type === "done") {
              const processed = Number(event.processed || 0);
              const succeeded = Number(event.succeeded || 0);
              const failedList = Array.isArray(event.failed) ? event.failed : [];
              totalSucceeded += succeeded;
              totalFailed += failedList.length;
              nextAfterId = Number(event.nextAfterId ?? afterId);
              batchDone =
                event.done === true ||
                processed === 0 ||
                (typeof event.queueRemaining === "number" &&
                  Number(event.queueRemaining) === 0);
              setAnalyzeProgress(
                `Fertig: ${totalSucceeded} ok` +
                  (totalFailed > 0 ? `, ${totalFailed} Fehler` : "")
              );
            } else if (event.type === "error") {
              streamError = String(
                event.error || "Analyse-Batch fehlgeschlagen"
              );
            }
          });

          if (streamError) throw new Error(streamError);
          afterId = nextAfterId;
          done = batchDone;
        }
      });

      setSelectedIds(new Set());
      await refreshStats();
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzeBusy(false);
      setAnalyzingId(null);
      window.setTimeout(() => setAnalyzeProgress(null), 2500);
    }
  }

  async function retryAllErrors() {
    if (isRunning || retryingErrors) return;
    setRetryingErrors(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobType: "analyze_pending",
          resetErrors: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Fehlerhafte erneut starten fehlgeschlagen");
      }
      await refreshStats();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRetryingErrors(false);
    }
  }

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    const ids = docs.map((d) => d.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(ids));
  }

  async function stopRunningWork() {
    stopAnalysis();
    setIconBusy(false);
    setIconProgress(null);
    setGeneratingIconId(null);
    setAnalyzeBusy(false);
    setAnalyzeProgress(null);
    setAnalyzingId(null);
    try {
      await fetch("/api/jobs/cancel", { method: "POST" });
    } catch {
      /* ignore */
    }
    setError(null);
    await load();
  }

  async function enableDocumentAiIcons() {
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentAiIconsEnabled: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Einstellung speichern fehlgeschlagen");
      }
      setDocumentAiIconsEnabled(
        data.documentAiIconsEnabled !== undefined
          ? Boolean(data.documentAiIconsEnabled)
          : true
      );
      setIconProgress(
        "KI-Icons aktiv. Dokumente auswählen → «Icons neu», oder pro Zeile «Icon»."
      );
      window.setTimeout(() => setIconProgress(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function generateOneIcon(documentId: number) {
    if (!documentAiIconsEnabled) {
      setError(
        "KI-Icons sind noch aus. Oben «KI-Icons einschalten» tippen."
      );
      return;
    }
    if (!hasOpenAIKey) {
      setError("OpenAI-Key fehlt.");
      return;
    }
    if (iconBusy) return;
    setIconBusy(true);
    setError(null);
    setGeneratingIconId(documentId);
    setIconProgress(`Generierung… Dokument #${documentId}`);
    try {
      const res = await fetch(`/api/documents/${documentId}/ai-icon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Icon-Generierung fehlgeschlagen");
      }
      const url =
        typeof data.aiIconUrl === "string"
          ? `${data.aiIconUrl}?t=${Date.now()}`
          : null;
      setDocs((prev) =>
        prev.map((d) =>
          d.id === documentId ? { ...d, ai_icon_url: url } : d
        )
      );
      if (url) {
        setMissingAiIcons((n) => Math.max(0, n - 1));
      }
      setIconProgress("Icon fertig.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIconProgress(null);
    } finally {
      setIconBusy(false);
      setGeneratingIconId(null);
      window.setTimeout(() => setIconProgress(null), 2500);
    }
  }

  async function runAiIconBatch(mode: "selected" | "all-missing" | "all-force") {
    if (!documentAiIconsEnabled) {
      setError(
        "KI-Icons sind noch aus. Oben «KI-Icons einschalten» tippen."
      );
      return;
    }
    if (!hasOpenAIKey) {
      setError("OpenAI-Key fehlt.");
      return;
    }

    if (mode === "all-missing" || mode === "all-force") {
      const jobType =
        mode === "all-force" ? "ai_icons_regenerate" : "ai_icons_missing";
      setIconBusy(true);
      setError(null);
      setIconProgress(
        mode === "all-force"
          ? "Starte Server-Job «Alle Icons neu» — läuft weiter, wenn du die Seite verlässt…"
          : "Starte Server-Job «Nur fehlende Icons» — läuft weiter, wenn du die Seite verlässt…"
      );
      try {
        const res = await fetch("/api/jobs/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobType }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            data.error || "Icon-Job starten fehlgeschlagen"
          );
        }
        setIconProgress(
          "KI-Icons-Job läuft im Hintergrund. Fortschritt unter Sync → Automation."
        );
        window.setTimeout(() => setIconProgress(null), 6000);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setIconProgress(null);
      } finally {
        setIconBusy(false);
      }
      return;
    }

    const documentIds = Array.from(selectedIds);
    if (documentIds.length === 0) {
      setError("Bitte zuerst Dokumente auswählen.");
      return;
    }

    setIconBusy(true);
    setError(null);
    setIconProgress(
      `Generierung… (${documentIds.length} ausgewählt, ersetzt bestehende)`
    );
    setGeneratingIconId(documentIds[0] ?? null);
    try {
      let afterId = 0;
      let totalSucceeded = 0;
      let totalFailed = 0;
      let done = false;

      while (!done) {
        const res = await fetch("/api/documents/ai-icons/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            limit: Math.min(documentIds.length, 10),
            afterId,
            force: true,
            documentIds,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Icon-Batch fehlgeschlagen");
        }

        let batchDone = true;
        let nextAfterId = afterId;
        let streamError: string | null = null;

        await readNdjsonStream(res, (event) => {
          if (event.type === "progress") {
            const currentId =
              typeof event.currentDocumentId === "number"
                ? event.currentDocumentId
                : null;
            if (currentId != null) setGeneratingIconId(currentId);
            const phase =
              event.phase === "generating" ? "Generierung" : "Icons";
            setIconProgress(
              `${phase}… ${Number(event.succeeded || 0) + totalSucceeded} ok` +
                (Number(event.failed || 0) + totalFailed > 0
                  ? `, ${Number(event.failed || 0) + totalFailed} Fehler`
                  : "") +
                (currentId != null ? ` · Dokument #${currentId}` : "")
            );
          } else if (event.type === "done") {
            const processed = Number(event.processed || 0);
            const succeeded = Number(event.succeeded || 0);
            const failedList = Array.isArray(event.failed) ? event.failed : [];
            totalSucceeded += succeeded;
            totalFailed += failedList.length;
            nextAfterId = Number(event.nextAfterId ?? afterId);
            batchDone = Boolean(event.done) || processed === 0;
            if (typeof event.missingRemaining === "number") {
              setMissingAiIcons(Number(event.missingRemaining));
            }
            setIconProgress(
              `Fertig: ${totalSucceeded} ok` +
                (totalFailed > 0 ? `, ${totalFailed} Fehler` : "")
            );
          } else if (event.type === "error") {
            streamError = String(event.error || "Icon-Batch fehlgeschlagen");
          }
        });

        if (streamError) throw new Error(streamError);
        afterId = nextAfterId;
        done = batchDone;
      }

      setSelectedIds(new Set());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIconBusy(false);
      setGeneratingIconId(null);
      window.setTimeout(() => setIconProgress(null), 2500);
    }
  }

  function DocListIcon({ doc }: { doc: DocRow }) {
    const generating = generatingIconId === doc.id;
    return (
      <span className="relative shrink-0">
        {doc.ai_icon_url ? (
          <AiImagePreview
            src={doc.ai_icon_url}
            brand="docs"
            alt=""
            imageClassName="h-11 w-11 object-cover sm:h-12 sm:w-12"
            onOpen={() => {
              if (!generating) setZoomUrl(doc.ai_icon_url!);
            }}
          />
        ) : (
          (() => {
            const visual = knowledgeVisual(doc.category || "Sonstiges");
            return (
              <IconCircle
                icon={visual.icon}
                tone="teal"
                size="lg"
                className="rounded-xl"
              />
            );
          })()
        )}
        {generating ? (
          <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-black/70 px-1 text-center text-[9px] font-semibold leading-tight text-white">
            Generierung…
          </span>
        ) : null}
      </span>
    );
  }

  function resetFilters() {
    setSearchInput("");
    setSearch("");
    setCategory("all");
    setCorrespondent("all");
    setDocumentType("all");
    setAnalysisStatus("all");
    setRecipient("all");
    router.replace("/documents", { scroll: false });
  }

  const categoryItems = useMemo(() => {
    // Prefer full knowledge-area list (incl. «Geschäftlich») over only
    // categories that already appear on ≥1 document.
    const names = [
      ...knowledgeAreas,
      ...filters.categories.filter((c) => !knowledgeAreas.includes(c)),
    ];
    if (
      category !== "all" &&
      !names.includes(category)
    ) {
      names.push(category);
    }
    return toItemsRecord([
      { value: "all", label: "Alle Kategorien" },
      ...names.map((c) => ({ value: c, label: c })),
    ]);
  }, [filters.categories, knowledgeAreas, category]);

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

  const recipientItems = useMemo(
    () =>
      toItemsRecord([
        { value: "all", label: "Alle Empfänger" },
        ...filters.recipients.map((r) => ({
          value: r.value,
          label: r.label,
        })),
      ]),
    [filters.recipients]
  );

  function recipientLabel(value: string): string {
    return recipientItems[value] || value;
  }

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
        actions={
          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    title="Sortierung wählen"
                    aria-label={`Sortierung: ${documentSortByLabel(sortBy)}, ${
                      sortDir === "asc"
                        ? "älteste zuerst"
                        : "neueste zuerst"
                    }`}
                  />
                }
              >
                <span>{documentSortByLabel(sortBy)}</span>
                {sortDir === "asc" ? (
                  <ArrowUp className="size-3.5 opacity-80" aria-hidden />
                ) : (
                  <ArrowDown className="size-3.5 opacity-80" aria-hidden />
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[14rem]">
                <DropdownMenuItem
                  onClick={() => {
                    setSortBy("created");
                    setSortDir("desc");
                  }}
                >
                  Erstellungsdatum · neueste zuerst
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setSortBy("created");
                    setSortDir("asc");
                  }}
                >
                  Erstellungsdatum · älteste zuerst
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setSortBy("document_date");
                    setSortDir("desc");
                  }}
                >
                  Dokumentdatum · neueste zuerst
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setSortBy("document_date");
                    setSortDir("asc");
                  }}
                >
                  Dokumentdatum · älteste zuerst
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {isRunning ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void stopRunningWork()}
              >
                Analyse stoppen
              </Button>
            ) : (
              <>
                {pendingCount > 0 && hasOpenAIKey ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={iconBusy || analyzeBusy}
                      onClick={() =>
                        void startAnalysis({ mode: "batch", batchSize: 10 })
                      }
                    >
                      10 analysieren
                    </Button>
                    <Button
                      size="sm"
                      className="bg-[var(--brand-finance)] text-white hover:bg-[var(--brand-finance)]/90"
                      disabled={iconBusy || analyzeBusy}
                      onClick={() =>
                        void startAnalysis({ mode: "all", batchSize: 10 })
                      }
                    >
                      Alle ausstehend
                    </Button>
                  </>
                ) : null}
              </>
            )}
            {hasOpenAIKey ? (
              <Button
                size="sm"
                variant="outline"
                disabled={
                  iconBusy || analyzeBusy || isRunning || selectedIds.size === 0
                }
                onClick={() => void runSelectedAnalyzeBatch()}
              >
                {analyzeBusy
                  ? "Analyse…"
                  : `Analysieren (${selectedIds.size})`}
              </Button>
            ) : null}
            {selectedIds.size > 0 ? (
              <select
                className="h-8 max-w-[12rem] rounded-lg border border-border bg-background px-2 text-sm disabled:opacity-50"
                disabled={
                  bulkCategoryBusy ||
                  iconBusy ||
                  analyzeBusy ||
                  isRunning ||
                  deleteBusy
                }
                defaultValue=""
                onChange={(e) => {
                  const next = e.target.value;
                  e.target.value = "";
                  if (next) void runBulkCategory(next);
                }}
                aria-label="Rubrik zuweisen"
              >
                <option value="" disabled>
                  Rubrik zuweisen ({selectedIds.size})…
                </option>
                {(knowledgeAreas.length
                  ? knowledgeAreas
                  : filters.categories
                ).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            ) : null}
            {selectedIds.size > 0 ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={
                  deleteBusy || iconBusy || analyzeBusy || isRunning || bulkCategoryBusy
                }
                onClick={() => void deleteDocuments(Array.from(selectedIds))}
              >
                <Trash2 className="size-3.5" />
                {deleteBusy
                  ? "Löschen…"
                  : `Löschen (${selectedIds.size})`}
              </Button>
            ) : null}
            {hasOpenAIKey && (documentAiIconsEnabled || errorCount > 0) ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button size="sm" variant="outline" className="gap-1.5" />}
                >
                  <MoreHorizontal className="size-3.5" />
                  Mehr
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {errorCount > 0 ? (
                    <DropdownMenuItem
                      disabled={iconBusy || analyzeBusy || retryingErrors}
                      onClick={() => void retryAllErrors()}
                    >
                      {retryingErrors
                        ? "Starte…"
                        : `Fehlerhafte erneut (${errorCount})`}
                    </DropdownMenuItem>
                  ) : null}
                  {documentAiIconsEnabled ? (
                    <>
                      <DropdownMenuItem
                        disabled={iconBusy || analyzeBusy || selectedIds.size === 0}
                        onClick={() => void runAiIconBatch("selected")}
                      >
                        <Sparkles className="size-3.5" />
                        {iconBusy
                          ? "Generierung…"
                          : `Icons neu (${selectedIds.size})`}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={iconBusy || analyzeBusy || missingAiIcons === 0}
                        onClick={() => void runAiIconBatch("all-missing")}
                      >
                        <Sparkles className="size-3.5" />
                        {iconBusy
                          ? "Generierung…"
                          : `Nur fehlende (${missingAiIcons})`}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={iconBusy || analyzeBusy}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Alle KI-Icons neu generieren? Bestehende Icons werden ersetzt. Der Job läuft im Hintergrund."
                            )
                          ) {
                            void runAiIconBatch("all-force");
                          }
                        }}
                      >
                        <Sparkles className="size-3.5" />
                        Alle Icons neu
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : hasOpenAIKey ? (
              <Button
                size="sm"
                className="bg-[var(--brand-docs)] text-white hover:bg-[var(--brand-docs)]/90"
                onClick={() => void enableDocumentAiIcons()}
              >
                <Sparkles className="size-3.5" />
                KI-Icons einschalten
              </Button>
            ) : null}
          </div>
        }
      />

      {isRunning || analyzeBusy ? (
        <div
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
          role="status"
        >
          {analyzeBusy && analyzeProgress
            ? analyzeProgress
            : "Analyse läuft — «Analysieren» pro Zeile ist gesperrt."}{" "}
          <button
            type="button"
            className="font-semibold underline underline-offset-2"
            onClick={() => void stopRunningWork()}
          >
            Analyse stoppen
          </button>
          {analyzeBusy ? null : ", dann erneut tippen. KI-Icons sind davon unabhängig."}
        </div>
      ) : null}

      {hasOpenAIKey && !documentAiIconsEnabled ? (
        <div
          className="rounded-xl border border-[var(--brand-docs)]/40 bg-[var(--brand-docs-soft)] px-4 py-3 text-sm text-[var(--brand-docs)]"
          role="status"
        >
          <p className="font-medium">KI-Icons sind aus — deshalb keine Generierung.</p>
          <p className="mt-1 text-[var(--brand-docs)]/90">
            Dunkle Icons bleiben, bis du einschaltest und neu erzeugst: Auswahl
            anhaken → «Icons neu», oder in der Zeile «Icon».
          </p>
          <Button
            size="sm"
            className="mt-2 bg-[var(--brand-docs)] text-white hover:bg-[var(--brand-docs)]/90"
            onClick={() => void enableDocumentAiIcons()}
          >
            <Sparkles className="size-3.5" />
            Jetzt einschalten
          </Button>
        </div>
      ) : null}

      {iconProgress ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            iconBusy
              ? "border-[var(--brand-docs)]/40 bg-[var(--brand-docs-soft)] text-[var(--brand-docs)]"
              : "border-border/60 bg-muted/40 text-muted-foreground"
          }`}
          role="status"
          aria-live="polite"
        >
          {iconBusy ? (
            <span className="inline-flex items-center gap-2 font-medium">
              <Sparkles className="size-4 animate-pulse" />
              {iconProgress}
            </span>
          ) : (
            iconProgress
          )}
        </div>
      ) : null}

      {iconBusy ? (
        <div
          className="fixed inset-x-3 bottom-20 z-40 rounded-2xl border border-[var(--brand-docs)]/50 bg-[var(--brand-docs)] px-4 py-3 text-center text-sm font-semibold text-white shadow-lg md:inset-x-auto md:bottom-6 md:right-6 md:min-w-[280px]"
          role="status"
          aria-live="assertive"
        >
          <span className="inline-flex items-center justify-center gap-2">
            <Sparkles className="size-4 animate-pulse" />
            {iconProgress || "Generierung…"}
          </span>
        </div>
      ) : null}
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
          <div className="flex min-w-0 flex-col gap-3">
            <div className="min-w-0">
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

            <div className="flex min-w-0 flex-wrap items-stretch gap-2">
              <Select
                value={category}
                onValueChange={(value) => {
                  if (value == null) return;
                  setCategory(value);
                  updateUrl({ category: value });
                }}
                items={categoryItems}
              >
                <SelectTrigger className="w-full min-w-[10rem] sm:w-auto sm:min-w-[11rem]">
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
                <SelectTrigger className="w-full min-w-[10rem] sm:w-auto sm:min-w-[11rem]">
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
                <SelectTrigger className="w-full min-w-[10rem] sm:w-auto sm:min-w-[11rem]">
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

              <Select
                value={analysisStatus}
                onValueChange={(value) => {
                  if (value == null) return;
                  setAnalysisStatus(value);
                  updateUrl({ analysisStatus: value });
                }}
                items={statusItems}
              >
                <SelectTrigger className="w-full min-w-[8rem] sm:w-auto sm:min-w-[9rem]">
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

              <Select
                value={recipient}
                onValueChange={(value) => {
                  if (value == null) return;
                  setRecipient(value);
                  updateUrl({ recipient: value });
                }}
                items={recipientItems}
              >
                <SelectTrigger className="w-full min-w-[10rem] sm:w-auto sm:min-w-[11rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(recipientItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex min-w-0 flex-wrap gap-2">
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
            </div>
          </div>

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
              {recipient !== "all"
                ? ` · Empfänger: ${recipientLabel(recipient)}`
                : ""}
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
              Dokumente nach Kategorie, Empfänger, Typ und Status eingrenzen.
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
              value={recipient}
              onValueChange={(value) => {
                if (value == null) return;
                setRecipient(value);
                updateUrl({ recipient: value });
              }}
              items={recipientItems}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Empfänger" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(recipientItems).map(([value, label]) => (
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
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-[var(--brand-docs)]"
                checked={
                  docs.length > 0 &&
                  docs.every((d) => selectedIds.has(d.id))
                }
                onChange={toggleSelectAllVisible}
              />
              Sichtbare auswählen
            </label>
            {selectedIds.size > 0 ? (
              <span>· {selectedIds.size} ausgewählt</span>
            ) : null}
            {missingAiIcons > 0 ? (
              <span>· {missingAiIcons} ohne AI-Icon</span>
            ) : null}
          </div>

          {/* Mobile soft cards */}
          <div className="space-y-3 md:hidden">
            {docs.map((doc) => {
              return (
                <div
                  key={doc.id}
                  className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card p-3.5 shadow-[0_4px_16px_rgba(20,32,28,0.05)]"
                >
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-[var(--brand-docs)]"
                    checked={selectedIds.has(doc.id)}
                    onChange={() => toggleSelected(doc.id)}
                    aria-label="Auswählen"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={deleteBusy}
                    title="Löschen"
                    onClick={() => void deleteDocuments([doc.id])}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                  {documentAiIconsEnabled ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 px-2"
                      disabled={iconBusy}
                      title="AI-Icon erzeugen"
                      onClick={() => void generateOneIcon(doc.id)}
                    >
                      <Sparkles className="size-3.5" />
                    </Button>
                  ) : null}
                  <Link
                    href={`/documents/${doc.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3 transition-colors active:opacity-80"
                  >
                    <DocListIcon doc={doc} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-foreground">
                        {doc.title || `Dokument #${doc.id}`}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {doc.is_business || doc.category === "Geschäftlich" ? (
                          <span className="inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-white">
                            Geschäftlich · O365
                          </span>
                        ) : null}
                        {doc.category && doc.category !== "Geschäftlich" ? (
                          <span className="inline-flex rounded-full bg-[var(--brand-docs-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--brand-docs)]">
                            {doc.category}
                          </span>
                        ) : null}
                      </div>
                      {doc.recipients?.label ? (
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          {doc.recipients.members.slice(0, 3).map((m) => (
                            <UserAvatar
                              key={m.id}
                              name={m.display_name}
                              src={m.avatar_url}
                              size="xs"
                            />
                          ))}
                          <span className="truncate">{doc.recipients.label}</span>
                        </div>
                      ) : null}
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarDays className="size-3.5 shrink-0" />
                        <span className="tabular-nums">
                          {docSortDateLabel(sortBy)} · {docSortDate(doc, sortBy)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-[var(--brand-docs)]" />
                  </Link>
                </div>
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
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-1 size-4 shrink-0 accent-[var(--brand-docs)]"
                            checked={selectedIds.has(doc.id)}
                            onChange={() => toggleSelected(doc.id)}
                            aria-label="Auswählen"
                          />
                          <DocListIcon doc={doc} />
                          <DocumentTitleLink
                            documentId={doc.id}
                            title={doc.title}
                          />
                        </div>
                      }
                      meta={
                        <MetaLine>
                          <span className="tabular-nums">
                            {docSortDateLabel(sortBy)} · {docSortDate(doc, sortBy)}
                          </span>
                          {doc.correspondent_name ? (
                            <span>{doc.correspondent_name}</span>
                          ) : null}
                          {doc.recipients?.label ? (
                            <span className="inline-flex items-center gap-1">
                              {doc.recipients.members.slice(0, 3).map((m) => (
                                <UserAvatar
                                  key={m.id}
                                  name={m.display_name}
                                  src={m.avatar_url}
                                  size="xs"
                                />
                              ))}
                              {doc.recipients.label}
                            </span>
                          ) : null}
                          {doc.document_type_name ? (
                            <span>{doc.document_type_name}</span>
                          ) : null}
                          {doc.is_business || doc.category === "Geschäftlich" ? (
                            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-white">
                              Geschäftlich · O365
                            </span>
                          ) : doc.category ? (
                            <span>{doc.category}</span>
                          ) : null}
                          {statusBadge(doc.analysis_status)}
                        </MetaLine>
                      }
                      actions={
                        <>
                          <DocumentInfoButton documentId={doc.id} />
                          {documentAiIconsEnabled ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={iconBusy}
                              title={
                                doc.ai_icon_url
                                  ? "AI-Icon neu erzeugen"
                                  : "AI-Icon erzeugen"
                              }
                              onClick={() => void generateOneIcon(doc.id)}
                            >
                              <Sparkles className="size-3.5" />
                              {generatingIconId === doc.id
                                ? "…"
                                : "Icon"}
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              analyzingId === doc.id || isRunning || analyzeBusy
                            }
                            title={
                              isRunning || analyzeBusy
                                ? "Erst Analyse stoppen"
                                : "Dokument analysieren"
                            }
                            onClick={() => void analyzeOne(doc.id)}
                          >
                            {analyzingId === doc.id ? "…" : "Analysieren"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={deleteBusy || iconBusy || analyzeBusy || isRunning}
                            title="In Paperless und Buddy löschen"
                            onClick={() => void deleteDocuments([doc.id])}
                          >
                            <Trash2 className="size-3.5" />
                            Löschen
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

      {zoomUrl ? (
        <AiImageZoom src={zoomUrl} onClose={() => setZoomUrl(null)} />
      ) : null}
    </div>
  );
}
