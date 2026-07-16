import { getDb } from "./client";
import { bootstrapDatabase } from "./bootstrap";
import { nowIso } from "@/lib/utils/dates";

export function runMigrations(): void {
  bootstrapDatabase(getDb());
}

export function ensureInitialized(): void {
  // Opening the DB via getDb() always bootstraps schema when needed.
  getDb();
}

export function setSetting(key: string, value: string | null): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value, nowIso());
}

export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
    | { value: string | null }
    | undefined;
  return row?.value ?? null;
}
