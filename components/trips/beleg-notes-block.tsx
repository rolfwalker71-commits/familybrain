"use client";

import { useState } from "react";
import { Expand, FileText } from "lucide-react";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function BelegNotesBlock({
  markdown,
  show,
  title = "Beleg-Details",
}: {
  markdown: string;
  show: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!show || !markdown.trim()) return null;

  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-background/50 px-3 py-2">
      <div className="flex items-center gap-2">
        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="ml-auto gap-1"
          onClick={() => setOpen(true)}
        >
          <Expand className="size-3.5" />
          Mehr
        </Button>
      </div>
      <div className="max-h-40 overflow-hidden">
        <ChatMarkdown content={markdown} className="text-xs" />
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
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
