"use client";

// wiki-video-share.tsx
//
// Client island for the per-video "copy deep link" control. Split out from the
// (server) WikiSections so the copy-to-clipboard button can be interactive —
// same split rationale as wiki-link-cards.tsx.
//
// The copied link is the public Wiki URL with the video's anchor appended
// (e.g. https://…/gc-fitness/wiki#dashboard), so a coach can paste it and the
// recipient lands directly on that walkthrough. We build it from
// `window.location` at click time rather than hardcoding an origin, so it works
// the same on localhost, preview deploys, and prod.

import { useState, type MouseEvent } from "react";
import { Check, Link2 } from "lucide-react";

import { WIKI_COPY, pick } from "./wiki-data";

export function WikiVideoShare({
  anchorId,
  locale,
}: {
  anchorId: string;
  locale: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy(event: MouseEvent) {
    // This control can live inside a <summary> (FAQ) — prevent the click from
    // toggling the disclosure and from bubbling further.
    event.preventDefault();
    event.stopPropagation();
    // Strip any existing hash, then append this video's anchor.
    const base = window.location.href.split("#")[0];
    const deepLink = `${base}#${anchorId}`;
    try {
      await navigator.clipboard.writeText(deepLink);
    } catch {
      // Clipboard may be unavailable (insecure context / denied). Fall back to
      // navigating to the anchor so the address bar still reflects the link.
      window.location.hash = anchorId;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={pick(locale, copied ? WIKI_COPY.copiedLink : WIKI_COPY.copyVideoLink)}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <Link2 className="h-3.5 w-3.5" />
      )}
      {pick(locale, copied ? WIKI_COPY.copiedLink : WIKI_COPY.copyVideoLink)}
    </button>
  );
}
