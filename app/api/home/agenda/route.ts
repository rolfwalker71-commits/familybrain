import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { coverPublicUrl } from "@/lib/trips/cover";
import { getHomeAgenda } from "@/lib/trips/home-agenda";
import { getAppUserById } from "@/lib/users/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    if (!auth.isAdmin) {
      const user = auth.userId ? getAppUserById(auth.userId) : null;
      if (!user?.show_today_hub) {
        return NextResponse.json(
          {
            error:
              "Heute-Ansicht ist für diesen Benutzer nicht freigeschaltet.",
          },
          { status: 403 }
        );
      }
    }

    const payload = getHomeAgenda({
      isAdmin: auth.isAdmin,
      userId: auth.userId,
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
