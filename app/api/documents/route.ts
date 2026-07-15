import { NextResponse } from "next/server";
import { getFilterOptions, listDocuments } from "@/lib/db/queries";

export const runtime = "nodejs";

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
  });

  return NextResponse.json({
    ...data,
    filters: getFilterOptions(),
  });
}
