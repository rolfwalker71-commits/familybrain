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
 * Matched against title, correspondent, vendor, letterhead and OCR (word-ish).
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

/** Build searchable text from document fields (lowercased). */
export function buildBrandMatchHaystack(input: {
  title?: string | null;
  correspondent?: string | null;
  vendor?: string | null;
  content?: string | null;
  letterhead?: string | null;
}): string {
  const parts = [
    input.title,
    input.correspondent,
    input.vendor,
    input.letterhead,
    // Cap OCR — logos usually appear early / in letterhead
    (input.content || "").slice(0, 12000),
  ];
  return parts
    .filter(Boolean)
    .join("\n")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/**
 * Detect known place/brand keywords for optical AI icon references.
 * Prefer more specific matches first (Altdorf before Uri).
 */
export function matchDocumentBrandLogo(
  haystack: string
): DocumentBrandLogo | null {
  if (!haystack.trim()) return null;

  if (/\baltdorf\b/.test(haystack)) {
    return DOCUMENT_BRAND_LOGOS.find((b) => b.id === "altdorf") || null;
  }

  if (
    /\ban[\s-]?group\b/.test(haystack) ||
    /\ban-group\.one\b/.test(haystack) ||
    /(^|[^a-z0-9])ang([^a-z0-9]|$)/.test(haystack)
  ) {
    return DOCUMENT_BRAND_LOGOS.find((b) => b.id === "ang") || null;
  }

  // "Kanton Uri", standalone "Uri" as word, or "URI" acronym — not inside http URIs.
  const withoutUrls = haystack.replace(/https?:\/\/\S+/gi, " ");
  if (
    /\bkanton\s+uri\b/.test(withoutUrls) ||
    /(^|[^a-z0-9])uri([^a-z0-9]|$)/.test(withoutUrls)
  ) {
    return DOCUMENT_BRAND_LOGOS.find((b) => b.id === "uri") || null;
  }

  return null;
}
