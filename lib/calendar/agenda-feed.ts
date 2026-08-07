import { getDb } from "@/lib/db/client";
import {
  AMBRI_CALENDAR_ID,
  getEnabledIcsCalendars,
  ICS_TYPE_META,
  listIcsCalendarsForOwner,
  type IcsCalendar,
  type IcsCalendarType,
} from "@/lib/calendar/ics-calendars";
import { getGenericCalendarEvents } from "@/lib/calendar/ics-generic";
import { extractMeetUrl } from "@/lib/calendar/meet-url";
import {
  getEnabledGoogleCalendarSelections,
  googleCalendarSourceId,
  listGoogleAgendaInRange,
  listGoogleHockeyGamesInRange,
} from "@/lib/google/calendars";
import {
  hasGoogleCalendarScope,
  isGoogleMailConnected,
} from "@/lib/google/oauth";
import {
  getSwissHolidays,
  holidayBadge,
  holidaySubtitle,
  holidaysInRange,
} from "@/lib/calendar/swiss-holidays";
import { enrichAgendaWithWeather } from "@/lib/dashboard/agenda-weather";
import type {
  AgendaItem,
  HockeyGameCard,
} from "@/lib/dashboard/overview";
import {
  CALENDAR_SOURCE_INVOICES,
  CALENDAR_SOURCE_TRAVEL,
  listInvoiceAgendaItems,
  listTravelAgendaItems,
} from "@/lib/dashboard/buddy-agenda-items";
import {
  formatHockeyScoreLine,
  getHockeyGames,
  getNextHockeyGame,
  getUpcomingHockeyGames,
  type HockeyGame,
} from "@/lib/hockey/games";

export const CALENDAR_SOURCE_HOLIDAYS = "swiss-holidays";
export const CALENDAR_SOURCE_DEADLINES = "deadlines";
export const CALENDAR_SOURCE_PEOPLE_BIRTHDAYS = "people-birthdays";
export {
  CALENDAR_SOURCE_TRAVEL,
  CALENDAR_SOURCE_INVOICES,
} from "@/lib/dashboard/buddy-agenda-items";

function looksLikeBirthdayTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return false;
  if (/^Geburtstag\b/i.test(t)) return true;
  if (/\bhat\s+Geburtstag\b/i.test(t)) return true;
  if (/\bBirthday\b/i.test(t)) return true;
  return false;
}

export type CalendarAgendaRange = "today" | "week" | "14d";

export type CalendarSource = {
  id: string;
  name: string;
  color: string;
  type: IcsCalendarType | "holiday" | "deadline" | "travel" | "invoice";
  builtin?: boolean;
  /** From settings — only ICS rows use this for enablement. */
  enabled: boolean;
};

export type CalendarAgendaPayload = {
  range: CalendarAgendaRange;
  rangeStart: string;
  rangeEnd: string;
  items: AgendaItem[];
  sources: CalendarSource[];
};

function zurichIsoDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return zurichIsoDate(d);
}

export function resolveCalendarRange(
  range: CalendarAgendaRange,
  now = new Date()
): { start: string; end: string } {
  const start = zurichIsoDate(now);
  if (range === "today") {
    // Optional next-24h: include tomorrow so late evening still sees next morning
    return { start, end: addDaysIso(start, 1) };
  }
  if (range === "week") {
    return { start, end: addDaysIso(start, 6) };
  }
  return { start, end: addDaysIso(start, 13) };
}

function inRange(date: string | null | undefined, start: string, end: string) {
  if (!date) return false;
  const d = date.slice(0, 10);
  return d >= start && d <= end;
}

function hockeyAgendaMeta(game: HockeyGame): {
  subtitle: string | null;
  badge: string;
  score: string | null;
  scorers: string[] | null;
} {
  const score = game.result ? formatHockeyScoreLine(game.result) : null;
  const parts = [score, game.time, game.location].filter(Boolean);
  const scorers =
    game.result?.scorers && game.result.scorers.length > 0
      ? game.result.scorers
      : null;
  if (scorers) {
    parts.push(scorers.slice(0, 4).join(", "));
  }
  return {
    subtitle: parts.join(" · ") || null,
    badge: score || "Hockey",
    score,
    scorers,
  };
}

function toHockeyCard(game: HockeyGame): HockeyGameCard {
  return {
    uid: game.uid,
    date: game.date,
    time: game.time,
    title: game.summary,
    location: game.location,
    isHome: game.isHome,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    opponent: game.opponent,
    score: game.result ? formatHockeyScoreLine(game.result) : null,
    scorers: game.result?.scorers || [],
  };
}

