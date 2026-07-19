import { NextResponse } from "next/server";
import { getActiveJobRun } from "@/lib/jobs/queries";
import { runSyncAnalyzeJob } from "@/lib/jobs/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const active = getActiveJobRun();
  if (active) {
    return NextResponse.json(
      { error: "Ein Sync-/Analyse-Lauf ist bereits aktiv.", activeRun: active },
      { status: 409 }
    );
  }

  // The durable DB run/lease records make this safe to continue after the
  // request returns. Startup recovery resumes unfinished initialization.
  void runSyncAnalyzeJob("manual");
  return NextResponse.json({ ok: true, accepted: true }, { status: 202 });
}
