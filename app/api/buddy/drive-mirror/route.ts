import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  getDriveMirrorStatus,
  setDriveMirrorEnabled,
} from "@/lib/buddy/drive-mirror";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Drive mirror migration status — visible even when 100% complete. */
export async function GET() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  return NextResponse.json(getDriveMirrorStatus());
}

export async function PATCH(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const body = (await request.json().catch(() => null)) as {
    enabled?: boolean;
  } | null;
  if (typeof body?.enabled === "boolean") {
    setDriveMirrorEnabled(body.enabled);
  }
  return NextResponse.json(getDriveMirrorStatus());
}