export function listCalendarSources(userId: number | null): CalendarSource[] {
  const ics = listIcsCalendarsForOwner(userId).map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    type: c.type as CalendarSource["type"],
    builtin: c.builtin,
    enabled: c.enabled,
  }));
  const googleSelected =
    userId != null &&
    isGoogleMailConnected(userId) &&
    hasGoogleCalendarScope(userId)
      ? getEnabledGoogleCalendarSelections(userId).map((s) => ({
          id: googleCalendarSourceId(s.id),
          name: s.name || (s.id.includes("@") ? s.id.split("@")[0]! : s.id),
          color: s.color || ICS_TYPE_META[s.type || "other"].defaultColor,
          type: (s.type || "other") as CalendarSource["type"],
          builtin: true,
          enabled: true,
        }))
      : [];
  return [
    ...ics,
    ...googleSelected,
    {
      id: CALENDAR_SOURCE_HOLIDAYS,
      name: "Feiertage UR/ZH",
      color: "#8b5cf6",
      type: "holiday",
      builtin: true,
      enabled: true,
    },
    {
      id: CALENDAR_SOURCE_DEADLINES,
      name: "Fristen",
      color: "#0d9488",
      type: "deadline",
      builtin: true,
      enabled: true,
    },
    {
      id: CALENDAR_SOURCE_PEOPLE_BIRTHDAYS,
      name: "Geburtstage (Kontakte)",
      color: "#db2777",
      type: "birthday",
      builtin: true,
      enabled: true,
    },
    {
      id: CALENDAR_SOURCE_TRAVEL,
      name: "Reisen",
      color: "#0284c7",
      type: "other",
      builtin: true,
      enabled: true,
    },
    {
      id: CALENDAR_SOURCE_INVOICES,
      name: "Zahlungen / Rechnungen",
      color: "#0f766e",
      type: "other",
      builtin: true,
      enabled: true,
    },
  ];
}

type TaggedHockey = HockeyGame & {
  calendarId: string;
  calendarName: string;
  color: string;
  planningRelevant: boolean;
};

async function loadHockeyGames(
  calendars: IcsCalendar[]
): Promise<TaggedHockey[]> {
  const hockeyCalendars = calendars.filter((c) => c.type === "hockey");
  const batches = await Promise.all(
    hockeyCalendars.map(async (cal) => {
      try {
        const hockey = await getHockeyGames({
          icsUrl: cal.url,
          cacheKey:
            cal.id === AMBRI_CALENDAR_ID
              ? "hockey_ambri_ics_cache"
              : `hockey_ics_cache_${cal.id}`,
          calendarName: cal.name,
        });
        return hockey.games.map(
          (game) =>
            ({
              ...game,
              calendarId: cal.id,
              calendarName: cal.name,
              color: cal.color,
              planningRelevant: cal.planningRelevant !== false,
            }) satisfies TaggedHockey
        );
      } catch {
        return [] as TaggedHockey[];
      }
    })
  );
  const hockeyGames = batches.flat();
  hockeyGames.sort((a, b) => a.startAt.localeCompare(b.startAt));
  return hockeyGames;
}

function sourceAllowed(
  sourceId: string,
  filterIds: Set<string> | null
): boolean {
  if (filterIds == null) return true;
  if (filterIds.size === 0) return false;
  return filterIds.has(sourceId);
}

/**
 * Calendar / Termine feed: ICS (incl. hockey), Google birthdays, Swiss holidays, deadlines.
 */
