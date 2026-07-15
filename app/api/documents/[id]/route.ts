import { NextResponse } from "next/server";
import { getDocumentById } from "@/lib/db/queries";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }

  const detail = getDocumentById(numericId);
  if (!detail) {
    return NextResponse.json({ error: "Dokument nicht gefunden" }, { status: 404 });
  }

  return NextResponse.json(detail);
}
