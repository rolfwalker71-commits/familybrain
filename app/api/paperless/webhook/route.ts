import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import { ingestPaperlessDocumentById } from "@/lib/paperless/sync";
import { extractPaperlessWebhookDocumentId } from "@/lib/paperless/webhook-parse";
import { getPaperlessWebhookSecret } from "@/lib/paperless/writeback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  ensureInitialized();
  const expected = getPaperlessWebhookSecret();
  if (!expected) {
    return NextResponse.json(
      { error: "Webhook-Secret nicht konfiguriert." },
      { status: 503 }
    );
  }
  const provided =
    request.headers.get("x-buddy-webhook-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown = null;
  const ct = request.headers.get("content-type") || "";
  try {
    if (ct.includes("application/json")) {
      body = await request.json();
    } else {
      const text = await request.text();
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
  } catch {
    body = null;
  }

  const paperlessId = extractPaperlessWebhookDocumentId(body);
  if (!paperlessId) {
    return NextResponse.json(
      { error: "Keine Document-ID im Payload." },
      { status: 400 }
    );
  }

  try {
    const ingested = await ingestPaperlessDocumentById(paperlessId);
    // Best-effort analyze if pending
    try {
      const { listPendingDocumentIds } = await import("@/lib/db/queries");
      const pending = listPendingDocumentIds(50);
      if (pending.includes(ingested.localId)) {
        const { analyzeDocument } = await import("@/lib/ai/analyze-document");
        await analyzeDocument(ingested.localId, {
          manageErrorStatus: true,
        });
      }
    } catch (analyzeErr) {
      console.error(
        "[paperless webhook] analyze",
        analyzeErr instanceof Error ? analyzeErr.message : analyzeErr
      );
    }
    return NextResponse.json({
      ok: true,
      localId: ingested.localId,
      paperlessId: ingested.paperlessId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[paperless webhook]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
