import fs from "fs";
import path from "path";

export type DocumentBrandLogo = {
  id: string;
  label: string;
  /** Relative to project root / assets/document-brand-logos */
  filename: string;
  /** Human-readable match description for ai_icon_prompt */
  promptNote: string;
};

/**
 * Known organization logos passed as reference images into OpenAI icon generation.
 * Matched against title, correspondent, vendor, letterhead and OCR (word-ish).
 */
export const DOCUMENT_BRAND_LOGOS: DocumentBrandLogo[] = [
  {
    id: "uri",
    label: "Kanton Uri",
    filename: "uri-wappen.svg",
    promptNote:
      "Brand logo reference: Kanton Uri coat of arms (Wappen Uri, Wikimedia Commons).",
  },
  {
    id: "ang",
    label: "ANG / AN-Group",
    filename: "ang-icon.png",
    promptNote:
      "Brand logo reference: ANG International / AN-Group (an-group.one).",
  },
];

function brandLogosDir(): string {
  return path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    "assets",
    "document-brand-logos"
  );
}

export function resolveBrandLogoPath(filename: string): string | null {
  const safe = path.basename(filename);
  if (!safe || safe.includes("..")) return null;
  const full = path.join(brandLogosDir(), safe);
  if (!fs.existsSync(full)) return null;
  return full;
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
 * Detect known brands from document text (for AI logo reference).
 * URI: Kanton Uri (avoid matching inside URLs like http://…).
 * ANG: ANG / AN-Group company.
 */
export function matchDocumentBrandLogo(
  haystack: string
): DocumentBrandLogo | null {
  if (!haystack.trim()) return null;

  // Prefer more specific company match first when both could appear (unlikely).
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
