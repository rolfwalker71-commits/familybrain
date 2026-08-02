"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Brain,
  HandCoins,
  LayoutGrid,
  Luggage,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAdminNav } from "@/components/layout/admin-nav-provider";
import { inferAdminNavMode } from "@/lib/navigation/admin-nav";
import { BRAND } from "@/lib/branding";
import { Sidebar } from "./sidebar";

type Brand = {
  name: string;
  href: string;
  icon: typeof BookOpen;
  accentClass: string;
  iconWrapClass: string;
};

function brandForAdminMode(
  mode: "home" | "mybrain" | "travelbuddy" | "finanzbuddy",
  pathname: string
): Brand {
  if (mode === "finanzbuddy") {
    return {
      name: BRAND.finance,
      href: "/finance-brain",
      icon: HandCoins,
      accentClass: "text-[var(--brand-finance)]",
      iconWrapClass:
        "bg-[var(--brand-finance)] text-white shadow-sm shadow-[var(--brand-finance)]/30",
    };
  }
  if (mode === "travelbuddy") {
    return {
      name: BRAND.travel,
      href: "/trips",
      icon: Luggage,
      accentClass: "text-[var(--brand-finance)]",
      iconWrapClass:
        "bg-[var(--brand-finance)] text-white shadow-sm shadow-[var(--brand-finance)]/30",
    };
  }
  if (mode === "mybrain") {
    return {
      name: BRAND.buddy,
      href: "/dashboard",
      icon: Brain,
      accentClass: "text-[var(--brand-docs)]",
      iconWrapClass:
        "bg-[var(--brand-docs)] text-white shadow-sm shadow-[var(--brand-docs)]/30",
    };
  }
  return {
    name: BRAND.app,
    href: "/dashboard",
    icon: LayoutGrid,
    accentClass: "text-[var(--brand-docs)]",
    iconWrapClass:
      "bg-[var(--brand-docs)] text-white shadow-sm shadow-[var(--brand-docs)]/30",
  };
}

function brandForPath(pathname: string): Brand {
  const mode = inferAdminNavMode(pathname);
  if (mode === "finanzbuddy") {
    return brandForAdminMode("finanzbuddy", pathname);
  }
  if (mode === "travelbuddy") {
    return brandForAdminMode("travelbuddy", pathname);
  }
  return {
    name: BRAND.app,
    href: "/dashboard",
    icon: BookOpen,
    accentClass: "text-[var(--brand-docs)]",
    iconWrapClass:
      "bg-[var(--brand-docs)] text-white shadow-sm shadow-[var(--brand-docs)]/30",
  };
}

export function MobileHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() || "/";
  const { mode, goHome, isAdminNav } = useAdminNav();
  const brand = isAdminNav
    ? brandForAdminMode(mode, pathname)
    : brandForPath(pathname);
  const BrandIcon = brand.icon;

  return (
    <header className="sticky top-0 z-40 flex min-h-14 items-center justify-between border-b border-border/60 bg-card/95 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] shadow-[0_1px_0_rgba(20,32,28,0.06)] backdrop-blur-md lg:hidden">
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
          <Menu className="size-5 stroke-[2.25]" />
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-[min(86vw,20rem)] gap-0 overflow-y-auto border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>
              {isAdminNav ? "Buddy Hauptnavigation" : "Buddy Navigation"}
            </SheetDescription>
          </SheetHeader>
          <Sidebar className="w-full" onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <Link
        href={brand.href}
        className="absolute left-1/2 flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-lg"
        aria-label={`${brand.name} öffnen`}
        onClick={(e) => {
          if (!isAdminNav) return;
          if (mode === "home") return;
          if (brand.name === BRAND.app || brand.name === BRAND.buddy) {
            // tapping brand while in a section: go to Buddy home
            e.preventDefault();
            goHome();
          }
        }}
      >
        <span
          className={`flex size-9 items-center justify-center rounded-full ${brand.iconWrapClass}`}
        >
          <BrandIcon className="size-5 stroke-[2.25]" />
        </span>
        <span
          className={`text-lg font-bold tracking-tight ${brand.accentClass}`}
        >
          {brand.name}
        </span>
      </Link>

      <div className="size-11" aria-hidden />
    </header>
  );
}
