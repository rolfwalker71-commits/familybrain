/**
 * Canonical product names for UI, metadata, and mail.
 * Internal route keys (e.g. AdminNavMode "mybrain") may differ.
 */
export const BRAND = {
  /** Shell / PWA / metadata */
  app: "Buddy",
  /** Document & household hub (formerly MyBrain / BuddyApp) */
  buddy: "Buddy",
  /** Planned trips */
  travel: "TravelBuddy",
  /** Shared ledgers / settlements */
  finance: "FinanzBuddy",
  /** Paperless invoice overview under Buddy (/finance) */
  financeBlick: "Finanzblick",
  /** Document-derived travel memory under Buddy (/travel) */
  travelMemory: "Reise-Gedächtnis",
} as const;

export const BRAND_TAGLINE =
  "Haushalt, Reisen und gemeinsame Abrechnung — klar getrennt.";

export function brandTitle(section?: keyof typeof BRAND): string {
  if (!section || section === "app") return BRAND.app;
  return BRAND[section];
}
