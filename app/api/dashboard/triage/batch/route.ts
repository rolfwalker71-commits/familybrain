import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { discardPendingTriageDocuments } from "@/lib/documents/triage";
import { buildInboxTaskBoard } from "@/lib/inbox/build-tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  mode: z.enum(["all", "selected"]),
  documentLocalIds: z.array(z.number().int().positive()).max(500).optional(),
});

/**
 * Bulk-discard pending triage (→ ignored). No tax/payment changes.
 * Returns updated inbox board + discarded count.
 */
export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  if (
    parsed.data.mode === "selected" &&
    (!parsed.data.documentLocalIds || parsed.data.documentLocalIds.length === 0)
  ) {
    return NextResponse.json(
      { error: "Keine Dokumente ausgewählt." },
      { status: 400 }
    );
  }

  const { discarded } = discardPendingTriageDocuments({
    mode: parsed.data.mode,
    documentLocalIds: parsed.data.documentLocalIds,
  });

  try {
    const { publishInboxRefresh } = await import("@/lib/realtime/hub");
    publishInboxRefresh();
  } catch {
    /* optional */
  }

  return NextResponse.json({
    ok: true,
    discarded,
    mode: parsed.data.mode,
    board: buildInboxTaskBoard({ each: 12 }),
  });
}
