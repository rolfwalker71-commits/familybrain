import { Suspense } from "react";
import { GoogleWorkspaceClient } from "@/components/google/google-workspace-client";

export const dynamic = "force-dynamic";

export default function GooglePage() {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-muted-foreground">
          Lade Google Workspace…
        </p>
      }
    >
      <GoogleWorkspaceClient />
    </Suspense>
  );
}
