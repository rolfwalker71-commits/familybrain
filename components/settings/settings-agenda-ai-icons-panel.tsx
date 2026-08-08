"use client";

import { useState } from "react";
import { ImageIcon, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconCircle } from "@/components/layout/icon-circle";

/**
 * Admin action: force-regenerate Google + Microsoft agenda AI thumbnails
 * for the current week (new prompts / style).
 */
export function SettingsAgendaAiIconsPanel() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function regenerate() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/calendar/ai-icons/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxGenerate: 24 }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Neugenerierung fehlgeschlagen");
      }
      setMessage(
        `Fertig: ${data.generated ?? 0} neu erzeugt` +
          (data.unique != null ? ` (${data.unique} Motive)` : "") +
          (data.errors ? `, ${data.errors} Fehler` : "") +
          "."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <IconCircle icon={ImageIcon} tone="teal" size="sm" />
          Kalender-KI-Bilder
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Erzeugt die Termin-Illustrationen für{" "}
          <strong className="font-medium text-foreground">
            Google- und Microsoft-Kalender
          </strong>{" "}
          der aktuellen Woche neu (Online-Meetings, Arbeit/Sport/Ferien,
          Fahrzeit). ICS-Abos und lokale Buddy-Einträge bleiben unberührt.
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void regenerate()}
          className="gap-2"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-4" aria-hidden />
          )}
          {busy ? "Generiere…" : "Google/O365-Bilder neu generieren"}
        </Button>
        {message ? (
          <p className="text-sm text-foreground" role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
