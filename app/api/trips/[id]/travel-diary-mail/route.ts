import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireTripAccess } from "@/lib/auth/current-user";
import { notifyFailed, notifyTravelDiary } from "@/lib/trips/notify";
import { getTripById } from "@/lib/trips/queries";
import { listTravelDiaryRecipients } from "@/lib/trips/travel-diary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

const PostSchema = z.object({
  recipientKeys: z.array(z.string().min(1)).min(1),
});

export async function GET(_request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const tripId = Number(idRaw);
    if (!Number.isInteger(tripId) || tripId <= 0) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    const auth = await requireTripAccess(tripId);
    if (isAuthError(auth)) return auth;
    if (!getTripById(tripId)) {
      return NextResponse.json({ error: "Reise nicht gefunden" }, { status: 404 });
    }
    return NextResponse.json({
      recipients: listTravelDiaryRecipients(tripId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const tripId = Number(idRaw);
    if (!Number.isInteger(tripId) || tripId <= 0) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    const auth = await requireTripAccess(tripId);
    if (isAuthError(auth)) return auth;
    if (!getTripById(tripId)) {
      return NextResponse.json({ error: "Reise nicht gefunden" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = PostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Bitte mindestens einen Empfänger wählen" },
        { status: 400 }
      );
    }

    const notification = await notifyTravelDiary(
      tripId,
      parsed.data.recipientKeys
    );
    if (notifyFailed(notification) || !notification.ok) {
      return NextResponse.json(
        {
          error:
            notification.error ||
            notification.skipped ||
            "Mailversand fehlgeschlagen",
          notification,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      sent: notification.sent,
      notification,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
