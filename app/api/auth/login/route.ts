import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthConfiguration } from "@/lib/auth/config";
import {
  verifyConfiguredPassword,
  verifyPasswordHash,
} from "@/lib/auth/password";
import {
  clearLoginFailures,
  loginRateLimitStatus,
  recordLoginFailure,
} from "@/lib/auth/rate-limit";
import {
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { homePathForModules } from "@/lib/users/modules";
import {
  effectiveUserModules,
  getAppUserByUsername,
} from "@/lib/users/queries";

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

  const adminValid = await verifyConfiguredPassword(
    parsed.data.username,
    parsed.data.password,
    config
  );

  let token: string | null = null;
  let home = "/dashboard";

  if (adminValid) {
    token = await createSessionToken(
      { kind: "admin", username: config.username },
      config.sessionSecret
    );
    home = "/dashboard";
  } else {
    const user = getAppUserByUsername(parsed.data.username);
    if (
      user &&
      user.active &&
      (await verifyPasswordHash(parsed.data.password, user.password_hash))
    ) {
      token = await createSessionToken(
        {
          kind: "user",
          username: user.username,
          userId: user.id,
        },
        config.sessionSecret
      );
      home = user.is_admin
        ? "/dashboard"
        : homePathForModules(effectiveUserModules(user.id, false));
    }
  }

  if (!token) {
    recordLoginFailure(address);
    return NextResponse.json(
      { error: "Benutzername oder Passwort ist falsch." },
      { status: 401 }
    );
  }

  clearLoginFailures(address);
  const { name, ...options } = sessionCookieOptions();
  const cookieStore = await cookies();
  cookieStore.set(name, token, options);
  return NextResponse.json({ ok: true, home });
}
