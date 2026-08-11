"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { showActionFeedback } from "@/lib/ui/action-feedback";

export function MicrosoftMailComposeDialog({
  open,
  onOpenChange,
  mode = "new",
  sourceMailId,
  defaultTo = "",
  defaultSubject = "",
  defaultBody = "",
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "new" | "reply";
  sourceMailId?: string | null;
  defaultTo?: string;
  defaultSubject?: string;
  defaultBody?: string;
  onSent?: () => void;
}) {
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [includeSignature, setIncludeSignature] = useState(true);
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTo(defaultTo);
    setSubject(defaultSubject);
    setBody(defaultBody);
    setError(null);
    void (async () => {
      try {
        const res = await fetch("/api/microsoft/mail/signature");
        const json = await res.json().catch(() => ({}));
        if (res.ok) {
          const text = String(
            (json as { signature?: { text?: string; appendOnSend?: boolean } })
              .signature?.text || ""
          ).trim();
          setHasSignature(Boolean(text));
          setIncludeSignature(
            Boolean(
              (json as { signature?: { appendOnSend?: boolean } }).signature
                ?.appendOnSend !== false
            )
          );
        }
      } catch {
        /* ignore */
      }
    })();
  }, [open, defaultTo, defaultSubject, defaultBody]);

  async function submit(send: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/microsoft/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject,
          body,
          sourceMailId: mode === "reply" ? sourceMailId : null,
          includeSignature,
          send,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (json as { error?: string }).error || "Senden fehlgeschlagen"
        );
      }
      showActionFeedback({
        headline: send ? "Mail gesendet" : "Entwurf in Outlook",
        detail: subject || "Outlook",
        tone: "success",
      });
      onOpenChange(false);
      onSent?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showActionFeedback({
        headline: "Mail fehlgeschlagen",
        detail: message,
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-[min(96vw,36rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 px-4 py-3 pr-12 text-left">
          <DialogTitle className="text-base">
            {mode === "reply" ? "Antwort senden" : "Neue Mail"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Wird über dein verbundenes Outlook-Konto versendet
            {hasSignature
              ? " · Signatur aus Buddy-Einstellungen"
              : " · Signatur optional unter Konto hinterlegen"}
            .
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="ms-mail-to">An</Label>
            <Input
              id="ms-mail-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="name@firma.ch"
              disabled={busy}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ms-mail-subject">Betreff</Label>
            <Input
              id="ms-mail-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ms-mail-body">Text</Label>
            <Textarea
              id="ms-mail-body"
              rows={10}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={busy}
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={includeSignature}
              onChange={(e) => setIncludeSignature(e.target.checked)}
              disabled={busy || !hasSignature}
            />
            Signatur anhängen
            {!hasSignature ? " (noch keine unter Konto)" : ""}
          </label>
        </div>
        <DialogFooter className="gap-2 border-t border-border/60 px-4 py-3 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={busy || !to.trim() || !body.trim()}
            onClick={() => void submit(false)}
          >
            Als Entwurf
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              disabled={busy || !to.trim() || !body.trim()}
              onClick={() => void submit(true)}
              className="gap-1.5"
            >
              <Send className="size-3.5" strokeWidth={APP_ICON_STROKE} />
              {busy ? "Sendet…" : "Senden"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
