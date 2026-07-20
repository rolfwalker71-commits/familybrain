import { getDb } from "./client";
import { getSetting, setSetting } from "./migrations";
import { daysFromNow, currentYear, nowIso } from "@/lib/utils/dates";
import {
  aggregateByMappedLabel,
  financeBucket,
  TRAVEL_TYPES,
  type TravelTypeCanonical,
} from "@/lib/extraction/normalize-categories";
import {
  applyTravelTypeRuleToMatchingItems,
  suggestTravelLearnMatch,
  upsertTravelTypeRule,
} from "@/lib/extraction/classification-rules";
import type { TriliumScopeKey } from "@/lib/trilium/constants";
import {
  TRILIUM_SCOPE_GESCHAEFTLICH_TITLE,
  TRILIUM_SCOPE_PRIVAT_TITLE,
} from "@/lib/trilium/constants";
import { hashContent } from "@/lib/utils/hash";

export type PaperlessDocumentRow = {
  id: number;
  paperless_id: number;
  title: string | null;
  content: string | null;
  content_hash: string | null;
  created_date: string | null;
  modified_at: string | null;
  added_at: string | null;
  document_type_id: number | null;
  document_type_name: string | null;
  correspondent_id: number | null;
  correspondent_name: string | null;
  original_file_name: string | null;
  archived_file_name: string | null;
  paperless_url: string | null;
  raw_metadata: string | null;
  sync_status: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
  category?: string | null;
  analysis_status?: string | null;
  short_summary?: string | null;
};

export type DocumentFilters = {
  search?: string;
  category?: string;
  correspondent?: string;
  documentType?: string;
  analysisStatus?: string;
  limit?: number;
  offset?: number;
};

export function getPaperlessSettings() {
  return {
    baseUrl: getSetting("paperless_base_url"),
    apiToken: getSetting("paperless_api_token"),
  };
}

export function getOpenAISettings() {
  return {
    apiKey: getSetting("openai_api_key"),
    model: getSetting("openai_model") || "gpt-4o-mini",
  };
}

export function getTriliumSettings() {
  return {
    baseUrl: getSetting("trilium_base_url"),
    apiToken: getSetting("trilium_etapi_token"),
    masterNoteId: getSetting("trilium_master_note_id"),
    privatNoteId: getSetting("trilium_scope_privat_note_id"),
    geschaeftlichNoteId: getSetting("trilium_scope_geschaeftlich_note_id"),
  };
}

export function isTriliumConfigured(): boolean {
  const settings = getTriliumSettings();
  return Boolean(
    settings.baseUrl &&
      settings.apiToken &&
      settings.privatNoteId &&
      settings.geschaeftlichNoteId
  );
}

export function savePaperlessSettings(baseUrl: string, apiToken: string | null) {
  const normalizedUrl = baseUrl.trim().replace(/\/$/, "");
  setSetting("paperless_base_url", normalizedUrl);
  if (apiToken !== null && apiToken.trim() !== "") {
    const normalizedToken = apiToken
      .trim()
      .replace(/^(Token|Bearer)\s+/i, "")
      .trim();
    setSetting("paperless_api_token", normalizedToken);
  }
}

export function saveOpenAISettings(apiKey: string | null, model: string | null) {
  if (apiKey !== null && apiKey.trim() !== "") {
    setSetting("openai_api_key", apiKey.trim());
  }
  if (model !== null && model.trim() !== "") {
    setSetting("openai_model", model.trim());
  }
}

export function saveTriliumSettings(input: {
  baseUrl?: string | null;
  apiToken?: string | null;
  masterNoteId?: string | null;
  privatNoteId?: string | null;
  geschaeftlichNoteId?: string | null;
}) {
  if (input.baseUrl !== undefined) {
    const normalized = input.baseUrl?.trim().replace(/\/$/, "") || null;
    setSetting("trilium_base_url", normalized);
  }
  if (input.apiToken !== undefined && input.apiToken?.trim()) {
    const normalized = input.apiToken
      .trim()
      .replace(/^(Bearer|Token)\s+/i, "")
      .trim();
    setSetting("trilium_etapi_token", normalized);
  }
  if (input.masterNoteId !== undefined) {
    setSetting("trilium_master_note_id", input.masterNoteId?.trim() || null);
  }
  if (input.privatNoteId !== undefined) {
    setSetting("trilium_scope_privat_note_id", input.privatNoteId?.trim() || null);
  }
  if (input.geschaeftlichNoteId !== undefined) {
    setSetting(
      "trilium_scope_geschaeftlich_note_id",
      input.geschaeftlichNoteId?.trim() || null
    );
  }
}

