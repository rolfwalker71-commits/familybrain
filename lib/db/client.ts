import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { ensureInitialized } from "./migrations";

const globalForDb = globalThis as unknown as {
  familybrainDb?: Database.Database;
  familybrainInitialized?: boolean;
};

function resolveDbPath(): string {
  const configured = process.env.DATABASE_PATH;
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(/*turbopackIgnore: true*/ process.cwd(), configured);
  }
  return path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    "data",
    "familybrain.sqlite"
  );
}

export function getDb(): Database.Database {
  if (globalForDb.familybrainDb) {
    return globalForDb.familybrainDb;
  }

  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  // Wait instead of throwing SQLITE_BUSY when another process/worker
  // (e.g. parallel Next build workers) holds a short-lived write lock.
  db.pragma("busy_timeout = 5000");

  // Assign before running migrations so the re-entrant getDb() calls inside
  // ensureInitialized() reuse this instance instead of recursing.
  globalForDb.familybrainDb = db;

  if (!globalForDb.familybrainInitialized) {
    globalForDb.familybrainInitialized = true;
    ensureInitialized();
  }

  return db;
}

export function getDatabasePath(): string {
  return resolveDbPath();
}
