import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getKnowledgeAreaCounts } from "@/lib/db/queries";
import { CardGrid, PageHeader } from "@/components/layout/page-primitives";
import {
  IconCircle,
  knowledgeVisual,
  pageVisuals,
} from "@/components/layout/icon-circle";

export const dynamic = "force-dynamic";

export default function KnowledgePage() {
  const areas = getKnowledgeAreaCounts();

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Wissen"
        description="Automatisch klassifizierte Lebensbereiche"
        icon={pageVisuals.knowledge.icon}
        tone={pageVisuals.knowledge.tone}
      />

      <CardGrid cols={3}>
        {areas.map((area) => {
          const visual = knowledgeVisual(area.name);
          return (
            <Link
              key={area.name}
              href={`/documents?category=${encodeURIComponent(area.name)}`}
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
