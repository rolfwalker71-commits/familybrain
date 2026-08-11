import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { listContractPositionsForTimeKeeping } from "@/lib/mari/timekeeping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ contractId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  ensureInitialized();
  const auth = await requireModule("maringo");
  if (isAuthError(auth)) return auth;
  if (!hasMariConfig()) {
    return NextResponse.json(
      { error: "MARI nicht konfiguriert.", positions: [] },
      { status: 503 }
    );
  }
  try {
    const { contractId: raw } = await ctx.params;
    const contractId = Number(raw);
    if (!Number.isInteger(contractId) || contractId <= 0) {
      return NextResponse.json(
        { error: "Vertrags-ID ungültig.", positions: [] },
        { status: 400 }
      );
    }
    const positions = await listContractPositionsForTimeKeeping(contractId);
    return NextResponse.json({ positions });
  } catch (err) {
    const message =
      err instanceof MariApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const status = err instanceof MariApiError ? err.status || 502 : 502;
    return NextResponse.json({ error: message, positions: [] }, { status });
  }
}
