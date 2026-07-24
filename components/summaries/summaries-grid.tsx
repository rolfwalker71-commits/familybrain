"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CardGrid } from "@/components/layout/page-primitives";
import {
  DocumentInfoButton,
  DocumentTitleLink,
} from "@/components/documents/document-link";
import { toSwissDate } from "@/lib/utils/dates";

export type SummaryCardRow = {
  document_id: number;
  title: string | null;
  category: string | null;
  short_summary: string | null;
  correspondent_name: string | null;
  created_date: string | null;
  analyzed_at: string | null;
  confidence: number | null;
};

export function SummariesGrid({ rows }: { rows: SummaryCardRow[] }) {
  return (
    <CardGrid cols={2}>
      {rows.map((row) => (
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
              {row.correspondent_name || "–"} · {toSwissDate(row.created_date)}
              {row.confidence != null
                ? ` · ${Math.round(row.confidence * 100)}%`
                : ""}
            </div>
          </CardContent>
        </Card>
      ))}
    </CardGrid>
  );
}
