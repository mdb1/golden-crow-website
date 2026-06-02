"use client";

// ComplianceInfoTooltip.tsx — small info "(i)" affordance for the compliance
// percentage cards. Explains that the % is SCHEDULED-day adherence (days
// before the start date and non-scheduled days don't count), matching the
// computeAdherence denominator change in habit-compliance.ts.
//
// Client component: the shadcn Tooltip primitive (radix-ui) needs hover/focus
// interactivity. The parent ComplianceWidget is a Server Component, so the
// translated tooltip text is resolved server-side and passed in as `text`.
// `text` also lands on the native `title` attribute so the hint survives even
// without JS (graceful fallback).

import { Info } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ComplianceInfoTooltipProps {
  /** Already-localized explanation string (resolved by the server parent). */
  text: string;
  /** Accessible label for the trigger button (already localized). */
  label: string;
}

export function ComplianceInfoTooltip({
  text,
  label,
}: ComplianceInfoTooltipProps) {
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
