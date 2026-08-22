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

/** Freigestelltes B-Monogramm (transparent) — Sidebar, Login, Mail. */
export const BRAND_LOGO_CACHE = "b4";
export const BRAND_LOGO_SRC = `/buddy-logo.png?v=${BRAND_LOGO_CACHE}`;
export const BRAND_LOGO_DARK_SRC = `/buddy-logo-dark.png?v=${BRAND_LOGO_CACHE}`;

export function brandTitle(section?: keyof typeof BRAND): string {
  if (!section || section === "app") return BRAND.app;
  return BRAND[section];
}
