"use client";

import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  downloadIcs,
  type CalendarEvent,
} from "@/lib/utils/ics";
import { cn } from "@/lib/utils";

type Props = {
  events: CalendarEvent[];
  filename: string;
  label?: string;
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "icon";
  disabled?: boolean;
};

export function AddToCalendarButton({
  events,
  filename,
  label = "In Kalender",
  className,
  variant = "outline",
  size = "sm",
  disabled,
}: Props) {
  const canExport = events.some((e) => Boolean(e.startDate));

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={disabled || !canExport}
      className={cn(className)}
      title={canExport ? "Als .ics-Datei speichern" : "Kein Datum vorhanden"}
      onClick={() => downloadIcs(filename, events.filter((e) => e.startDate))}
    >
      <CalendarPlus className="h-4 w-4" />
      {size === "icon" ? null : <span className="ml-1.5">{label}</span>}
    </Button>
  );
}
