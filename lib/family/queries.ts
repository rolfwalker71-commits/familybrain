import path from "path";
import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";

export type FamilyGender = "male" | "female" | null;

export type FamilyMemberRow = {
  id: number;
  display_name: string;
  aliases: string | null;
  gender: FamilyGender;
  avatar_path: string | null;
  avatar_prompt: string | null;
  user_id: number | null;
  sort_key: number;
  active: number;
  created_at: string;
  updated_at: string;
};

export type FamilyMemberPublic = {
  id: number;
  display_name: string;
  aliases: string[];
  gender: FamilyGender;
  avatar_url: string | null;
  user_id: number | null;
  sort_key: number;
  active: number;
  created_at: string;
  updated_at: string;
};

export const UNKNOWN_RECIPIENT_LABEL = "Empfänger unbekannt";

function normalizeGender(raw: string | null | undefined): FamilyGender {
  if (raw === "male" || raw === "female") return raw;
  return null;
}

function avatarUrlFromPath(
  avatarPath: string | null | undefined
): string | null {
  if (!avatarPath) return null;
  return `/api/family/media/avatar/${encodeURIComponent(
    path.basename(avatarPath)
  )}`;
}

export function parseAliases(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((a): a is string => typeof a === "string")
      .map((a) => a.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function serializeAliases(aliases: string[] | undefined): string {
  const cleaned = (aliases || [])
    .map((a) => a.trim())
    .filter(Boolean);
  return JSON.stringify(cleaned);
}

function coerceRow(row: FamilyMemberRow): FamilyMemberRow {
  return {
    ...row,
    gender: normalizeGender(row.gender),
    aliases: row.aliases ?? null,
    avatar_path: row.avatar_path ?? null,
    avatar_prompt: row.avatar_prompt ?? null,
    user_id: row.user_id ?? null,
    active: row.active ? 1 : 0,
  };
}

function toPublic(row: FamilyMemberRow): FamilyMemberPublic {
  const coerced = coerceRow(row);
  return {
    id: coerced.id,
    display_name: coerced.display_name,
    aliases: parseAliases(coerced.aliases),
    gender: coerced.gender,
    avatar_url: avatarUrlFromPath(coerced.avatar_path),
    user_id: coerced.user_id,
    sort_key: coerced.sort_key,
    active: coerced.active,
    created_at: coerced.created_at,
    updated_at: coerced.updated_at,
  };
}

export function listFamilyMembers(options?: {
  activeOnly?: boolean;
}): FamilyMemberPublic[] {
  const db = getDb();
  const rows = (
    options?.activeOnly
      ? db
          .prepare(
            `SELECT * FROM family_members
             WHERE active = 1
             ORDER BY sort_key ASC, display_name COLLATE NOCASE, id`
          )
          .all()
      : db
          .prepare(
            `SELECT * FROM family_members
             ORDER BY sort_key ASC, display_name COLLATE NOCASE, id`
          )
          .all()
  ) as FamilyMemberRow[];
  return rows.map(toPublic);
}

export function getFamilyMemberById(id: number): FamilyMemberRow | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM family_members WHERE id = ?`)
    .get(id) as FamilyMemberRow | undefined;
  return row ? coerceRow(row) : null;
}

export function getFamilyMemberPublic(id: number): FamilyMemberPublic | null {
  const row = getFamilyMemberById(id);
  return row ? toPublic(row) : null;
}

export function createFamilyMember(input: {
  displayName: string;
  aliases?: string[];
  gender?: FamilyGender;
  userId?: number | null;
  sortKey?: number;
  active?: boolean;
}): FamilyMemberPublic {
  const db = getDb();
  const ts = nowIso();
  const name = input.displayName.trim();
  if (!name) throw new Error("Name fehlt");

  const maxSort = db
    .prepare(`SELECT COALESCE(MAX(sort_key), -1) AS m FROM family_members`)
    .get() as { m: number };

  const result = db
    .prepare(
      `INSERT INTO family_members (
         display_name, aliases, gender, avatar_path, avatar_prompt,
         user_id, sort_key, active, created_at, updated_at
       ) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      serializeAliases(input.aliases),
      input.gender ?? null,
      input.userId ?? null,
      input.sortKey ?? maxSort.m + 1,
      input.active === false ? 0 : 1,
      ts,
      ts
    );

  const created = getFamilyMemberPublic(Number(result.lastInsertRowid));
  if (!created) throw new Error("Familienmitglied konnte nicht geladen werden");
  return created;
}

