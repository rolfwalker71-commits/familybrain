import {
  getMicrosoftAccessToken,
  isMicrosoftConnected,
} from "@/lib/microsoft/oauth";

export class MicrosoftGraphError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Microsoft Graph ${status}: ${body.slice(0, 240)}`);
    this.status = status;
    this.body = body;
  }
}

export async function graphFetch(
  userId: number,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const token = await getMicrosoftAccessToken(userId);
  const url = path.startsWith("http")
    ? path
    : `https://graph.microsoft.com/v1.0${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(url, { ...init, headers });
}

export async function graphJson<T>(
  userId: number,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await graphFetch(userId, path, init);
  const text = await res.text();
  if (!res.ok) {
    throw new MicrosoftGraphError(res.status, text);
  }
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export type MicrosoftMe = {
  id: string;
  displayName: string | null;
  mail: string | null;
  userPrincipalName: string | null;
};

export async function getMicrosoftMe(userId: number): Promise<MicrosoftMe> {
  const me = await graphJson<{
    id: string;
    displayName?: string | null;
    mail?: string | null;
    userPrincipalName?: string | null;
  }>(userId, "/me");
  return {
    id: me.id,
    displayName: me.displayName ?? null,
    mail: me.mail ?? null,
    userPrincipalName: me.userPrincipalName ?? null,
  };
}

export type MicrosoftCalendarProbe = {
  ok: boolean;
  todayEventCount: number;
  sampleTitles: string[];
  error?: string;
};

/** Smoke test: count today's calendar events (Europe/Zurich window). */
export async function probeMicrosoftCalendarToday(
  userId: number
): Promise<MicrosoftCalendarProbe> {
  if (!isMicrosoftConnected(userId)) {
    return { ok: false, todayEventCount: 0, sampleTitles: [], error: "not_connected" };
  }
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Zurich",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value || "01";
    const day = `${get("year")}-${get("month")}-${get("day")}`;
    const start = `${day}T00:00:00`;
    const end = `${day}T23:59:59`;
    const qs = new URLSearchParams({
      startDateTime: start,
      endDateTime: end,
      $select: "subject,start,end",
      $orderby: "start/dateTime",
      $top: "20",
    });
    // Prefer Zurich preference via Prefer header
    const data = await graphJson<{
      value?: Array<{ subject?: string | null }>;
    }>(userId, `/me/calendarView?${qs}`, {
      headers: {
        Prefer: 'outlook.timezone="Europe/Zurich"',
      },
    });
    const values = data.value || [];
    return {
      ok: true,
      todayEventCount: values.length,
      sampleTitles: values
        .map((e) => e.subject?.trim() || "(ohne Titel)")
        .slice(0, 5),
    };
  } catch (error) {
    return {
      ok: false,
      todayEventCount: 0,
      sampleTitles: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
