import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const cookieStore = await cookies();
  const { name, ...options } = sessionCookieOptions();
  cookieStore.set(name, "", { ...options, maxAge: 0 });
  return NextResponse.json({ ok: true });
}
