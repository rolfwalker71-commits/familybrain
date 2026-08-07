import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  getMicrosoftMe,
  probeMicrosoftCalendarToday,
} from "@/lib/microsoft/graph";
import {
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Smoke test after connect: /me + today's calendar count. */
export async function GET() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  if (userId == null || !isMicrosoftConnected(userId)) {
    return NextResponse.json(
      { error: "Microsoft 365 nicht verbunden." },
      { status: 400 }
    );
  }
  try {
    const [me, calendar] = await Promise.all([
      getMicrosoftMe(userId),
      probeMicrosoftCalendarToday(userId),
    ]);
    return NextResponse.json({
      ok: true,
      me: {
        displayName: me.displayName,
        mail: me.mail || me.userPrincipalName,
      },
      calendar,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}
