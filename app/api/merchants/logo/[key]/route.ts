import fs from "fs";
import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { resolveMerchantLogoFile } from "@/lib/finance/merchant-logo";

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
