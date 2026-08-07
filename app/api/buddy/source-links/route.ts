import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { listBuddySourceLinks } from "@/lib/buddy/source-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Source chips for a Buddy entity (e.g. document). */
export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const { searchParams } = new URL(request.url);
  const entityType = (searchParams.get("entityType") || "document") as
    | "document"
    | "mail_message";
  const entityId = searchParams.get("entityId")?.trim();
  if (!entityId) {
    return NextResponse.json({ error: "entityId fehlt" }, { status: 400 });
  }
  const links = listBuddySourceLinks(entityType, entityId);
  return NextResponse.json({ links });
}
