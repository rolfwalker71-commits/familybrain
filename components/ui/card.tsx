import * as React from "react"

import { cn } from "@/lib/utils"
import { toneSurface, type IconTone } from "@/components/layout/icon-circle"

function Card({
  className,
  size = "default",
  tone,
  ...props
}: React.ComponentProps<"div"> & {
  size?: "default" | "sm"
  tone?: IconTone
}) {
  const surface = tone ? toneSurface(tone) : null
  return (
    <div
      data-slot="card"
      data-size={size}
      data-tone={tone}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl border-2 py-(--card-spacing) text-sm text-card-foreground shadow-[0_1px_2px_rgba(15,23,42,0.06),0_4px_14px_rgba(15,23,42,0.08)] [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        surface ? surface.body : "border-border bg-card",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({
  className,
  tone,
  ...props
}: React.ComponentProps<"div"> & { tone?: IconTone }) {
  const surface = tone ? toneSurface(tone) : null
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-center gap-1 -mt-(--card-spacing) border-b px-(--card-spacing) py-1.5 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto]",
        surface ? surface.title : "border-border bg-muted",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading flex items-center text-[18px]! leading-none font-bold group-data-[size=sm]/card:text-[16px]!",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({
  className,
  tone,
  ...props
}: React.ComponentProps<"div"> & { tone?: IconTone }) {
  const soft = tone ? toneSurface(tone).soft : "bg-muted/50"
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t p-(--card-spacing)",
        soft,
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