export function listDocuments(filters: DocumentFilters = {}) {
  const db = getDb();
  const where: string[] = [
    `COALESCE(d.sync_status, 'synced') != 'missing'`,
  ];
  const params: unknown[] = [];

  if (filters.search) {
    where.push(
      `(LOWER(COALESCE(d.title, '')) LIKE LOWER(?)
        OR LOWER(COALESCE(d.content, '')) LIKE LOWER(?)
        OR LOWER(COALESCE(d.correspondent_name, '')) LIKE LOWER(?)
        OR LOWER(COALESCE(d.document_type_name, '')) LIKE LOWER(?)
        OR LOWER(COALESCE(d.original_file_name, '')) LIKE LOWER(?)
        OR LOWER(COALESCE(s.category, '')) LIKE LOWER(?)
        OR LOWER(COALESCE(s.short_summary, '')) LIKE LOWER(?))`
    );
    const q = `%${filters.search}%`;
    params.push(q, q, q, q, q, q, q);
  }
  if (filters.category) {
    // Exact match on stored category; also accept common aliases via normalized compare in JS fallback not needed —
    // knowledge area links and AI saves use canonical German names.
    where.push(`s.category = ?`);
    params.push(filters.category);
  }
  if (filters.correspondent) {
    where.push(`d.correspondent_name = ?`);
    params.push(filters.correspondent);
  }
  if (filters.documentType) {
    where.push(`d.document_type_name = ?`);
    params.push(filters.documentType);
  }
  if (filters.analysisStatus) {
    if (filters.analysisStatus === "pending") {
      where.push(`(s.analysis_status IS NULL OR s.analysis_status = 'pending' OR s.analysis_status = 'stale')`);
    } else {
      where.push(`s.analysis_status = ?`);
      params.push(filters.analysisStatus);
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;

  const rows = db
    .prepare(
      `SELECT d.*, s.category, s.analysis_status, s.short_summary
       FROM paperless_documents d
       LEFT JOIN document_summaries s ON s.document_id = d.id
       ${whereSql}
       ORDER BY COALESCE(d.created_date, d.added_at, d.created_at) DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as PaperlessDocumentRow[];

  const countRow = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM paperless_documents d
       LEFT JOIN document_summaries s ON s.document_id = d.id
       ${whereSql}`
    )
    .get(...params) as { count: number };

  return { documents: rows, total: countRow.count };
}

export function getDocumentById(id: number) {
  const db = getDb();
  const document = db
    .prepare(`SELECT * FROM paperless_documents WHERE id = ?`)
    .get(id) as PaperlessDocumentRow | undefined;
  if (!document) return null;

  const tags = db
    .prepare(`SELECT tag_id, tag_name FROM document_tags WHERE document_id = ?`)
    .all(id) as { tag_id: number | null; tag_name: string | null }[];

  const summary = db
    .prepare(`SELECT * FROM document_summaries WHERE document_id = ?`)
    .get(id) as Record<string, unknown> | undefined;

  const warranties = db
    .prepare(`SELECT * FROM devices_and_warranties WHERE document_id = ?`)
    .all(id);
  const deadlines = db
    .prepare(`SELECT * FROM deadlines WHERE document_id = ? ORDER BY deadline_date`)
    .all(id);
  const financialItems = db
    .prepare(`SELECT * FROM financial_items WHERE document_id = ?`)
    .all(id);
  const travelItems = db
    .prepare(`SELECT * FROM travel_items WHERE document_id = ?`)
    .all(id);

  return { document, tags, summary, warranties, deadlines, financialItems, travelItems };
}

export function getDocumentByPaperlessId(paperlessId: number) {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM paperless_documents WHERE paperless_id = ?`)
    .get(paperlessId) as PaperlessDocumentRow | undefined;
}

export function upsertDocument(input: {
  paperless_id: number;
  title: string | null;
  content: string | null;
  content_hash: string;
  created_date: string | null;
  modified_at: string | null;
  added_at: string | null;
  document_type_id: number | null;
  document_type_name: string | null;
  correspondent_id: number | null;
  correspondent_name: string | null;
  original_file_name: string | null;
  archived_file_name: string | null;
  paperless_url: string | null;
  raw_metadata: string;
  tags: { id: number | null; name: string | null }[];
}): { id: number; changed: boolean; isNew: boolean } {
  const db = getDb();
  const existing = getDocumentByPaperlessId(input.paperless_id);
  const ts = nowIso();

  return db.transaction(() => {
    if (!existing) {
      const result = db
        .prepare(
          `INSERT INTO paperless_documents (
            paperless_id, title, content, content_hash, created_date, modified_at, added_at,
            document_type_id, document_type_name, correspondent_id, correspondent_name,
            original_file_name, archived_file_name, paperless_url, raw_metadata,
            sync_status, last_synced_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?, ?)`
        )
        .run(
          input.paperless_id,
          input.title,
          input.content,
          input.content_hash,
          input.created_date,
          input.modified_at,
          input.added_at,
          input.document_type_id,
          input.document_type_name,
          input.correspondent_id,
          input.correspondent_name,
          input.original_file_name,
          input.archived_file_name,
          input.paperless_url,
          input.raw_metadata,
          ts,
          ts,
          ts
        );
      const id = Number(result.lastInsertRowid);
      replaceTags(id, input.tags);
      ensurePendingSummary(id);
      return { id, changed: true, isNew: true };
    }

    const contentChanged = existing.content_hash !== input.content_hash;
    const metadataChanged =
      existing.modified_at !== input.modified_at ||
      existing.title !== input.title ||
      existing.document_type_name !== input.document_type_name ||
      existing.correspondent_name !== input.correspondent_name ||
      existing.sync_status === "missing";

    if (contentChanged || metadataChanged) {
      db.prepare(
        `UPDATE paperless_documents SET
          title = ?, content = ?, content_hash = ?, created_date = ?, modified_at = ?, added_at = ?,
          document_type_id = ?, document_type_name = ?, correspondent_id = ?, correspondent_name = ?,
          original_file_name = ?, archived_file_name = ?, paperless_url = ?, raw_metadata = ?,
          sync_status = 'synced', last_synced_at = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        input.title,
        input.content,
        input.content_hash,
        input.created_date,
        input.modified_at,
        input.added_at,
        input.document_type_id,
        input.document_type_name,
        input.correspondent_id,
        input.correspondent_name,
        input.original_file_name,
        input.archived_file_name,
        input.paperless_url,
        input.raw_metadata,
        ts,
        ts,
        existing.id
      );
      replaceTags(existing.id, input.tags);
      if (contentChanged || metadataChanged) {
        markSummaryStale(existing.id);
      }
      return { id: existing.id, changed: true, isNew: false };
    }

    db.prepare(
      `UPDATE paperless_documents SET last_synced_at = ?, sync_status = 'synced', updated_at = ? WHERE id = ?`
    ).run(ts, ts, existing.id);
    replaceTags(existing.id, input.tags);
    return { id: existing.id, changed: false, isNew: false };
  })();
}

