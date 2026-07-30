"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Download } from "lucide-react";
import type { TaxYearGroup } from "@/lib/db/queries";
import { toSwissDate } from "@/lib/utils/dates";
import { PageHeader } from "@/components/layout/page-primitives";
import {
  IconCircle,
  knowledgeVisual,
  pageVisuals,
} from "@/components/layout/icon-circle";
import { AiImagePreview } from "@/components/layout/ai-image-preview";
import { AiImageZoom } from "@/components/layout/ai-image-zoom";
import { DocumentTitleLink } from "@/components/documents/document-link";
import { MetaLine } from "@/components/layout/data-list";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SteuernYearClient({ groups }: { groups: TaxYearGroup[] }) {
  const latestYear = useMemo(() => {
    const years = groups
      .map((g) => g.taxYear)
      .filter((y): y is number => typeof y === "number");
    return years.length ? Math.max(...years) : null;
  }, [groups]);

  const [openYears, setOpenYears] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (latestYear != null) initial.add(String(latestYear));
    else if (groups.some((g) => g.taxYear == null)) initial.add("null");
    return initial;
  });
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  function toggle(key: string) {
    setOpenYears((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleYearSelection(group: TaxYearGroup) {
    const ids = group.documents.map((d) => d.id);
    const allSelected =
      ids.length > 0 && ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of ids) next.delete(id);
      } else {
        for (const id of ids) next.add(id);
      }
      return next;
    });
  }

  async function exportSelected() {
    const documentIds = Array.from(selectedIds);
    if (documentIds.length === 0 || exportBusy) return;
    setExportBusy(true);
    setExportError(null);
    try {
      const res = await fetch("/api/documents/tax-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error || `Export fehlgeschlagen (${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] || "Steuerbelege.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      const skipped = Number(res.headers.get("X-Export-Skipped") || "0");
      if (skipped > 0) {
        setExportError(
          `${res.headers.get("X-Export-Count") || "?"} exportiert, ${skipped} übersprungen.`
        );
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExportBusy(false);
    }
  }

  const total = groups.reduce((n, g) => n + g.documents.length, 0);
  const visual = knowledgeVisual("Steuern");

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Steuern"
        description={`${total} Steuerbelege · gruppiert nach Steuerjahr`}
        icon={pageVisuals.knowledge.icon}
        tone={visual.tone}
      />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          href="/knowledge"
          className="text-muted-foreground underline-offset-2 hover:underline"
        >
          ← Wissen
        </Link>
        <span className="text-muted-foreground">·</span>
        <Link
          href="/documents?category=Steuern"
          className="text-muted-foreground underline-offset-2 hover:underline"
        >
          Flache Liste
        </Link>
      </div>

      {selectedIds.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3">
          <span className="text-sm text-muted-foreground">
            {selectedIds.size} ausgewählt
          </span>
          <Button
            type="button"
            size="sm"
            disabled={exportBusy}
            onClick={() => void exportSelected()}
          >
            <Download className="size-4" />
            {exportBusy
              ? "Export…"
              : `Als PDF exportieren (${selectedIds.size})`}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={exportBusy}
            onClick={() => setSelectedIds(new Set())}
          >
            Auswahl leeren
          </Button>
          {exportError ? (
            <span className="w-full text-xs text-amber-700 dark:text-amber-400">
              {exportError}
            </span>
          ) : null}
        </div>
      ) : null}

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine analysierten Steuerbelege.
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const key = group.taxYear == null ? "null" : String(group.taxYear);
            const open = openYears.has(key);
            const yearIds = group.documents.map((d) => d.id);
            const yearSelected = yearIds.filter((id) => selectedIds.has(id))
              .length;
            const allYearSelected =
              yearIds.length > 0 && yearSelected === yearIds.length;
            return (
              <section
                key={key}
                className="overflow-hidden rounded-2xl border border-border/70 bg-card"
              >
                <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 sm:px-4">
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-[var(--brand-docs)]"
                    checked={allYearSelected}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate =
                          yearSelected > 0 && !allYearSelected;
                      }
                    }}
                    onChange={() => toggleYearSelection(group)}
                    aria-label={`${group.label} auswählen`}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 py-1 text-left"
                    onClick={() => toggle(key)}
                    aria-expanded={open}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <IconCircle
                        icon={visual.icon}
                        tone={visual.tone}
                        size="sm"
                      />
                      <span className="min-w-0">
                        <span className="block font-semibold">
                          {group.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {group.documents.length}{" "}
                          {group.documents.length === 1 ? "Beleg" : "Belege"}
                          {yearSelected > 0
                            ? ` · ${yearSelected} markiert`
                            : ""}
                        </span>
                      </span>
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform",
                        open && "rotate-180"
                      )}
                    />
                  </button>
                </div>
                {open ? (
                  <ul className="divide-y divide-border/60">
                    {group.documents.map((doc) => (
                      <li key={doc.id} className="px-3 py-3 sm:px-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-1 size-4 shrink-0 accent-[var(--brand-docs)]"
                            checked={selectedIds.has(doc.id)}
                            onChange={() => toggleSelected(doc.id)}
                            aria-label="Beleg auswählen"
                          />
                          {doc.ai_icon_url ? (
                            <AiImagePreview
                              src={doc.ai_icon_url}
                              brand="docs"
                              alt=""
                              imageClassName="h-10 w-10 object-cover"
                              onOpen={() => setZoomUrl(doc.ai_icon_url!)}
                            />
                          ) : (
                            <IconCircle
                              icon={visual.icon}
                              tone={visual.tone}
                              size="md"
                              className="rounded-xl"
                            />
                          )}
                          <div className="min-w-0 flex-1 space-y-1">
                            <DocumentTitleLink
                              documentId={doc.id}
                              title={doc.title || `Dokument #${doc.id}`}
                              className="font-medium"
                            />
                            <MetaLine>
                              {[
                                toSwissDate(doc.created_date),
                                doc.correspondent_name,
                                doc.document_type_name,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </MetaLine>
                            {doc.short_summary ? (
                              <p className="line-clamp-2 text-xs text-muted-foreground">
                                {doc.short_summary}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      {zoomUrl ? (
        <AiImageZoom src={zoomUrl} onClose={() => setZoomUrl(null)} />
      ) : null}
    </div>
  );
}
