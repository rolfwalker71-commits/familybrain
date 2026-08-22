"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Download } from "lucide-react";
import type {
  KnowledgeDocItem,
  KnowledgeFilterMember,
  KnowledgeYearGroup,
} from "@/lib/knowledge/browse";
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
import { UserAvatar } from "@/components/users/user-avatar";
import { RecipientAvatars } from "@/components/family/recipient-avatars";
import { cn } from "@/lib/utils";

function filterMemberGroupDocs(
  docs: KnowledgeDocItem[],
  memberFilter: number | null
): KnowledgeDocItem[] {
  if (memberFilter == null) return docs;
  return docs.filter((d) => d.recipients.memberIds.includes(memberFilter));
}

export function KnowledgeBrowseClient({
  category,
  description,
  groups,
  filterMembers,
}: {
  category: string;
  description?: string | null;
  groups: KnowledgeYearGroup[];
  filterMembers: KnowledgeFilterMember[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [areaNames, setAreaNames] = useState<string[]>([]);
  const isSteuern = category === "Steuern";

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
        setAreaNames(names);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const latestYear = useMemo(() => {
    const years = groups
      .map((g) => g.year)
      .filter((y): y is number => typeof y === "number");
    return years.length ? Math.max(...years) : null;
  }, [groups]);

  const [memberFilter, setMemberFilter] = useState<number | null>(null);
  const [openYears, setOpenYears] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (latestYear != null) initial.add(String(latestYear));
    else if (groups.some((g) => g.year == null)) initial.add("null");
    return initial;
  });
  const [openMembers, setOpenMembers] = useState<Set<string>>(new Set());
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [classBusyId, setClassBusyId] = useState<number | null>(null);

  const filteredGroups = useMemo(() => {
    return groups
      .map((year) => {
        const memberGroups = year.memberGroups
          .map((mg) => {
            const documents = filterMemberGroupDocs(mg.documents, memberFilter);
            const bankAccountGroups = mg.bankAccountGroups
              .map((ag) => ({
                ...ag,
                documents: filterMemberGroupDocs(ag.documents, memberFilter),
              }))
              .filter((ag) => ag.documents.length > 0);
            const otherDocuments = filterMemberGroupDocs(
              mg.otherDocuments,
              memberFilter
            );
            return {
              ...mg,
              documents,
              bankAccountGroups,
              otherDocuments,
            };
          })
          .filter((mg) => mg.documents.length > 0);
        const documents = memberGroups.flatMap((mg) => mg.documents);
        return { ...year, memberGroups, documents };
      })
      .filter((y) => y.documents.length > 0);
  }, [groups, memberFilter]);

  const total = filteredGroups.reduce((n, g) => n + g.documents.length, 0);
  const visual = knowledgeVisual(category);

  function yearKey(year: number | null) {
    return year == null ? "null" : String(year);
  }

  function memberOpenKey(year: number | null, memberKey: string) {
    return `${yearKey(year)}::${memberKey}`;
  }

  function toggleYear(key: string) {
    setOpenYears((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleMember(key: string) {
    setOpenMembers((prev) => {
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

  function toggleDocsSelection(docs: KnowledgeDocItem[]) {
    const ids = docs.map((d) => d.id);
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

  async function patchTaxClass(
    docId: number,
    body: Record<string, unknown>
  ) {
    setClassBusyId(docId);
    setExportError(null);
    try {
      const res = await fetch(`/api/documents/${docId}/tax-class`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Umklassifizierung fehlgeschlagen");
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setClassBusyId(null);
    }
  }

  async function setTaxKind(docId: number, taxKind: "bank" | "normal") {
    await patchTaxClass(docId, { taxKind, category: "Steuern" });
  }

  async function moveToCategory(docId: number, nextCategory: string) {
    if (!nextCategory || nextCategory === "Steuern") return;
    await patchTaxClass(docId, { category: nextCategory });
  }

  async function exportSelected() {
    const documentIds = Array.from(selectedIds);
    if (documentIds.length === 0 || exportBusy || !isSteuern) return;
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

  function renderDoc(doc: KnowledgeDocItem) {
    const busy = classBusyId === doc.id || pending;
    return (
      <li key={doc.id} className="px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-start gap-3">
          {isSteuern ? (
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0 accent-[var(--brand-docs)]"
              checked={selectedIds.has(doc.id)}
              onChange={() => toggleSelected(doc.id)}
              aria-label="Beleg auswählen"
            />
          ) : null}
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
            <RecipientAvatars recipients={doc.recipients} size="xs" />
            {doc.short_summary ? (
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {doc.short_summary}
              </p>
            ) : null}
            {isSteuern ? (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {doc.isBank ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void setTaxKind(doc.id, "normal")}
                  >
                    Als normalen Steuerbeleg
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void setTaxKind(doc.id, "bank")}
                  >
                    Als Bankbeleg
                  </Button>
                )}
                <label className="sr-only" htmlFor={`cat-${doc.id}`}>
                  Rubrik wechseln
                </label>
                <select
                  id={`cat-${doc.id}`}
                  className="h-6 max-w-[11rem] rounded-md border border-border bg-background px-1.5 text-xs text-muted-foreground disabled:opacity-50"
                  disabled={busy}
                  defaultValue=""
                  onChange={(e) => {
                    const next = e.target.value;
                    e.target.value = "";
                    if (next) void moveToCategory(doc.id, next);
                  }}
                >
                  <option value="" disabled>
                    Rubrik wechseln…
                  </option>
                  {areaNames
                    .filter((name) => name !== category)
                    .map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                </select>
              </div>
            ) : null}
          </div>
        </div>
      </li>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title={category}
        description={
          description
            ? `${total} Dokumente · ${description}`
            : `${total} Dokumente · nach Jahr und Familienmitglied`
        }
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
          href={`/documents?category=${encodeURIComponent(category)}`}
          className="text-muted-foreground underline-offset-2 hover:underline"
        >
          Flache Liste
        </Link>
      </div>

      {isSteuern ? (
        <p className="text-xs text-muted-foreground">
          Bankbelege erscheinen unter dem Familienmitglied nach Konto. Falsch
          erkannte Bank-/Steuer-Zuordnung: «Als Bankbeleg» / «Als normalen
          Steuerbeleg». Belege, die gar nicht nach Steuern gehören: Rubrik
          wechseln.
        </p>
      ) : null}

      {filterMembers.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className={cn(
              "h-auto rounded-full px-3 py-1.5 text-sm",
              memberFilter == null &&
                "border-[var(--brand-docs)] bg-[var(--brand-docs-soft)] text-[var(--brand-docs)] hover:bg-[var(--brand-docs-soft)]"
            )}
            onClick={() => setMemberFilter(null)}
          >
            Alle
          </Button>
          {filterMembers.map((m) => (
            <Button
              key={m.id}
              type="button"
              variant="outline"
              className={cn(
                "h-auto rounded-full px-3 py-1.5 text-sm",
                memberFilter === m.id &&
                  "border-[var(--brand-docs)] bg-[var(--brand-docs-soft)] text-[var(--brand-docs)] hover:bg-[var(--brand-docs-soft)]"
              )}
              onClick={() =>
                setMemberFilter((prev) => (prev === m.id ? null : m.id))
              }
            >
              <UserAvatar name={m.display_name} src={m.avatar_url} size="xs" />
              {m.display_name}
            </Button>
          ))}
        </div>
      ) : null}

      {isSteuern && selectedIds.size > 0 ? (
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
        </div>
      ) : null}

      {exportError ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">{exportError}</p>
      ) : null}

      {filteredGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Keine Dokumente in dieser Rubrik
          {memberFilter != null ? " für dieses Familienmitglied" : ""}.
        </p>
      ) : (
        <div className="space-y-3">
          {filteredGroups.map((group) => {
            const yKey = yearKey(group.year);
            const yearOpen = openYears.has(yKey);
            const yearSelected = group.documents.filter((d) =>
              selectedIds.has(d.id)
            ).length;
            const allYearSelected =
              group.documents.length > 0 &&
              yearSelected === group.documents.length;

            return (
              <section
                key={yKey}
                className="overflow-hidden rounded-2xl border border-border/70 bg-card"
              >
                <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 sm:px-4">
                  {isSteuern ? (
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
                      onChange={() => toggleDocsSelection(group.documents)}
                      aria-label={`${group.label} auswählen`}
                    />
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto min-w-0 flex-1 items-center justify-between gap-3 px-0 py-1 text-left font-normal"
                    onClick={() => toggleYear(yKey)}
                    aria-expanded={yearOpen}
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
                          {group.documents.length === 1
                            ? "Dokument"
                            : "Dokumente"}
                          {yearSelected > 0
                            ? ` · ${yearSelected} markiert`
                            : ""}
                        </span>
                      </span>
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform",
                        yearOpen && "rotate-180"
                      )}
                    />
                  </Button>
                </div>

                {yearOpen ? (
                  <div className="space-y-2 p-2 sm:p-3">
                    {group.memberGroups.map((mg) => {
                      const mKey = memberOpenKey(group.year, mg.memberKey);
                      const memberOpen =
                        openMembers.has(mKey) ||
                        group.memberGroups.length === 1;
                      return (
                        <section
                          key={mg.memberKey}
                          className="overflow-hidden rounded-xl border border-border/50 bg-muted/10"
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-auto w-full items-center justify-between gap-3 rounded-none px-3 py-2 text-left font-normal"
                            onClick={() => toggleMember(mKey)}
                            aria-expanded={memberOpen}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              {mg.avatarUrl || mg.memberId != null ? (
                                <UserAvatar
                                  name={mg.label}
                                  src={mg.avatarUrl}
                                  size="xs"
                                />
                              ) : null}
                              <span className="min-w-0">
                                <span className="block text-sm font-medium">
                                  {mg.label}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {mg.documents.length}{" "}
                                  {mg.documents.length === 1
                                    ? "Dokument"
                                    : "Dokumente"}
                                </span>
                              </span>
                            </span>
                            <ChevronDown
                              className={cn(
                                "size-4 shrink-0 text-muted-foreground transition-transform",
                                memberOpen && "rotate-180"
                              )}
                            />
                          </Button>
                          {memberOpen ? (
                            <div className="space-y-2 border-t border-border/50 bg-card/60 p-2">
                              {isSteuern && mg.bankAccountGroups.length > 0 ? (
                                <div className="space-y-2">
                                  <p className="px-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
                                    Bankbelege
                                  </p>
                                  {mg.bankAccountGroups.map((ag) => (
                                    <section
                                      key={ag.accountKey}
                                      className="overflow-hidden rounded-lg border border-border/40"
                                    >
                                      <div className="bg-muted/30 px-3 py-1.5 text-sm font-medium">
                                        {ag.label}
                                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                                          {ag.documents.length}
                                        </span>
                                      </div>
                                      <ul className="divide-y divide-border/50">
                                        {ag.documents.map(renderDoc)}
                                      </ul>
                                    </section>
                                  ))}
                                </div>
                              ) : null}
                              {isSteuern && mg.otherDocuments.length > 0 ? (
                                <div className="space-y-1">
                                  {mg.bankAccountGroups.length > 0 ? (
                                    <p className="px-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
                                      Weitere Steuerbelege
                                    </p>
                                  ) : null}
                                  <ul className="divide-y divide-border/50 rounded-lg border border-border/40">
                                    {mg.otherDocuments.map(renderDoc)}
                                  </ul>
                                </div>
                              ) : null}
                              {!isSteuern ||
                              (mg.bankAccountGroups.length === 0 &&
                                mg.otherDocuments.length === 0) ? (
                                <ul className="divide-y divide-border/50 rounded-lg border border-border/40">
                                  {mg.documents.map(renderDoc)}
                                </ul>
                              ) : null}
                            </div>
                          ) : null}
                        </section>
                      );
                    })}
                  </div>
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