export async function getCalendarAgenda(options: {
  /** App user whose ICS feeds to load; null = legacy global until migrated. */
  userId: number | null;
  range: CalendarAgendaRange;
  /** If set, only these source ids. Empty/omit = all enabled ICS + holidays + deadlines. */
  sourceIds?: string[] | null;
  includeWeather?: boolean;
}): Promise<CalendarAgendaPayload> {
  const { start, end } = resolveCalendarRange(options.range);
  const filterIds =
    options.sourceIds == null ? null : new Set(options.sourceIds);

  const sources = listCalendarSources(options.userId);
  const enabledIcs = getEnabledIcsCalendars(options.userId).filter((c) =>
    sourceAllowed(c.id, filterIds)
  );

  const items: AgendaItem[] = [];
  const today = zurichIsoDate();

  const googleReady =
    options.userId != null &&
    isGoogleMailConnected(options.userId) &&
    hasGoogleCalendarScope(options.userId);

  const hockeyIcs = enabledIcs.filter((c) => c.type === "hockey");
  const genericIcs = enabledIcs.filter((c) => c.type !== "hockey");

  const wantHolidays = sourceAllowed(CALENDAR_SOURCE_HOLIDAYS, filterIds);
  const holidayYears = wantHolidays
    ? [
        ...new Set(
          [start, end, today]
            .map((d) => Number(d.slice(0, 4)))
            .filter((y) => Number.isFinite(y))
        ),
      ]
    : [];

  const wantPeopleBirthdays =
    options.userId != null &&
    isGoogleMailConnected(options.userId) &&
    sourceAllowed(CALENDAR_SOURCE_PEOPLE_BIRTHDAYS, filterIds);

  const [googleBundle, icsHockey, genericBatches, swissHolidays, peopleBirthdays] =
    await Promise.all([
      googleReady
        ? listGoogleAgendaInRange(options.userId!, start, end).catch(() => ({
            events: [],
            hockey: [],
          }))
        : Promise.resolve({ events: [], hockey: [] }),
      loadHockeyGames(hockeyIcs),
      Promise.all(
        genericIcs.map(async (cal) => {
          try {
            const events = await getGenericCalendarEvents(cal);
            return { cal, events };
          } catch {
            return { cal, events: [] as Awaited<
              ReturnType<typeof getGenericCalendarEvents>
            > };
          }
        })
      ),
      wantHolidays
        ? getSwissHolidays({ years: holidayYears }).catch(() => [])
        : Promise.resolve([] as Awaited<ReturnType<typeof getSwissHolidays>>),
      (async () => {
        if (!wantPeopleBirthdays || options.userId == null) return null;
        try {
          const { hasGoogleContactsScope } = await import("@/lib/google/oauth");
          if (!hasGoogleContactsScope(options.userId)) return null;
          const {
            listPeopleBirthdaysInRange,
            getCachedPeopleHomeAddress,
            listPeopleHomeAddresses,
          } = await import("@/lib/google/people");
          const events = await listPeopleBirthdaysInRange(
            options.userId,
            start,
            end
          );
          if (!getCachedPeopleHomeAddress()) {
            void listPeopleHomeAddresses(options.userId).catch(() => undefined);
          }
          // Scope + successful call → Kontakte sind Quelle der Wahrheit für Geburtstage
          return events;
        } catch {
          return null;
        }
      })(),
    ]);

  /** Kontakte aktiv → Google-/Privat-Geburtstage ausblenden (keine Doppelung). */
  const preferPeopleBirthdays = peopleBirthdays != null;

  for (const ev of googleBundle.events) {
    const sourceId = googleCalendarSourceId(ev.calendarId);
    if (!sourceAllowed(sourceId, filterIds)) continue;
    if (
      preferPeopleBirthdays &&
      (ev.isBirthday ||
        ev.type === "birthday" ||
        looksLikeBirthdayTitle(ev.summary))
    ) {
      continue;
    }
    items.push({
      id: `gcal-${ev.calendarId}-${ev.id}`,
      kind: "calendar",
      date: ev.date,
      title: ev.summary,
      subtitle: ev.location || ev.calendarName,
      amount: null,
      currency: null,
      documentId: null,
      href: null,
      badge: ev.isBirthday
        ? "Geburtstag"
        : ICS_TYPE_META[ev.type]?.label || "Google",
      time: ev.time,
      endTime: ev.endTime,
      location: ev.location,
      meetUrl: ev.meetUrl,
      description: ev.description,
      accentColor: ev.color,
      calendarType: ev.type,
      calendarId: sourceId,
      planningRelevant: ev.planningRelevant !== false,
    });
  }

  const hockeyGames = [...icsHockey];
  for (const bundle of googleBundle.hockey) {
    const sourceId = googleCalendarSourceId(bundle.calendarId);
    if (!sourceAllowed(sourceId, filterIds)) continue;
    for (const game of bundle.games) {
      hockeyGames.push({
        ...game,
        calendarId: sourceId,
        calendarName: bundle.calendarName,
        color: bundle.color,
        planningRelevant: bundle.planningRelevant !== false,
      });
    }
  }
  hockeyGames.sort((a, b) => a.startAt.localeCompare(b.startAt));

  for (const game of hockeyGames) {
    if (!inRange(game.date, start, end)) continue;
    if (!sourceAllowed(game.calendarId, filterIds)) continue;
    const meta = hockeyAgendaMeta(game);
    items.push({
      id: `hk-${game.calendarId}-${game.uid}`,
      kind: "hockey",
      date: game.date,
      title: game.isHome ? "Heim" : "Auswärts",
      subtitle: meta.subtitle,
      amount: null,
      currency: null,
      documentId: null,
      href: null,
      badge: meta.badge,
      score: meta.score,
      scorers: meta.scorers,
      time: game.time,
      location: game.location,
      accentColor: game.color,
      calendarType: "hockey",
      calendarId: game.calendarId,
      planningRelevant: game.planningRelevant !== false,
      logos: {
        left: game.homeTeam.logoUrl || null,
        right: game.awayTeam.logoUrl || null,
        leftLabel: game.homeTeam.label,
        rightLabel: game.awayTeam.label,
      },
    });
  }

  for (const { cal, events } of genericBatches) {
    if (preferPeopleBirthdays && cal.type === "birthday") continue;
    for (const ev of events) {
      if (!inRange(ev.date, start, end)) continue;
      if (
        preferPeopleBirthdays &&
        looksLikeBirthdayTitle(ev.summary)
      ) {
        continue;
      }
      items.push({
        id: `ics-${cal.id}-${ev.uid}`,
        kind: "calendar",
        date: ev.date,
        title: ev.summary,
        subtitle: ev.location || cal.name,
        amount: null,
        currency: null,
        documentId: null,
        href: null,
        badge: ICS_TYPE_META[cal.type].label,
        time: ev.time,
        endTime: ev.endAt
          ? new Intl.DateTimeFormat("en-GB", {
              timeZone: "Europe/Zurich",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }).format(new Date(ev.endAt))
          : null,
        location: ev.location,
        meetUrl: extractMeetUrl(ev.description, ev.location),
        description: ev.description,
        accentColor: cal.color,
        calendarType: cal.type,
        calendarId: cal.id,
        planningRelevant: cal.planningRelevant !== false,
      });
    }
  }

  if (wantHolidays) {
    for (const h of holidaysInRange(swissHolidays, start, end)) {
      items.push({
        id: `hol-${h.date}-${h.canton}-${h.name}`,
        kind: "holiday",
        date: h.date,
        title: h.name,
        subtitle: holidaySubtitle(h.canton),
        amount: null,
        currency: null,
        documentId: null,
        href: null,
        badge: holidayBadge(h.canton),
        location:
          h.canton === "UR"
            ? "Altdorf"
            : h.canton === "ZH"
              ? "Regensdorf"
              : "Schweiz",
        accentColor: "#8b5cf6",
        calendarType: "holiday",
        calendarId: CALENDAR_SOURCE_HOLIDAYS,
        planningRelevant: true,
      });
    }
  }

  // People contacts birthdays — preferred over Google birthday calendar / «hat Geburtstag».
  if (preferPeopleBirthdays && peopleBirthdays) {
    for (const b of peopleBirthdays) {
      items.push({
        id: `people-${b.id}`,
        kind: "calendar",
        date: b.date,
        title: b.summary,
        subtitle: "Kontakte",
        amount: null,
        currency: null,
        documentId: null,
        href: null,
        badge: "Geburtstag",
        accentColor: "#db2777",
        calendarType: "birthday",
        calendarId: CALENDAR_SOURCE_PEOPLE_BIRTHDAYS,
        planningRelevant: true,
      });
    }
  }

  if (sourceAllowed(CALENDAR_SOURCE_DEADLINES, filterIds)) {
    const db = getDb();
    const deadlines = db
      .prepare(
        `SELECT dl.id, dl.title, dl.deadline_date, dl.deadline_type,
                d.id as document_id, d.correspondent_name
         FROM deadlines dl
         JOIN paperless_documents d ON d.id = dl.document_id
         WHERE dl.status = 'open'
           AND dl.deadline_date IS NOT NULL
           AND dl.deadline_date >= ?
           AND dl.deadline_date <= ?
           AND (dl.snoozed_until IS NULL OR TRIM(dl.snoozed_until) = '' OR dl.snoozed_until < ?)`
      )
      .all(start, end, today) as Array<{
      id: number;
      title: string | null;
      deadline_date: string;
      deadline_type: string | null;
      document_id: number;
      correspondent_name: string | null;
    }>;

    for (const row of deadlines) {
      items.push({
        id: `dl-${row.id}`,
        kind: "deadline",
        date: row.deadline_date.slice(0, 10),
        title: row.title || "Frist",
        subtitle:
          [row.correspondent_name, row.deadline_type]
            .filter(Boolean)
            .join(" · ") || null,
        amount: null,
        currency: null,
        documentId: row.document_id,
        href: null,
        badge: "Frist",
        accentColor: "#0d9488",
        calendarId: CALENDAR_SOURCE_DEADLINES,
        planningRelevant: true,
      });
    }
  }

  if (sourceAllowed(CALENDAR_SOURCE_TRAVEL, filterIds)) {
    items.push(...listTravelAgendaItems(start, end));
  }
  if (sourceAllowed(CALENDAR_SOURCE_INVOICES, filterIds)) {
    items.push(
      ...listInvoiceAgendaItems(start, end, today, {
        clampOverdueToToday: true,
      })
    );
  }

  items.sort((a, b) => {
    const c = a.date.localeCompare(b.date);
    if (c !== 0) return c;
    const ta = a.time || "99:99";
    const tb = b.time || "99:99";
    const t = ta.localeCompare(tb);
    if (t !== 0) return t;
    return a.title.localeCompare(b.title, "de");
  });

  const withWeather = options.includeWeather
    ? await enrichAgendaWithWeather(items)
    : items.map((i) => ({
        ...i,
        weather: i.weather ?? null,
        coords: i.coords ?? null,
        driveMinutes: i.driveMinutes ?? null,
        driveLabel: i.driveLabel ?? null,
        mapsUrl: i.mapsUrl ?? null,
      }));

  return {
    range: options.range,
    rangeStart: start,
    rangeEnd: end,
    items: withWeather,
    sources,
  };
}

