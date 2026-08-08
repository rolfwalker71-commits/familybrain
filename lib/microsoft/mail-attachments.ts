import { graphFetch, graphJson } from "@/lib/microsoft/graph";

export type MicrosoftMailAttachmentMeta = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
  odataType: string;
};

type GraphAttachment = {
  id?: string;
  name?: string | null;
  contentType?: string | null;
  size?: number;
  isInline?: boolean;
  "@odata.type"?: string;
};

const MAX_ATTACHMENT_BYTES = 40 * 1024 * 1024;

export function isPdfAttachment(meta: {
  name: string;
  contentType: string;
}): boolean {
  const name = meta.name.toLowerCase();
  const type = meta.contentType.toLowerCase();
  return name.endsWith(".pdf") || type === "application/pdf" || type.includes("pdf");
}

export async function listMicrosoftMessageAttachments(
  userId: number,
  messageId: string
): Promise<MicrosoftMailAttachmentMeta[]> {
  const qs = new URLSearchParams({
    $select: "id,name,contentType,size,isInline",
  });
  const data = await graphJson<{ value?: GraphAttachment[] }>(
    userId,
    `/me/messages/${encodeURIComponent(messageId)}/attachments?${qs}`
  );
  const out: MicrosoftMailAttachmentMeta[] = [];
  for (const a of data.value || []) {
    if (!a.id) continue;
    const odataType = a["@odata.type"] || "";
    if (odataType && !odataType.includes("fileAttachment")) continue;
    out.push({
      id: a.id,
      name: (a.name || "anhang").trim() || "anhang",
      contentType: (a.contentType || "application/octet-stream").trim(),
      size: Number(a.size) || 0,
      isInline: Boolean(a.isInline),
      odataType,
    });
  }
  return out;
}

export async function listMicrosoftPdfAttachments(
  userId: number,
  messageId: string
): Promise<MicrosoftMailAttachmentMeta[]> {
  const all = await listMicrosoftMessageAttachments(userId, messageId);
  return all.filter(
    (a) => !a.isInline && isPdfAttachment(a) && a.size <= MAX_ATTACHMENT_BYTES
  );
}

export async function downloadMicrosoftAttachment(
  userId: number,
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  const res = await graphFetch(
    userId,
    `/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/$value`
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Anhang laden fehlgeschlagen (${res.status}): ${text.slice(0, 200)}`
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error("PDF ist zu gross (max. 40 MB).");
  }
  return buf;
}

export { MAX_ATTACHMENT_BYTES };
