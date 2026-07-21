import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  buildTripExportModel,
  renderTripExportHtml,
} from "@/lib/trips/export";
import { TripPrintClient } from "@/components/trips/trip-print-client";

export const dynamic = "force-dynamic";

export default async function TripPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ autoprint?: string }>;
}) {
  const { id } = await params;
  const { autoprint } = await searchParams;
  const tripId = Number(id);
  if (!Number.isInteger(tripId) || tripId <= 0) notFound();

  const model = buildTripExportModel(tripId);
  if (!model) notFound();

  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto =
    h.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  const origin = `${proto}://${host}`;

  const html = renderTripExportHtml(model, {
    absoluteOrigin: origin,
    forPrint: true,
  });

  return (
    <TripPrintClient
      html={html}
      autoPrint={autoprint === "1" || autoprint === "true"}
    />
  );
}
