"use client";

// ClientAvatar.tsx — reusable cached client profile avatar.
//
// Renders the client's `photoURL` (Google profile photo or Firebase Storage
// upload) through `next/image` WITHOUT `unoptimized`, so Next's Image
// Optimization pipeline + browser/CDN cache the bytes (the whole point of this
// component vs. the chat's old inline `unoptimized` Avatar). Falls back to the
// client's initials when there is no photoURL or the image fails to load
// (404 / expired Storage signature / CORS) instead of a broken-image icon.
//
// While a photo is still decoding the circle renders as a PULSING SKELETON: a
// custom (Storage-hosted) photo goes through the optimizer or the same-origin
// proxy, and the empty circle it used to leave behind read as broken rather
// than as loading.
//
// Hosts must be allow-listed in `next.config.ts` `images.remotePatterns`
// (`lh3.googleusercontent.com` for Google photos, `storage.googleapis.com` for
// uploads) — both are present. A photoURL on any other host won't optimize and
// will trigger the initials fallback via the error path rather than throwing.

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

type AvatarSize = "sm" | "md" | "lg";

const SIZE_PX: Record<AvatarSize, number> = {
  sm: 24,
  md: 40,
  lg: 64,
};

const SIZE_CLASS: Record<AvatarSize, string> = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-lg",
};

function resolveAvatarSrc(photoURL: string): string {
  const raw = photoURL.trim();
  if (raw.length === 0) return raw;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  const path = encodeURIComponent(raw);
  return `/api/gc-fitness/storage-image?path=${path}`;
}

function shouldBypassOptimizer(src: string): boolean {
  return src.startsWith("/api/gc-fitness/storage-image");
}

function initialsFromName(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "·"
  );
}

export interface ClientAvatarProps {
  /** Client display name — drives the initials fallback. */
  name: string;
  /** Client `users/{uid}.photoURL` — Google photo or Storage upload, or null. */
  photoURL?: string | null;
  /** Visual size. `md` (40px) is the default for feed/list rows; `sm` (24px). */
  size?: AvatarSize;
  className?: string;
}

export function ClientAvatar({
  name,
  photoURL,
  size = "md",
  className,
}: ClientAvatarProps) {
  // Local per-render error flag: if the optimized image fails (expired URL,
  // CORS, host not allow-listed), fall back to initials.
  const [failed, setFailed] = useState(false);
  // A custom (Storage-hosted) photo goes through the optimizer / the
  // same-origin proxy, so it can take a beat. Until it decodes we showed an
  // EMPTY circle; now the circle pulses as a skeleton so the row reads as
  // "loading" instead of "broken".
  const [loaded, setLoaded] = useState(false);
  const px = SIZE_PX[size];
  const resolvedSrc = photoURL ? resolveAvatarSrc(photoURL) : null;
  const showImage = !!resolvedSrc && !failed;
  const bypassOptimizer = resolvedSrc ? shouldBypassOptimizer(resolvedSrc) : false;

  const imageElement = useRef<HTMLImageElement | null>(null);

  // `onLoad` does not fire for an image the browser already had decoded (cache
  // hit before hydration), which would leave the skeleton pulsing forever — so
  // read `complete` as soon as the element is attached.
  const imageRef = useCallback((node: HTMLImageElement | null) => {
    imageElement.current = node;
    if (node?.complete) setLoaded(true);
  }, []);

  // A recycled avatar (a list row re-rendered for a different client) must not
  // inherit the previous photo's state. Runs AFTER the DOM has the new `src`,
  // so `complete` answers for the NEW image (true only on a cache hit).
  useEffect(() => {
    setFailed(false);
    setLoaded(imageElement.current?.complete === true);
  }, [resolvedSrc]);

  const pending = showImage && !loaded;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium",
        SIZE_CLASS[size],
        // Skeleton while the photo decodes: same muted disc as the initials
        // fallback, pulsing.
        pending && "animate-pulse bg-muted ring-1 ring-inset ring-border",
        // Initials-only styling (a photo covers the circle entirely, so photo
        // avatars keep their bare look). The old `bg-primary/10` + `text-primary`
        // was gold-on-gold: it vanished on the gold `bg-primary` chip these
        // avatars render in when SELECTED (recent-logs / schedule / checklist
        // client filters), and the translucent fill also blended into the
        // `bg-muted` UNSELECTED chips. An opaque muted fill + foreground initials
        // + an inset ring keep the initials legible and the circle delineated on
        // white, gold, muted, and in dark mode — on any background.
        !showImage && "bg-muted text-foreground ring-1 ring-inset ring-border",
        className,
      )}
    >
      {showImage ? (
        <Image
          ref={imageRef}
          src={resolvedSrc!}
          alt=""
          width={px}
          height={px}
          className={cn(
            "h-full w-full rounded-full object-cover transition-opacity duration-200",
            // Hidden (not unmounted) while decoding: the skeleton owns the
            // circle, and a half-painted image never flashes.
            loaded ? "opacity-100" : "opacity-0",
          )}
          unoptimized={bypassOptimizer}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : (
        initialsFromName(name)
      )}
    </div>
  );
}
