import { getCommunityTagStyles } from "@/lib/moderation-utils";
import { cn } from "@/lib/utils";

export function CommunityTagPill({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center justify-center rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        className
      )}
      style={getCommunityTagStyles(label)}
    >
      {label}
    </span>
  );
}
