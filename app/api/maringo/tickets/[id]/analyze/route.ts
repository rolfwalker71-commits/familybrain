import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { hasOpenAIKey } from "@/lib/ai/client";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { analyzeMariTicket } from "@/lib/mari/analyze-ticket";
import { getTicketDetail } from "@/lib/mari/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Ctx) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  if (!hasMariConfig()) {
    return NextResponse.json(
      { error: "MARI nicht konfiguriert." },
      { status: 503 }
    );
  }
  if (!hasOpenAIKey()) {
    return NextResponse.json(
      { error: "OpenAI API-Key fehlt (Einstellungen → OpenAI)." },
      { status: 400 }
    );
  }

  const { id: raw } = await context.params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Ungültige Ticket-ID" }, { status: 400 });
  }

  try {
    const ticket = await getTicketDetail(id);
    const analysis = await analyzeMariTicket(ticket);
    return NextResponse.json({ analysis, issueId: id });
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
