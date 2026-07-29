"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CardGrid, PageHeader } from "@/components/layout/page-primitives";
import {
  ListSortControl,
  useListSortDir,
} from "@/components/layout/list-sort-control";
import { pageVisuals } from "@/components/layout/icon-circle";
import {
  DocumentInfoButton,
  DocumentTitleLink,
} from "@/components/documents/document-link";
import { toSwissDate } from "@/lib/utils/dates";
import { compareNullableDate } from "@/lib/utils/list-sort";

export type SummaryCardRow = {
  document_id: number;
  title: string | null;
  category: string | null;
  short_summary: string | null;
  correspondent_name: string | null;
  created_date: string | null;
  analyzed_at: string | null;
  confidence: number | null;
  ai_icon_url?: string | null;
};

export function SummariesClient({ rows }: { rows: SummaryCardRow[] }) {
  const [sortDir, setSortDir] = useListSortDir("summaries", "desc");
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        compareNullableDate(a.analyzed_at, b.analyzed_at, sortDir)
      ),
    [rows, sortDir]
  );

  return (
    <div className="min-w-0 space-y-4 pb-6 md:space-y-6">
      <PageHeader
        title="Zusammenfassungen"
        description="Alle analysierten Dokumente im Überblick"
        icon={pageVisuals.summaries.icon}
        tone={pageVisuals.summaries.tone}
        actions={
          <ListSortControl
            storageKey="summaries"
            label="Analysedatum"
            defaultDir="desc"
            dir={sortDir}
            onDirChange={setSortDir}
          />
        }
      />

      {sorted.length === 0 ? (
        <Card className="border-border/60 shadow-[0_4px_16px_rgba(20,32,28,0.05)]">
          <CardContent className="py-8 text-sm text-muted-foreground">
            Noch keine Zusammenfassungen. Analysiere Dokumente unter
            „Dokumente“.
          </CardContent>
        </Card>
      ) : (
        <CardGrid cols={2}>
          {sorted.map((row) => (
            <Card
              key={row.document_id}
              className="flex h-full min-w-0 flex-col overflow-hidden border-border/60 shadow-[0_4px_16px_rgba(20,32,28,0.05)]"
            >
              <CardContent className="flex h-full min-w-0 flex-col gap-3 py-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <DocumentTitleLink
                    documentId={row.document_id}
                    title={row.title}
                    className="min-w-0 flex-1"
                    aiIconUrl={row.ai_icon_url}
                    category={row.category}
                    showIcon
                    iconSize="sm"
                  />
                  <div className="flex shrink-0 items-center gap-2">
                    {row.category ? (
                      <Badge
                        variant="secondary"
                        className="max-w-[8rem] truncate"
                        title={row.category}
                      >
                        {row.category}
                      </Badge>
                    ) : null}
                    <DocumentInfoButton documentId={row.document_id} />
                  </div>
                </div>
                <p className="line-clamp-3 flex-1 text-sm text-muted-foreground">
                  {row.short_summary || "Keine Kurzfassung"}
                </p>
                <div className="truncate text-xs text-muted-foreground">
                  {row.correspondent_name || "–"} ·{" "}
                  {toSwissDate(row.created_date)}
                  {row.confidence != null
                    ? ` · ${Math.round(row.confidence * 100)}%`
                    : ""}
                </div>
              </CardContent>
            </Card>
          ))}
        </CardGrid>
      )}
    </div>
  );
}

/** @deprecated Prefer SummariesClient */
export function SummariesGrid({ rows }: { rows: SummaryCardRow[] }) {
  return <SummariesClient rows={rows} />;
}
