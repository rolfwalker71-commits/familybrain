import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import path from "path";
import {
  ALL_APP_MODULES,
  normalizeAppModules,
  type AppModule,
} from "@/lib/users/modules";

export type UserGender = "male" | "female" | null;

export type AppUserRow = {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  display_name: string;
  gender: UserGender;
  avatar_path: string | null;
  avatar_prompt: string | null;
  active: number;
  show_today_hub: number;
  is_admin: number;
  mari_employee_number: string | null;
  mari_rest_username: string | null;
  mari_rest_password: string | null;
  created_at: string;
  updated_at: string;
};

export type AppUserPublic = Omit<
  AppUserRow,
  "password_hash" | "avatar_path" | "avatar_prompt" | "mari_rest_password"
> & {
  trip_ids: number[];
  ledger_ids: number[];
  modules: AppModule[];
  avatar_url: string | null;
  has_mari_password: boolean;
};

function normalizeGender(raw: string | null | undefined): UserGender {
  if (raw === "male" || raw === "female") return raw;
  return null;
}

function avatarUrlFromPath(avatarPath: string | null | undefined): string | null {
  if (!avatarPath) return null;
  return `/api/users/media/avatar/${encodeURIComponent(
    path.basename(avatarPath)
  )}`;
}

function mapPublic(
  row: AppUserRow,
  tripIds: number[],
  ledgerIds: number[],
  modules: AppModule[]
): AppUserPublic {
  const {
    password_hash: _hash,
    avatar_path,
    avatar_prompt: _prompt,
    mari_rest_password,
    ...rest
  } = row;
  return {
    ...rest,
    gender: normalizeGender(row.gender),
    mari_employee_number: row.mari_employee_number?.trim() || null,
    mari_rest_username: row.mari_rest_username?.trim() || null,
    has_mari_password: Boolean(mari_rest_password?.trim()),
    avatar_url: avatarUrlFromPath(avatar_path),
    trip_ids: tripIds,
    ledger_ids: ledgerIds,
    modules,
  };
}

function coerceUserRow(row: AppUserRow): AppUserRow {
  return {
    ...row,
    gender: normalizeGender(row.gender),
    avatar_path: row.avatar_path ?? null,
    avatar_prompt: row.avatar_prompt ?? null,
    show_today_hub: row.show_today_hub ? 1 : 0,
    is_admin: row.is_admin ? 1 : 0,
    mari_employee_number: row.mari_employee_number?.trim() || null,
    mari_rest_username: row.mari_rest_username?.trim() || null,
    mari_rest_password: row.mari_rest_password ?? null,
  };
}

export function listAppUsers(): AppUserPublic[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM users ORDER BY display_name COLLATE NOCASE, username COLLATE NOCASE, id`
    )
    .all() as AppUserRow[];
  return rows.map((row) =>
    mapPublic(
      coerceUserRow(row),
      listUserTripIds(row.id),
      listUserLedgerIds(row.id),
      listUserModules(row.id)
    )
  );
}

export function getAppUserById(id: number): AppUserRow | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM users WHERE id = ?`)
    .get(id) as AppUserRow | undefined;
  return row ? coerceUserRow(row) : null;
}

