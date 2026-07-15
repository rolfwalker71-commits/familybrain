import fs from "fs";
import path from "path";
import { getDb } from "./client";
import { KNOWLEDGE_AREAS } from "@/lib/extraction/categories";
import { nowIso } from "@/lib/utils/dates";

function ensureColumn(
  table: string,
  column: string,
  definition: string
): void {
  const db = getDb();
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function runMigrations(): void {
  const db = getDb();
  const schemaPath = path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    "lib",
    "db",
    "schema.sql"
  );
  const schema = fs.readFileSync(schemaPath, "utf8");
  db.exec(schema);

  ensureColumn(
    "financial_items",
    "counts_in_stats",
    "INTEGER NOT NULL DEFAULT 1"
  );

  const insertArea = db.prepare(
    `INSERT OR IGNORE INTO knowledge_areas (name, description) VALUES (?, ?)`
  );

  const seed = db.transaction(() => {
    for (const area of KNOWLEDGE_AREAS) {
      insertArea.run(area.name, area.description);
    }
  });
  seed();
}

export function ensureInitialized(): void {
  runMigrations();
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
