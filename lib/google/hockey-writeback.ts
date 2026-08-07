import { google } from "googleapis";
import { getSetting, setSetting } from "@/lib/db/migrations";
import { getEnabledGoogleCalendarSelections } from "@/lib/google/calendars";
import {
  getAuthedGoogleClient,
  hasGoogleCalendarEventsWriteScope,
  isGoogleMailConnected,
} from "@/lib/google/oauth";
import {
  formatHockeyScoreLine,
  parseMatchup,
} from "@/lib/hockey/games";
import {
  getHockeyResultForGame,
  type HockeyGameResult,
} from "@/lib/hockey/sofascore";
import { HOME_TEAM_KEY, resolveHockeyTeam } from "@/lib/hockey/teams";

const LAST_WRITEBACK_KEY_PREFIX = "hockey_google_writeback_u";
const MIN_WRITEBACK_GAP_MS = 20 * 60 * 1000;

const RESULT_BLOCK_START = "— Buddy Resultat —";
const RESULT_BLOCK_END = "— /Buddy Resultat —";
const SCORE_SUFFIX_RE = /\s+\d+:\d+\s*$/;

export type GoogleHockeyWritebackSummary = {
  attempted: boolean;
  reason?: string;
  updated: number;
};

function lastKey(userId: number): string {
  return `${LAST_WRITEBACK_KEY_PREFIX}${userId}`;
}

function zurichDateFromIso(iso: string): string | null {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Zurich",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

function stripScoreSuffix(summary: string): string {
  return summary.replace(SCORE_SUFFIX_RE, "").trim();
}

function buildSummaryWithScore(
  summary: string,
  result: HockeyGameResult
): string {
  const base = stripScoreSuffix(summary);
  return `${base} ${formatHockeyScoreLine(result)}`.trim();
}

function stripResultBlock(description: string | null | undefined): string {
  const raw = description || "";
  const start = raw.indexOf(RESULT_BLOCK_START);
  if (start < 0) return raw.trim();
  const end = raw.indexOf(RESULT_BLOCK_END, start);
  if (end < 0) {
    return raw.slice(0, start).trim();
  }
  return `${raw.slice(0, start)}${raw.slice(end + RESULT_BLOCK_END.length)}`
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildDescriptionWithResult(
  description: string | null | undefined,
  result: HockeyGameResult
): string {
  const base = stripResultBlock(description);
  const lines = [
    RESULT_BLOCK_START,
    `Resultat: ${formatHockeyScoreLine(result)}`,
  ];
  if (result.scorers?.length) {
    lines.push(`Torschützen: ${result.scorers.join(", ")}`);
  }
  lines.push(RESULT_BLOCK_END);
  const block = lines.join("\n");
  return base ? `${base}\n\n${block}` : block;
}

function alreadyWritten(
  summary: string,
  description: string | null | undefined,
  result: HockeyGameResult
): boolean {
  const score = formatHockeyScoreLine(result);
  if (!summary.includes(score)) return false;
  const desc = description || "";
  if (!desc.includes(RESULT_BLOCK_START)) return false;
  if (!desc.includes(`Resultat: ${score}`)) return false;
  if (result.scorers?.length) {
    return desc.includes(`Torschützen: ${result.scorers.join(", ")}`);
  }
  return true;
}

/**
 * Patch matching events on the user's Google hockey calendars with
 * Sofascore score (+ scorers in description). Requires calendar.events.
 */
export async function writeHockeyResultsToGoogleCalendars(
  userId: number,
  options?: { force?: boolean; request?: Request | null }
): Promise<GoogleHockeyWritebackSummary> {
  if (!isGoogleMailConnected(userId)) {
    return { attempted: false, reason: "not-connected", updated: 0 };
  }
  if (!hasGoogleCalendarEventsWriteScope(userId)) {
    return { attempted: false, reason: "no-write-scope", updated: 0 };
  }

  const hockeyCals = getEnabledGoogleCalendarSelections(userId).filter(
    (s) => (s.type || "other") === "hockey"
  );
  if (hockeyCals.length === 0) {
    return { attempted: false, reason: "no-hockey-cal", updated: 0 };
  }

  if (!options?.force) {
    const lastRaw = getSetting(lastKey(userId));
    if (lastRaw) {
      const last = new Date(lastRaw).getTime();
      if (
        Number.isFinite(last) &&
        Date.now() - last < MIN_WRITEBACK_GAP_MS
      ) {
        return { attempted: false, reason: "throttled", updated: 0 };
      }
    }
  }

  setSetting(lastKey(userId), new Date().toISOString());

  const auth = await getAuthedGoogleClient(userId, options?.request);
  const calendar = google.calendar({ version: "v3", auth });

  const now = new Date();
  const timeMin = new Date(
    now.getTime() - 5 * 24 * 60 * 60 * 1000
  ).toISOString();
  const timeMax = new Date(
    now.getTime() + 1 * 24 * 60 * 60 * 1000
  ).toISOString();

  let updated = 0;

  for (const sel of hockeyCals) {
    try {
      let pageToken: string | undefined;
      do {
        const res = await calendar.events.list({
          calendarId: sel.id,
          singleEvents: true,
          orderBy: "startTime",
          timeMin,
          timeMax,
          timeZone: "Europe/Zurich",
          maxResults: 250,
          pageToken,
        });

        for (const ev of res.data.items || []) {
          if (ev.status === "cancelled" || !ev.id) continue;
          const summary = (ev.summary || "").trim();
          const matchup = parseMatchup(stripScoreSuffix(summary));
          if (!matchup) continue;

          const date =
            ev.start?.date?.slice(0, 10) ||
            (ev.start?.dateTime
              ? zurichDateFromIso(ev.start.dateTime)
              : null);
          if (!date) continue;

          const home = resolveHockeyTeam(matchup.homeLabel);
          const away = resolveHockeyTeam(matchup.awayLabel);
          if (home.key !== HOME_TEAM_KEY && away.key !== HOME_TEAM_KEY) {
            continue;
          }

          const result = getHockeyResultForGame({
            uid: ev.id,
            date,
            homeKey: home.key,
            awayKey: away.key,
          });
          if (!result) continue;

          if (alreadyWritten(summary, ev.description, result)) continue;

          const nextSummary = buildSummaryWithScore(summary, result);
          const nextDescription = buildDescriptionWithResult(
            ev.description,
            result
          );

          await calendar.events.patch({
            calendarId: sel.id,
            eventId: ev.id,
            requestBody: {
              summary: nextSummary,
              description: nextDescription,
            },
          });
          updated += 1;
        }
        pageToken = res.data.nextPageToken || undefined;
      } while (pageToken);
    } catch (error) {
      console.warn(
        "[hockey] Google writeback failed for calendar",
        sel.id,
        error instanceof Error ? error.message : error
      );
    }
  }

  return { attempted: true, updated };
}
