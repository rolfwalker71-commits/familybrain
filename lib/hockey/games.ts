import { getSetting, setSetting } from "@/lib/db/migrations";
import {
  HOME_TEAM_KEY,
  hockeyTeamLogoUrl,
  resolveHockeyTeam,
} from "@/lib/hockey/teams";
import { ensureHockeyLogo } from "@/lib/hockey/logo";
import {
  getHockeyResultForUid,
  type HockeyGameResult,
} from "@/lib/hockey/sofascore";

const ICS_URL =
  "https://calendar.google.com/calendar/ical/c_f974949164df4b0605b30aa319f918570bb7b00ebb7514e06558dad73706f8cd%40group.calendar.google.com/public/basic.ics";

const CACHE_KEY = "hockey_ambri_ics_cache";
const CACHE_TTL_MS = 30 * 60 * 1000;

export type HockeyGame = {
  uid: string;
  startAt: string;
  endAt: string | null;
  date: string;
  time: string | null;
  summary: string;
  location: string | null;
  homeTeam: { key: string; label: string; logoUrl: string };
  awayTeam: { key: string; label: string; logoUrl: string };
  opponent: { key: string; label: string; logoUrl: string };
  isHome: boolean;
  /** Final score from Sofascore evening sync, if available. */
  result: HockeyGameResult | null;
};

type CachePayload = {
  fetchedAt: string;
  ics: string;
};

function unfoldIcs(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function parseIcsDateTime(value: string): Date | null {
  const v = value.trim();
  // YYYYMMDD
  const day = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (day) {
    return new Date(
      Number(day[1]),
      Number(day[2]) - 1,
      Number(day[3]),
      12,
      0,
      0
    );
  }
  // YYYYMMDDTHHMMSSZ or floating
  const dt =
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (!dt) return null;
  if (dt[7] === "Z") {
    return new Date(
      Date.UTC(
        Number(dt[1]),
        Number(dt[2]) - 1,
        Number(dt[3]),
        Number(dt[4]),
        Number(dt[5]),
        Number(dt[6])
      )
    );
  }
  return new Date(
    Number(dt[1]),
    Number(dt[2]) - 1,
    Number(dt[3]),
    Number(dt[4]),
    Number(dt[5]),
    Number(dt[6])
  );
}

function prop(block: string, name: string): string | null {
  const re = new RegExp(`(?:^|\\n)${name}(?:;[^:\\n]*)?:([^\\n]*)`);
  const m = re.exec(block);
  return m ? m[1].replace(/\\n/g, "\n").replace(/\\,/g, ",").trim() : null;
}

function isoZurichDate(d: Date): string {
  // en-CA → YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function localTime(d: Date): string {
  return d.toLocaleTimeString("de-CH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Zurich",
  });
}

function teamSide(label: string) {
  const team = resolveHockeyTeam(label);
  return {
    key: team.key,
    label: team.label,
    logoUrl: hockeyTeamLogoUrl(team.key),
  };
}

/** «Home - Away» as printed on the Ambri calendar. */
export function parseMatchup(summary: string): {
  homeLabel: string;
  awayLabel: string;
} | null {
  const text = summary.replace(/\s+/g, " ").trim();
  if (!text || /^busy$/i.test(text)) return null;
  const parts = text.split(/\s+[-–—]\s+/);
  if (parts.length < 2) return null;
  return {
    homeLabel: parts[0]!.trim(),
    awayLabel: parts.slice(1).join(" - ").trim(),
  };
}

