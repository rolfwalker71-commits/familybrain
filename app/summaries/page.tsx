import { listSummaries } from "@/lib/db/queries";
import {
  SummariesClient,
  type SummaryCardRow,
} from "@/components/summaries/summaries-grid";

export const dynamic = "force-dynamic";

export default function SummariesPage() {
  const rows = listSummaries() as SummaryCardRow[];
  return <SummariesClient rows={rows} />;
}
