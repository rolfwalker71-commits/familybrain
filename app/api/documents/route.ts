import { NextResponse } from "next/server";
import { getFilterOptions, listDocuments } from "@/lib/db/queries";
import {
  countDocumentsMissingAiIcon,
  documentAiIconPublicUrl,
} from "@/lib/paperless/document-icon";
import { parseSortDir } from "@/lib/utils/list-sort";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const data = listDocuments({
    search: searchParams.get("search") || undefined,
    category: searchParams.get("category") || undefined,
    correspondent: searchParams.get("correspondent") || undefined,
    documentType: searchParams.get("documentType") || undefined,
    analysisStatus: searchParams.get("analysisStatus") || undefined,
    limit: Number(searchParams.get("limit") || 100),
    offset: Number(searchParams.get("offset") || 0),
    sortDir: parseSortDir(searchParams.get("sortDir"), "desc"),
  });

  return NextResponse.json({
    ...data,
    documents: data.documents.map((doc) => ({
      ...doc,
      ai_icon_url: documentAiIconPublicUrl(doc.ai_icon_path),
    })),
    missingAiIcons: countDocumentsMissingAiIcon(),
    filters: getFilterOptions(),
  });
}