export function parseHockeyGamesFromIcs(ics: string): HockeyGame[] {
  const unfolded = unfoldIcs(ics);
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  const games: HockeyGame[] = [];

  for (const block of blocks) {
    const summary = prop(block, "SUMMARY");
    if (!summary) continue;
    const matchup = parseMatchup(summary);
    if (!matchup) continue;
    const startRaw = prop(block, "DTSTART");
    if (!startRaw) continue;
    const start = parseIcsDateTime(startRaw);
    if (!start || !Number.isFinite(start.getTime())) continue;
    const endRaw = prop(block, "DTEND");
    const end = endRaw ? parseIcsDateTime(endRaw) : null;
    const uid =
      prop(block, "UID") ||
      `${isoZurichDate(start)}-${matchup.homeLabel}-${matchup.awayLabel}`;

    const homeTeam = teamSide(matchup.homeLabel);
    const awayTeam = teamSide(matchup.awayLabel);
    const isHome = homeTeam.key === HOME_TEAM_KEY;
    const opponent = isHome ? awayTeam : homeTeam;

    games.push({
      uid,
      startAt: start.toISOString(),
      endAt: end && Number.isFinite(end.getTime()) ? end.toISOString() : null,
      date: isoZurichDate(start),
      time: localTime(start),
      summary: summary.trim(),
      location: prop(block, "LOCATION"),
      homeTeam,
      awayTeam,
      opponent,
      isHome,
      result: getHockeyResultForUid(uid),
    });
  }

  return games.sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export function formatHockeyScoreLine(result: HockeyGameResult): string {
  return `${result.homeScore}:${result.awayScore}`;
}

async function fetchIcs(): Promise<string> {
  const res = await fetch(ICS_URL, {
    headers: {
      "User-Agent": "BuddyHockey/1.0 (familybrain; local household app)",
      Accept: "text/calendar, text/plain, */*",
    },
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Hockey-Kalender nicht erreichbar (${res.status})`);
  }
  const text = await res.text();
  if (!text.includes("BEGIN:VCALENDAR")) {
    throw new Error("Hockey-Kalender lieferte kein ICS");
  }
  return text;
}

function readCache(): CachePayload | null {
  const raw = getSetting(CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachePayload;
    if (!parsed?.ics || !parsed.fetchedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getHockeyGames(options?: {
  forceRefresh?: boolean;
}): Promise<{
  games: HockeyGame[];
  fetchedAt: string;
  calendarName: string;
}> {
  const cached = readCache();
  const age = cached
    ? Date.now() - new Date(cached.fetchedAt).getTime()
    : Number.POSITIVE_INFINITY;
  let ics = cached?.ics || "";
  let fetchedAt = cached?.fetchedAt || new Date().toISOString();

  if (options?.forceRefresh || !cached || age > CACHE_TTL_MS) {
    try {
      ics = await fetchIcs();
      fetchedAt = new Date().toISOString();
      setSetting(
        CACHE_KEY,
        JSON.stringify({ fetchedAt, ics } satisfies CachePayload)
      );
    } catch (error) {
      if (!cached?.ics) throw error;
      ics = cached.ics;
      fetchedAt = cached.fetchedAt;
    }
  }

  const nameMatch = /X-WR-CALNAME:(.*)/.exec(ics);
  return {
    games: parseHockeyGamesFromIcs(ics),
    fetchedAt,
    calendarName: nameMatch?.[1]?.trim() || "HC Ambri-Piotta",
  };
}

export function getUpcomingHockeyGames(
  games: HockeyGame[],
  now = new Date(),
  limit = 8
): HockeyGame[] {
  const threshold = now.getTime() - 3 * 60 * 60 * 1000;
  return games
    .filter((g) => new Date(g.startAt).getTime() >= threshold)
    .slice(0, limit);
}

export function getNextHockeyGame(
  games: HockeyGame[],
  now = new Date()
): HockeyGame | null {
  return getUpcomingHockeyGames(games, now, 1)[0] || null;
}

/** Warm official logos for teams appearing in upcoming games. */
export async function ensureLogosForGames(
  games: HockeyGame[]
): Promise<void> {
  const seen = new Map<string, string>();
  for (const game of games) {
    seen.set(game.homeTeam.key, game.homeTeam.label);
    seen.set(game.awayTeam.key, game.awayTeam.label);
  }
  for (const [key, label] of seen) {
    await ensureHockeyLogo({ key, label }).catch(() => null);
  }
}
