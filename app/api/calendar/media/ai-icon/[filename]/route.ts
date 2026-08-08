import fs from "fs";
import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { resolveAgendaAiIcon } from "@/lib/dashboard/agenda-ai-icon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ filename: string }> };

export async function GET(_request: Request, context: Ctx) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { filename } = await context.params;
  const key = filename.replace(/\.jpe?g$/i, "").toLowerCase();
  const file = resolveAgendaAiIcon(key);
  if (!file) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }
  const buf = fs.readFileSync(file);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
