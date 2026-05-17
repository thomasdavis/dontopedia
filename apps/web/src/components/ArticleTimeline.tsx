"use client";
import { useMemo, useState } from "react";
import type { Statement } from "@donto/client";
import { classifyContext, contextLabel, formatObject, iriLabel } from "@dontopedia/sdk";
import css from "./article-timeline.module.css";

const DEFAULT_EVENTS_VISIBLE = 200;

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

  // Progressive disclosure: timelines on chatty subjects can have 5k+
  // events. Default render: most-recent ~200 events across years. User
  // clicks Show all to expand. SSR-stable because state seeds based on row
  // count.
  const totalEvents = undated.length + years.reduce((n, [, ys]) => n + ys.length, 0);
  const [expanded, setExpanded] = useState(false);
  const cap = expanded ? Number.POSITIVE_INFINITY : DEFAULT_EVENTS_VISIBLE;

  let budget = cap;
  const visibleUndated = undated.slice(0, budget);
  budget = Math.max(0, budget - visibleUndated.length);
  const visibleYears: typeof years = [];
  for (const [y, rs] of years) {
    if (budget <= 0) break;
    visibleYears.push([y, rs.slice(0, budget)]);
    budget -= rs.length;
  }
  const shown = visibleUndated.length + visibleYears.reduce((n, [, ys]) => n + ys.length, 0);
  const hidden = totalEvents - shown;

  if (rows.length === 0) {
    return <p className={css.empty}>No dated events yet.</p>;
  }

  return (
    <div className={css.timeline}>
      {visibleUndated.length > 0 && (
        <Section label={`${undated.length} undated`}>
          {visibleUndated.map((r) => (
            <Event key={r.statement_id} row={r} />
          ))}
        </Section>
      )}
      {visibleYears.map(([year, rows]) => (
        <Section key={year} label={String(year)}>
          {rows.map((r) => (
            <Event key={r.statement_id} row={r} />
          ))}
        </Section>
      ))}
      {hidden > 0 && !expanded && (
        <button
          type="button"
          className={css.showMore}
          onClick={() => setExpanded(true)}
        >
          Show all {totalEvents.toLocaleString()} events ({hidden.toLocaleString()} hidden)
        </button>
      )}
      {expanded && totalEvents > DEFAULT_EVENTS_VISIBLE && (
        <button
          type="button"
          className={css.showMore}
          onClick={() => setExpanded(false)}
        >
          Collapse to most recent
        </button>
      )}
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
