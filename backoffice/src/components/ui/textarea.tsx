import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // Mirrors the Input visibility fix: light-mode slate border on
        // bg-background, hover deepens. Dark mode keeps editable text readable.
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-foreground/20 bg-background px-2.5 py-2 text-base text-foreground shadow-[0_1px_0_rgba(255,255,255,0.4),0_12px_24px_rgba(9,12,18,0.08)] transition-colors outline-none hover:border-foreground/30 placeholder:text-slate-500 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-white/70 disabled:text-slate-500 disabled:opacity-100 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:border-white/60 dark:bg-black dark:text-white dark:placeholder:text-white/50 dark:hover:border-white/80 dark:disabled:bg-black/70 dark:disabled:text-white/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
