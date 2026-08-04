import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getKnowledgeAreaCounts } from "@/lib/db/queries";
import { CardGrid, PageHeader } from "@/components/layout/page-primitives";
import {
  IconCircle,
  knowledgeVisual,
  pageVisuals,
} from "@/components/layout/icon-circle";
import { ensureInitialized } from "@/lib/db/migrations";
import { ensureBuiltinKnowledgeAreas } from "@/lib/knowledge/areas";
import { maybeRemapKnowledgeCategoriesOnce } from "@/lib/documents/category-remap";

export const dynamic = "force-dynamic";

export default function KnowledgePage() {
  ensureInitialized();
  ensureBuiltinKnowledgeAreas();
  maybeRemapKnowledgeCategoriesOnce();
  const areas = getKnowledgeAreaCounts();

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Wissen"
        description="Automatisch klassifizierte Lebensbereiche aus deinen Dokumenten"
        icon={pageVisuals.knowledge.icon}
        tone={pageVisuals.knowledge.tone}
      />

      {areas.length === 0 || areas.every((a) => a.document_count === 0) ? (
        <Card className="border-dashed">
          <CardContent className="space-y-3 p-6 text-center">
            <p className="text-base font-medium">Noch kein Wissen aufgebaut</p>
            <p className="text-sm text-muted-foreground">
              Synchronisiere Paperless und starte die Analyse — danach erscheinen
              Rubriken wie Steuern, Gesundheit oder Reisen.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                href="/sync"
                className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-accent"
              >
                Zu Sync
              </Link>
              <Link
                href="/documents?analysisStatus=pending"
                className="inline-flex h-9 items-center rounded-md bg-[var(--brand-docs)] px-4 text-sm font-medium text-white hover:bg-[var(--brand-docs)]/90"
              >
                Ausstehende Analysen
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <CardGrid cols={3}>
        {areas.map((area) => {
          const visual = knowledgeVisual(area.name);
          return (
            <Link
              key={area.name}
              href={`/knowledge/${encodeURIComponent(area.name)}`}
              className="min-w-0"
            >
              <Card
                tone={visual.tone}
                className="flex h-full min-w-0 flex-col overflow-hidden transition-colors hover:border-primary/40"
              >
                <CardHeader tone={visual.tone} className="min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle
                      className="min-w-0 break-words text-base"
                      title={area.name}
                    >
                      {area.name}
                    </CardTitle>
                    <IconCircle icon={visual.icon} tone={visual.tone} />
                  </div>
                </CardHeader>
                <CardContent className="min-w-0 flex-1">
                  <div className="text-2xl font-semibold tabular-nums">
                    {area.document_count}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {area.description}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </CardGrid>
    </div>
  );
}