function replaceTags(
  documentId: number,
  tags: { id: number | null; name: string | null }[]
) {
  const db = getDb();
  db.prepare(`DELETE FROM document_tags WHERE document_id = ?`).run(documentId);
  const insert = db.prepare(
    `INSERT INTO document_tags (document_id, tag_id, tag_name) VALUES (?, ?, ?)`
  );
  for (const tag of tags) {
    insert.run(documentId, tag.id, tag.name);
  }
}

function ensurePendingSummary(documentId: number) {
  const db = getDb();
  const existing = db
    .prepare(`SELECT id FROM document_summaries WHERE document_id = ?`)
    .get(documentId);
  if (existing) return;
  const ts = nowIso();
  db.prepare(
    `INSERT INTO document_summaries (document_id, analysis_status, created_at, updated_at)
     VALUES (?, 'pending', ?, ?)`
  ).run(documentId, ts, ts);
}

function markSummaryStale(documentId: number) {
  const db = getDb();
  const ts = nowIso();
  const existing = db
    .prepare(`SELECT id FROM document_summaries WHERE document_id = ?`)
    .get(documentId);
  if (!existing) {
    ensurePendingSummary(documentId);
    return;
  }
  db.prepare(
    `UPDATE document_summaries
     SET analysis_status = 'stale',
         analysis_attempts = 0,
         analysis_claimed_at = NULL,
         analysis_claim_hash = NULL,
         analysis_next_retry_at = NULL,
         analysis_last_error = NULL,
         updated_at = ?
     WHERE document_id = ?`
  ).run(ts, documentId);
}

export function listPendingDocumentIds(limit = 10): number[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT d.id
       FROM paperless_documents d
       LEFT JOIN document_summaries s ON s.document_id = d.id
       WHERE COALESCE(d.sync_status, 'synced') != 'missing'
         AND (
           s.analysis_status IS NULL
           OR (
             s.analysis_status IN ('pending', 'stale', 'error')
             AND COALESCE(s.analysis_attempts, 0) < 3
             AND (s.analysis_next_retry_at IS NULL OR s.analysis_next_retry_at <= ?)
           )
         )
       ORDER BY d.id
       LIMIT ?`
    )
    .all(nowIso(), limit) as { id: number }[];
  return rows.map((r) => r.id);
}

export function getFilterOptions() {
  const db = getDb();
  const correspondents = db
    .prepare(
      `SELECT DISTINCT correspondent_name as value FROM paperless_documents
       WHERE correspondent_name IS NOT NULL AND correspondent_name != ''
       ORDER BY correspondent_name`
    )
    .all() as { value: string }[];
  const documentTypes = db
    .prepare(
      `SELECT DISTINCT document_type_name as value FROM paperless_documents
       WHERE document_type_name IS NOT NULL AND document_type_name != ''
       ORDER BY document_type_name`
    )
    .all() as { value: string }[];
  const categories = db
    .prepare(
      `SELECT DISTINCT category as value FROM document_summaries
       WHERE category IS NOT NULL AND category != ''
       ORDER BY category`
    )
    .all() as { value: string }[];
  return {
    correspondents: correspondents.map((r) => r.value),
    documentTypes: documentTypes.map((r) => r.value),
    categories: categories.map((r) => r.value),
  };
}

export function getDashboardStats() {
  const db = getDb();
  const totalDocuments = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM paperless_documents
         WHERE COALESCE(sync_status, 'synced') != 'missing'`
      )
      .get() as { c: number }
  ).c;

  const pendingAnalysis = (
    db
      .prepare(
        `SELECT COUNT(*) as c
         FROM paperless_documents d
         LEFT JOIN document_summaries s ON s.document_id = d.id
         WHERE COALESCE(d.sync_status, 'synced') != 'missing'
           AND (
             s.analysis_status IS NULL
             OR (
               s.analysis_status IN ('pending', 'stale', 'error')
               AND COALESCE(s.analysis_attempts, 0) < 3
               AND (s.analysis_next_retry_at IS NULL OR s.analysis_next_retry_at <= datetime('now'))
             )
           )`
      )
      .get() as { c: number }
  ).c;

  const analyzed = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM document_summaries WHERE analysis_status = 'completed'`
      )
      .get() as { c: number }
  ).c;

  const upcomingDeadlines = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM deadlines
         WHERE status = 'open'
           AND deadline_date IS NOT NULL
           AND deadline_date >= date('now')
           AND deadline_date <= ?`
      )
      .get(daysFromNow(90)) as { c: number }
  ).c;

  const warrantiesExpiringSoon = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM devices_and_warranties
         WHERE warranty_until IS NOT NULL
           AND warranty_until >= date('now')
           AND warranty_until <= ?`
      )
      .get(daysFromNow(90)) as { c: number }
  ).c;

  const financialThisYear = (
    db
      .prepare(
        `SELECT COUNT(*) as c, COALESCE(SUM(amount), 0) as total
         FROM financial_items
         WHERE COALESCE(counts_in_stats, 1) = 1
           AND NULLIF(TRIM(vendor), '') IS NOT NULL
           AND invoice_date IS NOT NULL AND substr(invoice_date, 1, 4) = ?`
      )
      .get(String(currentYear())) as { c: number; total: number }
  );

  const travelCount = (
    db.prepare(`SELECT COUNT(*) as c FROM travel_items`).get() as { c: number }
  ).c;

  const warrantiesTotal = (
    db.prepare(`SELECT COUNT(*) as c FROM devices_and_warranties`).get() as {
      c: number;
    }
  ).c;

  const deadlinesOpen = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM deadlines WHERE status = 'open'`
      )
      .get() as { c: number }
  ).c;

  const financialItemsTotal = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM financial_items
         WHERE COALESCE(counts_in_stats, 1) = 1
           AND NULLIF(TRIM(vendor), '') IS NOT NULL`
      )
      .get() as { c: number }
  ).c;

  const knowledgeAreas = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM document_summaries
         WHERE analysis_status = 'completed' AND category IS NOT NULL`
      )
      .get() as { c: number }
  ).c;

  const recentAnalyses = db
    .prepare(
      `SELECT d.id, d.title, d.correspondent_name, s.category, s.short_summary,
              s.analyzed_at, s.confidence
       FROM document_summaries s
       JOIN paperless_documents d ON d.id = s.document_id
       WHERE s.analysis_status = 'completed'
       ORDER BY s.analyzed_at DESC
       LIMIT 8`
    )
    .all();

  return {
    totalDocuments,
    pendingAnalysis,
    analyzed,
    upcomingDeadlines,
    warrantiesExpiringSoon,
    financialItemsThisYear: financialThisYear.c,
    financialTotalThisYear: financialThisYear.total,
    travelDocuments: travelCount,
    warrantiesTotal,
    deadlinesOpen,
    financialItemsTotal,
    knowledgeDocuments: knowledgeAreas,
    recentAnalyses,
  };
}

