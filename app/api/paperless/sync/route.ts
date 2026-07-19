import { syncPaperlessDocuments } from "@/lib/paperless/sync";
import { getActiveJobRun } from "@/lib/jobs/queries";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  if (getActiveJobRun()) {
    return Response.json(
      { error: "Ein automatischer Sync-/Analyse-Lauf ist bereits aktiv." },
      { status: 409 }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      try {
        const result = await syncPaperlessDocuments((progress) => {
          send({ type: "progress", ...progress });
        });
        send({ type: "done", result });
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
