import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";

export type TelegramActionPayload =
  | {
      type: "doc_triage";
      documentLocalId: number;
      action: "pay" | "ignore" | "done" | "snooze";
    }
  | {
      type: "cal_done";
      provider: "google" | "microsoft";
      calendarId: string;
      eventId: string;
      title?: string;
    }
  | { type: "noop"; label?: string };

const DEFAULT_TTL_HOURS = 72;

function pruneExpired(): void {
  try {
    getDb()
      .prepare(`DELETE FROM telegram_action_tokens WHERE expires_at < ?`)
      .run(nowIso());
  } catch {
    /* table may not exist yet during early boot */
  }
}

export function createTelegramActionToken(
  payload: TelegramActionPayload,
  ttlHours = DEFAULT_TTL_HOURS
): string {
  pruneExpired();
  const token = randomBytes(9).toString("base64url"); // ~12 chars
  const created = nowIso();
  const expires = new Date(Date.now() + ttlHours * 3600_000).toISOString();
  getDb()
    .prepare(
      `INSERT INTO telegram_action_tokens
         (token, kind, payload, message_id, created_at, expires_at, consumed_at)
       VALUES (?, ?, ?, NULL, ?, ?, NULL)`
    )
    .run(token, payload.type, JSON.stringify(payload), created, expires);
  return token;
}

export function bindTelegramActionTokensToMessage(
  tokens: string[],
  messageId: number
): void {
  if (!tokens.length || !Number.isFinite(messageId)) return;
  const db = getDb();
  const stmt = db.prepare(
    `UPDATE telegram_action_tokens SET message_id = ? WHERE token = ? AND consumed_at IS NULL`
  );
  const tx = db.transaction(() => {
    for (const t of tokens) stmt.run(messageId, t);
  });
  tx();
}

export function getTelegramActionPayload(
  token: string
): TelegramActionPayload | null {
  const row = getDb()
    .prepare(
      `SELECT payload, expires_at, consumed_at
       FROM telegram_action_tokens WHERE token = ?`
    )
    .get(token) as
    | { payload: string; expires_at: string; consumed_at: string | null }
    | undefined;
  if (!row) return null;
  if (row.consumed_at) return null;
  if (row.expires_at < nowIso()) return null;
  try {
    return JSON.parse(row.payload) as TelegramActionPayload;
  } catch {
    return null;
  }
}

export function consumeTelegramActionToken(token: string): boolean {
  const result = getDb()
    .prepare(
      `UPDATE telegram_action_tokens
       SET consumed_at = ?
       WHERE token = ? AND consumed_at IS NULL AND expires_at >= ?`
    )
    .run(nowIso(), token, nowIso());
  return result.changes > 0;
}

export function listTelegramActionsForMessage(
  messageId: number
): Array<{ token: string; payload: TelegramActionPayload }> {
  const rows = getDb()
    .prepare(
      `SELECT token, payload FROM telegram_action_tokens
       WHERE message_id = ? AND consumed_at IS NULL AND expires_at >= ?`
    )
    .all(messageId, nowIso()) as Array<{ token: string; payload: string }>;
  const out: Array<{ token: string; payload: TelegramActionPayload }> = [];
  for (const row of rows) {
    try {
      out.push({
        token: row.token,
        payload: JSON.parse(row.payload) as TelegramActionPayload,
      });
    } catch {
      /* skip */
    }
  }
  return out;
}
