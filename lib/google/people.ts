/**
 * Google People / Contacts — birthdays, addresses, family match helpers.
 */
import { google } from "googleapis";
import {
  getAuthedGoogleClient,
  hasGoogleContactsScope,
} from "@/lib/google/oauth";
import {
  familyMemberMatchNames,
  listFamilyMembers,
  type FamilyMemberPublic,
} from "@/lib/family/queries";
import { textMentionsName } from "@/lib/family/recipients";
import type { GoogleBirthdayEvent } from "@/lib/google/birthdays";
import { getSetting, setSetting } from "@/lib/db/migrations";

export type PeopleBirthdayHint = {
  name: string;
  month: number;
  day: number;
  year?: number | null;
};

export type PeopleAddressHint = {
  name: string;
  formatted: string;
  type: string | null;
  lat?: number | null;
  lon?: number | null;
};

const HOME_ADDRESS_CACHE_KEY = "buddy_people_home_address_json";
const PEOPLE_BDAY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function peopleBirthdayCacheKey(userId: number): string {
  return `people_birthdays_cache_u${userId}`;
}

type PeopleBirthdayCache = {
  fetchedAt: string;
  people: PeopleBirthdayHint[];
};

function readPeopleBirthdayCache(userId: number): PeopleBirthdayCache | null {
  const raw = getSetting(peopleBirthdayCacheKey(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PeopleBirthdayCache;
    if (!parsed?.fetchedAt || !Array.isArray(parsed.people)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePeopleBirthdayCache(
  userId: number,
  people: PeopleBirthdayHint[]
): void {
  setSetting(
    peopleBirthdayCacheKey(userId),
    JSON.stringify({
      fetchedAt: new Date().toISOString(),
      people,
    } satisfies PeopleBirthdayCache)
  );
}

/** Lightweight probe that contacts scope works (empty list is ok). */
export async function probeGoogleContacts(
  userId: number,
  request?: Request | null
): Promise<{ ok: boolean; error?: string }> {
  if (!hasGoogleContactsScope(userId)) {
    return { ok: false, error: "contacts.readonly fehlt" };
  }
  try {
    const auth = await getAuthedGoogleClient(userId, request);
    const people = google.people({ version: "v1", auth });
    await people.people.connections.list({
      resourceName: "people/me",
      personFields: "names,birthdays,addresses",
      pageSize: 1,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function displayName(
  names:
    | Array<{
        displayName?: string | null;
        givenName?: string | null;
        familyName?: string | null;
      }>
    | undefined
): string {
  const n = names?.[0];
  if (!n) return "Kontakt";
  return (
    n.displayName?.trim() ||
    [n.givenName, n.familyName].filter(Boolean).join(" ").trim() ||
    "Kontakt"
  );
}

function ageOnOccurrence(
  birthYear: number | null | undefined,
  occurrenceIso: string
): number | null {
  if (birthYear == null || !Number.isFinite(birthYear)) return null;
  const y = Number(occurrenceIso.slice(0, 4));
  if (!Number.isFinite(y) || birthYear < 1900 || birthYear > y) return null;
  const age = y - birthYear;
  if (age < 0 || age > 130) return null;
  return age;
}

function formatPeopleBirthdayTitle(
  name: string,
  occurrenceIso: string,
  birthYear?: number | null
): string {
  const age = ageOnOccurrence(birthYear, occurrenceIso);
  const base = `Geburtstag ${name}`.trim();
  return age != null ? `${base} (${age})` : base;
}

function expandPeopleBirthdays(
  hints: PeopleBirthdayHint[],
  startIso: string,
  endIso: string
): GoogleBirthdayEvent[] {
  const start = startIso.slice(0, 10);
  const end = endIso.slice(0, 10);
  const years = [
    ...new Set([Number(start.slice(0, 4)), Number(end.slice(0, 4))]),
  ].filter((y) => Number.isFinite(y));
  const out: GoogleBirthdayEvent[] = [];
  for (const hint of hints) {
    if (!hint.month || !hint.day) continue;
    const birthYear =
      typeof hint.year === "number" && hint.year > 0 ? hint.year : null;
    for (const year of years) {
      const iso = `${year}-${String(hint.month).padStart(2, "0")}-${String(hint.day).padStart(2, "0")}`;
      if (iso < start || iso > end) continue;
      out.push({
        id: `people-bday-${hint.name}-${iso}`,
        date: iso,
        summary: formatPeopleBirthdayTitle(hint.name, iso, birthYear),
        birthYear,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchPeopleBirthdayHints(
  userId: number,
  request?: Request | null
): Promise<PeopleBirthdayHint[]> {
  const auth = await getAuthedGoogleClient(userId, request);
  const people = google.people({ version: "v1", auth });
  const hints: PeopleBirthdayHint[] = [];
  let pageToken: string | undefined;
  do {
    const res = await people.people.connections.list({
      resourceName: "people/me",
      personFields: "names,birthdays",
      pageSize: 100,
      pageToken,
    });
    for (const person of res.data.connections || []) {
      const name = displayName(person.names);
      for (const b of person.birthdays || []) {
        const d = b.date;
        if (!d?.month || !d?.day) continue;
        hints.push({
          name,
          month: d.month,
          day: d.day,
          year: typeof d.year === "number" && d.year > 0 ? d.year : null,
        });
      }
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);
  return hints;
}

/** Birthdays from Google Contacts (People API), mapped into a calendar year range. */
export async function listPeopleBirthdaysInRange(
  userId: number,
  startIso: string,
  endIso: string,
  request?: Request | null,
  options?: { allowStale?: boolean; forceRefresh?: boolean }
): Promise<GoogleBirthdayEvent[] | null> {
  if (!hasGoogleContactsScope(userId)) return [];
  const cached = readPeopleBirthdayCache(userId);
  const age = cached
    ? Date.now() - new Date(cached.fetchedAt).getTime()
    : Number.POSITIVE_INFINITY;

  if (options?.allowStale) {
    return cached
      ? expandPeopleBirthdays(cached.people, startIso, endIso)
      : null;
  }
  if (cached && !options?.forceRefresh && age <= PEOPLE_BDAY_CACHE_TTL_MS) {
    return expandPeopleBirthdays(cached.people, startIso, endIso);
  }

  try {
    const hints = await fetchPeopleBirthdayHints(userId, request);
    writePeopleBirthdayCache(userId, hints);
    return expandPeopleBirthdays(hints, startIso, endIso);
  } catch (error) {
    console.warn(
      "[people] birthdays:",
      error instanceof Error ? error.message : error
    );
    if (cached) return expandPeopleBirthdays(cached.people, startIso, endIso);
    throw error;
  }
}

/** Prefer home / «Zuhause» / primary addresses from contacts. */
export async function listPeopleHomeAddresses(
  userId: number,
  request?: Request | null
): Promise<PeopleAddressHint[]> {
  if (!hasGoogleContactsScope(userId)) return [];
  try {
    const auth = await getAuthedGoogleClient(userId, request);
    const people = google.people({ version: "v1", auth });
    const out: PeopleAddressHint[] = [];
    let pageToken: string | undefined;
    do {
      const res = await people.people.connections.list({
        resourceName: "people/me",
        personFields: "names,addresses",
        pageSize: 100,
        pageToken,
      });
      for (const person of res.data.connections || []) {
        const name = displayName(person.names);
        for (const a of person.addresses || []) {
          const type = (a.type || a.formattedType || "").toLowerCase();
          const formatted = (a.formattedValue || "").trim();
          if (!formatted) continue;
          const isHome =
            /home|zuhause|wohn|private|primary/.test(type) ||
            a.metadata?.primary === true;
          if (!isHome) continue;
          out.push({
            name,
            formatted,
            type: a.type || a.formattedType || null,
          });
        }
      }
      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);
    if (out[0]) {
      setSetting(
        HOME_ADDRESS_CACHE_KEY,
        JSON.stringify({ at: new Date().toISOString(), address: out[0] })
      );
    }
    return out;
  } catch (error) {
    console.warn(
      "[people] addresses:",
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

export function getCachedPeopleHomeAddress(): PeopleAddressHint | null {
  const raw = getSetting(HOME_ADDRESS_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { address?: PeopleAddressHint };
    return parsed.address || null;
  } catch {
    return null;
  }
}

/**
 * Match mail from-name / body hints to a family member (soft suggestion).
 */
export function matchFamilyMemberFromMail(input: {
  fromName?: string | null;
  fromEmail?: string | null;
  subject?: string | null;
  snippet?: string | null;
  body?: string | null;
  members?: FamilyMemberPublic[];
}): { memberId: number; displayName: string; score: number } | null {
  const members = input.members ?? listFamilyMembers({ activeOnly: true });
  const hay = [
    input.fromName,
    input.fromEmail,
    input.subject,
    input.snippet,
    (input.body || "").slice(0, 4000),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

  let best: { memberId: number; displayName: string; score: number } | null =
    null;
  for (const member of members) {
    const names = familyMemberMatchNames(member);
    for (const name of names) {
      if (!textMentionsName(hay, name)) continue;
      const score = name.length + (input.fromName?.includes(name) ? 10 : 0);
      if (!best || score > best.score) {
        best = {
          memberId: member.id,
          displayName: member.display_name,
          score,
        };
      }
    }
  }
  return best;
}
