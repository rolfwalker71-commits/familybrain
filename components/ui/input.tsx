import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

type InputProps = React.ComponentProps<"input"> & {
  onValueChange?: (value: string, eventDetails?: unknown) => void
}

function Input({
  className,
  type,
  autoComplete,
  onChange,
  onValueChange,
  value,
  defaultValue,
  ...props
}: InputProps) {
  const rawValue = value
  const isEmptyDateOrTime =
    (type === "date" || type === "time") &&
    (rawValue === undefined || rawValue === null || rawValue === "")

  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-empty={isEmptyDateOrTime ? "true" : undefined}
      autoComplete={
        type === "date" || type === "time" ? "off" : autoComplete
      }
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base font-medium text-foreground transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:font-normal placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        isEmptyDateOrTime && "font-normal text-muted-foreground",
        className
      )}
      value={value as string | number | readonly string[] | undefined}
      defaultValue={
        defaultValue as string | number | readonly string[] | undefined
      }
      onValueChange={(next) => {
        const str = String(next ?? "")
        onValueChange?.(str)
        if (onChange) {
          onChange({
            target: { value: str },
            currentTarget: { value: str },
          } as React.ChangeEvent<HTMLInputElement>)
        }
      }}
      {...props}
    />
  )
}

export { Input }
