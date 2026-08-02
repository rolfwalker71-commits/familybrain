import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ownerKeyFromAuth } from "@/lib/auth/owner-key";
import { ensureInitialized } from "@/lib/db/migrations";
import { upsertPushSubscription } from "@/lib/push/subscriptions";
import { isWebPushConfigured } from "@/lib/push/vapid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  // z.url() is picky; FCM/Mozilla endpoints are always https.
  endpoint: z
    .string()
    .min(12)
    .max(2048)
    .refine((v) => /^https:\/\//i.test(v), "endpoint must be https"),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  if (!isWebPushConfigured()) {
    return NextResponse.json(
      {
        error:
          "Web Push ist nicht konfiguriert (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).",
      },
      { status: 503 }
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Subscription." }, { status: 400 });
  }

  const row = upsertPushSubscription(
    ownerKeyFromAuth(auth),
    parsed.data,
    request.headers.get("user-agent")
  );
  return NextResponse.json({ ok: true, id: row.id });
}
