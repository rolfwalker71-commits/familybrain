import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  consumeMicrosoftOauthState,
  finishMicrosoftOauth,
  parseMicrosoftOauthState,
} from "@/lib/microsoft/oauth";
import { absoluteAppUrl } from "@/lib/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  ensureInitialized();
  const { searchParams } = new URL(request.url);
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const code = searchParams.get("code");
  const stateRaw = searchParams.get("state");

  const accountUrl = absoluteAppUrl("/account", request);

  if (error) {
    const reason = errorDescription || error;
    return NextResponse.redirect(
      `${accountUrl}?microsoft=error&reason=${encodeURIComponent(reason.slice(0, 200))}`
    );
  }
  if (!code) {
    return NextResponse.redirect(
      `${accountUrl}?microsoft=error&reason=${encodeURIComponent("code_missing")}`
    );
  }

  const state = parseMicrosoftOauthState(stateRaw);
  if (!state || !consumeMicrosoftOauthState(state.userId, state.nonce)) {
    return NextResponse.redirect(
      `${accountUrl}?microsoft=error&reason=${encodeURIComponent("invalid_state")}`
    );
  }

  try {
    await finishMicrosoftOauth(state.userId, code, request);
    return NextResponse.redirect(`${accountUrl}?microsoft=connected`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(
      `${accountUrl}?microsoft=error&reason=${encodeURIComponent(msg.slice(0, 200))}`
    );
  }
}
