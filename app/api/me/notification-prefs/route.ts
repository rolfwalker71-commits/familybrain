import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAuthError,
  requireAuth,
} from "@/lib/auth/current-user";
import {
  ALL_NOTIFY_REASONS,
  NOTIFY_REASON_DOMAIN,
  NOTIFY_REASON_LABELS,
  getNotificationPrefsForAuth,
  mergeNotificationPrefs,
  saveNotificationPrefsForAuth,
  type UserNotificationPrefs,
} from "@/lib/realtime/prefs";
import { listUserLedgerIds, listUserTripIds } from "@/lib/users/queries";
import { getDb } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  enabled: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
  desktopEnabled: z.boolean().optional(),
  durationSec: z.number().int().min(3).max(60).optional(),
  events: z.record(z.string(), z.boolean()).optional(),
  tripIds: z.array(z.number().int().positive()).nullable().optional(),
  ledgerIds: z.array(z.number().int().positive()).nullable().optional(),
});

function catalog() {
  return ALL_NOTIFY_REASONS.map((reason) => ({
    reason,
    label: NOTIFY_REASON_LABELS[reason],
    domain: NOTIFY_REASON_DOMAIN[reason],
  }));
}

function scopeOptions(auth: { isAdmin: boolean; userId: number | null }) {
  const db = getDb();
  let trips: Array<{ id: number; title: string }>;
  let ledgers: Array<{ id: number; title: string }>;
  if (auth.isAdmin) {
    trips = db
      .prepare(
        `SELECT id, COALESCE(NULLIF(TRIM(title), ''), 'Reise #' || id) as title
         FROM trips ORDER BY id DESC LIMIT 200`
      )
      .all() as Array<{ id: number; title: string }>;
    ledgers = db
      .prepare(
        `SELECT id, COALESCE(NULLIF(TRIM(title), ''), 'Abrechnung #' || id) as title
         FROM finance_ledgers ORDER BY id DESC LIMIT 200`
      )
      .all() as Array<{ id: number; title: string }>;
  } else if (auth.userId) {
    const tripIds = listUserTripIds(auth.userId);
    const ledgerIds = listUserLedgerIds(auth.userId);
    trips =
      tripIds.length === 0
        ? []
        : (db
            .prepare(
              `SELECT id, COALESCE(NULLIF(TRIM(title), ''), 'Reise #' || id) as title
               FROM trips WHERE id IN (${tripIds.map(() => "?").join(",")})
               ORDER BY id DESC`
            )
            .all(...tripIds) as Array<{ id: number; title: string }>);
    ledgers =
      ledgerIds.length === 0
        ? []
        : (db
            .prepare(
              `SELECT id, COALESCE(NULLIF(TRIM(title), ''), 'Abrechnung #' || id) as title
               FROM finance_ledgers WHERE id IN (${ledgerIds.map(() => "?").join(",")})
               ORDER BY id DESC`
            )
            .all(...ledgerIds) as Array<{ id: number; title: string }>);
  } else {
    trips = [];
    ledgers = [];
  }
  return { trips, ledgers };
}

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const prefs = getNotificationPrefsForAuth(auth);
  return NextResponse.json({
    prefs,
    catalog: catalog(),
    ...scopeOptions(auth),
  });
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const body = await request.json().catch(() => null);
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  const current = getNotificationPrefsForAuth(auth);
  const events: UserNotificationPrefs["events"] = { ...current.events };
  if (parsed.data.events) {
    for (const reason of ALL_NOTIFY_REASONS) {
      if (typeof parsed.data.events[reason] === "boolean") {
        events[reason] = parsed.data.events[reason];
      }
    }
  }

  const next = mergeNotificationPrefs({
    enabled: parsed.data.enabled ?? current.enabled,
    soundEnabled: parsed.data.soundEnabled ?? current.soundEnabled,
    desktopEnabled: parsed.data.desktopEnabled ?? current.desktopEnabled,
    durationSec: parsed.data.durationSec ?? current.durationSec,
    events,
    tripIds:
      parsed.data.tripIds !== undefined
        ? parsed.data.tripIds
        : current.tripIds,
    ledgerIds:
      parsed.data.ledgerIds !== undefined
        ? parsed.data.ledgerIds
        : current.ledgerIds,
  });

  const saved = saveNotificationPrefsForAuth(auth, next);
  return NextResponse.json({
    ok: true,
    prefs: saved,
    catalog: catalog(),
    ...scopeOptions(auth),
  });
}