export function getAppUserByUsername(username: string): AppUserRow | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM users WHERE username = ? COLLATE NOCASE`)
    .get(username.trim()) as AppUserRow | undefined;
  return row ? coerceUserRow(row) : null;
}

export function getAppUserPublic(id: number): AppUserPublic | null {
  const row = getAppUserById(id);
  if (!row) return null;
  return mapPublic(
    row,
    listUserTripIds(id),
    listUserLedgerIds(id),
    listUserModules(id)
  );
}

export function createAppUser(input: {
  username: string;
  email: string;
  displayName: string;
  passwordHash: string;
  active?: boolean;
  gender?: UserGender;
  showTodayHub?: boolean;
  isAdmin?: boolean;
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
           (username, email, password_hash, display_name, gender, avatar_path, avatar_prompt, active, show_today_hub, is_admin, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)`
      )
      .run(
        username,
        email,
        input.passwordHash,
        displayName,
        input.gender ?? null,
        input.active === false ? 0 : 1,
        input.showTodayHub ? 1 : 0,
        input.isAdmin ? 1 : 0,
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
    gender?: UserGender;
    showTodayHub?: boolean;
    isAdmin?: boolean;
    mariEmployeeNumber?: string | null;
    mariRestUsername?: string | null;
    mariRestPassword?: string | null;
    clearMariRestPassword?: boolean;
  }
): AppUserRow {
  const existing = getAppUserById(id);
  if (!existing) throw new Error("Benutzer nicht gefunden");
  const db = getDb();
  let mariEmployeeNumber = existing.mari_employee_number;
  if (input.mariEmployeeNumber !== undefined) {
    const emp = input.mariEmployeeNumber?.trim() || null;
    if (emp && !/^[A-Za-z0-9]+$/.test(emp)) {
      throw new Error(
        "Personalnummer darf nur Buchstaben und Ziffern enthalten (z.B. M1010)."
      );
    }
    mariEmployeeNumber = emp;
  }
  let mariRestUsername = existing.mari_rest_username;
  if (input.mariRestUsername !== undefined) {
    mariRestUsername = input.mariRestUsername?.trim() || null;
  }
  let mariRestPassword = existing.mari_rest_password;
  if (input.clearMariRestPassword) {
    mariRestPassword = null;
  } else if (input.mariRestPassword != null && input.mariRestPassword.trim()) {
    mariRestPassword = input.mariRestPassword.trim();
  }
  // Personal login requires username + password + employee together.
  if (mariRestUsername && (!mariRestPassword || !mariEmployeeNumber)) {
    throw new Error(
      "Für persönliche MARI-Zugangsdaten bitte Benutzer, Passwort und Personalnummer setzen."
    );
  }
  if (!mariRestUsername) {
    mariRestPassword = null;
  }
  try {
    db.prepare(
      `UPDATE users SET
         username = ?,
         email = ?,
         password_hash = ?,
         display_name = ?,
         gender = ?,
         active = ?,
         show_today_hub = ?,
         is_admin = ?,
         mari_employee_number = ?,
         mari_rest_username = ?,
         mari_rest_password = ?,
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
      input.gender !== undefined ? input.gender : existing.gender,
      input.active !== undefined
        ? input.active
          ? 1
          : 0
        : existing.active,
      input.showTodayHub !== undefined
        ? input.showTodayHub
          ? 1
          : 0
        : existing.show_today_hub,
      input.isAdmin !== undefined
        ? input.isAdmin
          ? 1
          : 0
        : existing.is_admin,
      mariEmployeeNumber,
      mariRestUsername,
      mariRestPassword,
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

export function setUserAvatar(
  userId: number,
  input: {
    avatarPath: string | null;
    avatarPrompt: string | null;
  }
): AppUserRow {
  const existing = getAppUserById(userId);
  if (!existing) throw new Error("Benutzer nicht gefunden");
  getDb()
    .prepare(
      `UPDATE users SET avatar_path = ?, avatar_prompt = ?, updated_at = ? WHERE id = ?`
    )
    .run(input.avatarPath, input.avatarPrompt, nowIso(), userId);
  return getAppUserById(userId)!;
}

export function deleteAppUser(id: number): void {
  const existing = getAppUserById(id);
  if (!existing) throw new Error("Benutzer nicht gefunden");
  getDb().prepare(`DELETE FROM users WHERE id = ?`).run(id);
}

export function listUserTripIds(userId: number): number[] {
  const db = getDb();
  const fromAccess = (
    db
      .prepare(`SELECT trip_id FROM user_trip_access WHERE user_id = ?`)
      .all(userId) as Array<{ trip_id: number }>
  ).map((r) => r.trip_id);
  const fromTravelers = (
    db
      .prepare(
        `SELECT DISTINCT trip_id FROM trip_travelers
         WHERE user_id = ? AND trip_id IS NOT NULL`
      )
      .all(userId) as Array<{ trip_id: number }>
  ).map((r) => r.trip_id);
  return [...new Set([...fromAccess, ...fromTravelers])];
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
  const access = db
    .prepare(
      `SELECT 1 AS ok FROM user_trip_access WHERE user_id = ? AND trip_id = ?`
    )
    .get(userId, tripId) as { ok: number } | undefined;
  if (access) return true;
  const traveler = db
    .prepare(
      `SELECT 1 AS ok FROM trip_travelers WHERE user_id = ? AND trip_id = ?`
    )
    .get(userId, tripId) as { ok: number } | undefined;
  return Boolean(traveler);
}

/**
 * Limited users may only fetch Paperless files that are linked to a trip or
 * finance ledger they can access.
 */
export function userCanAccessPaperlessDocument(
  userId: number,
  paperlessId: number
): boolean {
  const db = getDb();
  const doc = db
    .prepare(
      `SELECT id FROM paperless_documents
       WHERE paperless_id = ?
         AND COALESCE(sync_status, 'synced') != 'missing'`
    )
    .get(paperlessId) as { id: number } | undefined;
  if (!doc) return false;

  const viaTripEvent = db
    .prepare(
      `SELECT 1 AS ok
       FROM trip_event_documents ted
       INNER JOIN trip_events te ON te.id = ted.trip_event_id
       WHERE ted.document_id = ?
         AND (
           EXISTS (
             SELECT 1 FROM user_trip_access uta
             WHERE uta.user_id = ? AND uta.trip_id = te.trip_id
           )
           OR EXISTS (
             SELECT 1 FROM trip_travelers tt
             WHERE tt.user_id = ? AND tt.trip_id = te.trip_id
           )
         )
       LIMIT 1`
    )
    .get(doc.id, userId, userId) as { ok: number } | undefined;
  if (viaTripEvent) return true;

  const viaLegacyEventDoc = db
    .prepare(
      `SELECT 1 AS ok
       FROM trip_events te
       WHERE te.document_id = ?
         AND (
           EXISTS (
             SELECT 1 FROM user_trip_access uta
             WHERE uta.user_id = ? AND uta.trip_id = te.trip_id
           )
           OR EXISTS (
             SELECT 1 FROM trip_travelers tt
             WHERE tt.user_id = ? AND tt.trip_id = te.trip_id
           )
         )
       LIMIT 1`
    )
    .get(doc.id, userId, userId) as { ok: number } | undefined;
  if (viaLegacyEventDoc) return true;

  const viaExpense = db
    .prepare(
      `SELECT 1 AS ok
       FROM finance_expenses fe
       INNER JOIN user_ledger_access ula
         ON ula.ledger_id = fe.ledger_id AND ula.user_id = ?
       WHERE fe.document_id = ?
       LIMIT 1`
    )
    .get(userId, doc.id) as { ok: number } | undefined;
  return Boolean(viaExpense);
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

export function listUserModules(userId: number): AppModule[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT module FROM user_module_access WHERE user_id = ?`)
    .all(userId) as Array<{ module: string }>;
  return normalizeAppModules(rows.map((r) => r.module));
}

/** Effective modules: admins get all; others from ACL (+ travel/finance if resources). */
export function effectiveUserModules(
  userId: number,
  isAdmin: boolean
): AppModule[] {
  if (isAdmin) return [...ALL_APP_MODULES];
  const modules = new Set(listUserModules(userId));
  if (listUserTripIds(userId).length > 0) modules.add("travel");
  if (listUserLedgerIds(userId).length > 0) modules.add("finance");
  return normalizeAppModules([...modules]);
}

export function userHasModule(
  userId: number,
  module: AppModule,
  isAdmin = false
): boolean {
  if (isAdmin) return true;
  return effectiveUserModules(userId, false).includes(module);
}

export function setUserModules(userId: number, modules: AppModule[]): void {
  const existing = getAppUserById(userId);
  if (!existing) throw new Error("Benutzer nicht gefunden");
  const normalized = normalizeAppModules(modules);
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM user_module_access WHERE user_id = ?`).run(userId);
    const insert = db.prepare(
      `INSERT INTO user_module_access (user_id, module) VALUES (?, ?)`
    );
    for (const module of normalized) {
      insert.run(userId, module);
    }
  });
  tx();
}

export function setUserAccess(
  userId: number,
  input: {
    tripIds: number[];
    ledgerIds: number[];
    modules?: AppModule[];
  }
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
  const modules = new Set(normalizeAppModules(input.modules ?? []));
  if (tripIds.length > 0) modules.add("travel");
  if (ledgerIds.length > 0) modules.add("finance");

  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM user_trip_access WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM user_ledger_access WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM user_module_access WHERE user_id = ?`).run(userId);
    const insertTrip = db.prepare(
      `INSERT INTO user_trip_access (user_id, trip_id) VALUES (?, ?)`
    );
    const insertLedger = db.prepare(
      `INSERT INTO user_ledger_access (user_id, ledger_id) VALUES (?, ?)`
    );
    const insertModule = db.prepare(
      `INSERT INTO user_module_access (user_id, module) VALUES (?, ?)`
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
    for (const module of modules) {
      insertModule.run(userId, module);
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
  db.prepare(
    `INSERT OR IGNORE INTO user_module_access (user_id, module) VALUES (?, 'finance')`
  ).run(userId);
}

export function grantTripAccess(userId: number, tripId: number): void {
  if (!getAppUserById(userId)) throw new Error("Benutzer nicht gefunden");
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO user_trip_access (user_id, trip_id) VALUES (?, ?)`
  ).run(userId, tripId);
  db.prepare(
    `INSERT OR IGNORE INTO user_module_access (user_id, module) VALUES (?, 'travel')`
  ).run(userId);
}
