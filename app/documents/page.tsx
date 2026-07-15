import { Suspense } from "react";
import { DocumentsClient } from "@/components/documents/documents-client";

export const dynamic = "force-dynamic";

export default function DocumentsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Lade…</div>}>
      <DocumentsClient />
    </Suspense>
  );
}
