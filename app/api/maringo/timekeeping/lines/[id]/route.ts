import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import {
  deleteTimeKeepingLine,
  getTimeKeepingLine,
  getTimeKeepingLineDetail,
  MariTimeLineCreateSchema,
  replaceTimeKeepingLine,
  TIMEKEEPING_SOURCE_SUPPORT_ISSUE,
} from "@/lib/mari/timekeeping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseLineId(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  ensureInitialized();
  const auth = await requireModule("maringo");
  if (isAuthError(auth)) return auth;
  if (!hasMariConfig()) {
    return NextResponse.json(
      { error: "MARI nicht konfiguriert." },
      { status: 503 }
    );
  }
  const lineId = parseLineId((await ctx.params).id);
  if (lineId == null) {
    return NextResponse.json({ error: "Buchungs-ID ungültig." }, { status: 400 });
  }
  try {
    const detail = await getTimeKeepingLineDetail(lineId);
    const raw = await getTimeKeepingLine(lineId).catch(() => null);
    const hours = detail?.hours ?? (Number(raw?.Hours) || 0);
    const hoursBillable =
      detail?.hoursBillable ?? (Number(raw?.HoursBillable) || 0);
    const srcType =
      detail?.sourceType ?? (Number(raw?.SourceReferenceType) || 0);
    const srcId =
      detail?.sourceReference ?? (Number(raw?.SourceReferenceID) || 0);
    return NextResponse.json({
      ok: true,
      line: {
        lineId: detail?.lineId || Number(raw?.LineID) || lineId,
        serviceDate:
          detail?.serviceDate ||
          String(raw?.DayOfService || "").slice(0, 10),
        employeeNumber:
          detail?.employeeNumber || String(raw?.EmployeeNumber || ""),
        projectNumber:
          detail?.projectNumber || String(raw?.ProjectNumber || ""),
        projectCustomer: detail?.projectCustomer || null,
        activity: detail?.activity || String(raw?.Activity || ""),
        memo:
          detail?.memo ??
          (String(raw?.MemoText || "").trim() || null),
        internalRemarkVerr: detail?.internalRemarkVerr || null,
        zeroHoursReason: detail?.zeroHoursReason || null,
        hours,
        hoursBillable,
        billable: hoursBillable > 0,
        contractId: detail?.contractId ?? (Number(raw?.ContractID) || 0),
        contractPositionId: Number(raw?.ContractPositionID) || 0,
        issueId:
          srcType === TIMEKEEPING_SOURCE_SUPPORT_ISSUE && srcId > 0
            ? srcId
            : null,
        sourceType: srcType,
        sourceReference: srcId,
      },
    });
  } catch (err) {
    const message =
      err instanceof MariApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const status = err instanceof MariApiError ? err.status || 502 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  ensureInitialized();
  const auth = await requireModule("maringo");
  if (isAuthError(auth)) return auth;
  if (!hasMariConfig()) {
    return NextResponse.json(
      { error: "MARI nicht konfiguriert." },
      { status: 503 }
    );
  }
  const lineId = parseLineId((await ctx.params).id);
  if (lineId == null) {
    return NextResponse.json({ error: "Buchungs-ID ungültig." }, { status: 400 });
  }
  try {
    const json = await request.json();
    const parsed = MariTimeLineCreateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Ungültige Eingabe." },
        { status: 400 }
      );
    }
    const line = await replaceTimeKeepingLine(lineId, parsed.data);
    return NextResponse.json({ ok: true, line });
  } catch (err) {
    const message =
      err instanceof MariApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const status = err instanceof MariApiError ? err.status || 502 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  ensureInitialized();
  const auth = await requireModule("maringo");
  if (isAuthError(auth)) return auth;
  if (!hasMariConfig()) {
    return NextResponse.json(
      { error: "MARI nicht konfiguriert." },
      { status: 503 }
    );
  }
  const lineId = parseLineId((await ctx.params).id);
  if (lineId == null) {
    return NextResponse.json({ error: "Buchungs-ID ungültig." }, { status: 400 });
  }
  try {
    await deleteTimeKeepingLine(lineId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof MariApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const status = err instanceof MariApiError ? err.status || 502 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
