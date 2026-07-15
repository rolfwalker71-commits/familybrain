import { Card, CardContent } from "@/components/ui/card";
import { listSummaries } from "@/lib/db/queries";
import { PageHeader } from "@/components/layout/page-primitives";
import { pageVisuals } from "@/components/layout/icon-circle";
import {
  SummariesGrid,
  type SummaryCardRow,
} from "@/components/summaries/summaries-grid";

export const dynamic = "force-dynamic";

export default function SummariesPage() {
  const rows = listSummaries() as SummaryCardRow[];

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Zusammenfassungen"
        description="Alle analysierten Dokumente im Überblick"
        icon={pageVisuals.summaries.icon}
        tone={pageVisuals.summaries.tone}
      />

      {rows.length === 0 ? (
        <Card className="border-border/80 shadow-sm">
          <CardContent className="py-8 text-sm text-muted-foreground">
            Noch keine Zusammenfassungen. Analysiere Dokumente unter „Dokumente“.
          </CardContent>
        </Card>
      ) : (
        <SummariesGrid rows={rows} />
      )}
    </div>
  );
}
