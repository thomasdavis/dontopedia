import type { Statement } from "@donto/client";
import { formatObject } from "./format";

export interface ContradictionCluster {
  /** The predicate the disagreement is under. */
  predicate: string;
  /** Disagreeing values keyed by formatted object, each with the supporting rows. */
  branches: { object: string; statements: Statement[] }[];
}

/**
 * Detect disagreement among sibling statements grouped by predicate:
 *
 * - Only looks at currently-believed rows (tx_hi == null).
 * - Treats a predicate as "in conflict" if it carries ≥2 distinct objects
 *   OR carries both an asserted and a negated polarity.
 * - Does NOT enforce functional-predicate semantics (that's donto's shape
 *   system's job — we just surface what the data shows).
 *
 * For a more principled pass, call dontosrv `/shapes/validate` with
 * `builtin:functional/<predicate>` and render the violation report.
 */
export function findContradictions(stmts: Statement[]): ContradictionCluster[] {
  const byPred = new Map<string, Statement[]>();
  for (const s of stmts) {
    if (s.tx_hi) continue;
    if (!byPred.has(s.predicate)) byPred.set(s.predicate, []);
    byPred.get(s.predicate)!.push(s);
  }
  const out: ContradictionCluster[] = [];
  for (const [predicate, rows] of byPred) {
    const buckets = new Map<string, Statement[]>();
    for (const r of rows) {
      const key =
        (r.polarity === "asserted" ? "+" : r.polarity === "negated" ? "-" : "?") +
        "::" +
        formatObject(r);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(r);
    }
    if (buckets.size >= 2) {
      out.push({
        predicate,
        branches: [...buckets.entries()].map(([k, st]) => ({
          object: k.slice(k.indexOf("::") + 2),
          statements: st,
        })),
      });
    }
  }
  return out;
}
