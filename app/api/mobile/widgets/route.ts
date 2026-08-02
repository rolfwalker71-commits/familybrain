import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  isAuthError,
  requireAuthOrDeviceToken,
} from "@/lib/mobile/auth";
import { getMobileWidgetSummaries } from "@/lib/mobile/widget-summaries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAuthOrDeviceToken(request);
  if (isAuthError(auth)) return auth;

  return NextResponse.json(getMobileWidgetSummaries(auth));
}
