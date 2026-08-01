import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import {
  BUILTIN_KNOWLEDGE_AREA_NAMES,
  KNOWLEDGE_AREAS,
} from "@/lib/extraction/categories";

export type KnowledgeAreaRow = {
  id: number;
  name: string;
  description: string | null;
  isBuiltin: boolean;
};

export function listKnowledgeAreas(): KnowledgeAreaRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, name, description FROM knowledge_areas ORDER BY name COLLATE NOCASE`
    )
    .all() as Array<{ id: number; name: string; description: string | null }>;
  return rows.map((r) => ({
    ...r,
    isBuiltin: BUILTIN_KNOWLEDGE_AREA_NAMES.has(r.name as never),
  }));
}

export function getKnowledgeAreaByName(
  name: string
): KnowledgeAreaRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, name, description FROM knowledge_areas WHERE name = ? COLLATE NOCASE`
    )
    .get(name.trim()) as
    | { id: number; name: string; description: string | null }
    | undefined;
  if (!row) return null;
  return {
    ...row,
    isBuiltin: BUILTIN_KNOWLEDGE_AREA_NAMES.has(row.name as never),
  };
}

export function isKnownKnowledgeArea(name: string): boolean {
  return getKnowledgeAreaByName(name) != null;
}

export function ensureBuiltinKnowledgeAreas(): void {
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO knowledge_areas (name, description) VALUES (?, ?)`
  );
  const updateDesc = db.prepare(
    `UPDATE knowledge_areas SET description = ? WHERE name = ? AND (description IS NULL OR description = '')`
  );
  const tx = db.transaction(() => {
    for (const area of KNOWLEDGE_AREAS) {
      insert.run(area.name, area.description);
      updateDesc.run(area.description, area.name);
    }
  });
  tx();
}

/**
 * Create a custom knowledge area. Returns error if name invalid/duplicate.
 */
export function createKnowledgeArea(input: {
  name: string;
  description?: string | null;
}): { ok: boolean; error?: string; area?: KnowledgeAreaRow } {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 60) {
    return { ok: false, error: "Name muss 2–60 Zeichen haben." };
  }
  if (/[<>"'\\]/.test(name)) {
    return { ok: false, error: "Name enthält ungültige Zeichen." };
  }
  const db = getDb();
  const existing = getKnowledgeAreaByName(name);
  if (existing) {
    return { ok: false, error: "Diese Rubrik existiert bereits.", area: existing };
  }
  try {
    const result = db
      .prepare(
        `INSERT INTO knowledge_areas (name, description) VALUES (?, ?)`
      )
      .run(name, input.description?.trim() || null);
    return {
      ok: true,
      area: {
        id: Number(result.lastInsertRowid),
        name,
        description: input.description?.trim() || null,
        isBuiltin: false,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function listKnowledgeAreaNames(): string[] {
  return listKnowledgeAreas().map((a) => a.name);
}

/** Touch helper for suggestion accept timestamps etc. */
export function stampNow(): string {
  return nowIso();
}
