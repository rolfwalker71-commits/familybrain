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
  /** Always true — clusters require identical calendar day. */
  matchedByDate: boolean;
  /** Document / invoice number if present in the title (informational). */
  refNumber: string | null;
  documents: DuplicateDocItem[];
};

/** @deprecated kept for tests — title+date matching no longer uses this threshold. */
export const DUPLICATE_SPECIFIC_MIN_LENGTH = 40;

function aiIconPublicUrl(aiIconPath: string | null | undefined): string | null {
  if (!aiIconPath) return null;
  const base = aiIconPath.replace(/^.*[/\\]/, "").trim();
  if (!base || base.includes("..")) return null;
  return `/api/documents/media/ai-icon/${encodeURIComponent(base)}`;
}

/** Normalize title/description for exact duplicate grouping. */
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

export const normalizeDuplicateTitle = normalizeDuplicateDescription;

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

    for (const m of text.matchAll(/\b(\d{6,})\b/g)) {
      const d = m[1];
      if (/^(19|20)\d{6}$/.test(d)) continue;
      if (/^(19|20)\d{2}$/.test(d)) continue;
      return d;
    }
  }
  return null;
}

type RawDupRow = {
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
};

/**
 * Duplicate = identical document name (title) AND identical calendar date.
 * Different years / different titles are never one cluster, even if the
 * AI short_summary is the same generic sentence.
 */
export function clusterDocumentsByTitleAndDate(
  rows: RawDupRow[]
): DuplicateCluster[] {
  type Bucket = {
    nameKey: string;
    dateKey: string;
    displayTitle: string;
    refNumber: string | null;
    documents: DuplicateDocItem[];
  };
  const groups = new Map<string, Bucket>();

  for (const row of rows) {
    const dateKey = documentDateKey(row.created_date);
    if (!dateKey) continue;

    const titleKey = normalizeDuplicateTitle(row.title);
    const summaryKey = normalizeDuplicateDescription(row.short_summary);
    // Name = title when present; only fall back to summary if title is empty.
    const nameKey = titleKey.length >= 2 ? titleKey : summaryKey;
    if (nameKey.length < 2) continue;

    const groupKey = `name:${nameKey}|date:${dateKey}`;
    const refNumber = extractDocumentRefNumber(row.title, row.short_summary);
    const displayTitle =
      row.title?.trim() || row.short_summary?.trim() || nameKey;

    const bucket = groups.get(groupKey) || {
      nameKey,
      dateKey,
      displayTitle,
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
    bucket.documents.sort((a, b) => b.id - a.id);
    const dateLabel = bucket.dateKey.split("-").reverse().join(".");
    const description = `${bucket.displayTitle} · ${dateLabel}`;
    clusters.push({
      key,
      description,
      count: bucket.documents.length,
      matchedByDate: true,
      refNumber: bucket.refNumber,
      documents: bucket.documents,
    });
  }

  clusters.sort(
    (a, b) => b.count - a.count || a.description.localeCompare(b.description)
  );
  return clusters;
}

/** Load analyzed docs and cluster by title + date. */
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
         AND (
           NULLIF(TRIM(COALESCE(d.title, '')), '') IS NOT NULL
           OR NULLIF(TRIM(COALESCE(s.short_summary, '')), '') IS NOT NULL
         )
       ORDER BY d.id ASC`
    )
    .all() as RawDupRow[];

  return clusterDocumentsByTitleAndDate(rows).slice(
    0,
    Math.max(1, Math.min(limit, 200))
  );
}
