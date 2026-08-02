import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ownerKeyFromAuth } from "@/lib/auth/owner-key";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  createDeviceToken,
  listDeviceTokens,
  revokeDeviceToken,
} from "@/lib/mobile/device-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  return NextResponse.json({
    tokens: listDeviceTokens(ownerKeyFromAuth(auth)),
  });
}

const CreateSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
});

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const json = await request.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const { row, token } = createDeviceToken(
    ownerKeyFromAuth(auth),
    parsed.data.label || "Android"
  );
  return NextResponse.json({
    ok: true,
    token,
    device: row,
    warning:
      "Token nur einmal sichtbar. In der Android-App unter Widget-Einstellungen speichern.",
  });
}

const RevokeSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export async function DELETE(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const url = new URL(request.url);
  const parsed = RevokeSchema.safeParse({
    id: url.searchParams.get("id"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "id fehlt." }, { status: 400 });
  }

  const ok = revokeDeviceToken(ownerKeyFromAuth(auth), parsed.data.id);
  return NextResponse.json({ ok });
}
