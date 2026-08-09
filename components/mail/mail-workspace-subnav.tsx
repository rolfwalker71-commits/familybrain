"use client";

import { History, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";

export type MailWorkspaceView = "chronik" | "tagesanalysen";
export type MailWorkspaceAccent = "google" | "microsoft";

const ACCENT = {
  google: {
    activeText: "text-teal-900",
    underline: "border-teal-700",
    softBg: "bg-teal-50/40",
  },
  microsoft: {
    activeText: "text-[var(--brand-docs)]",
    underline: "border-[var(--brand-docs)]",
    softBg: "bg-[var(--brand-docs-soft)]/40",
  },
} as const;

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
  const a = ACCENT[accent];
  return (
    <div
      className={cn(
        "space-y-2 rounded-2xl border border-border/60 bg-muted/30 px-3 py-2.5 shadow-sm",
        className
      )}
    >
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-sm font-medium transition-colors",
            view === "chronik"
              ? cn(a.activeText, a.underline)
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          onClick={() => onChange("chronik")}
        >
          <History className="size-3.5" strokeWidth={APP_ICON_STROKE} aria-hidden />
          Mails · Chronik
        </button>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-sm font-medium transition-colors",
            view === "tagesanalysen"
              ? cn(a.activeText, a.underline)
              : "border-transparent text-muted-foreground hover:text-foreground"
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

export function mailWorkspaceTabClass(
  active: boolean,
  accent: MailWorkspaceAccent = "google"
) {
  const a = ACCENT[accent];
  return cn(
    "inline-flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-sm font-medium transition-colors",
    active
      ? cn(a.activeText, a.underline)
      : "border-transparent text-muted-foreground hover:text-foreground"
  );
}

export function mailWorkspacePrimaryBtnClass(accent: MailWorkspaceAccent = "google") {
  return accent === "google"
    ? "bg-teal-800 text-white hover:bg-teal-800/90"
    : "bg-[var(--brand-docs)] text-white hover:bg-[var(--brand-docs)]/90";
}
