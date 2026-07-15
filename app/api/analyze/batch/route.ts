import { analyzeDocument } from "@/lib/ai/analyze-document";
import { listPendingDocumentIds } from "@/lib/db/queries";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 50);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      try {
        const ids = listPendingDocumentIds(limit);
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

        send({
          type: "done",
          processed: ids.length,
          succeeded,
          failed,
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
