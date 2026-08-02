import { createHash } from "crypto";
import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";

export type PushSubscriptionRow = {
  id: number;
  owner_key: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
};

export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

function endpointHash(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

export function upsertPushSubscription(
  ownerKey: string,
  input: PushSubscriptionInput,
  userAgent?: string | null
): PushSubscriptionRow {
  const db = getDb();
  const ts = nowIso();
  const hash = endpointHash(input.endpoint);
  db.prepare(
    `INSERT INTO push_subscriptions (
       owner_key, endpoint, endpoint_hash, p256dh, auth, user_agent, created_at, last_seen_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint_hash) DO UPDATE SET
       owner_key = excluded.owner_key,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       user_agent = COALESCE(excluded.user_agent, push_subscriptions.user_agent),
       last_seen_at = excluded.last_seen_at`
  ).run(
    ownerKey,
    input.endpoint,
    hash,
    input.keys.p256dh,
    input.keys.auth,
    userAgent?.trim() || null,
    ts,
    ts
  );
  return db
    .prepare(`SELECT * FROM push_subscriptions WHERE endpoint_hash = ?`)
    .get(hash) as PushSubscriptionRow;
}

export function deletePushSubscription(
  ownerKey: string,
  endpoint: string
): boolean {
  const info = getDb()
    .prepare(
      `DELETE FROM push_subscriptions WHERE owner_key = ? AND endpoint_hash = ?`
    )
    .run(ownerKey, endpointHash(endpoint));
  return info.changes > 0;
}

export function listAllPushSubscriptions(): PushSubscriptionRow[] {
  return getDb()
    .prepare(`SELECT * FROM push_subscriptions ORDER BY id ASC`)
    .all() as PushSubscriptionRow[];
}

export function deletePushSubscriptionRow(id: number): void {
  getDb().prepare(`DELETE FROM push_subscriptions WHERE id = ?`).run(id);
}
