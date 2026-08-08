import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { getOpenAIClient, hasOpenAIKey } from "@/lib/ai/client";
import { isPhysicalAgendaLocation } from "@/lib/dashboard/agenda-location";
import { getTripsDataRoot } from "@/lib/trips/paths";
import { fetchStaticMapPng } from "@/lib/trips/static-map";
import {
  ICS_TYPE_META,
  type IcsCalendarType,
} from "@/lib/calendar/ics-types";

/** Bump when illustration style changes so cached JPGs are regenerated. */
const AGENDA_AI_ICON_STYLE = "travel-poster-v3";

const TRAVEL_STYLE =
  "Style: clean modern editorial illustration, soft flat colors with gentle shading, friendly travel poster vibe. Any text in the image must be spelled correctly and clearly readable. No logos, watermarks, prices, or UI chrome. Suitable as a small card thumbnail.";

/** Partner work calendar — do not force a male figure in the illustration. */
const VALENTYNA_WORK_CAL_RE =
  /arbeitsplan\s*valentyna|valentyna.*arbeitsplan/i;

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
  /** Source calendar display name (e.g. «Arbeitsplan Valentyna») */
  calendarName?: string | null;
  meetUrl?: string | null;
  time?: string | null;
  endTime?: string | null;
  driveMinutes?: number | null;
  distanceKm?: number | null;
  coords?: { lat: number; lon: number } | null;
};

export function calendarTypeLabelDe(
  calendarType: string | null | undefined
): string {
  const key = String(calendarType || "").toLowerCase() as IcsCalendarType;
  if (key && key in ICS_TYPE_META) return ICS_TYPE_META[key].label;
  return "Termin";
}

export function isBirthdayAgendaSubject(input: AgendaIconSubject): boolean {
  const type = String(input.calendarType || input.kind || "").toLowerCase();
  if (type === "birthday") return true;
  return /geburtstag|birthday/i.test(input.title || "");
}

/** Teams / Meet / Zoom or non-physical location without a usable address. */
export function isOnlineAgendaMeeting(input: AgendaIconSubject): boolean {
  if (isBirthdayAgendaSubject(input)) return false;
  if (isPhysicalAgendaLocation(input.location)) return false;
  if (input.meetUrl?.trim()) return true;
  const loc = (input.location || "").trim();
  if (!loc) return false;
  return !isPhysicalAgendaLocation(loc);
}

export function isValentynaWorkCalendar(
  calendarName: string | null | undefined
): boolean {
  return VALENTYNA_WORK_CAL_RE.test(calendarName || "");
}

/** Work calendars (except Valentyna’s plan): show an adult man in the scene. */
export function shouldDepictManForWork(input: AgendaIconSubject): boolean {
  const type = String(input.calendarType || "").toLowerCase();
  if (type !== "work") return false;
  if (isValentynaWorkCalendar(input.calendarName)) return false;
  return true;
}

export function hasDriveAgendaContext(input: AgendaIconSubject): boolean {
  if (isBirthdayAgendaSubject(input)) return false;
  if (isOnlineAgendaMeeting(input)) return false;
  const mins = input.driveMinutes;
  const km = input.distanceKm;
  const hasDrive =
    (mins != null && Number.isFinite(mins) && mins > 2) ||
    (km != null && Number.isFinite(km) && km >= 1.2);
  return hasDrive && isPhysicalAgendaLocation(input.location);
}

function workPersonVariant(input: AgendaIconSubject): string {
  if (!shouldDepictManForWork(input)) return "";
  return "man";
}

/**
 * Stable cache key for recurring events (e.g. «F2 Früh» shifts).
 * Online meetings include start/end so different slots get distinct images.
 */
export function buildAgendaAiIconKey(input: AgendaIconSubject): string {
  const title = normalizeTitle(input.title || "");
  if (!title) return "";
  const type = String(input.calendarType || input.kind || "calendar")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "")
    .slice(0, 24);
  const loc = normalizeLocationHint(input.location);
  const online = isOnlineAgendaMeeting(input);
  const variant = isBirthdayAgendaSubject(input)
    ? "bday"
    : online
      ? "online"
      : hasDriveAgendaContext(input)
        ? "drive"
        : "std";
  const timePart = online
    ? `${String(input.time || "").slice(0, 5)}-${String(input.endTime || "").slice(0, 5)}`
    : "";
  const person = workPersonVariant(input);
  const raw = `${AGENDA_AI_ICON_STYLE}|${variant}|${type}|${person}|${title}|${loc}|${timePart}`;
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

