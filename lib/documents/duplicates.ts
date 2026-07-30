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
  /** Document / invoice number included in the match key. */
  refNumber: string | null;
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
 * Extract a Beleg-/Rechnungsnummer from title (preferred) or fallback text.
 * Returns digits only, or null if none found.
 */
export function extractDocumentRefNumber(
  title: string | null | undefined,
  fallback?: string | null | undefined
): string | null {
  for (const raw of [title, fallback]) {
    if (!raw?.trim()) continue;
    const text = raw.trim();

    const labeled =
      /\b(?:rechnungs(?:nr|nummer)|beleg(?:nr|nummer)|dokument(?:nr|nummer)|invoice|inv|nr|no|nummer)[\s.:#/-]*([0-9][0-9\s./-]{3,})\b/i.exec(
        text
      );
    if (labeled?.[1]) {
      const digits = labeled[1].replace(/\D/g, "");
      if (digits.length >= 4) return digits;
    }

    const hash = /#\s*([0-9]{5,})\b/.exec(text);
    if (hash?.[1]) return hash[1];

    // Bare long digit runs — skip calendar-ish yyyymmdd / years alone.
    for (const m of text.matchAll(/\b(\d{6,})\b/g)) {
      const d = m[1];
      if (/^(19|20)\d{6}$/.test(d)) continue;
      if (/^(19|20)\d{2}$/.test(d)) continue;
      return d;
    }
  }
  return null;
}

/**
 * Find clusters of likely duplicates.
 * When a Belegnummer is present (title preferred), description AND number
 * must both match — same summary with different Nr. is not a duplicate.
 * Without a number: short/generic texts need the same calendar day;
 * longer summaries may still group by description alone.
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

  type Bucket = {
    matchedByDate: boolean;
    refNumber: string | null;
    documents: DuplicateDocItem[];
  };
  const groups = new Map<string, Bucket>();

  for (const row of rows) {
    const descKey = normalizeDuplicateDescription(row.short_summary);
    if (!descKey) continue;

    const refNumber = extractDocumentRefNumber(row.title, row.short_summary);
    const dateKey = documentDateKey(row.created_date);
    const isSpecific = descKey.length >= DUPLICATE_SPECIFIC_MIN_LENGTH;

    let groupKey: string;
    let matchedByDate = false;

    if (refNumber) {
      // Beschreibung + Nummer must both match.
      groupKey = `d:${descKey}|n:${refNumber}`;
    } else if (!isSpecific) {
      // Generic short text without number: only with same calendar day.
      if (!dateKey) continue;
      groupKey = `d:${descKey}|t:${dateKey}`;
      matchedByDate = true;
    } else {
      // Specific summary, no number in title/summary — description only.
      groupKey = `d:${descKey}`;
    }

    const bucket = groups.get(groupKey) || {
      matchedByDate,
      refNumber,
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
    const base =
      bucket.documents[0]?.short_summary?.trim() ||
      bucket.documents[0]?.title?.trim() ||
      key;
    const description = bucket.refNumber
      ? `${base} · Nr. ${bucket.refNumber}`
      : base;
    clusters.push({
      key,
      description,
      count: bucket.documents.length,
      matchedByDate: bucket.matchedByDate,
      refNumber: bucket.refNumber,
      documents: bucket.documents,
    });
  }

  clusters.sort(
    (a, b) => b.count - a.count || a.description.localeCompare(b.description)
  );
  return clusters.slice(0, Math.max(1, Math.min(limit, 200)));
}
