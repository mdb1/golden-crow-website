"use client";

// exercise-preview-thumb.tsx
//
// Small image cell used in the exercise pickers. Hovering for 2 seconds
// opens an inline larger view via a Popover so trainers can verify which
// exercise a row refers to without leaving the picker.

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Dumbbell } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const HOVER_DELAY_MS = 2000;

interface ExercisePreviewThumbProps {
  src: string | null;
  alt?: string;
  className?: string;
  /** Small-thumb width/height; large-preview is fixed. */
  width?: number;
  height?: number;
}

export function ExercisePreviewThumb({
  src,
  alt = "",
  className,
  width = 48,
  height = 28,
}: ExercisePreviewThumbProps) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Clean up any pending hover timer if the component unmounts mid-hover.
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  function cancelTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function handleEnter() {
    if (!src) return;
    cancelTimer();
    timerRef.current = window.setTimeout(() => {
      setOpen(true);
      timerRef.current = null;
    }, HOVER_DELAY_MS);
  }

  function handleLeave() {
    cancelTimer();
    setOpen(false);
  }

  // The thumbnail is rendered inside PopoverTrigger so a click also opens
  // the preview (useful for keyboard / touch). We use a `<span>` instead
  // of a button so it stays inert when nested inside a parent <button>
  // (e.g. a CommandItem) — opening on hover is the primary affordance.
  const thumb = (
    <span
      aria-hidden="true"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-muted/40 text-muted-foreground",
        className,
      )}
      style={{ width, height }}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          className="h-full w-full object-cover"
          unoptimized
          loading="lazy"
        />
      ) : (
        <Dumbbell className="h-3 w-3" />
      )}
    </span>
  );

  if (!src) return thumb;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{thumb}</PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={6}
        className="w-auto p-0"
        onMouseEnter={cancelTimer}
        onMouseLeave={handleLeave}
      >
        <Image
          src={src}
          alt={alt}
          width={320}
          height={180}
          className="h-auto w-[320px] rounded-md object-contain"
          unoptimized
        />
      </PopoverContent>
    </Popover>
  );
}