export function listWarranties() {
  const db = getDb();
  return db
    .prepare(
      `SELECT w.*, d.title as document_title, d.id as document_local_id,
              d.correspondent_name
       FROM devices_and_warranties w
       JOIN paperless_documents d ON d.id = w.document_id
       ORDER BY COALESCE(w.warranty_until, '0000-01-01') DESC`
    )
    .all();
}

export function listDeadlines(status?: string) {
  const db = getDb();
  if (status) {
    return db
      .prepare(
        `SELECT dl.*, d.title as document_title, d.id as document_local_id,
                d.correspondent_name
         FROM deadlines dl
         JOIN paperless_documents d ON d.id = dl.document_id
         WHERE dl.status = ?
         ORDER BY COALESCE(dl.deadline_date, '0000-01-01') DESC`
      )
      .all(status);
  }
  return db
    .prepare(
      `SELECT dl.*, d.title as document_title, d.id as document_local_id,
              d.correspondent_name
       FROM deadlines dl
       JOIN paperless_documents d ON d.id = dl.document_id
       ORDER BY COALESCE(dl.deadline_date, '0000-01-01') DESC`
    )
    .all();
}

export function updateDeadlineStatus(id: number, status: string) {
  const db = getDb();
  db.prepare(`UPDATE deadlines SET status = ?, updated_at = ? WHERE id = ?`).run(
    status,
    nowIso(),
    id
  );
}

export function updateFinancialItemCountsInStats(
  id: number,
  countsInStats: boolean
) {
  const db = getDb();
  db.prepare(
    `UPDATE financial_items SET counts_in_stats = ?, updated_at = ? WHERE id = ?`
  ).run(countsInStats ? 1 : 0, nowIso(), id);
}

export function getTravelItemById(id: number) {
  const db = getDb();
  return (
    (db
      .prepare(
        `SELECT t.*, d.title as document_title, d.id as document_local_id,
                d.correspondent_name
         FROM travel_items t
         JOIN paperless_documents d ON d.id = t.document_id
         WHERE t.id = ?`
      )
      .get(id) as
      | ({
          id: number;
          travel_type: string | null;
          travel_type_override: string | null;
          provider: string | null;
          title: string | null;
          origin: string | null;
          destination: string | null;
          document_title: string | null;
          document_local_id: number;
        } & Record<string, unknown>)
      | undefined) || null
  );
}

export function reclassifyTravelItem(input: {
  id: number;
  travelType: string;
  learn?: boolean;
}): {
  ok: true;
  travel_type: string;
  learned: boolean;
  rule_id: number | null;
  applied_to: number;
  learn_label: string | null;
} {
  if (!(TRAVEL_TYPES as readonly string[]).includes(input.travelType)) {
    throw new Error("Ungültiger Reisetyp");
  }

  const row = getTravelItemById(input.id);
  if (!row) throw new Error("Reiseeintrag nicht gefunden");

  const db = getDb();
  const ts = nowIso();
  db.prepare(
    `UPDATE travel_items
     SET travel_type = ?, travel_type_override = ?, updated_at = ?
     WHERE id = ?`
  ).run(input.travelType, input.travelType, ts, input.id);

  let learned = false;
  let ruleId: number | null = null;
  let appliedTo = 1;
  let learnLabel: string | null = null;

  if (input.learn) {
    const suggestion = suggestTravelLearnMatch(row);
    if (suggestion) {
      const rule = upsertTravelTypeRule({
        matchField: suggestion.matchField,
        matchMode: suggestion.matchMode,
        matchValue: suggestion.matchValue,
        targetValue: input.travelType as TravelTypeCanonical,
      });
      ruleId = rule.id;
      learned = true;
      learnLabel = suggestion.label;
      appliedTo = applyTravelTypeRuleToMatchingItems(rule);
    }
  }

  return {
    ok: true,
    travel_type: input.travelType,
    learned,
    rule_id: ruleId,
    applied_to: appliedTo,
    learn_label: learnLabel,
  };
}

