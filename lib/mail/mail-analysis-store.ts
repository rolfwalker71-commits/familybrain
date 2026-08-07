import { getDb } from "@/lib/db/client";
import type { MailAnalysis } from "@/lib/mail/mail-action-schema";
import {
  chipForStatus,
  type MailAnalysisStatus,
  type StoredMailAnalysis,
} from "@/lib/mail/mail-heuristic";

type Row = {
  user_id: number;
  message_id: string;
  thread_id: string | null;
  subject: string | null;
  from_name: string | null;
  from_email: string | null;
  snippet: string | null;
  status: string;
  relevance: string | null;
  summary: string | null;
  analysis_json: string | null;
  suggestion_count: number;
  error: string | null;
  analyzed_at: string;
  updated_at: string;
};

function mapRow(row: Row): StoredMailAnalysis {
  let analysis: MailAnalysis | null = null;
  if (row.analysis_json) {
    try {
      analysis = JSON.parse(row.analysis_json) as MailAnalysis;
    } catch {
      analysis = null;
    }
  }
  const status = row.status as MailAnalysisStatus;
  return {
    userId: row.user_id,
    messageId: row.message_id,
    threadId: row.thread_id,
    subject: row.subject,
    fromName: row.from_name,
    fromEmail: row.from_email,
    snippet: row.snippet,
    status,
    relevance: row.relevance,
    summary: row.summary,
    analysis,
    suggestionCount: row.suggestion_count || 0,
    error: row.error,
    analyzedAt: row.analyzed_at,
    updatedAt: row.updated_at,
    chip: chipForStatus(status, row.suggestion_count || 0),
  };
}

export function getMailAnalysis(
  userId: number,
  messageId: string
): StoredMailAnalysis | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM mail_analyses WHERE user_id = ? AND message_id = ?`
    )
    .get(userId, messageId) as Row | undefined;
  return row ? mapRow(row) : null;
}

export function getMailAnalysesForMessages(
  userId: number,
  messageIds: string[]
): Map<string, StoredMailAnalysis> {
  const out = new Map<string, StoredMailAnalysis>();
  if (messageIds.length === 0) return out;
  const db = getDb();
  const stmt = db.prepare(
    `SELECT * FROM mail_analyses WHERE user_id = ? AND message_id = ?`
  );
  for (const id of messageIds) {
    const row = stmt.get(userId, id) as Row | undefined;
    if (row) out.set(id, mapRow(row));
  }
  return out;
}

export function upsertMailAnalysis(input: {
  userId: number;
  messageId: string;
  threadId?: string | null;
  subject?: string | null;
  fromName?: string | null;
  fromEmail?: string | null;
  snippet?: string | null;
  status: MailAnalysisStatus;
  relevance?: string | null;
  summary?: string | null;
  analysis?: MailAnalysis | null;
  suggestionCount?: number;
  error?: string | null;
}): StoredMailAnalysis {
  const now = new Date().toISOString();
  const suggestionCount =
    input.suggestionCount ?? input.analysis?.suggestions.length ?? 0;
  getDb()
    .prepare(
      `INSERT INTO mail_analyses (
        user_id, message_id, thread_id, subject, from_name, from_email, snippet,
        status, relevance, summary, analysis_json, suggestion_count, error,
        analyzed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, message_id) DO UPDATE SET
        thread_id = excluded.thread_id,
        subject = excluded.subject,
        from_name = excluded.from_name,
        from_email = excluded.from_email,
        snippet = excluded.snippet,
        status = excluded.status,
        relevance = excluded.relevance,
        summary = excluded.summary,
        analysis_json = excluded.analysis_json,
        suggestion_count = excluded.suggestion_count,
        error = excluded.error,
        updated_at = excluded.updated_at`
    )
    .run(
      input.userId,
      input.messageId,
      input.threadId ?? null,
      input.subject ?? null,
      input.fromName ?? null,
      input.fromEmail ?? null,
      input.snippet ?? null,
      input.status,
      input.relevance ?? null,
      input.summary ?? null,
      input.analysis ? JSON.stringify(input.analysis) : null,
      suggestionCount,
      input.error ?? null,
      now,
      now
    );
  return getMailAnalysis(input.userId, input.messageId)!;
}

export function updateMailAnalysisStatus(
  userId: number,
  messageId: string,
  status: MailAnalysisStatus
): void {
  getDb()
    .prepare(
      `UPDATE mail_analyses SET status = ?, updated_at = ? WHERE user_id = ? AND message_id = ?`
    )
    .run(status, new Date().toISOString(), userId, messageId);
}

export function listPendingMailTriage(
  userId: number,
  limit = 30
): StoredMailAnalysis[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM mail_analyses
       WHERE user_id = ? AND status = 'pending_triage' AND suggestion_count > 0
       ORDER BY analyzed_at DESC
       LIMIT ?`
    )
    .all(userId, limit) as Row[];
  return rows.map(mapRow);
}

export function countPendingMailTriage(userId: number): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as c FROM mail_analyses
       WHERE user_id = ? AND status = 'pending_triage' AND suggestion_count > 0`
    )
    .get(userId) as { c: number };
  return row?.c || 0;
}

/** Counts for overview KPI: AI-processed today + open triage suggestions. */
export function countMailOverviewStats(
  userId: number,
  todayIso: string
): { analyzedToday: number; pendingTriage: number } {
  const day = todayIso.slice(0, 10);
  const analyzed = getDb()
    .prepare(
      `SELECT COUNT(*) as c FROM mail_analyses
       WHERE user_id = ?
         AND substr(analyzed_at, 1, 10) = ?
         AND status IN ('analyzed', 'pending_triage', 'applied', 'dismissed')`
    )
    .get(userId, day) as { c: number };
  return {
    analyzedToday: analyzed?.c || 0,
    pendingTriage: countPendingMailTriage(userId),
  };
}
