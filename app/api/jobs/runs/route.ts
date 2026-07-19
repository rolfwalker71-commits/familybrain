import { NextResponse } from "next/server";
import { listJobRuns } from "@/lib/jobs/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit")) || 20)
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  return NextResponse.json(listJobRuns(limit, offset));
}
