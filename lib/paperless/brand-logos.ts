import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export type DocumentBrandLogo = {
  id: string;
  label: string;
  /** Relative to project root / assets/document-brand-logos */
  filename: string;
  /** Human-readable match description for ai_icon_prompt */
  promptNote: string;
};

/**
 * Visual reference assets for OpenAI document-icon generation (inspiration only).
 * Matched only when Paperless correspondent / finance vendor equals a known alias.
 */
export const DOCUMENT_BRAND_LOGOS: DocumentBrandLogo[] = [
  {
    id: "altdorf",
    label: "Altdorf",
    filename: "altdorf-ref.png",
    promptNote:
      "Optical reference for Altdorf (UR) — inspired by vereins.fandom.com/wiki/Altdorf_UR; generate a fresh icon, do not paste the reference.",
  },
  {
    id: "ang",
    label: "ANG / AN-Group",
    filename: "ang-icon.png",
    promptNote:
      "Optical reference for ANG International / AN-Group (an-group.one); generate a fresh icon, do not paste the reference.",
  },
  {
    id: "uri",
    label: "Kanton Uri",
    filename: "uri-wappen.svg",
    promptNote:
      "Optical reference for Kanton Uri coat of arms (Wappen Uri, Wikimedia Commons); generate a fresh icon, do not paste the reference.",
  },
];

/** Exact Absender/Provider aliases (normalized) → brand id. More specific first. */
const PROVIDER_ALIAS_RULES: { id: string; names: string[] }[] = [
  { id: "altdorf", names: ["altdorf", "altdorf ur"] },
  { id: "ang", names: ["ang", "ang schweiz"] },
  { id: "uri", names: ["kanton uri", "uri"] },
];

function brandLogosCandidateDirs(): string[] {
  const dirs = new Set<string>();
  const cwd = /*turbopackIgnore: true*/ process.cwd();
  dirs.add(path.join(cwd, "assets", "document-brand-logos"));
  // Docker / nested cwd fallbacks
  dirs.add(path.join(cwd, "..", "assets", "document-brand-logos"));
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    dirs.add(
      path.join(here, "..", "..", "assets", "document-brand-logos")
    );
  } catch {
    /* CJS / no import.meta */
  }
  return [...dirs];
}

export function resolveBrandLogoPath(filename: string): string | null {
  const safe = path.basename(filename);
  if (!safe || safe.includes("..")) return null;
  for (const dir of brandLogosCandidateDirs()) {
    const full = path.join(dir, safe);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

/** Normalize Absender/Provider for exact alias comparison. */
export function normalizeBrandProviderName(
  raw: string | null | undefined
): string {
  return (raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

/**
 * Match optical brand reference only when correspondent or vendor
 * equals a known Absender/Provider alias (not OCR/title text).
 */
export function matchDocumentBrandLogo(input: {
  correspondent?: string | null;
  vendor?: string | null;
}): DocumentBrandLogo | null {
  const providers = [input.correspondent, input.vendor]
    .map((p) => normalizeBrandProviderName(p))
    .filter(Boolean);

  for (const provider of providers) {
    for (const rule of PROVIDER_ALIAS_RULES) {
      if (rule.names.includes(provider)) {
        return DOCUMENT_BRAND_LOGOS.find((b) => b.id === rule.id) || null;
      }
    }
  }
  return null;
}
