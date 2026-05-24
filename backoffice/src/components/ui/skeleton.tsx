import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      // bg-foreground/10 instead of bg-muted: --muted is ~98% white in light
      // mode which made skeletons nearly invisible on cards. /10 of the
      // foreground gives a clear slate-tinted shimmer in light AND a subtle
      // light-tinted shimmer in dark — both clearly perceived as loading.
      className={cn("animate-pulse rounded-md bg-foreground/10", className)}
      {...props}
    />
  )
}

export { Skeleton }
