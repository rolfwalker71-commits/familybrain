import { after, NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import { ingestPaperlessDocumentById } from "@/lib/paperless/sync";
import { extractPaperlessWebhookDocumentId } from "@/lib/paperless/webhook-parse";
import { getPaperlessWebhookSecret } from "@/lib/paperless/writeback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Ingest + optional AI can take minutes; Paperless webhook clients time out earlier. */
export const maxDuration = 300;

async function parseWebhookBody(request: Request): Promise<unknown> {
  const ct = request.headers.get("content-type") || "";

  if (ct.includes("application/json")) {
    return await request.json();
  }

  // Paperless often posts form fields (and optionally a file as multipart).
  if (
    ct.includes("application/x-www-form-urlencoded") ||
    ct.includes("multipart/form-data")
  ) {
    const form = await request.formData();
    const obj: Record<string, string> = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") obj[key] = value;
    }
    return obj;
  }

  const text = await request.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function bodyDebug(body: unknown): Record<string, unknown> {
  if (body == null) return { bodyType: "null" };
  if (typeof body === "string") {
    return {
      bodyType: "string",
      preview: body.slice(0, 200),
    };
  }
  if (typeof body === "number") return { bodyType: "number", value: body };
  if (typeof body === "object" && !Array.isArray(body)) {
    const obj = body as Record<string, unknown>;
    const keys = Object.keys(obj);
    const sample: Record<string, string> = {};
    for (const key of keys.slice(0, 8)) {
      const v = obj[key];
      sample[key] =
        typeof v === "string" ? v.slice(0, 160) : typeof v;
    }
    return { bodyType: "object", keys, sample };
  }
  return { bodyType: Array.isArray(body) ? "array" : typeof body };
}

async function ingestAndMaybeAnalyze(paperlessId: number): Promise<void> {
  const ingested = await ingestPaperlessDocumentById(paperlessId);
  try {
    const { listPendingDocumentIds } = await import("@/lib/db/queries");
    const pending = listPendingDocumentIds(50);
    if (!pending.includes(ingested.localId)) return;
    const { analyzeDocument } = await import("@/lib/ai/analyze-document");
    await analyzeDocument(ingested.localId, {
      manageErrorStatus: true,
    });
  } catch (analyzeErr) {
    console.error(
      "[paperless webhook] analyze",
      paperlessId,
      analyzeErr instanceof Error ? analyzeErr.message : analyzeErr
    );
  }
}

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
  try {
    body = await parseWebhookBody(request);
  } catch (err) {
    console.error(
      "[paperless webhook] body parse",
      err instanceof Error ? err.message : err
    );
    body = null;
  }

  const paperlessId = extractPaperlessWebhookDocumentId(body);
  if (!paperlessId) {
    const debug = bodyDebug(body);
    console.error("[paperless webhook] no document id", debug);
    return NextResponse.json(
      {
        error:
          "Keine Document-ID im Payload. Parameter doc_url={{doc_url}} setzen (Trigger «hinzugefügt/aktualisiert»). PAPERLESS_URL in Paperless muss gesetzt sein. Dokument einbeziehen: aus.",
        debug,
      },
      { status: 400 }
    );
  }

  // Answer immediately — Paperless webhook timeout is short; analysis is slow.
  after(async () => {
    try {
      await ingestAndMaybeAnalyze(paperlessId);
      console.info("[paperless webhook] done", { paperlessId });
    } catch (err) {
      console.error(
        "[paperless webhook] background",
        paperlessId,
        err instanceof Error ? err.message : err
      );
    }
  });

  return NextResponse.json(
    { ok: true, accepted: true, paperlessId },
    { status: 202 }
  );
}
