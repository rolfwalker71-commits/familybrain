import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  cleanupOrphanDriveMirrors,
  getDriveMirrorStatus,
  setDriveMirrorEnabled,
} from "@/lib/buddy/drive-mirror";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PatchSchema = z.object({
  enabled: z.boolean().optional(),
  /** Trash Drive files for deleted Buddy docs + drop stale links */
  cleanupOrphans: z.boolean().optional(),
  cleanupLimit: z.number().int().min(1).max(200).optional(),
});

/** Drive mirror migration status — visible even when 100% complete. */
export async function GET() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  return NextResponse.json(getDriveMirrorStatus());
}

export async function PATCH(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const parsed = PatchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  if (typeof parsed.data.enabled === "boolean") {
    setDriveMirrorEnabled(parsed.data.enabled);
  }

  let cleanup: Awaited<ReturnType<typeof cleanupOrphanDriveMirrors>> | null =
    null;
  if (parsed.data.cleanupOrphans) {
    cleanup = await cleanupOrphanDriveMirrors({
      limit: parsed.data.cleanupLimit ?? 50,
    });
  }

  return NextResponse.json({
    ...getDriveMirrorStatus(),
    cleanup,
  });
}
