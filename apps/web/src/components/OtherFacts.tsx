"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { iriToSlug, prettifyLabel } from "@dontopedia/sdk";
import css from "./other-facts.module.css";

export interface OtherFactRow {
  predicate:  string;
  predLabel:  string;
  objectIri:  string | null;
  objectSlug: string | null;
  objectText: string;
  ref:        number | null;
  maturity:   number;
}

/**
 * Compact tabular view for the long tail of predicates (typically 2k+
 * singletons on a high-activity subject). Replaces 2k separate H2
 * sections each containing one statement. Client-side filter +
 * progressive disclosure (chunked Show more).
 */
export function OtherFacts({ rows }: { rows: OtherFactRow[] }) {
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(100);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        r.predLabel.toLowerCase().includes(needle) ||
        r.predicate.toLowerCase().includes(needle) ||
        r.objectText.toLowerCase().includes(needle),
    );
  }, [rows, q]);

  const visible = filtered.slice(0, shown);
  const hidden = filtered.length - visible.length;

  return (
    <div className={css.wrap}>
      <div className={css.controls}>
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setShown(100);
          }}
          placeholder={`Filter ${rows.length.toLocaleString()} other facts...`}
          className={css.filter}
          aria-label="Filter other facts"
        />
        <span className={css.count}>
          {filtered.length === rows.length
            ? `${rows.length.toLocaleString()} facts`
            : `${filtered.length.toLocaleString()} of ${rows.length.toLocaleString()}`}
        </span>
      </div>

      <table className={css.table}>
        <thead>
          <tr>
            <th scope="col">Predicate</th>
            <th scope="col">Value</th>
            <th scope="col" className={css.refCol}>Ref</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r, i) => (
            <tr key={`${r.predicate}-${i}`}>
              <td className={css.predCell}>
                <span
                  className={css.maturityDot}
                  data-maturity={r.maturity}
                  aria-hidden
                />
                <span className={css.predLabel}>{r.predLabel}</span>
              </td>
              <td className={css.valCell}>
                {r.objectIri && r.objectSlug ? (
                  <Link href={`/article/${r.objectSlug}`}>
                    {prettifyLabel(r.objectIri)}
                  </Link>
                ) : (
                  r.objectText
                )}
              </td>
              <td className={css.refCell}>
                {r.ref != null ? (
                  <a href={`#ref-${r.ref}`} className={css.cite}>[{r.ref}]</a>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {hidden > 0 && (
        <div className={css.moreRow}>
          <button
            type="button"
            className={css.showMore}
            onClick={() => setShown((s) => s + 200)}
          >
            Show {Math.min(200, hidden).toLocaleString()} more ({hidden.toLocaleString()} hidden)
          </button>
        </div>
      )}
    </div>
  );
}
