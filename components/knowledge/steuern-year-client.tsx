"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
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

  function toggle(key: string) {
    setOpenYears((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine analysierten Steuerbelege.
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const key = group.taxYear == null ? "null" : String(group.taxYear);
            const open = openYears.has(key);
            return (
              <section
                key={key}
                className="overflow-hidden rounded-2xl border border-border/70 bg-card"
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  onClick={() => toggle(key)}
                  aria-expanded={open}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <IconCircle icon={visual.icon} tone={visual.tone} size="sm" />
                    <span className="min-w-0">
                      <span className="block font-semibold">{group.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {group.documents.length}{" "}
                        {group.documents.length === 1 ? "Beleg" : "Belege"}
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
                {open ? (
                  <ul className="divide-y divide-border/60 border-t border-border/60">
                    {group.documents.map((doc) => (
                      <li key={doc.id} className="px-4 py-3">
                        <div className="flex min-w-0 items-start gap-3">
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