export function updateFamilyMember(
  id: number,
  input: {
    displayName?: string;
    aliases?: string[];
    gender?: FamilyGender;
    userId?: number | null;
    sortKey?: number;
    active?: boolean;
  }
): FamilyMemberPublic {
  const existing = getFamilyMemberById(id);
  if (!existing) throw new Error("Familienmitglied nicht gefunden");

  const ts = nowIso();
  const displayName =
    input.displayName !== undefined
      ? input.displayName.trim()
      : existing.display_name;
  if (!displayName) throw new Error("Name fehlt");

  dbUpdate(id, {
    display_name: displayName,
    aliases:
      input.aliases !== undefined
        ? serializeAliases(input.aliases)
        : existing.aliases,
    gender:
      input.gender !== undefined ? input.gender : existing.gender,
    user_id: input.userId !== undefined ? input.userId : existing.user_id,
    sort_key: input.sortKey !== undefined ? input.sortKey : existing.sort_key,
    active:
      input.active !== undefined
        ? input.active
          ? 1
          : 0
        : existing.active,
    updated_at: ts,
  });

  const updated = getFamilyMemberPublic(id);
  if (!updated) throw new Error("Familienmitglied nicht gefunden");
  return updated;
}

function dbUpdate(
  id: number,
  fields: {
    display_name: string;
    aliases: string | null;
    gender: FamilyGender;
    user_id: number | null;
    sort_key: number;
    active: number;
    updated_at: string;
  }
): void {
  const db = getDb();
  db.prepare(
    `UPDATE family_members
     SET display_name = ?, aliases = ?, gender = ?, user_id = ?,
         sort_key = ?, active = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    fields.display_name,
    fields.aliases,
    fields.gender,
    fields.user_id,
    fields.sort_key,
    fields.active,
    fields.updated_at,
    id
  );
}

export function setFamilyMemberAvatar(
  id: number,
  input: { avatarPath: string | null; avatarPrompt: string | null }
): FamilyMemberRow {
  const db = getDb();
  const existing = getFamilyMemberById(id);
  if (!existing) throw new Error("Familienmitglied nicht gefunden");
  const ts = nowIso();
  db.prepare(
    `UPDATE family_members
     SET avatar_path = ?, avatar_prompt = ?, updated_at = ?
     WHERE id = ?`
  ).run(input.avatarPath, input.avatarPrompt, ts, id);
  const row = getFamilyMemberById(id);
  if (!row) throw new Error("Familienmitglied nicht gefunden");
  return row;
}

export function deleteFamilyMember(id: number): void {
  const db = getDb();
  const existing = getFamilyMemberById(id);
  if (!existing) throw new Error("Familienmitglied nicht gefunden");
  db.prepare(`DELETE FROM family_members WHERE id = ?`).run(id);
}

/** Matching names for OCR / AI: display name + aliases, lowercased. */
export function familyMemberMatchNames(
  member: Pick<FamilyMemberPublic, "display_name" | "aliases">
): string[] {
  const names = [member.display_name, ...member.aliases]
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(names)];
}

/**
 * Seed Rolf / Valentyna / Dariusch once when the table is empty.
 * Avatars can be generated afterwards in settings.
 */
export function seedDefaultFamilyMembersIfEmpty(): void {
  const db = getDb();
  const count = db
    .prepare(`SELECT COUNT(*) AS c FROM family_members`)
    .get() as { c: number };
  if (count.c > 0) return;

  const defaults: Array<{
    displayName: string;
    gender: FamilyGender;
    aliases: string[];
    sortKey: number;
  }> = [
    {
      displayName: "Rolf",
      gender: "male",
      aliases: ["Rolf Walker"],
      sortKey: 0,
    },
    {
      displayName: "Valentyna",
      gender: "female",
      aliases: ["Valentyna Walker"],
      sortKey: 1,
    },
    {
      displayName: "Dariusch",
      gender: "male",
      aliases: ["Dariusch Walker"],
      sortKey: 2,
    },
  ];

  for (const d of defaults) {
    createFamilyMember({
      displayName: d.displayName,
      gender: d.gender,
      aliases: d.aliases,
      sortKey: d.sortKey,
    });
  }
}
