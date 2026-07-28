import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { coverPublicUrl } from "@/lib/trips/cover";
import { getHomeAgenda } from "@/lib/trips/home-agenda";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const payload = getHomeAgenda({
      isAdmin: auth.isAdmin,
      userId: auth.userId,
      includeDueInvoices: auth.isAdmin,
    });

    return NextResponse.json({
      ...payload,
      activeTrip: payload.activeTrip
        ? {
            ...payload.activeTrip,
            cover_url: coverPublicUrl(payload.activeTrip.cover_path),
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[home/agenda GET]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