/** Included in KPIs: opted into stats AND known vendor (not empty/"Unbekannt"). */
const FINANCE_STATS_FILTER = `COALESCE(counts_in_stats, 1) = 1
  AND NULLIF(TRIM(vendor), '') IS NOT NULL`;

const FINANCE_UNKNOWN_VENDOR = `COALESCE(counts_in_stats, 1) = 1
  AND NULLIF(TRIM(vendor), '') IS NULL`;

export function getFinanceOverview() {
  const db = getDb();
  const byYear = db
    .prepare(
      `SELECT substr(COALESCE(invoice_date, due_date), 1, 4) as year,
              COUNT(*) as count,
              COALESCE(SUM(amount), 0) as total
       FROM financial_items
       WHERE ${FINANCE_STATS_FILTER}
         AND (invoice_date IS NOT NULL OR due_date IS NOT NULL)
       GROUP BY year
       ORDER BY year DESC`
    )
    .all();

  const byVendor = db
    .prepare(
      `SELECT TRIM(vendor) as vendor,
              COUNT(*) as count,
              COALESCE(SUM(amount), 0) as total
       FROM financial_items
       WHERE ${FINANCE_STATS_FILTER}
       GROUP BY TRIM(vendor)
       ORDER BY total DESC`
    )
    .all();

  const byCategoryRaw = db
    .prepare(
      `SELECT COALESCE(NULLIF(TRIM(category), ''), 'Sonstiges') as category,
              COUNT(*) as count,
              COALESCE(SUM(amount), 0) as total
       FROM financial_items
       WHERE ${FINANCE_STATS_FILTER}
       GROUP BY COALESCE(NULLIF(TRIM(category), ''), 'Sonstiges')
       ORDER BY total DESC`
    )
    .all() as { category: string; count: number; total: number }[];

  const byCategory = aggregateByMappedLabel(byCategoryRaw, (r) =>
    financeBucket(r.category)
  ).map((r) => ({
    category: r.label,
    count: r.count,
    total: r.total,
  }));

  const totals = db
    .prepare(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
       FROM financial_items
       WHERE ${FINANCE_STATS_FILTER}`
    )
    .get() as { count: number; total: number };

  const unknownVendor = db
    .prepare(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
       FROM financial_items
       WHERE ${FINANCE_UNKNOWN_VENDOR}`
    )
    .get() as { count: number; total: number };

  const excludedCount = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM financial_items
         WHERE COALESCE(counts_in_stats, 1) = 0`
      )
      .get() as { c: number }
  ).c;

  const recurring = db
    .prepare(
      `SELECT f.*, d.title as document_title, d.id as document_local_id
       FROM financial_items f
       JOIN paperless_documents d ON d.id = f.document_id
       WHERE f.is_recurring = 1
         AND COALESCE(f.counts_in_stats, 1) = 1
         AND NULLIF(TRIM(f.vendor), '') IS NOT NULL
       ORDER BY f.amount DESC`
    )
    .all();

  const topInvoices = db
    .prepare(
      `SELECT f.*, d.title as document_title, d.id as document_local_id
       FROM financial_items f
       JOIN paperless_documents d ON d.id = f.document_id
       ORDER BY COALESCE(f.counts_in_stats, 1) DESC, COALESCE(f.amount, 0) DESC
       LIMIT 80`
    )
    .all();

  const dueInvoices = db
    .prepare(
      `SELECT f.*, d.title as document_title, d.id as document_local_id
       FROM financial_items f
       JOIN paperless_documents d ON d.id = f.document_id
       WHERE f.due_date IS NOT NULL AND TRIM(f.due_date) != ''
       ORDER BY f.due_date DESC`
    )
    .all();

  // Full set of counted positions with a known vendor, for grouped drilldowns
  // (vendor → by year, year → by vendor). Kept client-side; ~hundreds of rows.
  const detailInvoices = db
    .prepare(
      `SELECT f.*, d.title as document_title, d.id as document_local_id
       FROM financial_items f
       JOIN paperless_documents d ON d.id = f.document_id
       WHERE ${FINANCE_STATS_FILTER}
       ORDER BY COALESCE(f.amount, 0) DESC`
    )
    .all();

  return {
    byYear,
    byVendor,
    byCategory,
    recurring,
    topInvoices,
    dueInvoices,
    detailInvoices,
    totals,
    excludedCount,
    unknownVendor,
  };
}

export function listFinancialItemsByDimension(input: {
  dimension: "year" | "vendor" | "category";
  value: string;
  limit?: number;
}) {
  const db = getDb();
  const limit = input.limit ?? 50;

  if (input.dimension === "year") {
    return db
      .prepare(
        `SELECT f.*, d.title as document_title, d.id as document_local_id
         FROM financial_items f
         JOIN paperless_documents d ON d.id = f.document_id
         WHERE COALESCE(f.counts_in_stats, 1) = 1
           AND NULLIF(TRIM(f.vendor), '') IS NOT NULL
           AND substr(COALESCE(f.invoice_date, f.due_date), 1, 4) = ?
         ORDER BY COALESCE(f.amount, 0) DESC
         LIMIT ?`
      )
      .all(input.value, limit);
  }

  if (input.dimension === "vendor") {
    const vendor = input.value === "Unbekannt" ? null : input.value;
    return db
      .prepare(
        `SELECT f.*, d.title as document_title, d.id as document_local_id
         FROM financial_items f
         JOIN paperless_documents d ON d.id = f.document_id
         WHERE COALESCE(f.counts_in_stats, 1) = 1
           AND NULLIF(TRIM(f.vendor), '') IS NOT NULL
           AND COALESCE(NULLIF(TRIM(f.vendor), ''), 'Unbekannt') = ?
         ORDER BY COALESCE(f.amount, 0) DESC
         LIMIT ?`
      )
      .all(vendor === null ? "Unbekannt" : input.value, limit);
  }

  const rows = db
    .prepare(
      `SELECT f.*, d.title as document_title, d.id as document_local_id
       FROM financial_items f
       JOIN paperless_documents d ON d.id = f.document_id
       WHERE COALESCE(f.counts_in_stats, 1) = 1
         AND NULLIF(TRIM(f.vendor), '') IS NOT NULL
       ORDER BY COALESCE(f.amount, 0) DESC
       LIMIT 500`
    )
    .all() as Array<{ category: string | null; [key: string]: unknown }>;

  return rows
    .filter((r) => financeBucket(r.category) === input.value)
    .slice(0, limit);
}

export function listTravelItems() {
  const db = getDb();
  return db
    .prepare(
      `SELECT t.*, d.title as document_title, d.id as document_local_id,
              d.content as document_content, d.correspondent_name
       FROM travel_items t
       JOIN paperless_documents d ON d.id = t.document_id
       ORDER BY COALESCE(t.start_date, '9999-12-31') ASC`
    )
    .all();
}

export function listSummaries() {
  const db = getDb();
  return db
    .prepare(
      `SELECT s.*, d.title, d.correspondent_name, d.created_date, d.paperless_id
       FROM document_summaries s
       JOIN paperless_documents d ON d.id = s.document_id
       WHERE s.analysis_status = 'completed'
       ORDER BY s.analyzed_at DESC`
    )
    .all();
}

export function getKnowledgeAreaCounts() {
  const db = getDb();
  return db
    .prepare(
      `SELECT ka.name, ka.description,
              COUNT(s.id) as document_count
       FROM knowledge_areas ka
       LEFT JOIN document_summaries s
         ON s.category = ka.name AND s.analysis_status = 'completed'
       GROUP BY ka.id
       ORDER BY ka.name`
    )
    .all() as {
    name: string;
    description: string | null;
    document_count: number;
  }[];
}

export function searchDocuments(query: string, limit = 50) {
  return listDocuments({ search: query, limit });
}

export type TriliumNoteRow = {
  note_id: string;
  scope: TriliumScopeKey;
  title: string | null;
  note_type: string | null;
  content_text: string | null;
  content_hash: string | null;
  date_modified: string | null;
  trilium_url: string | null;
  is_protected: number;
  sync_status: string | null;
  last_synced_at: string | null;
  embedding_status: string | null;
  embedding_error: string | null;
  last_indexed_at: string | null;
  created_at: string;
  updated_at: string;
};

export function getTriliumScopeLabel(scope: TriliumScopeKey): string {
  return scope === "privat"
    ? TRILIUM_SCOPE_PRIVAT_TITLE
    : TRILIUM_SCOPE_GESCHAEFTLICH_TITLE;
}

export function countSyncedTriliumNotes(): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) as count FROM trilium_notes WHERE sync_status = 'synced'`
    )
    .get() as { count: number };
  return row.count;
}

