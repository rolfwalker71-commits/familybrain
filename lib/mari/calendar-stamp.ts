/**
 * Stamp calendar events created from Maringo tickets so evening processing
 * can suggest time bookings.
 */
import { getDb } from "@/lib/db/client";

/** Outlook category for any Maringo-origin event. */
export const BUDDY_MARI_CATEGORY = "Buddy/Maringo";

/** Google private extended property keys. */
export const GOOGLE_BUDDY_MARI_ISSUE_PROP = "buddyMariIssueId";
export const GOOGLE_BUDDY_SOURCE_PROP = "buddySource";

/** Body/description marker (Outlook + Google fallback). */
export const BUDDY_MARI_BODY_MARKER_RE = /\[\[buddy:mari:(\d+)\]\]/i;

export function buddyMariIssueCategory(issueId: number): string {
  return `Buddy/Mari#${issueId}`;
}

export function parseMariIssueIdFromCategories(
  categories: string[] | null | undefined
): number | null {
  for (const c of categories || []) {
    const m = /^Buddy\/Mari#(\d+)$/i.exec(c.trim());
    if (m) return Number(m[1]);
  }
  return null;
}

export function parseMariIssueIdFromBody(
  body: string | null | undefined
): number | null {
  const m = BUDDY_MARI_BODY_MARKER_RE.exec(body || "");
  return m ? Number(m[1]) : null;
}

export function appendMariBodyMarker(
  notes: string | null | undefined,
  issueId: number
): string {
  const base = (notes || "").trim();
  const marker = `[[buddy:mari:${issueId}]]`;
  if (base.includes(marker)) return base;
  return base ? `${base}\n\n${marker}` : marker;
}

export function mariOutlookCategories(issueId: number): string[] {
  return [BUDDY_MARI_CATEGORY, buddyMariIssueCategory(issueId)];
}

export function mariGooglePrivateProps(
  issueId: number
): Record<string, string> {
  return {
    [GOOGLE_BUDDY_SOURCE_PROP]: "maringo",
    [GOOGLE_BUDDY_MARI_ISSUE_PROP]: String(issueId),
  };
}

export function hoursBetweenHm(
  startHm: string,
  endHm: string
): number | null {
  const parse = (hm: string) => {
    const [h, m] = hm.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };
  const a = parse(startHm);
  const b = parse(endHm);
  if (a == null || b == null || b <= a) return null;
  const hours = (b - a) / 60;
  // Round to quarter hours for MARI.
  return Math.round(hours * 4) / 4;
}

export type MariCalendarStampStatus = "pending" | "booked" | "dismissed";

export type MariCalendarStamp = {
  eventProvider: "microsoft" | "google";
  eventId: string;
  calendarId: string | null;
  issueId: number;
  eventDate: string;
  startHm: string | null;
  endHm: string | null;
  title: string;
  memo: string | null;
  hours: number | null;
  status: MariCalendarStampStatus;
  bookedLineId: number | null;
  createdAt: string;
  updatedAt: string;
};

export function ensureMariCalendarStampsTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS mari_calendar_stamps (
      event_provider TEXT NOT NULL,
      event_id TEXT NOT NULL,
      calendar_id TEXT,
      issue_id INTEGER NOT NULL,
      event_date TEXT NOT NULL,
      start_hm TEXT,
      end_hm TEXT,
      title TEXT NOT NULL,
      memo TEXT,
      hours REAL,
      status TEXT NOT NULL DEFAULT 'pending',
      booked_line_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (event_provider, event_id)
    );
    CREATE INDEX IF NOT EXISTS idx_mari_calendar_stamps_pending
      ON mari_calendar_stamps(status, event_date);
    CREATE INDEX IF NOT EXISTS idx_mari_calendar_stamps_issue
      ON mari_calendar_stamps(issue_id, event_date);
  `);
}

export function upsertMariCalendarStamp(input: {
  eventProvider: "microsoft" | "google";
  eventId: string;
  calendarId?: string | null;
  issueId: number;
  eventDate: string;
  startHm?: string | null;
  endHm?: string | null;
  title: string;
  memo?: string | null;
  hours?: number | null;
}): MariCalendarStamp {
  ensureMariCalendarStampsTable();
  const db = getDb();
  const now = new Date().toISOString();
  const hours =
    input.hours ??
    (input.startHm && input.endHm
      ? hoursBetweenHm(input.startHm, input.endHm)
      : null);
  db.prepare(
    `INSERT INTO mari_calendar_stamps (
      event_provider, event_id, calendar_id, issue_id, event_date,
      start_hm, end_hm, title, memo, hours, status, booked_line_id,
      created_at, updated_at
    ) VALUES (
      @eventProvider, @eventId, @calendarId, @issueId, @eventDate,
      @startHm, @endHm, @title, @memo, @hours, 'pending', NULL,
      @now, @now
    )
    ON CONFLICT(event_provider, event_id) DO UPDATE SET
      calendar_id = excluded.calendar_id,
      issue_id = excluded.issue_id,
      event_date = excluded.event_date,
      start_hm = excluded.start_hm,
      end_hm = excluded.end_hm,
      title = excluded.title,
      memo = excluded.memo,
      hours = excluded.hours,
      updated_at = excluded.updated_at
    WHERE mari_calendar_stamps.status = 'pending'`
  ).run({
    eventProvider: input.eventProvider,
    eventId: input.eventId,
    calendarId: input.calendarId ?? null,
    issueId: input.issueId,
    eventDate: input.eventDate,
    startHm: input.startHm ?? null,
    endHm: input.endHm ?? null,
    title: input.title.trim() || `Ticket #${input.issueId}`,
    memo: input.memo?.trim() || null,
    hours,
    now,
  });
  return getMariCalendarStamp(input.eventProvider, input.eventId)!;
}

