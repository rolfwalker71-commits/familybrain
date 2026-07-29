import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import {
  countDocumentsMissingAiIcon,
  generateDocumentAiIcon,
  listDocumentIdsMissingAiIcon,
} from "@/lib/paperless/document-icon";
import { hasOpenAIKey } from "@/lib/ai/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Batch-generate missing document AI icons.
 * Body: { limit?, afterId?, documentIds?: number[] }
 * Streams NDJSON; client loops with nextAfterId until done.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  if (!hasOpenAIKey()) {
    return Response.json({ error: "OpenAI API-Key fehlt." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 25);
  const afterId = Math.max(Number(body.afterId) || 0, 0);
  const onlyIds = Array.isArray(body.documentIds)
    ? body.documentIds
        .map((n: unknown) => Number(n))
        .filter((n: number) => Number.isInteger(n) && n > 0)
    : null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      try {
        const ids = listDocumentIdsMissingAiIcon(limit, afterId, onlyIds);
        const failed: { documentId: number; error: string }[] = [];
        let succeeded = 0;
        const missingTotal =
          onlyIds && onlyIds.length > 0
            ? ids.length
            : countDocumentsMissingAiIcon();

        send({
          type: "progress",
          phase: "starting",
          total: ids.length,
          missingTotal,
          processed: 0,
          succeeded: 0,
          failed: 0,
          percent: 0,
        });

        for (let i = 0; i < ids.length; i++) {
          const id = ids[i]!;
          try {
            await generateDocumentAiIcon(id, { force: false });
            succeeded += 1;
          } catch (error) {
            failed.push({
              documentId: id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
          send({
            type: "progress",
            phase: "icons",
            total: ids.length,
            processed: i + 1,
            succeeded,
            failed: failed.length,
            currentDocumentId: id,
            percent:
              ids.length === 0
                ? 100
                : Math.round(((i + 1) / ids.length) * 100),
          });
        }

        const nextAfterId = ids.length > 0 ? ids[ids.length - 1]! : afterId;
        send({
          type: "done",
          processed: ids.length,
          succeeded,
          failed,
          nextAfterId,
          done: ids.length < limit,
          missingRemaining: countDocumentsMissingAiIcon(),
        });
      } catch (error) {
        send({
          type: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  return Response.json({
    missing: countDocumentsMissingAiIcon(),
  });
}
