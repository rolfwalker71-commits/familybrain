"use client";

import { useMemo, useState } from "react";
import { ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { prepareMailHtmlForDisplay } from "@/lib/mail/mail-html-display";
import { cn } from "@/lib/utils";

export function MailHtmlBody({
  html,
  plainFallback,
  className,
}: {
  html: string | null | undefined;
  plainFallback?: string | null;
  className?: string;
}) {
  const [loadImages, setLoadImages] = useState(false);

  const prepared = useMemo(
    () => prepareMailHtmlForDisplay(html, { loadRemoteImages: loadImages }),
    [html, loadImages]
  );

  if (!prepared.hasHtml) {
    return (
      <pre
        className={cn(
          "max-h-[min(60vh,28rem)] overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 font-sans text-sm leading-relaxed",
          className
        )}
      >
        {plainFallback || "(kein Text)"}
      </pre>
    );
  }

  const showBanner = prepared.externalImageCount > 0 && !loadImages;

  return (
    <div className={cn("space-y-2", className)}>
      {showBanner ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-[12px] text-amber-950 dark:border-amber-400/30 dark:bg-amber-500/12 dark:text-amber-100">
          <p className="min-w-0 flex-1">
            {prepared.externalImageCount === 1
              ? "1 externes Bild blockiert (Datenschutz)."
              : `${prepared.externalImageCount} externe Bilder blockiert (Datenschutz).`}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 border-amber-300 bg-white text-[11px] dark:border-amber-400/40 dark:bg-card dark:text-amber-100"
            onClick={() => setLoadImages(true)}
          >
            <ImageIcon className="size-3.5" strokeWidth={APP_ICON_STROKE} />
            Bilder laden
          </Button>
        </div>
      ) : null}
      {loadImages && prepared.externalImageCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>Externe Bilder geladen.</span>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-[11px] underline underline-offset-2"
            onClick={() => setLoadImages(false)}
          >
            Wieder blockieren
          </Button>
        </div>
      ) : null}
      <div
        className={cn(
          "mail-html-body max-h-[min(60vh,28rem)] overflow-y-auto overflow-x-hidden break-words rounded-lg border border-border/50 bg-card p-3 text-sm leading-relaxed",
          "[&_a]:text-primary [&_a]:underline [&_img]:max-h-80 [&_img]:max-w-full [&_img]:h-auto",
          "[&_table]:max-w-full [&_td]:align-top",
          "[&_.mail-img-ph]:inline-block [&_.mail-img-ph]:rounded [&_.mail-img-ph]:bg-muted [&_.mail-img-ph]:px-1.5 [&_.mail-img-ph]:py-0.5 [&_.mail-img-ph]:text-[10px] [&_.mail-img-ph]:text-muted-foreground"
        )}
        dangerouslySetInnerHTML={{ __html: prepared.html }}
      />
    </div>
  );
}
