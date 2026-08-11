import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { listContractsForProject } from "@/lib/mari/timekeeping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectNumber: string }> };

export async function GET(request: Request, ctx: Ctx) {
  ensureInitialized();
  const auth = await requireModule("maringo");
  if (isAuthError(auth)) return auth;
  if (!hasMariConfig()) {
    return NextResponse.json(
      { error: "MARI nicht konfiguriert.", contracts: [] },
      { status: 503 }
    );
  }
  try {
    const { projectNumber } = await ctx.params;
    const activeOnly =
      new URL(request.url).searchParams.get("activeOnly") !== "0";
    const contracts = await listContractsForProject(
      decodeURIComponent(projectNumber),
      activeOnly
    );
    return NextResponse.json({ contracts });
  } catch (err) {
    const message =
      err instanceof MariApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const status = err instanceof MariApiError ? err.status || 502 : 502;
    return NextResponse.json({ error: message, contracts: [] }, { status });
  }
}
