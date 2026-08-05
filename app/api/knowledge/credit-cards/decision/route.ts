import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  getCreditCardOverview,
  setCreditCardStatDecision,
} from "@/lib/knowledge/credit-cards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  scope: z.enum(["merchant", "charge"]),
  key: z.string().min(1).max(200),
  excluded: z.boolean(),
});

export async function PATCH(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  setCreditCardStatDecision(parsed.data);
  return NextResponse.json({ ok: true, overview: getCreditCardOverview() });
}
