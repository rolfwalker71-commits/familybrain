import { NextResponse } from "next/server";
import { getDashboardStats } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getDashboardStats());
}
