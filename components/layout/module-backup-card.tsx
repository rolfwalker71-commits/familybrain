"use client";

import { useRef, type ReactNode } from "react";
import { Download, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Shared JSON export/import card for TravelBuddy / FinanzBuddy lists.
 * Not a full DR backup — see docs/backup-restic.md.
 */
export function ModuleBackupCard({
  title,
  exportHref,
  onImport,
  accept = "application/json,.json",
  hint,
}: {
  title: string;
  exportHref: string;
  onImport: (file: File) => void | Promise<void>;
  accept?: string;
  hint?: ReactNode;
}) {
  const importRef = useRef<HTMLInputElement>(null);

  return (
    <Card className="border-border shadow-[0_2px_4px_rgba(20,32,28,0.06),0_10px_28px_rgba(20,32,28,0.1)]">
      <CardContent className="flex flex-wrap items-center gap-2 p-4">
        <div className="mr-auto min-w-0">
          <p className="text-sm text-muted-foreground">{title}</p>
          {hint ? (
            <p className="mt-0.5 text-[0.6875rem] text-muted-foreground/90">{hint}</p>
          ) : (
            <p className="mt-0.5 text-[0.6875rem] text-muted-foreground/90">
              Modul-JSON — kein vollständiges Server-Backup (restic).
            </p>
          )}
        </div>
        <a
          href={exportHref}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "gap-1.5"
          )}
        >
          <Download className="size-3.5" />
          Export
        </a>
        <input
          ref={importRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void onImport(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => importRef.current?.click()}
        >
          <Upload className="size-3.5" />
          Import
        </Button>
      </CardContent>
    </Card>
  );
}
