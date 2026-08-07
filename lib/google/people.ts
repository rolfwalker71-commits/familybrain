/**
 * Google People / Contacts — Phase C foundation.
 * Scopes are requested with OAuth reconnect; birthdays/addresses land here next.
 */
import { google } from "googleapis";
import {
  getAuthedGoogleClient,
  hasGoogleContactsScope,
} from "@/lib/google/oauth";

export type PeopleBirthdayHint = {
  name: string;
  month: number;
  day: number;
  year?: number | null;
};

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
      personFields: "names,birthdays",
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
