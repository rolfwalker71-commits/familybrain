import { getDb } from "@/lib/db/client";
import type { MailAnalysis } from "@/lib/mail/mail-action-schema";
import {
  chipForStatus,
  type MailAnalysisStatus,
  type StoredMailAnalysis,
} from "@/lib/mail/mail-heuristic";

export type MailProvider = "google" | "microsoft";

type Row = {
  user_id: number;
  message_id: string;
  provider?: string | null;
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

function mapRow(row: Row): StoredMailAnalysis & { provider: MailProvider } {
  let analysis: MailAnalysis | null = null;
  if (row.analysis_json) {
    try {
      analysis = JSON.parse(row.analysis_json) as MailAnalysis;
    } catch {
      analysis = null;
    }
  }
  const status = row.status as MailAnalysisStatus;
  const provider =
    row.provider === "microsoft" ? "microsoft" : ("google" as MailProvider);
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
    provider,
  };
}

export function getMailAnalysis(
  userId: number,
  messageId: string,
  provider: MailProvider = "google"
): (StoredMailAnalysis & { provider: MailProvider }) | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM mail_analyses
       WHERE user_id = ? AND message_id = ? AND COALESCE(provider, 'google') = ?`
    )
    .get(userId, messageId, provider) as Row | undefined;
  return row ? mapRow(row) : null;
}

export function getMailAnalysesForMessages(
  userId: number,
  messageIds: string[],
  provider: MailProvider = "google"
): Map<string, StoredMailAnalysis & { provider: MailProvider }> {
  const out = new Map<string, StoredMailAnalysis & { provider: MailProvider }>();
  if (messageIds.length === 0) return out;
  const db = getDb();
  const stmt = db.prepare(
    `SELECT * FROM mail_analyses
     WHERE user_id = ? AND message_id = ? AND COALESCE(provider, 'google') = ?`
  );
  for (const id of messageIds) {
    const row = stmt.get(userId, id, provider) as Row | undefined;
    if (row) out.set(id, mapRow(row));
  }
  return out;
}

export function upsertMailAnalysis(input: {
  userId: number;
  messageId: string;
  provider?: MailProvider;
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
}): StoredMailAnalysis & { provider: MailProvider } {
  const now = new Date().toISOString();
  const provider = input.provider ?? "google";
  const suggestionCount =
    input.suggestionCount ?? input.analysis?.suggestions.length ?? 0;
  getDb()
    .prepare(
      `INSERT INTO mail_analyses (
        user_id, message_id, provider, thread_id, subject, from_name, from_email, snippet,
        status, relevance, summary, analysis_json, suggestion_count, error,
        analyzed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, message_id) DO UPDATE SET
        provider = excluded.provider,
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
      provider,
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
  return getMailAnalysis(input.userId, input.messageId, provider)!;
}

export function updateMailAnalysisStatus(
  userId: number,
  messageId: string,
  status: MailAnalysisStatus,
  provider: MailProvider = "google"
): void {
  getDb()
    .prepare(
      `UPDATE mail_analyses SET status = ?, updated_at = ?
       WHERE user_id = ? AND message_id = ? AND COALESCE(provider, 'google') = ?`
    )
    .run(status, new Date().toISOString(), userId, messageId, provider);
}

export function listPendingMailTriage(
  userId: number,
  limit = 30,
  provider?: MailProvider
): Array<StoredMailAnalysis & { provider: MailProvider }> {
  if (provider) {
    const rows = getDb()
      .prepare(
        `SELECT * FROM mail_analyses
         WHERE user_id = ?
           AND COALESCE(provider, 'google') = ?
           AND status = 'pending_triage'
           AND suggestion_count > 0
         ORDER BY analyzed_at DESC
         LIMIT ?`
      )
      .all(userId, provider, limit) as Row[];
    return rows.map(mapRow);
  }
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

export function listMailAnalysesByThread(
  userId: number,
  threadId: string,
  limit = 8,
  provider: MailProvider = "google"
): Array<StoredMailAnalysis & { provider: MailProvider }> {
  const tid = threadId.trim();
  if (!tid) return [];
  const rows = getDb()
    .prepare(
      `SELECT * FROM mail_analyses
       WHERE user_id = ?
         AND thread_id = ?
         AND COALESCE(provider, 'google') = ?
       ORDER BY analyzed_at DESC
       LIMIT ?`
    )
    .all(userId, tid, provider, limit) as Row[];
  return rows.map(mapRow);
}

export function countPendingMailTriage(
  userId: number,
  provider?: MailProvider
): number {
  if (provider) {
    const row = getDb()
      .prepare(
        `SELECT COUNT(*) as c FROM mail_analyses
         WHERE user_id = ?
           AND COALESCE(provider, 'google') = ?
           AND status = 'pending_triage'
           AND suggestion_count > 0`
      )
      .get(userId, provider) as { c: number };
    return row?.c || 0;
  }
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as c FROM mail_analyses
       WHERE user_id = ? AND status = 'pending_triage' AND suggestion_count > 0`
    )
    .get(userId) as { c: number };
  return row?.c || 0;
}

export type MailOverviewStats = {
  analyzedToday: number;
  pendingTriage: number;
  /** Latest analyzed_at ISO for this provider (any day), if any */
  lastAnalyzedAt: string | null;
};

/** Counts for overview KPI: AI-processed today + open triage suggestions. */
export function countMailOverviewStats(
  userId: number,
  todayIso: string,
  provider?: MailProvider
): MailOverviewStats {
  const day = todayIso.slice(0, 10);
  if (provider) {
    const analyzed = getDb()
      .prepare(
        `SELECT COUNT(*) as c FROM mail_analyses
         WHERE user_id = ?
           AND COALESCE(provider, 'google') = ?
           AND substr(analyzed_at, 1, 10) = ?
           AND status IN ('analyzed', 'pending_triage', 'applied', 'dismissed')`
      )
      .get(userId, provider, day) as { c: number };
    const last = getDb()
      .prepare(
        `SELECT MAX(analyzed_at) as at FROM mail_analyses
         WHERE user_id = ?
           AND COALESCE(provider, 'google') = ?
           AND analyzed_at IS NOT NULL
           AND TRIM(analyzed_at) != ''`
      )
      .get(userId, provider) as { at: string | null };
    return {
      analyzedToday: analyzed?.c || 0,
      pendingTriage: countPendingMailTriage(userId, provider),
      lastAnalyzedAt: last?.at?.trim() || null,
    };
  }
  const analyzed = getDb()
    .prepare(
      `SELECT COUNT(*) as c FROM mail_analyses
       WHERE user_id = ?
         AND substr(analyzed_at, 1, 10) = ?
         AND status IN ('analyzed', 'pending_triage', 'applied', 'dismissed')`
    )
    .get(userId, day) as { c: number };
  const last = getDb()
    .prepare(
      `SELECT MAX(analyzed_at) as at FROM mail_analyses
       WHERE user_id = ?
         AND analyzed_at IS NOT NULL
         AND TRIM(analyzed_at) != ''`
    )
    .get(userId) as { at: string | null };
  return {
    analyzedToday: analyzed?.c || 0,
    pendingTriage: countPendingMailTriage(userId),
    lastAnalyzedAt: last?.at?.trim() || null,
  };
}

export function countMailOverviewStatsByProvider(
  userId: number,
  todayIso: string
): { google: MailOverviewStats; microsoft: MailOverviewStats } {
  return {
    google: countMailOverviewStats(userId, todayIso, "google"),
    microsoft: countMailOverviewStats(userId, todayIso, "microsoft"),
  };
}
