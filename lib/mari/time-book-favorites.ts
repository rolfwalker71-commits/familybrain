import { z } from "zod";
import { getDb } from "@/lib/db/client";

export type MariTimeBookFavorite = {
  id: number;
  ownerKey: string;
  name: string;
  sortKey: number;
  projectNumber: string;
  projectLabel: string | null;
  contractId: number | null;
  contractPositionId: number | null;
  activity: string;
  memoText: string | null;
  hours: number;
  hoursBillable: number | null;
  billable: boolean;
  createdAt: string;
  updatedAt: string;
};

export const MariTimeBookFavoriteCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  projectNumber: z.string().trim().min(1).max(40),
  projectLabel: z.string().trim().max(200).nullable().optional(),
  contractId: z.number().int().nonnegative().nullable().optional(),
  contractPositionId: z.number().int().nonnegative().nullable().optional(),
  activity: z.string().trim().min(1).max(100),
  memoText: z.string().trim().max(2000).nullable().optional(),
  hours: z.number().min(0.01).max(24).optional(),
  hoursBillable: z.number().min(0).max(24).nullable().optional(),
  billable: z.boolean().optional(),
});

export type MariTimeBookFavoriteCreateInput = z.infer<
  typeof MariTimeBookFavoriteCreateSchema
>;

type FavoriteRow = {
  id: number;
  owner_key: string;
  name: string;
  sort_key: number;
  project_number: string;
  project_label: string | null;
  contract_id: number | null;
  contract_position_id: number | null;
  activity: string;
  memo_text: string | null;
  hours: number;
  hours_billable: number | null;
  billable: number;
  created_at: string;
  updated_at: string;
};

function mapRow(row: FavoriteRow): MariTimeBookFavorite {
  return {
    id: row.id,
    ownerKey: row.owner_key,
    name: row.name,
    sortKey: row.sort_key,
    projectNumber: row.project_number,
    projectLabel: row.project_label,
    contractId: row.contract_id,
    contractPositionId: row.contract_position_id,
    activity: row.activity,
    memoText: row.memo_text,
    hours: Number(row.hours) || 0.25,
    hoursBillable:
      row.hours_billable == null ? null : Number(row.hours_billable),
    billable: Boolean(row.billable),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listMariTimeBookFavorites(
  ownerKey: string
): MariTimeBookFavorite[] {
  const rows = getDb()
    .prepare(
      `SELECT id, owner_key, name, sort_key, project_number, project_label,
              contract_id, contract_position_id, activity, memo_text,
              hours, hours_billable, billable, created_at, updated_at
       FROM mari_time_book_favorites
       WHERE owner_key = ?
       ORDER BY sort_key ASC, id ASC`
    )
    .all(ownerKey) as FavoriteRow[];
  return rows.map(mapRow);
}

export function createMariTimeBookFavorite(
  ownerKey: string,
  input: MariTimeBookFavoriteCreateInput
): MariTimeBookFavorite {
  const parsed = MariTimeBookFavoriteCreateSchema.parse(input);
  const now = new Date().toISOString();
  const hours = parsed.hours ?? 0.25;
  const billable = parsed.billable ?? true;
  const hoursBillable =
    parsed.hoursBillable != null
      ? Math.min(parsed.hoursBillable, hours)
      : billable
        ? hours
        : 0;

  const maxSort = getDb()
    .prepare(
      `SELECT COALESCE(MAX(sort_key), 0) AS m
       FROM mari_time_book_favorites WHERE owner_key = ?`
    )
    .get(ownerKey) as { m: number };

  const result = getDb()
    .prepare(
      `INSERT INTO mari_time_book_favorites (
         owner_key, name, sort_key, project_number, project_label,
         contract_id, contract_position_id, activity, memo_text,
         hours, hours_billable, billable, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      ownerKey,
      parsed.name,
      (maxSort?.m || 0) + 1,
      parsed.projectNumber,
      parsed.projectLabel?.trim() || null,
      parsed.contractId ?? null,
      parsed.contractPositionId ?? null,
      parsed.activity,
      parsed.memoText?.trim() || null,
      hours,
      hoursBillable,
      billable ? 1 : 0,
      now,
      now
    );

  const id = Number(result.lastInsertRowid);
  const created = getMariTimeBookFavorite(ownerKey, id);
  if (!created) throw new Error("Favorit konnte nicht gelesen werden.");
  return created;
}

export function getMariTimeBookFavorite(
  ownerKey: string,
  id: number
): MariTimeBookFavorite | null {
  const row = getDb()
    .prepare(
      `SELECT id, owner_key, name, sort_key, project_number, project_label,
              contract_id, contract_position_id, activity, memo_text,
              hours, hours_billable, billable, created_at, updated_at
       FROM mari_time_book_favorites
       WHERE owner_key = ? AND id = ?`
    )
    .get(ownerKey, id) as FavoriteRow | undefined;
  return row ? mapRow(row) : null;
}

export function deleteMariTimeBookFavorite(
  ownerKey: string,
  id: number
): boolean {
  const result = getDb()
    .prepare(
      `DELETE FROM mari_time_book_favorites WHERE owner_key = ? AND id = ?`
    )
    .run(ownerKey, id);
  return result.changes > 0;
}
