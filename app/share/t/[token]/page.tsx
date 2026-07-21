import { notFound } from "next/navigation";
import {
  buildTripExportModel,
  renderTripExportHtml,
} from "@/lib/trips/export";
import { getActiveTripShareLinkByToken } from "@/lib/trips/share";
import { TripPrintClient } from "@/components/trips/trip-print-client";
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

  const model = buildTripExportModel(share.trip_id);
  if (!model) notFound();

  const rewrite = (url: string | null): string | null => {
    if (!url) return null;
    const m = url.match(
      /^\/api\/trips\/media\/(cover|aircraft|map)\/([^/?#]+)/
    );
    if (!m) return url;
    return `/api/share/t/${encodeURIComponent(token)}/media/${m[1]}/${m[2]}`;
  };

  const sharedModel = {
    ...model,
    coverUrl: rewrite(model.coverUrl),
    events: model.events.map((e) => ({
      ...e,
      map_image_url: rewrite(e.map_image_url),
      aircraft_image_url: rewrite(e.aircraft_image_url),
    })),
  };

  const html = renderTripExportHtml(sharedModel);

  return (
    <div className="relative min-h-dvh bg-[#f7f5f1]">
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
      <div className="h-[calc(100dvh-3.25rem)]">
        <TripPrintClient html={html} />
      </div>
    </div>
  );
}
