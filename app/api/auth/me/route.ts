import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/current-user";
import { userAvatarPublicUrl } from "@/lib/users/avatar";
import {
  getAppUserById,
  getAppUserByUsername,
  listUserLedgerIds,
  listUserTripIds,
} from "@/lib/users/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json(
      { error: "Anmeldung erforderlich." },
      { status: 401 }
    );
  }
  // Env-Admin (Session ohne userId) — Avatar vom gleichnamigen App-User, falls vorhanden.
  if (ctx.kind === "admin") {
    const linked = getAppUserByUsername(ctx.username);
    return NextResponse.json({
      kind: "admin",
      username: ctx.username,
      displayName: linked?.display_name || ctx.username,
      isAdmin: true,
      showTodayHub: true,
      avatarUrl: linked ? userAvatarPublicUrl(linked.avatar_path) : null,
      userId: linked?.id ?? null,
    });
  }
  const user = ctx.userId ? getAppUserById(ctx.userId) : null;
  if (!user) {
    return NextResponse.json(
      { error: "Anmeldung erforderlich." },
      { status: 401 }
    );
  }
  return NextResponse.json({
    kind: "user",
    username: user.username,
    displayName: user.display_name,
    email: user.email,
    userId: user.id,
    gender: user.gender,
    avatarUrl: userAvatarPublicUrl(user.avatar_path),
    isAdmin: Boolean(user.is_admin),
    showTodayHub: user.is_admin ? true : Boolean(user.show_today_hub),
    tripIds: listUserTripIds(user.id),
    ledgerIds: listUserLedgerIds(user.id),
  });
}
