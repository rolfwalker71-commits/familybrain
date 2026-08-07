import { Suspense } from "react";
import { MailPageClient } from "@/components/mail/mail-page-client";

export const dynamic = "force-dynamic";

export default function MailPage() {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-muted-foreground">Lade Mail…</p>
      }
    >
      <MailPageClient />
    </Suspense>
  );
}
