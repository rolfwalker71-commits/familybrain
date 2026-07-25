import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/current-user";
import {
  getAppUserById,
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
  if (ctx.isAdmin) {
    return NextResponse.json({
      kind: "admin",
      username: ctx.username,
      displayName: ctx.username,
      isAdmin: true,
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
    isAdmin: false,
    tripIds: listUserTripIds(user.id),
    ledgerIds: listUserLedgerIds(user.id),
  });
}
