import { getDb } from "@/lib/db/client";

export type MailAppliedLink = {
  id: number;
  userId: number;
  messageId: string;
  threadId: string | null;
  kind: "event" | "task" | "note" | "trip" | "finance";
  title: string;
  googleEventId: string | null;
  calendarId: string | null;
  taskId: string | null;
  reference: string | null;
  startDate: string | null;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  createdAt: string;
};

type Row = {
  id: number;
  user_id: number;
  message_id: string;
  thread_id: string | null;
  kind: string;
  title: string;
  google_event_id: string | null;
  calendar_id: string | null;
  task_id: string | null;
  reference: string | null;
  start_date: string | null;
  start_time: string | null;
  end_date: string | null;
  end_time: string | null;
  created_at: string;
};

function mapRow(row: Row): MailAppliedLink {
  return {
    id: row.id,
    userId: row.user_id,
    messageId: row.message_id,
    threadId: row.thread_id,
    kind: row.kind as MailAppliedLink["kind"],
    title: row.title,
    googleEventId: row.google_event_id,
    calendarId: row.calendar_id,
    taskId: row.task_id,
    reference: row.reference,
    startDate: row.start_date,
    startTime: row.start_time,
    endDate: row.end_date,
    endTime: row.end_time,
    createdAt: row.created_at,
  };
}

export function insertMailAppliedLink(input: {
  userId: number;
  messageId: string;
  threadId?: string | null;
  kind: "event" | "task" | "note" | "trip" | "finance";
  title: string;
  googleEventId?: string | null;
  calendarId?: string | null;
  taskId?: string | null;
  reference?: string | null;
  startDate?: string | null;
  startTime?: string | null;
  endDate?: string | null;
  endTime?: string | null;
}): MailAppliedLink {
  const now = new Date().toISOString();
  const result = getDb()
    .prepare(
      `INSERT INTO mail_applied_links (
         user_id, message_id, thread_id, kind, title,
         google_event_id, calendar_id, task_id, reference,
         start_date, start_time, end_date, end_time, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.userId,
      input.messageId,
      input.threadId ?? null,
      input.kind,
      input.title,
      input.googleEventId ?? null,
      input.calendarId ?? null,
      input.taskId ?? null,
      input.reference ?? null,
      input.startDate ?? null,
      input.startTime ?? null,
      input.endDate ?? null,
      input.endTime ?? null,
      now
    );
  return getMailAppliedLinkById(Number(result.lastInsertRowid))!;
}

export function getMailAppliedLinkById(id: number): MailAppliedLink | null {
  const row = getDb()
    .prepare(`SELECT * FROM mail_applied_links WHERE id = ?`)
    .get(id) as Row | undefined;
  return row ? mapRow(row) : null;
}

export function listMailAppliedLinksByThread(
  userId: number,
  threadId: string
): MailAppliedLink[] {
  const tid = threadId.trim();
  if (!tid) return [];
  const rows = getDb()
    .prepare(
      `SELECT * FROM mail_applied_links
       WHERE user_id = ? AND thread_id = ?
       ORDER BY created_at DESC`
    )
    .all(userId, tid) as Row[];
  return rows.map(mapRow);
}

export function findMailAppliedLinkByReference(
  userId: number,
  reference: string
): MailAppliedLink | null {
  const ref = reference.trim();
  if (!ref) return null;
  const row = getDb()
    .prepare(
      `SELECT * FROM mail_applied_links
       WHERE user_id = ? AND reference = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(userId, ref) as Row | undefined;
  return row ? mapRow(row) : null;
}

/** Applied mail actions created today (Europe/Zurich date as YYYY-MM-DD). */
export function countMailAppliedToday(
  userId: number,
  todayIso: string
): number {
  const day = todayIso.slice(0, 10);
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as c FROM mail_applied_links
       WHERE user_id = ?
         AND substr(created_at, 1, 10) = ?`
    )
    .get(userId, day) as { c: number } | undefined;
  return row?.c ?? 0;
}

export function findPatchableEventInThread(
  userId: number,
  threadId: string | null | undefined,
  titleHint?: string | null
): MailAppliedLink | null {
  if (!threadId?.trim()) return null;
  const links = listMailAppliedLinksByThread(userId, threadId).filter(
    (l) => l.kind === "event" && l.googleEventId && l.calendarId
  );
  if (links.length === 0) return null;
  const hint = (titleHint || "").trim().toLowerCase();
  if (hint) {
    const match = links.find((l) => {
      const t = l.title.toLowerCase();
      return t.includes(hint.slice(0, 12)) || hint.includes(t.slice(0, 12));
    });
    if (match) return match;
  }
  return links[0] || null;
}
