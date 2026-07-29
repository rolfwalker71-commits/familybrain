/** Extract Paperless document id from typical webhook payloads. */
export function extractPaperlessWebhookDocumentId(body: unknown): number | null {
  if (body == null) return null;
  if (typeof body === "number" && Number.isFinite(body) && body > 0) {
    return Math.trunc(body);
  }
  if (typeof body === "string" && /^\d+$/.test(body.trim())) {
    return Number(body.trim());
  }
  if (typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  const candidates = [
    obj.id,
    obj.document_id,
    obj.documentId,
    obj.related_document,
    (obj.document as Record<string, unknown> | undefined)?.id,
    (obj.data as Record<string, unknown> | undefined)?.id,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }
  return null;
}
