import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";

export type AppUserRow = {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  display_name: string;
  active: number;
  created_at: string;
  updated_at: string;
};

export type AppUserPublic = Omit<AppUserRow, "password_hash"> & {
  trip_ids: number[];
  ledger_ids: number[];
};

function mapPublic(
  row: AppUserRow,
  tripIds: number[],
  ledgerIds: number[]
): AppUserPublic {
  const { password_hash: _hash, ...rest } = row;
  return { ...rest, trip_ids: tripIds, ledger_ids: ledgerIds };
}

export function listAppUsers(): AppUserPublic[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM users ORDER BY display_name COLLATE NOCASE, username COLLATE NOCASE, id`
    )
    .all() as AppUserRow[];
  return rows.map((row) =>
    mapPublic(row, listUserTripIds(row.id), listUserLedgerIds(row.id))
  );
}

export function getAppUserById(id: number): AppUserRow | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM users WHERE id = ?`)
    .get(id) as AppUserRow | undefined;
  return row ?? null;
}

export function getAppUserByUsername(username: string): AppUserRow | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM users WHERE username = ? COLLATE NOCASE`)
    .get(username.trim()) as AppUserRow | undefined;
  return row ?? null;
}

export function getAppUserPublic(id: number): AppUserPublic | null {
  const row = getAppUserById(id);
  if (!row) return null;
  return mapPublic(row, listUserTripIds(id), listUserLedgerIds(id));
}

export function createAppUser(input: {
  username: string;
  email: string;
  displayName: string;
  passwordHash: string;
  active?: boolean;
}): AppUserRow {
  const db = getDb();
  const ts = nowIso();
  const username = input.username.trim();
  const email = input.email.trim();
  const displayName = input.displayName.trim() || username;
  if (!username) throw new Error("Benutzername fehlt");
  if (!email) throw new Error("E-Mail fehlt");
  if (!input.passwordHash) throw new Error("Passwort-Hash fehlt");
  try {
    const result = db
      .prepare(
        `INSERT INTO users
           (username, email, password_hash, display_name, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        username,
        email,
        input.passwordHash,
        displayName,
        input.active === false ? 0 : 1,
        ts,
        ts
      );
    return getAppUserById(Number(result.lastInsertRowid))!;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE")) {
      throw new Error("Benutzername ist bereits vergeben");
    }
    throw error;
  }
}

export function updateAppUser(
  id: number,
  input: {
    username?: string;
    email?: string;
    displayName?: string;
    passwordHash?: string;
    active?: boolean;
  }
): AppUserRow {
  const existing = getAppUserById(id);
  if (!existing) throw new Error("Benutzer nicht gefunden");
  const db = getDb();
  try {
    db.prepare(
      `UPDATE users SET
         username = ?,
         email = ?,
         password_hash = ?,
         display_name = ?,
         active = ?,
         updated_at = ?
       WHERE id = ?`
    ).run(
      input.username !== undefined ? input.username.trim() : existing.username,
      input.email !== undefined ? input.email.trim() : existing.email,
      input.passwordHash !== undefined
        ? input.passwordHash
        : existing.password_hash,
      input.displayName !== undefined
        ? input.displayName.trim() || existing.display_name
        : existing.display_name,
      input.active !== undefined
        ? input.active
          ? 1
          : 0
        : existing.active,
      nowIso(),
      id
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE")) {
      throw new Error("Benutzername ist bereits vergeben");
    }
    throw error;
  }
  return getAppUserById(id)!;
}

export function deleteAppUser(id: number): void {
  const existing = getAppUserById(id);
  if (!existing) throw new Error("Benutzer nicht gefunden");
  getDb().prepare(`DELETE FROM users WHERE id = ?`).run(id);
}

export function listUserTripIds(userId: number): number[] {
  const db = getDb();
  return (
    db
      .prepare(`SELECT trip_id FROM user_trip_access WHERE user_id = ?`)
      .all(userId) as Array<{ trip_id: number }>
  ).map((r) => r.trip_id);
}

export function listUserLedgerIds(userId: number): number[] {
  const db = getDb();
  return (
    db
      .prepare(`SELECT ledger_id FROM user_ledger_access WHERE user_id = ?`)
      .all(userId) as Array<{ ledger_id: number }>
  ).map((r) => r.ledger_id);
}

export function userHasTripAccess(userId: number, tripId: number): boolean {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM user_trip_access WHERE user_id = ? AND trip_id = ?`
    )
    .get(userId, tripId) as { ok: number } | undefined;
  return Boolean(row);
}

export function userHasLedgerAccess(userId: number, ledgerId: number): boolean {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM user_ledger_access WHERE user_id = ? AND ledger_id = ?`
    )
    .get(userId, ledgerId) as { ok: number } | undefined;
  return Boolean(row);
}

export function setUserAccess(
  userId: number,
  input: { tripIds: number[]; ledgerIds: number[] }
): AppUserPublic {
  const existing = getAppUserById(userId);
  if (!existing) throw new Error("Benutzer nicht gefunden");
  const db = getDb();
  const tripIds = [
    ...new Set(
      input.tripIds.filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];
  const ledgerIds = [
    ...new Set(
      input.ledgerIds.filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM user_trip_access WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM user_ledger_access WHERE user_id = ?`).run(userId);
    const insertTrip = db.prepare(
      `INSERT INTO user_trip_access (user_id, trip_id) VALUES (?, ?)`
    );
    const insertLedger = db.prepare(
      `INSERT INTO user_ledger_access (user_id, ledger_id) VALUES (?, ?)`
    );
    for (const tripId of tripIds) {
      const trip = db
        .prepare(`SELECT id FROM trips WHERE id = ?`)
        .get(tripId) as { id: number } | undefined;
      if (!trip) throw new Error(`Reise ${tripId} nicht gefunden`);
      insertTrip.run(userId, tripId);
    }
    for (const ledgerId of ledgerIds) {
      const ledger = db
        .prepare(`SELECT id FROM finance_ledgers WHERE id = ?`)
        .get(ledgerId) as { id: number } | undefined;
      if (!ledger) throw new Error(`Abrechnung ${ledgerId} nicht gefunden`);
      insertLedger.run(userId, ledgerId);
    }
  });
  tx();
  return getAppUserPublic(userId)!;
}

export function grantLedgerAccess(userId: number, ledgerId: number): void {
  if (!getAppUserById(userId)) throw new Error("Benutzer nicht gefunden");
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO user_ledger_access (user_id, ledger_id) VALUES (?, ?)`
  ).run(userId, ledgerId);
}

export function grantTripAccess(userId: number, tripId: number): void {
  if (!getAppUserById(userId)) throw new Error("Benutzer nicht gefunden");
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO user_trip_access (user_id, trip_id) VALUES (?, ?)`
  ).run(userId, tripId);
}
