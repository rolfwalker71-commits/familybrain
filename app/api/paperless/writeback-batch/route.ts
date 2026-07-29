import { listCompletedAnalysisDocumentIds } from "@/lib/db/queries";
import { getActiveJobRun } from "@/lib/jobs/queries";
import { writebackAnalysisToPaperless } from "@/lib/paperless/writeback";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Re-push existing completed analyses to Paperless (no OpenAI).
 * Body: { limit?: number, afterId?: number }
 * Streams NDJSON progress; client can loop with nextAfterId until done.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  if (getActiveJobRun()) {
    return Response.json(
      { error: "Ein automatischer Sync-/Analyse-Lauf ist bereits aktiv." },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 50);
  const afterId = Math.max(Number(body.afterId) || 0, 0);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      try {
        const ids = listCompletedAnalysisDocumentIds(limit, afterId);
        const failed: { documentId: number; error: string }[] = [];
        let succeeded = 0;

        send({
          type: "progress",
          phase: "starting",
          total: ids.length,
          processed: 0,
          succeeded: 0,
          failed: 0,
          percent: 0,
          afterId,
        });

        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          try {
            const result = await writebackAnalysisToPaperless(id);
            if (!result.ok) {
              failed.push({
                documentId: id,
                error: result.error || "Writeback fehlgeschlagen",
              });
            } else {
              succeeded += 1;
            }
          } catch (error) {
            failed.push({
              documentId: id,
              error: error instanceof Error ? error.message : String(error),
            });
          }

          send({
            type: "progress",
            phase: "writeback",
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
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        send({ type: "error", error: message });
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
