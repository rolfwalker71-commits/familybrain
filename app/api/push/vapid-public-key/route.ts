import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { getVapidConfig, isWebPushConfigured } from "@/lib/push/vapid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const cfg = getVapidConfig();
  return NextResponse.json({
    configured: isWebPushConfigured(),
    publicKey: cfg?.publicKey ?? null,
  });
}
