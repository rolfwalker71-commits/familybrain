import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  consumeOauthState,
  finishGoogleOauth,
  parseOauthState,
} from "@/lib/google/oauth";
import { invalidateMailListCache } from "@/lib/mail/gmail";
import { absoluteAppUrl } from "@/lib/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  ensureInitialized();
  const { searchParams } = new URL(request.url);
  const error = searchParams.get("error");
  const code = searchParams.get("code");
  const stateRaw = searchParams.get("state");

  const mailUrl = absoluteAppUrl("/mail", request);

  if (error) {
    return NextResponse.redirect(
      `${mailUrl}?google=error&reason=${encodeURIComponent(error)}`
    );
  }
  if (!code) {
    return NextResponse.redirect(
      `${mailUrl}?google=error&reason=${encodeURIComponent("code_missing")}`
    );
  }

  const state = parseOauthState(stateRaw);
  if (!state || !consumeOauthState(state.userId, state.nonce)) {
    return NextResponse.redirect(
      `${mailUrl}?google=error&reason=${encodeURIComponent("invalid_state")}`
    );
  }

  try {
    await finishGoogleOauth(state.userId, code, request);
    invalidateMailListCache(state.userId);
    return NextResponse.redirect(`${mailUrl}?google=connected`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(
      `${mailUrl}?google=error&reason=${encodeURIComponent(msg.slice(0, 200))}`
    );
  }
}