function personHintFromBirthdayTitle(title: string): string {
  const t = title
    .replace(/🎂|🎉|🎈/g, "")
    .replace(/\bgeburtstag\b/gi, "")
    .replace(/\bbirthday\b/gi, "")
    .replace(/\(\d{1,3}\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clip(t, 80);
}

function formatTimeRange(input: AgendaIconSubject): string | null {
  const start = String(input.time || "").trim().slice(0, 5);
  const end = String(input.endTime || "").trim().slice(0, 5);
  if (start && end) return `${start}–${end}`;
  if (start) return start;
  return null;
}

function workManClause(input: AgendaIconSubject): string {
  if (!shouldDepictManForWork(input)) return "";
  return "Include one friendly adult man as a natural part of the scene (not a portrait headshot).";
}

/** Scene hint keyed by calendar type (Arbeit, Sport, Ferien, …). */
function sceneForAgenda(input: AgendaIconSubject): string {
  const type = String(input.calendarType || input.kind || "").toLowerCase();
  const title = (input.title || "").toLowerCase();
  const label = calendarTypeLabelDe(input.calendarType);

  if (type === "hockey" || /\bhockey|spiel|match\b/i.test(title)) {
    return `${label}: ice hockey arena atmosphere, game day mood`;
  }
  if (type === "work" || /\bf\d|schicht|dienst|früh|spät|nacht\b/i.test(title)) {
    return `${label}: professional work day / hospital or office shift atmosphere`;
  }
  if (type === "school" || /\bschule|unterricht\b/i.test(title)) {
    return `${label}: school day atmosphere`;
  }
  if (type === "family" || /\bfamilie|essen|mittag|eltern\b/i.test(title)) {
    return `${label}: cozy family gathering atmosphere`;
  }
  if (type === "sports") {
    return `${label}: active sports / outdoor activity atmosphere`;
  }
  if (type === "holiday") {
    return `${label}: relaxed holiday / vacation atmosphere`;
  }
  if (type === "church") {
    return `${label}: calm church or community gathering atmosphere`;
  }
  if (type === "waste") {
    return `${label}: household / recycling day atmosphere`;
  }
  if (isPhysicalAgendaLocation(input.location)) {
    return `${label}: everyday appointment at a real place, local Swiss mood`;
  }
  return `${label}: everyday calendar moment atmosphere`;
}

function buildBirthdayPrompt(input: AgendaIconSubject): string {
  const who =
    personHintFromBirthdayTitle(input.title || "") || "einem Geburtstagskind";
  return [
    "Square birthday celebration illustration (not photorealistic).",
    `Warm, joyful birthday mood for «${who}».`,
    "Show a festive birthday scene (cake, gifts, balloons, or a toast) that represents the birthday — not a calendar appointment.",
    "Do NOT include any itinerary, timetable, departure/arrival panels, flight/train details, duration boxes, maps, addresses, dates, or clock times.",
    "Do NOT invent travel routes or booking details.",
    "Minimal or no text; if any text, keep it to a short birthday wish only (correct spelling).",
    TRAVEL_STYLE,
  ].join(" ");
}

/**
 * Online / Teams: only start–end time as information on the image.
 */
function buildOnlineMeetingPrompt(input: AgendaIconSubject): string {
  const typeLabel = calendarTypeLabelDe(input.calendarType);
  const range = formatTimeRange(input);
  const timeLine = range
    ? `The ONLY text on the image must be the meeting time «${range}» (24h, clear and correctly spelled).`
    : "Do not invent a time; keep the image almost text-free aside from optional subtle clock motifs.";

  return [
    "Square online-meeting illustration (not photorealistic) for a video call / Teams / remote appointment.",
    `Calendar category: «${typeLabel}».`,
    "Atmosphere: laptop or soft video-call mood, calm home-office or meeting vibe — no street address, no map, no car, no venue.",
    timeLine,
    "Do NOT show location names, titles, agendas, participant lists, or travel details.",
    workManClause(input),
    TRAVEL_STYLE,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildDrivePrompt(input: AgendaIconSubject): string {
  const title = clip(input.title, 100) || "Termin";
  const typeLabel = calendarTypeLabelDe(input.calendarType);
  const loc = clip(input.location, 100);
  const mins =
    input.driveMinutes != null && Number.isFinite(input.driveMinutes)
      ? Math.round(input.driveMinutes)
      : null;
  const km =
    input.distanceKm != null && Number.isFinite(input.distanceKm)
      ? Math.round(input.distanceKm * 10) / 10
      : null;
  const stats = [
    km != null ? `ca. ${km} km` : null,
    mins != null ? `ca. ${mins} Min Fahrt` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return [
    "Square travel illustration (not photorealistic) for a car trip to an appointment.",
    `Calendar category: «${typeLabel}».`,
    `Title mood: ${title}.`,
    loc ? `Destination: ${loc}.` : "",
    stats
      ? `Show clearly readable travel stats on the poster: ${stats}.`
      : "Show approximate distance and drive time as readable poster stats if fitting.",
    "Feature a white Volkswagen Tiguan (SUV) as the main vehicle — accurate white VW Tiguan look, no other brand.",
    "Include an illustrated destination map inset or map-card of the goal area (Swiss local map vibe), not a photoreal satellite screenshot.",
    "Friendly road-trip / arrival atmosphere; keep editorial travel-poster layout.",
    workManClause(input),
    "No logos other than subtle vehicle identity, no watermarks, no UI chrome, no prices.",
    TRAVEL_STYLE,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildStandardPrompt(input: AgendaIconSubject): string {
  const title = clip(input.title, 100) || "Termin";
  const typeLabel = calendarTypeLabelDe(input.calendarType);
  const typeKey = clip(input.calendarType || input.kind || "Termin", 40);
  const loc = isPhysicalAgendaLocation(input.location)
    ? clip(input.location, 100)
    : "";
  const notes = clip(input.description, 180);
  const details = [
    loc ? `place: ${loc}` : null,
    notes ? `notes: ${notes}` : null,
  ]
    .filter(Boolean)
    .join("; ");

  return [
    `Square calendar illustration (not photorealistic) for a «${typeLabel}» (${typeKey}) appointment.`,
    `Title: ${title}.`,
    `Activity details: ${details || "—"}.`,
    `Scene idea: ${sceneForAgenda(input)}.`,
    "Lean on the calendar category mood (Arbeit, Sport, Ferien, Familie, …).",
    "Do not add fake flight/train itinerary panels unless the appointment is clearly travel.",
    workManClause(input),
    TRAVEL_STYLE,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Exported for tests. */
export function buildAgendaAiIconPrompt(input: AgendaIconSubject): string {
  if (isBirthdayAgendaSubject(input)) return buildBirthdayPrompt(input);
  if (isOnlineAgendaMeeting(input)) return buildOnlineMeetingPrompt(input);
  if (hasDriveAgendaContext(input)) return buildDrivePrompt(input);
  return buildStandardPrompt(input);
}

async function maybeCompositeStaticMap(
  aiPngOrJpeg: Buffer,
  input: AgendaIconSubject
): Promise<Buffer> {
  const lat = input.coords?.lat;
  const lon = input.coords?.lon;
  if (
    !hasDriveAgendaContext(input) ||
    lat == null ||
    lon == null ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return aiPngOrJpeg;
  }

  try {
    const map = await fetchStaticMapPng({
      lat,
      lon,
      zoom: 13,
      withMarker: true,
    });
    if (!map) return aiPngOrJpeg;

    const sharp = (await import("sharp")).default;
    const base = sharp(aiPngOrJpeg).resize(1024, 1024, { fit: "cover" });
    const inset = await sharp(map)
      .resize(220, 220, { fit: "cover" })
      .png()
      .toBuffer();

    const framed = await sharp({
      create: {
        width: 236,
        height: 236,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([{ input: inset, top: 8, left: 8 }])
      .png()
      .toBuffer();

    return await base
      .composite([{ input: framed, top: 1024 - 236 - 28, left: 28 }])
      .jpeg({ quality: 88 })
      .toBuffer();
  } catch (err) {
    console.warn(
      "[agenda-ai-icon] map composite:",
      err instanceof Error ? err.message : err
    );
    return aiPngOrJpeg;
  }
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
  const prompt = buildAgendaAiIconPrompt(input);
  const result = await getOpenAIClient().images.generate({
    model: "gpt-image-2",
    size: "1024x1024",
    quality: "low",
    prompt,
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("Bildgenerierung lieferte kein Bild");

  const raw = Buffer.from(b64, "base64");
  const withMap = await maybeCompositeStaticMap(raw, input);

  const sharp = (await import("sharp")).default;
  const jpg = await sharp(withMap)
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

/** Google / Microsoft agenda rows only (not ICS / holidays / Buddy-local). */
export function isCloudCalendarAgendaId(id: string | null | undefined): boolean {
  const s = id || "";
  return s.startsWith("gcal-") || s.startsWith("mscal-");
}
