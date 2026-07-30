import { NextResponse } from "next/server";
import { getFilterOptions, listDocuments } from "@/lib/db/queries";
import {
  countDocumentsMissingAiIcon,
  documentAiIconPublicUrl,
} from "@/lib/paperless/document-icon";
import { parseSortDir } from "@/lib/utils/list-sort";
import {
  backfillDocumentRecipients,
  resolveDocumentRecipients,
} from "@/lib/family/recipients";
import { listFamilyMembers } from "@/lib/family/queries";
import { ensureInitialized } from "@/lib/db/migrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  ensureInitialized();
  try {
    backfillDocumentRecipients(60);
  } catch {
    /* non-fatal */
  }

  const { searchParams } = new URL(request.url);
  const data = listDocuments({
    search: searchParams.get("search") || undefined,
    category: searchParams.get("category") || undefined,
    correspondent: searchParams.get("correspondent") || undefined,
    documentType: searchParams.get("documentType") || undefined,
    analysisStatus: searchParams.get("analysisStatus") || undefined,
    recipient: searchParams.get("recipient") || undefined,
    limit: Number(searchParams.get("limit") || 100),
    offset: Number(searchParams.get("offset") || 0),
    sortDir: parseSortDir(searchParams.get("sortDir"), "desc"),
  });

  const membersById = new Map(
    listFamilyMembers().map((m) => [m.id, m] as const)
  );

  return NextResponse.json({
    ...data,
    documents: data.documents.map((doc) => {
      const recipients = resolveDocumentRecipients({
        recipient_status: doc.recipient_status,
        recipient_member_ids: doc.recipient_member_ids,
        membersById,
      });
      return {
        ...doc,
        ai_icon_url: documentAiIconPublicUrl(doc.ai_icon_path),
        recipients,
      };
    }),
    missingAiIcons: countDocumentsMissingAiIcon(),
    filters: getFilterOptions(),
  });
}
