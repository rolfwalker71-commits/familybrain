"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Expand, FileText } from "lucide-react";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const EXPANDED_STORAGE_KEY = "travelbrain.belegNotes.expanded";

function readExpanded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(EXPANDED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function BelegNotesBlock({
  markdown,
  show,
  title = "Beleg-Details",
}: {
  markdown: string;
  show: boolean;
  title?: string;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(readExpanded());
  }, []);

  function toggleExpanded() {
    setExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(EXPANDED_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  if (!show || !markdown.trim()) return null;

  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-background/50 px-3 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={toggleExpanded}
          aria-expanded={expanded}
        >
          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition",
              expanded && "rotate-180"
            )}
          />
          <span className="text-[10px] font-medium text-muted-foreground">
            {expanded ? "Einklappen" : "Vorschau"}
          </span>
        </button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="gap-1"
          onClick={() => setDialogOpen(true)}
        >
          <Expand className="size-3.5" />
          Mehr
        </Button>
      </div>
      <div
        className={cn(
          "overflow-hidden",
          expanded ? "max-h-none" : "max-h-72"
        )}
      >
        <ChatMarkdown content={markdown} className="text-xs" />
      </div>
      {!expanded ? (
        <button
          type="button"
          className="text-xs font-medium text-primary hover:underline"
          onClick={toggleExpanded}
        >
          Alles anzeigen
        </button>
      ) : null}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85dvh] w-[min(96vw,48rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Informationen aus verknüpften Paperless-Belegen
            </DialogDescription>
          </DialogHeader>
          <ChatMarkdown content={markdown} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
