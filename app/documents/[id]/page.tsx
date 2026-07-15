import { notFound } from "next/navigation";
import { DocumentDetailClient } from "@/components/documents/document-detail-client";
import { getDocumentById } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function DocumentDetailPage({ params }: Props) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) notFound();

  const detail = getDocumentById(numericId);
  if (!detail) notFound();

  return <DocumentDetailClient detail={detail} />;
}
