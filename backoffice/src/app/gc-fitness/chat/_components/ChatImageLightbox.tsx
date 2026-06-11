"use client";

// Issue #252 / #258 — minimal full-screen image viewer for chat photos. A
// fixed overlay (click anywhere or Escape to close) rather than the shadcn
// Dialog, so the photo can use the whole viewport without DialogContent's
// max-width styling fighting the image's natural size.
//
// Shared by the conversation bubbles (#252 — sent images) and the composer's
// staged-attachment preview (#258 — the coach checks the photo BEFORE
// sending it).

import { useEffect } from "react";

export function ChatImageLightbox({
  url,
  alt,
  onClose,
}: {
  url: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        className="max-h-full max-w-full rounded-lg object-contain"
        onClick={(event) => event.stopPropagation()}
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-black/60 text-xl text-white transition-colors hover:bg-black/80"
      >
        ×
      </button>
    </div>
  );
}
