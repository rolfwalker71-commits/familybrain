import { getDb } from "@/lib/db/client";
import type { AiTokenUsage } from "@/lib/ai/usage-cost";
import type { MariTicketAnalysis } from "@/lib/mari/analyze-ticket";

export type StoredMariTicketAnalysis = {
  ownerKey: string;
  issueId: number;
  summary: string | null;
  analysis: MariTicketAnalysis;
  imagesAnalyzed: number;
  imageNames: string[];
  usage: AiTokenUsage | null;
  model: string | null;
  analyzedAt: string;
  updatedAt: string;
  /** ISO timestamp when this analysis was posted as Maringo internal note. */
  internalNotePostedAt: string | null;
};

type Row = {
  owner_key: string;
  issue_id: number;
  summary: string | null;
  analysis_json: string;
  images_analyzed: number;
  image_names_json: string | null;
  usage_json: string | null;
  model: string | null;
  analyzed_at: string;
  updated_at: string;
  internal_note_posted_at?: string | null;
};

function mapRow(row: Row): StoredMariTicketAnalysis | null {
  let analysis: MariTicketAnalysis;
  try {
    analysis = JSON.parse(row.analysis_json) as MariTicketAnalysis;
  } catch {
    return null;
  }
  let imageNames: string[] = [];
  if (row.image_names_json) {
    try {
      const parsed = JSON.parse(row.image_names_json);
      if (Array.isArray(parsed)) {
        imageNames = parsed.map((n) => String(n));
      }
    } catch {
      imageNames = [];
    }
  }
  let usage: AiTokenUsage | null = null;
  if (row.usage_json) {
    try {
      usage = JSON.parse(row.usage_json) as AiTokenUsage;
    } catch {
      usage = null;
    }
  }
  const posted = row.internal_note_posted_at?.trim() || null;
  return {
    ownerKey: row.owner_key,
    issueId: row.issue_id,
    summary: row.summary,
    analysis,
    imagesAnalyzed: Number(row.images_analyzed) || 0,
    imageNames,
    usage,
    model: row.model,
    analyzedAt: row.analyzed_at,
    updatedAt: row.updated_at,
    internalNotePostedAt: posted,
  };
}

export function getMariTicketAnalysis(
  ownerKey: string,
  issueId: number
): StoredMariTicketAnalysis | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM mari_ticket_analyses
       WHERE owner_key = ? AND issue_id = ?`
    )
    .get(ownerKey, issueId) as Row | undefined;
  return row ? mapRow(row) : null;
}

export function upsertMariTicketAnalysis(input: {
  ownerKey: string;
  issueId: number;
  analysis: MariTicketAnalysis;
  imagesAnalyzed?: number;
  imageNames?: string[];
  usage?: AiTokenUsage | null;
  model?: string | null;
}): StoredMariTicketAnalysis {
  const now = new Date().toISOString();
  const summary = input.analysis.summary?.trim() || null;
  const imagesAnalyzed = input.imagesAnalyzed ?? 0;
  const imageNames = input.imageNames ?? [];
  getDb()
    .prepare(
      `INSERT INTO mari_ticket_analyses (
        owner_key, issue_id, summary, analysis_json,
        images_analyzed, image_names_json, usage_json, model,
        analyzed_at, updated_at, internal_note_posted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(owner_key, issue_id) DO UPDATE SET
        summary = excluded.summary,
        analysis_json = excluded.analysis_json,
        images_analyzed = excluded.images_analyzed,
        image_names_json = excluded.image_names_json,
        usage_json = excluded.usage_json,
        model = excluded.model,
        analyzed_at = excluded.analyzed_at,
        updated_at = excluded.updated_at,
        internal_note_posted_at = NULL`
    )
    .run(
      input.ownerKey,
      input.issueId,
      summary,
      JSON.stringify(input.analysis),
      imagesAnalyzed,
      JSON.stringify(imageNames),
      input.usage ? JSON.stringify(input.usage) : null,
      input.model ?? input.usage?.model ?? null,
      now,
      now
    );
  const stored = getMariTicketAnalysis(input.ownerKey, input.issueId);
  if (!stored) {
    throw new Error("Ticket-Analyse konnte nicht gespeichert werden.");
  }
  return stored;
}

/** Markiert die aktuelle gespeicherte Analyse als intern nach Maringo geschrieben. */
export function markMariTicketAnalysisInternalNotePosted(
  ownerKey: string,
  issueId: number,
  postedAt = new Date().toISOString()
): StoredMariTicketAnalysis | null {
  const existing = getMariTicketAnalysis(ownerKey, issueId);
  if (!existing) return null;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE mari_ticket_analyses
       SET internal_note_posted_at = ?, updated_at = ?
       WHERE owner_key = ? AND issue_id = ?`
    )
    .run(postedAt, now, ownerKey, issueId);
  return getMariTicketAnalysis(ownerKey, issueId);
}

/** Entfernt die «bereits intern gespeichert»-Markierung (z.B. nach Löschen der Notiz). */
export function clearMariTicketAnalysisInternalNotePosted(
  ownerKey: string,
  issueId: number
): StoredMariTicketAnalysis | null {
  const existing = getMariTicketAnalysis(ownerKey, issueId);
  if (!existing) return null;
  if (!existing.internalNotePostedAt) return existing;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE mari_ticket_analyses
       SET internal_note_posted_at = NULL, updated_at = ?
       WHERE owner_key = ? AND issue_id = ?`
    )
    .run(now, ownerKey, issueId);
  return getMariTicketAnalysis(ownerKey, issueId);
}

export function listMariTicketAnalysisIssueIds(
  ownerKey: string,
  issueIds: number[]
): Set<number> {
  const out = new Set<number>();
  if (issueIds.length === 0) return out;
  const db = getDb();
  const stmt = db.prepare(
    `SELECT issue_id FROM mari_ticket_analyses
     WHERE owner_key = ? AND issue_id = ?`
  );
  for (const id of issueIds) {
    const row = stmt.get(ownerKey, id) as { issue_id: number } | undefined;
    if (row) out.add(row.issue_id);
  }
  return out;
}
