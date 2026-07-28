export type SortDir = "asc" | "desc";

const STORAGE_PREFIX = "list-sort:";

export function parseSortDir(
  value: string | null | undefined,
  fallback: SortDir = "desc"
): SortDir {
  if (value === "asc" || value === "desc") return value;
  return fallback;
}

export function sqlSortDir(dir: SortDir): "ASC" | "DESC" {
  return dir === "asc" ? "ASC" : "DESC";
}

/** Compare nullable ISO-ish date strings for Array.sort. Nulls always last. */
export function compareNullableDate(
  a: string | null | undefined,
  b: string | null | undefined,
  dir: SortDir
): number {
  const av = (a || "").trim();
  const bv = (b || "").trim();
  if (!av && !bv) return 0;
  if (!av) return 1;
  if (!bv) return -1;
  const cmp = av < bv ? -1 : av > bv ? 1 : 0;
  return dir === "asc" ? cmp : -cmp;
}

export function readListSortDir(key: string, fallback: SortDir): SortDir {
  if (typeof window === "undefined") return fallback;
  try {
    return parseSortDir(sessionStorage.getItem(`${STORAGE_PREFIX}${key}`), fallback);
  } catch {
    return fallback;
  }
}

export function writeListSortDir(key: string, dir: SortDir): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${key}`, dir);
  } catch {
    // ignore quota / private mode
  }
}

export function toggleSortDir(dir: SortDir): SortDir {
  return dir === "asc" ? "desc" : "asc";
}
