"use client";

// The small (i) hint used next to template-form labels (#507).

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function InfoTooltip({ text, label }: { text: string; label: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            title={text}
            className="inline-flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Legacy datalist source — superseded by TemplateTagsPicker's
// DEFAULT_TAG_SUGGESTIONS list (which lives alongside the new picker).
// Kept as a no-op export anchor so removed-imports don't break old
// references in tests; remove on next cleanup pass.
