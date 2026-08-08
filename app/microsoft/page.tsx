import { Suspense } from "react";
import { MicrosoftDayClient } from "@/components/microsoft/microsoft-day-client";

export const dynamic = "force-dynamic";

export default function MicrosoftPage() {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-muted-foreground">Lade Microsoft 365…</p>
      }
    >
      <MicrosoftDayClient />
    </Suspense>
  );
}
