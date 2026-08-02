import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { getBackupStatus } from "@/lib/backup/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  return NextResponse.json(getBackupStatus());
}
