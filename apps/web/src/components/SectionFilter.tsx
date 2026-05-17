"use client";

import { useEffect, useState } from "react";
import css from "./section-filter.module.css";

/**
 * Filter input that hides article predicate sections + their TOC
 * entries in real time. Pure DOM scan — no React tree mutation,
 * works against statically-rendered Server Component output.
 *
 * Looks for `[data-section-key]` on PredicateSection elements and
 * `[data-toc-key]` on TOC <li> entries; both should match against
 * the lowercase title text the user might type.
 */
export function SectionFilter() {
  const [q, setQ] = useState("");
  const [stats, setStats] = useState<{ shown: number; total: number } | null>(null);

  useEffect(() => {
    const needle = q.trim().toLowerCase();
    const sections = document.querySelectorAll<HTMLElement>("[data-section-key]");
    let shown = 0;
    sections.forEach((el) => {
      const key = (el.dataset.sectionKey ?? "").toLowerCase();
      const match = !needle || key.includes(needle);
      el.style.display = match ? "" : "none";
      if (match) shown++;
    });
    const tocLis = document.querySelectorAll<HTMLElement>("[data-toc-key]");
    tocLis.forEach((el) => {
      const key = (el.dataset.tocKey ?? "").toLowerCase();
      el.style.display = !needle || key.includes(needle) ? "" : "none";
    });
    setStats({ shown, total: sections.length });
  }, [q]);

  return (
    <div className={css.wrap}>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter sections..."
        className={css.input}
        aria-label="Filter article sections"
      />
      {stats && q.trim() && (
        <span className={css.count}>
          {stats.shown.toLocaleString()} of {stats.total.toLocaleString()} sections
        </span>
      )}
    </div>
  );
}