export function listLocalTriliumNoteIds(scope?: TriliumScopeKey): string[] {
  const db = getDb();
  if (scope) {
    return (
      db
        .prepare(
          `SELECT note_id FROM trilium_notes
           WHERE scope = ? AND sync_status = 'synced'`
        )
        .all(scope) as Array<{ note_id: string }>
    ).map((row) => row.note_id);
  }
  return (
    db
      .prepare(
        `SELECT note_id FROM trilium_notes WHERE sync_status = 'synced'`
      )
      .all() as Array<{ note_id: string }>
  ).map((row) => row.note_id);
}

export function markTriliumNotesMissing(
  noteIds: string[],
  scope: TriliumScopeKey
): number {
  if (noteIds.length === 0) return 0;
  const db = getDb();
  const ts = nowIso();
  const stmt = db.prepare(
    `UPDATE trilium_notes
     SET sync_status = 'missing', updated_at = ?
     WHERE scope = ? AND note_id = ? AND sync_status = 'synced'`
  );
  const tx = db.transaction((ids: string[]) => {
    let count = 0;
    for (const noteId of ids) {
      count += stmt.run(ts, scope, noteId).changes;
    }
    return count;
  });
  return tx(noteIds);
}

export function upsertTriliumNote(input: {
  noteId: string;
  scope: TriliumScopeKey;
  title: string | null;
  noteType: string | null;
  contentText: string;
  dateModified: string | null;
  triliumUrl: string;
  isProtected?: boolean;
}): { isNew: boolean; changed: boolean } {
  const db = getDb();
  const ts = nowIso();
  const contentHash = hashContent(input.contentText);
  const existing = db
    .prepare(`SELECT content_hash, sync_status FROM trilium_notes WHERE note_id = ?`)
    .get(input.noteId) as
    | { content_hash: string | null; sync_status: string | null }
    | undefined;

  if (!existing) {
    db.prepare(
      `INSERT INTO trilium_notes (
         note_id, scope, title, note_type, content_text, content_hash,
         date_modified, trilium_url, is_protected, sync_status,
         embedding_status, last_synced_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', 'pending', ?, ?, ?)`
    ).run(
      input.noteId,
      input.scope,
      input.title,
      input.noteType,
      input.contentText,
      contentHash,
      input.dateModified,
      input.triliumUrl,
      input.isProtected ? 1 : 0,
      ts,
      ts,
      ts
    );
    return { isNew: true, changed: true };
  }

  const changed =
    existing.content_hash !== contentHash || existing.sync_status === "missing";
  if (changed) {
    db.prepare(
      `UPDATE trilium_notes SET
         scope = ?,
         title = ?,
         note_type = ?,
         content_text = ?,
         content_hash = ?,
         date_modified = ?,
         trilium_url = ?,
         is_protected = ?,
         sync_status = 'synced',
         embedding_status = 'pending',
         embedding_error = NULL,
         last_synced_at = ?,
         updated_at = ?
       WHERE note_id = ?`
    ).run(
      input.scope,
      input.title,
      input.noteType,
      input.contentText,
      contentHash,
      input.dateModified,
      input.triliumUrl,
      input.isProtected ? 1 : 0,
      ts,
      ts,
      input.noteId
    );
  } else {
    db.prepare(
      `UPDATE trilium_notes SET
         scope = ?,
         title = ?,
         note_type = ?,
         date_modified = ?,
         trilium_url = ?,
         is_protected = ?,
         sync_status = 'synced',
         last_synced_at = ?,
         updated_at = ?
       WHERE note_id = ?`
    ).run(
      input.scope,
      input.title,
      input.noteType,
      input.dateModified,
      input.triliumUrl,
      input.isProtected ? 1 : 0,
      ts,
      ts,
      input.noteId
    );
  }
  return { isNew: false, changed };
}

