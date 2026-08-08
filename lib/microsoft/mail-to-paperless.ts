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
import { markDocumentAsBusiness } from "@/lib/documents/business";

/** Default Paperless tags for O365 business PDFs — always business. */
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

/** Resolve O365/ANG/geschäftlich tag PKs (create if missing). */
async function resolveO365TagIds(): Promise<number[]> {
  const client = createPaperlessClient();
  const tagCache = new Map<string, number>();
  const ids: number[] = [];
  for (const name of O365_PAPERLESS_TAGS) {
    ids.push(await client.ensureTag(name, tagCache));
  }
  return ids;
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

/** Every O365→Paperless doc is business: category + triage skip + mail link. */
function sealAsO365Business(input: {
  localId: number;
  messageId: string;
  attachmentId: string;
  filename: string;
  subject?: string | null;
}): void {
  markDocumentAsBusiness(input.localId);
  linkDocumentToMessage(input);
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
    if (Number.isFinite(localId) && localId > 0) {
      // Heal older imports that might still be pending in household triage
      sealAsO365Business({
        localId,
        messageId,
        attachmentId: attachment.id,
        filename: attachment.name,
        subject: input.title,
      });
    }
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

    // Tags at consume time → already business in Paperless before Buddy analysis
    const tagIds = await resolveO365TagIds();
    const ingested = await uploadAndIngestPaperlessDocument({
      buffer,
      filename,
      title,
      tagIds,
      markAsBusiness: true,
    });

    sealAsO365Business({
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
