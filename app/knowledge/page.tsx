import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getKnowledgeAreaCounts } from "@/lib/db/queries";
import { CardGrid, PageHeader } from "@/components/layout/page-primitives";

export const dynamic = "force-dynamic";

export default function KnowledgePage() {
  const areas = getKnowledgeAreaCounts();

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Wissensbereiche"
        description="Automatisch klassifizierte Lebensbereiche"
      />

      <CardGrid cols={3}>
        {areas.map((area) => (
          <Link
            key={area.name}
            href={`/documents?category=${encodeURIComponent(area.name)}`}
            className="min-w-0"
          >
            <Card className="flex h-full min-w-0 flex-col overflow-hidden border-border/80 shadow-sm transition-colors hover:bg-muted/40">
              <CardHeader className="min-w-0 pb-2">
                <CardTitle className="truncate text-base" title={area.name}>
                  {area.name}
                </CardTitle>
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
        ))}
      </CardGrid>
    </div>
  );
}
