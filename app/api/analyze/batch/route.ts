import { analyzeDocument } from "@/lib/ai/analyze-document";
import { listPendingDocumentIds } from "@/lib/db/queries";
import { getActiveJobRun } from "@/lib/jobs/queries";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Batch-analyze documents.
 * Body: { limit?, afterId?, documentIds?: number[] }
 * With documentIds: force-reanalyze those IDs (NDJSON, client loops via afterId).
 * Without: drain pending IDs (existing behavior).
 */
export async function POST(request: Request) {
  if (getActiveJobRun()) {
    return Response.json(
      { error: "Ein automatischer Sync-/Analyse-Lauf ist bereits aktiv." },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 50);
  const afterId = Math.max(Number(body.afterId) || 0, 0);
  const onlyIds: number[] | null = Array.isArray(body.documentIds)
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
        let ids: number[];
        if (onlyIds && onlyIds.length > 0) {
          const sorted = [...new Set(onlyIds)].sort((a, b) => a - b);
          ids = sorted.filter((id) => id > afterId).slice(0, limit);
        } else {
          ids = listPendingDocumentIds(limit);
        }

        const failed: { documentId: number; error: string }[] = [];
        let succeeded = 0;
        const queueTotal =
          onlyIds && onlyIds.length > 0
            ? onlyIds.filter((id: number) => id > afterId).length
            : ids.length;

        send({
          type: "progress",
          phase: "starting",
          total: ids.length,
          queueTotal,
          processed: 0,
          succeeded: 0,
          failed: 0,
          percent: 0,
        });

        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          try {
            await analyzeDocument(id);
            succeeded += 1;
          } catch (error) {
            failed.push({
              documentId: id,
              error: error instanceof Error ? error.message : String(error),
            });
          }

          send({
            type: "progress",
            phase: "analyzing",
            total: ids.length,
            queueTotal,
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

        const lastId = ids.length > 0 ? ids[ids.length - 1]! : afterId;
        const remaining =
          onlyIds && onlyIds.length > 0
            ? onlyIds.filter((id: number) => id > lastId).length
            : 0;
        const done =
          onlyIds && onlyIds.length > 0
            ? remaining === 0 || ids.length === 0
            : true;

        send({
          type: "done",
          processed: ids.length,
          succeeded,
          failed,
          nextAfterId: lastId,
          done,
          queueRemaining: remaining,
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
