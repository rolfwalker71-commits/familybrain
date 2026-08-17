"use client";

import { History, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";

export type MailWorkspaceView = "chronik" | "tagesanalysen";
export type MailWorkspaceAccent = "google" | "microsoft";

const ACCENT = {
  google: {
    activeText: "text-teal-900 dark:text-teal-200",
    softBg: "bg-teal-50/50 dark:bg-teal-500/15",
  },
  microsoft: {
    activeText: "text-[var(--brand-docs)]",
    softBg: "bg-[var(--brand-docs-soft)]/50",
  },
} as const;

/** Soft pill tabs — no outline / underline borders (avoids clipped text). */
export function mailWorkspaceTabClass(
  active: boolean,
  accent: MailWorkspaceAccent = "google"
) {
  const a = ACCENT[accent];
  return cn(
    "h-auto gap-1.5 rounded-lg px-3 py-2 text-sm font-medium leading-snug whitespace-normal",
    active
      ? cn("bg-card text-foreground shadow-sm", a.activeText)
      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
  );
}

export function MailWorkspaceSubnav({
  view,
  onChange,
  accent = "google",
  className,
}: {
  view: MailWorkspaceView;
  onChange: (view: MailWorkspaceView) => void;
  accent?: MailWorkspaceAccent;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "space-y-2 rounded-2xl bg-muted/40 px-3 py-3",
        className
      )}
    >
      <div
        className="flex flex-wrap gap-1 rounded-xl bg-muted/50 p-1"
        role="tablist"
        aria-label="Mail-Ansicht"
      >
        <Button
          type="button"
          variant="ghost"
          role="tab"
          aria-selected={view === "chronik"}
          className={mailWorkspaceTabClass(view === "chronik", accent)}
          onClick={() => onChange("chronik")}
        >
          <History className="size-3.5 shrink-0" strokeWidth={APP_ICON_STROKE} aria-hidden />
          Mails · Chronik
        </Button>
        <Button
          type="button"
          variant="ghost"
          role="tab"
          aria-selected={view === "tagesanalysen"}
          className={mailWorkspaceTabClass(view === "tagesanalysen", accent)}
          onClick={() => onChange("tagesanalysen")}
        >
          <Sparkles className="size-3.5 shrink-0" strokeWidth={APP_ICON_STROKE} aria-hidden />
          Tagesanalysen
        </Button>
      </div>
      {view === "chronik" ? (
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          Eingang und Gesendet gemischt, chronologisch
        </p>
      ) : (
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          Gespeicherte AI-Tagesbilder und neue Analyse
        </p>
      )}
    </div>
  );
}

export function mailWorkspacePrimaryBtnClass(accent: MailWorkspaceAccent = "google") {
  return accent === "google"
    ? "bg-teal-800 text-white hover:bg-teal-800/90"
    : "bg-[var(--brand-docs)] text-white hover:bg-[var(--brand-docs)]/90";
}
