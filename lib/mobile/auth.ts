import { NextResponse } from "next/server";
import type { AuthContext } from "@/lib/auth/current-user";
import {
  getAuthContext,
  isAuthError,
  requireAuth,
} from "@/lib/auth/current-user";
import { resolveDeviceTokenAuth } from "@/lib/mobile/device-tokens";

/**
 * Cookie session or `Authorization: Bearer buddy_…` device token.
 */
export async function requireAuthOrDeviceToken(
  request: Request
): Promise<AuthContext | NextResponse> {
  const header = request.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (m) {
    const ctx = resolveDeviceTokenAuth(m[1]);
    if (!ctx) {
      return NextResponse.json(
        { error: "Ungültiges Geräte-Token." },
        { status: 401 }
      );
    }
    return ctx;
  }
  return requireAuth();
}

export async function optionalSessionAuth(): Promise<AuthContext | null> {
  return getAuthContext();
}

export { isAuthError };