export function getTriliumNoteById(noteId: string): TriliumNoteRow | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM trilium_notes WHERE note_id = ?`)
    .get(noteId) as TriliumNoteRow | undefined;
  return row ?? null;
}

export function updateTriliumNoteEmbedding(
  noteId: string,
  input: {
    embeddingStatus: string;
    embeddingError?: string | null;
    lastIndexedAt?: string | null;
  }
): void {
  const db = getDb();
  const ts = nowIso();
  db.prepare(
    `UPDATE trilium_notes SET
       embedding_status = ?,
       embedding_error = ?,
       last_indexed_at = COALESCE(?, last_indexed_at),
       updated_at = ?
     WHERE note_id = ?`
  ).run(
    input.embeddingStatus,
    input.embeddingError ?? null,
    input.lastIndexedAt ?? null,
    ts,
    noteId
  );
}

export function listTriliumNotesNeedingEmbedding(limit = 80): TriliumNoteRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM trilium_notes
       WHERE sync_status = 'synced'
         AND (
           embedding_status IS NULL
           OR embedding_status IN ('pending', 'error', 'indexing')
         )
       ORDER BY date_modified DESC
       LIMIT ?`
    )
    .all(limit) as TriliumNoteRow[];
}

export function listIndexedMissingTriliumNoteIds(limit = 200): string[] {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT note_id FROM trilium_notes
         WHERE sync_status = 'missing'
           AND embedding_status = 'indexed'
         LIMIT ?`
      )
      .all(limit) as Array<{ note_id: string }>
  ).map((row) => row.note_id);
}

export function countIndexedTriliumNotes(): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) as count FROM trilium_notes
       WHERE sync_status = 'synced' AND embedding_status = 'indexed'`
    )
    .get() as { count: number };
  return row.count;
}

export function listSyncedTriliumNotesForSearch(): TriliumNoteRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM trilium_notes
       WHERE sync_status = 'synced'
       ORDER BY date_modified DESC`
    )
    .all() as TriliumNoteRow[];
}

export type KnowledgeGuideRow = {
  id: number;
  title: string;
  filename: string;
  file_path: string;
  file_hash: string;
  page_count: number | null;
  extracted_text: string | null;
  content_hash: string | null;
  embedding_status: string | null;
  embedding_error: string | null;
  last_indexed_at: string | null;
  created_at: string;
  updated_at: string;
};

export function listKnowledgeGuides(): Array<
  Omit<KnowledgeGuideRow, "extracted_text"> & { extracted_chars: number }
> {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, title, filename, file_path, file_hash, page_count,
              length(COALESCE(extracted_text, '')) as extracted_chars,
              content_hash, embedding_status, embedding_error, last_indexed_at,
              created_at, updated_at
       FROM knowledge_guides
       ORDER BY created_at DESC`
    )
    .all() as Array<
    Omit<KnowledgeGuideRow, "extracted_text"> & { extracted_chars: number }
  >;
}

export function getKnowledgeGuideById(id: number): KnowledgeGuideRow | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM knowledge_guides WHERE id = ?`)
    .get(id) as KnowledgeGuideRow | undefined;
  return row ?? null;
}

export function findKnowledgeGuideByFilename(
  filename: string
): KnowledgeGuideRow | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM knowledge_guides WHERE filename = ? LIMIT 1`)
    .get(filename) as KnowledgeGuideRow | undefined;
  return row ?? null;
}

export function findKnowledgeGuideByTitle(
  title: string
): KnowledgeGuideRow | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM knowledge_guides WHERE title = ? LIMIT 1`)
    .get(title) as KnowledgeGuideRow | undefined;
  return row ?? null;
}

export function countIndexedKnowledgeGuides(): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) as count FROM knowledge_guides WHERE embedding_status = 'indexed'`
    )
    .get() as { count: number };
  return row.count;
}

