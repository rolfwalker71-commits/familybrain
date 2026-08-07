import { getSetting, setSetting } from "@/lib/db/migrations";

export const SOFASCORE_KEY_SETTING = "sofascore_rapidapi_key";
export const SOFASCORE_USAGE_SETTING = "sofascore_usage_json";
export const SOFASCORE_RESULTS_SETTING = "hockey_sofascore_results_json";

export const SOFASCORE_HOST = "sofascore.p.rapidapi.com";
export const SOFASCORE_MONTHLY_LIMIT = 50;
/** Ambri on Sofascore */
export const SOFASCORE_AMBRI_TEAM_ID = 3896;

export type SofascoreUsage = {
  /** YYYY-MM → request count */
  months: Record<string, number>;
};

export type HockeyGameResult = {
  homeScore: number;
  awayScore: number;
  status: string;
  sofascoreMatchId: number;
  scorers: string[];
  updatedAt: string;
};

export type HockeyResultsStore = {
  /** calendar game uid → result */
  byUid: Record<string, HockeyGameResult>;
  /** date|homeKey|awayKey → result (stable across ICS vs Google) */
  byFingerprint?: Record<string, HockeyGameResult>;
  /** last successful evening sync date (Europe/Zurich YYYY-MM-DD) */
  lastEveningSyncDate?: string | null;
};

function monthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function getSofascoreApiKey(): string | null {
  const stored = getSetting(SOFASCORE_KEY_SETTING)?.trim();
  if (stored) return stored;
  const fromEnv = process.env.SOFASCORE_RAPIDAPI_KEY?.trim();
  return fromEnv || null;
}

export function saveSofascoreApiKey(key: string | null): void {
  setSetting(SOFASCORE_KEY_SETTING, key?.trim() || null);
}

export function hasSofascoreApiKey(): boolean {
  return Boolean(getSofascoreApiKey());
}

function readUsage(): SofascoreUsage {
  const raw = getSetting(SOFASCORE_USAGE_SETTING);
  if (!raw) return { months: {} };
  try {
    const parsed = JSON.parse(raw) as SofascoreUsage;
    return { months: parsed.months || {} };
  } catch {
    return { months: {} };
  }
}

export function getSofascoreUsageThisMonth(): number {
  return Number(readUsage().months[monthKey()] || 0);
}

export function getSofascoreRemainingQuota(): number {
  return Math.max(0, SOFASCORE_MONTHLY_LIMIT - getSofascoreUsageThisMonth());
}

function recordUsage(count = 1): void {
  const usage = readUsage();
  const key = monthKey();
  usage.months[key] = Number(usage.months[key] || 0) + count;
  // keep only last 6 months
  const keys = Object.keys(usage.months).sort();
  while (keys.length > 6) {
    const drop = keys.shift();
    if (drop) delete usage.months[drop];
  }
  setSetting(SOFASCORE_USAGE_SETTING, JSON.stringify(usage));
}

export function readHockeyResultsStore(): HockeyResultsStore {
  const raw = getSetting(SOFASCORE_RESULTS_SETTING);
  if (!raw) return { byUid: {}, byFingerprint: {} };
  try {
    const parsed = JSON.parse(raw) as HockeyResultsStore;
    return {
      byUid: parsed.byUid || {},
      byFingerprint: parsed.byFingerprint || {},
      lastEveningSyncDate: parsed.lastEveningSyncDate,
    };
  } catch {
    return { byUid: {}, byFingerprint: {} };
  }
}

export function writeHockeyResultsStore(store: HockeyResultsStore): void {
  setSetting(
    SOFASCORE_RESULTS_SETTING,
    JSON.stringify({
      byUid: store.byUid || {},
      byFingerprint: store.byFingerprint || {},
      lastEveningSyncDate: store.lastEveningSyncDate ?? null,
    } satisfies HockeyResultsStore)
  );
}

export function hockeyGameFingerprint(parts: {
  date: string;
  homeKey: string;
  awayKey: string;
}): string {
  return `${parts.date}|${parts.homeKey}|${parts.awayKey}`;
}

export function getHockeyResultForUid(uid: string): HockeyGameResult | null {
  return readHockeyResultsStore().byUid[uid] || null;
}

