import { notFound } from "next/navigation";
import { getKnowledgeAreaByName } from "@/lib/knowledge/areas";
import { listKnowledgeDocumentsGrouped } from "@/lib/knowledge/browse";
import { KnowledgeBrowseClient } from "@/components/knowledge/knowledge-browse-client";
import { ensureInitialized } from "@/lib/db/migrations";
import { ensureBuiltinKnowledgeAreas } from "@/lib/knowledge/areas";
import { maybeRemapKnowledgeCategoriesOnce } from "@/lib/documents/category-remap";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ area: string }>;
};

export default async function KnowledgeAreaPage({ params }: Props) {
  ensureInitialized();
  ensureBuiltinKnowledgeAreas();
  maybeRemapKnowledgeCategoriesOnce();

  const { area: raw } = await params;
  const areaName = decodeURIComponent(raw);
  const area = getKnowledgeAreaByName(areaName);
  if (!area) notFound();

  const { groups, filterMembers } = listKnowledgeDocumentsGrouped(area.name);

  return (
    <KnowledgeBrowseClient
      category={area.name}
      description={area.description}
      groups={groups}
      filterMembers={filterMembers}
    />
  );
}
