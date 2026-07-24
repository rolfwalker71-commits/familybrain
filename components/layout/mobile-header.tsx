"use client";

import { useState } from "react";
import Link from "next/link";
import { Brain, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";

export function MobileHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex min-h-14 items-center justify-between border-b border-border/60 bg-card/90 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] shadow-[0_1px_0_rgba(20,32,28,0.04)] backdrop-blur-md lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-11 text-foreground hover:bg-muted"
              aria-label="Navigation öffnen"
            />
          }
        >
          <Menu className="size-5" />
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-[min(86vw,20rem)] gap-0 overflow-y-auto border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>FamilyBrain Hauptnavigation</SheetDescription>
          </SheetHeader>
          <Sidebar className="w-full" onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <Link
        href="/dashboard"
        className="absolute left-1/2 flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-lg"
        aria-label="FamilyBrain Dashboard"
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-[var(--brand-docs-soft)] text-[var(--brand-docs)]">
          <Brain className="size-5" />
        </span>
        <span className="text-lg font-bold tracking-tight text-[var(--brand-docs)]">
          FamilyBrain
        </span>
      </Link>

      <div className="size-11" aria-hidden />
    </header>
  );
}
