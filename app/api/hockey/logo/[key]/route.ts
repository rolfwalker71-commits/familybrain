import fs from "fs";
import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import {
  ensureHockeyLogo,
  resolveHockeyLogoFile,
} from "@/lib/hockey/logo";
import { HOCKEY_TEAMS } from "@/lib/hockey/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string }> };

export async function GET(_request: Request, context: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const { key: raw } = await context.params;
  const key = decodeURIComponent(raw);
  let file = resolveHockeyLogoFile(key);
  if (!file) {
    const team = HOCKEY_TEAMS.find((t) => t.key === key);
    file = await ensureHockeyLogo({
      key,
      label: team?.label,
    });
  }
  if (!file) {
    return NextResponse.json({ error: "Kein Logo" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(fs.readFileSync(file)), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=604800",
    },
  });
}
