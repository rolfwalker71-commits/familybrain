import { getDb } from "@/lib/db/client";

export type EmbeddingBucketCounts = {
  indexed: number;
  pending: number;
  error: number;
  stale: number;
  /** Empty/protected etc. — terminal, not a backlog item. */
  skipped: number;
  other: number;
  /** Eligible entries that can/should be in the vector index */
  eligible: number;
};

function emptyBuckets(): EmbeddingBucketCounts {
  return {
    indexed: 0,
    pending: 0,
    error: 0,
    stale: 0,
    skipped: 0,
    other: 0,
    eligible: 0,
  };
}

function accumulateStatus(
  buckets: EmbeddingBucketCounts,
  status: string | null | undefined,
  count: number
) {
  const key = (status || "pending").toLowerCase();
  if (key === "indexed") buckets.indexed += count;
  else if (key === "pending" || key === "indexing" || key === "null")
    buckets.pending += count;
  else if (key === "error") buckets.error += count;
  else if (key === "stale") buckets.stale += count;
  else if (key === "skipped") buckets.skipped += count;
  else buckets.other += count;
}

/** Local SQLite embedding_status breakdown for vector sources. */
export function getLocalEmbeddingStats(): {
  paperless: EmbeddingBucketCounts;
  trilium: EmbeddingBucketCounts;
  guides: EmbeddingBucketCounts;
} {
  const db = getDb();

  const paperless = emptyBuckets();
  const paperlessRows = db
    .prepare(
      `SELECT COALESCE(s.embedding_status, 'pending') as status, COUNT(*) as count
       FROM document_summaries s
       JOIN paperless_documents d ON d.id = s.document_id
       WHERE s.analysis_status = 'completed'
         AND COALESCE(d.sync_status, 'synced') != 'missing'
         AND (
           NULLIF(TRIM(COALESCE(s.short_summary, '')), '') IS NOT NULL
           OR NULLIF(TRIM(COALESCE(d.content, '')), '') IS NOT NULL
         )
       GROUP BY COALESCE(s.embedding_status, 'pending')`
    )
    .all() as Array<{ status: string; count: number }>;
  for (const row of paperlessRows) {
    paperless.eligible += row.count;
    accumulateStatus(paperless, row.status, row.count);
  }

  const trilium = emptyBuckets();
  const triliumRows = db
    .prepare(
      `SELECT COALESCE(embedding_status, 'pending') as status, COUNT(*) as count
       FROM trilium_notes
       WHERE sync_status = 'synced'
       GROUP BY COALESCE(embedding_status, 'pending')`
    )
    .all() as Array<{ status: string; count: number }>;
  for (const row of triliumRows) {
    trilium.eligible += row.count;
    accumulateStatus(trilium, row.status, row.count);
  }

  const guides = emptyBuckets();
  const guideRows = db
    .prepare(
      `SELECT COALESCE(embedding_status, 'pending') as status, COUNT(*) as count
       FROM knowledge_guides
       GROUP BY COALESCE(embedding_status, 'pending')`
    )
    .all() as Array<{ status: string; count: number }>;
  for (const row of guideRows) {
    guides.eligible += row.count;
    accumulateStatus(guides, row.status, row.count);
  }

  return { paperless, trilium, guides };
}
