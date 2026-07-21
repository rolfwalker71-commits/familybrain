import { randomBytes } from "crypto";
import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import { getTripById, type TripRow } from "@/lib/trips/queries";

export type TripShareLinkRow = {
  id: number;
  trip_id: number;
  token: string;
  label: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export function listTripShareLinks(tripId: number): TripShareLinkRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM trip_share_links
       WHERE trip_id = ?
       ORDER BY created_at DESC, id DESC`
    )
    .all(tripId) as TripShareLinkRow[];
}

export function getActiveTripShareLinkByToken(
  token: string
): (TripShareLinkRow & { trip: TripRow }) | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM trip_share_links
       WHERE token = ? AND revoked_at IS NULL
       LIMIT 1`
    )
    .get(trimmed) as TripShareLinkRow | undefined;
  if (!row) return null;
  if (row.expires_at) {
    const exp = Date.parse(row.expires_at);
    if (Number.isFinite(exp) && exp < Date.now()) return null;
  }
  const trip = getTripById(row.trip_id);
  if (!trip) return null;
  return { ...row, trip };
}

export function createTripShareLink(
  tripId: number,
  label?: string | null
): TripShareLinkRow {
  const trip = getTripById(tripId);
  if (!trip) throw new Error("Reise nicht gefunden");
  const db = getDb();
  const token = newToken();
  const ts = nowIso();
  const result = db
    .prepare(
      `INSERT INTO trip_share_links (trip_id, token, label, created_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, NULL, NULL)`
    )
    .run(tripId, token, label?.trim() || null, ts);
  const row = db
    .prepare(`SELECT * FROM trip_share_links WHERE id = ?`)
    .get(Number(result.lastInsertRowid)) as TripShareLinkRow;
  return row;
}

export function revokeTripShareLink(
  tripId: number,
  shareId: number
): TripShareLinkRow | null {
  const db = getDb();
  const existing = db
    .prepare(`SELECT * FROM trip_share_links WHERE id = ? AND trip_id = ?`)
    .get(shareId, tripId) as TripShareLinkRow | undefined;
  if (!existing) return null;
  if (!existing.revoked_at) {
    db.prepare(
      `UPDATE trip_share_links SET revoked_at = ? WHERE id = ?`
    ).run(nowIso(), shareId);
  }
  return db
    .prepare(`SELECT * FROM trip_share_links WHERE id = ?`)
    .get(shareId) as TripShareLinkRow;
}

export function getLatestActiveShareLink(
  tripId: number
): TripShareLinkRow | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM trip_share_links
       WHERE trip_id = ?
         AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at DESC, id DESC
       LIMIT 1`
    )
    .get(tripId, nowIso()) as TripShareLinkRow | undefined;
  return row ?? null;
}
