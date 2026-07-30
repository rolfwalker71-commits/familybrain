import { notFound } from "next/navigation";
import { DocumentDetailClient } from "@/components/documents/document-detail-client";
import { getDocumentById } from "@/lib/db/queries";
import { documentAiIconPublicUrl } from "@/lib/paperless/document-icon";
import {
  refreshDocumentRecipients,
  resolveDocumentRecipients,
} from "@/lib/family/recipients";
import { ensureInitialized } from "@/lib/db/migrations";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function DocumentDetailPage({ params }: Props) {
  ensureInitialized();
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) notFound();

  let detail = getDocumentById(numericId);
  if (!detail) notFound();

  if (detail.document.recipient_status == null) {
    try {
      refreshDocumentRecipients(numericId);
      detail = getDocumentById(numericId) || detail;
    } catch {
      /* ignore */
    }
  }

  const recipients = resolveDocumentRecipients({
    recipient_status: detail.document.recipient_status,
    recipient_member_ids: detail.document.recipient_member_ids,
  });

  return (
    <DocumentDetailClient
      detail={{
        ...detail,
        document: {
          ...detail.document,
          ai_icon_url: documentAiIconPublicUrl(detail.document.ai_icon_path),
        },
        recipients,
      }}
    />
  );
}
