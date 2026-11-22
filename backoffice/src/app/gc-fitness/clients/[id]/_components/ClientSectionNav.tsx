"use client";

// ClientSectionNav.tsx — #502: sticky section nav for the client profile.
//
// The profile stacks ~15 widgets. This is an in-page nav (anchor links), NOT
// tabs that hide content: every section stays rendered, so Ctrl+F, the
// existing `#progress-photos` deep link (compare-photos «volver») and the
// browser's own back/forward keep working, and a link to
// `/gc-fitness/clients/<id>#nutricion` lands on that section.
//
// The active item follows the scroll (IntersectionObserver over the section
// elements, rooted at the shell's scrolling <main>), and clicking an item
// updates the hash with `replaceState` so the URL is shareable without piling
// history entries.

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export interface ClientSectionNavItem {
  id: string;
  label: string;
}

export function ClientSectionNav({
  items,
  ariaLabel,
}: {
  items: ClientSectionNavItem[];
  ariaLabel: string;
}) {
  const [active, setActive] = useState<string>(items[0]?.id ?? "");

  useEffect(() => {
    // Deep link: honor the hash on first paint (the browser already scrolled).
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (items.some((item) => item.id === hash)) setActive(hash);

    if (typeof IntersectionObserver === "undefined") return;
    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
          else visible.delete(entry.target.id);
        }
        // The topmost section still on screen is the one being read.
        const first = items.find((item) => visible.has(item.id));
        if (first) setActive(first.id);
      },
      // A section counts once it crosses the band just under the sticky nav.
      { rootMargin: "-64px 0px -55% 0px", threshold: 0 },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav
      aria-label={ariaLabel}
      data-testid="client-section-nav"
      className="sticky top-0 z-20 -mx-1 overflow-x-auto border-b border-border/70 bg-background/90 px-1 py-2 backdrop-blur-sm"
    >
      <ul className="flex min-w-max gap-1">
        {items.map((item) => {
          const isActive = item.id === active;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={isActive ? "location" : undefined}
                onClick={(event) => {
                  const target = document.getElementById(item.id);
                  if (!target) return;
                  event.preventDefault();
                  target.scrollIntoView({ behavior: "smooth", block: "start" });
                  window.history.replaceState(null, "", `#${item.id}`);
                  setActive(item.id);
                }}
                className={cn(
                  "inline-flex h-10 items-center rounded-full px-3 text-sm transition-colors", // #535: 40 px tap target
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
