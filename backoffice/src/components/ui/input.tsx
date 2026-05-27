import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Light mode: explicit slate border (foreground/20) on bg-background.
        // The old `border-input bg-input` was 98%-white-on-white, indistinguishable
        // from the page. Hover deepens the border. Dark mode unchanged — its
        // bg-input is already nearly solid white and reads as a real input.
        "h-8 w-full min-w-0 rounded-lg border border-foreground/20 bg-background px-2.5 py-1 text-base text-foreground shadow-[0_1px_0_rgba(255,255,255,0.4),0_12px_24px_rgba(9,12,18,0.08)] transition-colors outline-none hover:border-foreground/30 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-slate-700 placeholder:text-slate-500 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-white/70 disabled:text-slate-500 disabled:opacity-100 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:border-input dark:bg-input dark:text-foreground dark:placeholder:text-muted-foreground dark:disabled:bg-input/70 dark:disabled:text-muted-foreground dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
