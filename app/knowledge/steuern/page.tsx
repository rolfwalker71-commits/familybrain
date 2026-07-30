import { listSteuernDocumentsByYear } from "@/lib/db/queries";
import { SteuernYearClient } from "@/components/knowledge/steuern-year-client";

export const dynamic = "force-dynamic";

export default function KnowledgeSteuernPage() {
  const groups = listSteuernDocumentsByYear();
  return <SteuernYearClient groups={groups} />;
}
