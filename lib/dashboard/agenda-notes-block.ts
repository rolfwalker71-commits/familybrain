import { absoluteAppUrl } from "@/lib/app-url";
import { agendaAiIconPublicUrl } from "@/lib/dashboard/agenda-ai-icon";
import { signedPushMediaPath } from "@/lib/push/signed-media";

/** Marker block for Google description / Outlook body notes (not title). */
export const AGENDA_NOTES_BLOCK_START = "— Buddy —";
export const AGENDA_NOTES_BLOCK_END = "— /Buddy —";

/** Signed image links in calendar clients — refresh each evening. */
export const AGENDA_NOTES_IMAGE_TTL_SEC = 60 * 60 * 24 * 14;

export type AgendaNotesEnrichment = {
  weatherLabel?: string | null;
  driveLabel?: string | null;
  /** Cache key when a local AI illustration exists */
  aiIconKey?: string | null;
};

export function stripAgendaNotesBlock(
  notes: string | null | undefined
): string {
  const raw = notes || "";
  const start = raw.indexOf(AGENDA_NOTES_BLOCK_START);
  if (start < 0) return raw.trim();
  const end = raw.indexOf(AGENDA_NOTES_BLOCK_END, start);
  if (end < 0) {
    return raw.slice(0, start).trim();
  }
  return `${raw.slice(0, start)}${raw.slice(end + AGENDA_NOTES_BLOCK_END.length)}`
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function weatherLine(label: string | null | undefined): string | null {
  const t = (label || "").replace(/\s+/g, " ").trim();
  return t ? `Wetter: ${t}` : null;
}

function driveLine(label: string | null | undefined): string | null {
  const t = (label || "").replace(/\s+/g, " ").trim();
  return t ? `Anfahrt: ${t}` : null;
}

/** Absolute signed URL for calendar clients (Outlook/Google cannot use session cookies). */
export function signedAgendaAiIconAbsoluteUrl(
  key: string,
  request?: Request | null
): string | null {
  const k = key.trim().toLowerCase();
  if (!/^[a-f0-9]{16,40}$/.test(k)) return null;
  const relative = agendaAiIconPublicUrl(k);
  const signed = signedPushMediaPath(relative, AGENDA_NOTES_IMAGE_TTL_SEC);
  if (!signed) return null;
  return absoluteAppUrl(signed, request);
}

function imageLine(
  key: string | null | undefined,
  request?: Request | null
): string | null {
  if (!key) return null;
  const url = signedAgendaAiIconAbsoluteUrl(key, request);
  return url ? `Bild: ${url}` : null;
}

/** Stable identity without the rotating signed Bild URL. */
export function agendaNotesBlockFingerprint(
  enrichment: AgendaNotesEnrichment
): string {
  return [
    weatherLine(enrichment.weatherLabel) || "",
    driveLine(enrichment.driveLabel) || "",
    enrichment.aiIconKey ? `Bild-Key: ${enrichment.aiIconKey}` : "",
  ].join("\n");
}

export function buildAgendaNotesBlock(
  enrichment: AgendaNotesEnrichment,
  request?: Request | null
): string | null {
  const lines = [
    weatherLine(enrichment.weatherLabel),
    driveLine(enrichment.driveLabel),
    imageLine(enrichment.aiIconKey, request),
  ].filter((line): line is string => Boolean(line));
  if (lines.length === 0) return null;
  return [AGENDA_NOTES_BLOCK_START, ...lines, AGENDA_NOTES_BLOCK_END].join(
    "\n"
  );
}

export function mergeAgendaNotesBlock(
  existingNotes: string | null | undefined,
  enrichment: AgendaNotesEnrichment,
  request?: Request | null
): string | null {
  const block = buildAgendaNotesBlock(enrichment, request);
  if (!block) {
    const stripped = stripAgendaNotesBlock(existingNotes);
    return stripped || null;
  }
  const base = stripAgendaNotesBlock(existingNotes);
  return base ? `${base}\n\n${block}` : block;
}

/** Normalize Bild URL so rotating signatures do not force endless patches. */
export function normalizeAgendaNotesForCompare(notes: string): string {
  return notes
    .replace(/^Bild:\s+\S+/gm, "Bild: *")
    .replace(/\s+/g, " ")
    .trim();
}

export function agendaNotesAlreadyWritten(
  existingNotes: string | null | undefined,
  enrichment: AgendaNotesEnrichment,
  request?: Request | null
): boolean {
  const next = buildAgendaNotesBlock(enrichment, request);
  if (!next) {
    return !existingNotes?.includes(AGENDA_NOTES_BLOCK_START);
  }
  const raw = existingNotes || "";
  if (!raw.includes(AGENDA_NOTES_BLOCK_START)) return false;
  const start = raw.indexOf(AGENDA_NOTES_BLOCK_START);
  const end = raw.indexOf(AGENDA_NOTES_BLOCK_END, start);
  if (end < 0) return false;
  const currentBlock = raw.slice(start, end + AGENDA_NOTES_BLOCK_END.length);
  return (
    normalizeAgendaNotesForCompare(currentBlock) ===
    normalizeAgendaNotesForCompare(next)
  );
}

export function formatAgendaWeatherLabel(input: {
  temperatureC?: number | null;
  labelDe?: string | null;
  icon?: string | null;
}): string | null {
  if (input.temperatureC == null || !Number.isFinite(input.temperatureC)) {
    return null;
  }
  const temp = `${Math.round(input.temperatureC)}°`;
  const label = (input.labelDe || "").trim();
  return label ? `${temp} · ${label}` : temp;
}
