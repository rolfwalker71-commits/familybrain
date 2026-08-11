"use client";

import { useState } from "react";
import {
  Archive,
  CheckSquare,
  Flag,
  MailOpen,
  Mail,
  Reply,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { showActionFeedback } from "@/lib/ui/action-feedback";
import { cn } from "@/lib/utils";

type MutateAction =
  | "markRead"
  | "markUnread"
  | "archive"
  | "delete"
  | "flag"
  | "createTodo";

export function MicrosoftMailQuickActions({
  messageId,
  unread,
  folder,
  onReply,
  onChanged,
  className,
}: {
  messageId: string;
  unread?: boolean;
  folder?: "inbox" | "sent" | string | null;
  onReply?: () => void;
  onChanged?: (action: MutateAction) => void;
  className?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const isSent = folder === "sent";

  async function run(action: MutateAction, label: string) {
    if (action === "delete") {
      if (!window.confirm("Diese Mail in Outlook löschen?")) return;
    }
    setBusy(action);
    try {
      const res = await fetch(
        `/api/microsoft/mail/${encodeURIComponent(messageId)}/mutate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (json as { error?: string }).error || "Aktion fehlgeschlagen"
        );
      }
      showActionFeedback({
        headline: label,
        detail:
          action === "createTodo"
            ? "In Microsoft To Do (und als Flag)"
            : "Outlook",
        tone: "success",
      });
      onChanged?.(action);
    } catch (err) {
      showActionFeedback({
        headline: "Mail-Aktion fehlgeschlagen",
        detail: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {onReply ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={Boolean(busy)}
          onClick={onReply}
          className="gap-1.5"
        >
          <Reply className="size-3.5" strokeWidth={APP_ICON_STROKE} />
          Antworten
        </Button>
      ) : null}
      {!isSent ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={Boolean(busy)}
          onClick={() =>
            void run(
              unread ? "markRead" : "markUnread",
              unread ? "Als gelesen markiert" : "Als ungelesen markiert"
            )
          }
          className="gap-1.5"
        >
          {unread ? (
            <MailOpen className="size-3.5" strokeWidth={APP_ICON_STROKE} />
          ) : (
            <Mail className="size-3.5" strokeWidth={APP_ICON_STROKE} />
          )}
          {unread ? "Gelesen" : "Ungelesen"}
        </Button>
      ) : null}
      {!isSent ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={Boolean(busy)}
          onClick={() => void run("archive", "Archiviert")}
          className="gap-1.5"
        >
          <Archive className="size-3.5" strokeWidth={APP_ICON_STROKE} />
          Archiv
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={Boolean(busy)}
        onClick={() => void run("flag", "Gekennzeichnet")}
        className="gap-1.5"
      >
        <Flag className="size-3.5" strokeWidth={APP_ICON_STROKE} />
        Flag
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={Boolean(busy)}
        onClick={() => void run("createTodo", "In To Do angelegt")}
        className="gap-1.5"
      >
        <CheckSquare className="size-3.5" strokeWidth={APP_ICON_STROKE} />
        To Do
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={Boolean(busy)}
        onClick={() => void run("delete", "Gelöscht")}
        className="gap-1.5 text-rose-800"
      >
        <Trash2 className="size-3.5" strokeWidth={APP_ICON_STROKE} />
        Löschen
      </Button>
    </div>
  );
}
