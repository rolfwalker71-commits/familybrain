import type Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { KNOWLEDGE_AREAS } from "@/lib/extraction/categories";

/**
 * Apply schema + seed data to an open DB connection.
 * Must NOT import getDb() — kept free of circular deps with client.ts.
 */
export function bootstrapDatabase(db: Database.Database): void {
  const schemaPath = path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    "lib",
    "db",
    "schema.sql"
  );
  const schema = fs.readFileSync(schemaPath, "utf8");
  db.exec(schema);

  const cols = db.prepare(`PRAGMA table_info(financial_items)`).all() as Array<{
    name: string;
  }>;
  if (!cols.some((c) => c.name === "counts_in_stats")) {
    db.exec(
      `ALTER TABLE financial_items ADD COLUMN counts_in_stats INTEGER NOT NULL DEFAULT 1`
    );
  }

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
