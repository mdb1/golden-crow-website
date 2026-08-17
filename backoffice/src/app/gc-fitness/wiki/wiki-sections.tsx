import { ChevronDown, Video } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  WIKI_COPY,
  WIKI_FAQ,
  WIKI_GROUPS,
  pick,
  type LoomPoster,
  type WikiVideo,
} from "./wiki-data";
import { fetchLoomPosters } from "./wiki-loom-posters";
import { WikiLinkCards } from "./wiki-link-cards";
import { WikiVideoShare } from "./wiki-video-share";
import { WikiVideoPlayer } from "./wiki-video-player";
import { WikiHashOpener } from "./wiki-hash-opener";

// Full-width 2-up layout, one poster per walkthrough, and the Loom player
// mounted only for the card a coach actually pressed.
//
// This is the third arrangement of these cards and the reasoning matters, so it
// is written down in the two files it lives in rather than rediscovered a fourth
// time: `wiki-loom-posters.ts` for where a poster comes from (Loom's oEmbed
// endpoint — the previous facade GUESSED the URL and it 403s for every one of
// our videos today), and `wiki-video-player.tsx` for why a failed player must
// never render as a black rectangle.
export async function WikiSections({ locale }: { locale: string }) {
  // Resolved once for the whole page, server-side and cached for a day, so the
  // grid renders with its posters already in the HTML — no client fetch, no
  // per-card waterfall, and no coach staring at empty frames while Loom answers.
  const posters = await fetchLoomPosters(
    WIKI_GROUPS.flatMap((group) =>
      group.videos.flatMap((video) => (video.loomId ? [video.loomId] : [])),
    ),
  );

  return (
    <main className="min-w-0 space-y-12">
      <WikiHashOpener />
      {WIKI_GROUPS.map((group) => (
        <section key={group.id} id={group.id} className="scroll-mt-24 space-y-5">
          <h2 className="font-heading text-lg font-bold sm:text-xl">
            {pick(locale, group.title)}
          </h2>
          <div className="grid gap-6 xl:grid-cols-2">
            {group.videos.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                locale={locale}
                poster={
                  video.loomId ? (posters.get(video.loomId) ?? null) : null
                }
              />
            ))}
          </div>
        </section>
      ))}

      {/* Useful links — each opens in a new tab. */}
      <section id="links-utiles" className="scroll-mt-24 space-y-5">
        <div className="space-y-1">
          <h2 className="font-heading text-lg font-bold sm:text-xl">
            {pick(locale, WIKI_COPY.linksTitle)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {pick(locale, WIKI_COPY.linksSubtitle)}
          </p>
        </div>
        <WikiLinkCards locale={locale} />
      </section>

      {/* FAQ — native disclosure, no JS. */}
      <section id="faq" className="scroll-mt-24 space-y-5">
        <h2 className="font-heading text-lg font-bold sm:text-xl">
          {pick(locale, WIKI_COPY.faqTitle)}
        </h2>
        <div className="space-y-3">
          {WIKI_FAQ.map((item) => (
            <details
              key={item.id}
              id={item.id}
              className="group scroll-mt-24 rounded-2xl border border-border bg-card p-5 shadow-sm"
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3 font-heading text-base font-semibold [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">{pick(locale, item.question)}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {/* Per-question deep link (#349) — copies the Wiki URL +
                      this FAQ's anchor without toggling the disclosure. */}
                  <WikiVideoShare anchorId={item.id} locale={locale} />
                  <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </span>
              </summary>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {pick(locale, item.answer)}
              </p>
            </details>
          ))}
        </div>
      </section>

      <p className="border-t border-border/70 pt-8 text-sm text-muted-foreground">
        {pick(locale, WIKI_COPY.footer)}
      </p>
    </main>
  );
}

function VideoCard({
  video,
  locale,
  poster,
}: {
  video: WikiVideo;
  locale: string;
  poster: LoomPoster | null;
}) {
  const comingSoon = !video.loomId;
  const title = pick(locale, video.title);

  return (
    <article
      id={video.id}
      className="flex scroll-mt-24 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-base font-bold sm:text-lg">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {pick(locale, video.description)}
          </p>
        </div>
        {/* Top-right controls, pinned (no flex-wrap) so the share button lands
            in the same spot on every card regardless of description length. */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          {comingSoon ? (
            <Badge variant="warning">{pick(locale, WIKI_COPY.comingSoon)}</Badge>
          ) : null}
          {/* Per-video deep link (#349) — copies the Wiki URL + this card's
              anchor so a coach can share a single walkthrough. */}
          <WikiVideoShare anchorId={video.id} locale={locale} />
        </div>
      </div>

      <div className="mt-auto px-5 pb-5 pt-4">
        {video.loomId ? (
          <WikiVideoPlayer
            loomId={video.loomId}
            anchorId={video.id}
            title={title}
            poster={poster}
            locale={locale}
          />
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 text-center">
            <Video className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm font-medium">
              {pick(locale, WIKI_COPY.comingSoon)}
            </p>
            <p className="max-w-xs px-4 text-xs text-muted-foreground">
              {pick(locale, WIKI_COPY.comingSoonHint)}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}
