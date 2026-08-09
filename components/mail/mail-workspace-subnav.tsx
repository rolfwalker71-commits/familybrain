"use client";

import { History, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";

export type MailWorkspaceView = "chronik" | "tagesanalysen";

export function MailWorkspaceSubnav({
  view,
  onChange,
  className,
}: {
  view: MailWorkspaceView;
  onChange: (view: MailWorkspaceView) => void;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap gap-1 rounded-lg border border-border/70 bg-card p-0.5 shadow-sm">
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            view === "chronik"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => onChange("chronik")}
        >
          <History className="size-3.5" strokeWidth={APP_ICON_STROKE} aria-hidden />
          Mails · Chronik
        </button>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            view === "tagesanalysen"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => onChange("tagesanalysen")}
        >
          <Sparkles className="size-3.5" strokeWidth={APP_ICON_STROKE} aria-hidden />
          Tagesanalysen
        </button>
      </div>
      {view === "chronik" ? (
        <p className="text-[12px] text-muted-foreground">
          Eingang und Gesendet gemischt, chronologisch
        </p>
      ) : (
        <p className="text-[12px] text-muted-foreground">
          Gespeicherte AI-Tagesbilder und neue Analyse
        </p>
      )}
    </div>
  );
}
