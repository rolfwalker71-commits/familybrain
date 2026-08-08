import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  configureO365PdfBackfill,
  getO365PdfBackfillStatus,
} from "@/lib/microsoft/mail-paperless-backfill";
import { countDocumentsFromMicrosoftMail } from "@/lib/buddy/source-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  enabled: z.boolean().optional(),
  sinceYmd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  resetStats: z.boolean().optional(),
});

export async function GET() {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  return NextResponse.json({
    ...getO365PdfBackfillStatus(),
    documentsFromO365: countDocumentsFromMicrosoftMail(),
  });
}

export async function PATCH(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const parsed = PatchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }
  const status = configureO365PdfBackfill(parsed.data);
  return NextResponse.json({
    ...status,
    documentsFromO365: countDocumentsFromMicrosoftMail(),
  });
}
