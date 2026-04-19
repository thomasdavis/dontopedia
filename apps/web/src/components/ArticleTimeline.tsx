"use client";
import { useMemo } from "react";
import type { Statement } from "@donto/client";
import { classifyContext, contextLabel, formatObject, iriLabel } from "@dontopedia/sdk";
import css from "./article-timeline.module.css";

/**
 * Year-grouped vertical timeline for a subject's currently-believed facts,
 * inspired by donto-faces' VerticalTimeline. Simpler because a wiki article
 * rarely has 20k rows (the faces version virtualises for that); Dontopedia
 * caps at a few hundred per subject and renders inline.
 *
 * Axis = valid_time (when the world said it held), NOT tx_time (ingestion).
 * Undated facts get their own section at the top so nothing is silently
 * dropped.
 */
export function ArticleTimeline({ rows }: { rows: Statement[] }) {
  const { undated, years } = useMemo(() => {
    const dated: { row: Statement; year: number }[] = [];
    const undated: Statement[] = [];
    for (const r of rows) {
      const lo = r.valid_lo;
      const y = lo ? new Date(lo).getUTCFullYear() : null;
      if (y && Number.isFinite(y)) dated.push({ row: r, year: y });
      else undated.push(r);
    }
    dated.sort((a, b) => b.year - a.year);
    const byYear = new Map<number, Statement[]>();
    for (const { row, year } of dated) {
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year)!.push(row);
    }
    return {
      undated,
      years: [...byYear.entries()].sort((a, b) => b[0] - a[0]),
    };
  }, [rows]);

  if (rows.length === 0) {
    return <p className={css.empty}>No dated events yet.</p>;
  }

  return (
    <div className={css.timeline}>
      {undated.length > 0 && (
        <Section label={`${undated.length} undated`}>
          {undated.map((r) => (
            <Event key={r.statement_id} row={r} />
          ))}
        </Section>
      )}
      {years.map(([year, rows]) => (
        <Section key={year} label={String(year)}>
          {rows.map((r) => (
            <Event key={r.statement_id} row={r} />
          ))}
        </Section>
      ))}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className={css.section}>
      <header className={css.sectionLabel}>{label}</header>
      <div className={css.events}>{children}</div>
    </section>
  );
}

function Event({ row }: { row: Statement }) {
  const kind = classifyContext(row.context);
  const isRetracted = !!row.tx_hi;
  const isDerived = Array.isArray(row.lineage) && row.lineage.length > 0;
  const dateStr = row.valid_lo?.slice(0, 10) ?? "—";
  const obj = formatObject(row);

  return (
    <div
      className={css.row}
      data-retracted={isRetracted ? "" : undefined}
      data-derived={isDerived ? "" : undefined}
      data-context-kind={kind}
    >
      <div className={css.date}>
        <div className={css.dateLo}>{dateStr}</div>
        {row.valid_hi && <div className={css.dateHi}>→ {row.valid_hi.slice(0, 10)}</div>}
      </div>
      <div className={css.stripe} aria-hidden />
      <div className={css.body}>
        <div className={css.head}>
          <span className={css.predicate}>{iriLabel(row.predicate)}</span>
          <span className={css.context} title={row.context}>
            {contextLabel(row.context)}
          </span>
          {isRetracted && <span className={css.tagRetract}>retracted</span>}
          {isDerived && !isRetracted && <span className={css.tagDerived}>derived</span>}
        </div>
        <div className={css.object}>
          {row.polarity === "negated" && <span className={css.neg}>not&nbsp;</span>}
          {obj || <span className={css.muted}>(no value)</span>}
        </div>
      </div>
    </div>
  );
}
