import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ownerKeyFromAuth } from "@/lib/auth/owner-key";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { draftMariExternalComment } from "@/lib/mari/external-comment-draft";
import { getMariTicketAnalysis } from "@/lib/mari/ticket-analysis-store";
import { getTicketDetail } from "@/lib/mari/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Ctx) {
  ensureInitialized();
  const auth = await requireModule("maringo");
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

  try {
    const ticket = await getTicketDetail(id);
    const stored = getMariTicketAnalysis(ownerKeyFromAuth(auth), id);
    const drafted = await draftMariExternalComment({
      ticket,
      analysis: stored?.analysis ?? null,
    });
    return NextResponse.json({
      ok: true,
      text: drafted.text,
      usage: drafted.usage,
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
