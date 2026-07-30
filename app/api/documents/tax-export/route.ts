import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { exportTaxDocumentsPdf } from "@/lib/documents/tax-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BodySchema = z.object({
  documentIds: z.array(z.number().int().positive()).min(1).max(80),
});

/** Merge selected Steuern PDFs into one downloadable file (UI export, not mail). */
export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "documentIds (1–80) erforderlich." },
      { status: 400 }
    );
  }

  try {
    const result = await exportTaxDocumentsPdf(parsed.data.documentIds);
    const headers = new Headers({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "X-Export-Count": String(result.exported),
      "X-Export-Skipped": String(result.skipped.length),
    });
    if (result.skipped.length > 0) {
      headers.set(
        "X-Export-Skipped-Detail",
        encodeURIComponent(
          JSON.stringify(
            result.skipped.map((s) => `${s.title}: ${s.reason}`)
          )
        )
      );
    }
    return new NextResponse(Buffer.from(result.bytes), {
      status: 200,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
