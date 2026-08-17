"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { useTheme } from "@/components/theme/theme-provider";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      title={isDark ? "Helles Design" : "Dunkles Design"}
      aria-label={
        isDark ? "Helles Design aktivieren" : "Dunkles Design aktivieren"
      }
      className={cn(
        "size-8 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        className
      )}
    >
      {isDark ? (
        <Sun className="size-4" strokeWidth={APP_ICON_STROKE} aria-hidden />
      ) : (
        <Moon className="size-4" strokeWidth={APP_ICON_STROKE} aria-hidden />
      )}
    </Button>
  );
}
