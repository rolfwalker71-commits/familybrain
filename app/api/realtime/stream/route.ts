import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { subscribeRealtime } from "@/lib/realtime/hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** SSE: `inbox` + `notify` (and legacy `document`) for live UI. */
export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          cleanup();
        }
      };

      send("ready", { ok: true, at: new Date().toISOString() });

      unsubscribe = subscribeRealtime((payload) => {
        send(payload.topic, payload);
      });

      heartbeat = setInterval(() => {
        send("ping", { at: new Date().toISOString() });
      }, 25000);
    },
    cancel() {
      cleanup();
    },
  });

  function cleanup() {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    unsubscribe?.();
    unsubscribe = null;
  }

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
