"use client";

// GifConversionModal.tsx
//
// Shadcn Dialog explaining how to transcode a GIF to an MP4 the dropzone
// will accept. The ffmpeg command is the LOCKED VERBATIM one-liner from
// 03-UI-SPEC §Copywriting / GIF conversion modal. It is exported as
// FFMPEG_ONELINER so the Jest drift-guard (T5 in exercise-form-validation
// test suite) can assert string equality. Any tweak to the recipe must
// land in BOTH this constant AND the UI-SPEC literal in the same commit.

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// LOCKED — must match 03-UI-SPEC §Copywriting "GIF conversion modal code block"
// (string-equal asserted in __tests__/exercise-form-validation.test.tsx T5).
// Do NOT reformat, re-indent, or change quote style.
export const FFMPEG_ONELINER =
  "ffmpeg -i input.gif -vcodec libx264 -pix_fmt yuv420p -crf 23 -preset slow -movflags +faststart -vf \"scale='min(480,iw)':-2\" output.mp4";

export interface GifConversionModalProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}

export function GifConversionModal({
  open,
  onOpenChange,
}: GifConversionModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Convert your GIF to MP4</DialogTitle>
          <DialogDescription>
            Run this in your terminal where the GIF lives:
          </DialogDescription>
        </DialogHeader>

        <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-xs">
          <code>{FFMPEG_ONELINER}</code>
        </pre>

        <p className="text-sm text-muted-foreground">
          Then upload the resulting MP4.
        </p>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button">Got it</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
