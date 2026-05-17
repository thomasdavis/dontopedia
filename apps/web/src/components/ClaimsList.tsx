"use client";
import { useState } from "react";
import Link from "next/link";
import type { Statement } from "@donto/client";
import { useRetracted } from "./RetractedToggle";
import { ReactionCounts } from "./ReactionCounts";
import css from "./claims-list.module.css";

/**
 * Client component that renders a list of claims with optional retracted rows.
 * Uses the RetractedToggle context to decide whether to show retracted facts.
 *
 * Progressive disclosure: by default only the first `initialVisible` rows
 * render (saves serialized HTML on subjects with 100s+ of statements per
 * predicate, e.g. chat activity). User clicks "Show all" to expand. The
 * initial state is computed deterministically so SSR + hydration agree
 * without flicker.
 */
const DEFAULT_INITIAL_VISIBLE = 10;

export function ClaimsList({
  current,
  retracted,
  initialVisible = DEFAULT_INITIAL_VISIBLE,
}: {
  /** Currently-believed statements (tx_hi is null). */
  current: SerializedClaim[];
  /** Retracted statements (tx_hi is set). */
  retracted: SerializedClaim[];
  /** Initial render cap (set to Infinity to show all up front). */
  initialVisible?: number;
}) {
  const { showRetracted } = useRetracted();
  const items = showRetracted ? [...current, ...retracted] : current;
  const total = items.length;
  const [expanded, setExpanded] = useState(false);
  const visible = expanded || total <= initialVisible
    ? items
    : items.slice(0, initialVisible);
  const hidden = total - visible.length;

  return (
    <>
      <ul className={css.claims}>
        {visible.map((s) => (
          <ClaimItem key={s.statementId} claim={s} isRetracted={!!s.txHi} />
        ))}
      </ul>
      {hidden > 0 && !expanded && (
        <button
          type="button"
          className={css.showMore}
          onClick={() => setExpanded(true)}
          aria-label={`Show all ${total} facts`}
        >
          Show all {total.toLocaleString()} ({hidden.toLocaleString()} more)
        </button>
      )}
      {expanded && total > initialVisible && (
        <button
          type="button"
          className={css.showMore}
          onClick={() => setExpanded(false)}
        >
          Collapse
        </button>
      )}
    </>
  );
}

function ClaimItem({
  claim,
  isRetracted,
}: {
  claim: SerializedClaim;
  isRetracted: boolean;
}) {
  return (
    <li
      className={`${css.claim} ${isRetracted ? css.retracted : ""}`}
      data-statement-id={claim.statementId}
      data-kind={claim.kind}
      data-polarity={claim.polarity}
      data-maturity={claim.maturity}
    >
      <span className={css.maturityDot} data-maturity={claim.maturity} title={claim.maturityLabel} />
      <span className={css.claimObj}>
        {claim.polarity === "negated" && <span className={css.neg}>not&nbsp;</span>}
        {claim.objectIri ? (
          <Link href={`/article/${claim.objectSlug}`}>
            {claim.objectLabel}
          </Link>
        ) : (
          claim.objectFormatted
        )}
      </span>
      {claim.ref != null && (
        <sup>
          <a href={`#ref-${claim.ref}`} className={css.cite}>
            [{claim.ref}]
          </a>
        </sup>
      )}
      <ReactionCounts statementId={claim.statementId} />
      <span className={css.claimMeta}>
        {claim.validRange}
        {" · "}
        <span title={claim.context}>{claim.contextLabel}</span>
      </span>
      {isRetracted && (
        <span className={css.retractedLabel}>
          retracted at {claim.txHi?.slice(0, 10)}
        </span>
      )}
    </li>
  );
}

/**
 * Serializable claim shape. Server component pre-formats these so the client
 * component doesn't need the SDK.
 */
export interface SerializedClaim {
  statementId: string;
  polarity: string;
  kind: string;
  maturity: number;
  maturityLabel: string;
  objectIri: string | null;
  objectSlug: string | null;
  objectLabel: string;
  objectFormatted: string;
  context: string;
  contextLabel: string;
  validRange: string;
  ref: number | null;
  txHi: string | null;
}
