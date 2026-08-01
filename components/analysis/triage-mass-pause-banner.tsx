"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Mail, PauseCircle } from "lucide-react";
import { IconCircle } from "@/components/layout/icon-circle";

type PauseState = {
  triageMassPaused: boolean;
  triageMassPauseRestores: {
    triageAfterAnalysisEnabled: boolean;
    triageMailEnabled: boolean;
    triageMailRecipients: string;
  } | null;
};

export function TriageMassPauseBanner() {
  const [state, setState] = useState<PauseState | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/triage-mass-pause");
      if (!res.ok) return;
      const data = await res.json();
      setState({
        triageMassPaused: Boolean(data.triageMassPaused),
        triageMassPauseRestores: data.triageMassPauseRestores ?? null,
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 4000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  if (!state?.triageMassPaused) return null;

  const restores = state.triageMassPauseRestores;
  const parts: string[] = [];
  if (restores?.triageAfterAnalysisEnabled) {
    parts.push("Triage nach Analyse");
  }
  if (restores?.triageMailEnabled) {
    parts.push("Triage-Mail");
  }
  const what =
    parts.length > 0
      ? parts.join(" + ")
      : "Triage nach Analyse / Triage-Mail";

  return (
    <div className="z-20 border-b border-amber-500/35 bg-amber-50/95 px-4 py-2.5 text-amber-950 supports-[backdrop-filter]:bg-amber-50/90 sm:px-6 lg:px-8 dark:border-amber-400/25 dark:bg-amber-950/40 dark:text-amber-50">
      <div className="mx-auto flex max-w-7xl items-start gap-3">
        <IconCircle
          icon={PauseCircle}
          tone="amber"
          size="sm"
          className="mt-0.5 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            Massenanalyse: {what} temporär ausgeschaltet
          </p>
          <p className="mt-0.5 text-xs opacity-90">
            Keine neuen Inbox-Einträge und keine Triage-Mails während dieses
            Laufs. Danach werden die Optionen
            {restores?.triageMailRecipients
              ? ` (Empfänger: ${restores.triageMailRecipients})`
              : ""}{" "}
            wieder aktiviert.{" "}
            <Link
              href="/settings#triage-mail"
              className="underline underline-offset-2"
            >
              Einstellungen
            </Link>
          </p>
        </div>
        {restores?.triageMailEnabled ? (
          <Mail className="mt-0.5 size-4 shrink-0 opacity-70" aria-hidden />
        ) : null}
      </div>
    </div>
  );
}
