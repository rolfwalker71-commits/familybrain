import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { bootstrapDatabase } from "./bootstrap";

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
  if (globalForDb.familybrainDb && globalForDb.familybrainInitialized) {
    return globalForDb.familybrainDb;
  }

  if (globalForDb.familybrainDb && !globalForDb.familybrainInitialized) {
    // Previous open without successful bootstrap – close and retry.
    try {
      globalForDb.familybrainDb.close();
    } catch {
      /* ignore */
    }
    globalForDb.familybrainDb = undefined;
  }

  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  globalForDb.familybrainDb = db;

  try {
    bootstrapDatabase(db);
    globalForDb.familybrainInitialized = true;
  } catch (error) {
    globalForDb.familybrainInitialized = false;
    try {
      db.close();
    } catch {
      /* ignore */
    }
    globalForDb.familybrainDb = undefined;
    throw error;
  }

  return db;
}

export function getDatabasePath(): string {
  return resolveDbPath();
}
