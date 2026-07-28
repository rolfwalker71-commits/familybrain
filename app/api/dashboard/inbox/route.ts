import { NextResponse } from "next/server";
import {
  isAuthError,
  requireAdmin,
} from "@/lib/auth/current-user";
import { getDashboardInbox } from "@/lib/db/queries";
import { ensureInitialized } from "@/lib/db/migrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  return NextResponse.json(getDashboardInbox());
}
