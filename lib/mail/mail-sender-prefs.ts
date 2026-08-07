import { getDb } from "@/lib/db/client";

export type MailSenderPref = {
  userId: number;
  fromDomain: string;
  appliedCount: number;
  dismissedCount: number;
  lastAppliedAt: string | null;
  lastDismissedAt: string | null;
};

export function emailDomain(email: string | null | undefined): string | null {
  const raw = (email || "").trim().toLowerCase();
  const at = raw.lastIndexOf("@");
  if (at < 0) return null;
  const domain = raw.slice(at + 1).trim();
  return domain || null;
}

export function getMailSenderPref(
  userId: number,
  fromDomain: string
): MailSenderPref | null {
  const domain = fromDomain.trim().toLowerCase();
  if (!domain) return null;
  const row = getDb()
    .prepare(
      `SELECT user_id, from_domain, applied_count, dismissed_count,
              last_applied_at, last_dismissed_at
       FROM mail_sender_prefs
       WHERE user_id = ? AND from_domain = ?`
    )
    .get(userId, domain) as
    | {
        user_id: number;
        from_domain: string;
        applied_count: number;
        dismissed_count: number;
        last_applied_at: string | null;
        last_dismissed_at: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    userId: row.user_id,
    fromDomain: row.from_domain,
    appliedCount: row.applied_count || 0,
    dismissedCount: row.dismissed_count || 0,
    lastAppliedAt: row.last_applied_at,
    lastDismissedAt: row.last_dismissed_at,
  };
}

export function recordMailSenderApplied(
  userId: number,
  fromEmail: string | null | undefined
): void {
  const domain = emailDomain(fromEmail);
  if (!domain) return;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO mail_sender_prefs (
         user_id, from_domain, applied_count, dismissed_count,
         last_applied_at, last_dismissed_at, updated_at
       ) VALUES (?, ?, 1, 0, ?, NULL, ?)
       ON CONFLICT(user_id, from_domain) DO UPDATE SET
         applied_count = applied_count + 1,
         last_applied_at = excluded.last_applied_at,
         updated_at = excluded.updated_at`
    )
    .run(userId, domain, now, now);
}

export function recordMailSenderDismissed(
  userId: number,
  fromEmail: string | null | undefined
): void {
  const domain = emailDomain(fromEmail);
  if (!domain) return;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO mail_sender_prefs (
         user_id, from_domain, applied_count, dismissed_count,
         last_applied_at, last_dismissed_at, updated_at
       ) VALUES (?, ?, 0, 1, NULL, ?, ?)
       ON CONFLICT(user_id, from_domain) DO UPDATE SET
         dismissed_count = dismissed_count + 1,
         last_dismissed_at = excluded.last_dismissed_at,
         updated_at = excluded.updated_at`
    )
    .run(userId, domain, now, now);
}

/** Soft learn hint for LLM prompt. */
export function senderPrefPromptLine(pref: MailSenderPref | null): string | null {
  if (!pref) return null;
  if (pref.appliedCount >= 1 && pref.appliedCount >= pref.dismissedCount) {
    return `Absender-Domain ${pref.fromDomain}: oft übernommen (${pref.appliedCount}×) — Vorschläge eher anlegen.`;
  }
  if (pref.dismissedCount >= 2 && pref.appliedCount === 0) {
    return `Absender-Domain ${pref.fromDomain}: oft verworfen (${pref.dismissedCount}×) — nur vorschlagen wenn klar handlungsrelevant.`;
  }
  return null;
}
