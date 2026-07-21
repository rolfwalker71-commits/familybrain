import { TripDetailClient } from "@/components/trips/trip-detail-client";

export const dynamic = "force-dynamic";

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tripId = Number(id);
  if (!Number.isInteger(tripId) || tripId <= 0) {
    return <p className="p-6 text-sm text-destructive">Ungültige Reise-ID.</p>;
  }
  return <TripDetailClient tripId={tripId} />;
}
