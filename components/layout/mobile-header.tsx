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
    <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between border-b border-slate-700/70 bg-sidebar px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-white shadow-sm lg:hidden">
      <Link
        href="/dashboard"
        className="flex min-h-11 items-center gap-3 rounded-lg"
        aria-label="MyBrain Dashboard"
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
          <Brain className="size-5" />
        </span>
        <span className="text-2xl font-extrabold tracking-tight">
          MyBrain
        </span>
      </Link>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-11 text-white hover:bg-sidebar-accent hover:text-white"
              aria-label="Navigation öffnen"
            />
          }
        >
          <Menu className="size-5" />
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-[min(86vw,20rem)] gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>MyBrain Hauptnavigation</SheetDescription>
          </SheetHeader>
          <Sidebar className="w-full" onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </header>
  );
}
