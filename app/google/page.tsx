import { Suspense } from "react";
import { MailPageClient } from "@/components/mail/mail-page-client";

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
      <MailPageClient />
    </Suspense>
  );
}
