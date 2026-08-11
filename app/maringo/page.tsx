import { Suspense } from "react";
import { MaringoWorkspaceClient } from "@/components/maringo/maringo-workspace-client";

export default function MaringoPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Lade…</p>}>
      <MaringoWorkspaceClient />
    </Suspense>
  );
}