export function getHockeyResultForGame(parts: {
  uid: string;
  date: string;
  homeKey: string;
  awayKey: string;
}): HockeyGameResult | null {
  const store = readHockeyResultsStore();
  if (store.byUid[parts.uid]) return store.byUid[parts.uid]!;
  const fp = hockeyGameFingerprint(parts);
  return store.byFingerprint?.[fp] || null;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export class SofascoreQuotaError extends Error {
  constructor(message = "Sofascore-Monatskontingent erschöpft (50 Requests).") {
    super(message);
    this.name = "SofascoreQuotaError";
  }
}

/**
 * GET against RapidAPI Sofascore wrapper. Counts toward monthly quota.
 */
export async function sofascoreGet<T = unknown>(
  path: string,
  params?: Record<string, string | number>
): Promise<T> {
  const key = getSofascoreApiKey();
  if (!key) throw new Error("Sofascore RapidAPI-Key fehlt.");
  if (getSofascoreRemainingQuota() <= 0) throw new SofascoreQuotaError();

  const url = new URL(`https://${SOFASCORE_HOST}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
  }

  // Free plan: strict per-second limit
  await sleep(1100);

  const res = await fetch(url, {
    headers: {
      "x-rapidapi-host": SOFASCORE_HOST,
      "x-rapidapi-key": key,
      Accept: "application/json, image/png, */*",
    },
    signal: AbortSignal.timeout(30000),
    cache: "no-store",
  });

  recordUsage(1);

  if (res.status === 429) {
    throw new Error("Sofascore Rate-Limit — bitte später erneut.");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Sofascore HTTP ${res.status}: ${text.slice(0, 160)}`);
  }

  const ctype = (res.headers.get("content-type") || "").toLowerCase();
  if (ctype.includes("image/") || ctype.includes("octet-stream")) {
    const buffer = Buffer.from(await res.arrayBuffer());
    return buffer as unknown as T;
  }
  const text = await res.text();
  if (!text.trim()) return {} as T;
  return JSON.parse(text) as T;
}

export async function sofascoreGetTeamLogoPng(
  teamId: number
): Promise<Buffer | null> {
  try {
    const data = await sofascoreGet<Buffer>("/teams/get-logo", { teamId });
    if (!Buffer.isBuffer(data) || data.byteLength < 200) return null;
    if (data[0] !== 0x89) return null; // PNG
    return data;
  } catch {
    return null;
  }
}

export type SofascoreEvent = {
  id: number;
  customId?: string;
  startTimestamp?: number;
  status?: { code?: number; description?: string; type?: string };
  homeTeam?: { id?: number; name?: string };
  awayTeam?: { id?: number; name?: string };
  homeScore?: { current?: number; display?: number };
  awayScore?: { current?: number; display?: number };
  season?: { id?: number; name?: string; year?: string };
};

export async function sofascoreGetLastMatches(
  teamId: number
): Promise<SofascoreEvent[]> {
  const data = await sofascoreGet<{ events?: SofascoreEvent[] }>(
    "/teams/get-last-matches",
    { teamId }
  );
  return data.events || [];
}

export type SofascoreIncident = {
  incidentType?: string;
  time?: number;
  isHome?: boolean;
  homeScore?: number;
  awayScore?: number;
  player?: { name?: string; shortName?: string };
};

export async function sofascoreGetIncidents(
  matchId: number
): Promise<SofascoreIncident[]> {
  const data = await sofascoreGet<{ incidents?: SofascoreIncident[] }>(
    "/matches/get-incidents",
    { matchId }
  );
  return data.incidents || [];
}

export function formatSofascoreScorers(
  incidents: SofascoreIncident[]
): string[] {
  const goals = incidents.filter((i) => i.incidentType === "goal");
  // API returns newest first — reverse for chronological
  return [...goals]
    .reverse()
    .map((g) => {
      const name = g.player?.shortName || g.player?.name || "?";
      const t = g.time != null ? `${g.time}′` : "";
      return [t, name].filter(Boolean).join(" ");
    })
    .filter(Boolean);
}

/** Zurich calendar date YYYY-MM-DD */
export function zurichDateIso(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function zurichHour(d = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    hour: "numeric",
    hour12: false,
  }).formatToParts(d);
  return Number(parts.find((p) => p.type === "hour")?.value || 0) % 24;
}

/** Minutes since midnight in Europe/Zurich (0–1439). */
export function zurichMinutesOfDay(d = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value || 0) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return hour * 60 + minute;
}
