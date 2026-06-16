import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { BookOpen, Video } from "lucide-react";

import { GOLDENCROW_LOGO_DATA_URI } from "@/components/gc-fitness/goldencrow-logo-data";
import { WIKI_COPY, WIKI_GROUPS, pick } from "./wiki-data";
import { WikiSections } from "./wiki-sections";

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
        <div className="mx-auto flex w-full max-w-[1800px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
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

      <div className="mx-auto w-full max-w-[1800px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
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

          {/* Content — client island: only one video plays at a time. */}
          <WikiSections locale={locale} />
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

