import { createHash, randomBytes } from "crypto";
import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import { parseOwnerKey } from "@/lib/auth/owner-key";
import { getAppUserById } from "@/lib/users/queries";
import type { AuthContext } from "@/lib/auth/current-user";

export type DeviceTokenRow = {
  id: number;
  owner_key: string;
  label: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createDeviceToken(
  ownerKey: string,
  label: string
): { row: DeviceTokenRow; token: string } {
  const db = getDb();
  const token = `buddy_${randomBytes(32).toString("base64url")}`;
  const ts = nowIso();
  const prefix = token.slice(0, 12);
  const result = db
    .prepare(
      `INSERT INTO device_tokens (
         owner_key, label, token_hash, token_prefix, created_at, last_used_at, revoked_at
       ) VALUES (?, ?, ?, ?, ?, NULL, NULL)`
    )
    .run(ownerKey, label.trim().slice(0, 80) || "Android", hashToken(token), prefix, ts);
  const row = db
    .prepare(`SELECT id, owner_key, label, token_prefix, created_at, last_used_at, revoked_at
              FROM device_tokens WHERE id = ?`)
    .get(Number(result.lastInsertRowid)) as DeviceTokenRow;
  return { row, token };
}

export function listDeviceTokens(ownerKey: string): DeviceTokenRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, owner_key, label, token_prefix, created_at, last_used_at, revoked_at
       FROM device_tokens
       WHERE owner_key = ?
       ORDER BY id DESC`
    )
    .all(ownerKey) as DeviceTokenRow[];
}

export function revokeDeviceToken(ownerKey: string, id: number): boolean {
  const db = getDb();
  const info = db
    .prepare(
      `UPDATE device_tokens SET revoked_at = ?
       WHERE id = ? AND owner_key = ? AND revoked_at IS NULL`
    )
    .run(nowIso(), id, ownerKey);
  return info.changes > 0;
}

export function resolveDeviceTokenAuth(
  bearerToken: string
): AuthContext | null {
  const token = bearerToken.trim();
  if (!token.startsWith("buddy_") || token.length < 20) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, owner_key FROM device_tokens
       WHERE token_hash = ? AND revoked_at IS NULL`
    )
    .get(hashToken(token)) as
    | { id: number; owner_key: string }
    | undefined;
  if (!row) return null;

  db.prepare(`UPDATE device_tokens SET last_used_at = ? WHERE id = ?`).run(
    nowIso(),
    row.id
  );

  const parsed = parseOwnerKey(row.owner_key);
  if (!parsed) return null;
  if (parsed.kind === "admin") {
    return {
      kind: "admin",
      username: "admin",
      userId: null,
      isAdmin: true,
    };
  }
  const user = getAppUserById(parsed.userId);
  if (!user || !user.active) return null;
  return {
    kind: "user",
    username: user.username,
    userId: user.id,
    isAdmin: Boolean(user.is_admin),
  };
}
