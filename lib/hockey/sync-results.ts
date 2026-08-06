import {
  getHockeyGames,
  type HockeyGame,
} from "@/lib/hockey/games";
import { HOME_TEAM_KEY, hockeyTeamByKey } from "@/lib/hockey/teams";
import {
  formatSofascoreScorers,
  getHockeyResultForUid,
  getSofascoreRemainingQuota,
  hasSofascoreApiKey,
  readHockeyResultsStore,
  sofascoreGetIncidents,
  sofascoreGetLastMatches,
  type HockeyGameResult,
  type SofascoreEvent,
  writeHockeyResultsStore,
  zurichDateIso,
  zurichHour,
} from "@/lib/hockey/sofascore";
import { getSetting, setSetting } from "@/lib/db/migrations";

const LAST_ATTEMPT_KEY = "hockey_sofascore_last_attempt_at";
const MIN_ATTEMPT_GAP_MS = 45 * 60 * 1000;

export type HockeyResultSyncSummary = {
  attempted: boolean;
  reason?: string;
  updated: number;
  remainingQuota: number;
};

function eventZurichDate(event: SofascoreEvent): string | null {
  if (!event.startTimestamp) return null;
  return zurichDateIso(new Date(event.startTimestamp * 1000));
}

function isFinished(event: SofascoreEvent): boolean {
  const type = (event.status?.type || "").toLowerCase();
  const code = event.status?.code;
  return type === "finished" || code === 100;
}

function opponentSofascoreId(game: HockeyGame): number | null {
  const key = game.isHome ? game.awayTeam.key : game.homeTeam.key;
  return hockeyTeamByKey(key)?.sofascoreTeamId ?? null;
}

function matchEventToGame(
  game: HockeyGame,
  events: SofascoreEvent[]
): SofascoreEvent | null {
  const oppId = opponentSofascoreId(game);
  const candidates = events.filter((e) => eventZurichDate(e) === game.date);
  if (candidates.length === 0) return null;

  if (oppId != null) {
    const byOpp = candidates.find((e) => {
      const homeId = e.homeTeam?.id;
      const awayId = e.awayTeam?.id;
      return homeId === oppId || awayId === oppId;
    });
    if (byOpp) return byOpp;
  }

  // Fallback: Ambri is always one side
  return (
    candidates.find((e) => {
      const homeId = e.homeTeam?.id;
      const awayId = e.awayTeam?.id;
      const ambriId = hockeyTeamByKey(HOME_TEAM_KEY)?.sofascoreTeamId;
      return homeId === ambriId || awayId === ambriId;
    }) || candidates[0] || null
  );
}

function gamesNeedingResult(games: HockeyGame[], now: Date): HockeyGame[] {
  const today = zurichDateIso(now);
  const hour = zurichHour(now);
  // After midnight, still catch yesterday's late games
  const yesterday = zurichDateIso(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  return games.filter((g) => {
    if (g.homeTeam.key !== HOME_TEAM_KEY && g.awayTeam.key !== HOME_TEAM_KEY) {
      return false;
    }
    const existing = getHockeyResultForUid(g.uid);
    if (existing) return false;

    const start = new Date(g.startAt).getTime();
    const finishedEnough = now.getTime() >= start + 3.5 * 60 * 60 * 1000;
    if (!finishedEnough) return false;

    if (g.date === today) return true;
    if (hour < 6 && g.date === yesterday) return true;
    // Late catch-up within 2 days
    if (g.date >= yesterday && g.date <= today) return true;
    return false;
  });
}

function shouldRunEveningWindow(now: Date): boolean {
  const hour = zurichHour(now);
  // ~23:00 window + overnight catch-up
  return hour >= 22 || hour < 6;
}

/**
 * After Ambri match day (~23:00 Zurich), pull final score (+ scorers if quota allows).
 * Uses ~1 request (last matches); +1 for incidents when remaining quota is comfortable.
 */
export async function syncHockeyResultsIfDue(
  now = new Date()
): Promise<HockeyResultSyncSummary> {
  const remaining = getSofascoreRemainingQuota();
  if (!hasSofascoreApiKey()) {
    return { attempted: false, reason: "no-key", updated: 0, remainingQuota: remaining };
  }
  if (remaining <= 0) {
    return { attempted: false, reason: "quota", updated: 0, remainingQuota: 0 };
  }
  if (!shouldRunEveningWindow(now)) {
    return {
      attempted: false,
      reason: "outside-window",
      updated: 0,
      remainingQuota: remaining,
    };
  }

  const lastAttemptRaw = getSetting(LAST_ATTEMPT_KEY);
  if (lastAttemptRaw) {
    const last = new Date(lastAttemptRaw).getTime();
    if (Number.isFinite(last) && now.getTime() - last < MIN_ATTEMPT_GAP_MS) {
      return {
        attempted: false,
        reason: "throttled",
        updated: 0,
        remainingQuota: remaining,
      };
    }
  }

  let games: HockeyGame[] = [];
  try {
    const pack = await getHockeyGames();
    games = pack.games;
  } catch {
    return {
      attempted: false,
      reason: "calendar",
      updated: 0,
      remainingQuota: remaining,
    };
  }

  const pending = gamesNeedingResult(games, now);
  if (pending.length === 0) {
    return {
      attempted: false,
      reason: "nothing-pending",
      updated: 0,
      remainingQuota: remaining,
    };
  }

  setSetting(LAST_ATTEMPT_KEY, now.toISOString());

  const ambriId = hockeyTeamByKey(HOME_TEAM_KEY)?.sofascoreTeamId;
  if (!ambriId) {
    return {
      attempted: false,
      reason: "no-ambri-id",
      updated: 0,
      remainingQuota: remaining,
    };
  }

  let events: SofascoreEvent[];
  try {
    events = await sofascoreGetLastMatches(ambriId);
  } catch (error) {
    console.warn(
      "[hockey] Sofascore last-matches failed:",
      error instanceof Error ? error.message : error
    );
    return {
      attempted: true,
      reason: "api-error",
      updated: 0,
      remainingQuota: getSofascoreRemainingQuota(),
    };
  }

  const store = readHockeyResultsStore();
  let updated = 0;

  for (const game of pending) {
    const event = matchEventToGame(game, events);
    if (!event || !isFinished(event)) continue;

    const homeScore = event.homeScore?.current ?? event.homeScore?.display;
    const awayScore = event.awayScore?.current ?? event.awayScore?.display;
    if (homeScore == null || awayScore == null) continue;

    let scorers: string[] = [];
    // Optional second call — only if we still have headroom after logos/season
    if (getSofascoreRemainingQuota() >= 8) {
      try {
        const incidents = await sofascoreGetIncidents(event.id);
        scorers = formatSofascoreScorers(incidents);
      } catch (error) {
        console.warn(
          "[hockey] Sofascore incidents failed:",
          error instanceof Error ? error.message : error
        );
      }
    }

    const result: HockeyGameResult = {
      homeScore: Number(homeScore),
      awayScore: Number(awayScore),
      status: event.status?.description || "Ended",
      sofascoreMatchId: event.id,
      scorers,
      updatedAt: new Date().toISOString(),
    };
    store.byUid[game.uid] = result;
    updated += 1;
  }

  if (updated > 0) {
    store.lastEveningSyncDate = zurichDateIso(now);
    writeHockeyResultsStore(store);
  }

  return {
    attempted: true,
    updated,
    remainingQuota: getSofascoreRemainingQuota(),
  };
}

export function attachHockeyResult(
  game: HockeyGame
): HockeyGame & { result: HockeyGameResult | null } {
  return { ...game, result: getHockeyResultForUid(game.uid) };
}
