import { notFound } from "next/navigation";
import { getActiveTripShareLinkByToken } from "@/lib/trips/share";
import { TripDetailClient } from "@/components/trips/trip-detail-client";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TripSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const share = getActiveTripShareLinkByToken(token);
  if (!share) notFound();

  return (
    <div className="relative min-h-dvh bg-background">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
        <p className="mr-auto text-sm text-muted-foreground">
          Geteilte Reise (nur Lesen)
          {share.label ? ` · ${share.label}` : ""}
        </p>
        <a
          href={`/api/share/t/${encodeURIComponent(token)}/pdf`}
          className={cn(buttonVariants({ size: "sm" }))}
        >
          PDF
        </a>
      </div>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <TripDetailClient tripId={share.trip_id} shareToken={token} />
      </div>
    </div>
  );
}
