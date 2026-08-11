import { mariSql, requireMariConfig, MariApiError } from "@/lib/mari/client";

export type MariCustomerOption = {
  cardCode: string;
  name: string;
};

function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlLikeContains(raw: string): string {
  const escaped = raw
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
  return sqlQuote(`%${escaped}%`);
}

/** Normalize BP CardCode (letters/digits, common B1 shape). */
export function normalizeMariCardCode(
  raw: string | null | undefined
): string | null {
  const v = (raw || "").trim();
  if (!v) return null;
  if (!/^[A-Za-z0-9._\-/]{1,50}$/.test(v)) return null;
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

async function searchCustomersFromOcrd(
  q: string,
  limit: number
): Promise<MariCustomerOption[]> {
  const pattern = sqlLikeContains(q);
  const rows = await mariSql<{
    CardCode: string | null;
    CardName: string | null;
  }>(
    `SELECT TOP ${limit}
  c."CardCode",
  c."CardName"
FROM "OCRD" c
WHERE (c."CardType" = 'C' OR c."CardType" IS NULL OR c."CardType" = '')
  AND (
    UPPER(c."CardCode") LIKE UPPER(${pattern})
    OR UPPER(COALESCE(c."CardName", '')) LIKE UPPER(${pattern})
  )
ORDER BY c."CardName", c."CardCode"`
  );
  return rows
    .map((r) => {
      const cardCode = normalizeMariCardCode(r.CardCode);
      if (!cardCode) return null;
      const name = (r.CardName || "").trim() || cardCode;
      return { cardCode, name };
    })
    .filter((x): x is MariCustomerOption => x != null);
}

async function searchCustomersFromIssues(
  q: string,
  limit: number
): Promise<MariCustomerOption[]> {
  const pattern = sqlLikeContains(q);
  const rows = await mariSql<{
    CardCode: string | null;
    AddressMatchcode: string | null;
  }>(
    `SELECT TOP ${limit}
  i."CardCode",
  MAX(i."AddressMatchcode") AS "AddressMatchcode"
FROM "MARISupportIssue" i
WHERE i."CardCode" IS NOT NULL
  AND i."CardCode" <> ''
  AND (
    UPPER(i."CardCode") LIKE UPPER(${pattern})
    OR UPPER(COALESCE(i."AddressMatchcode", '')) LIKE UPPER(${pattern})
  )
GROUP BY i."CardCode"
ORDER BY MAX(i."AddressMatchcode"), i."CardCode"`
  );
  return rows
    .map((r) => {
      const cardCode = normalizeMariCardCode(r.CardCode);
      if (!cardCode) return null;
      const name = (r.AddressMatchcode || "").trim() || cardCode;
      return { cardCode, name };
    })
    .filter((x): x is MariCustomerOption => x != null);
}

/**
 * Teilqualifizierte Kundensuche (CardCode / Name).
 * Primär OCRD; Fallback Distinct aus Support-Tickets.
 */
export async function searchMariCustomers(
  query: string,
  options?: { limit?: number }
): Promise<MariCustomerOption[]> {
  requireMariConfig();
  const q = query.trim();
  if (q.length < 2) return [];
  const limit = Math.min(Math.max(options?.limit ?? 30, 1), 50);

  try {
    const fromMaster = await searchCustomersFromOcrd(q, limit);
    if (fromMaster.length > 0) return fromMaster;
  } catch (err) {
    console.warn(
      "[mari] OCRD customer search failed, falling back to issues:",
      err instanceof MariApiError ? err.message : err
    );
  }

  return searchCustomersFromIssues(q, limit);
}
