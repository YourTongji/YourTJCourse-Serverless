import * as React from "react"

import { cn } from "~/lib/utils"

function Checkbox({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        "h-4 w-4 shrink-0 rounded-sm border border-input bg-background accent-primary",
        "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Checkbox }
