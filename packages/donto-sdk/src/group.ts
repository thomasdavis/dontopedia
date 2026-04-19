import type { Statement } from "@donto/client";

export interface PredicateGroup {
  predicate: string;
  statements: Statement[];
}

/**
 * Group a flat list of statements by predicate, in insertion order of first
 * occurrence. Stable so article pages don't reshuffle on re-render.
 */
export function groupByPredicate(stmts: Statement[]): PredicateGroup[] {
  const order: string[] = [];
  const buckets = new Map<string, Statement[]>();
  for (const s of stmts) {
    if (!buckets.has(s.predicate)) {
      buckets.set(s.predicate, []);
      order.push(s.predicate);
    }
    buckets.get(s.predicate)!.push(s);
  }
  return order.map((p) => ({ predicate: p, statements: buckets.get(p)! }));
}
