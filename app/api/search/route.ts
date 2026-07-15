import { NextResponse } from "next/server";
import { searchDocuments } from "@/lib/db/queries";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  if (!q.trim()) {
    return NextResponse.json({ documents: [], total: 0 });
  }
  const result = searchDocuments(q.trim(), Number(searchParams.get("limit") || 50));
  return NextResponse.json(result);
}
