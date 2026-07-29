/** Extract Paperless document id from typical webhook payloads. */
export function extractPaperlessWebhookDocumentId(body: unknown): number | null {
  if (body == null) return null;
  if (typeof body === "number" && Number.isFinite(body) && body > 0) {
    return Math.trunc(body);
  }
  if (typeof body === "string") {
    return idFromString(body);
  }
  if (typeof body !== "object") return null;

  const obj = body as Record<string, unknown>;
  const candidates = [
    obj.id,
    obj.document_id,
    obj.documentId,
    obj.DOCUMENT_ID,
    obj.related_document,
    obj.doc_url,
    obj.docUrl,
    obj.document_url,
    obj.url,
    (obj.document as Record<string, unknown> | undefined)?.id,
    (obj.document as Record<string, unknown> | undefined)?.url,
    (obj.data as Record<string, unknown> | undefined)?.id,
    (obj.data as Record<string, unknown> | undefined)?.doc_url,
  ];

  for (const c of candidates) {
    const n = coerceId(c);
    if (n != null) return n;
  }

  // Paperless custom webhook params: any string value that embeds /documents/123/
  for (const value of Object.values(obj)) {
    if (typeof value === "string") {
      const fromUrl = idFromDocumentUrl(value);
      if (fromUrl != null) return fromUrl;
    }
  }

  return null;
}

function coerceId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string") return idFromString(value);
  return null;
}

function idFromString(raw: string): number | null {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return idFromDocumentUrl(trimmed);
}

/** e.g. https://paperless.example/documents/1126/details */
function idFromDocumentUrl(raw: string): number | null {
  const match = raw.match(/\/documents\/(\d+)(?:\/|$|\?|#)/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}
