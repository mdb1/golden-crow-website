// wiki-loom-posters.ts
//
// Server-side lookup of each walkthrough's REAL Loom poster frame.
//
// WHY THIS EXISTS (the third round of the same bug)
// -------------------------------------------------
// The Wiki has swung twice between two failure modes, and both showed the coach
// a black rectangle where a video should be:
//
//   1. A click-to-play facade backed by a GUESSED poster URL
//      (`cdn.loom.com/sessions/thumbnails/{loomId}-with-play.jpg`). That URL is
//      not derivable from the share id — the real one carries an opaque hash —
//      so it started 404/403-ing and every faced card went black. Reverted in
//      3ab0b5a. Measured again while fixing this: that guessed URL now returns
//      **403 for all 15** of our videos, so it is dead, not flaky.
//
//   2. The revert's replacement: mount a LIVE Loom iframe for every card. That
//      restores the posters (the player draws its own) at the cost of ~15
//      third-party players initialising on one route. When some of them fail to
//      come up, their container — which was `bg-black` — is again an anonymous
//      black rectangle. Coaches read that as "there are no videos", and a
//      reload (warm cache, fewer players racing) makes them appear.
//
// The way out of the loop is to stop guessing the poster. Loom's oEmbed
// endpoint is the authority and it answers for every one of our ids:
//
//   GET https://www.loom.com/v1/oembed?url=https://www.loom.com/share/{id}
//   → { thumbnail_url: ".../{id}-{opaquehash}.gif", duration, title, … }
//
// Two details worth keeping:
//
// * `thumbnail_url` points at an ANIMATED GIF (~320-550 KB each; ~6 MB across
//   the page). The same hashed path with a `.jpg` extension is a static frame of
//   the same image at ~60 KB — measured 200 OK for all 15 — so we ask for that
//   and keep the gif as the fallback if the swap ever stops resolving.
// * This runs on the server with a 24 h `revalidate`, so the coach's browser
//   never waits on Loom to render the page, and Loom sees one request per day
//   per video rather than one per visitor.
//
// FAILING IS ALLOWED. If oEmbed is slow, rate-limited, or down, the affected
// video simply has no poster and `WikiVideoPlayer` renders its branded
// placeholder — the card still shows its title, a play control, and a link to
// Loom. What must never happen again is a black box that reads as "missing".

import "server-only";

import type { LoomPoster } from "./wiki-data";

export type { LoomPoster };

/** How long a resolved poster stays cached before we ask Loom again. */
const POSTER_REVALIDATE_SECONDS = 60 * 60 * 24;

/**
 * Per-request ceiling on the oEmbed call. The page is server-rendered, so a
 * hanging Loom would otherwise hold up the whole Wiki. Four seconds is far more
 * than the endpoint needs and still well inside any sane response budget; on
 * timeout we fall through to the placeholder.
 */
const POSTER_TIMEOUT_MS = 4000;

/**
 * Resolve posters for every id, tolerating per-id failure.
 *
 * `allSettled` rather than `all` on purpose: one 429 from Loom must not cost
 * the page its other fourteen posters.
 */
export async function fetchLoomPosters(
  loomIds: readonly string[],
): Promise<Map<string, LoomPoster>> {
  const unique = Array.from(new Set(loomIds));
  const settled = await Promise.allSettled(
    unique.map(async (id) => [id, await fetchLoomPoster(id)] as const),
  );

  const posters = new Map<string, LoomPoster>();
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    const [id, poster] = result.value;
    if (poster) posters.set(id, poster);
  }
  return posters;
}

async function fetchLoomPoster(loomId: string): Promise<LoomPoster | null> {
  const endpoint = `https://www.loom.com/v1/oembed?url=${encodeURIComponent(
    `https://www.loom.com/share/${loomId}`,
  )}`;

  try {
    const response = await fetch(endpoint, {
      next: { revalidate: POSTER_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(POSTER_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const payload: unknown = await response.json();
    const thumbnailUrl = readString(payload, "thumbnail_url");
    if (!thumbnailUrl) return null;

    return {
      posterUrl: toStaticPoster(thumbnailUrl),
      durationSeconds: readFiniteNumber(payload, "duration"),
    };
  } catch {
    // Timeout, DNS, malformed JSON — all the same outcome for the caller: no
    // poster, so the card renders its placeholder instead of pretending.
    return null;
  }
}

/**
 * Swap Loom's animated `.gif` preview for the static `.jpg` frame at the same
 * hashed path (~5x smaller, and it does not loop behind fifteen cards).
 *
 * Only rewrites a `.gif` we recognise; anything else is passed through
 * untouched, so a future change in Loom's payload degrades to "slightly heavier
 * poster" rather than "broken URL".
 */
function toStaticPoster(thumbnailUrl: string): string {
  return thumbnailUrl.endsWith(".gif")
    ? `${thumbnailUrl.slice(0, -".gif".length)}.jpg`
    : thumbnailUrl;
}

function readString(payload: unknown, key: string): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readFiniteNumber(payload: unknown, key: string): number | null {
  if (typeof payload !== "object" || payload === null) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
