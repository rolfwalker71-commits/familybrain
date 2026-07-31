import { notFound } from "next/navigation";
import { KNOWLEDGE_AREAS } from "@/lib/extraction/categories";
import { listKnowledgeDocumentsGrouped } from "@/lib/knowledge/browse";
import { KnowledgeBrowseClient } from "@/components/knowledge/knowledge-browse-client";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ area: string }>;
};

export default async function KnowledgeAreaPage({ params }: Props) {
  const { area: raw } = await params;
  const areaName = decodeURIComponent(raw);
  const area = KNOWLEDGE_AREAS.find((a) => a.name === areaName);
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
