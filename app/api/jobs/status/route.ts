import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getActiveJobRun,
  getInitialIngestionComplete,
  getInitialSyncComplete,
  getSchedulerSettings,
  saveSchedulerSettings,
} from "@/lib/jobs/queries";
import {
  getSchedulerRuntimeStatus,
  rescheduleFromNow,
} from "@/lib/jobs/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    scheduler: getSchedulerRuntimeStatus(),
    settings: getSchedulerSettings(),
    initialization: {
      syncComplete: getInitialSyncComplete(),
      complete: getInitialIngestionComplete(),
    },
    activeRun: getActiveJobRun(),
  });
}

const PutSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: z.number().int().min(5).max(1440),
});

export async function PUT(request: Request) {
  const parsed = PutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Ungültige Einstellung. Das Intervall muss zwischen 5 und 1440 Minuten liegen.",
      },
      { status: 400 }
    );
  }

  const settings = saveSchedulerSettings(parsed.data);
  rescheduleFromNow();
  return NextResponse.json({ ok: true, settings });
}
