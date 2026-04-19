import Link from "next/link";
import { Badge, Stack, Text, Tooltip } from "@dontopedia/ui";
import {
  classifyContext,
  contextLabel,
  formatObject,
  formatTxRange,
  formatValidRange,
  iriLabel,
  iriToSlug,
  MATURITY_LABELS,
  type ContradictionCluster,
} from "@dontopedia/sdk";
import type { Statement } from "@donto/client";
import css from "./statement-row.module.css";

/**
 * A single statement in an article view. Shows the object value prominently,
 * then (in smaller chrome) context, maturity, valid-range, tx-range. When a
 * predicate is in dispute, siblings are rendered as a horizontal strip so the
 * contradictions sit *next to each other* (RapGenius-style), not buried.
 */
export function StatementRow({
  statement,
  conflict,
}: {
  statement: Statement;
  conflict?: ContradictionCluster;
}) {
  const objectLabel = formatObject(statement);
  const ctxKind = classifyContext(statement.context);
  const isObjectIri = !!statement.object_iri;

  const objectEl = isObjectIri ? (
    <Link href={`/article/${iriToSlug(statement.object_iri!)}`} className={css.objIri}>
      {iriLabel(statement.object_iri!)}
    </Link>
  ) : (
    <span className={css.objLit}>{objectLabel}</span>
  );

  return (
    <div className={css.row} data-polarity={statement.polarity}>
      <div className={css.object}>
        {statement.polarity === "negated" && <span className={css.neg}>not&nbsp;</span>}
        {objectEl}
      </div>

      <Stack direction="row" gap={2} align="center" wrap className={css.meta}>
        <Tooltip content={<ContextTip iri={statement.context} />}>
          <Badge tone={toneFor(ctxKind)}>{contextLabel(statement.context)}</Badge>
        </Tooltip>

        <Tooltip content={`Maturity ${statement.maturity} — ${MATURITY_LABELS[statement.maturity] ?? "unknown"}`}>
          <Badge tone="neutral">m{statement.maturity}</Badge>
        </Tooltip>

        <Tooltip content={`Valid ${formatValidRange(statement)}`}>
          <Text variant="caption" muted className={css.when}>
            valid {formatValidRange(statement)}
          </Text>
        </Tooltip>
      </Stack>

      {conflict && conflict.branches.length >= 2 && (
        <div className={css.conflict}>
          <Text variant="caption" muted className={css.conflictLabel}>
            vs.
          </Text>
          <div className={css.conflictStrip}>
            {conflict.branches
              .filter((b) => !b.statements.some((s) => s.statement_id === statement.statement_id))
              .flatMap((b) => b.statements)
              .map((sib) => (
                <span key={sib.statement_id} className={css.sib} data-polarity={sib.polarity}>
                  {sib.polarity === "negated" ? "not " : ""}
                  {formatObject(sib)}
                  <span className={css.sibCtx}>— {contextLabel(sib.context)}</span>
                </span>
              ))}
          </div>
        </div>
      )}

      <details className={css.details}>
        <summary>provenance</summary>
        <Stack gap={1} className={css.detailBody}>
          <Text variant="mono" muted>
            {statement.statement_id}
          </Text>
          <Text variant="caption" muted>
            {formatTxRange(statement)}
          </Text>
          {statement.lineage.length > 0 && (
            <Text variant="caption" muted>
              derived from {statement.lineage.length} source
              {statement.lineage.length === 1 ? "" : "s"}
            </Text>
          )}
        </Stack>
      </details>
    </div>
  );
}

function ContextTip({ iri }: { iri: string }) {
  const kind = classifyContext(iri);
  return (
    <Stack gap={1}>
      <Text variant="label">{kind}</Text>
      <Text variant="mono">{iri}</Text>
    </Stack>
  );
}

function toneFor(kind: ReturnType<typeof classifyContext>) {
  switch (kind) {
    case "source":
      return "source" as const;
    case "hypothesis":
      return "hypothesis" as const;
    case "derived":
      return "derived" as const;
    default:
      return "neutral" as const;
  }
}
