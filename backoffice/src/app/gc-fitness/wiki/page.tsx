import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { BookOpen, PlayCircle, Video } from "lucide-react";

import { GOLDENCROW_LOGO_DATA_URI } from "@/components/gc-fitness/goldencrow-logo-data";
import { Badge } from "@/components/ui/badge";
import {
  WIKI_COPY,
  WIKI_GROUPS,
  loomEmbedUrl,
  loomShareUrl,
  pick,
  type WikiVideo,
} from "./wiki-data";

// The Coach Wiki is intentionally PUBLIC — no getCurrentTrainer() call, anyone
// with the link can read it. It's added to HIDDEN_SHELL_PATHS so it renders
// standalone (no coach sidebar / no sign-in chrome). The logged-in portal links
// here via a left-nav item that opens this page in a new tab.

export const metadata: Metadata = {
  title: "Wiki",
};

export default async function WikiPage() {
  const locale = await getLocale();
  const t = (key: keyof typeof WIKI_COPY) => pick(locale, WIKI_COPY[key]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Standalone brand bar (this page has no coach sidebar). */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-foreground shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={GOLDENCROW_LOGO_DATA_URI}
              alt=""
              className="h-6 w-6 object-contain"
            />
          </span>
          <div className="min-w-0">
            <p className="truncate font-heading text-sm font-bold leading-tight">
              {t("brand")}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {t("title")}
            </p>
          </div>
          <BookOpen className="ml-auto h-5 w-5 text-primary" />
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        {/* Hero */}
        <div className="space-y-2">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
            <Video className="h-3.5 w-3.5" />
            {t("eyebrow")}
          </p>
          <h1 className="gc-page-title text-[1.9rem] leading-tight sm:text-4xl">
            {t("title")}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
            {t("subtitle")}
          </p>
        </div>

        {/* Mobile quick-jump (native disclosure, no JS). */}
        <details className="mt-6 rounded-2xl border border-border bg-card p-4 lg:hidden">
          <summary className="cursor-pointer text-sm font-semibold">
            {t("tocTitle")}
          </summary>
          <Toc locale={locale} />
        </details>

        <div className="mt-8 grid gap-10 lg:grid-cols-[210px_1fr] lg:gap-12">
          {/* Sticky table of contents (desktop). */}
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <p className="mb-3 px-1 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("tocTitle")}
              </p>
              <Toc locale={locale} />
            </div>
          </aside>

          {/* Content */}
          <main className="min-w-0 space-y-12">
            {WIKI_GROUPS.map((group) => (
              <section
                key={group.id}
                id={group.id}
                className="scroll-mt-24 space-y-5"
              >
                <h2 className="font-heading text-lg font-bold sm:text-xl">
                  {pick(locale, group.title)}
                </h2>
                <div className="space-y-6">
                  {group.videos.map((video) => (
                    <VideoCard key={video.id} video={video} locale={locale} />
                  ))}
                </div>
              </section>
            ))}

            <p className="border-t border-border/70 pt-8 text-sm text-muted-foreground">
              {t("footer")}
            </p>
          </main>
        </div>
      </div>
    </div>
  );
}

function Toc({ locale }: { locale: string }) {
  return (
    <nav className="space-y-4 text-sm">
      {WIKI_GROUPS.map((group) => (
        <div key={group.id}>
          <a
            href={`#${group.id}`}
            className="block font-medium text-foreground transition-colors hover:text-primary"
          >
            {pick(locale, group.title)}
          </a>
          <ul className="mt-1 space-y-1 border-l border-border pl-3">
            {group.videos.map((video) => (
              <li key={video.id}>
                <a
                  href={`#${video.id}`}
                  className="block text-muted-foreground transition-colors hover:text-primary"
                >
                  {pick(locale, video.title)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function VideoCard({ video, locale }: { video: WikiVideo; locale: string }) {
  const comingSoon = !video.loomId;
  return (
    <article
      id={video.id}
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-5">
        <div className="min-w-0">
          <h3 className="font-heading text-base font-bold sm:text-lg">
            {pick(locale, video.title)}
          </h3>
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

      <div className="px-5 pb-5 pt-4">
        {video.loomId ? (
          <>
            <div className="relative w-full overflow-hidden rounded-xl border border-border bg-black">
              <div className="aspect-video">
                <iframe
                  src={loomEmbedUrl(video.loomId)}
                  title={pick(locale, video.title)}
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
