"use client";

// wiki-hash-opener.tsx
//
// Client island (renders nothing) that makes the per-question deep links from
// WikiVideoShare land with the FAQ already EXPANDED. The FAQ items are native
// <details id="faq-…"> — navigating to that anchor scrolls to them but leaves
// them collapsed, so a shared link would drop the reader on a closed question.
// On first paint and on every hashchange we open the targeted <details> (if the
// anchor is one, or wraps one) and re-scroll so it lands in view after the
// layout grows.

import { useEffect } from "react";

export function WikiHashOpener() {
  useEffect(() => {
    function openFromHash() {
      const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      const details =
        target instanceof HTMLDetailsElement
          ? target
          : target.querySelector("details");
      if (details && !details.open) details.open = true;
      // Re-scroll after expanding so the anchor (with its scroll-mt offset)
      // ends up at the top of the viewport instead of where the collapsed
      // layout briefly put it.
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // Defer one frame so the DOM/layout is ready on the initial load.
    const raf = requestAnimationFrame(openFromHash);
    window.addEventListener("hashchange", openFromHash);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("hashchange", openFromHash);
    };
  }, []);

  return null;
}
