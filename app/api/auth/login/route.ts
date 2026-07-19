import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthConfiguration } from "@/lib/auth/config";
import { verifyConfiguredPassword } from "@/lib/auth/password";
import {
  clearLoginFailures,
  loginRateLimitStatus,
  recordLoginFailure,
} from "@/lib/auth/rate-limit";
import {
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LoginSchema = z.object({
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(1000),
});

function clientAddress(headerStore: Headers): string {
  return (
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerStore.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export async function POST(request: Request) {
  const config = getAuthConfiguration();
  if (!config.configured) {
    return NextResponse.json(
      {
        error:
          "Die Anmeldung ist auf dem Server noch nicht vollständig konfiguriert.",
      },
      { status: 503 }
    );
  }

  const headerStore = await headers();
  const address = clientAddress(headerStore);
  const rateLimit = loginRateLimitStatus(address);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error:
          "Zu viele fehlgeschlagene Anmeldeversuche. Bitte später erneut versuchen.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      }
    );
  }

  const parsed = LoginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    recordLoginFailure(address);
    return NextResponse.json(
      { error: "Benutzername oder Passwort ist falsch." },
      { status: 401 }
    );
  }

  const valid = await verifyConfiguredPassword(
    parsed.data.username,
    parsed.data.password,
    config
  );
  if (!valid) {
    recordLoginFailure(address);
    return NextResponse.json(
      { error: "Benutzername oder Passwort ist falsch." },
      { status: 401 }
    );
  }

  clearLoginFailures(address);
  const token = await createSessionToken(config.username, config.sessionSecret);
  const { name, ...options } = sessionCookieOptions();
  const cookieStore = await cookies();
  cookieStore.set(name, token, options);
  return NextResponse.json({ ok: true });
}
