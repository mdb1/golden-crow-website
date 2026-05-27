"use client";

// exercise-preview-thumb.tsx
//
// Small image cell used everywhere in gc-fitness backoffice that shows
// an exercise thumbnail (library list, picker, multi-add dialog,
// assign-template-modal, etc.). Hovering for 1 second opens an inline
// larger view via a Popover so trainers can verify which exercise a row
// refers to without navigating away.
//
// 260527-fot — delay tightened from 2s → 1s per operator request. 1s
// matches common hover-card defaults (e.g. shadcn HoverCard) and feels
// snappier when scanning a long list of exercises.

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Dumbbell } from "lucide-react";

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const HOVER_DELAY_MS = 1000;

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

  // 260527-fot — the thumb is a `<span>` with hover/focus handlers only.
  // We deliberately do NOT use PopoverTrigger asChild any more so the
  // component can be nested inside other interactive surfaces (the
  // exercise-picker trigger button, table rows that open detail views,
  // etc.) without intercepting the parent's click. Hover-to-preview is
  // the primary affordance; click goes through to the parent.
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
      {/* Anchor without making the thumb a PopoverTrigger — clicks bubble
          freely to whatever parent surface wrapped the thumb. */}
      <PopoverAnchor asChild>{thumb}</PopoverAnchor>
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
