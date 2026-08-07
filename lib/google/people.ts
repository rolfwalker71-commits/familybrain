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

/** Birthdays from Google Contacts (People API), mapped into a calendar year range. */
export async function listPeopleBirthdaysInRange(
  userId: number,
  startIso: string,
  endIso: string,
  request?: Request | null
): Promise<GoogleBirthdayEvent[]> {
  if (!hasGoogleContactsScope(userId)) return [];
  try {
    const auth = await getAuthedGoogleClient(userId, request);
    const people = google.people({ version: "v1", auth });
    const out: GoogleBirthdayEvent[] = [];
    let pageToken: string | undefined;
    const start = startIso.slice(0, 10);
    const end = endIso.slice(0, 10);
    const years = [
      ...new Set([Number(start.slice(0, 4)), Number(end.slice(0, 4))]),
    ].filter((y) => Number.isFinite(y));

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
          for (const year of years) {
            const iso = `${year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
            if (iso < start || iso > end) continue;
            out.push({
              id: `people-bday-${name}-${iso}`,
              date: iso,
              summary: `Geburtstag · ${name}`,
            });
          }
        }
      }
      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);

    return out.sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.warn(
      "[people] birthdays:",
      error instanceof Error ? error.message : error
    );
    return [];
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
