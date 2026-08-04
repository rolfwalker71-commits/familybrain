export type SortDir = "asc" | "desc";

/** Documents list: when angelegt vs. Paperless Dokumentdatum */
export type DocumentSortBy = "created" | "document_date";

const STORAGE_PREFIX = "list-sort:";
const STORAGE_BY_PREFIX = "list-sort-by:";

export function parseSortDir(
  value: string | null | undefined,
  fallback: SortDir = "desc"
): SortDir {
  if (value === "asc" || value === "desc") return value;
  return fallback;
}

export function parseDocumentSortBy(
  value: string | null | undefined,
  fallback: DocumentSortBy = "created"
): DocumentSortBy {
  if (value === "created" || value === "document_date") return value;
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

export function readDocumentSortBy(
  key: string,
  fallback: DocumentSortBy = "created"
): DocumentSortBy {
  if (typeof window === "undefined") return fallback;
  try {
    return parseDocumentSortBy(
      sessionStorage.getItem(`${STORAGE_BY_PREFIX}${key}`),
      fallback
    );
  } catch {
    return fallback;
  }
}

export function writeDocumentSortBy(key: string, by: DocumentSortBy): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`${STORAGE_BY_PREFIX}${key}`, by);
  } catch {
    // ignore
  }
}

export function toggleSortDir(dir: SortDir): SortDir {
  return dir === "asc" ? "desc" : "asc";
}

export function documentSortByLabel(by: DocumentSortBy): string {
  return by === "created" ? "Erstellungsdatum" : "Dokumentdatum";
}
