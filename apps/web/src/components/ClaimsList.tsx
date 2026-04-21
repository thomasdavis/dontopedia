"use client";
import Link from "next/link";
import type { Statement } from "@donto/client";
import { useRetracted } from "./RetractedToggle";
import { ReactionCounts } from "./ReactionCounts";
import css from "./claims-list.module.css";

/**
 * Client component that renders a list of claims with optional retracted rows.
 * Uses the RetractedToggle context to decide whether to show retracted facts.
 */
export function ClaimsList({
  current,
  retracted,
}: {
  /** Currently-believed statements (tx_hi is null). */
  current: SerializedClaim[];
  /** Retracted statements (tx_hi is set). */
  retracted: SerializedClaim[];
}) {
  const { showRetracted } = useRetracted();
  const items = showRetracted ? [...current, ...retracted] : current;

  return (
    <ul className={css.claims}>
      {items.map((s) => (
        <ClaimItem key={s.statementId} claim={s} isRetracted={!!s.txHi} />
      ))}
    </ul>
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
