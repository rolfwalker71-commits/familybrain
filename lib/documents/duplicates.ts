import { getDb } from "@/lib/db/client";

export type DuplicateDocItem = {
  id: number;
  paperless_id: number;
  title: string | null;
  correspondent_name: string | null;
  created_date: string | null;
  short_summary: string | null;
  category: string | null;
  analysis_status: string | null;
  content_hash: string | null;
  paperless_url: string | null;
  ai_icon_url: string | null;
};

export type DuplicateCluster = {
  key: string;
  description: string;
  count: number;
  /** True when cluster was narrowed by matching created_date as well. */
  matchedByDate: boolean;
  documents: DuplicateDocItem[];
};

/** Below this length, identical short_summary alone is too generic — also require same date. */
export const DUPLICATE_SPECIFIC_MIN_LENGTH = 40;

function aiIconPublicUrl(aiIconPath: string | null | undefined): string | null {
  if (!aiIconPath) return null;
  const base = aiIconPath.replace(/^.*[/\\]/, "").trim();
  if (!base || base.includes("..")) return null;
  return `/api/documents/media/ai-icon/${encodeURIComponent(base)}`;
}

/** Normalize description for exact duplicate grouping. */
export function normalizeDuplicateDescription(
  raw: string | null | undefined
): string {
  return (raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

/** YYYY-MM-DD from created_date (or empty if unknown). */
export function documentDateKey(createdDate: string | null | undefined): string {
  const raw = (createdDate || "").trim();
  if (!raw) return "";
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  return m?.[1] || "";
}

/**
 * Find clusters with identical normalized short_summary.
 * Short/generic descriptions (< 40 chars) only count as duplicates when the
 * document date (day) is also identical.
 */
export function findDuplicateClustersByDescription(limit = 80): DuplicateCluster[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT d.id, d.paperless_id, d.title, d.correspondent_name, d.created_date,
              d.content_hash, d.paperless_url, d.ai_icon_path,
              s.short_summary, s.category, s.analysis_status
       FROM paperless_documents d
       INNER JOIN document_summaries s ON s.document_id = d.id
       WHERE COALESCE(d.sync_status, 'synced') != 'missing'
         AND s.analysis_status = 'completed'
         AND NULLIF(TRIM(COALESCE(s.short_summary, '')), '') IS NOT NULL
       ORDER BY d.id ASC`
    )
    .all() as Array<{
    id: number;
    paperless_id: number;
    title: string | null;
    correspondent_name: string | null;
    created_date: string | null;
    content_hash: string | null;
    paperless_url: string | null;
    ai_icon_path: string | null;
    short_summary: string | null;
    category: string | null;
    analysis_status: string | null;
  }>;

  type Bucket = { matchedByDate: boolean; documents: DuplicateDocItem[] };
  const groups = new Map<string, Bucket>();

  for (const row of rows) {
    const descKey = normalizeDuplicateDescription(row.short_summary);
    if (!descKey) continue;

    const dateKey = documentDateKey(row.created_date);
    const isSpecific = descKey.length >= DUPLICATE_SPECIFIC_MIN_LENGTH;

    // Generic short text (e.g. «Prämienrechnung»): only with same calendar day.
    if (!isSpecific) {
      if (!dateKey) continue;
    }

    const groupKey = isSpecific ? `d:${descKey}` : `d:${descKey}|t:${dateKey}`;
    const bucket = groups.get(groupKey) || {
      matchedByDate: !isSpecific,
      documents: [],
    };
    bucket.documents.push({
      id: row.id,
      paperless_id: row.paperless_id,
      title: row.title,
      correspondent_name: row.correspondent_name,
      created_date: row.created_date,
      short_summary: row.short_summary,
      category: row.category,
      analysis_status: row.analysis_status,
      content_hash: row.content_hash,
      paperless_url: row.paperless_url,
      ai_icon_url: aiIconPublicUrl(row.ai_icon_path),
    });
    groups.set(groupKey, bucket);
  }

  const clusters: DuplicateCluster[] = [];
  for (const [key, bucket] of groups) {
    if (bucket.documents.length < 2) continue;
    bucket.documents.sort((a, b) => {
      const da = a.created_date || "";
      const db_ = b.created_date || "";
      if (da !== db_) return db_.localeCompare(da);
      return b.id - a.id;
    });
    clusters.push({
      key,
      description: bucket.documents[0]?.short_summary?.trim() || key,
      count: bucket.documents.length,
      matchedByDate: bucket.matchedByDate,
      documents: bucket.documents,
    });
  }

  clusters.sort(
    (a, b) => b.count - a.count || a.description.localeCompare(b.description)
  );
  return clusters.slice(0, Math.max(1, Math.min(limit, 200)));
}
