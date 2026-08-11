import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ownerKeyFromAuth } from "@/lib/auth/owner-key";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  getMariTicketFilterPrefs,
  saveMariTicketFilterPrefs,
} from "@/lib/mari/ticket-filter-prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  statuses: z.array(z.number().int().positive()).optional(),
  overdueOnly: z.boolean().optional(),
});

export async function GET() {
  ensureInitialized();
  const auth = await requireModule("maringo");
  if (isAuthError(auth)) return auth;
  const prefs = getMariTicketFilterPrefs(ownerKeyFromAuth(auth));
  return NextResponse.json(prefs);
}

export async function PUT(request: Request) {
  ensureInitialized();
  const auth = await requireModule("maringo");
  if (isAuthError(auth)) return auth;
  const parsed = PutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }
  const prefs = saveMariTicketFilterPrefs(ownerKeyFromAuth(auth), parsed.data);
  return NextResponse.json(prefs);
}
