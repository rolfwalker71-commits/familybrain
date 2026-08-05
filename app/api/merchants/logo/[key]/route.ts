import fs from "fs";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAuthError,
  requireAdmin,
  requireAuth,
} from "@/lib/auth/current-user";
import {
  generateMerchantAiLogo,
  resolveMerchantLogoFile,
} from "@/lib/finance/merchant-logo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string }> };

export async function GET(_request: Request, context: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const { key } = await context.params;
  const file = await resolveMerchantLogoFile(decodeURIComponent(key));
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

const GenerateSchema = z.object({
  label: z.string().min(1).max(100),
  force: z.boolean().optional(),
});

export async function POST(request: Request, context: Ctx) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const parsed = GenerateSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }
  const { key } = await context.params;
  try {
    await generateMerchantAiLogo({
      key: decodeURIComponent(key),
      label: parsed.data.label,
      force: parsed.data.force,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Logo konnte nicht erzeugt werden",
      },
      { status: 400 }
    );
  }
}
