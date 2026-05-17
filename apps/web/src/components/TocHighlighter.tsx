"use client";

import { useEffect } from "react";

/**
 * Watches predicate sections in the document via IntersectionObserver
 * and toggles a `data-current="true"` attribute on the matching TOC
 * link. CSS in page.module.css handles the visual highlight. No React
 * tree mutation — works entirely off the SSR'd anchor href => id map.
 */
export function TocHighlighter() {
  useEffect(() => {
    const tocLinks = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href^="#pred-"], a[href^="#other-facts"], a[href^="#timeline"], a[href^="#references"], a[href^="#see-also"]'),
    );
    if (tocLinks.length === 0) return;

    const linkByHash = new Map<string, HTMLAnchorElement>();
    for (const a of tocLinks) {
      const h = a.getAttribute("href") ?? "";
      if (h.startsWith("#")) linkByHash.set(h.slice(1), a);
    }
    const sections = [...linkByHash.keys()]
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el != null);
    if (sections.length === 0) return;

    let currentId: string | null = null;
    const setCurrent = (id: string | null) => {
      if (id === currentId) return;
      currentId = id;
      for (const a of tocLinks) {
        a.removeAttribute("data-current");
      }
      if (id) {
        const a = linkByHash.get(id);
        if (a) a.setAttribute("data-current", "true");
      }
    };

    const observer = new IntersectionObserver(
      () => {
        // Pick the topmost section whose top is at-or-above 25% of the
        // viewport. Simple, deterministic, no jitter from competing
        // entries firing in any order.
        let best: { id: string; top: number } | null = null;
        const cutoff = window.innerHeight * 0.25;
        for (const sec of sections) {
          const rect = sec.getBoundingClientRect();
          if (rect.top <= cutoff && rect.bottom > cutoff) {
            if (!best || rect.top > best.top) {
              best = { id: sec.id, top: rect.top };
            }
          }
        }
        setCurrent(best?.id ?? null);
      },
      { rootMargin: "-25% 0px -60% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    for (const sec of sections) observer.observe(sec);

    // Also recompute on scroll — IntersectionObserver only fires on
    // crossings, not continuous updates, and the above selection logic
    // is cheap.
    const onScroll = () => {
      let best: { id: string; top: number } | null = null;
      const cutoff = window.innerHeight * 0.25;
      for (const sec of sections) {
        const rect = sec.getBoundingClientRect();
        if (rect.top <= cutoff && rect.bottom > cutoff) {
          if (!best || rect.top > best.top) best = { id: sec.id, top: rect.top };
        }
      }
      setCurrent(best?.id ?? null);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return null;
}