/** Overview aside: heute + optional morgen (24h), max 12 for Tagesbriefing timeline. */
export async function getTodayCalendarExcerpt(
  userId: number | null,
  limit = 12
): Promise<AgendaItem[]> {
  const feed = await getCalendarAgenda({
    userId,
    range: "today",
    includeWeather: true,
  });
  const today = zurichIsoDate();
  const nowMs = Date.now();
  const horizonMs = nowMs + 24 * 60 * 60 * 1000;

  const ranked = feed.items.filter((item) => {
    if (item.date === today) return true;
    if (item.date > today && item.date <= feed.rangeEnd) {
      if (item.time) {
        const start = new Date(`${item.date}T${item.time}:00`).getTime();
        return Number.isFinite(start) && start <= horizonMs;
      }
      return true;
    }
    return false;
  });

  return ranked.slice(0, limit);
}

/** Overview aside: Geburtstage von heute bis +horizonDays (inkl.). */
export async function getUpcomingBirthdaysExcerpt(
  userId: number | null,
  horizonDays = 7
): Promise<AgendaItem[]> {
  const today = zurichIsoDate();
  const end = addDaysIso(today, horizonDays);
  const feed = await getCalendarAgenda({
    userId,
    range: "14d",
    includeWeather: false,
  });
  return feed.items
    .filter((item) => {
      if (item.date < today || item.date > end) return false;
      return (
        item.badge === "Geburtstag" ||
        item.calendarType === "birthday" ||
        /^Geburtstag\b/i.test(item.title) ||
        /\bhat\s+Geburtstag\b/i.test(item.title)
      );
    })
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "de")
    );
}

