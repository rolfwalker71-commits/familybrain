import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { MariApiError, requireMariConfig } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { searchMariCustomers } from "@/lib/mari/customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireModule("maringo");
  if (isAuthError(auth)) return auth;

  if (!hasMariConfig()) {
    return NextResponse.json(
      {
        error: "MARI nicht konfiguriert.",
        configured: false,
        customers: [],
      },
      { status: 503 }
    );
  }

  try {
    requireMariConfig();
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();
    if (q.length < 2) {
      return NextResponse.json({
        configured: true,
        customers: [],
        query: q,
      });
    }
    const customers = await searchMariCustomers(q, { limit: 30 });
    return NextResponse.json({
      configured: true,
      customers,
      query: q,
    });
  } catch (err) {
    const message =
      err instanceof MariApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const status = err instanceof MariApiError ? err.status || 502 : 502;
    return NextResponse.json({ error: message, customers: [] }, { status });
  }
}
