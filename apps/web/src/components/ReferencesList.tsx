"use client";

import { useState } from "react";
import Link from "next/link";
import css from "./references-list.module.css";

export interface RefRow {
  ctx:        string;
  num:        number;
  name:       string;
  domain:     string | null;
  url:        string | null;
  localHref:  string | null;
  kind:       string | null;
}

/**
 * Compact, filterable references list. Always renders every reference
 * (so existing `#ref-<n>` deep links keep working — important: the
 * URL fragment the user shared, e.g. https://www.dontopedia.com/article/foo#ref-59,
 * has to find its anchor). Filter is *visual* only: non-matching rows
 * get aria-hidden + display:none in CSS, but stay in the DOM.
 */
export function ReferencesList({ rows }: { rows: RefRow[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();

  const matches = needle
    ? new Set(
        rows
          .filter(
            (r) =>
              r.name.toLowerCase().includes(needle) ||
              r.ctx.toLowerCase().includes(needle) ||
              (r.domain ?? "").toLowerCase().includes(needle) ||
              (r.kind ?? "").toLowerCase().includes(needle),
          )
          .map((r) => r.ctx),
      )
    : null;
  const visibleCount = matches ? matches.size : rows.length;

  return (
    <div className={css.wrap}>
      <div className={css.controls}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Filter ${rows.length.toLocaleString()} references...`}
          className={css.filter}
          aria-label="Filter references"
        />
        <span className={css.count}>
          {needle
            ? `${visibleCount.toLocaleString()} of ${rows.length.toLocaleString()}`
            : `${rows.length.toLocaleString()} references`}
        </span>
      </div>

      <ol className={css.list}>
        {rows.map((r) => {
          const hidden = matches != null && !matches.has(r.ctx);
          return (
            <li
              key={r.ctx}
              id={`ref-${r.num}`}
              className={hidden ? css.hidden : css.row}
              aria-hidden={hidden || undefined}
            >
              <span className={css.refNum}>[{r.num}]</span>
              {r.url ? (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={css.name}
                >
                  {r.name}
                </a>
              ) : r.localHref ? (
                <Link href={r.localHref as any} className={css.name}>
                  {r.name}
                </Link>
              ) : (
                <span className={css.name}>{r.name}</span>
              )}
              {r.domain && <span className={css.domain}>{r.domain}</span>}
              {r.kind && <span className={css.kind}>{r.kind}</span>}
              <code className={css.ctx} title={r.ctx}>
                {r.ctx}
              </code>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
