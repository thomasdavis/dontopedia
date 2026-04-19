"use client";
import * as React from "react";
import css from "./contradiction.module.css";

/**
 * Visual rap-genius-style mark for a claim whose siblings disagree with it.
 * Renders an underline-like gradient swatch under the wrapped text.
 * The actual "show alternatives" interaction is wired at the article level;
 * this primitive is just the affordance.
 */
export interface ContradictionMarkProps {
  /** Number of conflicting sibling statements. Used to weight the mark. */
  count: number;
  children: React.ReactNode;
  onActivate?: () => void;
}

export function ContradictionMark({ count, children, onActivate }: ContradictionMarkProps) {
  const intensity = Math.min(count, 5);
  return (
    <button
      type="button"
      data-count={count}
      data-intensity={intensity}
      className={css.mark}
      onClick={onActivate}
      aria-label={`${count} conflicting statement${count === 1 ? "" : "s"}`}
    >
      {children}
    </button>
  );
}
