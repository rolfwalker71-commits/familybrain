import { mariSql, requireMariConfig, MariApiError } from "@/lib/mari/client";

export type MariCustomerOption = {
  cardCode: string;
  name: string;
};

function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Strip user wildcards (*, %) — we always do contains-match. */
export function normalizeCustomerSearchQuery(raw: string): string {
  return raw
    .trim()
    .replace(/^[*％%]+/, "")
    .replace(/[*％%]+$/, "")
    .replace(/\*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sqlLikeContains(raw: string): string {
  const escaped = raw.replace(/'/g, "''").replace(/[%_]/g, " ");
  return sqlQuote(`%${escaped}%`);
}

/**
 * BP CardCode — allow typical B1 codes; reject separators used in query lists.
 */
export function normalizeMariCardCode(
  raw: string | null | undefined
): string | null {
  const v = (raw || "").trim();
  if (!v || v.length > 50) return null;
  if (/[,\n\r]/.test(v)) return null;
  return v;
}

export function parseCardCodesParam(
  raw: string | null | undefined
): string[] {
  if (!raw?.trim()) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((p) => normalizeMariCardCode(p))
        .filter((c): c is string => c != null)
    ),
  ].slice(0, 40);
}

function mapCustomerRows(
  rows: Array<{ CardCode: string | null; Name: string | null }>
): MariCustomerOption[] {
  const out: MariCustomerOption[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const cardCode = normalizeMariCardCode(r.CardCode);
    if (!cardCode || seen.has(cardCode)) continue;
    seen.add(cardCode);
    const name = (r.Name || "").trim() || cardCode;
    out.push({ cardCode, name });
  }
  return out;
}

/**
 * Support-Kunden aus Tickets (AddressMatchcode / CardCode) —
 * unabhängig vom Bearbeiter. Primäre Quelle für die UI-Suche.
 */
async function searchCustomersFromIssues(
  q: string,
  limit: number
): Promise<MariCustomerOption[]> {
  const pattern = sqlLikeContains(q);
  const rows = await mariSql<{
    CardCode: string | null;
    Name: string | null;
  }>(
    `SELECT TOP ${limit}
  i."CardCode" AS "CardCode",
  MAX(i."AddressMatchcode") AS "Name"
FROM "MARISupportIssue" i
WHERE i."EditorType" = 3
  AND i."HotlineClassType" = 17
  AND i."CardCode" IS NOT NULL
  AND i."CardCode" <> ''
  AND (
    LOWER(i."CardCode") LIKE LOWER(${pattern})
    OR LOWER(COALESCE(i."AddressMatchcode", '')) LIKE LOWER(${pattern})
  )
GROUP BY i."CardCode"
ORDER BY MAX(i."AddressMatchcode"), i."CardCode"`
  );
  return mapCustomerRows(rows);
}

async function searchCustomersFromOcrd(
  q: string,
  limit: number
): Promise<MariCustomerOption[]> {
  const pattern = sqlLikeContains(q);
  const rows = await mariSql<{
    CardCode: string | null;
    Name: string | null;
  }>(
    `SELECT TOP ${limit}
  c."CardCode" AS "CardCode",
  c."CardName" AS "Name"
FROM "OCRD" c
WHERE (
    LOWER(c."CardCode") LIKE LOWER(${pattern})
    OR LOWER(COALESCE(c."CardName", '')) LIKE LOWER(${pattern})
  )
ORDER BY c."CardName", c."CardCode"`
  );
  return mapCustomerRows(rows);
}

function mergeCustomers(
  primary: MariCustomerOption[],
  secondary: MariCustomerOption[],
  limit: number
): MariCustomerOption[] {
  const seen = new Set(primary.map((c) => c.cardCode));
  const out = [...primary];
  for (const c of secondary) {
    if (seen.has(c.cardCode)) continue;
    seen.add(c.cardCode);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

/**
 * Teilqualifizierte Kundensuche (CardCode / Matchcode / Name).
 * Primär aus Support-Tickets (alle Bearbeiter), ergänzend OCRD.
 */
export async function searchMariCustomers(
  query: string,
  options?: { limit?: number }
): Promise<MariCustomerOption[]> {
  requireMariConfig();
  const q = normalizeCustomerSearchQuery(query);
  if (q.length < 2) return [];
  const limit = Math.min(Math.max(options?.limit ?? 30, 1), 50);

  let fromIssues: MariCustomerOption[] = [];
  try {
    fromIssues = await searchCustomersFromIssues(q, limit);
  } catch (err) {
    console.warn(
      "[mari] issue customer search failed:",
      err instanceof MariApiError ? err.message : err
    );
  }

  let fromMaster: MariCustomerOption[] = [];
  try {
    fromMaster = await searchCustomersFromOcrd(q, limit);
  } catch (err) {
    console.warn(
      "[mari] OCRD customer search failed:",
      err instanceof MariApiError ? err.message : err
    );
  }

  return mergeCustomers(fromIssues, fromMaster, limit);
}
