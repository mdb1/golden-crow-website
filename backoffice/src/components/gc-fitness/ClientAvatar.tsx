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
// Hosts must be allow-listed in `next.config.ts` `images.remotePatterns`
// (`lh3.googleusercontent.com` for Google photos, `storage.googleapis.com` for
// uploads) — both are present. A photoURL on any other host won't optimize and
// will trigger the initials fallback via the error path rather than throwing.

import { useState } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

type AvatarSize = "sm" | "md";

const SIZE_PX: Record<AvatarSize, number> = {
  sm: 24,
  md: 40,
};

const SIZE_CLASS: Record<AvatarSize, string> = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-10 w-10 text-sm",
};

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
  const px = SIZE_PX[size];
  const showImage = !!photoURL && !failed;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 font-medium text-primary",
        SIZE_CLASS[size],
        className,
      )}
    >
      {showImage ? (
        <Image
          src={photoURL!}
          alt=""
          width={px}
          height={px}
          className="h-full w-full rounded-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initialsFromName(name)
      )}
    </div>
  );
}
