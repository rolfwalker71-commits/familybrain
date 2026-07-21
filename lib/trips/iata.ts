/** Normalize to 3-letter IATA (ZRH, BCN). Rejects ICAO (4 letters) unless already IATA-like. */
export function normalizeIataCode(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (cleaned.length === 3 && /^[A-Z]{3}$/.test(cleaned)) return cleaned;
  // Common case: "Zürich (ZRH)" or "ZRH/LSZH"
  const paren = raw.toUpperCase().match(/\b([A-Z]{3})\b/);
  if (paren) return paren[1];
  return null;
}

export function formatAirportRoute(
  from: string | null | undefined,
  to: string | null | undefined
): string | null {
  const a = normalizeIataCode(from);
  const b = normalizeIataCode(to);
  if (a && b) return `${a} → ${b}`;
  if (a) return a;
  if (b) return b;
  return null;
}