export function getMariCalendarStamp(
  eventProvider: "microsoft" | "google",
  eventId: string
): MariCalendarStamp | null {
  ensureMariCalendarStampsTable();
  const row = getDb()
    .prepare(
      `SELECT * FROM mari_calendar_stamps
       WHERE event_provider = ? AND event_id = ?`
    )
    .get(eventProvider, eventId) as Record<string, unknown> | undefined;
  return row ? mapStampRow(row) : null;
}

export function listPendingMariCalendarStamps(opts?: {
  onOrBeforeDate?: string;
  onDate?: string;
}): MariCalendarStamp[] {
  ensureMariCalendarStampsTable();
  const db = getDb();
  let sql = `SELECT * FROM mari_calendar_stamps WHERE status = 'pending'`;
  const params: string[] = [];
  if (opts?.onDate) {
    sql += ` AND event_date = ?`;
    params.push(opts.onDate);
  } else if (opts?.onOrBeforeDate) {
    sql += ` AND event_date <= ?`;
    params.push(opts.onOrBeforeDate);
  }
  sql += ` ORDER BY event_date ASC, start_hm ASC, created_at ASC`;
  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map(mapStampRow);
}

/** Active (pending/booked) stamps for a ticket, newest event first. */
export function listMariCalendarStampsForIssue(
  issueId: number
): MariCalendarStamp[] {
  if (!Number.isInteger(issueId) || issueId <= 0) return [];
  ensureMariCalendarStampsTable();
  const rows = getDb()
    .prepare(
      `SELECT * FROM mari_calendar_stamps
       WHERE issue_id = ? AND status IN ('pending', 'booked')
       ORDER BY event_date DESC, start_hm DESC, created_at DESC`
    )
    .all(issueId) as Array<Record<string, unknown>>;
  return rows.map(mapStampRow);
}

/**
 * Prefer the next upcoming stamp for a ticket; otherwise the latest past one.
 */
export function getPrimaryMariCalendarStampForIssue(
  issueId: number,
  todayYmd: string
): MariCalendarStamp | null {
  const stamps = listMariCalendarStampsForIssue(issueId);
  if (stamps.length === 0) return null;
  const upcoming = stamps
    .filter((s) => s.eventDate >= todayYmd)
    .sort((a, b) => {
      const d = a.eventDate.localeCompare(b.eventDate);
      if (d !== 0) return d;
      return (a.startHm || "").localeCompare(b.startHm || "");
    });
  return upcoming[0] || stamps[0] || null;
}

function pickPrimaryStamp(
  stamps: MariCalendarStamp[],
  todayYmd: string
): MariCalendarStamp | null {
  if (stamps.length === 0) return null;
  const upcoming = stamps
    .filter((s) => s.eventDate >= todayYmd)
    .sort((a, b) => {
      const d = a.eventDate.localeCompare(b.eventDate);
      if (d !== 0) return d;
      return (a.startHm || "").localeCompare(b.startHm || "");
    });
  return upcoming[0] || stamps[0] || null;
}

/** Primary active stamp per issue (for ticket list chips). */
export function mapPrimaryMariCalendarStampsByIssueIds(
  issueIds: number[],
  todayYmd: string
): Record<number, MariCalendarStamp> {
  const ids = [
    ...new Set(
      issueIds.filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];
  if (ids.length === 0) return {};
  ensureMariCalendarStampsTable();
  const placeholders = ids.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT * FROM mari_calendar_stamps
       WHERE issue_id IN (${placeholders})
         AND status IN ('pending', 'booked')
       ORDER BY event_date DESC, start_hm DESC, created_at DESC`
    )
    .all(...ids) as Array<Record<string, unknown>>;
  const byIssue = new Map<number, MariCalendarStamp[]>();
  for (const row of rows) {
    const stamp = mapStampRow(row);
    const list = byIssue.get(stamp.issueId) || [];
    list.push(stamp);
    byIssue.set(stamp.issueId, list);
  }
  const out: Record<number, MariCalendarStamp> = {};
  for (const id of ids) {
    const primary = pickPrimaryStamp(byIssue.get(id) || [], todayYmd);
    if (primary) out[id] = primary;
  }
  return out;
}

export function updateMariCalendarStampStatus(input: {
  eventProvider: "microsoft" | "google";
  eventId: string;
  status: MariCalendarStampStatus;
  bookedLineId?: number | null;
}): MariCalendarStamp | null {
  ensureMariCalendarStampsTable();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE mari_calendar_stamps
       SET status = @status,
           booked_line_id = COALESCE(@bookedLineId, booked_line_id),
           updated_at = @now
       WHERE event_provider = @eventProvider AND event_id = @eventId`
    )
    .run({
      eventProvider: input.eventProvider,
      eventId: input.eventId,
      status: input.status,
      bookedLineId: input.bookedLineId ?? null,
      now,
    });
  return getMariCalendarStamp(input.eventProvider, input.eventId);
}

function mapStampRow(row: Record<string, unknown>): MariCalendarStamp {
  return {
    eventProvider: row.event_provider as "microsoft" | "google",
    eventId: String(row.event_id),
    calendarId: (row.calendar_id as string) || null,
    issueId: Number(row.issue_id),
    eventDate: String(row.event_date),
    startHm: (row.start_hm as string) || null,
    endHm: (row.end_hm as string) || null,
    title: String(row.title || ""),
    memo: (row.memo as string) || null,
    hours: row.hours == null ? null : Number(row.hours),
    status: row.status as MariCalendarStampStatus,
    bookedLineId:
      row.booked_line_id == null ? null : Number(row.booked_line_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
