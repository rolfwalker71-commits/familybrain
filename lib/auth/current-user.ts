import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  getAuthConfiguration,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/config";
import {
  verifySessionToken,
  type SessionPayload,
} from "@/lib/auth/session";
import {
  getAppUserById,
  userHasLedgerAccess,
  userHasTripAccess,
} from "@/lib/users/queries";

export type AuthContext = {
  kind: "admin" | "user";
  username: string;
  userId: number | null;
  isAdmin: boolean;
};

export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  const auth = getAuthConfiguration();
  if (!auth.configured) return null;
  const cookieStore = await cookies();
  return verifySessionToken(
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
    auth.sessionSecret
  );
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await getSessionFromCookies();
  if (!session) return null;
  if (session.kind === "admin") {
    const auth = getAuthConfiguration();
    if (session.username !== auth.username) return null;
    return {
      kind: "admin",
      username: session.username,
      userId: null,
      isAdmin: true,
    };
  }
  if (!session.userId) return null;
  const user = getAppUserById(session.userId);
  if (!user || !user.active) return null;
  if (user.username.toLowerCase() !== session.username.toLowerCase()) {
    return null;
  }
  return {
    kind: "user",
    username: user.username,
    userId: user.id,
    isAdmin: false,
  };
}

export async function requireAuth(): Promise<AuthContext | NextResponse> {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json(
      { error: "Anmeldung erforderlich." },
      { status: 401 }
    );
  }
  return ctx;
}

export async function requireAdmin(): Promise<AuthContext | NextResponse> {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.isAdmin) {
    return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
  }
  return ctx;
}

export function isAuthError(
  value: AuthContext | NextResponse
): value is NextResponse {
  return value instanceof NextResponse;
}

export async function requireTripAccess(
  tripId: number
): Promise<AuthContext | NextResponse> {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;
  if (ctx.isAdmin) return ctx;
  if (!ctx.userId || !userHasTripAccess(ctx.userId, tripId)) {
    return NextResponse.json(
      { error: "Kein Zugriff auf diese Reise." },
      { status: 403 }
    );
  }
  return ctx;
}

export async function requireLedgerAccess(
  ledgerId: number
): Promise<AuthContext | NextResponse> {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;
  if (ctx.isAdmin) return ctx;
  if (!ctx.userId || !userHasLedgerAccess(ctx.userId, ledgerId)) {
    return NextResponse.json(
      { error: "Kein Zugriff auf diese Abrechnung." },
      { status: 403 }
    );
  }
  return ctx;
}