export function createKnowledgeGuide(input: {
  title: string;
  filename: string;
  filePath: string;
  fileHash: string;
  pageCount: number | null;
  extractedText: string;
}): number {
  const db = getDb();
  const ts = nowIso();
  const result = db
    .prepare(
      `INSERT INTO knowledge_guides (
         title, filename, file_path, file_hash, page_count, extracted_text,
         embedding_status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    )
    .run(
      input.title,
      input.filename,
      input.filePath,
      input.fileHash,
      input.pageCount,
      input.extractedText,
      ts,
      ts
    );
  return Number(result.lastInsertRowid);
}

export function updateKnowledgeGuideFilePath(
  guideId: number,
  filePath: string
): void {
  const db = getDb();
  db.prepare(
    `UPDATE knowledge_guides SET file_path = ?, updated_at = ? WHERE id = ?`
  ).run(filePath, nowIso(), guideId);
}

export function updateKnowledgeGuideIndexing(
  guideId: number,
  input: {
    contentHash?: string | null;
    embeddingStatus?: string;
    embeddingError?: string | null;
    lastIndexedAt?: string | null;
  }
): void {
  const db = getDb();
  const fields: string[] = ["updated_at = ?"];
  const values: unknown[] = [nowIso()];

  if (input.contentHash !== undefined) {
    fields.push("content_hash = ?");
    values.push(input.contentHash);
  }
  if (input.embeddingStatus !== undefined) {
    fields.push("embedding_status = ?");
    values.push(input.embeddingStatus);
  }
  if (input.embeddingError !== undefined) {
    fields.push("embedding_error = ?");
    values.push(input.embeddingError);
  }
  if (input.lastIndexedAt !== undefined) {
    fields.push("last_indexed_at = ?");
    values.push(input.lastIndexedAt);
  }

  values.push(guideId);
  db.prepare(
    `UPDATE knowledge_guides SET ${fields.join(", ")} WHERE id = ?`
  ).run(...values);
}

export function deleteKnowledgeGuide(guideId: number): KnowledgeGuideRow | null {
  const guide = getKnowledgeGuideById(guideId);
  if (!guide) return null;
  const db = getDb();
  db.prepare(`DELETE FROM knowledge_guides WHERE id = ?`).run(guideId);
  return guide;
}

export function deleteGuideChunks(guideId: number): void {
  const db = getDb();
  db.prepare(`DELETE FROM knowledge_guide_chunks WHERE guide_id = ?`).run(guideId);
}

export function replaceGuideChunks(
  guideId: number,
  chunks: Array<{
    chunkIndex: number;
    chunkText: string;
    contentHash: string;
    qdrantPointId: string;
    pageStart?: number | null;
    pageEnd?: number | null;
  }>
): void {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO knowledge_guide_chunks (
       guide_id, chunk_index, page_start, page_end, chunk_text,
       content_hash, qdrant_point_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const tx = db.transaction((rows: typeof chunks) => {
    for (const chunk of rows) {
      insert.run(
        guideId,
        chunk.chunkIndex,
        chunk.pageStart ?? null,
        chunk.pageEnd ?? null,
        chunk.chunkText,
        chunk.contentHash,
        chunk.qdrantPointId
      );
    }
  });
  tx(chunks);
}

export type ChatCorrectionRow = {
  id: number;
  topic: string | null;
  content: string;
  active: number;
  created_at: string;
  updated_at: string;
};

export function listChatCorrections(activeOnly = false): ChatCorrectionRow[] {
  const db = getDb();
  if (activeOnly) {
    return db
      .prepare(
        `SELECT * FROM chat_corrections WHERE active = 1 ORDER BY updated_at DESC`
      )
      .all() as ChatCorrectionRow[];
  }
  return db
    .prepare(`SELECT * FROM chat_corrections ORDER BY updated_at DESC`)
    .all() as ChatCorrectionRow[];
}

export function getChatCorrectionById(id: number): ChatCorrectionRow | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM chat_corrections WHERE id = ?`)
    .get(id) as ChatCorrectionRow | undefined;
  return row ?? null;
}

export function createChatCorrection(input: {
  topic?: string | null;
  content: string;
}): number {
  const db = getDb();
  const ts = nowIso();
  const result = db
    .prepare(
      `INSERT INTO chat_corrections (topic, content, active, created_at, updated_at)
       VALUES (?, ?, 1, ?, ?)`
    )
    .run(input.topic?.trim() || null, input.content.trim(), ts, ts);
  return Number(result.lastInsertRowid);
}

export function updateChatCorrection(
  id: number,
  input: { topic?: string | null; content?: string; active?: boolean }
): ChatCorrectionRow | null {
  const existing = getChatCorrectionById(id);
  if (!existing) return null;

  const db = getDb();
  const topic =
    input.topic !== undefined
      ? input.topic?.trim() || null
      : existing.topic;
  const content =
    input.content !== undefined ? input.content.trim() : existing.content;
  const active =
    input.active !== undefined ? (input.active ? 1 : 0) : existing.active;

  db.prepare(
    `UPDATE chat_corrections
     SET topic = ?, content = ?, active = ?, updated_at = ?
     WHERE id = ?`
  ).run(topic, content, active, nowIso(), id);

  return getChatCorrectionById(id);
}

export function deleteChatCorrection(id: number): boolean {
  const db = getDb();
  const result = db.prepare(`DELETE FROM chat_corrections WHERE id = ?`).run(id);
  return result.changes > 0;
}

