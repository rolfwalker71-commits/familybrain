import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureInitialized } from "@/lib/db/migrations";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { MariTicketAnalysisSchema } from "@/lib/mari/analyze-ticket";
import { postAnalysisAsInternalNote } from "@/lib/mari/internal-note";
import { getTicketDetail } from "@/lib/mari/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  analysis: MariTicketAnalysisSchema,
});

export async function POST(request: Request, context: Ctx) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  if (!hasMariConfig()) {
    return NextResponse.json(
      { error: "MARI nicht konfiguriert." },
      { status: 503 }
    );
  }

  const { id: raw } = await context.params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Ungültige Ticket-ID" }, { status: 400 });
  }

  const json = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ungültige Analyse-Daten", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    // Ticket muss existieren; verhindert Blind-Writes
    await getTicketDetail(id);
    const posted = await postAnalysisAsInternalNote(id, parsed.data.analysis);
    const ticket = await getTicketDetail(id);
    return NextResponse.json({
      ok: true,
      attachmentId: posted.attachmentId,
      internal: posted.internal,
      ticket,
    });
  } catch (err) {
    const message =
      err instanceof MariApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const status = err instanceof MariApiError ? err.status || 502 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
