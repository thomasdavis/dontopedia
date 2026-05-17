"use client";

import { useState } from "react";
import Link from "next/link";
import type { SourceDocument } from "@donto/client";
import css from "./references-list.module.css";

export interface RefRow {
  ctx:        string;
  num:        number;
  name:       string;
  domain:     string | null;
  url:        string | null;
  localHref:  string | null;
  kind:       string | null;
  mode:       string | null;
  count:      number;
  documents:  SourceDocument[];
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
              <div className={css.head}>
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
                {r.count > 0 && (
                  <span className={css.factCount} title={`${r.count} fact${r.count === 1 ? "" : "s"} on this article cite this source`}>
                    {r.count.toLocaleString()} fact{r.count === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <div className={css.meta}>
                {r.domain && <span className={css.domain}>{r.domain}</span>}
                {r.kind && <span className={css.kind}>{r.kind}</span>}
                {r.mode && r.mode !== "permissive" && (
                  <span className={css.mode}>{r.mode}</span>
                )}
                <code className={css.ctx} title={r.ctx}>{r.ctx}</code>
              </div>
              {r.documents.length > 0 && (
                <ul className={css.docs}>
                  {r.documents.map((d) => (
                    <DocumentRow key={d.document_id} doc={d} />
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function DocumentRow({ doc }: { doc: SourceDocument }) {
  const creators = Array.isArray(doc.creators)
    ? (doc.creators as unknown[]).filter((c) => typeof c === "string").join(", ")
    : "";
  const sourceDate =
    doc.source_date && typeof doc.source_date === "object" && doc.source_date !== null
      ? JSON.stringify(doc.source_date)
          .replace(/[{}\"]/g, "")
          .slice(0, 24)
      : null;
  const fmtBytes = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <li className={css.doc}>
      <div className={css.docHead}>
        {doc.has_body && (
          <span className={css.fullTextBadge} title={`Full text — ${fmtBytes(doc.body_size)}`}>
            full text
          </span>
        )}
        {doc.source_url ? (
          <a
            href={doc.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className={css.docTitle}
          >
            {doc.label || doc.document_iri}
          </a>
        ) : (
          <span className={css.docTitle}>{doc.label || doc.document_iri}</span>
        )}
      </div>
      <div className={css.docMeta}>
        {creators && <span className={css.docByline}>{creators}</span>}
        {sourceDate && <span className={css.docDate}>{sourceDate}</span>}
        <span className={css.docMime}>{doc.media_type}</span>
        {doc.has_body && (
          <span className={css.docSize}>{fmtBytes(doc.body_size)}</span>
        )}
        <code className={css.docIri} title={doc.document_iri}>
          {doc.document_iri}
        </code>
      </div>
      {doc.body_excerpt && (
        <details className={css.docExcerpt}>
          <summary>Show excerpt</summary>
          <blockquote>{doc.body_excerpt}…</blockquote>
        </details>
      )}
    </li>
  );
}
