"use client";

// wiki-link-cards.tsx
//
// Client island for the "Useful links" cards. Split out from the (server)
// WikiSections so the copy-to-clipboard button can be interactive. Each card
// links out in a new tab; the http(s) links also show their URL with a copy
// button. `mailto:` links (e.g. support) skip the URL row — there's nothing
// useful to copy to a clipboard there.

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

import { WIKI_COPY, WIKI_LINKS, pick, type WikiLink } from "./wiki-data";

export function WikiLinkCards({ locale }: { locale: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {WIKI_LINKS.map((link) => (
        <WikiLinkCard key={link.id} link={link} locale={locale} />
      ))}
    </div>
  );
}

function WikiLinkCard({ link, locale }: { link: WikiLink; locale: string }) {
  const [copied, setCopied] = useState(false);
  const showUrl = !link.href.startsWith("mailto:");

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable (insecure context / denied) — no-op.
    }
  }

  return (
    <div
      id={link.id}
      className="group flex scroll-mt-24 flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/50"
    >
      <div className="flex items-start gap-3">
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1"
        >
          <h3 className="font-heading text-base font-bold transition-colors group-hover:text-primary sm:text-lg">
            {pick(locale, link.label)}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {pick(locale, link.description)}
          </p>
        </a>
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={pick(locale, WIKI_COPY.openLink)}
          className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-primary"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      {showUrl ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <span
            className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
            title={link.href}
          >
            {link.href}
          </span>
          <button
            type="button"
            onClick={copy}
            aria-label={pick(locale, copied ? WIKI_COPY.copiedLink : WIKI_COPY.copyLink)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {pick(locale, copied ? WIKI_COPY.copiedLink : WIKI_COPY.copyLink)}
          </button>
        </div>
      ) : null}
    </div>
  );
}
