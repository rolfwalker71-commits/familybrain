import { NextResponse } from "next/server";
import { buildTravelBrainBackup } from "@/lib/trips/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const backup = buildTravelBrainBackup();
    const stamp = backup.exported_at.slice(0, 10);
    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="travelbrain-backup-${stamp}.json"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
