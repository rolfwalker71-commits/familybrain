import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureInitialized } from "@/lib/db/migrations";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { postPlainExternalNote } from "@/lib/mari/internal-note";
import { getTicketDetail } from "@/lib/mari/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  text: z.string().trim().min(1).max(20_000),
});

export async function POST(request: Request, context: Ctx) {
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

  const json = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Text fehlt oder ist ungültig." },
      { status: 400 }
    );
  }

  try {
    await getTicketDetail(id);
    const posted = await postPlainExternalNote(id, parsed.data.text);
    const ticket = await getTicketDetail(id);
    return NextResponse.json({
      ok: true,
      attachmentId: posted.attachmentId,
      internal: false,
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
