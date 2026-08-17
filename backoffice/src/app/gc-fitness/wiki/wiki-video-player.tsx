"use client";

// wiki-video-player.tsx
//
// One walkthrough's player. Shows a poster until the coach presses play, then
// mounts the Loom iframe for THAT card only.
//
// THE RULE THIS FILE ENFORCES: NEVER SHOW A BLACK BOX
// ---------------------------------------------------
// The complaint that produced this file was not "a video failed to load" — it
// was "coaches think there are no videos". Those are different bugs. A player
// that fails while showing its title, its poster and a play button reads as a
// hiccup; the same failure inside a `bg-black` rectangle reads as an empty
// page, and we lose the coach before they ever click.
//
// So every state here is legible:
//
//   * poster resolved      → the frame, a play button, and the runtime
//   * poster missing       → branded placeholder (card surface, play icon, title)
//   * playing              → the iframe, WITH THE POSTER STILL BEHIND IT, so an
//                            iframe that never paints falls back to the frame
//                            rather than to black
//   * anything at all      → "Ver en Loom" escape hatch, always present
//
// WHY NOT JUST MOUNT EVERY IFRAME (what this replaces)
// ----------------------------------------------------
// Because fifteen third-party players initialising on one route is what makes
// some of them fail in the first place. `loading="lazy"` did not bound it: on an
// iframe it is a HINT, and Chrome's lazy viewport margin runs to ~1250px on a
// fast connection — on a wide screen with a 2-up grid that is most of the page.
// A facade bounds it for real: at most the players a human has actually pressed.
//
// The previous facade attempt (reverted in 3ab0b5a) failed for an unrelated
// reason — it GUESSED the poster URL. This one is handed a poster resolved
// server-side from Loom's oEmbed endpoint; see wiki-loom-posters.ts.

import { useEffect, useState } from "react";
import { Play } from "lucide-react";

import {
  WIKI_COPY,
  loomEmbedUrl,
  loomShareUrl,
  pick,
  type LoomPoster,
} from "./wiki-data";

export function WikiVideoPlayer({
  loomId,
  anchorId,
  title,
  poster,
  locale,
}: {
  loomId: string;
  /** The card's anchor, so a #deep-link can auto-open this player (#349). */
  anchorId: string;
  title: string;
  poster: LoomPoster | null;
  locale: string;
}) {
  const [isPlaying, setIsPlaying] = useState(false);

  // #349 — a shared link like …/wiki#dashboard used to land on a card whose
  // video was already mounted, so it played on click and nothing else was
  // needed. With a facade the deep-linked card must open ITSELF, or the share
  // button silently gets worse: the recipient arrives at a poster and has to
  // guess that the thing they were sent is one more click away.
  useEffect(() => {
    function openIfTargeted() {
      const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (hash === anchorId) setIsPlaying(true);
    }
    openIfTargeted();
    window.addEventListener("hashchange", openIfTargeted);
    return () => window.removeEventListener("hashchange", openIfTargeted);
  }, [anchorId]);

  const posterStyle = poster
    ? { backgroundImage: `url(${JSON.stringify(poster.posterUrl)})` }
    : undefined;

  return (
    <div className="space-y-2">
      <div
        // The poster doubles as the container's background so it stays visible
        // BEHIND the iframe. If the Loom player never paints, the coach sees the
        // video's own frame instead of the black box this bug is named after.
        // `bg-muted` (not `bg-black`) is the floor when there is no poster
        // either — a neutral surface reads as "loading", black reads as "empty".
        className="relative w-full overflow-hidden rounded-xl border border-border bg-muted bg-cover bg-center"
        style={posterStyle}
      >
        <div className="aspect-video">
          {isPlaying ? (
            <iframe
              src={loomEmbedUrl(loomId, { autoplay: true })}
              title={title}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsPlaying(true)}
              aria-label={`${pick(locale, WIKI_COPY.playVideo)} — ${title}`}
              className="group absolute inset-0 flex h-full w-full items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {/* Scrim: keeps the play button readable over a bright frame, and
                  gives the no-poster case something better than a flat block. */}
              <span className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/20 to-black/10 transition-colors group-hover:from-black/45" />
              <span className="relative flex size-16 items-center justify-center rounded-full bg-white/95 shadow-lg transition-transform group-hover:scale-105">
                <Play className="ml-0.5 h-7 w-7 fill-current text-foreground" />
              </span>
              {poster?.durationSeconds ? (
                <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">
                  {formatDuration(poster.durationSeconds)}
                </span>
              ) : null}
              {!poster ? (
                // No poster resolved. Say so with the title rather than leaving
                // an anonymous rectangle — this is the state the old facade
                // turned into a black box for every card.
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-3 py-1.5 text-left text-xs font-medium text-white">
                  {title}
                </span>
              ) : null}
            </button>
          )}
        </div>
      </div>

      {/* Always available, in every state. If our embed is broken for a reason
          we have not thought of yet, the walkthrough is still one click away —
          which is the difference between a degraded page and a lost client. */}
      <a
        href={loomShareUrl(loomId)}
        target="_blank"
        rel="noreferrer"
        className="inline-block text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-primary hover:underline"
      >
        {pick(locale, WIKI_COPY.openInLoom)}
      </a>
    </div>
  );
}

function formatDuration(totalSeconds: number): string {
  const rounded = Math.round(totalSeconds);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