/** Hockey widget data for overview (enabled hockey calendars only). */
export async function getOverviewHockeyBundle(
  userId: number | null
): Promise<{
  calendarName: string;
  nextGame: HockeyGameCard | null;
  upcoming: HockeyGameCard[];
}> {
  const enabled = getEnabledIcsCalendars(userId).filter(
    (c) => c.type === "hockey"
  );
  const games = await loadHockeyGames(enabled);

  if (
    userId != null &&
    isGoogleMailConnected(userId) &&
    hasGoogleCalendarScope(userId)
  ) {
    try {
      const today = zurichIsoDate();
      const end = addDaysIso(today, 60);
      const gHockey = await listGoogleHockeyGamesInRange(userId, today, end);
      for (const bundle of gHockey) {
        for (const game of bundle.games) {
          games.push({
            ...game,
            calendarId: googleCalendarSourceId(bundle.calendarId),
            calendarName: bundle.calendarName,
            color: bundle.color,
            planningRelevant: bundle.planningRelevant !== false,
          });
        }
      }
      games.sort((a, b) => a.startAt.localeCompare(b.startAt));
    } catch {
      /* skip */
    }
  }

  const hasAny =
    enabled.length > 0 ||
    (userId != null &&
      getEnabledGoogleCalendarSelections(userId).some(
        (s) => (s.type || "other") === "hockey"
      ));
  const next = hasAny ? getNextHockeyGame(games) : null;
  const upcoming = hasAny
    ? getUpcomingHockeyGames(games, new Date(), 5)
    : [];

  return {
    calendarName:
      (next
        ? games.find((g) => g.uid === next.uid)?.calendarName
        : null) ||
      enabled[0]?.name ||
      "Hockey",
    nextGame: next ? toHockeyCard(next) : null,
    upcoming: upcoming.map(toHockeyCard),
  };
}
