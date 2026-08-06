import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  getSofascoreApiKey,
  getSofascoreRemainingQuota,
  getSofascoreUsageThisMonth,
  SOFASCORE_AMBRI_TEAM_ID,
  SOFASCORE_MONTHLY_LIMIT,
  sofascoreGet,
  SofascoreQuotaError,
} from "@/lib/hockey/sofascore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Lightweight Sofascore connectivity check (1 monthly request):
 * Ambri team detail via RapidAPI.
 */
export async function POST() {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const apiKey = getSofascoreApiKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Kein Sofascore RapidAPI-Key hinterlegt. Bitte unter TravelBuddy speichern oder SOFASCORE_RAPIDAPI_KEY setzen.",
      },
      { status: 400 }
    );
  }

  const remainingBefore = getSofascoreRemainingQuota();
  if (remainingBefore <= 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `Monatskontingent erschöpft (${SOFASCORE_MONTHLY_LIMIT} Requests).`,
        usageThisMonth: getSofascoreUsageThisMonth(),
        monthlyLimit: SOFASCORE_MONTHLY_LIMIT,
      },
      { status: 429 }
    );
  }

  const started = Date.now();
  try {
    const data = await sofascoreGet<{
      team?: { id?: number; name?: string; nameCode?: string; slug?: string };
    }>("/teams/detail", { teamId: SOFASCORE_AMBRI_TEAM_ID });

    const team = data.team;
    const elapsedMs = Date.now() - started;
    const ok = Boolean(team?.id === SOFASCORE_AMBRI_TEAM_ID || team?.name);

    return NextResponse.json({
      ok,
      elapsedMs,
      request: {
        method: "GET",
        path: "/teams/detail",
        params: { teamId: SOFASCORE_AMBRI_TEAM_ID },
      },
      team: team
        ? {
            id: team.id,
            name: team.name,
            nameCode: team.nameCode,
            slug: team.slug,
          }
        : null,
      usageThisMonth: getSofascoreUsageThisMonth(),
      monthlyLimit: SOFASCORE_MONTHLY_LIMIT,
      remainingQuota: getSofascoreRemainingQuota(),
      hint: ok
        ? "Key funktioniert — Ambri-Team von Sofascore geladen."
        : "Antwort ohne erwartetes Team-Objekt.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof SofascoreQuotaError ? 429 : 502;
    return NextResponse.json(
      {
        ok: false,
        error: message,
        elapsedMs: Date.now() - started,
        usageThisMonth: getSofascoreUsageThisMonth(),
        monthlyLimit: SOFASCORE_MONTHLY_LIMIT,
        remainingQuota: getSofascoreRemainingQuota(),
      },
      { status }
    );
  }
}
