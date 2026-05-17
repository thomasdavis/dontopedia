import css from "./activity-spark.module.css";

/**
 * Tiny SVG sparkline of facts-per-year for a subject. Pure server
 * component — no hydration cost, no client JS. Rendered inline in the
 * article stats strip so a reader sees the temporal shape of the
 * subject at a glance.
 */
export function ActivitySpark({
  yearCounts,
  axis = "valid",
  width = 220,
  height = 36,
}: {
  yearCounts: { year: number; count: number }[];
  /** valid = world time, tx = ingestion time. Affects only the label. */
  axis?: "valid" | "tx";
  width?: number;
  height?: number;
}) {
  if (yearCounts.length < 2) return null;

  const max = Math.max(...yearCounts.map((y) => y.count));
  if (max <= 0) return null;

  const sorted = [...yearCounts].sort((a, b) => a.year - b.year);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return null;
  const minYear = first.year;
  const maxYear = last.year;
  const span = Math.max(1, maxYear - minYear);

  const barWidth = Math.max(2, Math.floor(width / sorted.length) - 1);
  const points = sorted.map((y) => {
    const x = ((y.year - minYear) / span) * (width - barWidth);
    const h = (y.count / max) * (height - 4);
    return { x, h, ...y };
  });

  return (
    <span
      className={css.spark}
      title={`Activity by ${axis === "valid" ? "valid-time" : "ingestion"} year, ${minYear}–${maxYear} (max ${max.toLocaleString()})`}
      aria-label={`Activity from ${minYear} to ${maxYear}, peaking at ${max} facts`}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-hidden="true"
        focusable="false"
      >
        {points.map((p, i) => (
          <rect
            key={i}
            x={p.x}
            y={height - p.h - 1}
            width={barWidth}
            height={Math.max(1, p.h)}
            className={css.bar}
          />
        ))}
      </svg>
      <span className={css.range}>
        {minYear}–{maxYear}
        {axis === "tx" && <span className={css.axisHint}> (ingest)</span>}
      </span>
    </span>
  );
}
