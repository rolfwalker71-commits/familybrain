import { getPaperlessSettings } from "@/lib/db/queries";
import {
  findDocumentForMicrosoftAttachment,
  microsoftAttachmentSourceId,
  upsertBuddySourceLink,
} from "@/lib/buddy/source-links";
import { PaperlessClient } from "@/lib/paperless/client";
import { uploadAndIngestPaperlessDocument } from "@/lib/paperless/sync";
import {
  downloadMicrosoftAttachment,
  listMicrosoftPdfAttachments,
  type MicrosoftMailAttachmentMeta,
} from "@/lib/microsoft/mail-attachments";
import { getMicrosoftMessage } from "@/lib/microsoft/mail-inbox";

/** Default Paperless tags for O365 business PDFs. */
export const O365_PAPERLESS_TAGS = ["O365", "ANG", "geschäftlich"] as const;

export type O365PdfIngestResult = {
  attachmentId: string;
  filename: string;
  ok: boolean;
  skipped?: string;
  localId?: number;
  paperlessId?: number;
  error?: string;
};

function createPaperlessClient(): PaperlessClient {
  const { baseUrl, apiToken } = getPaperlessSettings();
  if (!baseUrl || !apiToken) {
    throw new Error("Paperless ist nicht konfiguriert.");
  }
  return new PaperlessClient(baseUrl, apiToken);
}

async function applyO365Tags(paperlessId: number): Promise<void> {
  const client = createPaperlessClient();
  const tagCache = new Map<string, number>();
  const addTagIds: number[] = [];
  for (const name of O365_PAPERLESS_TAGS) {
    addTagIds.push(await client.ensureTag(name, tagCache));
  }
  await client.setDocumentMetadata(paperlessId, { addTagIds });
}

function linkDocumentToMessage(input: {
  localId: number;
  messageId: string;
  attachmentId: string;
  filename: string;
  subject?: string | null;
}): void {
  const sourceId = microsoftAttachmentSourceId(
    input.messageId,
    input.attachmentId
  );
  upsertBuddySourceLink({
    entityType: "document",
    entityId: input.localId,
    sourceKind: "microsoft_message",
    sourceId,
    label: `O365 · ${input.filename}`,
    role: "related",
  });
  upsertBuddySourceLink({
    entityType: "mail_message",
    entityId: input.messageId,
    sourceKind: "url",
    sourceId: `document:${input.localId}`,
    url: `/documents/${input.localId}`,
    label: "Beleg",
    role: "related",
  });
  if (input.subject) {
    upsertBuddySourceLink({
      entityType: "mail_message",
      entityId: input.messageId,
      sourceKind: "microsoft_message",
      sourceId: input.messageId,
      label: "Outlook",
      role: "primary",
    });
  }
}

export async function ingestMicrosoftPdfAttachment(input: {
  userId: number;
  messageId: string;
  attachment: MicrosoftMailAttachmentMeta;
  title?: string | null;
  force?: boolean;
}): Promise<O365PdfIngestResult> {
  const { userId, messageId, attachment } = input;
  const existing = findDocumentForMicrosoftAttachment(
    messageId,
    attachment.id
  );
  if (existing && !input.force) {
    const localId = Number(existing.entityId);
    return {
      attachmentId: attachment.id,
      filename: attachment.name,
      ok: true,
      skipped: "already",
      localId: Number.isFinite(localId) ? localId : undefined,
    };
  }

  try {
    const buffer = await downloadMicrosoftAttachment(
      userId,
      messageId,
      attachment.id
    );
    const title =
      input.title?.trim() ||
      attachment.name.replace(/\.pdf$/i, "") ||
      "O365 Beleg";
    const filename = attachment.name.toLowerCase().endsWith(".pdf")
      ? attachment.name
      : `${attachment.name}.pdf`;

    const ingested = await uploadAndIngestPaperlessDocument({
      buffer,
      filename,
      title,
    });

    try {
      await applyO365Tags(ingested.paperlessId);
    } catch {
      /* tags best-effort; document is already in */
    }

    // Re-sync so Buddy picks up tags
    try {
      const { ingestPaperlessDocumentById } = await import(
        "@/lib/paperless/sync"
      );
      await ingestPaperlessDocumentById(ingested.paperlessId);
    } catch {
      /* ignore */
    }

    try {
      const { markDocumentAsBusiness } = await import(
        "@/lib/documents/business"
      );
      markDocumentAsBusiness(ingested.localId);
    } catch {
      /* category best-effort */
    }

    linkDocumentToMessage({
      localId: ingested.localId,
      messageId,
      attachmentId: attachment.id,
      filename,
      subject: title,
    });

    return {
      attachmentId: attachment.id,
      filename,
      ok: true,
      localId: ingested.localId,
      paperlessId: ingested.paperlessId,
    };
  } catch (err) {
    return {
      attachmentId: attachment.id,
      filename: attachment.name,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Send all PDF attachments of one Outlook message to Paperless. */
export async function ingestMicrosoftMessagePdfs(input: {
  userId: number;
  messageId: string;
  attachmentIds?: string[];
  force?: boolean;
}): Promise<{
  subject: string;
  results: O365PdfIngestResult[];
}> {
  const detail = await getMicrosoftMessage(input.userId, input.messageId);
  const subject = detail.subject || "(kein Betreff)";
  let pdfs = await listMicrosoftPdfAttachments(input.userId, input.messageId);
  if (input.attachmentIds?.length) {
    const want = new Set(input.attachmentIds);
    pdfs = pdfs.filter((p) => want.has(p.id));
  }
  if (pdfs.length === 0) {
    return { subject, results: [] };
  }

  const results: O365PdfIngestResult[] = [];
  for (const att of pdfs) {
    results.push(
      await ingestMicrosoftPdfAttachment({
        userId: input.userId,
        messageId: input.messageId,
        attachment: att,
        title: `${subject} · ${att.name.replace(/\.pdf$/i, "")}`,
        force: input.force,
      })
    );
  }
  return { subject, results };
}
