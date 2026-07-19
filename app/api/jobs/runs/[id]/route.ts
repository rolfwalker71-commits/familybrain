import { NextResponse } from "next/server";
import { getJobRunById, listJobRunItems } from "@/lib/jobs/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Ungültige Lauf-ID" }, { status: 400 });
  }

  const run = getJobRunById(id);
  if (!run) {
    return NextResponse.json({ error: "Lauf nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json({ run, items: listJobRunItems(id) });
}
