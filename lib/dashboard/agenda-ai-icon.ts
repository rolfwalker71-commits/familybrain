import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { getOpenAIClient, hasOpenAIKey } from "@/lib/ai/client";
import { isPhysicalAgendaLocation } from "@/lib/dashboard/agenda-location";
import { getTripsDataRoot } from "@/lib/trips/paths";
import { DEFAULT_EVENT_AI_IMAGE_PROMPT } from "@/lib/trips/event-image-prompt";
import { getEventAiImagePromptTemplate } from "@/lib/trips/event-image-settings";

/** Bump when illustration style changes so cached JPGs are regenerated. */
const AGENDA_AI_ICON_STYLE = "travel-poster-v1";

export function getAgendaAiIconDir(): string {
  return path.join(getTripsDataRoot(), "agenda-ai-icons");
}

function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function normalizeLocationHint(location: string | null | undefined): string {
  if (!isPhysicalAgendaLocation(location)) return "";
  return (location || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export type AgendaIconSubject = {
  title: string;
  location?: string | null;
  description?: string | null;
  calendarType?: string | null;
  kind?: string | null;
};

/**
 * Stable cache key for recurring events (e.g. «F2 Früh» shifts).
 * Title + calendar type + place; date/time not included.
 */
export function buildAgendaAiIconKey(input: AgendaIconSubject): string {
  const title = normalizeTitle(input.title || "");
  if (!title) return "";
  const type = String(input.calendarType || input.kind || "calendar")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "")
    .slice(0, 24);
  const loc = normalizeLocationHint(input.location);
  const raw = `${AGENDA_AI_ICON_STYLE}|${type}|${title}|${loc}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 20);
}

export function agendaAiIconFilePath(key: string): string {
  return path.join(getAgendaAiIconDir(), `${key}.jpg`);
}

export function agendaAiIconPublicUrl(key: string): string {
  return `/api/calendar/media/ai-icon/${encodeURIComponent(key)}.jpg`;
}

export function resolveAgendaAiIcon(key: string): string | null {
  if (!/^[a-f0-9]{16,40}$/i.test(key)) return null;
  const file = agendaAiIconFilePath(key.toLowerCase());
  return fs.existsSync(file) ? file : null;
}

export function lookupAgendaAiIconUrl(
  input: AgendaIconSubject
): { key: string; url: string } | null {
  const key = buildAgendaAiIconKey(input);
  if (!key) return null;
  if (!resolveAgendaAiIcon(key)) return null;
  return { key, url: agendaAiIconPublicUrl(key) };
}

function clip(raw: string | null | undefined, max: number): string {
  const t = (raw || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Scene hint — mirrors travel event-image mood language. */
function sceneForAgenda(input: AgendaIconSubject): string {
  const type = String(input.calendarType || input.kind || "").toLowerCase();
  const title = (input.title || "").toLowerCase();
  if (type === "hockey" || /\bhockey|spiel|match\b/i.test(title)) {
    return "ice hockey arena atmosphere, game day mood";
  }
  if (type === "work" || /\bf\d|schicht|dienst|früh|spät|nacht\b/i.test(title)) {
    return "professional work day / hospital or office shift atmosphere";
  }
  if (type === "school" || /\bschule|unterricht\b/i.test(title)) {
    return "school day atmosphere";
  }
  if (type === "birthday" || /\bgeburtstag\b/i.test(title)) {
    return "warm birthday celebration atmosphere";
  }
  if (type === "family" || /\bfamilie|essen|mittag|eltern\b/i.test(title)) {
    return "cozy family gathering atmosphere";
  }
  if (type === "sports") {
    return "active sports / outdoor activity atmosphere";
  }
  if (type === "church") {
    return "calm church or community gathering atmosphere";
  }
  if (isPhysicalAgendaLocation(input.location)) {
    return "everyday appointment at a real place, local Swiss mood";
  }
  return "everyday calendar moment atmosphere";
}

/**
 * Same template as TravelBuddy event AI images (`DEFAULT_EVENT_AI_IMAGE_PROMPT`
 * / settings override): editorial travel-poster illustration, not app-icon clay.
 */
function buildPrompt(input: AgendaIconSubject): string {
  const title = clip(input.title, 100) || "Termin";
  const type = clip(input.calendarType || input.kind || "Termin", 40) || "Termin";
  const loc = isPhysicalAgendaLocation(input.location)
    ? clip(input.location, 100)
    : "";
  const notes = clip(input.description, 180);
  const details = [loc ? `place: ${loc}` : null].filter(Boolean).join("; ");

  let template = DEFAULT_EVENT_AI_IMAGE_PROMPT;
  try {
    template = getEventAiImagePromptTemplate() || DEFAULT_EVENT_AI_IMAGE_PROMPT;
  } catch {
    /* settings DB optional during early boot */
  }

  const vars: Record<string, string> = {
    type,
    title,
    details: details || "—",
    notes: notes || "—",
    beleg: "—",
    scene: sceneForAgenda(input),
  };
  let out = template.trim() || DEFAULT_EVENT_AI_IMAGE_PROMPT;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out.replace(/\s+/g, " ").trim();
}

export async function ensureAgendaAiIcon(
  input: AgendaIconSubject,
  options?: { force?: boolean }
): Promise<{ key: string; url: string; generated: boolean } | null> {
  const key = buildAgendaAiIconKey(input);
  if (!key) return null;

  const file = agendaAiIconFilePath(key);
  if (!options?.force && fs.existsSync(file)) {
    return { key, url: agendaAiIconPublicUrl(key), generated: false };
  }
  if (!hasOpenAIKey()) {
    if (fs.existsSync(file)) {
      return { key, url: agendaAiIconPublicUrl(key), generated: false };
    }
    return null;
  }

  fs.mkdirSync(getAgendaAiIconDir(), { recursive: true });
  const prompt = buildPrompt(input);
  // Same model family as trip event AI images
  const result = await getOpenAIClient().images.generate({
    model: "gpt-image-2",
    size: "1024x1024",
    quality: "low",
    prompt,
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("Bildgenerierung lieferte kein Bild");

  const sharp = (await import("sharp")).default;
  const jpg = await sharp(Buffer.from(b64, "base64"))
    .resize(256, 256, {
      fit: "cover",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 85 })
    .toBuffer();
  fs.writeFileSync(file, jpg);
  return { key, url: agendaAiIconPublicUrl(key), generated: true };
}

export function shouldHaveAgendaAiIcon(input: {
  kind?: string | null;
  title?: string | null;
}): boolean {
  const kind = input.kind || "";
  if (
    kind === "invoice" ||
    kind === "deadline" ||
    kind === "triage" ||
    kind === "ledger" ||
    kind === "warranty" ||
    kind === "travel"
  ) {
    return false;
  }
  return Boolean(normalizeTitle(input.title || ""));
}
