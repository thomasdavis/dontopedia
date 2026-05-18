"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { iriToSlug, prettifyLabel } from "@dontopedia/sdk";
import css from "./inbound-facts.module.css";

export interface InboundRowView {
  subject:   string;
  predicate: string;
  context:   string;
  statementId: string;
}

/**
 * "What links here" — facts from elsewhere in dontopedia that point AT
 * this subject as their object. Grouped by predicate. Wikipedia leaves
 * this on a separate page; here it's an inline section because the
 * inverse relationships are usually the *point* (e.g. "X motherOf
 * thisSubject" is the answer to who's the mother).
 */
export function InboundFacts({ rows }: { rows: InboundRowView[] }) {
  const groups = useMemo(() => {
    const byPred = new Map<string, InboundRowView[]>();
    for (const r of rows) {
      if (!byPred.has(r.predicate)) byPred.set(r.predicate, []);
      byPred.get(r.predicate)!.push(r);
    }
    return [...byPred.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [rows]);

  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const filteredGroups = needle
    ? groups
        .map(([pred, rs]) => [
          pred,
          rs.filter(
            (r) =>
              pred.toLowerCase().includes(needle) ||
              r.subject.toLowerCase().includes(needle),
          ),
        ] as const)
        .filter(([, rs]) => rs.length > 0)
    : groups;

  if (rows.length === 0) {
    return (
      <p className={css.empty}>
        Nothing in dontopedia currently points at this subject as a value.
      </p>
    );
  }

  return (
    <div className={css.wrap}>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Filter ${rows.length} inbound facts...`}
        className={css.filter}
        aria-label="Filter inbound facts"
      />
      <div className={css.groups}>
        {filteredGroups.map(([pred, rs]) => (
          <div key={pred} className={css.group}>
            <h3 className={css.pred}>
              <code className={css.predIri}>{pred}</code>
              <span className={css.predLabel}>{prettifyLabel("x:" + pred)}</span>
              <span className={css.count}>({rs.length})</span>
            </h3>
            <ul className={css.subs}>
              {rs.map((r) => (
                <li key={r.statementId} className={css.sub}>
                  <Link href={`/article/${iriToSlug(r.subject)}`} className={css.subLink}>
                    {prettifyLabel(r.subject)}
                  </Link>
                  <code className={css.subIri}>{r.subject}</code>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
