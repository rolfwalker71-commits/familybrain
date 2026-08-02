import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ownerKeyFromAuth } from "@/lib/auth/owner-key";
import { ensureInitialized } from "@/lib/db/migrations";
import { deletePushSubscription } from "@/lib/push/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  endpoint: z.string().url().max(2048),
});

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const json = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const ok = deletePushSubscription(
    ownerKeyFromAuth(auth),
    parsed.data.endpoint
  );
  return NextResponse.json({ ok });
}
