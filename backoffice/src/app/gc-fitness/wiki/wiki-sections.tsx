import { ChevronDown, ExternalLink, PlayCircle, Video } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  WIKI_COPY,
  WIKI_FAQ,
  WIKI_GROUPS,
  WIKI_LINKS,
  loomEmbedUrl,
  loomShareUrl,
  pick,
  type WikiVideo,
} from "./wiki-data";

// Full-width 2-up layout. Every walkthrough renders as a live Loom embed so all
// posters/thumbnails are visible at once — no click-to-play facade and no
// "only one plays at a time" gating (that hid thumbnails when a poster image
// 404'd). Loom lazy-loads each iframe, so nothing autoplays until the coach
// presses play inside a player.
export function WikiSections({ locale }: { locale: string }) {
  return (
    <main className="min-w-0 space-y-12">
      {WIKI_GROUPS.map((group) => (
        <section key={group.id} id={group.id} className="scroll-mt-24 space-y-5">
          <h2 className="font-heading text-lg font-bold sm:text-xl">
            {pick(locale, group.title)}
          </h2>
          <div className="grid gap-6 xl:grid-cols-2">
            {group.videos.map((video) => (
              <VideoCard key={video.id} video={video} locale={locale} />
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
        <div className="grid gap-4 sm:grid-cols-2">
          {WIKI_LINKS.map((link) => (
            <a
              key={link.id}
              id={link.id}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex scroll-mt-24 items-start gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/50"
            >
              <div className="min-w-0 flex-1">
                <h3 className="font-heading text-base font-bold transition-colors group-hover:text-primary sm:text-lg">
                  {pick(locale, link.label)}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {pick(locale, link.description)}
                </p>
              </div>
              <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
            </a>
          ))}
        </div>
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
                {pick(locale, item.question)}
                <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
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

function VideoCard({ video, locale }: { video: WikiVideo; locale: string }) {
  const comingSoon = !video.loomId;
  const title = pick(locale, video.title);

  return (
    <article
      id={video.id}
      className="flex scroll-mt-24 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-5">
        <div className="min-w-0">
          <h3 className="font-heading text-base font-bold sm:text-lg">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {pick(locale, video.description)}
          </p>
        </div>
        {comingSoon ? (
          <Badge variant="warning" className="shrink-0">
            {pick(locale, WIKI_COPY.comingSoon)}
          </Badge>
        ) : null}
      </div>

      <div className="mt-auto px-5 pb-5 pt-4">
        {video.loomId ? (
          <>
            <div className="relative w-full overflow-hidden rounded-xl border border-border bg-black">
              <div className="aspect-video">
                <iframe
                  src={loomEmbedUrl(video.loomId)}
                  title={title}
                  allowFullScreen
                  loading="lazy"
                  className="absolute inset-0 h-full w-full"
                />
              </div>
            </div>
            <a
              href={loomShareUrl(video.loomId)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <PlayCircle className="h-4 w-4" />
              {pick(locale, WIKI_COPY.openInLoom)}
            </a>
          </>
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
