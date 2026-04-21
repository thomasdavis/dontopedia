"use client";
import { useEffect, useRef, useState } from "react";
import css from "./reaction-counts.module.css";

/**
 * Lazy-loading reaction counter for a single claim. Uses
 * IntersectionObserver so we only fetch when the claim scrolls into view.
 */
export function ReactionCounts({ statementId }: { statementId: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [counts, setCounts] = useState<{
    endorses: number;
    rejects: number;
  } | null>(null);
  const fetched = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !fetched.current) {
          fetched.current = true;
          obs.disconnect();
          fetch(`/api/reactions/${encodeURIComponent(statementId)}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
              if (data?.counts) {
                setCounts({
                  endorses: data.counts.endorses ?? 0,
                  rejects: data.counts.rejects ?? 0,
                });
              }
            })
            .catch(() => {});
        }
      },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [statementId]);

  if (!counts || (counts.endorses === 0 && counts.rejects === 0)) {
    return <span ref={ref} className={css.counter} />;
  }

  return (
    <span ref={ref} className={css.counter}>
      {counts.endorses > 0 && (
        <span className={css.up} title={`${counts.endorses} endorsement${counts.endorses === 1 ? "" : "s"}`}>
          ↑{counts.endorses}
        </span>
      )}
      {counts.rejects > 0 && (
        <span className={css.down} title={`${counts.rejects} rejection${counts.rejects === 1 ? "" : "s"}`}>
          ↓{counts.rejects}
        </span>
      )}
    </span>
  );
}
