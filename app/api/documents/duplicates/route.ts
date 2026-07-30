import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { findDuplicateClustersByDescription } from "@/lib/documents/duplicates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const url = new URL(request.url);
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") || 80), 1),
    200
  );
  const clusters = findDuplicateClustersByDescription(limit);
  return NextResponse.json({
    ok: true,
    clusterCount: clusters.length,
    documentCount: clusters.reduce((n, c) => n + c.count, 0),
    clusters,
  });
}
